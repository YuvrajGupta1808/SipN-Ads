from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    fireworks_api_key: str
    supabase_url: str
    supabase_key: str           # anon/publishable key — used by frontend
    supabase_service_key: str   # service role key — used by backend only (bypasses RLS)
    frontend_url: str = "http://localhost:8080"

    # Fireworks uses OpenAI-compatible API
    fireworks_base_url: str = "https://api.fireworks.ai/inference/v1"
    # Main chat/generation model
    llm_model: str = "accounts/fireworks/models/llama-v3p3-70b-instruct"
    # Reranker model
    reranker_model: str = "accounts/fireworks/models/qwen3-reranker-8b"

    # Google Gemini (Nano Banana images + Flash chat)
    gemini_api_key: str = ""
    gemini_chat_model: str = "gemini-3-flash-preview"
    gemini_image_model: str = "gemini-2.5-flash-image"
    gemini_video_model: str = "veo-3.1-generate-preview"

    # OpenAI — Sora video fallback
    openai_api_key: str = ""

    # MCP widget server port (Manufact MCP Apps for end-users)
    mcp_widget_port: int = 3001

    class Config:
        env_file = ".env"


settings = Settings()
