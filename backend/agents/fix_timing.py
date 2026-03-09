"""
Fix Timing Agent — adjusts scene durations and pacing when
hook_strength or cta_clarity critic verdict is "fix".
Redistributes time across clips to front-load the hook.
"""

import json
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage

from config import settings


def _get_llm() -> ChatOpenAI:
    return ChatOpenAI(
        model=settings.llm_model,
        openai_api_key=settings.fireworks_api_key,
        openai_api_base=settings.fireworks_base_url,
        temperature=0.3,
    )


TIMING_SYSTEM = """You are a video pacing editor for short-form ads.
Given the current scene timing and a pacing/hook issue, propose new durations.
Rules:
- Opening hook scene: 2-4 seconds (short and punchy)
- Middle scenes: 3-6 seconds each
- Final CTA scene: 3-5 seconds
- Total must stay between 12-30 seconds
Return ONLY valid JSON with:
- clip_durations: list of {clip_index, new_duration_s} objects
No markdown, no extra explanation."""


def apply_timing_fix(
    job_id: str,
    timeline: dict,
    hook_suggestion: str = "",
    cta_suggestion: str = "",
) -> dict:
    """
    Re-time the timeline clips for better pacing.
    Returns a modified timeline dict with recalculated start/end timestamps.
    """
    clips = timeline.get("clips", [])
    if not clips:
        return timeline

    clip_summary = json.dumps([
        {
            "clip_index": c.get("clip_index"),
            "current_duration_s": (c.get("end_ms", 0) - c.get("start_ms", 0)) // 1000,
            "scene_title": c.get("scene_title", ""),
        }
        for c in clips
    ])

    llm = _get_llm()
    messages = [
        SystemMessage(content=TIMING_SYSTEM),
        HumanMessage(
            content=(
                f"Hook issue: {hook_suggestion}\n"
                f"CTA issue: {cta_suggestion}\n"
                f"Current clips: {clip_summary}"
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

    # Build new duration map
    duration_map: dict[int, int] = {}
    for item in fixes.get("clip_durations", []):
        idx = item.get("clip_index", -1)
        dur = max(2, min(10, int(item.get("new_duration_s", 5))))
        duration_map[idx] = dur

    # Reconstruct clips with new timing
    fixed_clips = []
    cursor_ms = 0
    for i, clip in enumerate(clips):
        duration_s = duration_map.get(i, (clip.get("end_ms", 0) - clip.get("start_ms", 0)) // 1000)
        duration_ms = duration_s * 1000
        fixed_clips.append({
            **clip,
            "start_ms": cursor_ms,
            "end_ms": cursor_ms + duration_ms,
        })
        cursor_ms += duration_ms

    return {
        **timeline,
        "clips": fixed_clips,
        "total_duration_ms": cursor_ms,
        "_timing_fixed": True,
    }
