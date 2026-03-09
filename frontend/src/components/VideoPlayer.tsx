import { useEffect, useRef, useState } from "react";
import { Download, Maximize2, Volume2, VolumeX } from "lucide-react";

interface VideoPlayerProps {
  videoUrl: string;
  resolution?: "9:16" | "16:9";
  jobId?: string;
  onResolutionChange?: (resolution: "9:16" | "16:9") => void;
}

export default function VideoPlayer({
  videoUrl,
  resolution = "9:16",
  jobId,
  onResolutionChange,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  const isPlaceholder = !videoUrl || videoUrl === "";

  const toggleMute = () => {
    setMuted((m) => {
      if (videoRef.current) videoRef.current.muted = !m;
      return !m;
    });
  };

  const handleFullscreen = () => {
    if (videoRef.current?.requestFullscreen) {
      videoRef.current.requestFullscreen();
      setFullscreen(true);
    }
  };

  const handleDownload = () => {
    const a = document.createElement("a");
    a.href = videoUrl;
    a.download = `sipnads-ad-${jobId ?? "export"}.mp4`;
    a.click();
  };

  return (
    <div
      className="rounded-2xl overflow-hidden font-body"
      style={{
        background: "#fff",
        border: "1px solid #f0ece8",
        boxShadow: "0 2px 12px rgba(0,0,0,0.04)",
        maxWidth: resolution === "9:16" ? 320 : 560,
      }}
    >
      {/* Header */}
      <div
        className="px-4 py-2.5 flex items-center gap-2"
        style={{ borderBottom: "1px solid #f5f0eb", background: "#fefefe" }}
      >
        <div
          className="w-2 h-2 rounded-full"
          style={{ background: "linear-gradient(135deg, #fb923c, #ea580c)" }}
        />
        <span className="text-[11px] font-semibold" style={{ color: "#1a1a1a" }}>
          Video Preview
        </span>

        {/* Resolution selector */}
        <div
          className="ml-auto flex rounded-lg overflow-hidden"
          style={{ border: "1px solid #f0ece8" }}
        >
          {(["9:16", "16:9"] as const).map((r) => (
            <button
              key={r}
              onClick={() => onResolutionChange?.(r)}
              className="px-2 py-0.5 text-[10px] font-semibold transition-all"
              style={{
                background: resolution === r ? "#f97316" : "#fafaf9",
                color: resolution === r ? "#fff" : "#aaa",
              }}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Video */}
      <div
        className="relative bg-black flex items-center justify-center"
        style={{
          aspectRatio: resolution === "9:16" ? "9/16" : "16/9",
          maxHeight: resolution === "9:16" ? 480 : 280,
        }}
      >
        {isPlaceholder ? (
          <div className="flex flex-col items-center gap-2 opacity-40">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center"
              style={{ background: "#333" }}>
              <div className="w-0 h-0 border-y-[8px] border-y-transparent border-l-[14px] border-l-white ml-1" />
            </div>
            <span className="text-white text-[11px]">No video yet</span>
          </div>
        ) : (
          <video
            ref={videoRef}
            src={videoUrl}
            controls
            className="w-full h-full object-contain"
            muted={muted}
          />
        )}

        {/* Overlay controls */}
        {!isPlaceholder && (
          <div className="absolute top-2 right-2 flex gap-1.5">
            <button
              onClick={toggleMute}
              className="w-7 h-7 rounded-lg flex items-center justify-center backdrop-blur-sm transition-all"
              style={{ background: "rgba(0,0,0,0.5)" }}
            >
              {muted ? (
                <VolumeX className="w-3.5 h-3.5 text-white" />
              ) : (
                <Volume2 className="w-3.5 h-3.5 text-white" />
              )}
            </button>
            <button
              onClick={handleFullscreen}
              className="w-7 h-7 rounded-lg flex items-center justify-center backdrop-blur-sm transition-all"
              style={{ background: "rgba(0,0,0,0.5)" }}
            >
              <Maximize2 className="w-3.5 h-3.5 text-white" />
            </button>
          </div>
        )}
      </div>

      {/* Download */}
      {!isPlaceholder && (
        <div
          className="px-4 py-2.5 flex items-center justify-between"
          style={{ borderTop: "1px solid #f5f0eb", background: "#fefefe" }}
        >
          <span className="text-[11px]" style={{ color: "#aaa" }}>
            {resolution === "9:16" ? "TikTok / Reels" : "YouTube / Landscape"}
          </span>
          <button
            onClick={handleDownload}
            className="flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-lg transition-all active:scale-95"
            style={{
              background: "linear-gradient(135deg, #fb923c, #ea580c)",
              color: "#fff",
            }}
          >
            <Download className="w-3 h-3" />
            Download MP4
          </button>
        </div>
      )}
    </div>
  );
}
