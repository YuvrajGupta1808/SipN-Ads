"""
Learner service — after a user exports an ad, logs the run metadata
(critique scores, selected variant, fixes applied) to Supabase (ad_exports table).
This data feeds the memory_updater agent.
"""

import json
import uuid
from supabase import create_client, Client
from config import settings

_client: Client | None = None


def _sb() -> Client:
    global _client
    if _client is None:
        _client = create_client(settings.supabase_url, settings.supabase_service_key)
    return _client


def log_export(
    brand_id: str,
    job_id: str,
    variant_id: str,
    critique_scores: dict,
    fixes_applied: list[str],
    hook_text: str = "",
    cta_text: str = "",
) -> dict:
    """
    Record an ad export event. Returns the saved record.
    """
    record = {
        "id": str(uuid.uuid4()),
        "brand_id": brand_id,
        "job_id": job_id,
        "variant_id": variant_id,
        "cta_clarity_score": critique_scores.get("cta_clarity", 0),
        "hook_strength_score": critique_scores.get("hook_strength", 0),
        "brand_compliance_score": critique_scores.get("brand_compliance", 0),
        "overall_score": sum(critique_scores.values()) / max(len(critique_scores), 1),
        "fixes_applied": json.dumps(fixes_applied),
        "hook_text": hook_text,
        "cta_text": cta_text,
    }
    try:
        result = _sb().table("ad_exports").insert(record).execute()
        return result.data[0] if result.data else record
    except Exception:
        return record


def get_recent_exports(brand_id: str, limit: int = 20) -> list[dict]:
    """Fetch recent export records for a brand."""
    try:
        result = (
            _sb()
            .table("ad_exports")
            .select("*")
            .eq("brand_id", brand_id)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        return result.data or []
    except Exception:
        return []


def get_high_scoring_exports(brand_id: str, min_score: float = 8.5) -> list[dict]:
    """Fetch exports that scored high enough to become templates."""
    try:
        result = (
            _sb()
            .table("ad_exports")
            .select("*")
            .eq("brand_id", brand_id)
            .gte("overall_score", min_score)
            .order("overall_score", desc=True)
            .execute()
        )
        return result.data or []
    except Exception:
        return []
