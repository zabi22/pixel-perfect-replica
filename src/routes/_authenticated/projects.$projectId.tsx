import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
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
        <ul className="divide-y divide-border rounded-md border border-border">
          {tests.data?.length === 0 && <li className="px-4 py-6 text-sm text-muted-foreground">No tests yet. Describe a critical journey to create one.</li>}
          {tests.data?.map((t) => {
            const last = lastByTest(t.id);
            return (
              <li key={t.id}>
                <Link to="/tests/$testId" params={{ testId: t.id }} search={{ projectId }} className="flex items-center gap-3 px-4 py-3 hover:bg-accent">
                  <span className="font-medium">{t.name}</span>
                  <span className="truncate text-xs text-muted-foreground">{t.instruction}</span>
                  <span className="ml-auto">{last ? <StatusBadge status={last.status} /> : <span className="text-xs text-muted-foreground">never run</span>}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Run history</h2>
        <div className="overflow-hidden rounded-md border border-border">
          <table className="w-full text-sm">
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
