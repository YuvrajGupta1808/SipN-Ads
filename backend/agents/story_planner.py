"""
Story Planner Agent — LangGraph graph powered by Google Gemini.

Graph:  load_brand → research → gen_variants → plan_scenes

Models:
  - gemini-3-flash-preview  (thinking_level supported)
  - Google Search grounding in `research` for real-time trend intelligence

Key fix: always assign genai.Client to a local variable before calling
generate_content — avoids the httpx "client closed" race with Python GC.
"""

import json
import uuid
import logging
from typing import TypedDict, Optional

from google import genai
from google.genai import types
from langgraph.graph import StateGraph, END

from config import settings
from services import brand_memory

log = logging.getLogger(__name__)

MODEL = "gemini-3-flash-preview"


# ---------------------------------------------------------------------------
# Client + config helpers
# ---------------------------------------------------------------------------

def _client() -> genai.Client:
    return genai.Client(api_key=settings.gemini_api_key)


def _cfg(thinking: str = "low") -> types.GenerateContentConfig:
    return types.GenerateContentConfig(
        thinking_config=types.ThinkingConfig(thinking_level=thinking),
    )


def _cfg_with_search(thinking: str = "high") -> types.GenerateContentConfig:
    return types.GenerateContentConfig(
        tools=[types.Tool(google_search=types.GoogleSearch())],
        thinking_config=types.ThinkingConfig(thinking_level=thinking),
    )


# ---------------------------------------------------------------------------
# State
# ---------------------------------------------------------------------------

class Scene(TypedDict):
    scene_number: int
    title: str
    duration_s: int
    description: str
    hook_text: str
    visual_note: str
    audio_note: str


class AdVariant(TypedDict):
    id: str
    label: str
    tone: str
    style: str
    hook: str
    cta: str
    target_audience: str
    viral_format: str
    scenes: list[Scene]


class ResearchSource(TypedDict):
    title: str
    url: str


class ResearchContext(TypedDict):
    queries: list[str]
    sources: list[ResearchSource]
    trend_notes: str


class StoryPlannerState(TypedDict):
    brand_id: str
    user_message: str
    brand_profile: Optional[dict]
    story_summary: str
    trend_intelligence: str        # rich search-grounded trend report
    variants: list[AdVariant]
    research_context: Optional[ResearchContext]


# ---------------------------------------------------------------------------
# Fallback data
# ---------------------------------------------------------------------------

