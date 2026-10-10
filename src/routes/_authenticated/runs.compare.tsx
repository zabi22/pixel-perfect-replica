import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { getRun } from "@/lib/app.functions";
import { describeStep, type Step } from "@/lib/plan/schema";
import { StatusBadge, fmtTime, fmtDuration } from "@/components/status";

export const Route = createFileRoute("/_authenticated/runs/compare")({
  validateSearch: z.object({ a: z.string().uuid(), b: z.string().uuid() }),
  head: () => ({
    meta: [
      { title: "Compare runs — DeployProof" },
      { name: "description", content: "Side-by-side comparison of two recorded runs of the same test." },
      { property: "og:title", content: "Compare runs — DeployProof" },
      { property: "og:description", content: "What changed between two real test runs." },
    ],
  }),
  component: Compare,
});

type RunData = Awaited<ReturnType<typeof getRun>>;

function Compare() {
  const { a, b } = Route.useSearch();
  const fetchRun = useServerFn(getRun);
  const qa = useQuery({ queryKey: ["run", a], queryFn: () => fetchRun({ data: { runId: a } }) });
  const qb = useQuery({ queryKey: ["run", b], queryFn: () => fetchRun({ data: { runId: b } }) });
  if (qa.isLoading || qb.isLoading) return <p className="text-sm text-muted-foreground">Loading runs…</p>;
  if (!qa.data || !qb.data) return <p className="text-sm text-destructive">One of the runs could not be loaded.</p>;
  // Older run on the left.
  const [L, R] = new Date(qa.data.run.created_at) <= new Date(qb.data.run.created_at) ? [qa.data, qb.data] : [qb.data, qa.data];
  if (L.run.test_id !== R.run.test_id) return <p className="text-sm text-destructive">These runs belong to different tests and cannot be compared.</p>;

  const lp = L.run.plan as Step[], rp = R.run.plan as Step[];
  const n = Math.max(lp.length, rp.length);
  const samePlan = JSON.stringify(lp) === JSON.stringify(rp);

  return (
    <div>
      <Link to="/runs/$runId" params={{ runId: R.run.id }} className="text-xs text-muted-foreground hover:text-foreground">← Back to newer run</Link>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">Compare runs · {R.run.tests?.name}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {samePlan ? "Both runs used identical steps." : "The steps differ between these runs (edited rerun), so differences may come from the test change, not the website."}{" "}
        Differences are recorded facts; they do not by themselves prove what caused a change.
      </p>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {[L, R].map((d, i) => <RunHeader key={d.run.id} d={d} label={i === 0 ? "Earlier" : "Later"} />)}
      </div>

      <ol className="mt-6 space-y-2">
        {Array.from({ length: n }, (_, i) => {
          const ls = L.steps.find((s) => s.position === i), rs = R.steps.find((s) => s.position === i);
          const statusChanged = (ls?.status ?? "—") !== (rs?.status ?? "—");
          const errChanged = (ls?.error_code ?? "") !== (rs?.error_code ?? "");
          const dl = ls?.duration_ms, dr = rs?.duration_ms;
          const delta = dl != null && dr != null ? dr - dl : null;
          return (
            <li key={i} className={`rounded-lg border bg-card ${statusChanged ? "border-warning/60" : "border-border"}`}>
              <div className="flex items-center gap-2 border-b border-border px-4 py-2 text-xs">
                <span className="font-mono text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
                {statusChanged && <span className="rounded border border-warning/40 px-1.5 py-0.5 text-warning">status changed</span>}
                {errChanged && !statusChanged && <span className="rounded border border-border px-1.5 py-0.5 text-muted-foreground">error changed</span>}
                {delta != null && Math.abs(delta) >= 500 && (
                  <span className="ml-auto font-mono text-muted-foreground">{delta > 0 ? "+" : ""}{(delta / 1000).toFixed(1)}s</span>
                )}
              </div>
              <div className="grid divide-border md:grid-cols-2 md:divide-x">
                <StepCell step={lp[i]} s={ls} />
                <StepCell step={rp[i]} s={rs} />
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function RunHeader({ d, label }: { d: RunData; label: string }) {
  return (
    <Link to="/runs/$runId" params={{ runId: d.run.id }} className="block rounded-lg border border-border bg-card p-4 hover:bg-accent">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        <StatusBadge status={d.run.status} />
      </div>
      <div className="mt-2 font-mono text-xs text-muted-foreground">{fmtTime(d.run.created_at)} · {fmtDuration(d.run.started_at, d.run.finished_at)}</div>
      {d.run.error_message && <div className="mt-1 truncate text-xs">{d.run.error_message}</div>}
    </Link>
  );
}

function StepCell({ step, s }: { step: Step | undefined; s: RunData["steps"][number] | undefined }) {
  if (!step) return <div className="px-4 py-3 text-xs text-muted-foreground">Step not in this run</div>;
  return (
    <div className="space-y-1.5 px-4 py-3 text-xs">
      <div className="flex items-center gap-2">
        <span className="text-sm">{describeStep(step)}</span>
        <span className="ml-auto"><StatusBadge status={s?.status ?? "pending"} /></span>
      </div>
      {s?.observed && <div><span className="text-muted-foreground">Observed: </span>{s.observed}</div>}
      {s?.duration_ms != null && <div className="font-mono text-muted-foreground">{s.duration_ms}ms{s.error_code ? ` · ${s.error_code}` : ""}</div>}
      {s?.screenshot_url && <img src={s.screenshot_url} alt="Recorded screenshot" className="mt-1 max-h-40 rounded border border-border" />}
    </div>
  );
}
