export interface League {
  code: string;
  label: string;
  hasModel: boolean;
}

export interface MarketProbs {
  over: number;
  under: number;
}

export interface TeamTotals {
  home_over: number;
  away_over: number;
}

export interface Handicap {
  home_cover: number;
}

export interface CorrectScore {
  home: number;
  away: number;
  prob: number;
}

export interface HtFtCell {
  ht: "H" | "D" | "A";
  ft: "H" | "D" | "A";
  prob: number;
}

export interface CountMarkets {
  total: Record<string, MarketProbs>;
  team_totals: Record<string, TeamTotals>;
  most: { home: number; draw: number; away: number };
  handicap: Record<string, Handicap>;
  expected: { home: number; away: number };
}

export interface FirstEvent {
  home: number;
  away: number;
  none: number;
}

export interface Markets {
  ft: {
    double_chance: { "1X": number; "12": number; X2: number };
    over_under: Record<string, MarketProbs>;
    asian_handicap: Record<string, Handicap>;
    odd_even: { odd: number; even: number };
    team_totals: Record<string, TeamTotals>;
    clean_sheet: { home: number; away: number };
    correct_score_top: CorrectScore[];
  };
  ht?: {
    probabilities: { home: number; draw: number; away: number };
    double_chance: { "1X": number; "12": number; X2: number };
    over_under: Record<string, MarketProbs>;
    btts_yes: number;
    expected_goals: { home: number; away: number };
  };
  ht_ft?: HtFtCell[];
  corners?: CountMarkets;
  bookings?: CountMarkets;
  shots_on_target?: CountMarkets;
  fouls?: CountMarkets;
  first_goal?: FirstEvent;
  first_corner?: FirstEvent;
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
  markets?: Markets;
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
  skipReason: "no_model" | "team_not_in_model" | "predict_failed" | null;
}

export interface BandStat {
  band: string;
  level: string;
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
