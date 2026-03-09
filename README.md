## Sip N' Ads – AI Ad Studio

Sip N' Ads is an end‑to‑end AI ad studio that:

- Researches trends and competitors for a brand.
- Generates strategy briefs and multiple short‑form ad concepts.
- Renders vertical video with OpenAI Sora.
- Runs an AI critic, applies fixes, and lets you **“appreciate”** ads to teach a long‑term brand memory and template library.

The app is split into a **React frontend**, a **FastAPI backend**, and a **Supabase Postgres** project used as both storage and a simple long‑term memory layer.

---

## Project structure

```text
SipN-Ads/
  frontend/                # React + Vite app (Chat UI + Studio)
    src/
      pages/
        Chat.tsx           # Main conversational UI, Studio panel, Critic
      components/
        StoryPlanCard.tsx  # Story concept + variants UI
        BrandPickerModal.tsx

  backend/                 # FastAPI backend + agents
    main.py                # FastAPI app wiring, router registration
    config.py              # Settings (Supabase, OpenAI, Gemini, etc.)
    supabase_setup.sql     # Schema for all required Supabase tables

    routers/
      brand.py             # /brand/* – CRUD + listing for brand profiles
      chat.py              # /chat/message – streaming story-plan generation
      pipeline.py          # /pipeline/run + /pipeline/remix – Sora pipeline
      critic.py            # /critic/* – Gemini critic + fixes
      learner.py           # /learner/* – export logging, memory, templates
      render.py            # /render/status, /render/video – job polling

    services/
      brand_memory.py      # get/upsert brand_profiles + learnings
      learner.py           # log_export + export queries
      template_builder.py  # build/sync templates from high-scoring exports
      compositor.py        # build/get timelines for renders
      renderer.py          # Sora client + local fallback video handling

    agents/
      memory_updater.py    # LangGraph agent: exports → brand learnings

    mcp-server/            # MCP server + iframe-based Studio widget

  video.mp4                # Demo fallback clip (first render)
  video2.mp4               # Demo fallback clip (remix renders)
```

---

## High-level flow

1. **User describes a campaign** in `Chat.tsx`.
2. Backend `/chat/message`:
   - Uses Gemini + Google Search to research the brief.
   - Generates a **Story Concept** (strategy doc) and **3+ variants** with scenes.
3. User **opens concepts** → selects a variant.
4. Backend `/pipeline/run`:
   - Loads `brand_profiles` from Supabase.
   - Builds a Sora prompt from brand + scenes.
   - Runs asset selection with pgvector.
   - Builds a timeline and starts a Sora render job.
5. The **Studio panel** polls `/render/status/{job_id}` until the video is ready.
6. User runs **AI Critic** (`/critic/evaluate`) and optionally applies fixes.
7. When they **“Appreciate this ad · save learnings”**, the frontend calls:
   - `POST /learner/log-export` with scores, fixes, and metadata.
8. The learner router:
   - Logs an `ad_exports` record.
   - Runs `memory_updater` to append new lessons into `brand_profiles.learnings`.
   - Promotes high‑scoring exports to `ad_templates`.
9. The **Brand Memory** dialog in `Chat.tsx` reads back `brand_profiles` to show:
   - Identity, rules, constraints, and accumulated AI learnings.

---

## Memory architecture

### Storage (Supabase Postgres)

- `brand_profiles` – source of truth per brand:
  - Identity: `name`, `tone`, `color`, `tagline`, `description`.
  - Guardrails: `brand_rules`, `constraints`, `platforms`.
  - Long‑term memory: `learnings` (JSON array of lesson strings).
- `ad_exports` – log of every appreciated/exported ad:
  - `brand_id`, `job_id`, `variant_id`, per‑axis scores, `overall_score`,
    `fixes_applied`, `hook_text`, `cta_text`, timestamps.
- `ad_templates` – high‑scoring exports promoted to reusable templates.
- `assets` / `brand_embeddings` – vectors + metadata for asset retrieval.
- `timelines` – optional backup of compositor timelines.

### Memory services & agents

- `services/brand_memory.py`
  - `upsert_brand(brand_id, profile)` – writes/updates `brand_profiles`.
  - `get_brand`, `list_brands` – reads brand profiles for chat/pipeline.
  - `update_brand_learnings(brand_id, new_learnings)` – appends lessons into `learnings`.

- `services/learner.py`
  - `log_export(...)` – inserts a row into `ad_exports` whenever the user appreciates/exports an ad.
  - `get_recent_exports`, `get_high_scoring_exports` – feed the memory agent and template builder.

- `agents/memory_updater.py`
  - LangGraph pipeline:
    1. `load_exports` – fetch last N `ad_exports` for a brand.
    2. `extract_learnings` – Gemini/FW LLM turns scores + hooks/CTAs + fixes into 2–4 plain‑text lessons.
    3. `write_learnings` – calls `update_brand_learnings` to append them into `brand_profiles.learnings`.

- `services/template_builder.py`
  - Reads high‑scoring `ad_exports` + timelines and writes to `ad_templates`.

### Routers (API endpoints)

- `routers/learner.py`
  - `POST /learner/log-export`:
    - Calls `log_export(...)` → writes `ad_exports`.
    - Runs `run_memory_updater(brand_id)` in a background executor → updates `brand_profiles.learnings`.
    - If `overall_score >= 8.5`, calls `sync_templates_for_brand` → writes `ad_templates`.
  - `GET /learner/exports/{brand_id}` – list exports.
  - `GET /learner/templates/{brand_id}` / `/learner/template/{template_id}` – list/fetch templates.

---

## Memory diagram

Visual overview of the memory and pipeline architecture:

![Sip N' Ads memory architecture](frontend/public/mermaid-diagram%20(1).png)

---

## Running the app locally

### Prerequisites

- Node.js (LTS) + pnpm / npm
- Python 3.11+ and `virtualenv`
- A Supabase project with the SQL from `backend/supabase_setup.sql` applied.
- API keys in `backend/.env`:
  - `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`
  - `OPENAI_API_KEY`
  - `GEMINI_API_KEY` (for critic + research)

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt   # or uv / pip-tools if you use them
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open the frontend (usually `http://localhost:5173` or `http://localhost:8080`)
and start a new chat to generate concepts, run the Studio, critic, and memory loop.

