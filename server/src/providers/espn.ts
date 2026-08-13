import { LEAGUES } from "../config.js";

interface EspnEvent {
  id: string;
  date: string;
  status?: { type?: { state?: string; completed: boolean } };
  competitions?: {
    competitors: { homeAway: string; score?: string; team: { displayName: string; abbreviation: string } }[];
  }[];
}

function isoDay(offsetDays: number): string {
  return new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10).replace(/-/g, "");
}

export async function fetchLeagueFixtures(espnLeague: string): Promise<
  {
    id: string;
    date: string;
    home: string;
    away: string;
    homeShort: string;
    awayShort: string;
    status: string;
    homeScore: number | null;
    awayScore: number | null;
  }[]
> {
  const range = `dates=${isoDay(0)}-${isoDay(14)}`;
  const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${espnLeague}/scoreboard?${range}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "futboltipster/0.1" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`ESPN ${espnLeague}: ${res.status}`);
  const data = (await res.json()) as { events?: EspnEvent[] };
  if (!data.events) return [];

  return data.events
    .map((ev) => {
      const comp = ev.competitions?.[0];
      if (!comp?.competitors) return null;
      const home = comp.competitors.find((c) => c.homeAway === "home");
      const away = comp.competitors.find((c) => c.homeAway === "away");
      const score = (c?: typeof home): number | null => {
        if (c?.score == null || c.score === "") return null;
        const n = Number(c.score);
        return Number.isFinite(n) ? n : null;
      };
      return {
        id: ev.id,
        date: ev.date,
        home: home?.team.displayName ?? "?",
        away: away?.team.displayName ?? "?",
        homeShort: home?.team.abbreviation ?? "",
        awayShort: away?.team.abbreviation ?? "",
        status: ev.status?.type?.state ?? "pre",
        homeScore: score(home),
        awayScore: score(away),
      };
    })
    .filter((f): f is NonNullable<typeof f> => f !== null);
}

export const espnLeagues = Object.values(LEAGUES).map((l) => l.espn);
