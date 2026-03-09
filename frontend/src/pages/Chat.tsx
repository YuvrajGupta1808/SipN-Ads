import type { Brand } from "@/components/BrandPickerModal";
import BrandPickerModal, { MOCK_BRANDS } from "@/components/BrandPickerModal";
import type { AdVariant, StoryPlan } from "@/components/StoryPlanCard";
import { ContextStrip, VariantCard } from "@/components/StoryPlanCard";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import {
  AlertTriangle,
  BookOpen,
  Brain,
  CheckCircle2,
  ChevronDown,
  Clapperboard,
  Download,
  ExternalLink,
  FileText,
  Home,
  Image,
  LayoutTemplate,
  Lightbulb,
  Link2,
  Loader2,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Paperclip,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Tag,
  Trash2,
  Video,
  X,
  Zap,
} from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { useNavigate } from "react-router-dom";

const MCP_WIDGET_BASE = "http://localhost:3001";
const API_BASE = "http://localhost:8000";

// ─── Platform definitions ────────────────────────────────────────────────────
type Platform = "TikTok" | "Instagram" | "YouTube Shorts";

const PLATFORMS: Array<{
  id: Platform;
  label: string;
  icon: string;
  color: string;
  bg: string;
  format: string;
  maxSec: number;
}> = [
  { id: "TikTok",         label: "TikTok",  icon: "♪", color: "#010101", bg: "#f5f5f5", format: "9:16 · up to 60s", maxSec: 60 },
  { id: "Instagram",      label: "Reels",   icon: "◈", color: "#E1306C", bg: "#fff0f5", format: "9:16 · up to 90s", maxSec: 90 },
  { id: "YouTube Shorts", label: "Shorts",  icon: "▶", color: "#FF0000", bg: "#fff5f5", format: "9:16 · up to 60s", maxSec: 60 },
];

const getPlatform = (id: Platform) => PLATFORMS.find((p) => p.id === id)!;

// ─── Types ───────────────────────────────────────────────────────────────────
type Message = {
  role: "user" | "assistant";
  content: string;
  type?: "text" | "story_plan" | "studio_opened";
  storyPlan?: StoryPlan;
  jobId?: string;
  variantLabel?: string;
  platform?: Platform;
  referenceImageUrl?: string;
  referenceImageName?: string;
};

type ChatSession = {
  id: string;
  title: string;
  messages: Message[];
  brand?: Brand;
  platform: Platform;
  selectedVariantId?: string;
};

// Quick suggestion chips shown at the start of a fresh conversation
const QUICK_SUGGESTIONS = [
  { label: "Which format should I use?", icon: <Lightbulb className="w-3 h-3" /> },
  { label: "Create a TikTok ad for my brand", icon: <Video className="w-3 h-3" /> },
  { label: "What makes a viral hook?", icon: <Sparkles className="w-3 h-3" /> },
  { label: "Compare TikTok vs Reels vs Shorts", icon: <Search className="w-3 h-3" /> },
];

