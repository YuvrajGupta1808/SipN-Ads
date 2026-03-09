"""
Brand Builder Agent — LangGraph node that takes raw brand inputs,
prompts the LLM to extract structured brand rules, and writes the
result to the brand memory store.
"""

import json
import uuid
from typing import TypedDict

from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.graph import StateGraph, END

from config import settings
from services import brand_memory, embeddings as emb_service

# ---------------------------------------------------------------------------
# LLM client (Fireworks, OpenAI-compatible)
# ---------------------------------------------------------------------------

def _get_llm() -> ChatOpenAI:
    return ChatOpenAI(
        model=settings.llm_model,
        openai_api_key=settings.fireworks_api_key,
        openai_api_base=settings.fireworks_base_url,
        temperature=0.3,
    )


# ---------------------------------------------------------------------------
# State
# ---------------------------------------------------------------------------

class BrandBuilderState(TypedDict):
    brand_id: str
    name: str
    tone: str
    color: str
    tagline: str
    description: str
    logo_url: str
    product_image_urls: list[str]
    platforms: list[str]
    # LLM output fields
    brand_rules: list[str]
    constraints: list[str]
    saved_profile: dict


# ---------------------------------------------------------------------------
# Nodes
# ---------------------------------------------------------------------------

EXTRACTION_SYSTEM = """You are a brand strategist AI. Given brand information,
extract:
1. brand_rules: 3–6 actionable creative rules for ad production
   (e.g. "Always show the product in the first 2 seconds",
         "Use warm lighting only",
         "Never use competitor brand colours")
2. constraints: 2–4 hard constraints
   (e.g. "No alcohol imagery", "Captions required on all videos")

Return ONLY valid JSON with keys "brand_rules" (list of strings)
and "constraints" (list of strings). No markdown, no explanation."""


def extract_brand_rules(state: BrandBuilderState) -> BrandBuilderState:
    llm = _get_llm()
    prompt = f"""Brand Name: {state["name"]}
Tagline: {state.get("tagline", "")}
Description: {state.get("description", "")}
Tone: {state["tone"]}
Target platforms: {", ".join(state.get("platforms", []))}"""

    messages = [
        SystemMessage(content=EXTRACTION_SYSTEM),
        HumanMessage(content=prompt),
    ]
    response = llm.invoke(messages)
    try:
        parsed = json.loads(response.content)
    except json.JSONDecodeError:
        # Fallback: extract JSON substring
        raw = response.content
        start = raw.find("{")
        end = raw.rfind("}") + 1
        parsed = json.loads(raw[start:end]) if start != -1 else {}

    return {
        **state,
        "brand_rules": parsed.get("brand_rules", []),
        "constraints": parsed.get("constraints", []),
    }


def save_to_memory(state: BrandBuilderState) -> BrandBuilderState:
    profile = {
        "name": state["name"],
        "tone": state["tone"],
        "color": state["color"],
        "tagline": state.get("tagline", ""),
        "description": state.get("description", ""),
        "logo_url": state.get("logo_url", ""),
        "product_image_urls": state.get("product_image_urls", []),
        "platforms": state.get("platforms", []),
        "brand_rules": state["brand_rules"],
        "constraints": state["constraints"],
        "learnings": [],
    }
    saved = brand_memory.upsert_brand(state["brand_id"], profile)

    # Store embedding for semantic retrieval
    embed_text = (
        f"{state['name']} {state.get('tagline', '')} {state.get('description', '')} "
        f"tone:{state['tone']} rules:{' '.join(state['brand_rules'])}"
    )
    try:
        emb_service.store_brand_embedding(state["brand_id"], embed_text)
    except Exception:
        pass  # Embeddings are best-effort; don't fail onboarding

    return {**state, "saved_profile": saved}


# ---------------------------------------------------------------------------
# Graph
# ---------------------------------------------------------------------------

def build_brand_graph() -> StateGraph:
    graph = StateGraph(BrandBuilderState)
    graph.add_node("extract_rules", extract_brand_rules)
    graph.add_node("save_memory", save_to_memory)
    graph.set_entry_point("extract_rules")
    graph.add_edge("extract_rules", "save_memory")
    graph.add_edge("save_memory", END)
    return graph.compile()


_graph = None


def run_brand_builder(brand_data: dict) -> dict:
    """Entry point called by the router. Returns the saved brand profile."""
    global _graph
    if _graph is None:
        _graph = build_brand_graph()

    brand_id = brand_data.get("id") or str(uuid.uuid4())
    initial_state: BrandBuilderState = {
        "brand_id": brand_id,
        "name": brand_data["name"],
        "tone": brand_data["tone"],
        "color": brand_data.get("color", "#f97316"),
        "tagline": brand_data.get("tagline", ""),
        "description": brand_data.get("description", ""),
        "logo_url": brand_data.get("logo_url", ""),
        "product_image_urls": brand_data.get("product_image_urls", []),
        "platforms": brand_data.get("platforms", []),
        "brand_rules": [],
        "constraints": [],
        "saved_profile": {},
    }
    result = _graph.invoke(initial_state)
    return result["saved_profile"]
