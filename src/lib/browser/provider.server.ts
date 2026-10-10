/**
 * Browser execution provider interface. The rest of the app depends only on this,
 * so Browserless can be swapped for another remote Chromium without touching callers.
 */
import type { Step } from "@/lib/plan/schema";

export type ExecStepResult = {
  index: number;
  code: string | null;
  expected: string;
  observed: string;
  consoleErrors?: string[];
  networkErrors?: string[];
  screenshot?: string | null; // base64 jpeg
  url?: string | null;
  startedAt: string;
  durationMs: number;
};

export type ExecOutcome = {
  steps: ExecStepResult[];
  consoleErrors: string[];
  networkErrors: string[];
  blocked: string[];
  finalUrl: string | null;
  durationMs: number;
};

export type ExecContext = {
  plan: Step[];
  baseUrl: string;
  allowedHosts: string[];
  stepTimeoutMs: number;
  defaultStepTimeoutMs: number;
  budgetMs: number;
  destructiveRe: string;
};

export type ExecHooks = {
  onStep: (r: ExecStepResult) => Promise<void>;
  shouldStop: () => Promise<boolean>;
};

/** Thrown for configuration / infrastructure problems. Never an application verdict. */
export class InfraError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

export interface BrowserProvider {
  readonly name: string;
  /** True when the provider streams step results through hooks.onStep while running. */
  readonly streamsProgress: boolean;
  execute(ctx: ExecContext, hooks: ExecHooks): Promise<ExecOutcome>;
}

export function getProvider(): BrowserProvider {
  const name = process.env["BROWSER_PROVIDER"] || "browserless-function";
  const token = process.env["BROWSERLESS_TOKEN"];
  if (!token) {
    throw new InfraError(
      "browser_not_configured",
      "No browser provider is configured (BROWSERLESS_TOKEN is not set). Nothing was executed.",
    );
  }
  const endpoint = (process.env["BROWSERLESS_ENDPOINT"] || "https://production-sfo.browserless.io").replace(/\/$/, "");
  if (name === "browserless-function") return new BrowserlessFunctionProvider(endpoint, token);
  if (name === "browserless-playwright") return new BrowserlessPlaywrightProvider(endpoint, token);
  throw new InfraError("browser_not_configured", `Unknown BROWSER_PROVIDER "${name}"`);
}

/* ---------------- Browserless /function (HTTP; works on Workers, Vercel, Node) ---------------- */

class BrowserlessFunctionProvider implements BrowserProvider {
  readonly name = "browserless-function";
  readonly streamsProgress = false;
  constructor(private endpoint: string, private token: string) {}

  async execute(ctx: ExecContext, hooks: ExecHooks): Promise<ExecOutcome> {
    const { BROWSERLESS_FUNCTION_MODULE } = await import("./executor-source");
    const httpEndpoint = this.endpoint.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
    const url = `${httpEndpoint}/function?token=${encodeURIComponent(this.token)}&timeout=${ctx.budgetMs + 20_000}`;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), ctx.budgetMs + 30_000);
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: BROWSERLESS_FUNCTION_MODULE, context: ctx }),
        signal: ac.signal,
      });
    } catch (e) {
      throw new InfraError("browser_connect_failed", `Could not reach Browserless: ${(e as Error).message}`);
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      const body = (await res.text().catch(() => "")).slice(0, 400);
      const code =
        res.status === 401 || res.status === 403
          ? "browser_auth_failed"
          : res.status === 429
            ? "browser_rate_limited"
            : res.status === 408
              ? "browser_timeout"
              : "browser_provider_error";
      throw new InfraError(code, `Browserless responded HTTP ${res.status}${body ? `: ${body}` : ""}`);
    }
    const out = (await res.json()) as ExecOutcome;
    if (!out || !Array.isArray(out.steps)) throw new InfraError("browser_provider_error", "Browserless returned an unexpected response");
    for (const s of out.steps) await hooks.onStep(s);
    return out;
  }
}

/* ---------------- Browserless Playwright WebSocket (Node runtimes only) ---------------- */

class BrowserlessPlaywrightProvider implements BrowserProvider {
  readonly name = "browserless-playwright";
  readonly streamsProgress = true;
  constructor(private endpoint: string, private token: string) {}

  async execute(ctx: ExecContext, hooks: ExecHooks): Promise<ExecOutcome> {
    // Non-literal specifier keeps playwright-core out of edge bundles (it needs Node APIs).
    const spec = "playwright-core";
    let pw: typeof import("playwright-core");
    try {
      pw = await import(/* @vite-ignore */ spec);
    } catch {
      throw new InfraError(
        "provider_unsupported_runtime",
        "playwright-core cannot load on this runtime (edge/Workers). Use BROWSER_PROVIDER=browserless-function.",
      );
    }
    const wsBase = this.endpoint.replace(/^https:/, "wss:").replace(/^http:/, "ws:");
    const wsUrl = `${wsBase}/chromium/playwright?token=${encodeURIComponent(this.token)}&timeout=${ctx.budgetMs + 20_000}`;
    let browser: import("playwright-core").Browser;
    try {
      browser = await pw.chromium.connect(wsUrl, { timeout: 15_000 });
    } catch (e) {
      const msg = (e as Error).message.replace(this.token, "***");
      throw new InfraError(/401|403|unauthori/i.test(msg) ? "browser_auth_failed" : "browser_connect_failed", `Could not connect to Browserless: ${msg.split("\n")[0]}`);
    }
    try {
      const context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        serviceWorkers: "block",
        acceptDownloads: false,
        ignoreHTTPSErrors: false,
      });
      const page = await context.newPage();
      const { EXECUTOR_CORE } = await import("./executor-source");
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      const run = new Function("page", "ctx", "kind", "hooks", `${EXECUTOR_CORE}\nreturn __dp_run(page, ctx, kind, hooks);`);
      return (await run(page, ctx, "playwright", hooks)) as ExecOutcome;
    } finally {
      await browser.close().catch(() => {});
    }
  }
}
