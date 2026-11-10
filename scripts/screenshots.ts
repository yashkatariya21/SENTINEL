/**
 * Screenshot sweep for the review checklist.
 *
 * Renders the screens a reviewer actually judges at two widths, plus a
 * reduced-motion pass, and fails loudly if a page throws or logs a React error.
 *
 * It is deliberately NOT a dependency of the app: Playwright is not in
 * package.json, so `npm ci` and CI stay fast. Install it on demand:
 *
 *   cd frontend
 *   npm i -D playwright && npx playwright install chromium
 *   API_URL=http://127.0.0.1:8000 npm run dev            # in another shell
 *   npx tsx ../scripts/screenshots.ts                    # or: npx ts-node ...
 *
 * Output: ../docs/images/screens/<screen>-<width>.png (and -reduced for the
 * motion pass). Nothing is committed automatically — review, then add the ones
 * worth keeping.
 */
import { mkdir } from "node:fs/promises";
import { chromium, type Browser, type Page } from "playwright";

const BASE = process.env.SCREENSHOT_BASE ?? "http://127.0.0.1:3000";
const OUT = process.env.SCREENSHOT_OUT ?? new URL("../docs/images/screens/", import.meta.url).pathname;
const EMAIL = process.env.SCREENSHOT_EMAIL ?? "maya@northwind.example";
const PASSWORD = process.env.SCREENSHOT_PASSWORD ?? process.env.SEED_PASSWORD ?? "";

/** Screens worth looking at. `auth: false` pages are captured signed out. */
const SCREENS: { name: string; path: string; auth?: boolean; full?: boolean }[] = [
  { name: "login", path: "/login", auth: false, full: true },
  { name: "overview", path: "/", full: true },
  { name: "queue", path: "/content", full: true },
  { name: "report", path: "/content/:first", full: true },
  { name: "approval", path: "/content/:first/approval", full: true },
  { name: "kit", path: "/kit", full: true },
  { name: "rules", path: "/rules", full: true },
  { name: "learning", path: "/learn", full: true },
  { name: "analytics", path: "/analytics", full: true },
  { name: "evaluation", path: "/evaluation", full: true },
  { name: "audit", path: "/audit", full: true },
  { name: "settings", path: "/settings", full: true },
  { name: "brand", path: "/brand", full: true },
  { name: "brand-characters", path: "/brand/characters", full: true },
  { name: "not-found", path: "/this-page-does-not-exist", full: true },
];

const WIDTHS = [
  { label: "1440", width: 1440, height: 1000 },
  { label: "360", width: 360, height: 780 },
];

function watch(page: Page, problems: string[], label: string) {
  page.on("pageerror", (error) => problems.push(`${label}: uncaught ${error.message}`));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    // Next's dev overlay noise is not a defect; React warnings and failed
    // requests are.
    if (/Download the React DevTools|\[Fast Refresh\]/.test(text)) return;
    problems.push(`${label}: console ${text.slice(0, 200)}`);
  });
  page.on("requestfailed", (request) => {
    problems.push(`${label}: request failed ${request.method()} ${request.url()}`);
  });
}

async function signIn(page: Page) {
  if (!PASSWORD) {
    throw new Error(
      "No password for the screenshot user. Set SCREENSHOT_PASSWORD (or SEED_PASSWORD) " +
        "to the demo password configured in the backend.",
    );
  }
  await page.goto(`${BASE}/login`, { waitUntil: "load" });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('form button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20_000 });
}

async function firstItemId(page: Page): Promise<string | null> {
  const response = await page.request.get(`${BASE}/v1/content`);
  if (!response.ok()) return null;
  const items = (await response.json()) as { id: string }[];
  return items[0]?.id ?? null;
}

async function shoot(browser: Browser, screen: (typeof SCREENS)[number], viewport: typeof WIDTHS[number],
                     reducedMotion: boolean, itemId: string | null, problems: string[]) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    reducedMotion: reducedMotion ? "reduce" : "no-preference",
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const label = `${screen.name}@${viewport.label}${reducedMotion ? " (reduced motion)" : ""}`;
  watch(page, problems, label);

  if (screen.auth !== false) await signIn(page);

  const path = screen.path.replace(":first", itemId ?? "");
  if (path.includes("//")) {
    problems.push(`${label}: skipped — no content item to open`);
    await context.close();
    return;
  }

  const response = await page.goto(`${BASE}${path}`, { waitUntil: "load" });
  if (response && response.status() >= 400 && screen.name !== "not-found") {
    problems.push(`${label}: HTTP ${response.status()} on ${path}`);
  }
  // wait for data-driven pages to settle: skeletons replaced by content
  await page.waitForTimeout(2500);

  const suffix = reducedMotion ? "-reduced" : "";
  await page.screenshot({
    path: `${OUT}${screen.name}-${viewport.label}${suffix}.png`,
    fullPage: Boolean(screen.full),
  });
  await context.close();
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const problems: string[] = [];
  const browser = await chromium.launch();

  try {
    // one signed-in page to discover a content id for the report screens
    const probe = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const probePage = await probe.newPage();
    let itemId: string | null = null;
    try {
      await signIn(probePage);
      itemId = await firstItemId(probePage);
    } finally {
      await probe.close();
    }
    if (!itemId) problems.push("no content item found — report screens were skipped (load the demo first)");

    for (const viewport of WIDTHS) {
      for (const screen of SCREENS) {
        await shoot(browser, screen, viewport, false, itemId, problems);
      }
    }
    // reduced-motion pass: one desktop capture per animated screen
    for (const name of ["login", "overview", "report", "brand-characters"]) {
      const screen = SCREENS.find((s) => s.name === name);
      if (screen) await shoot(browser, screen, WIDTHS[0], true, itemId, problems);
    }
  } finally {
    await browser.close();
  }

  const unique = [...new Set(problems)];
  if (unique.length) {
    console.error(`\n${unique.length} problem(s) found while capturing:\n`);
    for (const problem of unique) console.error(`  - ${problem}`);
    process.exitCode = 1;
  } else {
    console.log(`clean sweep — screenshots written to ${OUT}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
