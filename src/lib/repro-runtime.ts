import { chromium, type Browser, type Page } from "playwright";
import type { ReproResult, ReproScenario } from "@/lib/repro-contract";
import { traceEvidence } from "@/lib/trace-evidence";

type BrowserCache = {
  browser: Browser | null;
};

const globalForSandbox = globalThis as typeof globalThis & {
  traceSandbox?: BrowserCache;
};

const browserCache = (globalForSandbox.traceSandbox ??= {
  browser: null,
});

async function readLogEvents(page: Page) {
  return page.locator(".font-mono div").evaluateAll((nodes) =>
    nodes.map((node) => node.textContent?.replace(/\s+/g, " ").trim() ?? ""),
  );
}

async function getWarmBrowser() {
  if (browserCache.browser?.isConnected()) {
    return {
      browser: browserCache.browser,
      coldStartMs: 0,
      reusedBrowser: true,
    };
  }

  const startedAt = Date.now();
  browserCache.browser = await chromium.launch({ headless: true });

  return {
    browser: browserCache.browser,
    coldStartMs: Date.now() - startedAt,
    reusedBrowser: false,
  };
}

async function runScenario(
  browser: Browser,
  origin: string,
  name: string,
  viewport: ReproScenario["viewport"],
  includeScreenshot: boolean,
): Promise<ReproScenario & { contextMs: number; screenshotMs: number }> {
  const contextStartedAt = Date.now();
  const context = await browser.newContext({ viewport });
  const contextMs = Date.now() - contextStartedAt;

  try {
    const page = await context.newPage();
    await page.goto(`${origin}${traceEvidence.checkoutRoute}`, {
      waitUntil: "networkidle",
    });

    await page.getByTestId(traceEvidence.selectors.couponInput).fill(traceEvidence.coupon);
    await page.getByTestId(traceEvidence.selectors.applyCoupon).click();
    await page.waitForFunction(
      () => document.querySelector('[data-testid="cart-total"]')?.textContent?.includes("$155"),
      undefined,
      { timeout: 5_000 },
    );

    const checkoutButton = page.getByTestId(traceEvidence.selectors.checkoutButton);
    const checkoutVisible = await checkoutButton.isVisible();
    const totalText = await page.getByTestId(traceEvidence.selectors.cartTotal).innerText();
    const logEvents = await readLogEvents(page);
    const screenshotStartedAt = Date.now();
    let screenshotDataUrl: string | undefined;

    if (includeScreenshot) {
      await page.getByTestId("checkout-action-zone").scrollIntoViewIfNeeded();
      await page.waitForTimeout(100);
      screenshotDataUrl = `data:image/png;base64,${(await page.screenshot({ fullPage: false })).toString("base64")}`;
    }

    const screenshotMs = includeScreenshot ? Date.now() - screenshotStartedAt : 0;

    return {
      name,
      viewport,
      coupon: traceEvidence.coupon,
      checkoutVisible,
      totalText,
      logEvents,
      screenshotDataUrl,
      contextMs,
      screenshotMs,
    };
  } finally {
    await context.close().catch(() => undefined);
  }
}

export async function runCheckoutRepro(origin: string): Promise<ReproResult> {
  const startedAt = Date.now();
  const { browser, coldStartMs, reusedBrowser } = await getWarmBrowser();
  const [desktop, mobile] = await Promise.all([
    runScenario(browser, origin, "Desktop control", { width: 1280, height: 800 }, false),
    runScenario(browser, origin, "Mobile customer repro", { width: 390, height: 844 }, true),
  ]);

  const reproduced = desktop.checkoutVisible && !mobile.checkoutVisible;

  return {
    reproduced,
    elapsedMs: Date.now() - startedAt,
    route: traceEvidence.checkoutRoute,
    sandbox: {
      kind: "warm-browser-context",
      coldStartMs,
      reusedBrowser,
      desktopContextMs: desktop.contextMs,
      mobileContextMs: mobile.contextMs,
      screenshotMs: mobile.screenshotMs,
    },
    desktop,
    mobile,
    assertion: reproduced
      ? "Desktop checkout remains visible while mobile checkout disappears after SAVE20."
      : "Expected desktop visible and mobile hidden after SAVE20, but the assertion did not match.",
  };
}
