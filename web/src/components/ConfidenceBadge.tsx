import type { Prediction } from "../api";
import { BAND_COLORS } from "../bands";

export default function ConfidenceBadge({ confidence }: { confidence: Prediction["confidence"] }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${BAND_COLORS[confidence.level] ?? BAND_COLORS.incierto}`}
    >
      {confidence.label} ·{" "}
      <span className="font-display tabular-nums">{Math.round(confidence.probability * 100)}%</span>
    </span>
  );
}
