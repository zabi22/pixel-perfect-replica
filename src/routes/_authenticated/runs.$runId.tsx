import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { advanceRun, cancelRun, createRun, getRun } from "@/lib/app.functions";
import { describeStep, type Step } from "@/lib/plan/schema";
import { Button } from "@/components/ui/button";
import { StatusBadge, fmtTime, fmtDuration } from "@/components/status";
import { PlanEditor, ObservationPanel } from "@/components/plan-editor";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/runs/$runId")({
  head: () => ({
    meta: [
      { title: "Test run — DeployProof" },
      { name: "description", content: "Live progress and evidence-backed report for a browser test run." },
      { property: "og:title", content: "Test run — DeployProof" },
      { property: "og:description", content: "Live run progress and report." },
    ],
  }),
  component: RunPage,
});

const ACTIVE = new Set(["queued", "running"]);

function RunPage() {
  const { runId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fetchRun = useServerFn(getRun);
  const advance = useServerFn(advanceRun);
  const cancel = useServerFn(cancelRun);
  const rerun = useServerFn(createRun);
  const driving = useRef(false);
  const [zoom, setZoom] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  const q = useQuery({
    queryKey: ["run", runId],
    queryFn: () => fetchRun({ data: { runId } }),
    refetchInterval: (query) => (query.state.data && ACTIVE.has(query.state.data.run.status) ? 1500 : false),
  });
  const run = q.data?.run;

  // Drive queued runs forward from this tab (the tick endpoint is the backstop if the tab closes).
  useEffect(() => {
    if (!run || driving.current) return;
    const leaseExpired = run.status === "running" && run.lease_until && new Date(run.lease_until).getTime() < Date.now();
    if (run.status !== "queued" && !leaseExpired) return;
    driving.current = true;
    advance({ data: { runId } })
      .catch((e) => toast.error((e as Error).message))
      .finally(() => {
        driving.current = false;
        qc.invalidateQueries({ queryKey: ["run", runId] });
      });
  }, [run?.status, run?.lease_until, runId, advance, qc]);

  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (q.error || !q.data || !run) return <p className="text-sm text-destructive">{(q.error as Error)?.message ?? "Run not found"}</p>;
  const { steps, events } = q.data;
  const plan = run.plan as Step[];
  const done = steps.filter((s) => !["pending", "running"].includes(s.status)).length;
  const analysis = run.analysis as { observed: string; hypotheses: string[]; nextStep: string } | null;
  const active = ACTIVE.has(run.status);
  const failedIdx = steps.find((s) => s.status === "failed" || s.status === "inconclusive")?.position;

  async function doCancel() {
    await cancel({ data: { runId } }).catch((e) => toast.error((e as Error).message));
    qc.invalidateQueries({ queryKey: ["run", runId] });
  }
  async function doRerun(edited?: Step[]) {
    setBusy(true);
    try {
      const r = await rerun({ data: { testId: run!.test_id, idempotencyKey: crypto.randomUUID(), parentRunId: run!.id, ...(edited ? { plan: edited } : {}) } });
      setEditing(false);
      navigate({ to: "/runs/$runId", params: { runId: r.runId } });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start gap-4">
        <div>
          <Link to="/projects/$projectId" params={{ projectId: run.project_id }} className="text-xs text-muted-foreground hover:text-foreground">
            ← {run.projects?.name}
          </Link>
          <h1 className="mt-1 flex items-center gap-3 text-2xl font-semibold tracking-tight">
            {run.tests?.name} <StatusBadge status={run.status} className="text-xs" />
          </h1>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            {run.target_url} · {run.provider ?? "no provider yet"} · started {fmtTime(run.started_at)} · {fmtDuration(run.started_at, run.finished_at)}
          </p>
        </div>
        <div className="ml-auto flex gap-2">
          {active && (
            <Button variant="outline" onClick={doCancel} disabled={run.cancel_requested}>
              {run.cancel_requested ? "Cancelling…" : "Cancel"}
            </Button>
          )}
          {!active && <Button variant="outline" onClick={() => setEditing(true)}>Edit & rerun</Button>}
          {!active && <Button onClick={() => doRerun()}>Rerun</Button>}
        </div>
      </div>

      {run.parent_run_id && (
        <p className="-mt-4 mb-6 text-xs text-muted-foreground">
          Rerun of <Link to="/runs/$runId" params={{ runId: run.parent_run_id }} className="underline">an earlier run</Link>.
        </p>
      )}

      {editing && (
        <div className="mb-6">
          <PlanEditor plan={plan} highlight={failedIdx} busy={busy} onCancel={() => setEditing(false)} onSubmit={(p) => doRerun(p)} />
        </div>
      )}

      {active && (
        <div className="mb-6 rounded-md border border-info/30 bg-info/5 px-4 py-3 text-sm">
          {run.status === "queued" ? "Queued — waiting for the browser worker." : `Running · ${done}/${plan.length} steps recorded`}
          {run.provider === "browserless-function" && run.status === "running" && (
            <span className="text-muted-foreground"> (this provider reports step results when the browser session finishes)</span>
          )}
        </div>
      )}

      {run.error_message && (
        <div className={`mb-6 rounded-md border px-4 py-3 text-sm ${run.status === "failed" ? "border-destructive/40 bg-destructive/5" : "border-warning/40 bg-warning/5"}`}>
          <div className="font-mono text-xs uppercase text-muted-foreground">{run.error_code}</div>
          <div className="mt-1">{run.error_message}</div>
          {run.status === "infra_error" && <div className="mt-1 text-xs text-muted-foreground">This is a configuration or infrastructure problem. Your website was not judged.</div>}
          {run.status === "inconclusive" && <div className="mt-1 text-xs text-muted-foreground">The result could not be reliably determined. This is not a verified application defect.</div>}
          {run.error_code === "element_ambiguous" && <div className="mt-1 text-xs">Several elements matched. Use <b>Edit & rerun</b> to choose a more specific name or locator.</div>}
        </div>
      )}

      <ol className="space-y-2">
        {plan.map((step, i) => {
          const s = steps.find((x) => x.position === i);
          const status = s?.status ?? "pending";
          return (
            <li key={i} className="rounded-md border border-border bg-card">
              <div className="flex items-center gap-3 px-4 py-2.5">
                <span className="font-mono text-xs text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
                <span className="text-sm">{describeStep(step)}</span>
                <span className="ml-auto flex items-center gap-3">
                  {s?.duration_ms != null && <span className="font-mono text-xs text-muted-foreground">{s.duration_ms}ms</span>}
                  <StatusBadge status={status} />
                </span>
              </div>
              {s && (s.observed || s.screenshot_url) && (
                <div className="grid gap-4 border-t border-border px-4 py-3 md:grid-cols-[1fr_220px]">
                  <dl className="space-y-1.5 text-xs">
                    {s.expected && (
                      <div>
                        <dt className="inline text-muted-foreground">Expected: </dt>
                        <dd className="inline">{s.expected}</dd>
                      </div>
                    )}
                    <div>
                      <dt className="inline text-muted-foreground">Observed: </dt>
                      <dd className="inline">{s.observed}</dd>
                    </div>
                    {s.error_code && <div className="font-mono text-muted-foreground">code: {s.error_code}</div>}
                    {s.url_after && <div className="truncate font-mono text-muted-foreground">url: {s.url_after}</div>}
                    {(s.console_errors as string[]).length > 0 && (
                      <details>
                        <summary className="cursor-pointer text-warning">{(s.console_errors as string[]).length} console error(s)</summary>
                        <pre className="mt-1 whitespace-pre-wrap font-mono text-[11px] text-muted-foreground">{(s.console_errors as string[]).join("\n")}</pre>
                      </details>
                    )}
                    {(s.network_errors as string[]).length > 0 && (
                      <details>
                        <summary className="cursor-pointer text-warning">{(s.network_errors as string[]).length} network issue(s)</summary>
                        <pre className="mt-1 whitespace-pre-wrap font-mono text-[11px] text-muted-foreground">{(s.network_errors as string[]).join("\n")}</pre>
                      </details>
                    )}
                    {s.page_observation && <ObservationPanel obs={s.page_observation as never} />}
                  </dl>
                  {s.screenshot_url && (
                    <button onClick={() => setZoom(s.screenshot_url)} className="overflow-hidden rounded border border-border">
                      <img src={s.screenshot_url} alt={`Screenshot after step ${i + 1}`} className="w-full" />
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {analysis && (
        <section className="mt-8 rounded-md border border-border bg-card p-5">
          <h2 className="text-sm font-semibold">Failure analysis</h2>
          <p className="mt-1 text-xs text-muted-foreground">Generated by AI from the recorded evidence above. Hypotheses are not verified.</p>
          <div className="mt-4 space-y-3 text-sm">
            <div>
              <div className="font-mono text-xs uppercase text-muted-foreground">Observed</div>
              <p>{analysis.observed}</p>
            </div>
            <div>
              <div className="font-mono text-xs uppercase text-warning">Possible causes (hypotheses)</div>
              <ul className="list-disc pl-5">
                {analysis.hypotheses.map((h, i) => (
                  <li key={i}>{h}</li>
                ))}
              </ul>
            </div>
            <div>
              <div className="font-mono text-xs uppercase text-muted-foreground">Suggested next step</div>
              <p>{analysis.nextStep}</p>
            </div>
          </div>
        </section>
      )}

      <RunHistory testId={run.test_id} currentId={run.id} />

      <details className="mt-8">
        <summary className="cursor-pointer text-xs text-muted-foreground">Worker log ({events.length})</summary>
        <ul className="mt-2 space-y-1 font-mono text-[11px] text-muted-foreground">
          {events.map((e) => (
            <li key={e.id}>
              {new Date(e.created_at).toLocaleTimeString()} [{e.kind}] {e.message}
            </li>
          ))}
        </ul>
      </details>

      {zoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 p-6" onClick={() => setZoom(null)}>
          <img src={zoom} alt="Screenshot" className="max-h-full max-w-full rounded border border-border" />
        </div>
      )}
    </div>
  );
}

function RunHistory({ testId, currentId }: { testId: string; currentId: string }) {
  const q = useQuery({
    queryKey: ["run-history", testId],
    queryFn: async () =>
      (await supabase.from("runs").select("id,status,created_at,started_at,finished_at").eq("test_id", testId).order("created_at", { ascending: false }).limit(15)).data ?? [],
  });
  const others = (q.data ?? []).filter((r) => r.id !== currentId);
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-sm font-medium text-muted-foreground">Other runs of this test</h2>
      {others.length === 0 ? (
        <p className="rounded-lg border border-border bg-card px-4 py-4 text-sm text-muted-foreground">{q.isLoading ? "Loading…" : "No other runs yet. Rerun to build history you can compare."}</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-card">
          {others.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-4 py-2.5">
              <StatusBadge status={r.status} />
              <Link to="/runs/$runId" params={{ runId: r.id }} className="text-sm hover:underline">{fmtTime(r.created_at)}</Link>
              <span className="font-mono text-xs text-muted-foreground">{fmtDuration(r.started_at, r.finished_at)}</span>
              <Link to="/runs/compare" search={{ a: r.id, b: currentId }} className="ml-auto text-xs text-primary hover:underline">Compare with this run</Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
