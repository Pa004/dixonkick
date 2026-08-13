import { ML_URL } from "./config.js";

let modelTeams: string[] | null = null;
let cachedAt = 0;
const TEAMS_TTL = 60 * 60 * 1000;

export async function getModelTeams(): Promise<string[]> {
  if (modelTeams && Date.now() - cachedAt < TEAMS_TTL) return modelTeams;
  try {
    const res = await fetch(`${ML_URL}/teams`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`ml-service /teams: ${res.status}`);
    const data = (await res.json()) as { teams: string[] };
    modelTeams = data.teams;
    cachedAt = Date.now();
  } catch (err) {
    if (modelTeams) return modelTeams; // caché vencida como respaldo
    throw err;
  }
  return modelTeams;
}

const OVERRIDES: Record<string, string> = {
  "man city": "Man City",
  "manchester city": "Man City",
  "man utd": "Man United",
  "manchester united": "Man United",
  "sheff utd": "Sheffield United",
  "sheffield united": "Sheffield United",
  "sheff wed": "Sheffield Wednesday",
  "sheffield wednesday": "Sheffield Wednesday",
  tottenham: "Tottenham",
  "tottenham hotspur": "Tottenham",
  newcastle: "Newcastle",
  "newcastle united": "Newcastle",
  "west brom": "West Brom",
  "west bromwich albion": "West Brom",
  wolves: "Wolves",
  "wolverhampton wanderers": "Wolves",
  leeds: "Leeds",
  "leeds united": "Leeds",
  "nott m forest": "Nott'm Forest",
  "nottingham forest": "Nott'm Forest",
  brighton: "Brighton",
  "brighton hove albion": "Brighton",
  "atletico madrid": "Ath Madrid",
  "athletic bilbao": "Ath Bilbao",
  "athletic club": "Ath Bilbao",
  "real betis": "Betis",
  betis: "Betis",
  "real sociedad": "Sociedad",
  sociedad: "Sociedad",
  "rcd mallorca": "Mallorca",
  mallorca: "Mallorca",
  osasuna: "Osasuna",
  villarreal: "Villarreal",
  girona: "Girona",
  espanol: "Espanol",
  espanyol: "Espanol",
  cadiz: "Cadiz",
  malaga: "Malaga",
  vallecano: "Vallecano",
  "las palmas": "Las Palmas",
  inter: "Inter",
  "inter milan": "Inter",
  internazionale: "Inter",
  milan: "Milan",
  "ac milan": "Milan",
  atalanta: "Atalanta",
  napoli: "Napoli",
  lazio: "Lazio",
  "hellas verona": "Verona",
  verona: "Verona",
  monza: "Monza",
  parma: "Parma",
  como: "Como",
  "bayern munchen": "Bayern Munich",
  "bayern munich": "Bayern Munich",
  dortmund: "Dortmund",
  "borussia dortmund": "Dortmund",
  "rb leipzig": "RB Leipzig",
  leipzig: "RB Leipzig",
  "bayer leverkusen": "Leverkusen",
  leverkusen: "Leverkusen",
  stuttgart: "Stuttgart",
  "vfl wolfsburg": "Wolfsburg",
  wolfsburg: "Wolfsburg",
  mainz: "Mainz",
  augsburg: "Augsburg",
  "borussia monchengladbach": "M'gladbach",
  mgladbach: "M'gladbach",
  freiburg: "Freiburg",
  "union berlin": "Union Berlin",
  bochum: "Bochum",
  koln: "FC Koln",
  "fc koln": "FC Koln",
  "eintracht frankfurt": "Ein Frankfurt",
  frankfurt: "Ein Frankfurt",
  "st pauli": "St Pauli",
  heidenheim: "Heidenheim",
  "holstein kiel": "Holstein Kiel",
  "paris saint germain": "Paris SG",
  "paris sg": "Paris SG",
  marseille: "Marseille",
  lille: "Lille",
  "ogc nice": "Nice",
  nice: "Nice",
  "stade rennais": "Rennes",
  rennes: "Rennes",
  "as monaco": "Monaco",
  monaco: "Monaco",
  lyon: "Lyon",
  montpellier: "Montpellier",
  nantes: "Nantes",
  toulouse: "Toulouse",
  "stade de reims": "Reims",
  reims: "Reims",
  strasbourg: "Strasbourg",
  "stade brestois": "Brest",
  brest: "Brest",
  "rc lens": "Lens",
  lens: "Lens",
  auxerre: "Auxerre",
  angers: "Angers",
  "le havre": "Le Havre",
  "evian thonon gaillard": "Evian Thonon Gaillard",
  hamburg: "Hamburg",
  hanover: "Hannover",
  schalke: "Schalke 04",
  "werder bremen": "Werder Bremen",
};

function normalize(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function similarity(a: string, b: string): number {
  const at = new Set(a.split(" "));
  const bt = new Set(b.split(" "));
  if (at.size === 0 || bt.size === 0) return 0;
  const inter = new Set([...at].filter((t) => bt.has(t))).size;
  return inter / Math.min(at.size, bt.size);
}

function bestMatch(key: string, teams: string[]): string | null {
  let best: string | null = null;
  let bestScore = 0;
  for (const t of teams) {
    const score = similarity(key, normalize(t));
    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  }
  return bestScore >= 0.8 ? best : null;
}

export async function resolveTeam(displayName: string): Promise<string | null> {
  const key = normalize(displayName);
  const teams = await getModelTeams();

  const override = OVERRIDES[key];
  if (override) {
    if (teams.includes(override)) return override;
    return bestMatch(override, teams); // fallback fuzzy si el override no está en el modelo
  }

  return bestMatch(key, teams);
}
