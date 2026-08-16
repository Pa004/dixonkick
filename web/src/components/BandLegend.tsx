import { BAND_COLORS, BAND_DOT } from "../bands";
import { cn } from "@/lib/utils";

const BANDS: Array<{ level: string; label: string; desc: string }> = [
  { level: "seguro", label: "Seguro", desc: "Probabilidad alta del pick" },
  { level: "probable", label: "Probable", desc: "Probabilidad moderada-alta" },
  { level: "ajustado", label: "Ajustado", desc: "Pick con ventaja mínima" },
  { level: "incierto", label: "Incierto", desc: "Muy parejo, evita confiar" },
];

export default function BandLegend() {
  return (
    <ul
      aria-label="Significado de las bandas de confianza"
      className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-neutro-800/60 pt-3"
    >
      {BANDS.map((b) => (
        <li key={b.level} className="flex items-center gap-1.5 text-xs text-neutro-400">
          <span
            aria-hidden="true"
            className={cn("h-1.5 w-1.5 rounded-full", BAND_DOT[b.level] ?? "bg-neutro-500")}
          />
          <span
            className={cn(
              "rounded-full px-2 py-0.5 font-semibold ring-1",
              BAND_COLORS[b.level] ?? BAND_COLORS.incierto,
            )}
          >
            {b.label}
          </span>
          <span className="text-neutro-500">{b.desc}</span>
        </li>
      ))}
    </ul>
  );
}