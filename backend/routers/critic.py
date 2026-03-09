"""Critic router v2 — MARKER_20260309"""

import json
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from google import genai
from google.genai import types as gtypes
from config import settings
from services.renderer import get_job
from services.compositor import get_timeline
from services import brand_memory

router = APIRouter(prefix="/critic", tags=["critic"])


class EvaluateRequest(BaseModel):
    brand_id: str
    job_id: str


class FixRequest(BaseModel):
    brand_id: str
    job_id: str
    fix_type: str  # "hook_strength" | "cta_clarity" | "brand_compliance"


# ── Prompt ──────────────────────────────────────────────────────────────────

EVAL_SYSTEM = (
    "You are a senior video ad strategist, media buyer, and creative director. "
    "Evaluate the ad on the specific criterion with a focus on professional, high-performing short-form video. "
    "Return ONLY valid JSON — no markdown, no preamble:\n"
    '{"score": <int 0-10>, "verdict": "accept" or "fix", "suggestion": "<one precise, production-ready improvement>"}\n'
    "Score >= 8 means accept. Score < 8 means fix. Be concrete and specific."
)


async def _evaluate_gemini(criterion: str, context: str) -> dict:
    """Evaluate a single criterion via Gemini Flash (true async call)."""
    try:
        # Use the async google-genai client
        async_client = genai.Client(api_key=settings.gemini_api_key)
        response = await async_client.aio.models.generate_content(
            model=settings.gemini_chat_model,
            contents=f"{EVAL_SYSTEM}\n\nCriterion: {criterion}\n\nAd context:\n{context}",
            config=gtypes.GenerateContentConfig(
                thinking_config=gtypes.ThinkingConfig(thinking_level="low"),
            ),
        )
        raw = (response.text or "").strip()
        # Strip markdown fences if present
        if raw.startswith("```"):
            parts = raw.split("```")
            raw = parts[1] if len(parts) > 1 else raw
            if raw.startswith("json"):
                raw = raw[4:]
        parsed = json.loads(raw.strip())
        score = max(0, min(10, int(parsed.get("score", 5))))
        return {
            "score": score,
            "verdict": "accept" if score >= 8 else "fix",
            "suggestion": parsed.get("suggestion", ""),
        }
    except Exception as e:
        # Return a neutral mid-score on failure rather than crashing
        return {
            "score": 5,
            "verdict": "fix",
            "suggestion": f"Evaluation failed: {str(e)[:120]}",
        }


def _build_context(timeline: dict, brand_profile: dict | None) -> str:
    clips = timeline.get("clips", [])
    profile = brand_profile or {}

    brand_rules = profile.get("brand_rules") or "[]"
    if isinstance(brand_rules, str):
        try:
            brand_rules = json.loads(brand_rules)
        except Exception:
            brand_rules = []

    scene_lines = []
    for c in clips:
        dur = (c.get("end_ms", 0) - c.get("start_ms", 0)) // 1000
        scene_lines.append(
            f"  Scene {c.get('clip_index', 0) + 1} ({dur}s): "
            f"{c.get('scene_title', '')} | overlay: '{c.get('text_overlay', '')}'"
        )

    return (
        f"Brand: {profile.get('name', 'Unknown')} | Tone: {profile.get('tone', 'N/A')}\n"
        f"Brand rules: {', '.join(str(r) for r in brand_rules[:4]) or 'none'}\n"
        f"Total duration: {timeline.get('total_duration_ms', 0) // 1000}s | "
        f"Resolution: {timeline.get('resolution', '9:16')}\n"
        "Scenes:\n" + "\n".join(scene_lines)
    )


# ── Routes ───────────────────────────────────────────────────────────────────

