import { useState, useId, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import type { CountMarkets, HtFtCell, Markets as MarketsData, MarketProbs } from "../api";
import Tooltip from "./Tooltip";
import { cn } from "../utils";
import { heatColor } from "../heat";

const pct = (v: number) => `${Math.round(v * 100)}%`;

interface Value {
  name: string;
  value: number;
}

// Explica mercados en lenguaje llano; refuerza el carácter informativo de la app
const EXPLAIN: Record<string, string> = {
  "Doble oportunidad": "Cubre dos de los tres resultados del 1X2: 1X (local o empate), 12 (sin empate) o X2 (visita o empate).",
  "Over/Under": "Probabilidad de que el total de goles supere (Over) o no (Under) la línea indicada.",
  Hándicap: "Ventaja o desventaja en goles aplicada al marcador antes de comparar quién gana.",
  "Local +": "Goles del equipo local; Over supera la línea, Under se queda por debajo.",
  "Visita +": "Goles del equipo visitante; Over supera la línea, Under se queda por debajo.",
  "Par / Impar": "Probabilidad de que el total de goles del partido sea par o impar.",
  "Local sin recibir": "El equipo local mantiene la portería a cero durante el partido.",
  "Visita sin recibir": "El equipo visitante mantiene la portería a cero durante el partido.",
  Más: "Resultado más probable del mercado de conteo (local, empate o visita).",
  "Primer gol": "Quién marca primero; 'Sin gol' cubre el 0-0 final.",
  "Primer córner": "Quién consigue el primer córner; 'Sin córner' es prácticamente nulo.",
  "Marcadores exactos": "Los marcadores finales más probables, ordenados por probabilidad.",
  BTTS: "Both Teams To Score: que ambos equipos marquen al menos un gol.",
  "1X2": "Resultado final: local (1), empate (X) o visita (2).",
};

function Row({ label, values }: { label: string; values: Value[] }) {
  const best = Math.max(...values.map((v) => v.value));
  return (
    <div className="flex flex-col gap-1.5 border-b border-neutro-800/60 py-2 text-xs last:border-0">
      <div className="flex items-center justify-between gap-2">
        <Tooltip label={EXPLAIN[label] ?? ""}>
          <span className="text-neutro-400">{label}</span>
        </Tooltip>
        <span className="flex gap-3 whitespace-nowrap tabular-nums">
          {values.map((v) => (
            <span
              key={v.name}
              className={cn(
                v.value === best ? "font-semibold text-acento-300" : "text-neutro-300",
                "tabular-nums",
              )}
            >
              {v.name} {pct(v.value)}
            </span>
          ))}
        </span>
      </div>
      <div className="flex h-1 gap-0.5 overflow-hidden rounded-full bg-neutro-800">
        {values.map((v) => (
          <span
            key={v.name}
            className={cn(
              "h-full rounded-full transition-all",
              v.value === best ? "bg-acento-400" : "bg-neutro-700",
            )}
            style={{ width: pct(v.value) }}
          />
        ))}
      </div>
    </div>
  );
}

function OverUnderRows({ lines }: { lines: Record<string, MarketProbs> }) {
  return Object.entries(lines).map(([line, p]) => (
    <Row
      key={line}
      label={`Over/Under ${line}`}
      values={[
        { name: "Over", value: p.over },
        { name: "Under", value: p.under },
      ]}
    />
  ));
}

function TeamTotalsRows({ lines }: { lines: Record<string, { home_over: number; away_over: number }> }) {
  return Object.entries(lines).map(([line, p]) => (
    <div key={line}>
      <Row
        label={`Local +${line}`}
        values={[
          { name: "Over", value: p.home_over },
          { name: "Under", value: 1 - p.home_over },
        ]}
      />
      <Row
        label={`Visita +${line}`}
        values={[
          { name: "Over", value: p.away_over },
          { name: "Under", value: 1 - p.away_over },
        ]}
      />
    </div>
  ));
}

function HandicapRows({ lines }: { lines: Record<string, { home_cover: number }> }) {
  return Object.entries(lines).map(([line, p]) => (
    <Row
      key={line}
      label={`Hándicap ${line}`}
      values={[
        { name: "Local", value: p.home_cover },
        { name: "Visita", value: 1 - p.home_cover },
      ]}
    />
  ));
}

function MostRows({ most }: { most: CountMarkets["most"] }) {
  return (
    <Row
      label="Más"
      values={[
        { name: "Local", value: most.home },
        { name: "Empate", value: most.draw },
        { name: "Visita", value: most.away },
      ]}
    />
  );
}

function HtFtHeatmap({ cells }: { cells: HtFtCell[] }) {
  const byCell = new Map(cells.map((c) => [`${c.ht}/${c.ft}`, c.prob]));
  const htOrder = ["H", "D", "A"] as const;
  return (
    <div className="overflow-x-auto">
      <table className="border-separate border-spacing-0.5 text-center text-xs">
        <thead>
          <tr>
            <th scope="col" className="pr-2 text-right font-normal text-neutro-500">
              HT\FT
            </th>
            {htOrder.map((ft) => (
              <th key={ft} scope="col" className="px-1.5 font-normal text-neutro-400">
                {ft}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {htOrder.map((ht) => (
            <tr key={ht}>
              <th scope="row" className="pr-2 text-right font-semibold text-neutro-400">
                {ht}
              </th>
              {htOrder.map((ft) => {
                const p = byCell.get(`${ht}/${ft}`) ?? 0;
                return (
                  <td
                    key={`${ht}/${ft}`}
                    className={`min-w-12 rounded px-1.5 py-1 font-semibold tabular-nums ${heatColor(p)}`}
                  >
                    {Math.round(p * 100)}%
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="border-b border-neutro-800/60 last:border-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={id}
        className="flex w-full items-center justify-between py-2 text-left text-xs font-semibold text-neutro-200 transition-colors hover:text-neutro-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento-400"
      >
        {title}
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform duration-200 motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div id={id} className="pb-2">
          {children}
        </div>
      )}
    </div>
  );
}

function CountSection({ title, m }: { title: string; m: CountMarkets }) {
  return (
    <Section title={title}>
      <OverUnderRows lines={m.total} />
      <TeamTotalsRows lines={m.team_totals} />
      <MostRows most={m.most} />
      <HandicapRows lines={m.handicap} />
    </Section>
  );
}

export default function Markets({ markets }: { markets: MarketsData }) {
  const { ft, ht, ht_ft, corners, bookings, shots_on_target, fouls, first_goal, first_corner } = markets;
  return (
    <div className="mt-4 rounded-base border border-neutro-800/60 bg-neutro-950/40 p-3">
      <h2 className="mb-1 font-display text-xs font-semibold uppercase tracking-wide text-neutro-300">
        Mercados
      </h2>

      <Section title="Resultado">
        <Row
          label="Doble oportunidad"
          values={[
            { name: "1X", value: ft.double_chance["1X"] },
            { name: "12", value: ft.double_chance["12"] },
            { name: "X2", value: ft.double_chance.X2 },
          ]}
        />
        <HandicapRows lines={ft.asian_handicap} />
        <OverUnderRows lines={ft.over_under} />
        <Row
          label="Par / Impar"
          values={[
            { name: "Par", value: ft.odd_even.even },
            { name: "Impar", value: ft.odd_even.odd },
          ]}
        />
        <Row
          label="Local sin recibir"
          values={[
            { name: "Sí", value: ft.clean_sheet.home },
            { name: "No", value: 1 - ft.clean_sheet.home },
          ]}
        />
        <Row
          label="Visita sin recibir"
          values={[
            { name: "Sí", value: ft.clean_sheet.away },
            { name: "No", value: 1 - ft.clean_sheet.away },
          ]}
        />
      </Section>

      <Section title="Marcadores exactos">
        {ft.correct_score_top.map((s) => (
          <Row
            key={`${s.home}-${s.away}`}
            label={`${s.home} - ${s.away}`}
            values={[{ name: "Prob", value: s.prob }]}
          />
        ))}
      </Section>

      {ht && (
        <Section title="Primera mitad">
          <Row
            label="1X2"
            values={[
              { name: "Local", value: ht.probabilities.home },
              { name: "Empate", value: ht.probabilities.draw },
              { name: "Visita", value: ht.probabilities.away },
            ]}
          />
          <Row
            label="Doble oportunidad"
            values={[
              { name: "1X", value: ht.double_chance["1X"] },
              { name: "12", value: ht.double_chance["12"] },
              { name: "X2", value: ht.double_chance.X2 },
            ]}
          />
          <OverUnderRows lines={ht.over_under} />
          <Row
            label="BTTS 1ª mitad"
            values={[
              { name: "Sí", value: ht.btts_yes },
              { name: "No", value: 1 - ht.btts_yes },
            ]}
          />
        </Section>
      )}

      {ht_ft && ht_ft.length > 0 && (
        <Section title="HT/FT">
          <HtFtHeatmap cells={ht_ft} />
        </Section>
      )}

      {corners && <CountSection title="Córners" m={corners} />}
      {bookings && <CountSection title="Tarjetas" m={bookings} />}
      {shots_on_target && <CountSection title="Tiros a puerta" m={shots_on_target} />}
      {fouls && <CountSection title="Faltas" m={fouls} />}

      {first_goal && first_corner && (
        <Section title="Primer evento">
          <Row
            label="Primer gol"
            values={[
              { name: "Local", value: first_goal.home },
              { name: "Visita", value: first_goal.away },
              { name: "Sin gol", value: first_goal.none },
            ]}
          />
          <Row
            label="Primer córner"
            values={[
              { name: "Local", value: first_corner.home },
              { name: "Visita", value: first_corner.away },
              { name: "Sin córner", value: first_corner.none },
            ]}
          />
        </Section>
      )}
    </div>
  );
}