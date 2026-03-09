"""
Simple Supabase seeding script for local/dev:

- Creates a demo brand in `brand_profiles`
- Adds a couple of demo assets for that brand
- Inserts a few `ad_exports` rows (both good and bad runs)
  so the learner + memory_updater have something to work with.

Usage (from backend/ directory, with backend/.env configured):

  source venv/bin/activate
  python seed_fake_data.py
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timedelta, timezone

from supabase import create_client, Client

from config import settings
from services.brand_memory import upsert_brand


def _sb() -> Client:
  return create_client(settings.supabase_url, settings.supabase_service_key)


def seed_brand() -> str:
  """Create or update a realistic sample brand_profile and return its id."""
  brand_id = "golden-hour-coffee"
  profile = {
    "name": "Golden Hour Coffee Co.",
    "tone": "warm, confident, creator-friendly",
    "color": "#c05621",
    "tagline": "Your 3pm creative reset.",
    "description": (
      "A specialty coffee brand for founders, designers and creators who work late and film a lot of content. "
      "They care about ritual, aesthetics and feeling sharp on camera without the jitters."
    ),
    "logo_url": "",
    "product_image_urls": [],
    "platforms": ["TikTok", "Instagram", "YouTube Shorts"],
    "brand_rules": [
      "Always show a recognisable Golden Hour mug or bag in the first 3 seconds.",
      "Keep pacing calm but intentional — no chaotic jump-cuts.",
      "Use on-screen text that sounds like how creators talk, not corporate copy.",
    ],
    "constraints": [
      "No medical or exaggerated health claims.",
      "Do not show under-18s drinking coffee.",
      "Avoid messy desks or dirty mugs that make the brand feel low-quality.",
    ],
    "learnings": [],
  }
  upsert_brand(brand_id, profile)
  return brand_id


def seed_assets(brand_id: str) -> None:
  """Insert a couple of simple demo assets."""
  sb = _sb()
  assets = [
    {
      "id": str(uuid.uuid4()),
      "brand_id": brand_id,
      "url": "https://images.unsplash.com/photo-1556740749-887f6717d7e4",
      "filename": "creator_desk.jpg",
      "tags": json.dumps(["creator desk", "laptop", "late night"]),
    },
    {
      "id": str(uuid.uuid4()),
      "brand_id": brand_id,
      "url": "https://images.unsplash.com/photo-1514996937319-344454492b37",
      "filename": "running_city.jpg",
      "tags": json.dumps(["running", "city", "motion"]),
    },
  ]
  for asset in assets:
    try:
      sb.table("assets").upsert(asset).execute()
    except Exception:
      # Best-effort; keep seeding even if one insert fails
      continue


def seed_exports(brand_id: str) -> None:
  """Insert a few ad_exports rows with varying scores."""
  sb = _sb()
  base_time = datetime.now(timezone.utc) - timedelta(days=1)

  rows = []
  for i, (cta, hook, brand_score) in enumerate(
    [
      (9.0, 9.5, 9.2),  # strong winner
      (7.0, 6.5, 7.2),  # decent but not amazing
      (4.5, 5.0, 4.0),  # weak / learning-from-failure
    ]
  ):
    job_id = f"demo-job-{i+1}"
    overall = (cta + hook + brand_score) / 3.0
    rows.append(
      {
        "id": str(uuid.uuid4()),
        "brand_id": brand_id,
        "job_id": job_id,
        "variant_id": f"variant-{i+1}",
        "cta_clarity_score": cta,
        "hook_strength_score": hook,
        "brand_compliance_score": brand_score,
        "overall_score": overall,
        "fixes_applied": json.dumps(
          ["hook_strength"] if overall < 7.0 else []
        ),
        "hook_text": f"Hook example #{i+1}",
        "cta_text": f"CTA example #{i+1}",
        "created_at": base_time + timedelta(minutes=10 * i),
      }
    )

  for row in rows:
    try:
      sb.table("ad_exports").upsert(row).execute()
    except Exception:
      continue


def main() -> None:
  print("Seeding demo data into Supabase…")
  brand_id = seed_brand()
  print(f"✓ Brand seeded: {brand_id}")
  seed_assets(brand_id)
  print("✓ Assets seeded")
  seed_exports(brand_id)
  print("✓ ad_exports seeded (good + bad runs)")
  print("Done. You can now open Brand Memory and learner views for demo data.")


if __name__ == "__main__":
  main()

