import { useEffect, useRef, useState } from "react";
import { Upload, Image as ImageIcon, Film, X, Tag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export interface Asset {
  id: string;
  filename: string;
  url: string;
  category: string;
  tags: string[];
  description: string;
}

interface AssetLibraryProps {
  brandId?: string;
  onSelectAsset?: (asset: Asset) => void;
  selectedAssetId?: string;
}

const API = "http://localhost:8000";

export default function AssetLibrary({
  brandId,
  onSelectAsset,
  selectedAssetId,
}: AssetLibraryProps) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchAssets = async () => {
    setLoading(true);
    try {
      const qs = brandId ? `?brand_id=${brandId}` : "";
      const res = await fetch(`${API}/assets/list${qs}`);
      const data = await res.json();
      setAssets(data.assets ?? []);
    } catch {
      /* ignore */
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchAssets();
  }, [brandId]);

  const handleUpload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    for (const file of Array.from(files)) {
      const form = new FormData();
      form.append("file", file);
      if (brandId) form.append("brand_id", brandId);
      try {
        await fetch(`${API}/assets/upload`, { method: "POST", body: form });
      } catch {
        /* ignore */
      }
    }
    await fetchAssets();
    setUploading(false);
  };

  const isVideo = (url: string) =>
    /\.(mp4|mov|webm|avi)$/i.test(url);

  const CATEGORY_COLOR: Record<string, string> = {
    product_shot: "#f97316",
    lifestyle: "#8b5cf6",
    logo: "#0ea5e9",
    background: "#22c55e",
    text_overlay: "#f59e0b",
    person: "#ec4899",
    food_beverage: "#ef4444",
    other: "#6b7280",
  };

  return (
    <div className="h-full flex flex-col font-body">
      {/* Header */}
      <div
        className="px-3 py-2.5 flex items-center justify-between shrink-0"
        style={{ borderBottom: "1px solid #f0ece8" }}
      >
        <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "#aaa" }}>
          Asset Library
        </span>
        <Button
          size="sm"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="h-6 px-2 text-[10px] font-semibold rounded-lg border-0"
          style={{ background: "#f97316", color: "#fff" }}
        >
          {uploading ? (
            "Uploading..."
          ) : (
            <>
              <Upload className="w-2.5 h-2.5 mr-1" />
              Upload
            </>
          )}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*,video/*"
          multiple
          className="hidden"
          onChange={(e) => handleUpload(e.target.files)}
        />
      </div>

      {/* Asset grid */}
      <div className="flex-1 overflow-y-auto p-2">
        {loading ? (
          <div className="flex items-center justify-center h-24">
            <div className="flex gap-1">
              {[0, 150, 300].map((d) => (
                <span
                  key={d}
                  className="w-1.5 h-1.5 rounded-full animate-bounce"
                  style={{ background: "#f97316", animationDelay: `${d}ms` }}
                />
              ))}
            </div>
          </div>
        ) : assets.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center h-24 rounded-xl border-2 border-dashed gap-2"
            style={{ borderColor: "#f0ece8" }}
          >
            <ImageIcon className="w-6 h-6" style={{ color: "#ddd" }} />
            <span className="text-[11px] font-body" style={{ color: "#ccc" }}>
              No assets yet — upload some!
            </span>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-1.5">
            {assets.map((asset) => (
              <button
                key={asset.id}
                onClick={() => onSelectAsset?.(asset)}
                className="relative rounded-xl overflow-hidden group text-left"
                style={{
                  border:
                    selectedAssetId === asset.id
                      ? "2px solid #f97316"
                      : "1px solid #f0ece8",
                  background: "#fafaf9",
                  aspectRatio: "1",
                }}
              >
                {isVideo(asset.url) ? (
                  <div
                    className="w-full h-full flex items-center justify-center"
                    style={{ background: "#1a1a1a" }}
                  >
                    <Film className="w-5 h-5 text-white opacity-60" />
                  </div>
                ) : asset.url ? (
                  <img
                    src={asset.url}
                    alt={asset.description}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                ) : (
                  <div
                    className="w-full h-full flex items-center justify-center"
                    style={{ background: "#f5f0eb" }}
                  >
                    <ImageIcon className="w-5 h-5" style={{ color: "#ccc" }} />
                  </div>
                )}

                {/* Category dot */}
                <span
                  className="absolute top-1 left-1 w-2 h-2 rounded-full"
                  style={{
                    background: CATEGORY_COLOR[asset.category] ?? "#6b7280",
                  }}
                />

                {/* Hover overlay */}
                <div
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-1.5"
                  style={{ background: "linear-gradient(transparent, rgba(0,0,0,0.6))" }}
                >
                  <span className="text-[9px] text-white font-semibold truncate">
                    {asset.filename}
                  </span>
                  {asset.tags.length > 0 && (
                    <div className="flex gap-0.5 flex-wrap mt-0.5">
                      {asset.tags.slice(0, 2).map((tag) => (
                        <span
                          key={tag}
                          className="text-[8px] px-1 py-0.5 rounded"
                          style={{ background: "rgba(255,255,255,0.2)", color: "#fff" }}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Selected check */}
                {selectedAssetId === asset.id && (
                  <div
                    className="absolute top-1 right-1 w-4 h-4 rounded-full flex items-center justify-center"
                    style={{ background: "#f97316" }}
                  >
                    <span className="text-white text-[8px] font-bold">✓</span>
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