def _fallback_variants(brand_name: str, tone: str, user_message: str) -> list[AdVariant]:
    return [
        {
            "id": str(uuid.uuid4()),
            "label": "Variant A",
            "tone": tone,
            "style": "Fast-cut product montage with bold text overlays",
            "hook": f"You've never seen {brand_name} like this.",
            "cta": "Shop now — link in bio",
            "target_audience": "18-34 year olds interested in the brand category",
            "viral_format": "Product showcase",
            "scenes": [
                {"scene_number": 1, "title": "Hook shot", "duration_s": 3,
                 "description": "Extreme close-up of product, fast push-in", "hook_text": "",
                 "visual_note": "High contrast, desaturated", "audio_note": "Trending beat drop"},
                {"scene_number": 2, "title": "Lifestyle cut", "duration_s": 4,
                 "description": "Person using product in aspirational setting", "hook_text": "",
                 "visual_note": "Golden hour light", "audio_note": "Upbeat continuation"},
                {"scene_number": 3, "title": "CTA card", "duration_s": 2,
                 "description": "Clean product shot with text overlay", "hook_text": "Shop now",
                 "visual_note": "White background", "audio_note": "Audio fade"},
            ],
        },
        {
            "id": str(uuid.uuid4()),
            "label": "Variant B",
            "tone": "emotional",
            "style": "Cinematic slow-motion storytelling",
            "hook": "This changed everything for me...",
            "cta": "See why — tap the link",
            "target_audience": "Young adults seeking transformation",
            "viral_format": "Emotional storytelling",
            "scenes": [
                {"scene_number": 1, "title": "Problem moment", "duration_s": 3,
                 "description": "Relatable frustration, slow pan", "hook_text": "",
                 "visual_note": "Warm desaturated", "audio_note": "Soft piano intro"},
                {"scene_number": 2, "title": "Discovery", "duration_s": 4,
                 "description": f"Finding {brand_name} — reaction shot", "hook_text": "Wait...",
                 "visual_note": "Brightening grade", "audio_note": "Music swell"},
                {"scene_number": 3, "title": "Resolution", "duration_s": 3,
                 "description": "Happy outcome, product in hand", "hook_text": "",
                 "visual_note": "Vibrant, warm", "audio_note": "Full beat, triumphant"},
            ],
        },
        {
            "id": str(uuid.uuid4()),
            "label": "Variant C",
            "tone": "playful",
            "style": "POV talking-head with on-screen text and sound effects",
            "hook": f"POV: You just discovered {brand_name} 👀",
            "cta": "Get yours before they sell out",
            "target_audience": "Gen Z trendsetters",
            "viral_format": "POV / UGC style",
            "scenes": [
                {"scene_number": 1, "title": "POV hook", "duration_s": 2,
                 "description": "Talking directly to camera, excited energy", "hook_text": "POV: you found it",
                 "visual_note": "Natural light, handheld", "audio_note": "Trending sound effect"},
                {"scene_number": 2, "title": "Demo", "duration_s": 5,
                 "description": f"Quick demo of {brand_name} with text callouts", "hook_text": "",
                 "visual_note": "Handheld feel", "audio_note": "Upbeat background music"},
                {"scene_number": 3, "title": "Urgency close", "duration_s": 2,
                 "description": "Reaction + swipe-up prompt", "hook_text": "Get it NOW",
                 "visual_note": "High energy", "audio_note": "Urgent beat"},
            ],
        },
    ]


# ---------------------------------------------------------------------------
# Node 1: Load brand profile
# ---------------------------------------------------------------------------

def load_brand_profile(state: StoryPlannerState) -> StoryPlannerState:
    brand_id = state.get("brand_id", "")
    profile = None
    if brand_id:
        try:
            profile = brand_memory.get_brand(brand_id)
        except Exception as e:
            log.warning("load_brand_profile failed: %s", e)
    return {**state, "brand_profile": profile}


# ---------------------------------------------------------------------------
# Node 2: Google Search-grounded research + story concept
# ---------------------------------------------------------------------------

