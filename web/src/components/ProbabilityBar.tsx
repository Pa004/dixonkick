import { m, useReducedMotion } from "motion/react";

interface Props {
  home: number;
  draw: number;
  away: number;
  pick?: "H" | "D" | "A";
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

// Segmentos muy angostos no muestran la etiqueta (la barra ya comunica el tamaño)
function fits(w: number): boolean {
  return w >= 0.13;
}

const SEG = {
  H: "bg-acento-400 text-neutro-950",
  D: "bg-empate-300 text-neutro-950",
  A: "bg-visita-400 text-neutro-950",
} as const;

const HIT = {
  H: "shadow-[inset_0_0_0_2px_oklch(0.24_0.03_170_/0.5)]",
  D: "shadow-[inset_0_0_0_2px_oklch(0.24_0.02_262_/0.5)]",
  A: "shadow-[inset_0_0_0_2px_oklch(0.24_0.03_20_/0.5)]",
} as const;

export default function ProbabilityBar({ home, draw, away, pick }: Props) {
  const shouldReduce = useReducedMotion();
  const segments = [
    { key: "H", w: home, cls: SEG.H, delay: 0 },
    { key: "D", w: draw, cls: SEG.D, delay: 0.1 },
    { key: "A", w: away, cls: SEG.A, delay: 0.2 },
  ] as const;

  return (
    <m.div
      role="img"
      aria-label={`Probabilidades — Local ${pct(home)}, Empate ${pct(draw)}, Visita ${pct(away)}`}
      className="flex h-9 w-full overflow-hidden rounded-base bg-neutro-900 text-xs font-bold ring-1 ring-neutro-800"
    >
      {segments.map((s) => (
        <m.div
          key={s.key}
          initial={shouldReduce ? { width: pct(s.w) } : { width: 0 }}
          animate={{ width: pct(s.w) }}
          transition={{ duration: 0.55, ease: "easeOut", delay: s.delay }}
          className={`flex min-w-0 items-center justify-center overflow-hidden whitespace-nowrap tabular-nums ${s.cls} ${
            pick === s.key ? HIT[s.key] : ""
          }`}
        >
          {fits(s.w) ? pct(s.w) : ""}
        </m.div>
      ))}
    </m.div>
  );
}