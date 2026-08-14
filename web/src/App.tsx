import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, LazyMotion, MotionConfig, domAnimation, m } from "motion/react";
import { Activity, RotateCw, ShieldAlert, TrendingUp } from "lucide-react";
import { fetchFixtures, fetchLeagues, fetchStats, type Fixture, type League, type Stats } from "./api";
import MatchCard from "./components/MatchCard";
import { BAND_DOT } from "./bands";

const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento-400";

const panelTransition = { duration: 0.2, ease: "easeOut" as const };
const listVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.04 } },
};
const cardVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.25, ease: "easeOut" as const } },
};

function SkeletonCard() {
  return (
    <div
      aria-hidden="true"
      className="rounded-base bg-neutro-900 p-5 shadow-card motion-reduce:animate-none animate-pulse"
    >
      <div className="h-3 w-1/3 rounded bg-neutro-800" />
      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="h-4 w-1/4 rounded bg-neutro-800" />
        <div className="h-2.5 w-8 rounded bg-neutro-700" />
        <div className="h-4 w-1/4 rounded bg-neutro-800" />
      </div>
      <div className="mt-4 h-9 rounded bg-neutro-800" />
    </div>
  );
}

export default function App() {
  const [leagues, setLeagues] = useState<League[]>([]);
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [active, setActive] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [l, f, s] = await Promise.all([fetchLeagues(), fetchFixtures(), fetchStats()]);
      setLeagues(l);
      setFixtures(f);
      setStats(s);
      setActive((cur) => cur || l[0]?.code || "");
    } catch {
      setError(
        "No se pudieron cargar los datos. Comprueba que los servicios estén activos e intenta de nuevo.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const shown = active ? fixtures.filter((f) => f.league === active) : fixtures;
  const activeCode = active || leagues[0]?.code || "";
  const stateKey = loading ? "loading" : error ? "error" : shown.length === 0 ? "empty" : activeCode;

  const onTabKeyDown = (e: React.KeyboardEvent) => {
    if (leagues.length === 0) return;
    const idx = leagues.findIndex((l) => l.code === (document.activeElement?.id ?? "").replace("tab-", ""));
    if (idx < 0) return;
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const dir = e.key === "ArrowRight" ? 1 : -1;
      const next = (idx + dir + leagues.length) % leagues.length;
      setActive(leagues[next].code);
      document.getElementById(`tab-${leagues[next].code}`)?.focus();
    }
  };

  return (
    <MotionConfig reducedMotion="user">
      <LazyMotion features={domAnimation}>
        <div className="min-h-screen">
          <header className="sticky top-0 z-10 border-b border-neutro-800/60 bg-neutro-950/80 backdrop-blur">
            <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 className="flex items-center gap-2 font-display text-xl font-bold tracking-tight text-acento-400">
                  <Activity className="h-6 w-6" aria-hidden="true" /> FutbolTipster
                </h1>
                <p className="mt-0.5 text-xs text-neutro-500">
                  Probabilidades de partidos por modelo estadístico · sin apuestas
                </p>
              </div>
              <button
                type="button"
                onClick={() => !loading && load()}
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
          </header>

          <main className="mx-auto max-w-3xl px-4 py-6">
            {stats && stats.totalTracked > 0 && (
              <div className="mb-5 flex flex-wrap gap-3 rounded-base border border-neutro-800/60 bg-neutro-900/60 p-4 text-xs">
                <div className="flex items-center gap-2 text-neutro-400">
                  <TrendingUp className="h-4 w-4 text-acento-400" aria-hidden="true" />
                  Precisión general:
                  <b className="font-display text-sm font-bold tabular-nums text-acento-300">
                    {Math.round((stats.overallAccuracy ?? 0) * 100)}%
                  </b>
                  <span className="text-neutro-500">({stats.totalTracked} partidos)</span>
                </div>
                {stats.bands
                  .filter((b) => b.accuracy != null)
                  .map((b) => (
                    <span
                      key={b.band}
                      className="inline-flex items-center gap-1.5 rounded-full bg-neutro-800/70 px-2.5 py-1 text-neutro-400"
                    >
                      <span
                        aria-hidden="true"
                        className={`h-1.5 w-1.5 rounded-full ${BAND_DOT[b.band] ?? "bg-neutro-500"}`}
                      />
                      {b.band}:{" "}
                      <b className="font-display tabular-nums text-neutro-200">
                        {Math.round(b.accuracy! * 100)}%
                      </b>
                    </span>
                  ))}
              </div>
            )}

            <div
              role="tablist"
              aria-label="Ligas"
              onKeyDown={onTabKeyDown}
              className="mb-5 flex gap-2 overflow-x-auto pb-1"
            >
              {leagues.map((l) => (
                <button
                  key={l.code}
                  id={`tab-${l.code}`}
                  type="button"
                  role="tab"
                  aria-selected={activeCode === l.code}
                  aria-controls="panel-ligas"
                  onClick={() => setActive(l.code)}
                  className={`min-h-11 shrink-0 rounded-full px-4 py-2 text-xs font-semibold transition-colors ${FOCUS} ${
                    activeCode === l.code
                      ? "bg-acento-400 text-neutro-950"
                      : "bg-neutro-900 text-neutro-400 ring-1 ring-neutro-800 hover:text-neutro-200"
                  }`}
                >
                  {l.label}
                  {!l.hasModel && <span className="ml-1.5 text-[10px]">sin modelo</span>}
                </button>
              ))}
            </div>

            <div
              id="panel-ligas"
              role="tabpanel"
              aria-labelledby={`tab-${activeCode}`}
              aria-busy={loading}
              className="min-h-40"
            >
              <AnimatePresence mode="wait">
                <m.div
                  key={stateKey}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={panelTransition}
                >
                  {loading ? (
                    <div role="status" aria-live="polite" className="flex flex-col gap-4">
                      {Array.from({ length: 3 }, (_, i) => (
                        <SkeletonCard key={i} />
                      ))}
                    </div>
                  ) : error ? (
                    <div className="flex flex-col items-center gap-4 py-16 text-center">
                      <ShieldAlert className="h-8 w-8 text-visita-400" aria-hidden="true" />
                      <p className="max-w-md text-sm text-neutro-400">{error}</p>
                      <button
                        type="button"
                        onClick={load}
                        className={`min-h-11 rounded-base border border-neutro-700 px-4 py-2 text-xs font-semibold text-neutro-300 transition-colors hover:border-acento-500/60 hover:text-acento-300 ${FOCUS}`}
                      >
                        Reintentar
                      </button>
                    </div>
                  ) : shown.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 py-16 text-neutro-500">
                      <ShieldAlert className="h-8 w-8" aria-hidden="true" />
                      <p className="text-sm">No hay partidos próximos en esta liga.</p>
                    </div>
                  ) : (
                    <m.ul
                      variants={listVariants}
                      initial="hidden"
                      animate="visible"
                      className="flex flex-col gap-4"
                    >
                      {shown.map((f) => (
                        <m.li key={f.id} variants={cardVariants}>
                          <MatchCard fixture={f} />
                        </m.li>
                      ))}
                    </m.ul>
                  )}
                </m.div>
              </AnimatePresence>
            </div>

            <p className="mt-8 text-center text-[11px] leading-relaxed text-neutro-500">
              Los modelos de fútbol aciertan ~50-55% de los resultados: usa las bandas de confianza como
              referencia, no como certeza. Datos: ESPN · Modelo Dixon-Coles entrenado con resultados 2014-2025
              (football-data.co.uk).
            </p>
          </main>
        </div>
      </LazyMotion>
    </MotionConfig>
  );
}
