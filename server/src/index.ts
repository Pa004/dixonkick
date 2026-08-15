import "dotenv/config";
import cors from "cors";
import express from "express";
import cron from "node-cron";

import { CORS_ORIGINS, ML_URL, PORT, SYNC_CRON } from "./config.js";
import { api } from "./routes/api.js";
import { runSync } from "./services/predict.js";

const app = express();

// Cabeceras de seguridad mínimas (sin dependencias extra)
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  next();
});

app.use(cors({ origin: CORS_ORIGINS.length ? CORS_ORIGINS : true }));
app.use(express.json());
app.use("/api", api);

async function waitForMl(retries = 24, delayMs = 5000): Promise<void> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`${ML_URL}/health`, { signal: AbortSignal.timeout(3000) });
      if (res.ok) return;
    } catch {
      // ml-service aún no responde; se reintenta
    }
    console.log(`[boot] esperando ml-service (intento ${i + 1}/${retries})...`);
    await new Promise((r) => setTimeout(r, delayMs));
  }
  console.error(`[boot] ml-service no respondió tras ${retries} intentos; se reintentará en el próximo cron`);
}

async function tick() {
  try {
    const { inserted, predicted, checked } = await runSync();
    console.log(`[sync] inserted=${inserted} predicted=${predicted} checked=${checked}`);
  } catch (err) {
    console.error("[sync]", (err as Error).message);
  }
}

async function main() {
  app.listen(PORT, () => console.log(`FutbolTipster server en http://localhost:${PORT}`));
  cron.schedule(SYNC_CRON, tick);
  await waitForMl();
  await tick();
}

main().catch((err) => console.error("[boot]", (err as Error).message));
