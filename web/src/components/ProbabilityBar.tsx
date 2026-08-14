import { m, useReducedMotion } from "motion/react";

interface Props {
  home: number;
  draw: number;
  away: number;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

export default function ProbabilityBar({ home, draw, away }: Props) {
  const shouldReduce = useReducedMotion();

  return (
    <m.div
      role="img"
      aria-label={`Probabilidades — Local ${pct(home)}, Empate ${pct(draw)}, Visita ${pct(away)}`}
      className="flex h-9 w-full overflow-hidden rounded-base bg-neutro-900 text-xs font-bold"
    >
      <m.div
        initial={shouldReduce ? { width: pct(home) } : { width: 0 }}
        animate={{ width: pct(home) }}
        transition={{ duration: 0.55, ease: "easeOut" }}
        className="flex items-center justify-center bg-acento-400 text-neutro-950 tabular-nums"
      >
        {pct(home)}
      </m.div>
      <m.div
        initial={shouldReduce ? { width: pct(draw) } : { width: 0 }}
        animate={{ width: pct(draw) }}
        transition={{ duration: 0.55, ease: "easeOut", delay: 0.12 }}
        className="flex items-center justify-center bg-empate-300 text-neutro-950 tabular-nums"
      >
        {pct(draw)}
      </m.div>
      <m.div
        initial={shouldReduce ? { width: pct(away) } : { width: 0 }}
        animate={{ width: pct(away) }}
        transition={{ duration: 0.55, ease: "easeOut", delay: 0.24 }}
        className="flex items-center justify-center bg-visita-400 text-neutro-950 tabular-nums"
      >
        {pct(away)}
      </m.div>
    </m.div>
  );
}
