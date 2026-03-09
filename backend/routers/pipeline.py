"""
Pipeline router — POST /pipeline/run

Full pipeline after user selects a variant:
  1. Build a cinematic OpenAI Sora text-to-video prompt from story plan + brand
  2. Asset selection (pgvector match per scene) — for thumbnail/preview only
  3. Compositor timeline (used for MCP widget scene display)
  4. Submit Sora video generation task as a background job
  5. Return job_id for the frontend to poll
"""

import asyncio
import base64
from fastapi import APIRouter, BackgroundTasks
from pydantic import BaseModel

from agents.asset_selector import run_asset_selector
from agents.diffusion_generator import generate_brand_reference_image
from services.compositor import build_timeline, get_timeline
from services.renderer import (
    create_job,
    render_video,
    get_job,
    update_job,
    VIDEO_DIR,
)
from services import brand_memory
from config import settings

router = APIRouter(prefix="/pipeline", tags=["pipeline"])


# ---------------------------------------------------------------------------
# Video prompt builder — pure template for OpenAI Sora (no Gemini dependency)
# ---------------------------------------------------------------------------

def _build_sora_prompt(
    brand_profile: dict,
    variant: dict,
    platform: str = "TikTok",
) -> str:
    """Build a high-quality OpenAI Sora prompt without external LLM calls."""
    brand_name = brand_profile.get("name", "Brand")
    tone = variant.get("tone", brand_profile.get("tone", "bold"))
    style = variant.get("style", "")
    hook = variant.get("hook", "")
    cta = variant.get("cta", "")
    scenes = variant.get("scenes", [])
    scene_descriptions = "; ".join(
        s.get("description", "") for s in scenes[:4] if s.get("description")
    )

    return (
        f"A cinematic short-form {platform} video ad for {brand_name}. "
        f"Tone: {tone}. Visual style: {style or 'high-contrast, kinetic lifestyle footage with crisp product macro shots'}. "
        f"Opens with: {hook or 'a bold, pattern-interrupt moment in the first 2 seconds that stops the scroll'}. "
        f"Scenes: {scene_descriptions or 'fast-cut lifestyle shots that clearly show the product in use and social proof moments'}. "
        f"Closes with CTA: {cta or 'on-screen text and VO with a clear, urgent call-to-action'}. "
        "Camera motion is smooth and confident with a mix of handheld energy and subtle push-ins, "
        "natural yet stylised lighting, and a cohesive color grade tuned for vertical short-form feeds."
    )


class PipelineRequest(BaseModel):
    brand_id: str
    variant_id: str
    variant_label: str = "Variant A"
    tone: str = "bold"
    style: str = ""
    hook: str = ""
    cta: str = ""
    scenes: list[dict]
    resolution: str = "9:16"
    platform: str = "TikTok"
    use_ai_prompt: bool = True


class RemixRequest(BaseModel):
    brand_id: str
    job_id: str
    remix_prompt: str


