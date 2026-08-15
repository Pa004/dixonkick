import { chromium } from "playwright-core";
import { existsSync } from "node:fs";

const BASE = process.env.WEB_URL || "http://localhost:5173";
const OUT = process.env.SHOT_DIR || ".";

const CHROME_CANDIDATES = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
];

const results = [];
function check(name, ok, extra = "") {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${extra ? ` — ${extra}` : ""}`);
}

const executablePath = CHROME_CANDIDATES.find((p) => existsSync(p));

async function launch() {
  if (executablePath) {
    return chromium.launch({ executablePath, headless: true });
  }
  return chromium.launch({ channel: "chrome", headless: true });
}

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
const consoleErrors = [];
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(m.text());
});
page.on("pageerror", (e) => consoleErrors.push(String(e)));

try {
  await page.goto(BASE, { waitUntil: "networkidle", timeout: 30000 });
  await page.getByRole("tab", { name: /Premier League/ }).waitFor({ timeout: 20000 });
  check("tabs de ligas cargan", true);

  await page.waitForTimeout(1200);
  const cards = await page.locator("button[aria-expanded]").count();
  check("hay tarjetas de partido", cards > 0, `cards=${cards}`);

  const predicted = page.locator('button[aria-controls^="detail-"]').first();
  check("al menos una tarjeta tiene prediccion", (await predicted.count()) === 1);

  await predicted.click();
  await page.waitForTimeout(700);
  check("el detalle del partido se expande", await page.getByText("Matriz de marcador").first().isVisible());

  const mercados = page.getByRole("heading", { name: "Mercados" }).first();
  check("seccion Mercados usa h2", await mercados.isVisible());

  await page.getByRole("button", { name: "Resultado" }).first().click();
  check("el mercado Resultado se abre", await page.getByText("Doble oportunidad").first().isVisible());

  check("sin errores de consola", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | "));

  await page.screenshot({ path: `${OUT}/screenshots/e2e-detail.png`, fullPage: true });
} catch (err) {
  check(`smoke completado: ${String(err).slice(0, 200)}`, false);
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks OK`);
process.exit(failed ? 1 : 0);