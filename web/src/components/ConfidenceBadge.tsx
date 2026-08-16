import type { Prediction } from "../api";
import { BAND_COLORS, BAND_DOT } from "../bands";

export default function ConfidenceBadge({ confidence }: { confidence: Prediction["confidence"] }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${BAND_COLORS[confidence.level] ?? BAND_COLORS.incierto}`}
    >
      <span
        aria-hidden="true"
        className={`h-1.5 w-1.5 rounded-full ${BAND_DOT[confidence.level] ?? "bg-neutro-500"}`}
      />
      {confidence.label} ·{" "}
      <span className="font-display tabular-nums">{Math.round(confidence.probability * 100)}%</span>
    </span>
  );
}