@router.post("/evaluate")
async def evaluate(req: EvaluateRequest):
    job = get_job(req.job_id)
    timeline: dict | None = None
    if job:
        timeline_id = job.get("timeline_id")
        if timeline_id:
            timeline = get_timeline(timeline_id)

    # If the job/timeline is missing (e.g. server restarted), return a neutral
    # critic payload instead of surfacing a 404 to the frontend. This keeps the
    # UI stable even when in-memory jobs have been cleared.
    if not timeline:
        return {
            "scores": {
                "hook_strength": 0,
                "cta_clarity": 0,
                "brand_compliance": 0,
            },
            "verdicts": {
                "hook_strength": "fix",
                "cta_clarity": "fix",
                "brand_compliance": "fix",
            },
            "suggestions": {
                "hook_strength": "Video context not found. Please re-run the render, then run the critic again.",
                "cta_clarity": "Video context not found. Please re-run the render, then run the critic again.",
                "brand_compliance": "Video context not found. Please re-run the render, then run the critic again.",
            },
            "overall": "Critic could not find this job — regenerate the video, then re-run the critic.",
            "remix_prompt": "",
        }

    brand_profile = None
    if req.brand_id:
        try:
            brand_profile = brand_memory.get_brand(req.brand_id)
        except Exception:
            pass

    context = _build_context(timeline, brand_profile)
    clips = timeline.get("clips", [])
    first = clips[0] if clips else {}
    last = clips[-1] if clips else {}
    hook_dur = (first.get("end_ms", 3000) - first.get("start_ms", 0)) / 1000

    hook_criterion = (
        f"Hook Strength: Does the opening {hook_dur:.0f}s instantly feel like a professional TikTok ad that stops the scroll? "
        f"Opening overlay: '{first.get('text_overlay', '')}'. "
        f"Rate: emotional pull, pattern interrupt, pacing, and first-frame clarity."
    )
    cta_criterion = (
        f"CTA Clarity: Is there a clear, specific, action-oriented CTA that would make a performance marketer happy? "
        f"Closing overlay: '{last.get('text_overlay', '')}'. "
        f"Rate: specificity, urgency, and how native it feels to {timeline.get('platform', 'TikTok')} (swipe/tap/shop now etc.)."
    )
    brand_criterion = (
        "Brand & Craft Quality: Does this feel like a polished, on-brand, professional ad? "
        "Check tone consistency, adherence to brand rules, safe-for-all-audiences content, "
        "and whether visuals, color and typography feel intentionally designed (not generic AI output)."
    )

    visual_quality_criterion = (
        "Visual Quality: Imagine the final rendered frames based on this timeline. "
        "Rate the expected sharpness, lighting, exposure, and composition for a vertical TikTok ad. "
        "Penalise muddy, low-contrast, or cluttered shots."
    )
    motion_pacing_criterion = (
        "Motion & Pacing: Based on scene durations and descriptions, does the camera movement "
        "and cut rhythm feel smooth and energetic without being chaotic or boring? "
        "Rate whether this would keep a viewer engaged for the full duration."
    )
    text_clarity_criterion = (
        "Text Clarity: Using the text_overlay fields and scene descriptions, rate how readable and "
        "clear the on-screen text will be on a phone screen. Consider length, timing per card, and jargon."
    )
    safety_criterion = (
        "Safety & Policy: Check the described visuals and copy for potential issues with age-appropriateness, "
        "violence, self-harm, hate, illegal activity, and deceptive claims. "
        "Rate how safe this is for a broad under-18 audience on major platforms."
    )
    prompt_adherence_criterion = (
        "Prompt Adherence: Assuming the Sora prompt matches this timeline, rate how well the scenes "
        "and overlays stay focused on one clear concept without random off-topic moments."
    )

    # Run all evaluations concurrently
    import asyncio
    (
        hook_res,
        cta_res,
        brand_res,
        visual_res,
        motion_res,
        text_res,
        safety_res,
        prompt_res,
    ) = await asyncio.gather(
        _evaluate_gemini(hook_criterion, context),
        _evaluate_gemini(cta_criterion, context),
        _evaluate_gemini(brand_criterion, context),
        _evaluate_gemini(visual_quality_criterion, context),
        _evaluate_gemini(motion_pacing_criterion, context),
        _evaluate_gemini(text_clarity_criterion, context),
        _evaluate_gemini(safety_criterion, context),
        _evaluate_gemini(prompt_adherence_criterion, context),
    )

    avg = (
        hook_res["score"]
        + cta_res["score"]
        + brand_res["score"]
        + visual_res["score"]
        + motion_res["score"]
        + text_res["score"]
        + safety_res["score"]
        + prompt_res["score"]
    ) / 8
    if avg >= 8.5:
        overall = "Excellent — feels like a polished, professional ad. Ship it."
    elif avg >= 7:
        overall = "Good — minor professional tweaks will make this feel premium."
    elif avg >= 5:
        overall = "Needs work — apply these AI fixes before using in production."
    else:
        overall = "Weak — rethink the creative before spending media budget."

    # Build a focused remix prompt for Sora based on this critique
    remix_prompt = ""
    try:
        async_client = genai.Client(api_key=settings.gemini_api_key)
        remix_resp = await async_client.aio.models.generate_content(
            model=settings.gemini_chat_model,
            contents=(
                "You are rewriting a text-to-video prompt for OpenAI Sora to make a professional short-form ad.\n\n"
                f"Production context (timeline + brand):\n{context}\n\n"
                f"Hook critique (score {hook_res['score']}/10): {hook_res['suggestion']}\n"
                f"CTA critique (score {cta_res['score']}/10): {cta_res['suggestion']}\n"
                f"Brand/craft critique (score {brand_res['score']}/10): {brand_res['suggestion']}\n\n"
                "Write ONE improved Sora prompt (max 220 words) that:\n"
                "- Keeps the same core idea and platform.\n"
                "- Fixes the weaknesses you just described.\n"
                "- Uses concrete cinematography language (framing, motion, lighting, pacing, transitions).\n"
                "- Reads like a director's brief aimed at a professional editor.\n"
                "Output ONLY the new prompt text, no explanation or JSON."
            ),
            config=gtypes.GenerateContentConfig(
                thinking_config=gtypes.ThinkingConfig(thinking_level="low"),
            ),
        )
        remix_prompt = (remix_resp.text or "").strip()
    except Exception:
        remix_prompt = ""

    return {
        "scores": {
            "hook_strength":     hook_res["score"],
            "cta_clarity":       cta_res["score"],
            "brand_compliance":  brand_res["score"],
            "visual_quality":    visual_res["score"],
            "motion_pacing":     motion_res["score"],
            "text_clarity":      text_res["score"],
            "safety":            safety_res["score"],
            "prompt_adherence":  prompt_res["score"],
        },
        "verdicts": {
            "hook_strength":     hook_res["verdict"],
            "cta_clarity":       cta_res["verdict"],
            "brand_compliance":  brand_res["verdict"],
            "visual_quality":    visual_res["verdict"],
            "motion_pacing":     motion_res["verdict"],
            "text_clarity":      text_res["verdict"],
            "safety":            safety_res["verdict"],
            "prompt_adherence":  prompt_res["verdict"],
        },
        "suggestions": {
            "hook_strength":     hook_res["suggestion"],
            "cta_clarity":       cta_res["suggestion"],
            "brand_compliance":  brand_res["suggestion"],
            "visual_quality":    visual_res["suggestion"],
            "motion_pacing":     motion_res["suggestion"],
            "text_clarity":      text_res["suggestion"],
            "safety":            safety_res["suggestion"],
            "prompt_adherence":  prompt_res["suggestion"],
        },
        "overall": overall,
        "remix_prompt": remix_prompt,
    }


