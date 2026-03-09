"""
Fix Identity Agent — adjusts brand elements in the timeline when
brand_compliance critic verdict is "fix".
Regenerates CTA text overlay and brand-aligning scene descriptions.
"""

import json
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage

from config import settings
from services import brand_memory


def _get_llm() -> ChatOpenAI:
    return ChatOpenAI(
        model=settings.llm_model,
        openai_api_key=settings.fireworks_api_key,
        openai_api_base=settings.fireworks_base_url,
        temperature=0.4,
    )


FIX_SYSTEM = """You are a brand compliance fixer for video ads.
Given the brand rules, constraints, and the current timeline description,
propose fixed text overlays and scene adjustments that make the ad brand-compliant.
Return ONLY valid JSON with:
- cta_text: new CTA overlay text (string)
- scene_adjustments: list of {clip_index, new_text_overlay, note} objects
No markdown, no extra explanation."""


def apply_identity_fix(
    brand_id: str,
    job_id: str,
    timeline: dict,
    compliance_suggestion: str,
) -> dict:
    """
    Apply brand identity fixes to the timeline.
    Returns a modified timeline dict.
    """
    profile = brand_memory.get_brand(brand_id) or {}
    brand_rules = profile.get("brand_rules") or "[]"
    if isinstance(brand_rules, str):
        brand_rules = json.loads(brand_rules)
    constraints = profile.get("constraints") or "[]"
    if isinstance(constraints, str):
        constraints = json.loads(constraints)

    clips = timeline.get("clips", [])
    clip_summary = json.dumps(
        [{"clip_index": c.get("clip_index"), "text_overlay": c.get("text_overlay")} for c in clips]
    )

    llm = _get_llm()
    messages = [
        SystemMessage(content=FIX_SYSTEM),
        HumanMessage(
            content=(
                f"Brand: {profile.get('name')} | Tone: {profile.get('tone')}\n"
                f"Rules: {', '.join(brand_rules[:4])}\n"
                f"Constraints: {', '.join(constraints[:3])}\n"
                f"Issue to fix: {compliance_suggestion}\n"
                f"Current timeline clips: {clip_summary}"
            )
        ),
    ]
    response = llm.invoke(messages)
    raw = response.content.strip()
    try:
        fixes = json.loads(raw)
    except json.JSONDecodeError:
        start = raw.find("{")
        end = raw.rfind("}") + 1
        fixes = json.loads(raw[start:end]) if start != -1 else {}

    # Apply fixes to timeline
    fixed_clips = list(clips)
    for adj in fixes.get("scene_adjustments", []):
        idx = adj.get("clip_index", -1)
        if 0 <= idx < len(fixed_clips):
            fixed_clips[idx] = {
                **fixed_clips[idx],
                "text_overlay": adj.get("new_text_overlay", fixed_clips[idx].get("text_overlay", "")),
            }

    if fixes.get("cta_text") and fixed_clips:
        fixed_clips[-1] = {**fixed_clips[-1], "text_overlay": fixes["cta_text"]}

    return {**timeline, "clips": fixed_clips, "_identity_fixed": True}
