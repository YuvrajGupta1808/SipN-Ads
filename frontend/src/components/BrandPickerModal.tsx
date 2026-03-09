import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Plus, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

export type Brand = {
  id: string;
  name: string;
  tone: string;
  color: string;
};

export const MOCK_BRANDS: Brand[] = [
  { id: "b1", name: "Sip N'ads Demo", tone: "Bold", color: "#f97316" },
  { id: "b2", name: "Bloom Tea Co.", tone: "Playful", color: "#a78bfa" },
  { id: "b3", name: "Velvet Cola", tone: "Premium", color: "#f43f5e" },
  { id: "b4", name: "Arctic Refresh", tone: "Minimal", color: "#38bdf8" },
];

const API = "http://localhost:8000";

async function fetchBrands(): Promise<Brand[]> {
  const res = await fetch(`${API}/brand/list`);
  if (!res.ok) throw new Error("Failed to fetch brands");
  const data = await res.json();
  return data.brands ?? [];
}

interface BrandPickerModalProps {
  open: boolean;
  onSelect: (brand: Brand) => void;
  onSkip: () => void;
  onClose: () => void;
}

const BrandPickerModal = ({ open, onSelect, onSkip, onClose }: BrandPickerModalProps) => {
  const navigate = useNavigate();

  const { data: apiBrands, isLoading } = useQuery({
    queryKey: ["brands"],
    queryFn: fetchBrands,
    enabled: open,
    retry: false,
    staleTime: 30_000,
  });

  // Use real brands if available, fall back to mocks
  const brands: Brand[] = apiBrands && apiBrands.length > 0 ? apiBrands : MOCK_BRANDS;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[480px]" style={{ fontFamily: "DM Sans, sans-serif" }}>
        <DialogHeader>
          <DialogTitle
            className="text-[17px] font-bold"
            style={{ color: "#1a1a1a", fontFamily: "Playfair Display, serif" }}
          >
            Which brand is this for?
          </DialogTitle>
          <DialogDescription className="text-[13px]" style={{ color: "#aaa" }}>
            Select a saved brand so every idea stays on-brand from the start.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin" style={{ color: "#f97316" }} />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5 mt-1">
            {brands.map((brand) => (
              <button
                key={brand.id}
                onClick={() => onSelect(brand)}
                className="flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all hover:shadow-md active:scale-[0.98]"
                style={{ background: "#fefefe", borderColor: "#f0ece8" }}
              >
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ background: brand.color }}
                />
                <div className="flex flex-col min-w-0">
                  <span
                    className="text-[13px] font-semibold truncate leading-tight"
                    style={{ color: "#1a1a1a" }}
                  >
                    {brand.name}
                  </span>
                  <span className="text-[11px] mt-0.5" style={{ color: "#bbb" }}>
                    {brand.tone}
                  </span>
                </div>
              </button>
            ))}

            <button
              onClick={() => {
                onClose();
                navigate("/onboard");
              }}
              className="flex items-center gap-3 px-4 py-3 rounded-xl border border-dashed text-left transition-all hover:shadow-md active:scale-[0.98]"
              style={{ borderColor: "#e0dbd5", background: "#fafaf9" }}
            >
              <span
                className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: "#f5f0eb" }}
              >
                <Plus className="w-3.5 h-3.5" style={{ color: "#f97316" }} />
              </span>
              <div className="flex flex-col">
                <span className="text-[13px] font-semibold leading-tight" style={{ color: "#aaa" }}>
                  New Brand
                </span>
                <span className="text-[11px] mt-0.5" style={{ color: "#ccc" }}>
                  Set up brand kit
                </span>
              </div>
            </button>
          </div>
        )}

        <div className="flex justify-end pt-1">
          <button
            onClick={onSkip}
            className="text-[12px] font-body px-3 py-1.5 rounded-lg transition-all hover:bg-[#f5f3f0]"
            style={{ color: "#bbb" }}
          >
            Skip for now
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default BrandPickerModal;
