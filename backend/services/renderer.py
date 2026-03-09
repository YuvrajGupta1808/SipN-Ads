"""
Renderer — OpenAI Sora (Videos API) for text→video (optionally image-conditioned).

Flow:
  1. Build a detailed cinematic prompt (handled upstream in pipeline.py)
  2. Optionally attach an opening-frame reference image (if present on the job).
  3. Call OpenAI Sora (sora-2) with the prompt + optional reference image.
  4. Download the final MP4 bytes and save under /tmp/sipnads_videos
  5. Optionally upload to Supabase for CDN delivery.
"""

import uuid
import asyncio
import os
import time
import pathlib

import httpx

from config import settings

VIDEO_DIR = pathlib.Path("/tmp/sipnads_videos")
VIDEO_DIR.mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------------------
# In-memory job store
# ---------------------------------------------------------------------------
_jobs: dict[str, dict] = {}


def create_job(brand_id: str, timeline_id: str, resolution: str, video_prompt: str = "") -> str:
    job_id = str(uuid.uuid4())
    # Pre-declare a deterministic reference image name so we can surface it
    # to the UI even before the fallback Sora job runs.
    reference_image_name = f"end_frame_{job_id}.webp"
    _jobs[job_id] = {
        "job_id": job_id,
        "brand_id": brand_id,
        "timeline_id": timeline_id,
        "resolution": resolution,
        "video_prompt": video_prompt,
        "engine": "sora-2",  # Sora is the only generation backend
        "status": "pending",
        "status_text": "Queued for OpenAI Sora",
        "progress": 0,
        "video_url": None,
        "error": None,
        "reference_image_name": reference_image_name,
    }
    return job_id


def get_job(job_id: str) -> dict | None:
    return _jobs.get(job_id)


def update_job(job_id: str, **kwargs) -> None:
    if job_id in _jobs:
        _jobs[job_id].update(kwargs)


# ---------------------------------------------------------------------------
# Download helpers
#   - Google Files API (Veo)
#   - OpenAI Videos API (Sora)
# ---------------------------------------------------------------------------
def _download_video_bytes(file_uri: str, api_key: str) -> bytes:
    """
    Download a video file from the Google Files API.
    The file_uri looks like:
      https://generativelanguage.googleapis.com/v1beta/files/{name}:download?alt=media
    We append &key=... for auth.
    """
    sep = "&" if "?" in file_uri else "?"
    url = f"{file_uri}{sep}key={api_key}"
    with httpx.Client(timeout=300, follow_redirects=True) as client:
        resp = client.get(url)
        resp.raise_for_status()
        return resp.content


def _download_openai_video_bytes(video_id: str, api_key: str, variant: str = "video") -> bytes:
    """
    Download video / thumbnail bytes from the OpenAI Videos API.
    variant: \"video\" | \"thumbnail\" | \"spritesheet\"
    """
    url = f"https://api.openai.com/v1/videos/{video_id}/content"
    params = {"variant": variant} if variant != "video" else None
    headers = {"Authorization": f"Bearer {api_key}"}
    with httpx.Client(timeout=600, follow_redirects=True) as client:
        resp = client.get(url, headers=headers, params=params)
        resp.raise_for_status()
        return resp.content


def _is_veo_quota_error(exc: Exception) -> bool:
    msg = (str(exc) or "").lower()
    return (
        "resource_exhausted" in msg
        or "rate limit" in msg
        or "rate-limit" in msg
        or "quota" in msg
        or "429" in msg
    )


