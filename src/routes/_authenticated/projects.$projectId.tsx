import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { createRun } from "@/lib/app.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge, fmtTime, fmtDuration } from "@/components/status";
import { LIMITS } from "@/lib/plan/schema";

export const Route = createFileRoute("/_authenticated/projects/$projectId")({
  head: () => ({
    meta: [
      { title: "Project — DeployProof" },
      { name: "description", content: "Tests and run history for this project." },
      { property: "og:title", content: "Project — DeployProof" },
      { property: "og:description", content: "Tests and run history." },
    ],
  }),
  component: ProjectPage,
});

type RunRow = { id: string; test_id: string; status: string; created_at: string; started_at: string | null; finished_at: string | null; error_code: string | null };

/** For each run, whether it is the first pass after a previous failure of the same test. */
export function markRecoveries(runs: RunRow[]) {
  const out = new Set<string>();
  const byTest = new Map<string, RunRow[]>();
  for (const r of [...runs].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    const list = byTest.get(r.test_id) ?? [];
    const prev = [...list].reverse().find((x) => ["passed", "failed", "inconclusive"].includes(x.status));
    if (r.status === "passed" && prev && prev.status === "failed") out.add(r.id);
    list.push(r);
    byTest.set(r.test_id, list);
  }
  return out;
}

function ProjectPage() {
  const { projectId } = Route.useParams();
  const project = useQuery({
    queryKey: ["project", projectId],
    queryFn: async () => (await supabase.from("projects").select("*").eq("id", projectId).single()).data,
  });
  const tests = useQuery({
    queryKey: ["tests", projectId],
    queryFn: async () => (await supabase.from("tests").select("id,name,instruction,updated_at").eq("project_id", projectId).order("created_at")).data ?? [],
  });
  const runs = useQuery({
    queryKey: ["runs", projectId],
    queryFn: async () =>
      ((await supabase.from("runs").select("id,test_id,status,created_at,started_at,finished_at,error_code").eq("project_id", projectId).order("created_at", { ascending: false }).limit(100)).data ?? []) as RunRow[],
  });
  const recovered = markRecoveries(runs.data ?? []);
  const testName = (id: string) => tests.data?.find((t) => t.id === id)?.name ?? "—";
  const lastByTest = (id: string) => runs.data?.find((r) => r.test_id === id);
  const finishedByTest = (id: string) => (runs.data ?? []).filter((r) => r.test_id === id && ["passed", "failed", "inconclusive"].includes(r.status)).slice(0, 2);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [rerunning, setRerunning] = useState<string | null>(null);
  const navigate = useNavigate();
  const run = useServerFn(createRun);
  async function rerun(testId: string) {
    setRerunning(testId);
    try {
      const r = await run({ data: { testId, idempotencyKey: crypto.randomUUID() } });
      navigate({ to: "/runs/$runId", params: { runId: r.runId } });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRerunning(null);
    }
  }
  const visibleTests = (tests.data ?? []).filter((t) => {
    if (q && !`${t.name} ${t.instruction}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (filter === "all") return true;
    const s = lastByTest(t.id)?.status;
    if (filter === "never") return !s;
    if (filter === "running") return s === "running" || s === "queued";
    return s === filter;
  });

  if (!project.data) return <p className="text-sm text-muted-foreground">Loading…</p>;
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">{project.data.name}</h1>
        <a href={project.data.base_url} target="_blank" rel="noreferrer" className="font-mono text-xs text-muted-foreground hover:text-foreground">
          {project.data.base_url}
        </a>
      </div>

      <section className="mb-10">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">
            Tests ({tests.data?.length ?? 0}/{LIMITS.maxTestsPerProject})
          </h2>
          {(tests.data?.length ?? 0) < LIMITS.maxTestsPerProject && (
            <Button asChild size="sm">
              <Link to="/tests/$testId" params={{ testId: "new" }} search={{ projectId }}>
                New test
              </Link>
            </Button>
          )}
        </div>
        {(tests.data?.length ?? 0) > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            <Input placeholder="Search tests" value={q} onChange={(e) => setQ(e.target.value)} className="h-8 max-w-xs" aria-label="Search tests" />
            <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter by latest result"
              className="h-8 rounded-md border border-input bg-background px-2 text-sm">
              <option value="all">All results</option>
              <option value="passed">Passed</option>
              <option value="failed">Failed</option>
              <option value="inconclusive">Inconclusive</option>
              <option value="running">Running / queued</option>
              <option value="infra_error">Infrastructure error</option>
              <option value="cancelled">Cancelled</option>
              <option value="never">Never run</option>
            </select>
          </div>
        )}
        <ul className="divide-y divide-border rounded-md border border-border">
          {tests.data?.length === 0 && <li className="px-4 py-6 text-sm text-muted-foreground">No tests yet. Describe a critical journey to create one.</li>}
          {tests.data?.length !== 0 && visibleTests.length === 0 && <li className="px-4 py-6 text-sm text-muted-foreground">No tests match.</li>}
          {visibleTests.map((t) => {
            const [last, prev] = finishedByTest(t.id);
            const latest = lastByTest(t.id);
            const change = last && prev && last.status !== prev.status ? `${prev.status} → ${last.status}` : last && prev ? `unchanged (${last.status})` : null;
            return (
              <li key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <Link to="/tests/$testId" params={{ testId: t.id }} search={{ projectId }} className="min-w-0 flex-1 basis-48 break-words hover:underline">
                  <span className="font-medium">{t.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{t.instruction}</span>
                </Link>
                {change && (
                  <span className={`font-mono text-[11px] ${last!.status !== prev!.status ? (last!.status === "passed" ? "text-success" : "text-destructive") : "text-muted-foreground"}`}>
                    vs previous: {change}
                  </span>
                )}
                {latest ? (
                  <Link to="/runs/$runId" params={{ runId: latest.id }} className="flex items-center gap-1">
                    <StatusBadge status={latest.status} />
                    
                  </Link>
                ) : <span className="text-xs text-muted-foreground">never run</span>}
                {last && prev && (
                  <Button asChild size="sm" variant="ghost">
                    <Link to="/runs/compare" search={{ a: prev.id, b: last.id }}>Compare</Link>
                  </Button>
                )}
                <Button size="sm" variant="outline" disabled={rerunning === t.id} onClick={() => rerun(t.id)}>
                  {rerunning === t.id ? "Starting…" : "Rerun"}
                </Button>
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Run history</h2>
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-muted text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-normal">Status</th>
                <th className="px-4 py-2 font-normal">Test</th>
                <th className="px-4 py-2 font-normal">Started</th>
                <th className="px-4 py-2 font-normal">Duration</th>
                <th className="px-4 py-2 font-normal">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {runs.data?.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-muted-foreground">No runs yet.</td>
                </tr>
              )}
              {runs.data?.map((r) => (
                <tr key={r.id} className="hover:bg-accent">
                  <td className="px-4 py-2">
                    <Link to="/runs/$runId" params={{ runId: r.id }} className="flex items-center gap-2">
                      <StatusBadge status={r.status} />
                      {recovered.has(r.id) && <span className="rounded bg-success/15 px-1.5 py-0.5 font-mono text-[10px] uppercase text-success">now passing</span>}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{testName(r.test_id)}</td>
                  <td className="px-4 py-2 text-muted-foreground">{fmtTime(r.started_at ?? r.created_at)}</td>
                  <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{fmtDuration(r.started_at, r.finished_at)}</td>
                  <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{r.error_code ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
