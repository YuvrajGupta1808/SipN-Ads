"""Assets router — POST /assets/upload, GET /assets/list, POST /assets/compose"""

import uuid
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional

from services.storage import upload_file
from services.asset_tagger import tag_asset
from agents.asset_selector import run_asset_selector
from agents.diffusion_generator import generate_scene_thumbnail as generate_scene_image
from services.compositor import build_timeline, get_timeline
from supabase import create_client
from config import settings

router = APIRouter(prefix="/assets", tags=["assets"])

_sb = None


def _get_sb():
    global _sb
    if _sb is None:
        _sb = create_client(settings.supabase_url, settings.supabase_service_key)
    return _sb


# ---------------------------------------------------------------------------
# Upload
# ---------------------------------------------------------------------------

@router.post("/upload")
async def upload_asset(
    brand_id: str = Form(default=""),
    file: UploadFile = File(...),
):
    """Upload a brand asset. Tags it with LLM, stores embedding, saves to Supabase."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    asset_id = str(uuid.uuid4())
    file_bytes = await file.read()

    # Upload to Supabase Storage
    storage_path = f"{brand_id}/{asset_id}_{file.filename}" if brand_id else f"global/{asset_id}_{file.filename}"
    url = upload_file(file_bytes, storage_path, bucket="assets")

    # Tag with LLM (best-effort)
    tag_meta = {}
    try:
        tag_meta = tag_asset(file.filename, asset_id, brand_id)
    except Exception:
        pass

    # Persist asset record
    record = {
        "id": asset_id,
        "brand_id": brand_id or None,
        "filename": file.filename,
        "url": url,
        "category": tag_meta.get("category", "other"),
        "tags": tag_meta.get("tags", []),
        "description": tag_meta.get("description", file.filename),
    }
    try:
        _get_sb().table("assets").insert(record).execute()
    except Exception:
        pass  # Still return success even if DB write fails

    return JSONResponse(content={"success": True, "asset": record})


# ---------------------------------------------------------------------------
# List
# ---------------------------------------------------------------------------

@router.get("/list")
async def list_assets(brand_id: Optional[str] = None):
    """List all assets, optionally filtered by brand_id."""
    try:
        q = _get_sb().table("assets").select("*").order("created_at", desc=True)
        if brand_id:
            q = q.eq("brand_id", brand_id)
        result = q.execute()
        return {"assets": result.data or []}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# Compose — select assets for a variant and build a timeline
# ---------------------------------------------------------------------------

class ComposeRequest(BaseModel):
    brand_id: str
    variant_id: str
    scenes: list[dict]
    hook: str = ""
    cta: str = ""
    resolution: str = "9:16"


@router.post("/compose")
async def compose_timeline(req: ComposeRequest):
    """
    Select best-matching assets for each scene, generate images where needed,
    and build a compositor timeline.
    """
    # 1. Find matching assets for each scene
    scene_matches = run_asset_selector(req.brand_id, req.variant_id, req.scenes)

    # 2. Generate diffusion images for unmatched scenes
    enriched_matches = []
    for match in scene_matches:
        if match["needs_generation"] and match["generation_prompt"]:
            gen = generate_scene_image(
                match["generation_prompt"],
                req.brand_id,
                match["scene_number"],
            )
            enriched_matches.append({
                **match,
                "asset_id": gen.get("asset_id"),
                "asset_url": gen.get("url"),
                "generated": gen.get("generated", False),
            })
        else:
            enriched_matches.append(match)

    # 3. Build timeline
    timeline = build_timeline(
        brand_id=req.brand_id,
        variant_id=req.variant_id,
        scene_matches=enriched_matches,
        hook=req.hook,
        cta=req.cta,
        resolution=req.resolution,
    )

    return {"success": True, "timeline": timeline}


@router.get("/timeline/{timeline_id}")
async def get_timeline_by_id(timeline_id: str):
    timeline = get_timeline(timeline_id)
    if not timeline:
        raise HTTPException(status_code=404, detail="Timeline not found")
    return timeline
