"""Brand onboarding router — POST /brand/onboard, GET /brand/list, GET /brand/{id}"""

import uuid
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import JSONResponse
from typing import Optional

from services.storage import upload_file
from services.brand_memory import get_brand, list_brands
from agents.brand_builder import run_brand_builder

router = APIRouter(prefix="/brand", tags=["brand"])


@router.post("/onboard")
async def onboard_brand(
    name: str = Form(...),
    tone: str = Form(...),
    color: str = Form(default="#f97316"),
    tagline: str = Form(default=""),
    description: str = Form(default=""),
    platforms: str = Form(default=""),          # comma-separated
    logo: Optional[UploadFile] = File(default=None),
    product_images: list[UploadFile] = File(default=[]),
):
    """
    Accept brand kit fields + file uploads.
    Uploads assets to Supabase Storage, runs the brand builder agent,
    and returns the saved brand profile.
    """
    brand_id = str(uuid.uuid4())

    # Upload logo
    logo_url = ""
    if logo and logo.filename:
        logo_bytes = await logo.read()
        logo_url = upload_file(logo_bytes, logo.filename, bucket="assets")

    # Upload product images
    product_image_urls: list[str] = []
    for img in product_images:
        if img and img.filename:
            img_bytes = await img.read()
            url = upload_file(img_bytes, img.filename, bucket="assets")
            product_image_urls.append(url)

    platform_list = [p.strip() for p in platforms.split(",") if p.strip()]

    brand_data = {
        "id": brand_id,
        "name": name,
        "tone": tone,
        "color": color,
        "tagline": tagline,
        "description": description,
        "logo_url": logo_url,
        "product_image_urls": product_image_urls,
        "platforms": platform_list,
    }

    try:
        saved = run_brand_builder(brand_data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Brand builder failed: {e}")

    return JSONResponse(content={"success": True, "brand": saved})


@router.get("/list")
async def get_brands():
    """Return all saved brand profiles (lightweight)."""
    brands = list_brands()
    return {"brands": brands}


@router.get("/{brand_id}")
async def get_brand_by_id(brand_id: str):
    brand = get_brand(brand_id)
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")
    return brand
