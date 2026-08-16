import type { Prediction } from "../api";
import { Badge } from "@/components/ui/badge";
import { BAND_COLORS, BAND_DOT } from "../bands";
import { cn } from "@/lib/utils";

export default function ConfidenceBadge({ confidence }: { confidence: Prediction["confidence"] }) {
  return (
    <Badge
      className={cn(
        "h-auto rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset",
        BAND_COLORS[confidence.level] ?? BAND_COLORS.incierto,
      )}
    >
      <span
        aria-hidden="true"
        className={cn("h-1.5 w-1.5 rounded-full", BAND_DOT[confidence.level] ?? "bg-neutro-500")}
      />
      {confidence.label} ·{" "}
      <span className="font-display tabular-nums">{Math.round(confidence.probability * 100)}%</span>
    </Badge>
  );
}