"""
Diffusion generator — uses Google Nano Banana (gemini-2.5-flash-image)
to generate scene thumbnail images for the Studio panel.

Nano Banana 2 (gemini-2.5-flash-image) is optimised for speed + volume.
Generated images include a SynthID watermark automatically.
"""

import base64
import io
from typing import Optional

from google import genai
from google.genai import types

from config import settings

def _get_client() -> genai.Client:
    """Fresh client each call — httpx internals are not thread-safe for reuse."""
    return genai.Client(api_key=settings.gemini_api_key)


def generate_scene_thumbnail(
    scene_description: str,
    brand_tone: str = "bold",
    aspect_ratio: str = "9:16",
) -> Optional[str]:
    """
    Generate a scene thumbnail image using Nano Banana.
    Returns base64-encoded PNG, or None on failure.
    """
    if not settings.gemini_api_key or settings.gemini_api_key == "your_gemini_api_key_here":
        return None

    prompt = (
        f"A high-quality short-form video ad scene thumbnail. "
        f"Tone: {brand_tone}. "
        f"Scene: {scene_description}. "
        f"Cinematic framing, high contrast, visually striking. "
        f"No text overlay. Photo-realistic or stylised based on brand tone."
    )

    try:
        response = _get_client().models.generate_content(
            model=settings.gemini_image_model,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_modalities=["IMAGE"],
                image_config=types.ImageConfig(aspect_ratio=aspect_ratio),
            ),
        )
        for part in response.parts:
            if part.inline_data is not None:
                img_bytes = part.inline_data.data
                return base64.b64encode(img_bytes).decode("utf-8")
    except Exception:
        pass

    return None


def generate_brand_reference_image(prompt_text: str) -> Optional[str]:
    """
    Generate a brand reference image for Veo image-to-video flow.
    Returns base64-encoded PNG bytes.
    """
    if not settings.gemini_api_key or settings.gemini_api_key == "your_gemini_api_key_here":
        return None

    try:
        response = _get_client().models.generate_content(
            model=settings.gemini_image_model,
            contents=prompt_text,
            config=types.GenerateContentConfig(
                response_modalities=["IMAGE"],
                image_config=types.ImageConfig(aspect_ratio="9:16"),
            ),
        )
        for part in response.parts:
            if part.inline_data is not None:
                return base64.b64encode(part.inline_data.data).decode("utf-8")
    except Exception:
        pass

    return None