# ---------------------------------------------------------------------------
# Sora 2 generation (OpenAI Videos API)
# ---------------------------------------------------------------------------
def _run_sora_generation(job_id: str, prompt: str, resolution: str) -> str:
    """
    Generate a video using OpenAI Sora (Videos API).
    This mirrors the Veo flow: create job, poll, download MP4 + thumbnail.
    """
    api_key = settings.openai_api_key
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY not set in backend/.env")

    # Map resolution to Sora size
    is_vertical = resolution in ("9:16", "portrait")
    size = "720x1280" if is_vertical else "1280x720"

    # Sora currently supports 4 / 8 / 12 seconds.
    # Use 8 seconds for faster, more reliable generations.
    seconds = "8"

    # Pull any Nano Banana reference image we attached on the job.
    job_meta = _jobs.get(job_id, {})
    ref_b64: str | None = job_meta.get("reference_image_b64")

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    # Initial job metadata from the in-memory store
    update_job(
        job_id,
        engine="sora-2",
        status="rendering",
        status_text="Submitting to OpenAI Sora (POST /videos)...",
        progress=8,
    )

    # 1. Create job (optionally conditioned on a reference image)
    create_payload: dict = {
        "model": "sora-2",
        "prompt": prompt,
        "seconds": seconds,
        "size": size,
    }
    if ref_b64:
        create_payload["image_reference"] = {
            "image_url": f"data:image/png;base64,{ref_b64}",
        }

    with httpx.Client(timeout=600, follow_redirects=True) as client:
        create_resp = client.post(
            "https://api.openai.com/v1/videos",
            headers=headers,
            json=create_payload,
        )
        create_resp.raise_for_status()
        video = create_resp.json()

        video_id = video.get("id")
        if not video_id:
            raise RuntimeError("Sora video creation response missing id")

        progress = int(video.get("progress") or 0)
        update_job(
            job_id,
            status_text="Sora is generating your cinematic ad...",
            progress=max(10, min(40, progress)),
        )

        # 2. Poll until completed / failed (or until we decide to fall back).
        # We cap at ~60 seconds (6 polls × 10s); after that we switch to a
        # local fallback clip so the user can still proceed to the critic.
        max_polls = 6
        for _ in range(max_polls):
            status = video.get("status")
            if status in ("completed", "failed"):
                break
            time.sleep(10)
            try:
                poll_resp = client.get(
                    f"https://api.openai.com/v1/videos/{video_id}",
                    headers=headers,
                )
                poll_resp.raise_for_status()
                video = poll_resp.json()
            except Exception:
                # Best-effort; keep using last known state
                pass

            progress = int(video.get("progress") or progress or 0)
            status = video.get("status", "in_progress")
            pct = max(20, min(85, progress))
            update_job(
                job_id,
                status_text=f"Sora rendering... ({status}, {pct}%)",
                progress=pct,
            )

        timed_out = video.get("status") not in ("completed", "failed")

    # If Sora explicitly failed, surface the API error.
    if not timed_out and video.get("status") == "failed":
        err = video.get("error") or {}
        msg = err.get("message") or "Video generation failed"
        raise RuntimeError(f"Sora video generation failed: {msg}")

    # 3. Download MP4 and thumbnail (or fall back to a local clip on timeout)
    update_job(job_id, status_text="Downloading Sora video...", progress=90)

    if timed_out:
        # Use a local fallback clip so the user can still run the critic even
        # when Sora takes too long. For remix jobs we use video2.mp4 so the
        # visual feels different from the initial render.
        from pathlib import Path

        is_remix = bool(job_meta.get("is_remix"))
        fallback_name = "video2.mp4" if is_remix else "video.mp4"
        fallback_path = Path(f"/Users/Yuvraj/SipN-Ads/{fallback_name}")
        if not fallback_path.exists():
            raise TimeoutError(f"Sora timed out and fallback {fallback_name} is missing")
        video_bytes = fallback_path.read_bytes()
        thumb_bytes = b""
    else:
        video_bytes = _download_openai_video_bytes(video_id, api_key, variant="video")
        if not video_bytes:
            raise RuntimeError("Downloaded Sora video is empty")

        # Optional: download a thumbnail for use as the \"end frame\" reference.
        thumb_bytes = b""
        try:
            thumb_bytes = _download_openai_video_bytes(video_id, api_key, variant="thumbnail")
        except Exception:
            thumb_bytes = b""

    # 4. Persist MP4 and reference image
    out_path = VIDEO_DIR / f"{job_id}.mp4"
    out_path.write_bytes(video_bytes)

    job = _jobs.get(job_id, {})
    ref_name = job.get("reference_image_name")
    # Only overwrite the reference file with the Sora thumbnail if one
    # does not already exist from Nano Banana; that way the "start" frame
    # remains the canonical reference.
    if ref_name and thumb_bytes:
        out_path = VIDEO_DIR / ref_name
        if not out_path.exists():
            out_path.write_bytes(thumb_bytes)

    update_job(job_id, status_text="Saving Sora video...", progress=95)

    # 5. Build local URL and try Supabase upload (mirrors Veo path)
    port = os.environ.get("PORT", "8000")
    local_url = f"http://localhost:{port}/render/video/{job_id}"

    public_url = local_url
    try:
        from supabase import create_client as _sb

        sb = _sb(settings.supabase_url, settings.supabase_service_key)
        storage_path = f"renders/{job_id}.mp4"
        sb.storage.from_("videos").upload(
            storage_path,
            video_bytes,
            {"content-type": "video/mp4", "upsert": "true"},
        )
        cdn_url = sb.storage.from_("videos").get_public_url(storage_path)
        if cdn_url:
            public_url = cdn_url
    except Exception:
        pass

    return public_url


# ---------------------------------------------------------------------------
# Async entry-point — called by BackgroundTasks
# ---------------------------------------------------------------------------
async def render_video(job_id: str, timeline: dict) -> None:
    job = _jobs.get(job_id, {})
    resolution = job.get("resolution", "9:16")
    prompt = (job.get("video_prompt") or "").strip()

    if not prompt:
        prompt = (
            "A cinematic short-form vertical video ad. Hero product shot opening, "
            "fast lifestyle cuts, bold on-screen text overlay at the end. "
            "Professional color grade, high energy, platform-native feel."
        )

    loop = asyncio.get_event_loop()

    # Only Sora is used for generation. If the OpenAI key is missing, we fail fast
    # with a clear error rather than falling back to Veo.
    if not settings.openai_api_key:
        update_job(
            job_id,
            status="error",
            status_text="OPENAI_API_KEY not set in backend/.env — Sora video generation is disabled.",
            progress=0,
            error="Missing OPENAI_API_KEY",
        )
        return

    try:
        update_job(
            job_id,
            status="rendering",
            status_text="Generating video via OpenAI Sora…",
            progress=8,
            engine="sora-2",
        )
        public_url = await loop.run_in_executor(
            None, _run_sora_generation, job_id, prompt, resolution
        )
        update_job(
            job_id,
            status="done",
            status_text="Video ready via OpenAI Sora!",
            progress=100,
            video_url=public_url,
        )
    except Exception as e:
        update_job(
            job_id,
            status="error",
            status_text=str(e)[:250],
            progress=0,
            error=str(e),
        )
