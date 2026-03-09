"""
Brand memory store backed by Supabase Postgres (brand_profiles table).
Provides get / upsert helpers used by agents and routers.
"""

import json
from supabase import create_client, Client
from config import settings

_client: Client | None = None


def _sb() -> Client:
    global _client
    if _client is None:
        # Service role key bypasses RLS — correct for a backend-only service
        _client = create_client(settings.supabase_url, settings.supabase_service_key)
    return _client


def upsert_brand(brand_id: str, profile: dict) -> dict:
    """Insert or update a brand profile row and return the saved record."""
    payload = {
        "id": brand_id,
        "name": profile.get("name"),
        "tone": profile.get("tone"),
        "color": profile.get("color"),
        "tagline": profile.get("tagline"),
        "description": profile.get("description"),
        "logo_url": profile.get("logo_url"),
        "product_image_urls": profile.get("product_image_urls", []),
        "platforms": profile.get("platforms", []),
        "brand_rules": json.dumps(profile.get("brand_rules", [])),
        "constraints": json.dumps(profile.get("constraints", [])),
        "learnings": json.dumps(profile.get("learnings", [])),
    }
    result = _sb().table("brand_profiles").upsert(payload).execute()
    return result.data[0] if result.data else payload


def get_brand(brand_id: str) -> dict | None:
    """Fetch a brand profile by ID. Returns None if not found."""
    result = (
        _sb().table("brand_profiles").select("*").eq("id", brand_id).maybe_single().execute()
    )
    return result.data if result else None


def list_brands() -> list[dict]:
    """Return all saved brand profiles (lightweight list)."""
    result = (
        _sb()
        .table("brand_profiles")
        .select("id, name, tone, color, tagline")
        .order("created_at", desc=True)
        .execute()
    )
    return result.data or []


def update_brand_learnings(brand_id: str, new_learnings: list[str]) -> None:
    """Append new learnings to an existing brand profile."""
    existing = get_brand(brand_id)
    if not existing:
        return
    current = json.loads(existing.get("learnings") or "[]")
    merged = current + new_learnings
    (
        _sb()
        .table("brand_profiles")
        .update({"learnings": json.dumps(merged)})
        .eq("id", brand_id)
        .execute()
    )
