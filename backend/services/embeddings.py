"""
Embeddings + Reranker via Fireworks (OpenAI-compatible).
- embed()              → vector from nomic-embed-text-v1.5
- rerank()             → scored list from qwen3-reranker-8b
- store_brand_embedding() / search_similar_assets() → Supabase pgvector helpers
"""

from openai import OpenAI
from supabase import create_client, Client
from config import settings

_oai_client: OpenAI | None = None
_sb_client: Client | None = None

EMBED_MODEL = "nomic-ai/nomic-embed-text-v1.5"


def _oai() -> OpenAI:
    global _oai_client
    if _oai_client is None:
        _oai_client = OpenAI(
            api_key=settings.fireworks_api_key,
            base_url=settings.fireworks_base_url,
        )
    return _oai_client


def _sb() -> Client:
    global _sb_client
    if _sb_client is None:
        # Service role key bypasses RLS — correct for backend embedding storage
        _sb_client = create_client(settings.supabase_url, settings.supabase_service_key)
    return _sb_client


# ---------------------------------------------------------------------------
# Embeddings
# ---------------------------------------------------------------------------

def embed(text: str) -> list[float]:
    """Return an embedding vector for the given text."""
    response = _oai().embeddings.create(model=EMBED_MODEL, input=text)
    return response.data[0].embedding


def store_brand_embedding(brand_id: str, text: str) -> None:
    """Generate and store an embedding for a brand profile."""
    vector = embed(text)
    _sb().table("brand_embeddings").upsert(
        {"brand_id": brand_id, "embedding": vector, "text": text}
    ).execute()


def store_asset_embedding(asset_id: str, brand_id: str, text: str) -> None:
    """Generate and store an embedding for an uploaded asset."""
    vector = embed(text)
    _sb().table("asset_embeddings").upsert(
        {"asset_id": asset_id, "brand_id": brand_id, "embedding": vector, "text": text}
    ).execute()


# ---------------------------------------------------------------------------
# Reranker — qwen3-reranker-8b
# Fireworks reranker uses the chat completions endpoint with a special prompt.
# It returns a relevance score (0–1) for each (query, document) pair.
# ---------------------------------------------------------------------------

_RERANK_SYSTEM = (
    "You are a relevance scorer. Given a query and a document, "
    "output ONLY a JSON object {\"score\": <float 0.0-1.0>} indicating "
    "how relevant the document is to the query. 1.0 = perfect match."
)


def rerank(query: str, documents: list[str]) -> list[float]:
    """
    Score each document against the query using the reranker model.
    Returns a list of floats (0–1) in the same order as documents.
    """
    import json as _json

    scores: list[float] = []
    client = _oai()
    for doc in documents:
        try:
            resp = client.chat.completions.create(
                model=settings.reranker_model,
                messages=[
                    {"role": "system", "content": _RERANK_SYSTEM},
                    {"role": "user", "content": f"Query: {query}\n\nDocument: {doc}"},
                ],
                temperature=0.0,
                max_tokens=16,
            )
            raw = resp.choices[0].message.content or ""
            start = raw.find("{")
            end = raw.rfind("}") + 1
            parsed = _json.loads(raw[start:end]) if start != -1 else {}
            scores.append(float(parsed.get("score", 0.5)))
        except Exception:
            scores.append(0.5)
    return scores


def rerank_results(query: str, results: list[dict], text_key: str = "text") -> list[dict]:
    """
    Re-order a list of result dicts by reranker score descending.
    Each dict should have a text_key field containing the document text.
    """
    if not results:
        return results
    docs = [r.get(text_key, "") for r in results]
    scores = rerank(query, docs)
    ranked = sorted(
        zip(results, scores), key=lambda x: x[1], reverse=True
    )
    return [r for r, _ in ranked]


# ---------------------------------------------------------------------------
# pgvector similarity search (initial retrieval before reranking)
# ---------------------------------------------------------------------------

def search_similar_assets(query_text: str, limit: int = 10) -> list[dict]:
    """
    pgvector ANN search → reranked by qwen3-reranker-8b.
    Fetches 2× candidates, reranks, returns top `limit` results.
    """
    vector = embed(query_text)
    result = (
        _sb()
        .rpc("match_assets", {"query_embedding": vector, "match_count": limit * 2})
        .execute()
    )
    candidates = result.data or []
    if not candidates:
        return []

    # Build text snippets for reranker
    for r in candidates:
        r["_rerank_text"] = f"{r.get('filename', '')} {' '.join(r.get('tags', []))}"

    reranked = rerank_results(query_text, candidates, text_key="_rerank_text")
    return reranked[:limit]
