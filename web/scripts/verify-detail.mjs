import { chromium } from "playwright-core";

const browser = await chromium.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1100, height: 1600 } });
await page.goto("http://localhost:5173/", { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(1200);

const cards = page.locator("button[aria-expanded]");
const count = await cards.count();
console.log("cards:", count);
const withPred = [];
for (let i = 0; i < count; i++) {
  const text = await cards.nth(i).innerText();
  if (text.includes("Marcador:")) withPred.push(i);
}
console.log("cards con prediccion:", withPred.length);
if (withPred.length) {
  const idx = withPred[0];
  await cards.nth(idx).click();
  await page.waitForTimeout(500);
  const body = await page.evaluate(() => document.body.innerText);
  console.log("detalle abierto -> matriz:", body.includes("Matriz de marcador") ? "PASS" : "FAIL");
  console.log("goles esperados:", body.includes("Goles esperados") ? "PASS" : "FAIL");
  console.log("BTTS:", body.includes("BTTS Sí") ? "PASS" : "FAIL");
  const cells = await page.locator("table tbody td").count();
  console.log("celdas del heatmap:", cells);
}
await browser.close();