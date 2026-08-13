export interface League {
  code: string;
  label: string;
  hasModel: boolean;
}

export interface Prediction {
  probabilities: { home: number; draw: number; away: number };
  scoreline: { home: number; away: number; probability: number };
  over_25: number;
  under_25: number;
  btts_yes: number;
  btts_no: number;
  expected_goals: { home: number; away: number };
  pick: "H" | "D" | "A";
  confidence: { level: string; label: string; probability: number };
  score_matrix?: number[][];
}

export interface Fixture {
  id: string;
  league: string;
  date: string;
  home: string;
  away: string;
  homeShort: string;
  awayShort: string;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  prediction: Prediction | null;
  predictedAt: string | null;
}

export interface BandStat {
  band: string;
  count: number;
  accuracy: number | null;
}

export interface Stats {
  totalTracked: number;
  overallAccuracy: number | null;
  bands: BandStat[];
}

const BASE = import.meta.env.VITE_API_URL ?? "/api";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json() as Promise<T>;
}

export const fetchLeagues = () => get<League[]>("/leagues");
export const fetchFixtures = () => get<Fixture[]>("/fixtures");
export const fetchStats = () => get<Stats>("/stats");
