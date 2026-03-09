import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Upload,
  X,
  Link2,
  Loader2,
} from "lucide-react";

const API = "http://localhost:8000";

const TONES = ["Playful", "Premium", "Bold", "Minimal"];
const PLATFORMS = ["TikTok", "Instagram", "YouTube"];
const COLORS = [
  "#1a1a1a", "#ffffff",
  "#f97316", "#ef4444", "#ec4899", "#a855f7",
  "#3b82f6", "#06b6d4", "#10b981", "#eab308",
];

type FormState = {
  name: string;
  tagline: string;
  description: string;
  tone: string;
  color: string;
  platforms: string[];
  logo: File | null;
  productImages: File[];   // still images only
  videoClips: File[];      // video clips only
};

const Onboard = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormState>({
    name: "",
    tagline: "",
    description: "",
    tone: "Bold",
    color: "#f97316",
    platforms: [],
    logo: null,
    productImages: [],
    videoClips: [],
  });
  const logoInputRef = useRef<HTMLInputElement>(null);
  const productInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const mutation = useMutation({
    mutationFn: async (data: FormState) => {
      const fd = new FormData();
      fd.append("name", data.name);
      fd.append("tone", data.tone);
      fd.append("color", data.color);
      fd.append("tagline", data.tagline);
      fd.append("description", data.description);
      fd.append("platforms", data.platforms.join(","));
      if (data.logo) fd.append("logo", data.logo);
      data.productImages.forEach((img) => fd.append("product_images", img));
      data.videoClips.forEach((vid) => fd.append("product_images", vid)); // videos go into same bucket

      const res = await fetch(`${API}/brand/onboard`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      navigate("/chat");
    },
  });

  const update = (key: keyof FormState, val: unknown) =>
    setForm((prev) => ({ ...prev, [key]: val }));

  const togglePlatform = (p: string) =>
    setForm((prev) => ({
      ...prev,
      platforms: prev.platforms.includes(p)
        ? prev.platforms.filter((x) => x !== p)
        : [...prev.platforms, p],
    }));

  const canNext = () => {
    if (step === 1) return form.name.trim().length > 0 && form.tone;
    // Require logo AND at least 1 product image so the AI has enough visual context
    if (step === 2) return form.logo !== null && form.productImages.length >= 1;
    if (step === 3) return form.platforms.length > 0;
    return true;
  };

  const handleNext = () => {
    if (step < 3) setStep(step + 1);
    else mutation.mutate(form);
  };

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: "linear-gradient(135deg, #fff8f3 0%, #fef3e8 100%)" }}
    >
      {/* Nav */}
      <nav className="px-6 py-4 flex items-center gap-3">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2.5 group"
        >
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center shadow-sm"
            style={{ background: "linear-gradient(135deg, #fb923c, #ea580c)" }}
          >
            <Link2 className="w-3.5 h-3.5 text-white" />
          </div>
          <span
            className="font-display text-[15px] font-bold group-hover:opacity-70 transition-opacity"
            style={{ color: "#1a1a1a" }}
          >
            Sip N'ads
          </span>
        </button>
      </nav>

      {/* Progress bar */}
      <div className="px-6">
        <div
          className="max-w-xl mx-auto h-1 rounded-full overflow-hidden"
          style={{ background: "#f0ece8" }}
        >
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${(step / 3) * 100}%`,
              background: "linear-gradient(90deg, #fb923c, #ea580c)",
            }}
          />
        </div>
        <p
          className="max-w-xl mx-auto text-right text-[11px] font-body mt-1"
          style={{ color: "#bbb" }}
        >
          Step {step} of 3
        </p>
      </div>

      {/* Card */}
      <div className="flex-1 flex items-center justify-center px-4 py-8">
        <div
          className="w-full max-w-xl rounded-3xl p-8 shadow-sm"
          style={{ background: "#fff", border: "1px solid #f0ece8" }}
        >
          {/* Step 1 — Brand Identity */}
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <h1
                  className="font-display text-[24px] font-bold leading-tight"
                  style={{ color: "#1a1a1a" }}
                >
                  Tell us about your brand
                </h1>
                <p className="font-body text-[13px] mt-1" style={{ color: "#999" }}>
                  This will be used to generate on-brand ad concepts every time.
                </p>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="font-body text-[12px] font-semibold" style={{ color: "#555" }}>
                    Brand Name *
                  </label>
                  <input
                    value={form.name}
                    onChange={(e) => update("name", e.target.value)}
                    placeholder="e.g. Velvet Cola"
                    className="mt-1 w-full px-4 py-2.5 rounded-xl font-body text-[14px] focus:outline-none transition-all"
                    style={{
                      background: "#faf9f7",
                      border: "1px solid #eee",
                      color: "#1a1a1a",
                    }}
                  />
                </div>

                <div>
                  <label className="font-body text-[12px] font-semibold" style={{ color: "#555" }}>
                    Tagline
                  </label>
                  <input
                    value={form.tagline}
                    onChange={(e) => update("tagline", e.target.value)}
                    placeholder="e.g. Taste the dark side"
                    className="mt-1 w-full px-4 py-2.5 rounded-xl font-body text-[14px] focus:outline-none"
                    style={{ background: "#faf9f7", border: "1px solid #eee", color: "#1a1a1a" }}
                  />
                </div>

                <div>
                  <label className="font-body text-[12px] font-semibold" style={{ color: "#555" }}>
                    Brand Description
                  </label>
                  <textarea
                    value={form.description}
                    onChange={(e) => update("description", e.target.value)}
                    placeholder="Describe your brand, products, target audience, and what makes you unique..."
                    rows={3}
                    className="mt-1 w-full px-4 py-2.5 rounded-xl font-body text-[14px] focus:outline-none resize-none"
                    style={{ background: "#faf9f7", border: "1px solid #eee", color: "#1a1a1a" }}
                  />
                </div>

                <div>
                  <label className="font-body text-[12px] font-semibold" style={{ color: "#555" }}>
                    Tone *
                  </label>
                  <div className="flex gap-2 mt-1.5 flex-wrap">
                    {TONES.map((t) => (
                      <button
                        key={t}
                        onClick={() => update("tone", t)}
                        className="px-4 py-1.5 rounded-full font-body text-[13px] font-semibold transition-all"
                        style={
                          form.tone === t
                            ? { background: "#1a1a1a", color: "#fff" }
                            : { background: "#f5f3f0", color: "#777" }
                        }
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="font-body text-[12px] font-semibold" style={{ color: "#555" }}>
                    Brand Color
                  </label>
                  <div className="flex gap-2 mt-1.5 flex-wrap">
                    {COLORS.map((c) => (
                      <button
                        key={c}
                        onClick={() => update("color", c)}
                        className="w-7 h-7 rounded-full transition-all hover:scale-110"
                        style={{
                          background: c,
                          border: c === "#ffffff" ? "1.5px solid #e0dbd5" : "none",
                          outline: form.color === c
                            ? `3px solid ${c === "#ffffff" ? "#aaa" : c}`
                            : "none",
                          outlineOffset: "2px",
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 2 — Assets */}
          {step === 2 && (
            <div className="space-y-5">
              <div>
                <h1
                  className="font-display text-[24px] font-bold leading-tight"
                  style={{ color: "#1a1a1a" }}
                >
                  Upload your brand assets
                </h1>
                <p className="font-body text-[13px] mt-1" style={{ color: "#999" }}>
                  The AI uses these to auto-match visuals to scenes and stay on-brand.
                </p>
              </div>

              {/* Why this matters banner */}
              <div
                className="flex gap-3 px-4 py-3 rounded-xl"
                style={{ background: "#fff8f3", border: "1px solid #fed7aa" }}
              >
                <span className="text-[18px] shrink-0">🧠</span>
                <p className="font-body text-[12px] leading-relaxed" style={{ color: "#92400e" }}>
                  <strong>Logo + at least 1 product image are required</strong> so the AI has
                  enough visual memory to generate accurate scenes in steps 2 and 3.
                  Adding video clips gives it motion style references too.
                </p>
              </div>

              {/* Logo upload — required */}
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <label className="font-body text-[12px] font-semibold" style={{ color: "#555" }}>
                    Logo
                  </label>
                  <span
                    className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                    style={{ background: "#fef3e8", color: "#f97316" }}
                  >
                    Required
                  </span>
                  {form.logo && (
                    <span
                      className="text-[10px] font-semibold px-1.5 py-0.5 rounded ml-auto"
                      style={{ background: "#dcfce7", color: "#16a34a" }}
                    >
                      ✓ Added
                    </span>
                  )}
                </div>
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => update("logo", e.target.files?.[0] ?? null)}
                />
                {form.logo ? (
                  <div
                    className="flex items-center gap-3 px-4 py-3 rounded-xl"
                    style={{ background: "#f8f5f2", border: "1px solid #eee" }}
                  >
                    <img
                      src={URL.createObjectURL(form.logo)}
                      alt="logo"
                      className="w-10 h-10 object-contain rounded-lg"
                    />
                    <span className="font-body text-[13px] flex-1 truncate" style={{ color: "#555" }}>
                      {form.logo.name}
                    </span>
                    <button onClick={() => update("logo", null)}>
                      <X className="w-4 h-4" style={{ color: "#ccc" }} />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => logoInputRef.current?.click()}
                    className="w-full flex flex-col items-center gap-2 py-5 rounded-xl border-2 border-dashed transition-all hover:border-orange-300"
                    style={{ borderColor: "#f97316" }}
                  >
                    <Upload className="w-5 h-5" style={{ color: "#f97316" }} />
                    <span className="font-body text-[13px]" style={{ color: "#f97316" }}>
                      Click to upload logo
                    </span>
                  </button>
                )}
              </div>

              {/* Product images — required (at least 1) */}
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <label className="font-body text-[12px] font-semibold" style={{ color: "#555" }}>
                    Product Images
                  </label>
                  <span
                    className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                    style={{ background: "#fef3e8", color: "#f97316" }}
                  >
                    Required (min 1)
                  </span>
                  {form.productImages.length > 0 && (
                    <span
                      className="text-[10px] font-semibold px-1.5 py-0.5 rounded ml-auto"
                      style={{ background: "#dcfce7", color: "#16a34a" }}
                    >
                      ✓ {form.productImages.length} added
                    </span>
                  )}
                </div>
                <input
                  ref={productInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? []);
                    update("productImages", [...form.productImages, ...files]);
                  }}
                />
                {form.productImages.length > 0 && (
                  <div className="grid grid-cols-4 gap-2 mb-2">
                    {form.productImages.map((f, i) => (
                      <div key={i} className="relative group aspect-square">
                        <img
                          src={URL.createObjectURL(f)}
                          alt={f.name}
                          className="w-full h-full object-cover rounded-xl"
                        />
                        <button
                          onClick={() =>
                            update("productImages", form.productImages.filter((_, j) => j !== i))
                          }
                          className="absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          style={{ background: "rgba(0,0,0,0.55)" }}
                        >
                          <X className="w-3 h-3 text-white" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <button
                  onClick={() => productInputRef.current?.click()}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed transition-all hover:border-orange-300"
                  style={{
                    borderColor: form.productImages.length === 0 ? "#f97316" : "#e0dbd5",
                  }}
                >
                  <Upload className="w-4 h-4" style={{ color: "#bbb" }} />
                  <span className="font-body text-[13px]" style={{ color: "#bbb" }}>
                    Add product photos (PNG, JPG, WebP)
                  </span>
                </button>
              </div>

              {/* Video clips — optional */}
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <label className="font-body text-[12px] font-semibold" style={{ color: "#555" }}>
                    Video Clips
                  </label>
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded"
                    style={{ background: "#f5f5f5", color: "#aaa" }}
                  >
                    Optional — adds motion style reference
                  </span>
                  {form.videoClips.length > 0 && (
                    <span
                      className="text-[10px] font-semibold px-1.5 py-0.5 rounded ml-auto"
                      style={{ background: "#dcfce7", color: "#16a34a" }}
                    >
                      ✓ {form.videoClips.length} added
                    </span>
                  )}
                </div>
                <input
                  ref={videoInputRef}
                  type="file"
                  accept="video/mp4,video/mov,video/quicktime,video/webm"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? []);
                    update("videoClips", [...form.videoClips, ...files]);
                  }}
                />
                {form.videoClips.length > 0 && (
                  <div className="space-y-1.5 mb-2">
                    {form.videoClips.map((f, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-3 px-3 py-2 rounded-xl"
                        style={{ background: "#f8f5f2", border: "1px solid #eee" }}
                      >
                        <span className="text-[16px]">🎬</span>
                        <span className="font-body text-[12px] flex-1 truncate" style={{ color: "#666" }}>
                          {f.name}
                        </span>
                        <span className="font-body text-[11px]" style={{ color: "#bbb" }}>
                          {(f.size / 1024 / 1024).toFixed(1)} MB
                        </span>
                        <button
                          onClick={() =>
                            update("videoClips", form.videoClips.filter((_, j) => j !== i))
                          }
                        >
                          <X className="w-3.5 h-3.5" style={{ color: "#ccc" }} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <button
                  onClick={() => videoInputRef.current?.click()}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed transition-all hover:border-orange-300"
                  style={{ borderColor: "#e0dbd5" }}
                >
                  <Upload className="w-4 h-4" style={{ color: "#bbb" }} />
                  <span className="font-body text-[13px]" style={{ color: "#bbb" }}>
                    Add video clips (MP4, MOV)
                  </span>
                </button>
              </div>

              {/* Validation hint */}
              {(!form.logo || form.productImages.length === 0) && (
                <p className="font-body text-[12px] text-center" style={{ color: "#f97316" }}>
                  {!form.logo && form.productImages.length === 0
                    ? "Upload a logo and at least 1 product image to continue"
                    : !form.logo
                    ? "Upload your logo to continue"
                    : "Add at least 1 product image to continue"}
                </p>
              )}
            </div>
          )}

          {/* Step 3 — Platforms */}
          {step === 3 && (
            <div className="space-y-5">
              <div>
                <h1
                  className="font-display text-[24px] font-bold leading-tight"
                  style={{ color: "#1a1a1a" }}
                >
                  Where will you run ads?
                </h1>
                <p className="font-body text-[13px] mt-1" style={{ color: "#999" }}>
                  Select all platforms — each will get the right aspect ratio and style.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-3">
                {PLATFORMS.map((p) => {
                  const active = form.platforms.includes(p);
                  return (
                    <button
                      key={p}
                      onClick={() => togglePlatform(p)}
                      className="relative flex flex-col items-center gap-2 py-6 rounded-2xl border-2 transition-all"
                      style={{
                        borderColor: active ? "#f97316" : "#f0ece8",
                        background: active ? "#fff8f3" : "#fafaf9",
                      }}
                    >
                      {active && (
                        <span
                          className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center"
                          style={{ background: "#f97316" }}
                        >
                          <Check className="w-3 h-3 text-white" />
                        </span>
                      )}
                      <span className="text-2xl">
                        {p === "TikTok" ? "🎵" : p === "Instagram" ? "📸" : "▶️"}
                      </span>
                      <span
                        className="font-body text-[13px] font-semibold"
                        style={{ color: active ? "#f97316" : "#777" }}
                      >
                        {p}
                      </span>
                    </button>
                  );
                })}
              </div>

              {mutation.isError && (
                <div
                  className="px-4 py-3 rounded-xl font-body text-[13px]"
                  style={{ background: "#fef2f2", color: "#dc2626" }}
                >
                  Something went wrong. Please try again.
                </div>
              )}
            </div>
          )}

          {/* Footer nav */}
          <div className="flex items-center justify-between mt-8">
            {step > 1 ? (
              <button
                onClick={() => setStep(step - 1)}
                className="flex items-center gap-2 font-body text-[13px] px-4 py-2 rounded-xl transition-all hover:bg-[#f5f3f0]"
                style={{ color: "#999" }}
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>
            ) : (
              <button
                onClick={() => navigate("/")}
                className="flex items-center gap-2 font-body text-[13px] px-4 py-2 rounded-xl transition-all hover:bg-[#f5f3f0]"
                style={{ color: "#999" }}
              >
                <ArrowLeft className="w-4 h-4" />
                Cancel
              </button>
            )}

            <button
              onClick={handleNext}
              disabled={!canNext() || mutation.isPending}
              className="flex items-center gap-2 font-body font-semibold text-[14px] px-6 py-2.5 rounded-xl transition-all disabled:opacity-40 active:scale-[0.98]"
              style={{
                background: "linear-gradient(135deg, #fb923c, #ea580c)",
                color: "#fff",
                boxShadow: "0 2px 12px rgba(249,115,22,0.3)",
              }}
            >
              {mutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : step === 3 ? (
                <>
                  Save Brand
                  <Check className="w-4 h-4" />
                </>
              ) : (
                <>
                  Next
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Onboard;
