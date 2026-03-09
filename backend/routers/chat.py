"""
Chat router — POST /chat/message (streaming SSE + non-streaming JSON)

Two modes:
  1. Conversational  — greetings, questions, format advice → text_reply SSE event
  2. Campaign brief  — ad request detected → story_plan SSE event (full planner)

SSE event types emitted:
  status      {"text": "..."}                  — loading status update
  text_reply  {"text": "..."}                  — conversational AI reply
  story_plan  {"variants":[], "story_summary", "brand_context", "research_context"}
  done        {}
"""

import json
import asyncio
from typing import AsyncIterator

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from agents.story_planner import run_story_planner
from google import genai
from google.genai import types
from config import settings
from services import brand_memory

router = APIRouter(prefix="/chat", tags=["chat"])

MODEL = "gemini-2.5-flash"


def _gemini_client() -> genai.Client:
    return genai.Client(api_key=settings.gemini_api_key)


# ─── Request model ────────────────────────────────────────────────────────────

class ChatMessageRequest(BaseModel):
    brand_id: str = ""
    message: str
    session_id: str = ""
    stream: bool = False
    platform: str = "TikTok"
    history: list[dict] = []


# ─── Intent classification ────────────────────────────────────────────────────

def _classify_intent(message: str, history: list[dict]) -> str:
    """Returns 'campaign' if the user wants ad variants generated, else 'chat'."""
    msg_lower = message.lower().strip()
    words = set(msg_lower.split())

    # If the user is giving a short confirmation ("yes", "sure", etc.)
    # immediately after we've proposed a campaign concept, treat it as
    # permission to generate variants rather than plain chat.
    if msg_lower in {"yes", "yep", "sure", "sounds good", "let's do it", "ok", "okay"}:
        recent_assistant = [
            h.get("content", "").lower()
            for h in history[-4:]
            if h.get("role") == "assistant"
        ]
        if any(any(k in txt for k in ("campaign", "concept", "variants", "ad ideas")) for txt in recent_assistant):
            return "campaign"

    # Obvious greetings / short acknowledgements → always 'chat'
    trivial = {"hi", "hello", "hey", "thanks", "thank", "ok", "okay", "cool",
               "nice", "great", "awesome", "hmm", "hm", "what", "how", "why",
               "which", "sure", "yep", "yes", "no", "nope", "bye", "good"}
    campaign_kw = {"ad", "campaign", "video", "create", "make", "generate",
                   "concept", "variant", "ad concept", "reel", "short", "tiktok",
                   "instagram", "youtube", "promote", "brand", "launch", "spot"}

    if len(words) <= 4 and words & trivial and not words & campaign_kw:
        return "chat"

    try:
        history_snippet = "\n".join(
            f"{h.get('role','user')}: {str(h.get('content',''))[:120]}"
            for h in history[-4:]
        )
        prompt = (
            f"Conversation so far:\n{history_snippet}\n\n"
            f"Latest message: {message}\n\n"
            "Is the user explicitly asking to CREATE or GENERATE an ad, ad campaign, "
            "video ad, or creative concepts? Reply ONLY 'yes' or 'no'."
        )
        client = genai.Client(api_key=settings.gemini_api_key)
        resp = client.models.generate_content(
            model=MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                thinking_config=types.ThinkingConfig(thinking_budget=0),
            ),
        )
        return "campaign" if (resp.text or "").strip().lower().startswith("yes") else "chat"
    except Exception:
        # Fallback heuristic
        if any(k in msg_lower for k in campaign_kw) and len(words) > 4:
            return "campaign"
        return "chat"


# ─── Streaming: conversational reply ─────────────────────────────────────────

