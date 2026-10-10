import { z } from "zod";

/** Hard execution limits. Enforced server-side; never derived from user input. */
export const LIMITS = {
  maxSteps: 25,
  stepTimeoutMs: 15_000,
  defaultStepTimeoutMs: 8_000,
  runBudgetMs: 60_000,
  leaseSeconds: 90,
  maxTestsPerProject: 3,
  maxTextLen: 300,
} as const;

const text = z.string().trim().min(1).max(LIMITS.maxTextLen);

export const targetSchema = z.discriminatedUnion("by", [
  z.object({
    by: z.literal("role"),
    role: z.enum(["button", "link", "textbox", "checkbox", "radio", "combobox", "heading"]),
    name: z.string().trim().max(LIMITS.maxTextLen).default(""),
  }),
  z.object({ by: z.literal("label"), value: text }),
  z.object({ by: z.literal("text"), value: text }),
  z.object({ by: z.literal("placeholder"), value: text }),
  z.object({ by: z.literal("testId"), value: z.string().regex(/^[\w\-:.]{1,100}$/) }),
]);
export type Target = z.infer<typeof targetSchema>;

const timeout = z.number().int().min(500).max(LIMITS.stepTimeoutMs).optional();

export const stepSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("goto"), path: z.string().trim().max(1024), timeoutMs: timeout }),
  z.object({ action: z.literal("click"), target: targetSchema, timeoutMs: timeout }),
  z.object({ action: z.literal("fill"), target: targetSchema, value: z.string().max(500), timeoutMs: timeout }),
  z.object({ action: z.literal("select"), target: targetSchema, option: text, timeoutMs: timeout }),
  z.object({ action: z.literal("press"), key: z.enum(["Enter", "Tab", "Escape"]) }),
  z.object({ action: z.literal("waitFor"), target: targetSchema, timeoutMs: timeout }),
  z.object({ action: z.literal("assertText"), text, timeoutMs: timeout }),
  z.object({ action: z.literal("assertNoText"), text, timeoutMs: timeout }),
  z.object({ action: z.literal("assertVisible"), target: targetSchema, timeoutMs: timeout }),
  z.object({ action: z.literal("assertUrl"), contains: text, timeoutMs: timeout }),
]);
export type Step = z.infer<typeof stepSchema>;

export const planSchema = z.array(stepSchema).min(1).max(LIMITS.maxSteps);

/** Words that suggest irreversible actions. v1 refuses to click these. */
export const DESTRUCTIVE_RE =
  /\b(buy|pay|purchase|checkout|check out|place order|order now|subscribe|delete|remove account|close account|cancel subscription|confirm payment|transfer|donate)\b/i;

export type PlanIssue = { index: number; message: string };

/** Validate a plan and apply policy rules. Returns parsed steps or issues. */
export function validatePlan(raw: unknown, projectOrigin: string):
  | { ok: true; steps: Step[] }
  | { ok: false; issues: PlanIssue[] } {
  const parsed = planSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((i) => ({
        index: typeof i.path[0] === "number" ? i.path[0] : -1,
        message: `${i.path.slice(1).join(".") || "plan"}: ${i.message}`,
      })),
    };
  }
  const issues: PlanIssue[] = [];
  parsed.data.forEach((s, index) => {
    if (s.action === "goto") {
      const resolved = resolveOnOrigin(s.path, projectOrigin);
      if (!resolved) issues.push({ index, message: "Navigation must stay on the project's website" });
    }
    if (s.action === "click") {
      const label = "name" in s.target ? s.target.name : "value" in s.target ? s.target.value : "";
      if (DESTRUCTIVE_RE.test(label))
        issues.push({ index, message: `Refusing to click "${label}": purchases and destructive actions are not allowed` });
    }
  });
  return issues.length ? { ok: false, issues } : { ok: true, steps: parsed.data };
}

/** Resolve a path/URL against the project origin; null if it leaves the origin's site. */
export function resolveOnOrigin(pathOrUrl: string, origin: string): string | null {
  try {
    const base = new URL(origin);
    const u = new URL(pathOrUrl || "/", base);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    const strip = (h: string) => h.replace(/^www\./, "");
    const ph = strip(base.hostname), h = strip(u.hostname);
    if (h !== ph && !h.endsWith("." + ph)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

export function describeTarget(t: Target): string {
  switch (t.by) {
    case "role":
      return t.name ? `${t.role} "${t.name}"` : `first ${t.role}`;
    case "label":
      return `field labelled "${t.value}"`;
    case "text":
      return `element with text "${t.value}"`;
    case "placeholder":
      return `field with placeholder "${t.value}"`;
    case "testId":
      return `[data-testid="${t.value}"]`;
  }
}

export function describeStep(s: Step): string {
  switch (s.action) {
    case "goto":
      return `Open ${s.path || "/"}`;
    case "click":
      return `Click ${describeTarget(s.target)}`;
    case "fill":
      return `Fill ${describeTarget(s.target)} with "${s.value}"`;
    case "select":
      return `Select "${s.option}" in ${describeTarget(s.target)}`;
    case "press":
      return `Press ${s.key}`;
    case "waitFor":
      return `Wait for ${describeTarget(s.target)}`;
    case "assertText":
      return `Expect text "${s.text}" to be visible`;
    case "assertNoText":
      return `Expect text "${s.text}" NOT to be visible`;
    case "assertVisible":
      return `Expect ${describeTarget(s.target)} to be visible`;
    case "assertUrl":
      return `Expect URL to contain "${s.contains}"`;
  }
}

export type RunStatus = "queued" | "running" | "passed" | "failed" | "inconclusive" | "cancelled" | "infra_error";
export type StepStatus = "pending" | "running" | "passed" | "failed" | "skipped" | "inconclusive";

/** Error codes that are evidence of an application-level failure. */
const FAILURE_CODES = new Set([
  "assertion_failed",
  "element_not_found",
  "element_ambiguous",
  "element_disabled",
  "option_not_found",
  "http_error",
  "url_mismatch",
]);

export function stepStatusFor(code: string | null): StepStatus {
  if (!code) return "passed";
  return FAILURE_CODES.has(code) ? "failed" : "inconclusive";
}

/** Overall verdict. PASSED only if every step actually executed and passed. */
export function deriveRunStatus(steps: { status: StepStatus }[], planLength: number): RunStatus {
  if (steps.some((s) => s.status === "failed")) return "failed";
  if (steps.length === planLength && steps.every((s) => s.status === "passed")) return "passed";
  return "inconclusive";
}