@router.post("/fix")
async def apply_fix(req: FixRequest):
    """Apply an AI-suggested fix via Gemini and return updated guidance."""
    job = get_job(req.job_id)
    timeline: dict | None = None
    if job:
        timeline_id = job.get("timeline_id")
        if timeline_id:
            timeline = get_timeline(timeline_id)

    if not timeline:
        raise HTTPException(404, detail="Timeline not found")

    brand_profile = None
    if req.brand_id:
        try:
            brand_profile = brand_memory.get_brand(req.brand_id)
        except Exception:
            pass

    context = _build_context(timeline, brand_profile)
    fix_prompts = {
        "hook_strength": (
            "Rewrite the opening scene to have a stronger scroll-stopping hook for short-form vertical video. "
            f"Current timeline:\n{context}\n"
            "Provide specific text overlay copy and visual direction improvements."
        ),
        "cta_clarity": (
            "Improve the CTA to be more specific, urgent, and platform-native (TikTok/Reels/Shorts). "
            f"Current timeline:\n{context}\n"
            "Provide the exact CTA text and placement guidance."
        ),
        "brand_compliance": (
            "Fix any brand rule violations and ensure tone consistency. "
            f"Current timeline:\n{context}\n"
            "List specific changes to bring this into brand compliance."
        ),
    }

    if req.fix_type not in fix_prompts:
        raise HTTPException(400, detail=f"Unknown fix_type: {req.fix_type}")

    try:
        async_client = genai.Client(api_key=settings.gemini_api_key)
        response = await async_client.aio.models.generate_content(
            model=settings.gemini_chat_model,
            contents=(
                "You are a video ad expert. Provide 3 specific, actionable improvements. "
                "Be concise and practical.\n\n" + fix_prompts[req.fix_type]
            ),
        )
        fix_text = response.text or "Apply the suggestions from the critic evaluation."
    except Exception as e:
        fix_text = f"Fix type '{req.fix_type}': review your hook, CTA, and brand guidelines."

    return {
        "success": True,
        "fix_type": req.fix_type,
        "improvements": fix_text,
        "message": f"AI fix generated for {req.fix_type}. Apply these improvements and re-run the critic.",
    }
