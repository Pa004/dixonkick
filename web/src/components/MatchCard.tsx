import { useState } from "react";
import { ChevronDown, Gauge } from "lucide-react";
import type { Fixture, Prediction } from "../api";
import ProbabilityBar from "./ProbabilityBar";
import ConfidenceBadge from "./ConfidenceBadge";

const PICK_LABEL: Record<string, string> = { H: "Local", D: "Empate", A: "Visita" };

function heatColor(p: number): string {
  if (p < 0.03) return "bg-neutro-900 text-neutro-400";
  if (p < 0.08) return "bg-neutro-850 text-neutro-400";
  if (p < 0.15) return "bg-acento-950 text-acento-300";
  return "bg-acento-400 text-neutro-950";
}

function ScoreHeatmap({ pred }: { pred: Prediction }) {
  const mat = pred.score_matrix;
  if (!mat) return null;
  const size = 6;
  return (
    <div className="overflow-x-auto">
      <table className="mx-auto border-separate border-spacing-0.5 text-center text-[11px]">
        <thead>
          <tr>
            <th scope="col" className="pr-2 text-right font-normal text-neutro-500">
              Casa\Visita
            </th>
            {Array.from({ length: size }, (_, i) => (
              <th key={i} scope="col" className="px-1 font-normal text-neutro-400">
                {i}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: size }, (_, r) => (
            <tr key={r}>
              <th scope="row" className="pr-2 text-right font-semibold text-neutro-400">
                {r}
              </th>
              {Array.from({ length: size }, (_, c) => (
                <td
                  key={c}
                  className={`min-w-9 rounded px-1.5 py-1 font-semibold tabular-nums ${heatColor(mat[r]?.[c] ?? 0)}`}
                >
                  {Math.round((mat[r]?.[c] ?? 0) * 100)}%
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function MatchCard({ fixture }: { fixture: Fixture }) {
  const [open, setOpen] = useState(false);
  const pred = fixture.prediction;
  const d = new Date(fixture.date);
  const dateStr = d.toLocaleDateString("es-EC", { weekday: "short", day: "2-digit", month: "short" });
  const timeStr = d.toLocaleTimeString("es-EC", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="rounded-base bg-neutro-900 shadow-card transition-shadow duration-200 hover:shadow-elevated">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Partido ${fixture.home} contra ${fixture.away}`}
        className="flex w-full flex-col gap-3 rounded-base p-5 text-left transition-colors hover:bg-neutro-850/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento-400"
        aria-expanded={open}
      >
        <div className="flex items-center justify-between text-xs text-neutro-400">
          <span className="uppercase tracking-wide">
            {dateStr} · {timeStr}
          </span>
          <span className="font-semibold text-neutro-400">{fixture.league}</span>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-1 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-base bg-neutro-800 font-display text-xs font-bold text-neutro-200">
              {fixture.homeShort || fixture.home.slice(0, 3)}
            </div>
            <span className="truncate font-display text-sm font-semibold text-neutro-100">
              {fixture.home}
            </span>
          </div>
          <span className="px-1 text-xs font-bold text-neutro-400">vs</span>
          <div className="flex flex-1 items-center justify-end gap-3 text-right">
            <span className="truncate font-display text-sm font-semibold text-neutro-100">
              {fixture.away}
            </span>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-base bg-neutro-800 font-display text-xs font-bold text-neutro-200">
              {fixture.awayShort || fixture.away.slice(0, 3)}
            </div>
          </div>
        </div>

        {pred ? (
          <div className="flex flex-col gap-2">
            <ProbabilityBar
              home={pred.probabilities.home}
              draw={pred.probabilities.draw}
              away={pred.probabilities.away}
            />
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex gap-3 text-neutro-400">
                <span>
                  Marcador:{" "}
                  <b className="font-display tabular-nums text-neutro-100">
                    {pred.scoreline.home}-{pred.scoreline.away}
                  </b>
                </span>
                <span>
                  Favorito: <b className="text-neutro-100">{PICK_LABEL[pred.pick]}</b>
                </span>
                <span>
                  Over 2.5:{" "}
                  <b className="font-display tabular-nums text-neutro-100">
                    {Math.round(pred.over_25 * 100)}%
                  </b>
                </span>
              </div>
              <ConfidenceBadge confidence={pred.confidence} />
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2 rounded-base bg-neutro-850 py-2 text-xs text-neutro-400">
            <Gauge className="h-4 w-4" aria-hidden="true" />
            {fixture.league === "EC1"
              ? "Liga sin modelo de datos todavía"
              : "Sin datos suficientes para predecir este duelo"}
          </div>
        )}
      </button>

      {open && pred && (
        <div className="border-t border-neutro-800/60 p-5 pt-4">
          <div className="mb-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-neutro-400">
            <div>
              Goles esperados:{" "}
              <b className="font-display tabular-nums text-neutro-100">
                {pred.expected_goals.home.toFixed(2)}
              </b>{" "}
              vs{" "}
              <b className="font-display tabular-nums text-neutro-100">
                {pred.expected_goals.away.toFixed(2)}
              </b>
            </div>
            <div>
              BTTS Sí:{" "}
              <b className="font-display tabular-nums text-neutro-100">{Math.round(pred.btts_yes * 100)}%</b>
            </div>
            <div>
              BTTS No:{" "}
              <b className="font-display tabular-nums text-neutro-100">{Math.round(pred.btts_no * 100)}%</b>
            </div>
            <div className="flex items-center gap-1 text-neutro-400">
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform duration-200 motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
                aria-hidden="true"
              />
              Matriz de marcador
            </div>
          </div>
          <ScoreHeatmap pred={pred} />
        </div>
      )}
    </div>
  );
}
