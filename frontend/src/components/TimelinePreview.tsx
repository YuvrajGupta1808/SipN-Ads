import { useState, useRef } from "react";
import { Play, Pause, SkipBack } from "lucide-react";

export interface TimelineClip {
  clip_index: number;
  asset_id: string | null;
  asset_url: string;
  start_ms: number;
  end_ms: number;
  text_overlay: string;
  transition: string;
  scene_title: string;
  generated: boolean;
}

export interface Timeline {
  id: string;
  brand_id: string;
  variant_id: string;
  resolution: string;
  total_duration_ms: number;
  clips: TimelineClip[];
}

interface TimelinePreviewProps {
  timeline: Timeline;
  onRequestRender?: () => void;
}

const TRANSITION_LABELS: Record<string, string> = {
  fade: "Fade",
  cut: "Cut",
  slide_left: "Slide ←",
  slide_up: "Slide ↑",
  dissolve: "Dissolve",
};

export default function TimelinePreview({ timeline, onRequestRender }: TimelinePreviewProps) {
  const [activeClip, setActiveClip] = useState(0);
  const [playing, setPlaying] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const totalMs = timeline.total_duration_ms || 1;
  const clip = timeline.clips[activeClip];

  const stopPlayback = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setPlaying(false);
  };

  const startPlayback = () => {
    setPlaying(true);
    let current = activeClip;
    intervalRef.current = setInterval(() => {
      current++;
      if (current >= timeline.clips.length) {
        stopPlayback();
        setActiveClip(0);
      } else {
        setActiveClip(current);
      }
    }, 1500);
  };

  const togglePlay = () => {
    if (playing) {
      stopPlayback();
    } else {
      if (activeClip >= timeline.clips.length - 1) setActiveClip(0);
      startPlayback();
    }
  };

  const reset = () => {
    stopPlayback();
    setActiveClip(0);
  };

  return (
    <div
      className="rounded-2xl overflow-hidden font-body"
      style={{
        background: "#fff",
        border: "1px solid #f0ece8",
        boxShadow: "0 2px 12px rgba(0,0,0,0.04)",
      }}
    >
      {/* Header */}
      <div
        className="px-4 py-2.5 flex items-center gap-2"
        style={{ borderBottom: "1px solid #f5f0eb", background: "#fefefe" }}
      >
        <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#aaa" }}>
          Timeline Preview
        </span>
        <span
          className="text-[10px] px-2 py-0.5 rounded-full ml-auto"
          style={{ background: "#f5f0eb", color: "#f97316" }}
        >
          {timeline.resolution} · {Math.round(totalMs / 1000)}s
        </span>
      </div>

      {/* Preview frame */}
      <div
        className="relative mx-4 my-3 rounded-xl overflow-hidden flex items-center justify-center"
        style={{
          background: "#1a1a1a",
          aspectRatio: timeline.resolution === "9:16" ? "9/16" : "16/9",
          maxHeight: 200,
        }}
      >
        {clip?.asset_url ? (
          <img
            src={clip.asset_url}
            alt={clip.scene_title}
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <div className="flex flex-col items-center gap-1.5">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: "#333" }}
            >
              <Play className="w-4 h-4 text-white opacity-60" />
            </div>
            <span className="text-[10px] text-white opacity-40">
              {clip?.generated ? "AI Generated" : "No asset"}
            </span>
          </div>
        )}

        {/* Text overlay */}
        {clip?.text_overlay && (
          <div
            className="absolute bottom-0 inset-x-0 p-2 text-center"
            style={{ background: "linear-gradient(transparent, rgba(0,0,0,0.7))" }}
          >
            <p className="text-white font-semibold text-[11px]">{clip.text_overlay}</p>
          </div>
        )}

        {/* Scene badge */}
        <div className="absolute top-1.5 left-1.5">
          <span
            className="text-[9px] font-semibold px-1.5 py-0.5 rounded"
            style={{ background: "rgba(0,0,0,0.5)", color: "#fff" }}
          >
            {clip?.scene_title ?? `Scene ${activeClip + 1}`}
          </span>
        </div>
      </div>

      {/* Scrubber */}
      <div className="px-4 pb-2">
        <div
          className="relative h-7 rounded-lg overflow-hidden cursor-pointer"
          style={{ background: "#f5f0eb" }}
        >
          {timeline.clips.map((c, i) => {
            const widthPct = ((c.end_ms - c.start_ms) / totalMs) * 100;
            const leftPct = (c.start_ms / totalMs) * 100;
            return (
              <button
                key={i}
                onClick={() => { stopPlayback(); setActiveClip(i); }}
                className="absolute top-0 h-full transition-all"
                style={{
                  left: `${leftPct}%`,
                  width: `${widthPct}%`,
                  background:
                    activeClip === i
                      ? "linear-gradient(135deg, #fb923c, #ea580c)"
                      : i % 2 === 0
                      ? "#ede9e4"
                      : "#e5e0da",
                  borderRight: "1px solid #fff",
                }}
                title={c.scene_title}
              >
                <span className="text-[8px] font-semibold px-1 truncate block text-left"
                  style={{ color: activeClip === i ? "#fff" : "#aaa" }}>
                  {i + 1}
                </span>
              </button>
            );
          })}
        </div>

        {/* Transition labels */}
        <div className="flex mt-1.5 gap-1.5 flex-wrap">
          {timeline.clips.slice(0, -1).map((c, i) => (
            <span
              key={i}
              className="text-[9px] px-1.5 py-0.5 rounded"
              style={{ background: "#f5f0eb", color: "#aaa" }}
            >
              {TRANSITION_LABELS[c.transition] ?? c.transition}
            </span>
          ))}
        </div>
      </div>

      {/* Controls */}
      <div
        className="px-4 py-2.5 flex items-center gap-2"
        style={{ borderTop: "1px solid #f5f0eb" }}
      >
        <button
          onClick={reset}
          className="p-1.5 rounded-lg transition-all hover:bg-[#f5f0eb] active:scale-95"
          style={{ color: "#aaa" }}
        >
          <SkipBack className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={togglePlay}
          className="p-1.5 rounded-lg transition-all active:scale-95"
          style={{
            background: playing ? "#f5f0eb" : "linear-gradient(135deg, #fb923c, #ea580c)",
            color: playing ? "#f97316" : "#fff",
          }}
        >
          {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
        </button>
        <span className="text-[11px] ml-2" style={{ color: "#aaa" }}>
          Scene {activeClip + 1} of {timeline.clips.length}
        </span>
        {onRequestRender && (
          <button
            onClick={onRequestRender}
            className="ml-auto text-[11px] font-semibold px-3 py-1.5 rounded-lg transition-all active:scale-95"
            style={{
              background: "linear-gradient(135deg, #fb923c, #ea580c)",
              color: "#fff",
            }}
          >
            Render Video →
          </button>
        )}
      </div>
    </div>
  );
}