async def _stream_chat_reply(
    brand_id: str, message: str, platform: str, history: list[dict]
) -> AsyncIterator[str]:

    async def send(event: str, data: dict) -> str:
        return f"event: {event}\ndata: {json.dumps(data)}\n\n"

    brand_profile = None
    if brand_id:
        try:
            brand_profile = brand_memory.get_brand(brand_id)
        except Exception:
            pass

    brand_ctx = ""
    if brand_profile:
        brand_ctx = (
            f"Brand: {brand_profile.get('name', '')}, "
            f"Tone: {brand_profile.get('tone', '')}, "
            f"Description: {brand_profile.get('description', '')}"
        )

    history_text = "".join(
        f"{'User' if h.get('role') == 'user' else 'Assistant'}: "
        f"{str(h.get('content', ''))[:200]}\n"
        for h in history[-8:]
    )

    platform_info = {
        "TikTok": "TikTok (9:16 vertical, up to 60s, trend-driven)",
        "Instagram": "Instagram Reels (9:16 vertical, up to 90s, discovery-focused)",
        "YouTube Shorts": "YouTube Shorts (9:16 vertical, up to 60s, search-driven)",
    }.get(platform, platform)

    prompt = (
        "You are SipN'ads, an AI creative director specialising in short-form video ads "
        "(TikTok, Instagram Reels, YouTube Shorts).\n"
        f"Currently selected platform: {platform_info}\n"
        f"{('Brand context: ' + brand_ctx + chr(10)) if brand_ctx else ''}"
        f"\nConversation so far:\n{history_text}"
        f"User: {message}\n\n"
        "Reply rules:\n"
        "- Be warm, concise (2-4 sentences), and helpful\n"
        "- If they greet you, greet back and briefly offer to help create video ad concepts\n"
        "- If they ask about platform formats, explain which suits their goal and why\n"
        "- If they describe a vague idea, ask one clarifying question about their goal or audience\n"
        "- NEVER produce ad variants or scenes in this reply — that happens separately\n"
        "- Use plain prose, no markdown, no bullet lists"
    )

    try:
        def _gen() -> str:
            client = genai.Client(api_key=settings.gemini_api_key)
            resp = client.models.generate_content(
                model=MODEL,
                contents=prompt,
                config=types.GenerateContentConfig(
                    thinking_config=types.ThinkingConfig(thinking_budget=512),
                ),
            )
            return (resp.text or "").strip()

        text = await asyncio.to_thread(_gen)
        yield await send("text_reply", {"text": text})
    except Exception as _chat_err:
        import logging
        logging.getLogger(__name__).error("chat_reply error: %s", _chat_err, exc_info=True)
        yield await send("text_reply", {
            "text": (
                "Hi! I'm SipN'ads — your AI creative director for short-form video ads. "
                "Describe a campaign brief and I'll craft concepts for TikTok, Reels, or Shorts."
            )
        })
    yield await send("done", {})


# ─── Streaming: full story planner ───────────────────────────────────────────

async def _stream_story_plan(
    brand_id: str, message: str, platform: str = "TikTok"
) -> AsyncIterator[str]:

    async def send(event: str, data: dict) -> str:
        return f"event: {event}\ndata: {json.dumps(data)}\n\n"

    yield await send("status", {"text": "Loading brand profile..."})
    await asyncio.sleep(0.1)

    yield await send("status", {"text": "Researching platform trends with Google Search..."})
    await asyncio.sleep(0.1)

    yield await send("status", {"text": "Gemini is thinking... crafting your story concept..."})
    await asyncio.sleep(0.1)

    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, run_story_planner, brand_id, message)

    yield await send("status", {"text": "Planning scenes for each variant..."})
    await asyncio.sleep(0.05)

    yield await send("story_plan", {
        "variants": result["variants"],
        "story_summary": result["story_summary"],
        "brand_context": result.get("brand_context"),
        "research_context": result.get("research_context"),
    })
    yield await send("done", {})


# ─── Route ────────────────────────────────────────────────────────────────────

@router.post("/message")
async def chat_message(req: ChatMessageRequest):
    """
    Main chat endpoint. Intelligently routes between conversational reply
    and full ad-concept generation based on detected intent.
    """
    if req.stream:
        intent = await asyncio.to_thread(_classify_intent, req.message, req.history)
        if intent == "campaign":
            return StreamingResponse(
                _stream_story_plan(req.brand_id, req.message, req.platform),
                media_type="text/event-stream",
                headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
            )
        return StreamingResponse(
            _stream_chat_reply(req.brand_id, req.message, req.platform, req.history),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    # Non-streaming fallback
    result = await asyncio.to_thread(run_story_planner, req.brand_id, req.message)
    return {
        "reply": f"Here's your ad story plan for: {req.message}",
        "story_plan": {
            "variants": result["variants"],
            "story_summary": result["story_summary"],
            "brand_context": result.get("brand_context"),
            "research_context": result.get("research_context"),
        },
    }
