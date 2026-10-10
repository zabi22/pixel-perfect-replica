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
