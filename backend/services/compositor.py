"""
Compositor — assembles scene-asset matches into a timeline JSON.
The timeline describes the full video: asset URLs, timing, text overlays, transitions.
This timeline JSON is what the renderer (FFmpeg/Remotion) consumes.
"""

import uuid
import json
from supabase import create_client, Client
from config import settings

_client: Client | None = None
# In-memory timeline cache — primary store (Supabase is best-effort backup)
_timeline_cache: dict[str, dict] = {}


def _sb() -> Client:
    global _client
    if _client is None:
        _client = create_client(settings.supabase_url, settings.supabase_service_key)
    return _client


TRANSITION_POOL = [
    "fade",
    "cut",
    "slide_left",
    "slide_up",
    "dissolve",
]


def build_timeline(
    brand_id: str,
    variant_id: str,
    scene_matches: list[dict],
    hook: str = "",
    cta: str = "",
    resolution: str = "9:16",
) -> dict:
    """
    Build a timeline dict from scene-asset matches.
    Each clip entry has: asset_url, start_ms, end_ms, text_overlay, transition.
    """
    timeline_id = str(uuid.uuid4())
    clips = []
    cursor_ms = 0

    for i, match in enumerate(scene_matches):
        duration_s = 5  # default; ideally comes from the scene plan
        duration_ms = duration_s * 1000

        text_overlay = ""
        if i == 0 and hook:
            text_overlay = hook
        elif i == len(scene_matches) - 1 and cta:
            text_overlay = cta

        clip = {
            "clip_index": i,
            "asset_id": match.get("asset_id"),
            "asset_url": match.get("asset_url", ""),
            "start_ms": cursor_ms,
            "end_ms": cursor_ms + duration_ms,
            "text_overlay": text_overlay,
            "transition": TRANSITION_POOL[i % len(TRANSITION_POOL)],
            "scene_title": match.get("scene_title", f"Scene {i + 1}"),
            "generated": match.get("generated", False),
        }
        clips.append(clip)
        cursor_ms += duration_ms

    total_duration_ms = cursor_ms
    timeline = {
        "id": timeline_id,
        "brand_id": brand_id,
        "variant_id": variant_id,
        "resolution": resolution,
        "total_duration_ms": total_duration_ms,
        "clips": clips,
    }

    # Cache in-memory (always works, even without Supabase timelines table)
    _timeline_cache[timeline_id] = timeline

    # Best-effort persist to Supabase (table may not exist yet)
    try:
        _sb().table("timelines").insert({
            "id": timeline_id,
            "brand_id": brand_id,
            "variant_id": variant_id,
            "resolution": resolution,
            "total_duration_ms": total_duration_ms,
            "timeline_json": json.dumps(timeline),
        }).execute()
    except Exception:
        pass

    return timeline


def get_timeline(timeline_id: str) -> dict | None:
    """Retrieve a saved timeline by ID. In-memory cache first, Supabase fallback."""
    # 1. In-memory (fast, always available within the same process lifetime)
    if timeline_id in _timeline_cache:
        return _timeline_cache[timeline_id]

    # 2. Supabase fallback (for cross-restart scenarios)
    try:
        result = (
            _sb()
            .table("timelines")
            .select("timeline_json")
            .eq("id", timeline_id)
            .maybe_single()
            .execute()
        )
        if result and result.data:
            raw = result.data.get("timeline_json")
            parsed = json.loads(raw) if isinstance(raw, str) else raw
            if parsed:
                _timeline_cache[timeline_id] = parsed
                return parsed
    except Exception:
        pass

    return None
    return None
