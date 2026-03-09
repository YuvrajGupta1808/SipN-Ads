"""
Asset Selector Agent — LangGraph node that, for each scene in a story plan,
finds the best-matching asset via pgvector similarity search + reranking.
If no good match is found, it flags the scene for diffusion generation.
"""

import json
from typing import TypedDict

from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.graph import StateGraph, END

from config import settings
from services.embeddings import search_similar_assets


def _get_llm() -> ChatOpenAI:
    return ChatOpenAI(
        model=settings.llm_model,
        openai_api_key=settings.fireworks_api_key,
        openai_api_base=settings.fireworks_base_url,
        temperature=0.1,
    )


# ---------------------------------------------------------------------------
# State
# ---------------------------------------------------------------------------

class SceneAssetMatch(TypedDict):
    scene_number: int
    scene_title: str
    scene_description: str
    asset_id: str | None
    asset_url: str | None
    asset_tags: list[str]
    match_score: float
    needs_generation: bool
    generation_prompt: str


class AssetSelectorState(TypedDict):
    brand_id: str
    variant_id: str
    scenes: list[dict]
    matches: list[SceneAssetMatch]


# ---------------------------------------------------------------------------
# Nodes
# ---------------------------------------------------------------------------

GEN_PROMPT_SYSTEM = """You are an AI image generation prompt writer.
Given a scene description for a video ad, write a concise DALL-E 3 prompt
(max 50 words) that would generate the ideal background/hero image for that scene.
Focus on: subject, lighting, style, mood. No camera directions.
Return ONLY the prompt text — no quotes, no explanation."""


def select_assets(state: AssetSelectorState) -> AssetSelectorState:
    llm = _get_llm()
    matches: list[SceneAssetMatch] = []

    for scene in state["scenes"]:
        query = (
            f"{scene.get('description', '')} {scene.get('visual_note', '')} "
            f"{scene.get('title', '')}"
        ).strip()

        # pgvector similarity search → reranked
        candidates = search_similar_assets(query, limit=5)

        if candidates and candidates[0].get("similarity", 0) > 0.6:
            best = candidates[0]
            match: SceneAssetMatch = {
                "scene_number": scene.get("scene_number", 1),
                "scene_title": scene.get("title", ""),
                "scene_description": scene.get("description", ""),
                "asset_id": best.get("asset_id"),
                "asset_url": best.get("url"),
                "asset_tags": best.get("tags", []),
                "match_score": float(best.get("similarity", 0)),
                "needs_generation": False,
                "generation_prompt": "",
            }
        else:
            # No good match — build a diffusion prompt
            messages = [
                SystemMessage(content=GEN_PROMPT_SYSTEM),
                HumanMessage(content=f"Scene: {scene.get('description', '')} | Visual note: {scene.get('visual_note', '')}"),
            ]
            gen_prompt = llm.invoke(messages).content.strip()
            match = {
                "scene_number": scene.get("scene_number", 1),
                "scene_title": scene.get("title", ""),
                "scene_description": scene.get("description", ""),
                "asset_id": None,
                "asset_url": None,
                "asset_tags": [],
                "match_score": 0.0,
                "needs_generation": True,
                "generation_prompt": gen_prompt,
            }
        matches.append(match)

    return {**state, "matches": matches}


# ---------------------------------------------------------------------------
# Graph
# ---------------------------------------------------------------------------

def build_asset_selector_graph() -> StateGraph:
    graph = StateGraph(AssetSelectorState)
    graph.add_node("select_assets", select_assets)
    graph.set_entry_point("select_assets")
    graph.add_edge("select_assets", END)
    return graph.compile()


_graph = None


def run_asset_selector(brand_id: str, variant_id: str, scenes: list[dict]) -> list[SceneAssetMatch]:
    global _graph
    if _graph is None:
        _graph = build_asset_selector_graph()

    initial: AssetSelectorState = {
        "brand_id": brand_id,
        "variant_id": variant_id,
        "scenes": scenes,
        "matches": [],
    }
    result = _graph.invoke(initial)
    return result["matches"]