// ─── Component ───────────────────────────────────────────────────────────────
const Chat = () => {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sessions, setSessions] = useState<ChatSession[]>([
    {
      id: "1",
      title: "Summer Campaign Ideas",
      brand: MOCK_BRANDS[0],
      platform: "TikTok",
      messages: [
        {
          role: "assistant",
          content:
            "Welcome to Sip N'ads!\n\nSelect a platform (TikTok / Reels / Shorts) and describe your campaign. Gemini will research current trends with Google Search and generate 3 short-form ad concepts.",
        },
      ],
    },
  ]);
  const [activeSessionId, setActiveSessionId] = useState("1");
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState("");
  const [brandPickerOpen, setBrandPickerOpen] = useState(false);
  const [pendingNewChat, setPendingNewChat] = useState(false);
  const [studioPanelOpen, setStudioPanelOpen] = useState(false);
  const [studioWidgetUrl, setStudioWidgetUrl] = useState("");
  const [studioVariantLabel, setStudioVariantLabel] = useState("");
  const [studioPlatform, setStudioPlatform] = useState<Platform>("TikTok");
  const [studioJobId, setStudioJobId] = useState("");
  const [studioVideoUrl, setStudioVideoUrl] = useState("");
  const [studioStatus, setStudioStatus] = useState<"pending" | "rendering" | "done" | "error">("pending");
  const [studioProgress, setStudioProgress] = useState(0);
  const [studioStatusText, setStudioStatusText] = useState("");
  const studioPollerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Concepts panel state
  const [conceptsPanelOpen, setConceptsPanelOpen] = useState(false);
  const [conceptsPlan, setConceptsPlan] = useState<StoryPlan | null>(null);

  // Brand memory modal state
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [brandMemoryData, setBrandMemoryData] = useState<Record<string, unknown> | null>(null);
  const [memoryLoading, setMemoryLoading] = useState(false);

  // Critic state
  type CriticData = {
    scores: Record<string, number>;
    verdicts: Record<string, string>;
    suggestions: Record<string, string>;
    overall: string;
    remix_prompt?: string;
  };
  const [criticData, setCriticData] = useState<CriticData | null>(null);
  const [criticLoading, setCriticLoading] = useState(false);
  const [criticError, setCriticError] = useState("");
  const [applyingFix, setApplyingFix] = useState<string | null>(null);
  const [appliedFixes, setAppliedFixes] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [exportSuccess, setExportSuccess] = useState(false);
  const [remixDraft, setRemixDraft] = useState("");
  const [remixRunning, setRemixRunning] = useState(false);
  const [remixError, setRemixError] = useState("");
  const [isRemixJob, setIsRemixJob] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeSession = sessions.find((s) => s.id === activeSessionId)!;

  // Poll render status when studio is open and rendering
  useEffect(() => {
    if (studioPollerRef.current) clearInterval(studioPollerRef.current);
    if (!studioJobId || studioStatus === "done" || studioStatus === "error") return;

    studioPollerRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/render/status/${studioJobId}`);
        if (!res.ok) return;
        const d = await res.json();
        setStudioProgress(d.progress ?? 0);
        setStudioStatusText(d.status_text ?? "");
        setStudioStatus(d.status);
        if (d.status === "done" && d.video_url) {
          setStudioVideoUrl(d.video_url);
          clearInterval(studioPollerRef.current!);
        }
        if (d.status === "error") clearInterval(studioPollerRef.current!);
      } catch { /* ignore */ }
    }, 4000);

    return () => { if (studioPollerRef.current) clearInterval(studioPollerRef.current); };
  }, [studioJobId, studioStatus]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeSession?.messages, isLoading]);

  useEffect(() => {
    if (criticData?.remix_prompt) {
      setRemixDraft(criticData.remix_prompt);
      setRemixError("");
    }
  }, [criticData]);

  // ── Brand memory ──────────────────────────────────────────────────────────
  const openBrandMemory = async () => {
    if (!activeSession?.brand?.id) return;
    setMemoryOpen(true);
    setMemoryLoading(true);
    setBrandMemoryData(null);
    try {
      const res = await fetch(`${API_BASE}/brand/${activeSession.brand.id}`);
      if (res.ok) {
        setBrandMemoryData(await res.json());
      } else {
        // Fallback: show what we have in session
        setBrandMemoryData({ ...activeSession.brand });
      }
    } catch {
      setBrandMemoryData({ ...activeSession.brand });
    }
    setMemoryLoading(false);
  };

  // ── Session helpers ──────────────────────────────────────────────────────
  const createSessionWithBrand = (brand?: Brand, platform: Platform = "TikTok") => {
    const id = Date.now().toString();
    const plat = getPlatform(platform);
    const newSession: ChatSession = {
      id,
      title: "New Chat",
      brand,
      platform,
      messages: [
        {
          role: "assistant",
          content: brand
            ? `Ready for **${brand.name}** on ${plat.label} (${plat.format}).\n\nDescribe your campaign and I'll research current trends with Google Search.`
            : `Ready for ${plat.label} (${plat.format}).\n\nDescribe your brand or campaign idea.`,
        },
      ],
    };
    setSessions((prev) => [newSession, ...prev]);
    setActiveSessionId(id);
  };

  const setSessionPlatform = (platform: Platform) => {
    setSessions((prev) =>
      prev.map((s) => (s.id === activeSessionId ? { ...s, platform } : s))
    );
  };

  const createNewChat = () => { setPendingNewChat(true); setBrandPickerOpen(true); };
  const handleBrandSelect = (brand: Brand) => { setBrandPickerOpen(false); setPendingNewChat(false); createSessionWithBrand(brand, activeSession?.platform ?? "TikTok"); };
  const handleBrandSkip = () => { setBrandPickerOpen(false); setPendingNewChat(false); createSessionWithBrand(undefined, activeSession?.platform ?? "TikTok"); };
  const handleBrandPickerClose = () => { setBrandPickerOpen(false); if (pendingNewChat) setPendingNewChat(false); };

  const deleteSession = (id: string) => {
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (activeSessionId === id) {
      const remaining = sessions.filter((s) => s.id !== id);
      if (remaining.length > 0) setActiveSessionId(remaining[0].id);
      else createNewChat();
    }
  };

  // ── selectVariant ────────────────────────────────────────────────────────
  const selectVariant = async (variant: AdVariant) => {
    setSessions((prev) =>
      prev.map((s) =>
        s.id === activeSessionId ? { ...s, selectedVariantId: variant.id } : s
      )
    );

    const brandId = activeSession?.brand?.id ?? "";
    const platform = activeSession?.platform ?? "TikTok";

    const loadingMsg: Message = {
      role: "assistant",
      content: `Preparing a cinematic Sora prompt and opening-frame reference image for **${variant.label}** on ${platform}...`,
      type: "text",
    };
    setSessions((prev) =>
      prev.map((s) =>
        s.id === activeSessionId ? { ...s, messages: [...s.messages, loadingMsg] } : s
      )
    );

    try {
      const res = await fetch(`${API_BASE}/pipeline/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand_id: brandId,
          variant_id: variant.id,
          variant_label: variant.label,
          tone: variant.tone,
          style: variant.style,
          hook: variant.hook,
          cta: variant.cta,
          scenes: variant.scenes,
          resolution: "9:16",
          platform,
          use_ai_prompt: true,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const widgetUrl = `${MCP_WIDGET_BASE}/widgets/ad-studio?job_id=${data.job_id}&brand_id=${encodeURIComponent(brandId)}&api_base=${encodeURIComponent(API_BASE)}`;

        setStudioJobId(data.job_id);
        setStudioWidgetUrl(widgetUrl);
        setStudioVariantLabel(variant.label);
        setStudioPlatform(platform);
        setStudioStatus("rendering");
        setStudioProgress(5);
        setStudioStatusText("Submitting to OpenAI Sora…");
        setStudioVideoUrl("");
        setCriticData(null);
        setCriticError("");
        setAppliedFixes([]);
        setExportError("");
        setExportSuccess(false);
        setIsRemixJob(false);
        setStudioPanelOpen(true);
        setConceptsPanelOpen(false);

        const refName = (data as any).reference_image_name as string | undefined;
        const refPrompt = (data as any).reference_image_prompt as string | undefined;
        const refDataUrl = (data as any).reference_image_data_url as string | undefined;

        const studioMsg: Message = {
          role: "assistant",
          content:
            `Ad Studio is generating **${variant.label}** for ${platform} — Studio is open →\n\n` +
            `**Video prompt (exact text for OpenAI Sora)**\n` +
            `${data.video_prompt || "auto-generated cinematic prompt"}\n\n` +
            (refPrompt
              ? `**Opening-frame image prompt**\n${refPrompt}\n\n`
              : "") +
            (refName
              ? `**Reference image file**\n${refName}`
              : ""),
          type: "studio_opened",
          jobId: data.job_id,
          variantLabel: variant.label,
          platform,
          referenceImageUrl: refDataUrl,
          referenceImageName: refName,
        };
        setSessions((prev) =>
          prev.map((s) =>
            s.id === activeSessionId
              ? { ...s, messages: [...s.messages.slice(0, -1), studioMsg] }
              : s
          )
        );
      } else {
        throw new Error(`Pipeline error ${res.status}`);
      }
    } catch {
      setSessions((prev) =>
        prev.map((s) =>
          s.id === activeSessionId
            ? {
                ...s,
                messages: [
                  ...s.messages.slice(0, -1),
                  { role: "assistant" as const, content: "Pipeline couldn't start — check that the backend is running on port 8000.", type: "text" as const },
                ],
              }
            : s
        )
      );
    }
  };

  // ── sendMessage (SSE streaming) ──────────────────────────────────────────
  const sendMessage = async (overrideText?: string) => {
    const text = overrideText ?? input.trim();
    if (!text || isLoading) return;

    const userMsg: Message = { role: "user", content: text, type: "text" };
    setSessions((prev) =>
      prev.map((s) =>
        s.id === activeSessionId
          ? {
              ...s,
              title:
                s.title === "New Chat"
                  ? [
                      s.brand?.name ?? "Untitled brand",
                      s.platform,
                      text.slice(0, 30),
                    ]
                      .filter(Boolean)
                      .join(" · ")
                  : s.title,
              messages: [...s.messages, userMsg],
            }
          : s
      )
    );
    if (!overrideText) setInput("");
    setIsLoading(true);
    setLoadingStatus("Thinking...");

    try {
      const brandId = activeSession?.brand?.id ?? "";
      const platform = activeSession?.platform ?? "TikTok";

      // Build conversation history (skip non-text messages)
      const historyPayload = (activeSession?.messages ?? [])
        .slice(-10)
        .filter((m) => m.type === "text" || !m.type)
        .map((m) => ({ role: m.role, content: m.content.slice(0, 300) }));

      const res = await fetch(`${API_BASE}/chat/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand_id: brandId,
          message: text,
          session_id: activeSessionId,
          stream: true,
          platform,
          history: historyPayload,
        }),
      });
      if (!res.ok) throw new Error(`API error ${res.status}`);
      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalPlan: StoryPlan | null = null;
      let textReply = "";
      let currentEvent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            const raw = line.slice(6).trim();
            if (!raw) continue;
            try {
              const payload = JSON.parse(raw);
              if (currentEvent === "text_reply") {
                textReply = payload.text ?? "";
                currentEvent = "";
              } else if (currentEvent === "status") {
                if (payload.text) setLoadingStatus(payload.text);
                currentEvent = "";
              } else if (currentEvent === "story_plan") {
                if (payload.variants) finalPlan = payload as StoryPlan;
                currentEvent = "";
              } else {
                // Legacy / fallback: detect by payload shape
                if (payload.text && !payload.variants) setLoadingStatus(payload.text);
                else if (payload.variants) finalPlan = payload as StoryPlan;
              }
            } catch { /* ignore */ }
          }
        }
      }

      const plat = getPlatform(platform);
      let aiMsg: Message;

      if (textReply) {
        aiMsg = { role: "assistant", content: textReply, type: "text" };
      } else if (finalPlan && finalPlan.variants?.length) {
        const planWithPlatform: StoryPlan = { ...finalPlan, platform };
        aiMsg = {
          role: "assistant",
          content: `3 ${plat.label} ad concepts ready for: "${text}"`,
          type: "story_plan",
          storyPlan: planWithPlatform,
        };
        // Open concepts panel, close studio
        setConceptsPlan(planWithPlatform);
        setConceptsPanelOpen(true);
        setStudioPanelOpen(false);
      } else {
        aiMsg = {
          role: "assistant",
          content: "Couldn't generate a response. Check that GEMINI_API_KEY is set in backend/.env.",
          type: "text",
        };
      }

      setSessions((prev) =>
        prev.map((s) =>
          s.id === activeSessionId ? { ...s, messages: [...s.messages, aiMsg] } : s
        )
      );
    } catch {
      setSessions((prev) =>
        prev.map((s) =>
          s.id === activeSessionId
            ? { ...s, messages: [...s.messages, { role: "assistant" as const, content: "Couldn't reach the backend. Make sure FastAPI is running on port 8000.", type: "text" as const }] }
            : s
        )
      );
    }
    setIsLoading(false);
    setLoadingStatus("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  // ── Critic helpers ───────────────────────────────────────────────────────
  const runCritic = async () => {
    if (!studioJobId) return;
    setCriticLoading(true);
    setCriticError("");
    setCriticData(null);
    setExportError("");
    setExportSuccess(false);
    setRemixError("");
    try {
      const res = await fetch(`${API_BASE}/critic/evaluate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand_id: activeSession?.brand?.id ?? "", job_id: studioJobId }),
      });
      if (!res.ok) throw new Error(`Critic error ${res.status}`);
      setCriticData(await res.json());
    } catch (e: unknown) {
      setCriticError(e instanceof Error ? e.message : "Critic failed");
    }
    setCriticLoading(false);
  };

  const applyFix = async (fixType: string) => {
    if (!studioJobId) return;
    setApplyingFix(fixType);
    try {
      const res = await fetch(`${API_BASE}/critic/fix`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand_id: activeSession?.brand?.id ?? "", job_id: studioJobId, fix_type: fixType }),
      });
      if (!res.ok) throw new Error(`Fix error ${res.status}`);
      await runCritic();
      setAppliedFixes((prev) =>
        prev.includes(fixType) ? prev : [...prev, fixType]
      );
    } catch { /* show existing data */ }
    setApplyingFix(null);
  };

  const logExport = async () => {
    if (!studioJobId || !activeSession?.brand?.id || !criticData) return;
    setExporting(true);
    setExportError("");
    setExportSuccess(false);
    try {
      const res = await fetch(`${API_BASE}/learner/log-export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand_id: activeSession.brand.id,
          job_id: studioJobId,
          variant_id: activeSession.selectedVariantId ?? "",
          critique_scores: criticData.scores,
          fixes_applied: appliedFixes,
          hook_text: "",
          cta_text: "",
        }),
      });
      if (!res.ok) throw new Error(`Export error ${res.status}`);
      await res.json();
      setExportSuccess(true);
    } catch (e: unknown) {
      setExportError(
        e instanceof Error ? e.message : "Could not save export and learnings."
      );
    }
    setExporting(false);
  };

  const runRemix = async () => {
    if (!studioJobId || !activeSession?.brand?.id || !remixDraft.trim()) return;
    setRemixRunning(true);
    setRemixError("");
    setStudioVideoUrl("");
    setStudioStatus("rendering");
    setStudioProgress(5);
    setStudioStatusText("Submitting remix to OpenAI Sora…");
    setCriticData(null);
    setExportSuccess(false);
    setExportError("");
    setIsRemixJob(true);
    try {
      const res = await fetch(`${API_BASE}/pipeline/remix`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand_id: activeSession.brand.id,
          job_id: studioJobId,
          remix_prompt: remixDraft,
        }),
      });
      if (!res.ok) throw new Error(`Remix error ${res.status}`);
      const data = await res.json();
      setStudioJobId(data.job_id);
      setStudioStatus("rendering");
      setStudioProgress(5);
      setStudioStatusText("Remix sent to OpenAI Sora…");
    } catch (e: unknown) {
      setRemixError(
        e instanceof Error ? e.message : "Could not start remix render."
      );
      setStudioStatus("error");
    }
    setRemixRunning(false);
  };

  // ─────────────────────────────────────────────────────────────────────────
  // BRAND MEMORY DIALOG
  // ─────────────────────────────────────────────────────────────────────────
  const memoryDialog = (
    <Dialog open={memoryOpen} onOpenChange={setMemoryOpen}>
      <DialogContent className="sm:max-w-[520px] max-h-[80vh] overflow-y-auto" style={{ fontFamily: "DM Sans, sans-serif" }}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5 text-[16px] font-bold" style={{ color: "#1a1a1a", fontFamily: "Playfair Display, serif" }}>
            <Brain className="w-4 h-4" style={{ color: "#f97316" }} />
            Brand Memory
            {activeSession?.brand && (
              <span className="flex items-center gap-1.5 text-[12px] font-semibold px-2 py-0.5 rounded-full ml-1" style={{ background: `${activeSession.brand.color}18`, color: activeSession.brand.color }}>
                <span className="w-2 h-2 rounded-full" style={{ background: activeSession.brand.color }} />
                {activeSession.brand.name}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {memoryLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-5 h-5 animate-spin" style={{ color: "#f97316" }} />
          </div>
        ) : brandMemoryData ? (
          <div className="space-y-4 mt-1">

            {/* Identity */}
            <div className="rounded-xl p-3.5 space-y-2" style={{ background: "#faf9f7", border: "1px solid #f0ece8" }}>
              <p className="text-[10px] font-semibold uppercase tracking-widest flex items-center gap-1.5" style={{ color: "#bbb" }}>
                <Tag className="w-3 h-3" />Identity
              </p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  ["Name", brandMemoryData.name as string],
                  ["Tone", brandMemoryData.tone as string],
                  ["Tagline", brandMemoryData.tagline as string],
                  ["Color", brandMemoryData.color as string],
                ].map(([label, value]) => value ? (
                  <div key={label}>
                    <p className="text-[10px] font-body" style={{ color: "#bbb" }}>{label}</p>
                    <p className="text-[12px] font-semibold font-body" style={{ color: "#1a1a1a" }}>
                      {label === "Color" ? (
                        <span className="flex items-center gap-1.5">
                          <span className="w-3 h-3 rounded-full inline-block" style={{ background: value }} />{value}
                        </span>
                      ) : value}
                    </p>
                  </div>
                ) : null)}
              </div>
              {(brandMemoryData.description as string) && (
                <p className="text-[12px] leading-relaxed font-body" style={{ color: "#555" }}>{brandMemoryData.description as string}</p>
              )}
            </div>

            {/* Platforms */}
            {Array.isArray(brandMemoryData.platforms) && (brandMemoryData.platforms as string[]).length > 0 && (
              <div className="rounded-xl p-3.5 space-y-2" style={{ background: "#faf9f7", border: "1px solid #f0ece8" }}>
                <p className="text-[10px] font-semibold uppercase tracking-widest flex items-center gap-1.5" style={{ color: "#bbb" }}>
                  <Video className="w-3 h-3" />Platforms
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {(brandMemoryData.platforms as string[]).map((p: string) => {
                    const plat = PLATFORMS.find(pl => pl.id === p || pl.label === p);
                    return (
                      <span key={p} className="px-2.5 py-1 rounded-full text-[11px] font-semibold" style={{ background: plat ? plat.bg : "#f5f5f5", color: plat ? plat.color : "#666" }}>
                        {plat ? `${plat.icon} ${plat.label}` : p}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Brand rules */}
            {(() => {
              let rules: string[] = [];
              const raw = brandMemoryData.brand_rules;
              if (Array.isArray(raw)) rules = raw as string[];
              else if (typeof raw === "string") { try { rules = JSON.parse(raw); } catch { rules = []; } }
              return rules.length > 0 ? (
                <div className="rounded-xl p-3.5 space-y-2" style={{ background: "#faf9f7", border: "1px solid #f0ece8" }}>
                  <p className="text-[10px] font-semibold uppercase tracking-widest flex items-center gap-1.5" style={{ color: "#bbb" }}>
                    <ShieldCheck className="w-3 h-3" />Brand Rules
                  </p>
                  <ul className="space-y-1">
                    {rules.map((r: string, i: number) => (
                      <li key={i} className="flex items-start gap-2 text-[12px] font-body leading-relaxed" style={{ color: "#333" }}>
                        <CheckCircle2 className="w-3 h-3 shrink-0 mt-0.5" style={{ color: "#16a34a" }} />
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null;
            })()}

            {/* Learnings */}
            {(() => {
              let learnings: string[] = [];
              const raw = brandMemoryData.learnings;
              if (Array.isArray(raw)) learnings = raw as string[];
              else if (typeof raw === "string") { try { learnings = JSON.parse(raw); } catch { learnings = []; } }
              return learnings.length > 0 ? (
                <div className="rounded-xl p-3.5 space-y-2" style={{ background: "#fff7ed", border: "1px solid #fed7aa" }}>
                  <p className="text-[10px] font-semibold uppercase tracking-widest flex items-center gap-1.5" style={{ color: "#f97316" }}>
                    <BookOpen className="w-3 h-3" />AI Learnings
                    <span className="ml-1 px-1.5 py-0.5 rounded-full text-[9px]" style={{ background: "#f97316", color: "#fff" }}>{learnings.length}</span>
                  </p>
                  <ul className="space-y-1.5">
                    {learnings.map((l: string, i: number) => (
                      <li key={i} className="flex items-start gap-2 text-[12px] font-body leading-relaxed" style={{ color: "#7c3404" }}>
                        <Lightbulb className="w-3 h-3 shrink-0 mt-0.5" style={{ color: "#f97316" }} />
                        {l}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="rounded-xl p-3.5 text-center" style={{ background: "#faf9f7", border: "1px solid #f0ece8" }}>
                  <BookOpen className="w-5 h-5 mx-auto mb-1.5" style={{ color: "#ddd" }} />
                  <p className="text-[12px] font-body" style={{ color: "#bbb" }}>No learnings yet — they'll build up as you create ads.</p>
                </div>
              );
            })()}

            {/* Constraints */}
            {(() => {
              let constraints: string[] = [];
              const raw = brandMemoryData.constraints;
              if (Array.isArray(raw)) constraints = raw as string[];
              else if (typeof raw === "string") { try { constraints = JSON.parse(raw); } catch { constraints = []; } }
              return constraints.length > 0 ? (
                <div className="rounded-xl p-3.5 space-y-2" style={{ background: "#fff5f5", border: "1px solid #fecaca" }}>
                  <p className="text-[10px] font-semibold uppercase tracking-widest flex items-center gap-1.5" style={{ color: "#ef4444" }}>
                    <AlertTriangle className="w-3 h-3" />Constraints
                  </p>
                  <ul className="space-y-1">
                    {constraints.map((c: string, i: number) => (
                      <li key={i} className="flex items-start gap-2 text-[12px] font-body leading-relaxed" style={{ color: "#9a3412" }}>
                        <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" style={{ color: "#ef4444" }} />
                        {c}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null;
            })()}

          </div>
        ) : (
          <div className="py-8 text-center">
            <FileText className="w-8 h-8 mx-auto mb-2" style={{ color: "#ddd" }} />
            <p className="text-[13px] font-body" style={{ color: "#bbb" }}>No brand data found.</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // SIDEBAR
  // ─────────────────────────────────────────────────────────────────────────
  const sidebarContent = (
    <div className="h-full flex flex-col" style={{ background: "#fefefe" }}>
      <div className="px-4 py-3.5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5 cursor-pointer group" onClick={() => navigate("/")}>
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shadow-sm" style={{ background: "linear-gradient(135deg, #fb923c, #ea580c)" }}>
            <Link2 className="w-4 h-4 text-white" />
          </div>
          <span className="font-display text-[14px] font-bold group-hover:opacity-70 transition-opacity" style={{ color: "#1a1a1a" }}>Sip N'ads</span>
        </div>
        <button onClick={() => setSidebarOpen(false)} className="p-1.5 rounded-lg transition-all hover:bg-[#f5f3f0]" style={{ color: "#ccc" }}>
          <PanelLeftClose className="w-4 h-4" />
        </button>
      </div>

      {/* New chat */}
      <div className="px-3 pt-1 pb-3 shrink-0">
        <button onClick={createNewChat} className="w-full flex items-center justify-center gap-2 font-body font-semibold text-[13px] py-2.5 px-4 rounded-xl transition-all hover:shadow-md active:scale-[0.98]" style={{ background: "#1a1a1a", color: "#fff" }}>
          <Plus className="w-4 h-4" />New Chat
        </button>
      </div>

      {/* Platform picker */}
      <div className="px-3 pb-3 shrink-0">
        <p className="text-[10px] font-body font-semibold uppercase tracking-[0.12em] px-2 mb-1.5" style={{ color: "#ccc" }}>Platform</p>
        <div className="flex flex-col gap-1">
          {PLATFORMS.map((p) => {
            const active = activeSession?.platform === p.id;
            return (
              <button
                key={p.id}
                onClick={() => setSessionPlatform(p.id)}
                className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-[12px] font-semibold font-body transition-all"
                style={{
                  background: active ? p.bg : "transparent",
                  color: active ? p.color : "#aaa",
                  border: active ? `1px solid ${p.color}25` : "1px solid transparent",
                }}
              >
                <span className="text-base leading-none">{p.icon}</span>
                <span className="flex-1 text-left">{p.label}</span>
                <span className="text-[9px] font-normal" style={{ color: active ? p.color : "#ccc" }}>{p.format}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Brand */}
      <div className="px-3 pb-2 shrink-0">
        <p className="text-[10px] font-body font-semibold uppercase tracking-[0.12em] px-2 mb-1.5" style={{ color: "#ccc" }}>Brand</p>
        {activeSession?.brand ? (
          <Popover>
            <PopoverTrigger asChild>
              <button className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl transition-all hover:bg-[#f8f5f2] group" style={{ background: "#f8f5f2" }}>
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: activeSession.brand.color }} />
                <span className="text-[12px] font-semibold font-body flex-1 text-left truncate" style={{ color: "#1a1a1a" }}>{activeSession.brand.name}</span>
                <span className="text-[10px] font-body px-1.5 py-0.5 rounded-md" style={{ background: "#ede9e4", color: "#999" }}>{activeSession.brand.tone}</span>
                <ChevronDown className="w-3 h-3 opacity-40 group-hover:opacity-70" style={{ color: "#999" }} />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-[180px] p-2" align="start" style={{ fontFamily: "DM Sans, sans-serif" }}>
              <button onClick={() => setBrandPickerOpen(true)} className="w-full text-left px-3 py-2 rounded-lg text-[13px] font-body hover:bg-[#f8f5f2]" style={{ color: "#1a1a1a" }}>Switch Brand</button>
              <button
                onClick={openBrandMemory}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] font-body hover:bg-[#fff7ed] transition-colors"
                style={{ color: "#f97316" }}
              >
                <Brain className="w-3.5 h-3.5" />View Memory
              </button>
            </PopoverContent>
          </Popover>
        ) : (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: "#fafaf9" }}>
            <span className="text-[12px] font-body flex-1" style={{ color: "#ccc" }}>No brand</span>
            <button onClick={() => setBrandPickerOpen(true)} className="text-[11px] font-semibold font-body hover:opacity-70" style={{ color: "#f97316" }}>Select</button>
          </div>
        )}
      </div>

      {/* Recent */}
      <div className="px-5 pt-1 pb-1.5">
        <span className="text-[10px] font-body font-semibold uppercase tracking-[0.12em]" style={{ color: "#ccc" }}>Recent</span>
      </div>
      <div className="flex-1 overflow-y-auto px-2.5 pb-3 space-y-0.5">
        {sessions.map((session) => {
          const plat = getPlatform(session.platform ?? "TikTok");
          return (
            <div
              key={session.id}
              className="group flex items-start gap-2.5 px-3 py-2 rounded-xl cursor-pointer transition-all hover:bg-[#f8f5f2]"
              style={{ background: session.id === activeSessionId ? "#f8f5f2" : "transparent", color: session.id === activeSessionId ? "#1a1a1a" : "#999" }}
              onClick={() => setActiveSessionId(session.id)}
            >
              <MessageSquare className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: session.id === activeSessionId ? "#f97316" : "currentColor", opacity: session.id === activeSessionId ? 1 : 0.5 }} />
              <div className="flex-1 min-w-0">
                <span className="text-[12px] font-body truncate block">{session.title}</span>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {session.brand && (
                    <span className="text-[10px] font-body flex items-center gap-1" style={{ color: "#bbb" }}>
                      <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: session.brand.color }} />{session.brand.name}
                    </span>
                  )}
                  <span className="text-[10px] font-body" style={{ color: plat.color, opacity: 0.7 }}>{plat.icon} {plat.label}</span>
                </div>
              </div>
              <button onClick={(e) => { e.stopPropagation(); deleteSession(session.id); }} className="opacity-0 group-hover:opacity-100 transition-all hover:text-red-400 mt-0.5">
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Bottom nav */}
      <div className="px-3 py-2.5 shrink-0">
        <button onClick={() => navigate("/")} className="w-full flex items-center gap-2 font-body text-[13px] py-2 px-3 rounded-xl hover:bg-[#f8f5f2]" style={{ color: "#aaa" }}>
          <Home className="w-3.5 h-3.5" />Home
        </button>
        <button onClick={() => navigate("/templates")} className="w-full flex items-center gap-2 font-body text-[13px] py-2 px-3 rounded-xl hover:bg-[#f8f5f2]" style={{ color: "#aaa" }}>
          <LayoutTemplate className="w-3.5 h-3.5" />Templates
        </button>
      </div>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // CHAT AREA
  // ─────────────────────────────────────────────────────────────────────────
  const activePlat = getPlatform(activeSession?.platform ?? "TikTok");

  // Show quick suggestion chips only on new/short conversations
  const showSuggestions = !isLoading && (activeSession?.messages ?? []).length <= 2;

  const chatArea = (
    <div className="h-full flex flex-col min-w-0" style={{ background: "#faf9f7" }}>

      {/* Header */}
      <header className="h-[52px] flex items-center px-5 gap-3 shrink-0 border-b" style={{ background: "#fefefe", borderColor: "#f0ece8" }}>
        {!sidebarOpen && (
          <button onClick={() => setSidebarOpen(true)} className="p-1.5 rounded-lg hover:bg-[#f5f3f0] mr-1" style={{ color: "#bbb" }}>
            <PanelLeftOpen className="w-4 h-4" />
          </button>
        )}
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <h2 className="font-body text-[13px] font-semibold truncate" style={{ color: "#1a1a1a" }}>{activeSession?.title}</h2>
          {activeSession?.brand && (
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold font-body shrink-0" style={{ background: `${activeSession.brand.color}18`, color: activeSession.brand.color }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: activeSession.brand.color }} />{activeSession.brand.name}
            </span>
          )}
        </div>

        {/* Platform pill row (compact, in header) */}
        <div className="flex items-center gap-1 shrink-0">
          {PLATFORMS.map((p) => {
            const active = activeSession?.platform === p.id;
            return (
              <button
                key={p.id}
                onClick={() => setSessionPlatform(p.id)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold font-body transition-all"
                style={{
                  background: active ? p.bg : "transparent",
                  color: active ? p.color : "#ccc",
                  border: active ? `1px solid ${p.color}30` : "1px solid transparent",
                }}
              >
                <span>{p.icon}</span>{p.label}
              </button>
            );
          })}
        </div>

        {conceptsPanelOpen && !studioPanelOpen && (
          <div className="flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full ml-2" style={{ background: "#fff7ed", color: "#f97316" }}>
            <Clapperboard className="w-3 h-3" />Concepts
          </div>
        )}
        {studioPanelOpen && (
          <div className="flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full ml-2" style={{ background: "#fff7ed", color: "#f97316" }}>
            <Video className="w-3 h-3" />Studio
          </div>
        )}
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto no-scrollbar">
        <div className="w-full max-w-[min(860px,96vw)] mx-auto px-4 sm:px-6 py-8 space-y-5">
          {activeSession?.messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} animate-fade-in`}>
              {msg.role === "assistant" && (
                <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 mr-2.5 shadow-sm" style={{ background: "linear-gradient(135deg, #fb923c, #ea580c)" }}>
                  <Link2 className="w-3 h-3 text-white" />
                </div>
              )}

              {msg.type === "story_plan" && msg.storyPlan ? (
                <div className="flex-1 min-w-0 max-w-[min(680px,92vw)]">
                  {/* Context strip inline in chat */}
                  <ContextStrip
                    brandContext={msg.storyPlan.brand_context}
                    researchContext={msg.storyPlan.research_context}
                    storySummary={msg.storyPlan.story_summary}
                    variantCount={msg.storyPlan.variants?.length ?? 0}
                    onViewConcepts={() => {
                      setConceptsPlan(msg.storyPlan!);
                      setConceptsPanelOpen(true);
                      setStudioPanelOpen(false);
                    }}
                    onEditBrief={() => {
                      setInput(`Edit - `);
                      setTimeout(() => {
                        inputRef.current?.focus();
                      }, 0);
                    }}
                  />
                </div>
              ) : msg.type === "studio_opened" ? (
                <div
                  className="flex-1 max-w-[min(760px,92vw)] px-4 py-3 rounded-2xl rounded-bl-md font-body text-[13px] flex gap-3 items-start"
                  style={{ background: "#fff7ed", border: "1px solid #fed7aa" }}
                >
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5" style={{ background: "linear-gradient(135deg, #fb923c, #ea580c)" }}>
                    <Video className="w-4 h-4 text-white" />
                  </div>
                  <div className="flex-1 min-w-0 flex gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold mb-1" style={{ color: "#7c3404" }}>
                        {msg.variantLabel} · {msg.platform ?? activePlat.label}
                      </p>
                      <ReactMarkdown
                        components={{
                        p: ({ children }) => <p className="mb-1.5 last:mb-0 leading-[1.7] text-[13px]" style={{ color: "#7c3404" }}>{children}</p>,
                          strong: ({ children }) => <strong className="font-semibold" style={{ color: "#1a1a1a" }}>{children}</strong>,
                          em: ({ children }) => <em className="italic">{children}</em>,
                          ul: ({ children }) => <ul className="list-disc pl-4 mb-1.5 space-y-0.5">{children}</ul>,
                          ol: ({ children }) => <ol className="list-decimal pl-4 mb-1.5 space-y-0.5">{children}</ol>,
                          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                          code: ({ children }) => <code className="px-1 py-0.5 rounded text-[12px]" style={{ background: "#f5f0eb", color: "#7c3404" }}>{children}</code>,
                        }}
                      >
                        {msg.content}
                      </ReactMarkdown>
                    </div>
                    {msg.referenceImageUrl && (
                      <div className="shrink-0 flex flex-col items-center gap-1">
                        <span className="text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ color: "#f97316" }}>
                          Start frame
                        </span>
                        <div
                          className="rounded-xl overflow-hidden"
                          style={{
                            width: 72,
                            aspectRatio: "9 / 16",
                            border: "1px solid #fed7aa",
                            boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                            background: "#000",
                          }}
                        >
                          <img
                            src={msg.referenceImageUrl}
                            alt={msg.referenceImageName || "Reference image"}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        {msg.referenceImageName && (
                          <span className="text-[9px] text-center break-all" style={{ color: "#b45309" }}>
                            {msg.referenceImageName}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => setStudioPanelOpen(true)}
                    className="ml-2 shrink-0 flex items-center gap-1 text-[11px] font-semibold px-3 py-1.5 rounded-lg hover:opacity-80"
                    style={{ background: "#f97316", color: "#fff" }}
                  >
                    <ExternalLink className="w-3 h-3" />Open Studio
                  </button>
                </div>
              ) : (
                <div
                  className={`max-w-[85%] sm:max-w-[75%] px-4 py-3 font-body text-[13.5px] ${msg.role === "user" ? "rounded-[18px] rounded-br-md" : "rounded-[18px] rounded-bl-md"}`}
                  style={msg.role === "user"
                    ? { background: "linear-gradient(135deg, #fb923c, #ea580c)", color: "#fff", boxShadow: "0 2px 8px rgba(249,115,22,0.2)" }
                    : { background: "#fff", color: "#3a3a3a", border: "1px solid #f0ece8", boxShadow: "0 1px 3px rgba(0,0,0,0.02)" }
                  }
                >
                  {msg.role === "user" ? (
                    <span className="whitespace-pre-line">{msg.content}</span>
                  ) : (
                    <ReactMarkdown
                      components={{
                        p: ({ children }) => <p className="mb-1.5 last:mb-0 leading-[1.7]">{children}</p>,
                        strong: ({ children }) => <strong className="font-semibold" style={{ color: "#1a1a1a" }}>{children}</strong>,
                        em: ({ children }) => <em className="italic">{children}</em>,
                        ul: ({ children }) => <ul className="list-disc pl-4 mb-1.5 space-y-0.5">{children}</ul>,
                        ol: ({ children }) => <ol className="list-decimal pl-4 mb-1.5 space-y-0.5">{children}</ol>,
                        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                        h1: ({ children }) => <h1 className="font-bold text-[15px] mb-1 mt-1" style={{ color: "#1a1a1a" }}>{children}</h1>,
                        h2: ({ children }) => <h2 className="font-bold text-[14px] mb-1 mt-1" style={{ color: "#1a1a1a" }}>{children}</h2>,
                        h3: ({ children }) => <h3 className="font-semibold text-[13px] mb-0.5 mt-1" style={{ color: "#333" }}>{children}</h3>,
                        code: ({ children }) => <code className="px-1 py-0.5 rounded text-[12px]" style={{ background: "#f5f0eb", color: "#7c3404" }}>{children}</code>,
                        hr: () => <hr className="my-2" style={{ borderColor: "#f0ece8" }} />,
                        a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" className="underline hover:opacity-70" style={{ color: "#f97316" }}>{children}</a>,
                      }}
                    >
                      {msg.content}
                    </ReactMarkdown>
                  )}
                </div>
              )}
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start animate-fade-in">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 mr-2.5 shadow-sm" style={{ background: "linear-gradient(135deg, #fb923c, #ea580c)" }}>
                <Link2 className="w-3 h-3 text-white" />
              </div>
              <div className="rounded-[18px] rounded-bl-md px-4 py-3 min-w-[200px]" style={{ background: "#fff", border: "1px solid #f0ece8" }}>
                {loadingStatus && (
                  <div className="flex items-center gap-2 mb-2">
                    <Search className="w-3 h-3 shrink-0 animate-pulse" style={{ color: "#f97316" }} />
                    <p className="text-[11px] font-body" style={{ color: "#888" }}>{loadingStatus}</p>
                  </div>
                )}
                <div className="flex gap-1.5 items-center">
                  {[0, 150, 300].map((delay) => (
                    <span key={delay} className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: "#f97316", opacity: 0.6, animationDelay: `${delay}ms` }} />
                  ))}
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input area */}
      <div className="px-4 sm:px-6 pb-4 pt-2 shrink-0">
        <div className="w-full max-w-[min(860px,96vw)] mx-auto">

          {/* Quick suggestion chips */}
          {showSuggestions && (
            <div className="flex flex-wrap gap-1.5 mb-2.5">
              {QUICK_SUGGESTIONS.map((s) => (
                <button
                  key={s.label}
                  onClick={() => sendMessage(s.label)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold font-body transition-all hover:shadow-sm active:scale-[0.97]"
                  style={{ background: "#fff", border: "1px solid #eee", color: "#888" }}
                >
                  {s.icon}{s.label}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-end gap-1.5 rounded-2xl p-2" style={{ background: "#fff", border: "1px solid #eee", boxShadow: "0 1px 12px rgba(0,0,0,0.04)" }}>
            <div className="flex gap-0 pb-0.5">
              <button className="p-2 rounded-lg hover:bg-[#fff7ed]" style={{ color: "#d4d4d4" }} title="Attach image"><Image className="w-[17px] h-[17px]" /></button>
              <button className="p-2 rounded-lg hover:bg-[#fff7ed]" style={{ color: "#d4d4d4" }} title="Attach file"><Paperclip className="w-[17px] h-[17px]" /></button>
            </div>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Message SipN'ads${activeSession?.brand ? ` · ${activeSession.brand.name}` : ""}...`}
              rows={1}
              className="flex-1 resize-none bg-transparent font-body text-[13.5px] focus:outline-none py-2 px-1.5 max-h-32"
              style={{ color: "#222", caretColor: "#f97316" }}
            />
            <button
              onClick={() => sendMessage()}
              disabled={!input.trim() || isLoading}
              className="p-2 rounded-xl transition-all disabled:opacity-25 active:scale-95 mb-0.5"
              style={{ background: input.trim() ? "linear-gradient(135deg, #fb923c, #ea580c)" : "#eee", color: "#fff", boxShadow: input.trim() ? "0 2px 8px rgba(249,115,22,0.25)" : "none" }}
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
          <p className="text-center font-body text-[10px] mt-2" style={{ color: "#d4d4d4" }}>
            {activePlat.icon} {activePlat.label} · 9:16 vertical · Sora (OpenAI Videos) · Short-form ads
          </p>
        </div>
      </div>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // STUDIO PANEL — video preview + Gemini critic
  // ─────────────────────────────────────────────────────────────────────────
  const studioPlat = getPlatform(studioPlatform);

  const CRITIC_META: Record<string, { label: string; icon: React.ReactNode; fixLabel: string }> = {
    hook_strength:    { label: "Hook Strength",        icon: <Zap className="w-3 h-3" />,        fixLabel: "Strengthen hook" },
    cta_clarity:      { label: "CTA Clarity",          icon: <Sparkles className="w-3 h-3" />,   fixLabel: "Improve CTA" },
    brand_compliance: { label: "Brand & Craft",        icon: <ShieldCheck className="w-3 h-3" />, fixLabel: "Fix brand/craft" },
    visual_quality:   { label: "Visual Quality",       icon: <Video className="w-3 h-3" />,      fixLabel: "Sharpen visuals" },
    motion_pacing:    { label: "Motion & Pacing",      icon: <RefreshCw className="w-3 h-3" />,  fixLabel: "Smooth pacing" },
    text_clarity:     { label: "Text Clarity",         icon: <Sparkles className="w-3 h-3" />,   fixLabel: "Clarify text" },
    safety:           { label: "Safety & Policy",      icon: <AlertTriangle className="w-3 h-3" />, fixLabel: "Fix safety issues" },
    prompt_adherence: { label: "Prompt Adherence",     icon: <Video className="w-3 h-3" />,      fixLabel: "Align with prompt" },
  };

  const scoreColor = (s: number) => s >= 8 ? "#16a34a" : s >= 6 ? "#d97706" : "#ef4444";
  const scoreBg    = (s: number) => s >= 8 ? "#f0fdf4" : s >= 6 ? "#fffbeb" : "#fff5f5";
  const exportAverageScore =
    criticData && Object.keys(criticData.scores).length
      ? Object.values(criticData.scores).reduce((sum, v) => sum + v, 0) /
        Object.values(criticData.scores).length
      : 0;
  const canExport =
    !!criticData && !exporting;

  const studioPanel = (
    <div className="h-full flex flex-col" style={{ background: "#fafaf9" }}>
      {/* Header */}
      <div
        className="h-[56px] flex items-center px-4 gap-3 shrink-0 border-b"
        style={{ borderColor: "#f0ece8", background: "linear-gradient(90deg,#fefefe,#fdf7f2)" }}
      >
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg, #fb923c, #ea580c)" }}>
          <Clapperboard className="w-3.5 h-3.5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-col">
            {isRemixJob && (
              <span className="text-[10px] font-semibold font-body uppercase tracking-[0.16em] mb-0.5" style={{ color: "#f97316" }}>
                Remix
              </span>
            )}
            <p className="text-[12px] font-semibold font-body truncate" style={{ color: "#1a1a1a" }}>
              {studioVariantLabel || "Ad Studio"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold font-body" style={{ color: studioPlat.color }}>
              {studioPlat.icon} {studioPlat.label}
            </span>
            <span className="text-[10px] font-body" style={{ color: "#bbb" }}>
              9:16 · Sora (OpenAI Videos)
            </span>
          </div>
        </div>
        <button onClick={() => setStudioPanelOpen(false)} className="p-1.5 rounded-lg hover:bg-[#f5f3f0]" style={{ color: "#ccc" }}>
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Content: full panel scroll (video + critic), scrollbar visually hidden */}
      <div
        className="flex-1 flex flex-col items-stretch px-4 py-5 gap-4"
        style={{
          overflowY: "auto",
          scrollbarWidth: "none",
          msOverflowStyle: "none",
        }}
      >

        {studioStatus === "rendering" && (
          <div className="w-full space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold font-body" style={{ color: "#888" }}>Generating with OpenAI Sora</span>
              <span className="text-[11px] font-semibold font-body" style={{ color: "#f97316" }}>{studioProgress}%</span>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ background: "#f0ece8" }}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${studioProgress}%`, background: "linear-gradient(90deg, #fb923c, #ea580c)" }}
              />
            </div>
            <p className="text-[11px] font-body text-center animate-pulse" style={{ color: "#aaa" }}>{studioStatusText || "OpenAI Sora generating..."}</p>
          </div>
        )}

        {studioStatus === "error" && (
          <div className="w-full rounded-xl px-4 py-3" style={{ background: "#fff5f5", border: "1px solid #fecaca" }}>
            <p className="text-[12px] font-semibold mb-1" style={{ color: "#ef4444" }}>Generation failed</p>
            <p className="text-[11px] leading-relaxed" style={{ color: "#9a3412" }}>{studioStatusText}</p>
            <button onClick={() => { setStudioStatus("pending"); setStudioProgress(0); }} className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: "#f97316" }}>
              <RefreshCw className="w-3 h-3" />Retry
            </button>
          </div>
        )}

        {studioVideoUrl && (
          <>
            <div
              className="flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-semibold self-start shadow-sm"
              style={{ background: "#f0fdf4", color: "#16a34a", border: "1px solid #bbf7d0" }}
            >
              <CheckCircle2 className="w-3 h-3" />
              <span>Video ready · {studioPlat.label}</span>
            </div>

            <div
              className="relative rounded-[28px] overflow-hidden self-center flex-shrink-0 transition-transform duration-300 hover:scale-[1.03]"
              style={{
                height: "min(420px, 70vh)",
                aspectRatio: "9 / 16",
                maxWidth: "260px",
                background: "#000",
                border: "3px solid #1a1a1a",
                boxShadow: "0 16px 48px rgba(0,0,0,0.25), inset 0 0 0 1px rgba(255,255,255,0.06)",
              }}
            >
              <div className="absolute top-2.5 left-1/2 -translate-x-1/2 z-10 w-12 h-3.5 rounded-full" style={{ background: "#1a1a1a" }} />
              <video
                src={studioVideoUrl}
                controls
                autoPlay
                loop
                playsInline
                className="w-full h-full object-cover"
              />
              <div
                className="absolute bottom-3 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1"
                style={{ background: `${studioPlat.color}dd`, color: "#fff" }}
              >
                {studioPlat.icon} <span>{studioPlat.label}</span>
              </div>
            </div>

            <div className="flex gap-2 w-full">
              <a
                href={studioVideoUrl}
                download={`sipnads_${(studioVariantLabel || "ad").replace(/\s/g, "_")}.mp4`}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[12px] font-semibold font-body hover:opacity-90 transition-all"
                style={{ background: "linear-gradient(135deg, #fb923c, #ea580c)", color: "#fff" }}
              >
                <Download className="w-3.5 h-3.5" />Download MP4
              </a>
              <a href={studioVideoUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-center px-3 rounded-xl hover:bg-[#f0ece8] transition-all"
                style={{ border: "1px solid #e8e4e0", color: "#aaa" }}>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>

            {/* Critic block (now part of full-panel scroll) */}
            <div className="w-full space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[12px] font-semibold font-body" style={{ color: "#1a1a1a" }}>AI Critic</p>
                {criticData && !criticLoading && (
                  <button onClick={runCritic} className="text-[10px] font-body flex items-center gap-1 hover:opacity-70" style={{ color: "#aaa" }}>
                    <RefreshCw className="w-2.5 h-2.5" />Re-run
                  </button>
                )}
              </div>

              {!criticData && !criticLoading && (
                <button
                  onClick={runCritic}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[12px] font-semibold font-body transition-all hover:opacity-90 active:scale-[0.98]"
                  style={{ background: "#1a1a1a", color: "#fff" }}
                >
                  <Sparkles className="w-3.5 h-3.5" />Run Gemini Critic
                </button>
              )}

              {criticLoading && (
                <div className="flex items-center justify-center gap-2 py-4">
                  <Loader2 className="w-4 h-4 animate-spin" style={{ color: "#f97316" }} />
                  <span className="text-[12px] font-body" style={{ color: "#888" }}>Gemini evaluating...</span>
                </div>
              )}

              {criticError && !criticLoading && (
                <p className="text-[11px] text-center" style={{ color: "#ef4444" }}>{criticError}</p>
              )}

              {criticData && !criticLoading && (
                <div className="space-y-2.5">
                  <div className="px-3.5 py-2.5 rounded-xl space-y-2" style={{ background: "#f8f5f2", border: "1px solid #f0ece8" }}>
                    <p className="text-[11px] font-semibold mb-1" style={{ color: "#1a1a1a" }}>
                      {criticData.overall}
                    </p>
                    {criticData.remix_prompt && (
                      <div className="mt-2 space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[10px] font-semibold" style={{ color: "#555" }}>
                            Edit Sora remix prompt
                          </p>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => navigator.clipboard.writeText(remixDraft || criticData.remix_prompt!)}
                              className="px-2 py-0.5 rounded-md text-[9px] font-semibold border hover:bg-[#f3f0eb] transition-colors"
                              style={{ borderColor: "#d7d0c7", color: "#1a1a1a", background: "#fff" }}
                            >
                              Copy
                            </button>
                            <button
                              type="button"
                              onClick={runRemix}
                              disabled={!remixDraft.trim() || remixRunning}
                              className="px-2 py-0.5 rounded-md text-[9px] font-semibold border hover:bg-[#f9731615] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                              style={{ borderColor: "#f97316", color: "#b45309", background: "#fff7ed" }}
                            >
                              {remixRunning ? "Remixing…" : "Remix video"}
                            </button>
                          </div>
                        </div>
                        <div
                          className="relative rounded-lg border text-[10px] font-mono leading-snug"
                          style={{ borderColor: "#e2ded8", background: "#fbfaf8", color: "#222" }}
                        >
                          <textarea
                            value={remixDraft}
                            onChange={(e) => setRemixDraft(e.target.value)}
                            rows={4}
                            className="w-full bg-transparent outline-none resize-vertical px-2 py-1.5 pr-3"
                            style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace", fontSize: 10, color: "#222" }}
                          />
                        </div>
                        {remixError && (
                          <p className="text-[10px]" style={{ color: "#ef4444" }}>
                            {remixError}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                  {Object.entries(CRITIC_META).map(([key, meta]) => {
                    const score = criticData.scores[key] ?? 0;
                    const verdict = criticData.verdicts[key];
                    const suggestion = criticData.suggestions[key];
                    const isApplying = applyingFix === key;
                    return (
                      <div key={key} className="rounded-xl overflow-hidden" style={{ border: `1px solid ${scoreColor(score)}22`, background: scoreBg(score) }}>
                        <div className="px-3 py-2.5 flex items-center gap-2">
                          <span style={{ color: scoreColor(score) }}>{meta.icon}</span>
                          <span className="text-[11px] font-semibold font-body flex-1" style={{ color: "#1a1a1a" }}>{meta.label}</span>
                          <span className="text-[13px] font-bold font-body" style={{ color: scoreColor(score) }}>{score}/10</span>
                          {verdict === "accept" ? (
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" style={{ color: "#16a34a" }} />
                          ) : (
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" style={{ color: "#d97706" }} />
                          )}
                        </div>
                        {suggestion && (
                          <div className="px-3 pb-2.5">
                            <p className="text-[11px] leading-relaxed" style={{ color: "#555" }}>{suggestion}</p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <div className="mt-2 space-y-1.5">
                    <button
                      type="button"
                      disabled={!canExport}
                      onClick={logExport}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[12px] font-semibold font-body transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 active:scale-[0.98]"
                      style={{
                        background: canExport
                          ? "linear-gradient(135deg, #22c55e, #16a34a)"
                          : "#e5e5e5",
                        color: canExport ? "#fff" : "#999",
                      }}
                    >
                      {exporting ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          Saving export & brand learnings...
                        </>
                      ) : exportSuccess ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Appreciated — saved to brand memory
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5" />
                          Appreciate this ad · save learnings
                        </>
                      )}
                    </button>
                    {exportError && (
                      <p className="text-[10px] text-center" style={{ color: "#ef4444" }}>
                        {exportError}
                      </p>
                    )}
                    {!exportSuccess && !exportError && criticData && (
                      <p className="text-[10px] text-center" style={{ color: "#a3a3a3" }}>
                        Scores average {exportAverageScore.toFixed(1)}/10 — every export teaches
                        brand memory; only very high scores become templates.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {studioStatus !== "rendering" && studioStatus !== "error" && !studioVideoUrl && (
          <div className="flex flex-col items-center gap-3 text-center py-8">
            <div className="rounded-[28px] flex items-center justify-center" style={{ width: "min(160px, 55%)", aspectRatio: "9/16", background: "#f0ece8", border: "3px solid #e0dbd5" }}>
              <div className="flex flex-col items-center gap-2">
                <Video className="w-7 h-7" style={{ color: "#d4cfc9" }} />
                <span className="text-[10px] font-body" style={{ color: "#ccc" }}>9:16</span>
              </div>
            </div>
            <p className="text-[12px] font-body" style={{ color: "#bbb" }}>Select a variant to generate</p>
          </div>
        )}
      </div>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // CONCEPTS PANEL
  // ─────────────────────────────────────────────────────────────────────────
  const conceptsActivePlat = getPlatform(conceptsPlan?.platform as Platform ?? activeSession?.platform ?? "TikTok");

  const conceptsPanel = (
    <div className="h-full flex flex-col" style={{ background: "#fafaf9" }}>
      {/* Header */}
      <div className="h-[52px] flex items-center px-4 gap-3 shrink-0 border-b" style={{ borderColor: "#f0ece8", background: "#fefefe" }}>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: "linear-gradient(135deg, #fb923c, #ea580c)" }}>
          <Clapperboard className="w-3.5 h-3.5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-semibold font-body" style={{ color: "#1a1a1a" }}>Ad Concepts</p>
          <div className="flex items-center gap-2">
            {conceptsPlan?.brand_context && (
              <span className="text-[10px] font-semibold font-body" style={{ color: conceptsPlan.brand_context.color }}>
                {conceptsPlan.brand_context.name}
              </span>
            )}
            <span className="text-[10px] font-body" style={{ color: conceptsActivePlat.color }}>
              {conceptsActivePlat.icon} {conceptsActivePlat.label} · 9:16
            </span>
            <span className="text-[10px] font-body" style={{ color: "#bbb" }}>
              Sora (OpenAI Videos)
            </span>
          </div>
        </div>
        <button onClick={() => setConceptsPanelOpen(false)} className="p-1.5 rounded-lg hover:bg-[#f5f3f0]" style={{ color: "#ccc" }}>
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Variant list */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 no-scrollbar">
        {conceptsPlan?.variants.map((variant) => (
          <VariantCard
            key={variant.id}
            variant={variant}
            isSelected={activeSession?.selectedVariantId === variant.id}
            onSelect={() => selectVariant(variant)}
            platformLabel={conceptsActivePlat.label}
          />
        ))}
        {(!conceptsPlan?.variants?.length) && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Clapperboard className="w-8 h-8 mb-3" style={{ color: "#ddd" }} />
            <p className="text-[12px] font-body" style={{ color: "#bbb" }}>No concepts yet</p>
          </div>
        )}
      </div>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // LAYOUT
  // ─────────────────────────────────────────────────────────────────────────
  const rightPanelOpen = conceptsPanelOpen || studioPanelOpen;
  const chatSize = sidebarOpen && rightPanelOpen ? 44 : sidebarOpen ? 82 : rightPanelOpen ? 58 : 100;

  return (
    <>
      <BrandPickerModal open={brandPickerOpen} onSelect={handleBrandSelect} onSkip={handleBrandSkip} onClose={handleBrandPickerClose} />
      {memoryDialog}

      <div className="h-screen">
        {!sidebarOpen && !rightPanelOpen ? (
          chatArea
        ) : (
          <ResizablePanelGroup direction="horizontal">
            {sidebarOpen && (
              <React.Fragment key="sidebar-group">
                <ResizablePanel defaultSize={20} minSize={16} maxSize={32}>
                  {sidebarContent}
                </ResizablePanel>
                <ResizableHandle />
              </React.Fragment>
            )}
            <ResizablePanel defaultSize={chatSize} minSize={30}>
              {chatArea}
            </ResizablePanel>
            {rightPanelOpen && (
              <React.Fragment key="right-panel-group">
                <ResizableHandle />
                <ResizablePanel defaultSize={36} minSize={22} maxSize={52}>
                  {studioPanelOpen ? studioPanel : conceptsPanel}
                </ResizablePanel>
              </React.Fragment>
            )}
          </ResizablePanelGroup>
        )}
      </div>
    </>
  );
};

export default Chat;
