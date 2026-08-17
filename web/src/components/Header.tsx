import { Activity, Clock3, RotateCw } from "lucide-react";
import Countdown from "./Countdown";
import ThemeToggle from "./ThemeToggle";

const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento-400";

interface Props {
  nextMatch: number | null;
  loading: boolean;
  onRefresh: () => void;
}

export default function Header({ nextMatch, loading, onRefresh }: Props) {
  return (
    <header className="sticky top-0 z-10 border-b border-neutro-800/60 bg-neutro-950/80 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 font-display text-xl font-bold tracking-tight text-acento-400">
            <Activity className="h-6 w-6" aria-hidden="true" /> FutbolTipster
          </h1>
          <p className="mt-0.5 text-xs text-neutro-500">
            Probabilidades de partidos por modelo estadístico · sin apuestas
          </p>
        </div>
        {nextMatch != null && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-neutro-900 px-3 py-1.5 text-xs text-neutro-300 ring-1 ring-neutro-800">
            <Clock3 className="h-3.5 w-3.5 text-acento-400" aria-hidden="true" />
            Próximo partido en <Countdown target={nextMatch} />
          </span>
        )}
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            type="button"
            onClick={() => !loading && onRefresh()}
            aria-disabled={loading}
            className={`inline-flex min-h-11 items-center gap-2 rounded-base border border-neutro-700 px-4 py-2 text-xs font-semibold text-neutro-300 transition-colors hover:border-acento-500/60 hover:text-acento-300 aria-disabled:cursor-not-allowed aria-disabled:opacity-60 ${FOCUS}`}
          >
            <RotateCw
              className={`h-4 w-4 ${loading ? "animate-spin motion-reduce:animate-none" : ""}`}
              aria-hidden="true"
            />
            {loading ? "Actualizando…" : "Actualizar"}
          </button>
        </div>
      </div>
    </header>
  );
}