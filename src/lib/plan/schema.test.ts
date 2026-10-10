import { describe, it, expect } from "vitest";
import { validatePlan, deriveRunStatus, stepStatusFor, LIMITS } from "./schema";

const origin = "https://shop.example.com";

describe("plan validation", () => {
  it("accepts a simple form journey", () => {
    const r = validatePlan(
      [
        { action: "goto", path: "/contact" },
        { action: "fill", target: { by: "label", value: "Email" }, value: "qa@example.com" },
        { action: "click", target: { by: "role", role: "button", name: "Send" } },
        { action: "assertText", text: "Thanks" },
      ],
      origin,
    );
    expect(r.ok).toBe(true);
  });
  it("rejects navigation to another site", () => {
    const r = validatePlan([{ action: "goto", path: "https://evil.com/" }], origin);
    expect(r.ok).toBe(false);
  });
  it("rejects clicking purchase or delete buttons", () => {
    expect(validatePlan([{ action: "click", target: { by: "role", role: "button", name: "Buy now" } }], origin).ok).toBe(false);
    expect(validatePlan([{ action: "click", target: { by: "text", value: "Delete account" } }], origin).ok).toBe(false);
  });
  it("rejects unknown actions such as raw code", () => {
    expect(validatePlan([{ action: "evaluate", code: "fetch('/x')" }], origin).ok).toBe(false);
  });
  it(`caps plans at ${LIMITS.maxSteps} steps and timeouts at 15s`, () => {
    const many = Array.from({ length: 26 }, () => ({ action: "press", key: "Tab" }));
    expect(validatePlan(many, origin).ok).toBe(false);
    expect(validatePlan([{ action: "assertText", text: "x", timeoutMs: 60_000 }], origin).ok).toBe(false);
  });
});

describe("verdicts", () => {
  it("passes only when every planned step passed", () => {
    expect(deriveRunStatus([{ status: "passed" }, { status: "passed" }], 2)).toBe("passed");
    expect(deriveRunStatus([{ status: "passed" }], 2)).toBe("inconclusive");
  });
  it("fails on an assertion failure", () => {
    expect(deriveRunStatus([{ status: "passed" }, { status: "failed" }], 2)).toBe("failed");
  });
  it("navigation errors and timeouts are inconclusive, not app bugs", () => {
    expect(stepStatusFor("nav_error")).toBe("inconclusive");
    expect(stepStatusFor("nav_timeout")).toBe("inconclusive");
    expect(stepStatusFor("element_not_found")).toBe("failed");
    expect(deriveRunStatus([{ status: "inconclusive" }, { status: "skipped" }], 2)).toBe("inconclusive");
  });
});
