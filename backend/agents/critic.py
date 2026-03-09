"""
Critic Agent — evaluates a rendered ad timeline against three criteria:
  1. Hook Strength    — does the first 3s stop the scroll?
  2. CTA Clarity      — is the call-to-action specific and prominent?
  3. Brand Compliance — does it follow brand rules and platform policies?

Uses Gemini Flash with thinking for concise, actionable critique.
"""

import json
from typing import TypedDict

from google import genai
from google.genai import types as gtypes
from langgraph.graph import StateGraph, END

from config import settings
from services import brand_memory


def _new_client() -> genai.Client:
    """Always create a fresh client — the httpx client inside genai.Client is not
    safe to reuse across threads (executor tasks) after the event loop has closed it."""
    return genai.Client(api_key=settings.gemini_api_key)


# ---------------------------------------------------------------------------
# State
# ---------------------------------------------------------------------------

class CritiqueResult(TypedDict):
    score: int
    verdict: str       # "accept" | "fix"
    suggestion: str


class CriticState(TypedDict):
    brand_id: str
    job_id: str
    timeline: dict
    brand_profile: dict | None
    hook_strength: CritiqueResult | None
    cta_clarity: CritiqueResult | None
    brand_compliance: CritiqueResult | None
    overall: str


# ---------------------------------------------------------------------------
# Core evaluator (Gemini Flash)
# ---------------------------------------------------------------------------

EVAL_SYSTEM = (
    "You are a senior video ad strategist and performance marketer. "
    "Evaluate the ad on the specific criterion given. "
    "Return ONLY a JSON object — no markdown, no explanation outside it:\n"
    '{"score": <int 0-10>, "verdict": "accept" or "fix", "suggestion": "<one actionable sentence>"}\n'
    "Score >= 8 = accept. Score < 8 = fix. Be specific and brutal — vague feedback wastes time."
)


def _evaluate(criterion: str, context: str) -> CritiqueResult:
    try:
        response = _new_client().models.generate_content(
            model=settings.gemini_chat_model,
            contents=f"{EVAL_SYSTEM}\n\nCriterion: {criterion}\n\nAd context:\n{context}",
            config=gtypes.GenerateContentConfig(
                thinking_config=gtypes.ThinkingConfig(thinking_level="low"),
            ),
        )
        raw = (response.text or "").strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        start, end = raw.find("{"), raw.rfind("}") + 1
        try:
            parsed = json.loads(raw[start:end]) if start != -1 else {}
        except Exception:
            parsed = {}
    except Exception:
        parsed = {}

    score = max(0, min(10, int(parsed.get("score", 5))))
    return CritiqueResult(
        score=score,
        verdict="accept" if score >= 8 else "fix",
        suggestion=parsed.get("suggestion", "Could not evaluate — check API key."),
    )


def _build_context(state: CriticState) -> str:
    timeline = state.get("timeline", {})
    clips = timeline.get("clips", [])
    profile = state.get("brand_profile") or {}

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
        f"Scenes:\n" + "\n".join(scene_lines)
    )


# ---------------------------------------------------------------------------
# Graph nodes
# ---------------------------------------------------------------------------

def load_brand(state: CriticState) -> CriticState:
    brand_id = state.get("brand_id", "")
    profile = None
    if brand_id:
        try:
            profile = brand_memory.get_brand(brand_id)
        except Exception:
            pass
    return {**state, "brand_profile": profile}


def evaluate_hook(state: CriticState) -> CriticState:
    context = _build_context(state)
    clips = state.get("timeline", {}).get("clips", [])
    first = clips[0] if clips else {}
    dur = (first.get("end_ms", 3000) - first.get("start_ms", 0)) / 1000
    overlay = first.get("text_overlay", "")
    criterion = (
        f"Hook Strength: Does the opening {dur:.0f}s stop a scrolling viewer? "
        f"Opening overlay text: '{overlay}'. "
        f"Rate: emotional pull, curiosity gap, pattern interrupt, scroll-stopping power."
    )
    return {**state, "hook_strength": _evaluate(criterion, context)}


