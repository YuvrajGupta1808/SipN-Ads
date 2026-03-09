"""
Template Builder — saves high-scoring ads (overall_score >= 8.5) as reusable
brand templates. Templates are stored in Supabase (ad_templates table) and
can be used to pre-fill the story planner for future campaigns.
"""

import json
import uuid
from supabase import create_client, Client
from config import settings
from services.learner import get_high_scoring_exports
from services.compositor import get_timeline

_client: Client | None = None


def _sb() -> Client:
    global _client
    if _client is None:
        _client = create_client(settings.supabase_url, settings.supabase_service_key)
    return _client


def build_template_from_export(export_record: dict) -> dict | None:
    """
    Given an export record, fetch the timeline and save it as a brand template.
    Returns the saved template record, or None if it fails.
    """
    brand_id = export_record.get("brand_id", "")
    job_id = export_record.get("job_id", "")
    variant_id = export_record.get("variant_id", "")

    # Try to get the timeline for this render job
    timeline = get_timeline(variant_id) or get_timeline(job_id)
    if not timeline:
        return None

    template = {
        "id": str(uuid.uuid4()),
        "brand_id": brand_id,
        "source_job_id": job_id,
        "source_variant_id": variant_id,
        "overall_score": export_record.get("overall_score", 0),
        "cta_clarity_score": export_record.get("cta_clarity_score", 0),
        "hook_strength_score": export_record.get("hook_strength_score", 0),
        "brand_compliance_score": export_record.get("brand_compliance_score", 0),
        "hook_text": export_record.get("hook_text", ""),
        "cta_text": export_record.get("cta_text", ""),
        "timeline_json": json.dumps(timeline),
        "resolution": timeline.get("resolution", "9:16"),
        "total_duration_ms": timeline.get("total_duration_ms", 0),
    }

    try:
        result = _sb().table("ad_templates").insert(template).execute()
        return result.data[0] if result.data else template
    except Exception:
        return template


def sync_templates_for_brand(brand_id: str, min_score: float = 8.5) -> list[dict]:
    """
    Find all high-scoring exports for a brand that don't yet have a template,
    and create templates for them.
    """
    high_scoring = get_high_scoring_exports(brand_id, min_score=min_score)
    created: list[dict] = []
    for export in high_scoring:
        template = build_template_from_export(export)
        if template:
            created.append(template)
    return created


def list_templates(brand_id: str) -> list[dict]:
    """List all templates for a brand."""
    try:
        result = (
            _sb()
            .table("ad_templates")
            .select("id, brand_id, overall_score, hook_text, cta_text, resolution, total_duration_ms, created_at")
            .eq("brand_id", brand_id)
            .order("overall_score", desc=True)
            .execute()
        )
        return result.data or []
    except Exception:
        return []


def get_template(template_id: str) -> dict | None:
    """Get a full template by ID (including timeline_json)."""
    try:
        result = (
            _sb()
            .table("ad_templates")
            .select("*")
            .eq("id", template_id)
            .single()
            .execute()
        )
        return result.data
    except Exception:
        return None
