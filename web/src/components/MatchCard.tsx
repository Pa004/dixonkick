import { useState } from "react";
import { AnimatePresence, m, useReducedMotion } from "motion/react";
import { CalendarDays, ChevronDown, Gauge, Target } from "lucide-react";
import type { Fixture, Prediction } from "../api";
import ProbabilityBar from "./ProbabilityBar";
import ConfidenceBadge from "./ConfidenceBadge";
import Markets from "./Markets";
import TeamCrest from "./TeamCrest";
import { cn } from "../utils";

const PICK_LABEL: Record<string, string> = { H: "Local", D: "Empate", A: "Visita" };

const SKIP_LABEL: Record<string, string> = {
  no_model: "Liga sin modelo de datos todavía",
  team_not_in_model: "Equipo sin datos en el modelo",
  predict_failed: "Predicción falló; se reintentará en el próximo sync",
};

function heatColor(p: number): string {
  if (p < 0.03) return "bg-neutro-850 text-neutro-500";
  if (p < 0.08) return "bg-neutro-800 text-neutro-400";
  if (p < 0.15) return "bg-acento-950 text-acento-300";
  return "bg-acento-400 text-neutro-950";
}

function ScoreHeatmap({ pred }: { pred: Prediction }) {
  const mat = pred.score_matrix;
  if (!mat) return null;
  const size = 6;
  return (
    <div className="overflow-x-auto">
      <table className="mx-auto border-separate border-spacing-0.5 text-center text-xs">
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

function TeamSide({
  name,
  short,
  logo,
  picked,
  align,
}: {
  name: string;
  short: string;
  logo: string | null;
  picked: boolean;
  align: "left" | "right";
}) {
  return (
    <div
      className={cn(
        "flex flex-1 items-center gap-3 rounded-base px-2 py-1.5 transition-colors",
        align === "right" && "justify-end text-right",
        picked ? "bg-acento-500/10 ring-1 ring-acento-500/40" : "ring-1 ring-transparent",
      )}
    >
      {align === "left" && <TeamCrest name={name} short={short} logo={logo} />}
      <div className="min-w-0">
        <span
          className={cn(
            "block truncate font-display text-sm font-semibold",
            picked ? "text-acento-200" : "text-neutro-100",
          )}
        >
          {name}
        </span>
        {picked && (
          <span className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-acento-300">
            <Target className="h-3 w-3" aria-hidden="true" /> Favorito
          </span>
        )}
      </div>
      {align === "right" && <TeamCrest name={name} short={short} logo={logo} />}
    </div>
  );
}

export default function MatchCard({ fixture }: { fixture: Fixture }) {
  const [open, setOpen] = useState(false);
  const shouldReduce = useReducedMotion();
  const pred = fixture.prediction;
  const d = new Date(fixture.date);
  const dateStr = d.toLocaleDateString("es-EC", { weekday: "short", day: "2-digit", month: "short" });
  const timeStr = d.toLocaleTimeString("es-EC", { hour: "2-digit", minute: "2-digit" });

  const detail = pred && (
    <div id={`detail-${fixture.id}`} className="border-t border-neutro-800/60 p-5 pt-4">
      <div className="mb-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-neutro-400">
        <div>
          Goles esperados:{" "}
          <b className="font-display tabular-nums text-neutro-100">{pred.expected_goals.home.toFixed(2)}</b>{" "}
          vs{" "}
          <b className="font-display tabular-nums text-neutro-100">{pred.expected_goals.away.toFixed(2)}</b>
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
      {pred.markets && <Markets markets={pred.markets} />}
    </div>
  );

  const pick = pred?.pick;
  const pickedHome = pick === "H";
  const pickedAway = pick === "A";

  return (
    <div className="rounded-base bg-neutro-900 shadow-card transition-shadow duration-200 hover:shadow-glow">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={pred ? `detail-${fixture.id}` : undefined}
        className="flex w-full flex-col gap-3 rounded-base p-5 text-left transition-colors hover:bg-neutro-850/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento-400"
      >
        <span className="sr-only">
          Partido {fixture.home} contra {fixture.away}
        </span>
        <div className="flex items-center justify-between text-xs text-neutro-400">
          <span className="inline-flex items-center gap-1.5 uppercase tracking-wide">
            <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
            {dateStr} · {timeStr}
          </span>
          <span className="font-semibold text-neutro-400">{fixture.league}</span>
        </div>

        <div className="flex items-center justify-between gap-2">
          <TeamSide
            name={fixture.home}
            short={fixture.homeShort}
            logo={fixture.homeLogo}
            picked={pickedHome}
            align="left"
          />
          <span className="shrink-0 px-1 font-display text-xs font-bold text-neutro-500">vs</span>
          <TeamSide
            name={fixture.away}
            short={fixture.awayShort}
            logo={fixture.awayLogo}
            picked={pickedAway}
            align="right"
          />
        </div>

        {fixture.status !== "pre" &&
        fixture.homeScore != null &&
        fixture.awayScore != null ? (
          <div className="flex items-center justify-between gap-3">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                fixture.status === "post"
                  ? "bg-neutro-800 text-neutro-300"
                  : "bg-acento-400 text-neutro-950"
              }`}
            >
              <span
                aria-hidden="true"
                className={`h-1.5 w-1.5 rounded-full ${
                  fixture.status === "post" ? "bg-neutro-500" : "animate-pulse bg-neutro-950"
                }`}
              />
              {fixture.status === "post" ? "Finalizado" : "En vivo"}
            </span>
            <span className="font-display text-xl font-bold tabular-nums text-neutro-100">
              {fixture.homeScore}-{fixture.awayScore}
            </span>
          </div>
        ) : pred ? (
          <div className="flex flex-col gap-2">
            <ProbabilityBar
              home={pred.probabilities.home}
              draw={pred.probabilities.draw}
              away={pred.probabilities.away}
              pick={pick}
            />
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex gap-3 text-neutro-400">
                <span>
                  Marcador:{" "}
                  <b className="font-display tabular-nums text-neutro-100">
                    {pred.scoreline.home}-{pred.scoreline.away}
                  </b>
                </span>
                <span className="inline-flex items-center gap-1">
                  <Target className="h-3.5 w-3.5" aria-hidden="true" />
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
            {SKIP_LABEL[fixture.skipReason ?? ""] ?? "Sin datos suficientes para predecir este duelo"}
          </div>
        )}
      </button>

      {shouldReduce && open && detail}

      <AnimatePresence initial={false}>
        {!shouldReduce && open && detail && (
          <m.div
            key="detail"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="overflow-hidden"
          >
            {detail}
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}