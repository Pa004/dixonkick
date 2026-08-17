import { Sparkles, TrendingUp } from "lucide-react";
import type { Fixture, Stats } from "../api";
import ConfidenceBadge from "./ConfidenceBadge";
import BandLegend from "./BandLegend";
import SpotlightCard from "./SpotlightCard";
import { BAND_DOT } from "../bands";

interface Props {
  stats: Stats | null;
  topPicks: Fixture[];
}

export default function Sidebar({ stats, topPicks }: Props) {
  return (
    <aside className="flex flex-col gap-6 lg:sticky lg:top-20">
      {stats && stats.totalTracked > 0 && (
        <>
          <div className="rounded-base border border-neutro-800/60 bg-neutro-900/60 p-4 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-2 text-neutro-400">
                <TrendingUp className="h-4 w-4 text-acento-400" aria-hidden="true" />
                Precisión general
              </span>
              <b className="font-display text-lg font-bold tabular-nums text-acento-300">
                {Math.round((stats.overallAccuracy ?? 0) * 100)}%
              </b>
            </div>
            <p className="mt-0.5 text-neutro-500">({stats.totalTracked} partidos)</p>
            {stats.bands.filter((b) => b.accuracy != null).length > 0 && (
              <ul className="mt-3 flex flex-col gap-1.5 border-t border-neutro-800/60 pt-3">
                {stats.bands
                  .filter((b) => b.accuracy != null)
                  .map((b) => (
                    <li key={b.band} className="flex items-center justify-between gap-2 text-neutro-400">
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          aria-hidden="true"
                          className={`h-1.5 w-1.5 rounded-full ${BAND_DOT[b.level] ?? "bg-neutro-500"}`}
                        />
                        {b.band}
                      </span>
                      <b className="font-display tabular-nums text-neutro-200">
                        {Math.round(b.accuracy! * 100)}%
                      </b>
                    </li>
                  ))}
              </ul>
            )}
          </div>
          <BandLegend />
        </>
      )}

      {topPicks.length > 0 && (
        <section aria-label="Mejores picks de hoy">
          <h2 className="mb-3 flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wide text-neutro-200">
            <Sparkles className="h-4 w-4 text-acento-400" aria-hidden="true" />
            Mejores picks de hoy
          </h2>
          <div className="flex flex-col gap-3">
            {topPicks.map((f, i) => (
              <SpotlightCard key={f.id}>
                <div className="flex items-center gap-3 rounded-base border border-neutro-800/60 bg-neutro-900/70 p-3">
                  <span className="font-display text-lg font-bold tabular-nums text-acento-400">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-sm font-semibold text-neutro-100">
                      {f.home} vs {f.away}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-neutro-400">{f.league}</p>
                  </div>
                  <ConfidenceBadge confidence={f.prediction!.confidence} />
                </div>
              </SpotlightCard>
            ))}
          </div>
        </section>
      )}
    </aside>
  );
}