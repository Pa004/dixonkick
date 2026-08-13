import type { Prediction } from "../api";

const COLORS: Record<string, string> = {
  seguro: "bg-acento-500/15 text-acento-300 ring-acento-500/40",
  probable: "bg-neutro-300/15 text-neutro-200 ring-neutro-300/40",
  ajustado: "bg-neutro-400/15 text-neutro-300 ring-neutro-400/40",
  incierto: "bg-neutro-500/15 text-neutro-300 ring-neutro-500/40",
};

export default function ConfidenceBadge({ confidence }: { confidence: Prediction["confidence"] }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${COLORS[confidence.level] ?? COLORS.incierto}`}
    >
      {confidence.label} ·{" "}
      <span className="font-display tabular-nums">{Math.round(confidence.probability * 100)}%</span>
    </span>
  );
}