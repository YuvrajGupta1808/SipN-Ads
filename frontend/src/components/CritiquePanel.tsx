import { useState } from "react";
import { CheckCircle2, AlertTriangle, XCircle, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface CritiqueScores {
  cta_clarity: number;
  hook_strength: number;
  brand_compliance: number;
}

export interface CritiqueVerdicts {
  cta_clarity: "accept" | "fix";
  hook_strength: "accept" | "fix";
  brand_compliance: "accept" | "fix";
}

export interface CritiqueSuggestions {
  cta_clarity: string;
  hook_strength: string;
  brand_compliance: string;
}

export interface CritiqueReport {
  scores: CritiqueScores;
  verdicts: CritiqueVerdicts;
  suggestions: CritiqueSuggestions;
  overall: string;
}

type CriterionKey = keyof CritiqueScores;

interface CritiquePanelProps {
  report: CritiqueReport;
  brandId: string;
  jobId: string;
  onExport?: () => void;
}

const API = "http://localhost:8000";

const LABELS: Record<CriterionKey, string> = {
  cta_clarity: "CTA Clarity",
  hook_strength: "Hook Strength",
  brand_compliance: "Brand Compliance",
};

const DESCRIPTIONS: Record<CriterionKey, string> = {
  cta_clarity: "Is the call-to-action clear and prominent?",
  hook_strength: "Does the first 3 seconds stop scrolling?",
  brand_compliance: "Follows brand rules and platform policies?",
};

function scoreColor(score: number): string {
  if (score >= 8) return "#22c55e";
  if (score >= 5) return "#f59e0b";
  return "#ef4444";
}

function ScoreRing({ score }: { score: number }) {
  const color = scoreColor(score);
  const circumference = 2 * Math.PI * 16;
  const offset = circumference - (score / 10) * circumference;
  return (
    <svg width="40" height="40" viewBox="0 0 40 40">
      <circle cx="20" cy="20" r="16" fill="none" stroke="#f5f0eb" strokeWidth="3.5" />
      <circle
        cx="20" cy="20" r="16"
        fill="none"
        stroke={color}
        strokeWidth="3.5"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 20 20)"
      />
      <text
        x="20" y="20"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="10"
        fontWeight="700"
        fill={color}
      >
        {score}
      </text>
    </svg>
  );
}

function VerdictIcon({ verdict, score }: { verdict: string; score: number }) {
  if (verdict === "accept")
    return <CheckCircle2 className="w-4 h-4" style={{ color: "#22c55e" }} />;
  if (score < 5)
    return <XCircle className="w-4 h-4" style={{ color: "#ef4444" }} />;
  return <AlertTriangle className="w-4 h-4" style={{ color: "#f59e0b" }} />;
}

export default function CritiquePanel({
  report,
  brandId,
  jobId,
  onExport,
}: CritiquePanelProps) {
  const [fixing, setFixing] = useState<CriterionKey | null>(null);
  const [fixDone, setFixDone] = useState<Set<CriterionKey>>(new Set());
  const [exporting, setExporting] = useState(false);

  const allPass = Object.values(report.verdicts).every((v) => v === "accept");

  const applyFix = async (key: CriterionKey) => {
    setFixing(key);
    try {
      await fetch(`${API}/critic/fix`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand_id: brandId, job_id: jobId, fix_type: key }),
      });
      setFixDone((prev) => new Set([...prev, key]));
    } catch {
      /* ignore */
    }
    setFixing(null);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await fetch(`${API}/render/download/${jobId}`);
      const data = await res.json();
      if (data.url) window.open(data.url, "_blank");
    } catch {
      /* ignore */
    }
    setExporting(false);
    onExport?.();
  };

  const criteria: CriterionKey[] = ["cta_clarity", "hook_strength", "brand_compliance"];

  return (
    <div
      className="rounded-2xl overflow-hidden font-body"
      style={{
        background: "#fff",
        border: "1px solid #f0ece8",
        boxShadow: "0 2px 12px rgba(0,0,0,0.04)",
        maxWidth: 420,
      }}
    >
      {/* Header */}
      <div
        className="px-4 py-3 flex items-center gap-2.5"
        style={{ borderBottom: "1px solid #f5f0eb", background: "#fefefe" }}
      >
        <div
          className="w-6 h-6 rounded-lg flex items-center justify-center"
          style={{ background: "linear-gradient(135deg, #fb923c, #ea580c)" }}
        >
          <Zap className="w-3 h-3 text-white" />
        </div>
        <div className="flex-1">
          <p className="text-[12px] font-semibold" style={{ color: "#1a1a1a" }}>
            Ad Critique Report
          </p>
          <p className="text-[10px]" style={{ color: "#aaa" }}>
            {report.overall}
          </p>
        </div>
      </div>

      {/* Score cards */}
      <div className="px-4 py-3 space-y-2.5">
        {criteria.map((key) => {
          const score = report.scores[key];
          const verdict = report.verdicts[key];
          const suggestion = report.suggestions[key];
          const color = scoreColor(score);
          const wasFixed = fixDone.has(key);

          return (
            <div
              key={key}
              className="rounded-xl p-3 flex items-start gap-3"
              style={{
                background: score >= 8 ? "#f0fdf4" : score >= 5 ? "#fffbeb" : "#fef2f2",
                border: `1px solid ${color}22`,
              }}
            >
              <ScoreRing score={score} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <VerdictIcon verdict={verdict} score={score} />
                  <span className="text-[12px] font-semibold" style={{ color: "#1a1a1a" }}>
                    {LABELS[key]}
                  </span>
                </div>
                <p className="text-[10px] mb-1" style={{ color: "#888" }}>
                  {DESCRIPTIONS[key]}
                </p>
                <p className="text-[11px]" style={{ color: "#666" }}>
                  {suggestion}
                </p>
                {verdict === "fix" && !wasFixed && (
                  <button
                    onClick={() => applyFix(key)}
                    disabled={fixing === key}
                    className="mt-2 text-[10px] font-semibold px-2.5 py-1 rounded-lg border-0 transition-all active:scale-95 disabled:opacity-50"
                    style={{ background: color, color: "#fff" }}
                  >
                    {fixing === key ? "Applying..." : "Apply AI Fix"}
                  </button>
                )}
                {wasFixed && (
                  <span className="mt-1.5 text-[10px] font-semibold flex items-center gap-1" style={{ color: "#22c55e" }}>
                    <CheckCircle2 className="w-3 h-3" /> Fix applied — re-evaluate to confirm
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Export */}
      <div
        className="px-4 py-3"
        style={{ borderTop: "1px solid #f5f0eb", background: "#fefefe" }}
      >
        <Button
          onClick={handleExport}
          disabled={!allPass || exporting}
          className="w-full text-[12px] font-semibold py-2.5 rounded-xl border-0"
          style={
            allPass
              ? {
                  background: "linear-gradient(135deg, #fb923c, #ea580c)",
                  color: "#fff",
                }
              : { background: "#f5f0eb", color: "#ccc" }
          }
        >
          {exporting ? "Exporting..." : allPass ? "✓ Accept & Export" : "Fix all issues to export"}
        </Button>
      </div>
    </div>
  );
}
