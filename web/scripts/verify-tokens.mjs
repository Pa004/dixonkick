import { chromium } from "playwright-core";

const browser = await chromium.launch({
  executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1100, height: 1600 } });
await page.goto("http://localhost:5173/", { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(1200);

const h1 = await page.locator("h1").first().evaluate((el) => getComputedStyle(el).fontFamily);
const bar = await page.locator("[role=img][aria-label^='Probabilidades'] > div").first().evaluate(
  (el) => getComputedStyle(el).backgroundColor,
);
const card = await page.locator("div.rounded-base").first().evaluate((el) => getComputedStyle(el).borderRadius);
const tabSelected = await page.locator("[role=tab][aria-selected=true]").first().evaluate(
  (el) => getComputedStyle(el).backgroundColor,
);
console.log("h1 font-family:", h1);
console.log("segmento Local bg:", bar);
console.log("card border-radius:", card);
console.log("tab activo bg:", tabSelected);
console.log("Sora cargada:", h1.includes("Sora") ? "PASS" : "FAIL");
console.log("radius 12px:", card === "12px" ? "PASS" : "FAIL");
await browser.close();