@router.post("/run")
async def run_pipeline(req: PipelineRequest, background_tasks: BackgroundTasks):
    """
    Full pipeline: scenes → Veo 3.1 prompt → asset preview → render job.
    Returns immediately with job_id.
    """
    loop = asyncio.get_event_loop()

    # 1. Load brand profile
    brand_profile: dict = {}
    if req.brand_id:
        brand_profile = brand_memory.get_brand(req.brand_id) or {}

    variant_dict = {
        "tone": req.tone,
        "style": req.style,
        "hook": req.hook,
        "cta": req.cta,
        "scenes": req.scenes,
    }

    # 2. Build Sora cinematic prompt
    video_prompt = await loop.run_in_executor(
        None, _build_sora_prompt, brand_profile, variant_dict, req.platform
    ) if req.use_ai_prompt else (
        f"Cinematic {req.tone} ad for {brand_profile.get('name', 'Brand')} on {req.platform}. "
        f"Hook: {req.hook}. CTA: {req.cta}."
    )

    # 3. Asset selection for scene previews (best-effort)
    scene_matches = []
    try:
        scene_matches = await loop.run_in_executor(
            None, run_asset_selector, req.brand_id, req.variant_id, req.scenes
        )
    except Exception:
        scene_matches = [
            {
                "scene_number": s.get("scene_number", i + 1),
                "scene_title": s.get("title", f"Scene {i + 1}"),
                "scene_description": s.get("description", ""),
                "asset_id": None,
                "asset_url": "",
                "asset_tags": [],
                "match_score": 0.0,
                "needs_generation": False,
                "generation_prompt": "",
            }
            for i, s in enumerate(req.scenes)
        ]

    # 4. Build compositor timeline (scene display in widget)
    timeline = await loop.run_in_executor(
        None,
        build_timeline,
        req.brand_id,
        req.variant_id,
        scene_matches,
        req.hook,
        req.cta,
        req.resolution,
    )

    # 5. Create render job with the Veo 3.1 prompt (and pre-declared reference image name)
    job_id = create_job(req.brand_id, timeline["id"], req.resolution, video_prompt)

    # 6. Generate a Gemini Nano Banana reference image for Sora / Veo.
    #    This is an opening-frame thumbnail that we both:
    #      - persist to disk under VIDEO_DIR / reference_image_name
    #      - store as base64 on the job so Sora can use it as image_reference.
    # Build a rich, opening-frame-specific Nano Banana image prompt – we attach
    # this to the job even if image generation fails so the UI can always show
    # the exact text that was used.
    job_meta = get_job(job_id) or {}
    ref_name = job_meta.get("reference_image_name")

    brand_name = brand_profile.get("name", "Brand")
    first_scene = (req.scenes[0] if req.scenes else {}) or {}
    first_scene_desc = first_scene.get("description") or first_scene.get("title") or ""
    image_prompt = (
        "Opening hero frame for this vertical video ad.\n\n"
        f"Brand: {brand_name} | Platform: {req.platform} | Tone: {req.tone}\n"
        f"Visual style: {req.style or 'high-contrast, kinetic lifestyle footage with crisp product macro shots'}\n"
        f"Hook moment: {req.hook or 'attention-grabbing expression or action in the first 2 seconds'}\n"
        f"Scene context: {first_scene_desc or 'athletes in motion, product clearly visible in frame'}\n\n"
        "The frame should feel like the FIRST second of the story, not a logo slate. "
        "Cinematic lighting, shallow depth of field, no on-screen text, no UI overlays."
    )

    # Persist the prompt text regardless of whether the image call succeeds.
    update_job(job_id, reference_image_prompt=image_prompt)

    # 7. Kick off Sora generation in background
    background_tasks.add_task(render_video, job_id, timeline)

    job = get_job(job_id) or {}
    ref_b64 = job.get("reference_image_b64")

    return {
        "job_id": job_id,
        "timeline_id": timeline["id"],
        "video_prompt": video_prompt,
        "clip_count": len(timeline["clips"]),
        "total_duration_s": timeline["total_duration_ms"] // 1000,
        "resolution": req.resolution,
        "reference_image_name": job.get("reference_image_name"),
        "reference_image_prompt": job.get("reference_image_prompt"),
        # Inline data URL so the frontend can show the actual image in chat
        "reference_image_data_url": f"data:image/png;base64,{ref_b64}" if ref_b64 else None,
        "status": "rendering",
    }


@router.post("/remix")
async def remix_pipeline(req: RemixRequest, background_tasks: BackgroundTasks):
    """
    Remix an existing timeline with a new Sora prompt.
    Reuses the original timeline_id so pacing and structure stay the same.
    """
    original_job = get_job(req.job_id) or {}
    timeline_id = original_job.get("timeline_id")
    resolution = original_job.get("resolution", "9:16")

    if not timeline_id:
        return {
            "error": "timeline_not_found",
            "message": "Original render job has no timeline_id; generate a new ad first.",
        }

    timeline = get_timeline(timeline_id)
    if not timeline:
        return {
            "error": "timeline_not_found",
            "message": "Timeline not found. Please generate a new ad before remixing.",
        }

    brand_id = req.brand_id or original_job.get("brand_id") or ""
    job_id = create_job(brand_id, timeline_id, resolution, req.remix_prompt)

    # Mark this job as a remix so the renderer can choose the demo
    # fallback clip (video2.mp4) if Sora times out.
    update_job(job_id, video_prompt=req.remix_prompt, is_remix=True)

    background_tasks.add_task(render_video, job_id, timeline)

    return {
        "job_id": job_id,
        "timeline_id": timeline_id,
        "video_prompt": req.remix_prompt,
        "clip_count": len(timeline.get("clips", [])),
        "total_duration_s": timeline.get("total_duration_ms", 0) // 1000,
        "resolution": resolution,
        "status": "rendering",
    }