def construct_story_summary(state: StoryPlannerState) -> StoryPlannerState:
    profile = state.get("brand_profile") or {}
    brand_name = profile.get("name", "the brand")
    tone = profile.get("tone", "bold")
    description = profile.get("description", "")
    platforms = profile.get("platforms") or ["TikTok"]
    if isinstance(platforms, str):
        try:
            platforms = json.loads(platforms)
        except Exception:
            platforms = [platforms]

    rules = profile.get("brand_rules") or "[]"
    if isinstance(rules, str):
        try:
            rules = json.loads(rules)
        except Exception:
            rules = []

    platform_str = ", ".join(platforms) if platforms else "TikTok"
    rules_str = "; ".join(rules[:4]) if rules else "none"

    prompt = f"""You are a top-tier social media advertising strategist.

BRAND BRIEF:
- Brand: {brand_name}
- Tone: {tone}
- Description: {description}
- Target platforms: {platform_str}
- Brand rules: {rules_str}
- Campaign brief from user: {state['user_message']}

TASK — use Google Search to research ALL of the following, then write a detailed intelligence report:

1. CURRENT VIRAL TRENDS (2025): What content formats, hooks, and styles are going viral RIGHT NOW on {platform_str} for brands in {brand_name}'s category?
2. TOP-PERFORMING AD HOOKS: What are the exact opening lines and visual patterns that are getting the highest engagement for similar brands?
3. AUDIENCE INSIGHTS: What is {brand_name}'s target audience engaging with most — what emotions, topics, challenges, or desires resonate?
4. COMPETITOR TACTICS: How are leading brands in this category advertising on {platform_str} right now? What's working?
5. PLATFORM-NATIVE FORMATS: What specific content formats (POV, GRWM, challenge, duet, tutorial, day-in-the-life, etc.) are performing best on each platform in {platform_str}?

OUTPUT FORMAT:
Write a rich, detailed intelligence report (at least 8-10 sentences) that a creative director would use to brief an ad team. Be highly specific — include actual trend names, hook styles, format names, and engagement patterns found. End with a bold campaign concept direction for {brand_name}.

Use your Google Search results to ground every claim in current, real data."""

    research: ResearchContext = {"queries": [], "sources": [], "trend_notes": ""}
    summary = ""
    trend_intelligence = ""

    try:
        client = _client()
        response = client.models.generate_content(
            model=MODEL,
            contents=prompt,
            config=_cfg_with_search(thinking="high"),
        )
        summary = (response.text or "").strip()
        trend_intelligence = summary

        # Extract grounding metadata
        try:
            gm = response.candidates[0].grounding_metadata
            if gm:
                research["queries"] = list(gm.web_search_queries or [])
                research["trend_notes"] = summary[:500]
                for chunk in (gm.grounding_chunks or []):
                    if chunk.web:
                        research["sources"].append({
                            "title": chunk.web.title or "",
                            "url": chunk.web.uri or "",
                        })
        except Exception as e:
            log.warning("grounding metadata extraction failed: %s", e)

    except Exception as e:
        log.error("construct_story_summary Gemini call failed: %s", e, exc_info=True)
        summary = ""

    if not summary:
        summary = (
            f"A bold, platform-native ad campaign for {brand_name} built around "
            f"the brand's {tone} identity. The campaign leads with a disruptive hook "
            f"in the first 3 seconds, uses fast-paced vertical visuals optimised for "
            f"{platform_str}, and closes with a clear, urgent call to action."
        )
        trend_intelligence = summary

    return {**state, "story_summary": summary, "trend_intelligence": trend_intelligence, "research_context": research}


# ---------------------------------------------------------------------------
# Node 3: Generate 3 detailed ad variants
# ---------------------------------------------------------------------------

def generate_variants(state: StoryPlannerState) -> StoryPlannerState:
    profile = state.get("brand_profile") or {}
    brand_name = profile.get("name", "Brand")
    tone = profile.get("tone", "bold")
    platforms = profile.get("platforms") or ["TikTok"]
    if isinstance(platforms, str):
        try:
            platforms = json.loads(platforms)
        except Exception:
            platforms = [platforms]
    platform_str = ", ".join(platforms)

    trend_intel = state.get("trend_intelligence") or state.get("story_summary", "")
    research = state.get("research_context") or {}
    sources_str = ""
    if research.get("queries"):
        sources_str = f"\nSearch queries used: {', '.join(research['queries'][:5])}"

    prompt = f"""You are a senior creative director generating short-form video ad concepts.

BRAND: {brand_name} | TONE: {tone} | PLATFORMS: {platform_str}
CAMPAIGN BRIEF: {state['user_message']}

TREND INTELLIGENCE FROM GOOGLE SEARCH:
{trend_intel[:1500]}{sources_str}

Generate EXACTLY 3 highly differentiated, trend-grounded ad variants as a JSON array.

Variant requirements:
- Variant A: "Pattern Interrupt" — an unexpected, disruptive hook that stops the scroll. Uses the most contrarian or surprising angle found in the trend research.
- Variant B: "Emotional Arc" — builds genuine emotional connection before the sell. Taps into the audience's real desires, fears, or aspirations identified in research.
- Variant C: "Platform-Native Format" — uses a specific viral format from the research (e.g. POV, Get Ready With Me, Day-in-the-life, Before/After, Tutorial, Challenge, Duet, or trending sound trend).

Each variant object MUST include ALL these fields:
{{
  "label": "Variant A",
  "tone": "specific tone word",
  "style": "detailed visual style description (15+ words)",
  "hook": "exact word-for-word opening line spoken or shown in first 2-3 seconds (make it punchy and specific)",
  "cta": "specific closing call-to-action (not generic)",
  "target_audience": "specific audience description (age, interest, mindset)",
  "viral_format": "name of the specific viral format being used"
}}

Return ONLY a valid JSON array. No markdown fences, no commentary, no extra text."""

    variants: list[AdVariant] = []
    try:
        client = _client()
        response = client.models.generate_content(
            model=MODEL,
            contents=prompt,
            config=_cfg(thinking="medium"),
        )
        raw = (response.text or "").strip()
        # Strip markdown fences
        if "```" in raw:
            parts = raw.split("```")
            for part in parts:
                part = part.strip()
                if part.startswith("json"):
                    part = part[4:].strip()
                if part.startswith("["):
                    raw = part
                    break

        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            start, end = raw.find("["), raw.rfind("]") + 1
            parsed = json.loads(raw[start:end]) if start != -1 else []

        labels = ["Variant A", "Variant B", "Variant C"]
        for i, v in enumerate(parsed[:3]):
            variants.append({
                "id": str(uuid.uuid4()),
                "label": labels[i] if i < len(labels) else f"Variant {chr(65 + i)}",
                "tone": v.get("tone", tone),
                "style": v.get("style", "fast-cut"),
                "hook": v.get("hook", ""),
                "cta": v.get("cta", ""),
                "target_audience": v.get("target_audience", ""),
                "viral_format": v.get("viral_format", ""),
                "scenes": [],
            })
    except Exception as e:
        log.error("generate_variants Gemini call failed: %s", e, exc_info=True)
        variants = []

    if not variants:
        variants = _fallback_variants(brand_name, tone, state["user_message"])

    return {**state, "variants": variants}


