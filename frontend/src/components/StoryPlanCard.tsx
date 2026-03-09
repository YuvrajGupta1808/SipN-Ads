import {
    BookOpen,
    CheckCircle2,
    ChevronDown,
    ChevronUp,
    Clapperboard,
    Clock,
    ExternalLink,
    Music,
    Search,
    ShieldCheck,
    Sparkles,
    TrendingUp,
    Users,
    Zap,
} from "lucide-react";
import { useState } from "react";
import ReactMarkdown from "react-markdown";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Scene {
  scene_number: number;
  title: string;
  duration_s: number;
  description: string;
  hook_text: string;
  visual_note: string;
  audio_note?: string;
}

export interface AdVariant {
  id: string;
  label: string;
  tone: string;
  style: string;
  hook: string;
  cta: string;
  target_audience?: string;
  viral_format?: string;
  scenes: Scene[];
}

export interface BrandContext {
  name: string;
  tone: string;
  color: string;
  tagline?: string;
  description?: string;
  rules: string[];
  platforms: string[];
}

export interface ResearchContext {
  queries: string[];
  sources: Array<{ title: string; url: string }>;
  trend_notes?: string;
}

export interface StoryPlan {
  story_summary: string;
  variants: AdVariant[];
  brand_context?: BrandContext;
  research_context?: ResearchContext;
  platform?: string;
}

interface StoryPlanCardProps {
  plan: StoryPlan;
  onSelectVariant?: (variant: AdVariant) => void;
  selectedVariantId?: string;
  /** When true only renders the context strip (for inline chat use) */
  contextOnly?: boolean;
  platformLabel?: string;
}

// ─── Platform / tone meta ─────────────────────────────────────────────────────

const PLATFORM_META: Record<string, { icon: string; color: string; bg: string; label: string }> = {
  "TikTok":          { icon: "♪", color: "#010101", bg: "#f5f5f5", label: "TikTok" },
  "Instagram":       { icon: "◈", color: "#E1306C", bg: "#fff0f5", label: "Reels" },
  "YouTube Shorts":  { icon: "▶", color: "#FF0000", bg: "#fff5f5", label: "Shorts" },
};

const TONE_COLORS: Record<string, string> = {
  playful:       "#f59e0b",
  premium:       "#8b5cf6",
  bold:          "#ef4444",
  emotional:     "#ec4899",
  minimal:       "#6b7280",
  stoic:         "#64748b",
  provocative:   "#dc2626",
  authentic:     "#059669",
  energetic:     "#f97316",
};

// ─── Markdown prose renderer ──────────────────────────────────────────────────

function Prose({ children, className = "" }: { children: string; className?: string }) {
  return (
    <ReactMarkdown
      components={{
        h1: ({ children }) => <h1 className="text-[14px] font-bold mt-2 mb-1" style={{ color: "#1a1a1a" }}>{children}</h1>,
        h2: ({ children }) => <h2 className="text-[13px] font-bold mt-2 mb-1" style={{ color: "#1a1a1a" }}>{children}</h2>,
        h3: ({ children }) => <h3 className="text-[12px] font-semibold mt-1.5 mb-0.5" style={{ color: "#333" }}>{children}</h3>,
        p:  ({ children }) => <p className={`text-[12px] leading-relaxed mb-1.5 ${className}`} style={{ color: "#444" }}>{children}</p>,
        strong: ({ children }) => <strong className="font-semibold" style={{ color: "#1a1a1a" }}>{children}</strong>,
        em: ({ children }) => <em className="italic">{children}</em>,
        ul: ({ children }) => <ul className="list-disc pl-4 mb-1.5 space-y-0.5">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal pl-4 mb-1.5 space-y-0.5">{children}</ol>,
        li: ({ children }) => <li className="text-[12px] leading-relaxed" style={{ color: "#444" }}>{children}</li>,
        hr: () => <hr className="my-2" style={{ borderColor: "#f0ece8" }} />,
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noopener noreferrer" className="underline hover:opacity-70" style={{ color: "#f97316" }}>{children}</a>
        ),
      }}
    >
      {children}
    </ReactMarkdown>
  );
}

// ─── Context strip (exported for inline chat use) ─────────────────────────────

