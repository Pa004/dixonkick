import { ML_URL } from "./config.js";

export interface Band {
  level: string;
  label: string;
  lo: number;
  hi: number;
}

// Fallback cuando ml-service no responde. La fuente de verdad son las bandas que
// expone GET /bands (ml-service/app/models/dixon_coles.py confidence_bands()).
export const DEFAULT_BANDS: Band[] = [
  { level: "seguro", label: "Seguro", lo: 0.65, hi: 1.01 },
  { level: "probable", label: "Probable", lo: 0.55, hi: 0.65 },
  { level: "ajustado", label: "Ajustado", lo: 0.45, hi: 0.55 },
  { level: "incierto", label: "Incierto", lo: 0, hi: 0.45 },
];

const TTL = 60 * 60 * 1000;
let cached: Band[] | null = null;
let cachedAt = 0;
let inflight: Promise<Band[]> | null = null;

export async function getBands(): Promise<Band[]> {
  if (cached && Date.now() - cachedAt < TTL) return cached;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await fetch(`${ML_URL}/bands`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`ml-service /bands: ${res.status}`);
      const data = (await res.json()) as Band[];
      if (!Array.isArray(data) || data.length === 0) throw new Error("ml-service /bands: formato inválido");
      cached = data;
      cachedAt = Date.now();
    } catch (err) {
      if (cached) return cached; // caché vencida como respaldo
      console.error(`[bands] sin respuesta de ml-service, usando defaults: ${(err as Error).message}`);
      return DEFAULT_BANDS;
    } finally {
      inflight = null;
    }
    return cached ?? DEFAULT_BANDS;
  })();
  return inflight;
}

export function resetBandsCache(): void {
  cached = null;
  cachedAt = 0;
  inflight = null;
}