# ---------------------------------------------------------------------------
# Node 4: Plan detailed scenes for each variant
# ---------------------------------------------------------------------------

def plan_scenes(state: StoryPlannerState) -> StoryPlannerState:
    profile = state.get("brand_profile") or {}
    brand_name = profile.get("name", "Brand")
    updated_variants: list[AdVariant] = []

    for variant in state["variants"]:
        if variant.get("scenes"):
            updated_variants.append(variant)
            continue

        prompt = f"""You are a Veo 3 video director planning a short-form ad.

BRAND: {brand_name}
VARIANT STYLE: {variant['style']}
VIRAL FORMAT: {variant.get('viral_format', 'short-form ad')}
TARGET AUDIENCE: {variant.get('target_audience', 'general audience')}
OPENING HOOK: {variant['hook']}
CLOSING CTA: {variant['cta']}
CAMPAIGN CONCEPT: {state['story_summary'][:400]}

Plan 4-5 scenes for this 9:16 vertical video ad (total 10-15 seconds).
Each scene must be highly specific and production-ready for Veo 3 generation.

Return a JSON array where each object has ALL these fields:
{{
  "scene_number": 1,
  "title": "scene name",
  "duration_s": 3,
  "description": "detailed shot description — include subject action, camera movement, framing (min 20 words)",
  "hook_text": "exact on-screen text overlay shown (or empty string if none)",
  "visual_note": "specific camera angle, lighting style, color grade, or movement technique",
  "audio_note": "specific sound design — music genre/mood, SFX, voiceover, or trending audio cue"
}}

Rules:
- Scene 1 (0-3s): The hook — must grab attention immediately, match the opening hook text
- Scene 2-3 (3-9s): The core message — show the product/experience in action
- Scene 4-5 (9-15s): Resolution + CTA — create desire and direct action
- Total duration must be 10-15 seconds
- Be VERY specific about camera movements (push-in, Dutch tilt, whip-pan, handheld, etc.)
- Be VERY specific about audio (name the genre, mood, BPM feel, or specific trending format)

Return ONLY the JSON array."""

        scenes = []
        try:
            client = _client()
            response = client.models.generate_content(
                model=MODEL,
                contents=prompt,
                config=_cfg(thinking="low"),
            )
            raw = (response.text or "").strip()
            if "```" in raw:
                parts = raw.split("```")
                for part in parts:
                    part = part.strip()
                    if part.startswith("json"):
                        part = part[4:].strip()
                    if part.startswith("["):
                        raw = part
                        break
            try:
                scenes = json.loads(raw)
            except json.JSONDecodeError:
                start, end = raw.find("["), raw.rfind("]") + 1
                scenes = json.loads(raw[start:end]) if start != -1 else []
        except Exception as e:
            log.error("plan_scenes Gemini call failed for %s: %s", variant['label'], e, exc_info=True)
            scenes = []

        if not scenes:
            scenes = [
                {"scene_number": 1, "title": "Hook", "duration_s": 3,
                 "description": f"Opening hook: {variant['hook']} — close-up, high energy, direct eye contact with camera",
                 "hook_text": variant["hook"][:40], "visual_note": "Dynamic push-in, high contrast",
                 "audio_note": "Trending beat drop or sound effect"},
                {"scene_number": 2, "title": "Product hero", "duration_s": 4,
                 "description": f"Hero shot of {brand_name} product in use — lifestyle context showing aspirational value",
                 "hook_text": "", "visual_note": "Clean well-lit, slow-mo detail shot",
                 "audio_note": "Upbeat music continuation, no lyrics"},
                {"scene_number": 3, "title": "Social proof", "duration_s": 3,
                 "description": "Quick montage of reactions, results, or testimonials with text overlays",
                 "hook_text": "Everyone's talking about it", "visual_note": "Fast cuts, warm grade",
                 "audio_note": "Music intensifies slightly"},
                {"scene_number": 4, "title": "CTA close", "duration_s": 3,
                 "description": "Product or brand logo on clean background with strong CTA overlay",
                 "hook_text": variant["cta"], "visual_note": "Bold typography, brand colors",
                 "audio_note": "Short percussive accent on CTA appearance"},
            ]

        updated_variants.append({
            **variant,
            "scenes": [
                {
                    "scene_number": s.get("scene_number", idx + 1),
                    "title": s.get("title", f"Scene {idx + 1}"),
                    "duration_s": s.get("duration_s", 3),
                    "description": s.get("description", ""),
                    "hook_text": s.get("hook_text", ""),
                    "visual_note": s.get("visual_note", ""),
                    "audio_note": s.get("audio_note", ""),
                }
                for idx, s in enumerate(scenes[:5])
            ],
        })

    return {**state, "variants": updated_variants}


