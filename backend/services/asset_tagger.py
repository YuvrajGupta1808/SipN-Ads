"""
Asset Tagger — on upload, sends the asset to the LLM for tagging,
then stores tags + embedding in Supabase (asset_tags table).
"""

import json
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage

from config import settings
from services import embeddings as emb_service

_client: ChatOpenAI | None = None


def _get_llm() -> ChatOpenAI:
    global _client
    if _client is None:
        _client = ChatOpenAI(
            model=settings.llm_model,
            openai_api_key=settings.fireworks_api_key,
            openai_api_base=settings.fireworks_base_url,
            temperature=0.1,
        )
    return _client


TAG_SYSTEM = """You are a visual asset tagger for video ad production.
Given the filename of an uploaded asset, infer:
- category: one of [product_shot, lifestyle, logo, background, text_overlay, person, food_beverage, other]
- tags: 3-5 descriptive tags (e.g. ["close-up", "warm-lighting", "beverage"])
- description: one sentence visual description

Return ONLY valid JSON with keys "category", "tags" (list), "description". No markdown."""


def tag_asset(filename: str, asset_id: str, brand_id: str = "") -> dict:
    """
    Tag an uploaded asset by filename using the LLM.
    Returns the tag metadata and stores the embedding.
    """
    llm = _get_llm()
    messages = [
        SystemMessage(content=TAG_SYSTEM),
        HumanMessage(content=f"Asset filename: {filename}\nBrand ID: {brand_id}"),
    ]
    response = llm.invoke(messages)
    raw = response.content.strip()
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        start = raw.find("{")
        end = raw.rfind("}") + 1
        parsed = json.loads(raw[start:end]) if start != -1 else {}

    tags = parsed.get("tags", [])
    category = parsed.get("category", "other")
    description = parsed.get("description", filename)

    # Store embedding for pgvector similarity retrieval
    embed_text = f"{filename} {category} {' '.join(tags)} {description}"
    try:
        emb_service.store_asset_embedding(asset_id, brand_id, embed_text)
    except Exception:
        pass  # Best-effort

    return {
        "category": category,
        "tags": tags,
        "description": description,
    }
