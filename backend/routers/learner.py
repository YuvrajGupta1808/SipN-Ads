"""Learner router — POST /learner/log-export, POST /learner/sync-templates, GET /learner/templates"""

import asyncio
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.learner import log_export, get_recent_exports
from agents.memory_updater import run_memory_updater
from services.template_builder import sync_templates_for_brand, list_templates, get_template

router = APIRouter(prefix="/learner", tags=["learner"])


class LogExportRequest(BaseModel):
    brand_id: str
    job_id: str
    variant_id: str = ""
    critique_scores: dict = {}
    fixes_applied: list[str] = []
    hook_text: str = ""
    cta_text: str = ""


@router.post("/log-export")
async def log_and_learn(req: LogExportRequest):
    """
    Log a completed ad export, run the memory updater to extract learnings,
    and if the ad scored >= 8.5, save it as a brand template.
    """
    # 1. Log the export
    export_record = log_export(
        brand_id=req.brand_id,
        job_id=req.job_id,
        variant_id=req.variant_id,
        critique_scores=req.critique_scores,
        fixes_applied=req.fixes_applied,
        hook_text=req.hook_text,
        cta_text=req.cta_text,
    )

    # 2. Update brand memory with new learnings (background-compatible)
    loop = asyncio.get_event_loop()
    new_learnings = await loop.run_in_executor(
        None, run_memory_updater, req.brand_id
    )

    # 3. Sync high-scoring exports to templates
    overall = export_record.get("overall_score", 0)
    templates_created = []
    if overall >= 8.5:
        templates_created = await loop.run_in_executor(
            None, sync_templates_for_brand, req.brand_id, 8.5
        )

    return {
        "success": True,
        "export": export_record,
        "new_learnings": new_learnings,
        "templates_created": len(templates_created),
    }


@router.get("/exports/{brand_id}")
async def get_exports(brand_id: str, limit: int = 20):
    """List recent export records for a brand."""
    exports = get_recent_exports(brand_id, limit=limit)
    return {"exports": exports}


@router.get("/templates/{brand_id}")
async def get_templates(brand_id: str):
    """List all saved templates for a brand."""
    templates = list_templates(brand_id)
    return {"templates": templates}


@router.get("/template/{template_id}")
async def get_template_by_id(template_id: str):
    """Get a full template including its timeline."""
    template = get_template(template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    return template
