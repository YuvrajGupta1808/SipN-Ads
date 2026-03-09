"""
Memory Updater Agent — LangGraph node that summarises lessons from recent
ad exports and writes them back to the brand's long-term memory store.

Called after a successful export, it reads recent export logs, extracts
patterns, and appends them to the brand profile's "learnings" field.
"""

import json
from typing import TypedDict

from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.graph import StateGraph, END

from config import settings
from services import brand_memory
from services.learner import get_recent_exports


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

class MemoryUpdaterState(TypedDict):
    brand_id: str
    recent_exports: list[dict]
    new_learnings: list[str]


# ---------------------------------------------------------------------------
# Nodes
# ---------------------------------------------------------------------------

LEARNING_SYSTEM = """You are a brand AI learning analyst.
Given recent ad export records with performance scores, extract 2-4 concise
lessons that this brand's AI should remember for future ad generation.
Lessons should be specific and actionable, e.g.:
  "Hook text with a question gets hook_strength >= 8"
  "Avoid fade transitions — cut performs better for this brand"
  "Product close-up in the first scene scores 2 points higher on brand_compliance"

Return ONLY a JSON array of lesson strings. No markdown, no explanation."""


def load_exports(state: MemoryUpdaterState) -> MemoryUpdaterState:
    exports = get_recent_exports(state["brand_id"], limit=10)
    return {**state, "recent_exports": exports}


def extract_learnings(state: MemoryUpdaterState) -> MemoryUpdaterState:
    exports = state["recent_exports"]
    if not exports:
        return {**state, "new_learnings": []}

    export_summary = json.dumps([
        {
            "hook_text": e.get("hook_text", ""),
            "cta_text": e.get("cta_text", ""),
            "scores": {
                "cta": e.get("cta_clarity_score", 0),
                "hook": e.get("hook_strength_score", 0),
                "brand": e.get("brand_compliance_score", 0),
            },
            "fixes_applied": json.loads(e.get("fixes_applied") or "[]"),
        }
        for e in exports
    ], indent=2)

    llm = _get_llm()
    messages = [
        SystemMessage(content=LEARNING_SYSTEM),
        HumanMessage(content=f"Recent exports:\n{export_summary}"),
    ]
    response = llm.invoke(messages)
    raw = response.content.strip()
    try:
        learnings = json.loads(raw)
    except json.JSONDecodeError:
        start = raw.find("[")
        end = raw.rfind("]") + 1
        learnings = json.loads(raw[start:end]) if start != -1 else []

    return {**state, "new_learnings": learnings}


def write_learnings(state: MemoryUpdaterState) -> MemoryUpdaterState:
    if state["new_learnings"]:
        brand_memory.update_brand_learnings(state["brand_id"], state["new_learnings"])
    return state


# ---------------------------------------------------------------------------
# Graph
# ---------------------------------------------------------------------------

def build_memory_updater_graph() -> StateGraph:
    graph = StateGraph(MemoryUpdaterState)
    graph.add_node("load_exports", load_exports)
    graph.add_node("extract_learnings", extract_learnings)
    graph.add_node("write_learnings", write_learnings)
    graph.set_entry_point("load_exports")
    graph.add_edge("load_exports", "extract_learnings")
    graph.add_edge("extract_learnings", "write_learnings")
    graph.add_edge("write_learnings", END)
    return graph.compile()


_graph = None


def run_memory_updater(brand_id: str) -> list[str]:
    """Extract learnings from recent exports and write to brand memory. Returns new learnings."""
    global _graph
    if _graph is None:
        _graph = build_memory_updater_graph()

    initial: MemoryUpdaterState = {
        "brand_id": brand_id,
        "recent_exports": [],
        "new_learnings": [],
    }
    result = _graph.invoke(initial)
    return result["new_learnings"]