def evaluate_cta(state: CriticState) -> CriticState:
    context = _build_context(state)
    clips = state.get("timeline", {}).get("clips", [])
    last = clips[-1] if clips else {}
    cta_text = last.get("text_overlay", "no CTA found")
    criterion = (
        f"CTA Clarity: Is there a clear, specific, action-oriented CTA? "
        f"Closing text overlay: '{cta_text}'. "
        f"Rate: specificity, urgency, platform-native feel (swipe/tap/link-in-bio etc.)."
    )
    return {**state, "cta_clarity": _evaluate(criterion, context)}


def evaluate_brand(state: CriticState) -> CriticState:
    context = _build_context(state)
    criterion = (
        "Brand Compliance: Does this ad fully follow the brand's rules, tone, and "
        "platform policies for short-form vertical video? "
        "Check tone consistency, constraint violations, inappropriate content."
    )
    return {**state, "brand_compliance": _evaluate(criterion, context)}


def compute_overall(state: CriticState) -> CriticState:
    scores = [
        (state.get("hook_strength") or {}).get("score", 0),
        (state.get("cta_clarity") or {}).get("score", 0),
        (state.get("brand_compliance") or {}).get("score", 0),
    ]
    avg = sum(scores) / max(len(scores), 1)
    if avg >= 8.5:
        overall = "Excellent — ready to publish"
    elif avg >= 7:
        overall = "Good — minor tweaks recommended"
    elif avg >= 5:
        overall = "Needs work — apply AI fixes"
    else:
        overall = "Poor — significant rework needed"
    return {**state, "overall": overall}


# ---------------------------------------------------------------------------
# Build & run
# ---------------------------------------------------------------------------

def build_critic_graph():
    graph = StateGraph(CriticState)
    graph.add_node("load_brand", load_brand)
    graph.add_node("evaluate_hook", evaluate_hook)
    graph.add_node("evaluate_cta", evaluate_cta)
    graph.add_node("evaluate_brand", evaluate_brand)
    graph.add_node("compute_overall", compute_overall)
    graph.set_entry_point("load_brand")
    graph.add_edge("load_brand", "evaluate_hook")
    graph.add_edge("evaluate_hook", "evaluate_cta")
    graph.add_edge("evaluate_cta", "evaluate_brand")
    graph.add_edge("evaluate_brand", "compute_overall")
    graph.add_edge("compute_overall", END)
    return graph.compile()


_graph = None


def run_critic(brand_id: str, job_id: str, timeline: dict) -> dict:
    global _graph
    if _graph is None:
        _graph = build_critic_graph()

    result = _graph.invoke({
        "brand_id": brand_id,
        "job_id": job_id,
        "timeline": timeline,
        "brand_profile": None,
        "hook_strength": None,
        "cta_clarity": None,
        "brand_compliance": None,
        "overall": "",
    })

    def _safe(key: str) -> CritiqueResult:
        return result.get(key) or {"score": 0, "verdict": "fix", "suggestion": ""}

    return {
        "scores": {
            "hook_strength":    _safe("hook_strength")["score"],
            "cta_clarity":      _safe("cta_clarity")["score"],
            "brand_compliance": _safe("brand_compliance")["score"],
        },
        "verdicts": {
            "hook_strength":    _safe("hook_strength")["verdict"],
            "cta_clarity":      _safe("cta_clarity")["verdict"],
            "brand_compliance": _safe("brand_compliance")["verdict"],
        },
        "suggestions": {
            "hook_strength":    _safe("hook_strength")["suggestion"],
            "cta_clarity":      _safe("cta_clarity")["suggestion"],
            "brand_compliance": _safe("brand_compliance")["suggestion"],
        },
        "overall": result.get("overall", ""),
    }
