import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Link2, ArrowLeft, Zap, Clock, Star, ChevronRight, Brain } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface Template {
  id: string;
  brand_id: string;
  overall_score: number;
  cta_clarity_score: number;
  hook_strength_score: number;
  brand_compliance_score: number;
  hook_text: string;
  cta_text: string;
  resolution: string;
  total_duration_ms: number;
  created_at: string;
}

interface BrandLearning {
  brandId: string;
  brandName: string;
  learnings: string[];
}

const API = "http://localhost:8000";

function ScoreBar({ score, label }: { score: number; label: string }) {
  const color = score >= 8 ? "#22c55e" : score >= 5 ? "#f59e0b" : "#ef4444";
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] w-20 shrink-0" style={{ color: "#aaa" }}>
        {label}
      </span>
      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "#f5f0eb" }}>
        <div
          className="h-full rounded-full"
          style={{ width: `${score * 10}%`, background: color }}
        />
      </div>
      <span className="text-[10px] font-semibold w-6 text-right" style={{ color }}>
        {score}
      </span>
    </div>
  );
}

export default function Templates() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [learnings, setLearnings] = useState<BrandLearning[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBrandId, setSelectedBrandId] = useState<string>("all");
  const [brands, setBrands] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      try {
        // Fetch brands
        const brandRes = await fetch(`${API}/brand/list`);
        const brandData = await brandRes.json();
        const brandList = brandData.brands ?? [];
        setBrands(brandList);

        // Fetch templates for each brand
        const allTemplates: Template[] = [];
        const allLearnings: BrandLearning[] = [];

        for (const brand of brandList) {
          try {
            const tmplRes = await fetch(`${API}/learner/templates/${brand.id}`);
            const tmplData = await tmplRes.json();
            allTemplates.push(...(tmplData.templates ?? []));

            // Fetch brand profile for learnings
            const profileRes = await fetch(`${API}/brand/${brand.id}`);
            const profile = await profileRes.json();
            const learningsRaw = profile.learnings;
            const learningsArr: string[] =
              typeof learningsRaw === "string"
                ? JSON.parse(learningsRaw || "[]")
                : learningsRaw ?? [];

            if (learningsArr.length > 0) {
              allLearnings.push({
                brandId: brand.id,
                brandName: brand.name,
                learnings: learningsArr,
              });
            }
          } catch {
            /* ignore per-brand errors */
          }
        }

        setTemplates(allTemplates.sort((a, b) => b.overall_score - a.overall_score));
        setLearnings(allLearnings);
      } catch {
        /* ignore */
      }
      setLoading(false);
    };
    fetchAll();
  }, []);

  const filteredTemplates =
    selectedBrandId === "all"
      ? templates
      : templates.filter((t) => t.brand_id === selectedBrandId);

  const filteredLearnings =
    selectedBrandId === "all"
      ? learnings
      : learnings.filter((l) => l.brandId === selectedBrandId);

  const useTemplate = (template: Template) => {
    // Navigate to chat with the template's brand pre-loaded
    navigate(`/chat?brand_id=${template.brand_id}&template_id=${template.id}`);
  };

  const formatDuration = (ms: number) => `${Math.round(ms / 1000)}s`;

  return (
    <div className="min-h-screen font-body" style={{ background: "#faf9f7" }}>
      {/* Nav */}
      <header
        className="h-14 flex items-center px-6 gap-4 sticky top-0 z-10"
        style={{ background: "#fefefe", borderBottom: "1px solid #f0ece8" }}
      >
        <button
          onClick={() => navigate("/chat")}
          className="p-2 rounded-lg transition-all hover:bg-[#f5f0eb] active:scale-95"
          style={{ color: "#aaa" }}
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center shadow-sm"
          style={{ background: "linear-gradient(135deg, #fb923c, #ea580c)" }}
        >
          <Link2 className="w-3.5 h-3.5 text-white" />
        </div>
        <div>
          <h1 className="text-[14px] font-bold" style={{ color: "#1a1a1a" }}>
            Template Library
          </h1>
          <p className="text-[10px]" style={{ color: "#aaa" }}>
            High-scoring ads saved as reusable templates
          </p>
        </div>

        {/* Brand filter */}
        <div className="ml-auto flex gap-1.5">
          <button
            onClick={() => setSelectedBrandId("all")}
            className="text-[11px] font-semibold px-3 py-1.5 rounded-lg transition-all"
            style={{
              background: selectedBrandId === "all" ? "#1a1a1a" : "#f5f0eb",
              color: selectedBrandId === "all" ? "#fff" : "#aaa",
            }}
          >
            All
          </button>
          {brands.map((b) => (
            <button
              key={b.id}
              onClick={() => setSelectedBrandId(b.id)}
              className="text-[11px] font-semibold px-3 py-1.5 rounded-lg transition-all"
              style={{
                background: selectedBrandId === b.id ? "#1a1a1a" : "#f5f0eb",
                color: selectedBrandId === b.id ? "#fff" : "#aaa",
              }}
            >
              {b.name}
            </button>
          ))}
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-8 space-y-10">
        {/* Templates grid */}
        <section>
          <h2 className="text-[13px] font-bold mb-4" style={{ color: "#1a1a1a" }}>
            Saved Templates{" "}
            <span style={{ color: "#aaa", fontWeight: 400 }}>
              ({filteredTemplates.length})
            </span>
          </h2>

          {loading ? (
            <div className="flex items-center gap-3 py-12">
              <div className="flex gap-1">
                {[0, 150, 300].map((d) => (
                  <span
                    key={d}
                    className="w-2 h-2 rounded-full animate-bounce"
                    style={{ background: "#f97316", animationDelay: `${d}ms` }}
                  />
                ))}
              </div>
              <span className="text-[13px]" style={{ color: "#aaa" }}>
                Loading templates...
              </span>
            </div>
          ) : filteredTemplates.length === 0 ? (
            <div
              className="rounded-2xl p-12 text-center border-2 border-dashed"
              style={{ borderColor: "#f0ece8" }}
            >
              <Star className="w-8 h-8 mx-auto mb-3" style={{ color: "#ddd" }} />
              <p className="text-[13px] font-semibold mb-1" style={{ color: "#aaa" }}>
                No templates yet
              </p>
              <p className="text-[12px]" style={{ color: "#ccc" }}>
                Export ads that score ≥ 8.5 overall to save them as templates
              </p>
              <Button
                onClick={() => navigate("/chat")}
                className="mt-4 text-[12px] font-semibold px-4 py-2 rounded-xl border-0"
                style={{
                  background: "linear-gradient(135deg, #fb923c, #ea580c)",
                  color: "#fff",
                }}
              >
                Create an Ad →
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredTemplates.map((template) => (
                <div
                  key={template.id}
                  className="rounded-2xl overflow-hidden hover:shadow-md transition-shadow"
                  style={{
                    background: "#fff",
                    border: "1px solid #f0ece8",
                  }}
                >
                  {/* Thumbnail placeholder */}
                  <div
                    className="relative flex items-center justify-center"
                    style={{
                      background: "linear-gradient(135deg, #1a1a1a, #333)",
                      aspectRatio: template.resolution === "9:16" ? "9/16" : "16/9",
                      maxHeight: 160,
                    }}
                  >
                    <div className="flex flex-col items-center gap-1 opacity-40">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                        style={{ background: "rgba(255,255,255,0.1)" }}>
                        <Zap className="w-5 h-5 text-white" />
                      </div>
                    </div>

                    {/* Overall score badge */}
                    <div
                      className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-full"
                      style={{
                        background: template.overall_score >= 9 ? "#22c55e" : "#f59e0b",
                        color: "#fff",
                      }}
                    >
                      <Star className="w-2.5 h-2.5" />
                      <span className="text-[10px] font-bold">
                        {template.overall_score.toFixed(1)}
                      </span>
                    </div>

                    {/* Resolution badge */}
                    <div className="absolute bottom-2 left-2">
                      <span
                        className="text-[9px] font-semibold px-1.5 py-0.5 rounded"
                        style={{ background: "rgba(0,0,0,0.5)", color: "#fff" }}
                      >
                        {template.resolution} · {formatDuration(template.total_duration_ms)}
                      </span>
                    </div>
                  </div>

                  {/* Content */}
                  <div className="p-4">
                    {template.hook_text && (
                      <p
                        className="text-[12px] font-semibold mb-1 truncate"
                        style={{ color: "#1a1a1a" }}
                      >
                        "{template.hook_text}"
                      </p>
                    )}
                    {template.cta_text && (
                      <p className="text-[11px] mb-3 truncate" style={{ color: "#aaa" }}>
                        CTA: {template.cta_text}
                      </p>
                    )}

                    {/* Score bars */}
                    <div className="space-y-1.5 mb-3">
                      <ScoreBar score={template.cta_clarity_score} label="CTA" />
                      <ScoreBar score={template.hook_strength_score} label="Hook" />
                      <ScoreBar score={template.brand_compliance_score} label="Brand" />
                    </div>

                    <div
                      className="flex items-center gap-1.5 mb-3"
                      style={{ color: "#ccc" }}
                    >
                      <Clock className="w-3 h-3" />
                      <span className="text-[10px]">
                        {new Date(template.created_at).toLocaleDateString()}
                      </span>
                    </div>

                    <Button
                      onClick={() => useTemplate(template)}
                      className="w-full text-[11px] font-semibold py-2 rounded-xl border-0"
                      style={{
                        background: "linear-gradient(135deg, #fb923c, #ea580c)",
                        color: "#fff",
                      }}
                    >
                      Use as Template
                      <ChevronRight className="w-3 h-3 ml-1" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Brand Memory — Learnings */}
        {filteredLearnings.length > 0 && (
          <section>
            <h2 className="text-[13px] font-bold mb-4" style={{ color: "#1a1a1a" }}>
              Brand Memory
            </h2>
            <div className="space-y-3">
              {filteredLearnings.map((bl) => (
                <div
                  key={bl.brandId}
                  className="rounded-2xl p-4"
                  style={{ background: "#fff", border: "1px solid #f0ece8" }}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <div
                      className="w-6 h-6 rounded-lg flex items-center justify-center"
                      style={{ background: "#f5f0eb" }}
                    >
                      <Brain className="w-3 h-3" style={{ color: "#f97316" }} />
                    </div>
                    <span className="text-[12px] font-semibold" style={{ color: "#1a1a1a" }}>
                      {bl.brandName}
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {bl.learnings.map((learning, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <span
                          className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0"
                          style={{ background: "#f97316" }}
                        />
                        <p className="text-[12px]" style={{ color: "#555" }}>
                          {learning}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