export function ContextStrip({
  brandContext,
  researchContext,
  storySummary,
  variantCount = 0,
  onViewConcepts,
  onEditBrief,
}: {
  brandContext?: BrandContext;
  researchContext?: ResearchContext;
  storySummary: string;
  variantCount?: number;
  onViewConcepts?: () => void;
  onEditBrief?: () => void;
  onEditBrief?: () => void;
}) {
  const hasResearch = researchContext &&
    (researchContext.queries.length > 0 || researchContext.sources.length > 0);

  // Collapsed by default — user can expand to see full research details
  const [open, setOpen] = useState(false);
  const [summaryExpanded, setSummaryExpanded] = useState(false);

  if (!brandContext && !hasResearch && !storySummary) return null;

  const shortSummary = storySummary.length > 320
    ? storySummary.slice(0, 320).trimEnd() + "…"
    : storySummary;

  return (
    <div className="mb-3 rounded-xl overflow-hidden font-body text-[12px]"
      style={{ background: "#fff", border: "1px solid #ede9e4", boxShadow: "0 1px 4px rgba(0,0,0,0.03)" }}>

      {/* Header row — always visible */}
      <button
        className="w-full flex items-center gap-2.5 px-3.5 py-2.5 transition-colors hover:bg-[#faf9f7]"
        onClick={() => setOpen(v => !v)}
      >
        <Sparkles className="w-3.5 h-3.5 shrink-0" style={{ color: "#f97316" }} />
        <span className="flex-1 text-left font-body text-[12px] font-medium" style={{ color: "#555" }}>
          <span className="font-semibold" style={{ color: "#1a1a1a" }}>Gemini researched</span>
          {brandContext ? ` ${brandContext.name}` : ""}
          {hasResearch && researchContext.queries.length > 0
            ? ` · searched "${researchContext.queries[0]}"${researchContext.queries.length > 1 ? ` +${researchContext.queries.length - 1} more` : ""}`
            : ""}
        </span>
        {open
          ? <ChevronUp className="w-3.5 h-3.5 shrink-0" style={{ color: "#ccc" }} />
          : <ChevronDown className="w-3.5 h-3.5 shrink-0" style={{ color: "#ccc" }} />}
      </button>

      {/* Expandable details */}
      {open && (
        <div className="border-t px-3.5 pb-3.5 pt-2.5 space-y-3" style={{ borderColor: "#f0ece8" }}>

          {/* Brand profile */}
          {brandContext && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: "#bbb" }}>
                Brand profile loaded
              </p>
              <div className="flex flex-wrap gap-1.5">
                <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold"
                  style={{ background: `${brandContext.color}18`, color: brandContext.color }}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: brandContext.color }} />
                  {brandContext.name}
                </span>
                <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold"
                  style={{ background: "#f5f0eb", color: "#888" }}>
                  {brandContext.tone}
                </span>
                {brandContext.platforms.slice(0, 3).map(p => (
                  <span key={p} className="px-2.5 py-1 rounded-full text-[11px]"
                    style={{ background: "#f5f5f5", color: "#888" }}>
                    {p}
                  </span>
                ))}
              </div>
              {brandContext.rules.length > 0 && (
                <p className="text-[11px] mt-1.5 flex items-start gap-1.5" style={{ color: "#aaa" }}>
                  <ShieldCheck className="w-3 h-3 shrink-0 mt-0.5" />
                  <span>
                    {brandContext.rules.slice(0, 2).join(" · ")}
                    {brandContext.rules.length > 2 && (
                      <span style={{ color: "#f97316" }}> +{brandContext.rules.length - 2} more</span>
                    )}
                  </span>
                </p>
              )}
            </div>
          )}

          {/* Search queries */}
          {hasResearch && researchContext.queries.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: "#bbb" }}>
                Google Search grounding
              </p>
              <div className="flex flex-wrap gap-1.5 mb-1.5">
                {researchContext.queries.map((q, i) => (
                  <span key={i} className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px]"
                    style={{ background: "#f5f5f5", color: "#666", border: "1px solid #eee" }}>
                    <Search className="w-2.5 h-2.5 shrink-0" />{q}
                  </span>
                ))}
              </div>
              {researchContext.sources.slice(0, 3).map((src, i) => (
                <a key={i} href={src.url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-[10px] mb-0.5 hover:underline"
                  style={{ color: "#aaa" }}>
                  <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                  <span className="truncate">{src.title || src.url}</span>
                </a>
              ))}
            </div>
          )}

          {/* Story concept — rendered markdown */}
          {storySummary && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: "#bbb" }}>
                Story concept
              </p>
              <div className="text-[12px]">
                <Prose>{summaryExpanded ? storySummary : shortSummary}</Prose>
              </div>
              {storySummary.length > 320 && (
                <button onClick={() => setSummaryExpanded(v => !v)}
                  className="text-[10px] font-semibold mt-0.5 flex items-center gap-1 hover:opacity-70"
                  style={{ color: "#f97316" }}>
                  {summaryExpanded
                    ? <><ChevronUp className="w-3 h-3" />Show less</>
                    : <><ChevronDown className="w-3 h-3" />Read full report</>}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* View concepts button — always visible, outside the expand/collapse */}
      {variantCount > 0 && onViewConcepts && (
        <div className="px-3 pb-3 space-y-1.5" style={{ paddingTop: open ? 0 : "0.25rem" }}>
          <button
            onClick={onViewConcepts}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-[12px] font-semibold transition-all hover:opacity-90 active:scale-[0.98]"
            style={{ background: "linear-gradient(135deg, #fb923c, #ea580c)", color: "#fff" }}
          >
            <Clapperboard className="w-3.5 h-3.5" />
            View {variantCount} ad concepts →
          </button>
          {onEditBrief && (
            <button
              onClick={onEditBrief}
              className="w-full flex items-center justify-center gap-2 py-1.5 rounded-xl text-[11px] font-semibold transition-all hover:bg-[#faf5f0] active:scale-[0.98]"
              style={{ background: "#fff", border: "1px solid #eee", color: "#9a6a34" }}
            >
              <BookOpen className="w-3 h-3" />
              Edit brief & ask again
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Variant card ─────────────────────────────────────────────────────────────

export function VariantCard({
  variant,
  isSelected,
  onSelect,
  platformLabel = "TikTok",
}: {
  variant: AdVariant;
  isSelected: boolean;
  onSelect: () => void;
  platformLabel?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const toneKey = (variant.tone || "").toLowerCase();
  const toneColor = TONE_COLORS[toneKey] ?? "#f97316";
  const totalDuration = variant.scenes.reduce((s, sc) => s + sc.duration_s, 0);

  return (
    <div
      className="rounded-2xl overflow-hidden font-body transition-all"
      style={{
        background: isSelected ? "#fff9f5" : "#fff",
        border: isSelected ? "1.5px solid #f97316" : "1px solid #ede9e4",
        boxShadow: isSelected
          ? "0 0 0 3px rgba(249,115,22,0.08), 0 2px 8px rgba(0,0,0,0.04)"
          : "0 1px 4px rgba(0,0,0,0.03)",
      }}
    >
      {/* Card header */}
      <div className="px-4 pt-3.5 pb-2.5">
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "#bbb" }}>
              {variant.label}
            </span>
            {isSelected && <CheckCircle2 className="w-3.5 h-3.5" style={{ color: "#22c55e" }} />}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
              style={{ background: `${toneColor}15`, color: toneColor }}>
              {variant.tone}
            </span>
            <span className="flex items-center gap-0.5 text-[10px]" style={{ color: "#bbb" }}>
              <Clock className="w-2.5 h-2.5" />{totalDuration}s
            </span>
          </div>
        </div>

        {/* Hook */}
        <div className="rounded-xl px-3.5 py-2.5 mb-2.5"
          style={{ background: "#fff7ed", border: "1px solid #fed7aa" }}>
          <p className="text-[10px] font-semibold mb-1 flex items-center gap-1" style={{ color: "#f97316" }}>
            <Zap className="w-2.5 h-2.5" />Hook · First 3s
          </p>
          <p className="text-[13px] font-semibold leading-snug" style={{ color: "#7c3404" }}>
            "{variant.hook}"
          </p>
        </div>

        {/* Style */}
        <p className="text-[11px] leading-relaxed mb-2.5" style={{ color: "#777" }}>
          {variant.style}
        </p>

        {/* Format + audience badges */}
        <div className="flex flex-wrap gap-1.5">
          {variant.viral_format && (
            <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
              style={{ background: "#f0f0f0", color: "#555", border: "1px solid #e8e8e8" }}>
              <TrendingUp className="w-2.5 h-2.5" />{variant.viral_format}
            </span>
          )}
          {variant.target_audience && (
            <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full"
              style={{ background: "#f8f8f8", color: "#888", border: "1px solid #eee" }}>
              <Users className="w-2.5 h-2.5" />
              {variant.target_audience.length > 48
                ? variant.target_audience.slice(0, 48) + "…"
                : variant.target_audience}
            </span>
          )}
        </div>
      </div>

      {/* Scenes toggle */}
      {variant.scenes.length > 0 && (
        <>
          <button
            className="w-full flex items-center justify-between px-4 py-2 text-[10px] font-semibold uppercase tracking-wider transition-colors hover:bg-[#fafaf9]"
            style={{ color: "#bbb", borderTop: "1px solid #f0ece8" }}
            onClick={() => setExpanded(v => !v)}
          >
            <span className="flex items-center gap-1.5">
              <Clapperboard className="w-3 h-3" />{variant.scenes.length} scenes
            </span>
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>

          {expanded && (
            <div className="px-3 pb-2.5 space-y-1.5">
              {variant.scenes.map((scene) => (
                <div key={scene.scene_number}
                  className="flex gap-2.5 items-start rounded-xl px-3 py-2.5"
                  style={{ background: "#fafaf9", border: "1px solid #f0ece8" }}>
                  <div className="w-5 h-5 rounded-md flex items-center justify-center text-[9px] font-bold shrink-0 mt-0.5"
                    style={{ background: "#f5f0eb", color: "#f97316" }}>
                    {scene.scene_number}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-[11px] font-semibold" style={{ color: "#1a1a1a" }}>
                        {scene.title}
                      </span>
                      <span className="text-[10px]" style={{ color: "#bbb" }}>{scene.duration_s}s</span>
                    </div>
                    <p className="text-[11px] leading-snug" style={{ color: "#666" }}>
                      {scene.description}
                    </p>
                    {scene.hook_text && (
                      <p className="text-[10px] mt-1 italic font-medium" style={{ color: "#f97316" }}>
                        "{scene.hook_text}"
                      </p>
                    )}
                    {scene.visual_note && (
                      <p className="text-[10px] mt-1 flex items-center gap-1" style={{ color: "#aaa" }}>
                        <Clapperboard className="w-2.5 h-2.5 shrink-0" style={{ color: "#ccc" }} />
                        {scene.visual_note}
                      </p>
                    )}
                    {scene.audio_note && (
                      <p className="text-[10px] mt-0.5 flex items-center gap-1" style={{ color: "#aaa" }}>
                        <Music className="w-2.5 h-2.5 shrink-0" style={{ color: "#ccc" }} />
                        {scene.audio_note}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* CTA + generate */}
      <div className="px-4 py-3 flex items-center gap-3"
        style={{ borderTop: "1px solid #f0ece8", background: "#fefefe" }}>
        <div className="flex-1 min-w-0">
          <p className="text-[9px] font-semibold uppercase tracking-widest mb-0.5" style={{ color: "#ccc" }}>CTA</p>
          <p className="text-[12px] font-semibold leading-snug" style={{ color: "#1a1a1a" }}>{variant.cta}</p>
        </div>
        <button
          onClick={onSelect}
          className="shrink-0 text-[11px] font-bold px-4 py-2 rounded-xl transition-all active:scale-[0.97] hover:opacity-90"
          style={isSelected
            ? { background: "#22c55e", color: "#fff" }
            : { background: "linear-gradient(135deg, #fb923c, #ea580c)", color: "#fff", boxShadow: "0 2px 8px rgba(249,115,22,0.2)" }
          }
        >
          {isSelected
            ? <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" />Generating…</span>
            : `Generate for ${platformLabel}`}
        </button>
      </div>
    </div>
  );
}

// ─── Default export: full card (used standalone) ──────────────────────────────

export default function StoryPlanCard({
  plan,
  onSelectVariant,
  selectedVariantId,
  contextOnly = false,
  platformLabel,
}: StoryPlanCardProps) {
  const platMeta = PLATFORM_META[plan.platform ?? "TikTok"] ?? PLATFORM_META["TikTok"];
  const label = platformLabel ?? platMeta.label;

  return (
    <div className="font-body w-full">
      <ContextStrip
        brandContext={plan.brand_context}
        researchContext={plan.research_context}
        storySummary={plan.story_summary}
        variantCount={contextOnly ? plan.variants.length : 0}
      />

      {!contextOnly && (
        <div className="grid gap-3"
          style={{ gridTemplateColumns: `repeat(${Math.min(plan.variants.length, 3)}, minmax(0, 1fr))` }}>
          {plan.variants.map(variant => (
            <VariantCard
              key={variant.id}
              variant={variant}
              isSelected={selectedVariantId === variant.id}
              onSelect={() => onSelectVariant?.(variant)}
              platformLabel={label}
            />
          ))}
        </div>
      )}
    </div>
  );
}
