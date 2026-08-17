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

const VIEWPORTS = [320, 375, 768, 1024, 1280, 1536];

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

async function measureOverflow(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const overflow = doc.scrollWidth - window.innerWidth;
    return { overflow, scrollWidth: doc.scrollWidth, innerWidth: window.innerWidth };
  });
}

const browser = await launch();

for (const width of VIEWPORTS) {
  const ctx = `${width}px`;
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  const consoleErrors = [];
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });
  page.on("pageerror", (e) => consoleErrors.push(String(e)));

  try {
    await page.goto(BASE, { waitUntil: "networkidle", timeout: 30000 });
    await page.getByRole("tab", { name: /Premier League/ }).waitFor({ timeout: 20000 });
    await page.waitForTimeout(1200);

    const m1 = await measureOverflow(page);
    check(`${ctx} sin desborde horizontal (estado base)`, m1.overflow <= 1, `overflow=${m1.overflow}px`);

    const predicted = page.locator('button[aria-controls^="detail-"]').first();
    check(`${ctx} hay tarjeta con prediccion`, (await predicted.count()) === 1);

    await predicted.click();
    await page.waitForTimeout(700);
    await page.getByText("Matriz de marcador").first().waitFor({ timeout: 5000 });
    const m2 = await measureOverflow(page);
    check(`${ctx} sin desborde con detalle expandido`, m2.overflow <= 1, `overflow=${m2.overflow}px`);

    const resultado = page.getByRole("button", { name: "Resultado" }).first();
    if ((await resultado.count()) === 1) {
      await resultado.click();
      await page.getByText("Doble oportunidad").first().waitFor({ timeout: 5000 });
      const m3 = await measureOverflow(page);
      check(`${ctx} sin desborde con mercado Resultado abierto`, m3.overflow <= 1, `overflow=${m3.overflow}px`);
    } else {
      check(`${ctx} mercado Resultado disponible`, false);
    }

    check(`${ctx} sin errores de consola`, consoleErrors.length === 0, consoleErrors.slice(0, 2).join(" | "));

    await page.screenshot({ path: `${OUT}/screenshots/responsive-${width}.png`, fullPage: true });
  } catch (err) {
    check(`${ctx} flujo completado: ${String(err).slice(0, 200)}`, false);
  } finally {
    await page.close();
  }
}

await browser.close();

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks OK`);
process.exit(failed ? 1 : 0);