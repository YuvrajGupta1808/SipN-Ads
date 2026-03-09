"""
Video Prompt Builder — crafts high-quality cinematic prompts for Wan2.6
from the story plan variant and brand profile.

Wan2.6 prompt guide (from Alibaba prompt library):
- Lead with the visual action, not the brand name
- Include camera movement: "slow push-in", "tracking shot", "cut to"
- Specify lighting: "warm golden-hour backlight", "neon-lit", "soft diffused studio"
- Describe mood with emotion words: "euphoric", "aspirational", "urgent"
- End with the CTA visual moment
- Keep under ~300 tokens for best results
"""

import json
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage
from config import settings


def _get_llm() -> ChatOpenAI:
    return ChatOpenAI(
        model=settings.llm_model,
        openai_api_key=settings.fireworks_api_key,
        openai_api_base=settings.fireworks_base_url,
        temperature=0.6,
    )


# Tone → cinematic style mapping for Wan2.6
TONE_STYLES = {
    "playful": "bright saturated colors, fast dynamic cuts, handheld camera energy, confetti and motion blur",
    "premium": "cinematic anamorphic lens flare, slow dramatic push-in, muted luxury palette, shallow depth of field",
    "bold": "high-contrast blacks and reds, extreme close-ups, rapid cuts, punchy kinetic typography",
    "emotional": "golden-hour warm backlight, slow-motion liquid ripples, intimate handheld close-ups",
    "minimal": "clean white studio, single product on pedestal, slow 360-degree rotation, ultra HD clarity",
}

PLATFORM_SPECS = {
    "TikTok":    "vertical 9:16 portrait format, first frame must grab instantly, Gen-Z energy",
    "Instagram": "polished Reels vertical format, aspirational aesthetic, premium feel",
    "YouTube":   "landscape 16:9 widescreen, cinematic production quality, clear storytelling arc",
}

PROMPT_SYSTEM = """You are an expert AI video director specializing in viral short-form ad creation.
Your job: write a single cinematic prompt for Wan2.6 text-to-video model.

Rules:
- Max 250 words
- Start with the VISUAL ACTION, not brand name
- Include: subject, environment, camera movement, lighting, mood, pacing
- Weave in product organically mid-scene
- End with the emotional payoff / CTA moment
- Use vivid cinematographic language
- NO markdown, no sections, just one flowing paragraph

The prompt must make a viewer stop scrolling within the first 0.5 seconds."""


def build_wan_prompt(
    brand_profile: dict,
    variant: dict,
    platform: str = "TikTok",
) -> str:
    """
    Build a cinematic Wan2.6 prompt from brand + variant data.
    Uses LLM to craft the prompt with cinematographic language.
    """
    llm = _get_llm()

    # Parse brand rules
    brand_rules = brand_profile.get("brand_rules") or "[]"
    if isinstance(brand_rules, str):
        brand_rules = json.loads(brand_rules)

    tone = variant.get("tone", brand_profile.get("tone", "bold"))
    style = variant.get("style", "")
    hook = variant.get("hook", "")
    cta = variant.get("cta", "")
    scenes = variant.get("scenes", [])
    scene_text = " → ".join(
        f"{s.get('title', '')}: {s.get('description', '')}"
        for s in scenes[:4]
    )

    cinematic_style = TONE_STYLES.get(tone, TONE_STYLES["bold"])
    platform_spec = PLATFORM_SPECS.get(platform, PLATFORM_SPECS["TikTok"])

    context = f"""
Brand: {brand_profile.get('name', 'Unknown')} — {brand_profile.get('description', '')}
Tone: {tone} | Style: {style}
Platform: {platform} ({platform_spec})
Cinematic style: {cinematic_style}
Brand rules: {', '.join(brand_rules[:3])}
Hook (opening line): "{hook}"
Scene flow: {scene_text}
CTA (closing): "{cta}"
"""

    messages = [
        SystemMessage(content=PROMPT_SYSTEM),
        HumanMessage(content=context.strip()),
    ]
    response = llm.invoke(messages)
    return response.content.strip()


def build_wan_prompt_simple(brand_name: str, hook: str, cta: str, tone: str, scenes: list[dict]) -> str:
    """
    Fast fallback prompt builder (no LLM call) for when speed matters.
    """
    tone_style = TONE_STYLES.get(tone, "cinematic, high-production-value")
    scene_summary = ". ".join(
        s.get("description", s.get("title", "")) for s in scenes[:3] if s.get("description")
    )
    return (
        f"{hook}. {scene_summary}. "
        f"Brand: {brand_name}. Visual style: {tone_style}. "
        f"Ending: {cta}. "
        f"Short-form vertical ad, ultra-cinematic quality, professional color grade."
    )
