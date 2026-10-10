import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { investigateRun } from "@/lib/app.functions";
import { describeStep, type Step } from "@/lib/plan/schema";
import type { Investigation } from "@/lib/ai/investigate";
import { Button } from "@/components/ui/button";

const n = (steps: number[]) => (steps.length ? ` (step ${steps.map((x) => x + 1).join(", ")})` : "");

export function InvestigationPanel({ runId, plan, onReviewLocator }: { runId: string; plan: Step[]; onReviewLocator: (p: Step[]) => void }) {
  const investigate = useServerFn(investigateRun);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<(Investigation & { visualObservations: string[]; visualNote: string; screenshotAnalysed: boolean }) | null>(null);

  async function go() {
    setBusy(true);
    setError(null);
    try {
      const r = await investigate({ data: { runId } });
      if (r.ok) setReport(r.report);
      else setError(r.error);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mb-6 rounded-md border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h2 className="text-sm font-semibold">Investigate failure</h2>
          <p className="text-xs text-muted-foreground">AI reads only what this run recorded. It never changes the result, the test, or starts a rerun.</p>
        </div>
        <Button size="sm" variant="outline" className="ml-auto" onClick={go} disabled={busy}>{busy ? "Investigating…" : report ? "Investigate again" : "Investigate failure"}</Button>
      </div>
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
      {report && (
        <div className="mt-4 space-y-4 text-sm">
          {report.failedStep !== null && plan[report.failedStep] && (
            <p><span className="text-muted-foreground">Failing step (recorded):</span> {report.failedStep + 1}. {describeStep(plan[report.failedStep]!)}</p>
          )}
          {report.summary && <p>{report.summary}</p>}
          {report.facts.length > 0 && (
            <div><h3 className="text-xs font-medium uppercase tracking-wide text-success">Confirmed facts</h3>
              <ul className="mt-1 list-disc pl-5">{report.facts.map((f, i) => <li key={i}>{f.text}<span className="text-muted-foreground">{n(f.steps)}</span></li>)}</ul></div>
          )}
          <p className="text-xs text-muted-foreground">Screenshot: {report.visualNote}</p>
          {report.screenshotAnalysed && report.visualObservations.length > 0 && (
            <div><h3 className="text-xs font-medium uppercase tracking-wide text-info">Visual observations (AI reading of the screenshot, not confirmed)</h3>
              <ul className="mt-1 list-disc pl-5">{report.visualObservations.map((v, i) => <li key={i}>{v}</li>)}</ul></div>
          )}
          {report.hypotheses.length > 0 && (
            <div><h3 className="text-xs font-medium uppercase tracking-wide text-warning">Possible explanations (hypotheses, not confirmed)</h3>
              <ul className="mt-1 space-y-1 pl-5 list-disc">{report.hypotheses.map((h, i) => (
                <li key={i}>{h.text}<div className="text-xs text-muted-foreground">Evidence: {h.evidence}{n(h.steps)}</div></li>
              ))}</ul></div>
          )}
          {report.nextActions.length > 0 && (
            <div><h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Next debugging actions</h3>
              <ul className="mt-1 list-disc pl-5">{report.nextActions.map((a, i) => <li key={i}>{a}</li>)}</ul></div>
          )}
          {report.missingEvidence.length > 0 && (
            <div><h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Unknown — not recorded</h3>
              <ul className="mt-1 list-disc pl-5 text-muted-foreground">{report.missingEvidence.map((a, i) => <li key={i}>{a}</li>)}</ul></div>
          )}
          {report.locatorSuggestion && (
            <div className="rounded-md border border-primary/40 p-3">
              <p className="text-xs font-medium">Proposed locator change for step {report.locatorSuggestion.step + 1} (checked against the recorded page)</p>
              <p className="mt-1">{describeStep(plan[report.locatorSuggestion.step]!)} → <b>{describeStep(report.locatorSuggestion.proposed)}</b></p>
              {report.locatorSuggestion.reason && <p className="text-xs text-muted-foreground">{report.locatorSuggestion.reason}</p>}
              <Button size="sm" className="mt-2" onClick={() => onReviewLocator(plan.map((s, i) => (i === report.locatorSuggestion!.step ? report.locatorSuggestion!.proposed : s)))}>
                Review in Edit & rerun
              </Button>
            </div>
          )}
          {report.rejected.length > 0 && (
            <details className="text-xs text-muted-foreground"><summary>Removed from the AI answer ({report.rejected.length})</summary>
              <ul className="mt-1 list-disc pl-5">{report.rejected.map((r, i) => <li key={i}>{r}</li>)}</ul></details>
          )}
        </div>
      )}
    </section>
  );
}
