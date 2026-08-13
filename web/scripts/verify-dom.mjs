import { chromium } from "playwright-core";

const browser = await chromium.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1100, height: 1600 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto("http://localhost:5173/", { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(1500);

const body = await page.evaluate(() => document.body.innerText);
const checks = {
  "titulo FutbolTipster": body.includes("FutbolTipster"),
  "subtitulo sin apuestas": body.includes("sin apuestas"),
  "tab Premier League": body.includes("Premier League"),
  "tab Liga Pro": body.includes("Liga Pro"),
  "marcador (scoreline)": body.includes("Marcador:"),
  "etiqueta Favorito": body.includes("Favorito:"),
  "over 2.5": body.includes("Over 2.5"),
  "badge confianza": /Seguro|Probable|Ajustado|Incierto/.test(body),
  "matriz de marcador": body.includes("Matriz de marcador"),
  "goles esperados": body.includes("Goles esperados"),
};
for (const [k, v] of Object.entries(checks)) console.log(v ? "PASS" : "FAIL", k);
console.log("errores JS:", errors.length ? errors : "ninguno");
console.log("---- primeras lineas del DOM ----");
console.log(body.split("\n").slice(0, 30).join("\n"));
await browser.close();