from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from routers import brand as brand_router
from routers import chat as chat_router
from routers import assets as assets_router
from routers import render as render_router
from routers import critic as critic_router
from routers import learner as learner_router
from routers import pipeline as pipeline_router
from services.storage import ensure_bucket


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Pre-create storage buckets so the first upload never hits "Bucket not found"
    try:
        for bucket in ("assets", "renders"):
            ensure_bucket(bucket)
        print("✓ Supabase Storage buckets ready (assets, renders)")
    except Exception as e:
        print(f"⚠ Could not pre-create storage buckets: {e}")
    yield


app = FastAPI(title="SipN-Ads API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        settings.frontend_url,
        "http://localhost:5173",
        "http://localhost:8080",
        "http://localhost:3001",   # MCP widget server (iframe origin)
        "http://127.0.0.1:3001",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(brand_router.router)
app.include_router(chat_router.router)
app.include_router(assets_router.router)
app.include_router(render_router.router)
app.include_router(critic_router.router)
app.include_router(learner_router.router)
app.include_router(pipeline_router.router)


@app.get("/health")
async def health():
    return {"status": "ok"}
