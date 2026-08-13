interface Props {
  home: number;
  draw: number;
  away: number;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

export default function ProbabilityBar({ home, draw, away }: Props) {
  return (
    <div
      role="img"
      aria-label={`Probabilidades — Local ${pct(home)}, Empate ${pct(draw)}, Visita ${pct(away)}`}
      className="flex h-9 w-full overflow-hidden rounded-base bg-neutro-900 text-xs font-bold"
    >
      <div className="flex items-center justify-center bg-acento-400 text-neutro-950 tabular-nums" style={{ width: pct(home) }}>
        {pct(home)}
      </div>
      <div className="flex items-center justify-center bg-empate-300 text-neutro-950 tabular-nums" style={{ width: pct(draw) }}>
        {pct(draw)}
      </div>
      <div className="flex items-center justify-center bg-visita-400 text-neutro-950 tabular-nums" style={{ width: pct(away) }}>
        {pct(away)}
      </div>
    </div>
  );
}