# ---------------------------------------------------------------------------
# Graph
# ---------------------------------------------------------------------------

def build_story_planner_graph():
    graph = StateGraph(StoryPlannerState)
    graph.add_node("load_brand", load_brand_profile)
    graph.add_node("summarize", construct_story_summary)
    graph.add_node("gen_variants", generate_variants)
    graph.add_node("plan_scenes", plan_scenes)
    graph.set_entry_point("load_brand")
    graph.add_edge("load_brand", "summarize")
    graph.add_edge("summarize", "gen_variants")
    graph.add_edge("gen_variants", "plan_scenes")
    graph.add_edge("plan_scenes", END)
    return graph.compile()


_graph = None


def run_story_planner(brand_id: str, user_message: str) -> dict:
    global _graph
    if _graph is None:
        _graph = build_story_planner_graph()

    initial: StoryPlannerState = {
        "brand_id": brand_id,
        "user_message": user_message,
        "brand_profile": None,
        "story_summary": "",
        "trend_intelligence": "",
        "variants": [],
        "research_context": None,
    }
    result = _graph.invoke(initial)

    brand_profile = result.get("brand_profile") or {}
    rules = brand_profile.get("brand_rules") or "[]"
    if isinstance(rules, str):
        try:
            rules = json.loads(rules)
        except Exception:
            rules = []

    brand_context = None
    if brand_profile:
        brand_context = {
            "name": brand_profile.get("name", ""),
            "tone": brand_profile.get("tone", ""),
            "color": brand_profile.get("color", "#f97316"),
            "tagline": brand_profile.get("tagline", ""),
            "description": brand_profile.get("description", ""),
            "rules": rules[:5],
            "platforms": brand_profile.get("platforms") or [],
        }

    return {
        "story_summary": result["story_summary"],
        "variants": result["variants"],
        "brand_context": brand_context,
        "research_context": result.get("research_context"),
    }
