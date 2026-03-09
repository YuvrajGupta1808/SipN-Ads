import { useEffect, useState } from "react";
import VideoPlayer from "@/components/VideoPlayer";

interface RenderJob {
  job_id: string;
  status: "pending" | "rendering" | "done" | "error";
  status_text: string;
  progress: number;
  video_url: string | null;
  error: string | null;
  resolution: string;
}

interface RenderStatusProps {
  jobId: string;
  onComplete?: (videoUrl: string) => void;
}

const API = "http://localhost:8000";

export default function RenderStatus({ jobId, onComplete }: RenderStatusProps) {
  const [job, setJob] = useState<RenderJob | null>(null);
  const [resolution, setResolution] = useState<"9:16" | "16:9">("9:16");

  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const res = await fetch(`${API}/render/status/${jobId}`);
        const data = await res.json();
        if (!active) return;
        setJob(data);
        if (data.resolution === "16:9") setResolution("16:9");
        if (data.status === "done" && data.video_url) {
          onComplete?.(data.video_url);
        } else if (data.status !== "error") {
          setTimeout(poll, 2000);
        }
      } catch {
        if (active) setTimeout(poll, 3000);
      }
    };
    poll();
    return () => { active = false; };
  }, [jobId]);

  const handleResolutionChange = async (newRes: "9:16" | "16:9") => {
    setResolution(newRes);
  };

  if (!job) {
    return (
      <div
        className="rounded-2xl p-4 font-body flex items-center gap-3"
        style={{ background: "#fff", border: "1px solid #f0ece8" }}
      >
        <div className="flex gap-1">
          {[0, 150, 300].map((d) => (
            <span
              key={d}
              className="w-1.5 h-1.5 rounded-full animate-bounce"
              style={{ background: "#f97316", animationDelay: `${d}ms` }}
            />
          ))}
        </div>
        <span className="text-[12px]" style={{ color: "#aaa" }}>
          Starting render...
        </span>
      </div>
    );
  }

  if (job.status === "done" && job.video_url) {
    return (
      <VideoPlayer
        videoUrl={job.video_url}
        resolution={resolution}
        jobId={jobId}
        onResolutionChange={handleResolutionChange}
      />
    );
  }

  if (job.status === "error") {
    return (
      <div
        className="rounded-2xl p-4 font-body"
        style={{ background: "#fff7f7", border: "1px solid #fecaca" }}
      >
        <p className="text-[12px] font-semibold" style={{ color: "#ef4444" }}>
          Render failed
        </p>
        <p className="text-[11px] mt-1" style={{ color: "#aaa" }}>
          {job.error ?? "Unknown error"}
        </p>
      </div>
    );
  }

  return (
    <div
      className="rounded-2xl overflow-hidden font-body"
      style={{ background: "#fff", border: "1px solid #f0ece8" }}
    >
      {/* Header */}
      <div
        className="px-4 py-2.5 flex items-center gap-2"
        style={{ borderBottom: "1px solid #f5f0eb" }}
      >
        <div
          className="w-2 h-2 rounded-full animate-pulse"
          style={{ background: "#f97316" }}
        />
        <span className="text-[11px] font-semibold" style={{ color: "#1a1a1a" }}>
          Rendering
        </span>
        <span className="text-[11px] ml-auto" style={{ color: "#aaa" }}>
          {job.progress}%
        </span>
      </div>

      {/* Progress bar */}
      <div className="px-4 py-3">
        <div
          className="h-2 rounded-full overflow-hidden"
          style={{ background: "#f5f0eb" }}
        >
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${job.progress}%`,
              background: "linear-gradient(90deg, #fb923c, #ea580c)",
            }}
          />
        </div>
        <p className="text-[11px] mt-2" style={{ color: "#aaa" }}>
          {job.status_text}
        </p>
      </div>
    </div>
  );
}
