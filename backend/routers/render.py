"""Render router — POST /render/preview, GET /render/status/{id}, GET /render/download/{id}, GET /render/video/{id}"""

import pathlib
from fastapi import APIRouter, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse
from pydantic import BaseModel

from services.renderer import create_job, get_job, render_video, VIDEO_DIR
from services.compositor import get_timeline

router = APIRouter(prefix="/render", tags=["render"])


class RenderRequest(BaseModel):
    brand_id: str
    timeline_id: str
    resolution: str = "9:16"


@router.post("/preview")
async def start_render(req: RenderRequest, background_tasks: BackgroundTasks):
    """Start an async render job. Returns job_id immediately."""
    timeline = get_timeline(req.timeline_id)
    if not timeline:
        raise HTTPException(status_code=404, detail=f"Timeline {req.timeline_id} not found")

    job_id = create_job(req.brand_id, req.timeline_id, req.resolution)

    # Kick off render in the background
    background_tasks.add_task(render_video, job_id, timeline)

    return {"job_id": job_id, "status": "pending"}


@router.get("/status/{job_id}")
async def render_status(job_id: str):
    """Poll render job status and progress."""
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.get("/download/{job_id}")
async def render_download(job_id: str):
    """Return the final video URL for a completed render job."""
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job["status"] != "done":
        raise HTTPException(status_code=202, detail=f"Render not complete: {job['status']}")
    return {"url": job["video_url"], "job_id": job_id}


@router.get("/video/{job_id}")
async def serve_video(job_id: str):
    """Directly stream the generated MP4 file (fallback when Supabase is unavailable)."""
    video_path = VIDEO_DIR / f"{job_id}.mp4"
    if not video_path.exists():
        raise HTTPException(status_code=404, detail="Video file not found")
    return FileResponse(
        path=str(video_path),
        media_type="video/mp4",
        filename=f"sipnads_{job_id}.mp4",
        headers={"Accept-Ranges": "bytes"},
    )
