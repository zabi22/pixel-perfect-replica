import { describe, it, expect } from "vitest";
import { validateInvestigation } from "./investigate";
import type { Step } from "@/lib/plan/schema";

const plan: Step[] = [
  { action: "goto", path: "/" },
  { action: "click", target: { by: "role", role: "link", name: "Medarbetare" } },
];
const steps = [
  { position: 0, status: "passed", error_code: null, page_observation: null },
  { position: 1, status: "failed", error_code: "element_not_found", page_observation: { links: ["Om oss", "Kontakt"] } },
];

describe("validateInvestigation", () => {
  it("drops hypotheses without cited recorded evidence", () => {
    const r = validateInvestigation({ hypotheses: [{ text: "Server down", evidence: "", steps: [] }, { text: "Link renamed", evidence: "links list", steps: [2] }] }, steps, plan);
    expect(r.hypotheses.map((h) => h.text)).toEqual(["Link renamed"]);
  });
  it("keeps a locator suggestion only if its name appears in the observation", () => {
    const ok = validateInvestigation({ locatorSuggestion: { step: 2, proposed: { action: "click", target: { by: "role", role: "link", name: "Om oss" } } } }, steps, plan);
    expect(ok.locatorSuggestion?.step).toBe(1);
    const bad = validateInvestigation({ locatorSuggestion: { step: 2, proposed: { action: "click", target: { by: "role", role: "link", name: "Team" } } } }, steps, plan);
    expect(bad.locatorSuggestion).toBeNull();
  });
  it("rejects suggestions that change the action or target another step", () => {
    expect(validateInvestigation({ locatorSuggestion: { step: 2, proposed: { action: "assertText", text: "Om oss" } } }, steps, plan).locatorSuggestion).toBeNull();
    expect(validateInvestigation({ locatorSuggestion: { step: 1, proposed: { action: "goto", path: "/om-oss" } } }, steps, plan).locatorSuggestion).toBeNull();
  });
  it("takes the failed step from records, not from the AI", () => {
    expect(validateInvestigation({ failedStep: 1 }, steps, plan).failedStep).toBe(1);
  });
  it("survives malformed output", () => {
    expect(validateInvestigation("nonsense", steps, plan).hypotheses).toEqual([]);
  });
});

import { pickInvestigationScreenshot, visualObservations } from "./investigate";
import { redactDeep } from "@/lib/security/redact";

describe("screenshot evidence", () => {
  const U = "user-a", R = "run-1";
  const failed = (p: string | null) => [{ position: 0, status: "passed", screenshot_path: `${U}/${R}/0.jpg` }, { position: 1, status: "failed", screenshot_path: p }];
  it("uses the failing step's screenshot from this user's run folder", () => {
    expect(pickInvestigationScreenshot(failed(`${U}/${R}/1.jpg`), U, R)).toEqual({ path: `${U}/${R}/1.jpg` });
  });
  it("refuses screenshots from another user or another run", () => {
    expect("reason" in pickInvestigationScreenshot(failed(`user-b/${R}/1.jpg`), U, R)).toBe(true);
    expect("reason" in pickInvestigationScreenshot(failed(`${U}/run-2/1.jpg`), U, R)).toBe(true);
    expect("reason" in pickInvestigationScreenshot(failed(`${U}/${R}/../../x.jpg`), U, R)).toBe(true);
  });
  it("explains a missing screenshot", () => {
    const r = pickInvestigationScreenshot(failed(null), U, R);
    expect("reason" in r && r.reason).toMatch(/No screenshot/);
  });
  it("drops visual observations unless an image was really supplied", () => {
    expect(visualObservations({ visualObservations: ["A cookie banner covers the menu"] }, false)).toEqual([]);
    expect(visualObservations({ visualObservations: ["A cookie banner covers the menu"] }, true)).toEqual(["A cookie banner covers the menu"]);
  });
  it("redacts credentials before evidence reaches the AI", () => {
    const out = JSON.stringify(redactDeep({ observed: "token=abc123secret", url_after: "https://x.test/?access_token=zzz", step: { action: "fill", value: "hunter2", target: { by: "label", value: "Password" } } }));
    expect(out).not.toContain("abc123secret");
    expect(out).not.toContain("zzz");
  });
  it("investigation output carries no verdict field", () => {
    const r = validateInvestigation({ status: "passed", verdict: "passed" }, steps, plan) as Record<string, unknown>;
    expect(r["status"]).toBeUndefined();
    expect(r["verdict"]).toBeUndefined();
  });
});
