import { useState, useId, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import type { CountMarkets, Markets as MarketsData, MarketProbs } from "../api";

const pct = (v: number) => `${Math.round(v * 100)}%`;

interface Value {
  name: string;
  value: number;
}

function Row({ label, values }: { label: string; values: Value[] }) {
  const best = Math.max(...values.map((v) => v.value));
  return (
    <div className="flex items-center justify-between gap-2 border-b border-neutro-800/60 py-1.5 text-xs last:border-0">
      <span className="text-neutro-400">{label}</span>
      <span className="flex gap-3 tabular-nums">
        {values.map((v) => (
          <span
            key={v.name}
            className={v.value === best ? "font-semibold text-acento-300" : "text-neutro-300"}
          >
            {v.name} {pct(v.value)}
          </span>
        ))}
      </span>
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
          <div className="grid grid-cols-3 gap-1 py-1">
            {ht_ft.map((cell) => (
              <div
                key={`${cell.ht}-${cell.ft}`}
                className="rounded bg-neutro-800/50 px-1 py-0.5 text-center text-xs tabular-nums"
              >
                <span className="text-neutro-400">
                  {cell.ht}/{cell.ft}
                </span>{" "}
                <span className="text-neutro-100">{pct(cell.prob)}</span>
              </div>
            ))}
          </div>
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
