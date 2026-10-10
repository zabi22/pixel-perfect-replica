import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getConfigStatus } from "@/lib/app.functions";
import { Button } from "@/components/ui/button";
import { StatusBadge, fmtTime, fmtDuration } from "@/components/status";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — DeployProof" },
      { name: "description", content: "Your projects, recent runs and latest failures." },
      { property: "og:title", content: "Dashboard — DeployProof" },
      { property: "og:description", content: "Projects, recent runs and failures." },
    ],
  }),
  component: Dashboard,
});

export function ConfigBanner() {
  const { data } = useQuery({ queryKey: ["config"], queryFn: () => getConfigStatus() });
  if (!data || data.browserConfigured) return null;
  return (
    <div className="mb-6 rounded-md border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning">
      Browser worker not configured. Runs will end as <b>infra error</b> without executing anything until a Browserless token is added.
    </div>
  );
}

function Dashboard() {
  const projects = useQuery({
    queryKey: ["projects"],
    queryFn: async () => (await supabase.from("projects").select("id,name,base_url,created_at").order("created_at", { ascending: false })).data ?? [],
  });
  const tests = useQuery({
    queryKey: ["tests", "count"],
    queryFn: async () => (await supabase.from("tests").select("id", { count: "exact", head: true })).count ?? 0,
  });
  const runs = useQuery({
    queryKey: ["runs", "recent"],
    queryFn: async () =>
      (await supabase.from("runs").select("id,test_id,status,created_at,started_at,finished_at,error_code,error_message,tests(name),projects(name)").order("created_at", { ascending: false }).limit(200)).data ?? [],
  });
  const all = runs.data ?? [];
  const count = (s: string) => all.filter((r) => r.status === s).length;
  const latestPerTest = new Map<string, (typeof all)[number]>();
  for (const r of all) if (!latestPerTest.has(r.test_id)) latestPerTest.set(r.test_id, r);
  const attention = [...latestPerTest.values()].filter((r) => ["failed", "inconclusive", "infra_error"].includes(r.status)).slice(0, 6);
  const last = all[0];
  const loading = projects.isLoading || runs.isLoading;
  const noProjects = projects.data?.length === 0;

  return (
    <div>
      <ConfigBanner />
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {last ? <>Last run {fmtTime(last.created_at)} · took {fmtDuration(last.started_at, last.finished_at)}</> : "No runs yet."}
          </p>
        </div>
        <Button asChild>
          <Link to="/projects/new">New project</Link>
        </Button>
      </div>

      <div className="mb-10 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-3 lg:grid-cols-6">
        {[
          ["Projects", projects.data?.length ?? 0, "text-foreground"],
          ["Tests", tests.data ?? 0, "text-foreground"],
          ["Runs", all.length, "text-foreground"],
          ["Passed", count("passed"), "text-success"],
          ["Failed", count("failed"), "text-destructive"],
          ["Inconclusive / infra", count("inconclusive") + count("infra_error"), "text-warning"],
        ].map(([l, n, c]) => (
          <div key={l as string} className="bg-card px-4 py-4">
            <div className="text-xs text-muted-foreground">{l}</div>
            <div className={`mt-1 font-mono text-2xl ${c}`}>{loading ? "–" : n}</div>
          </div>
        ))}
      </div>
      {all.length === 200 && <p className="-mt-8 mb-8 text-xs text-muted-foreground">Run counts cover your latest 200 runs.</p>}

      {noProjects ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <h2 className="text-lg font-medium">Start by adding a website</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">Create a project for a site you own or are allowed to test, then build a test from a template or plain English.</p>
          <Button asChild className="mt-5"><Link to="/projects/new">Create your first project</Link></Button>
        </div>
      ) : (
        <div className="grid gap-10 lg:grid-cols-2">
          <section>
            <h2 className="mb-3 text-sm font-medium text-muted-foreground">Needs attention</h2>
            {attention.length === 0 ? (
              <div className="rounded-lg border border-border bg-card px-4 py-6 text-sm text-muted-foreground">
                {all.length ? "Every test's latest run passed." : "Run a test to see results here."}
              </div>
            ) : (
              <ul className="space-y-2">
                {attention.map((r) => (
                  <li key={r.id}>
                    <Link to="/runs/$runId" params={{ runId: r.id }} className="block rounded-lg border border-border bg-card px-4 py-3 hover:bg-accent">
                      <div className="flex items-center gap-2">
                        <StatusBadge status={r.status} />
                        <span className="truncate text-sm font-medium">{(r.projects as { name: string } | null)?.name} · {(r.tests as { name: string } | null)?.name}</span>
                        <span className="ml-auto shrink-0 text-xs text-muted-foreground">{fmtTime(r.created_at)}</span>
                      </div>
                      {r.error_message && <div className="mt-1.5 truncate font-mono text-xs text-muted-foreground">{r.error_message}</div>}
                    </Link>
                  </li>
                ))}
              </ul>
            )}

            <h2 className="mb-3 mt-8 text-sm font-medium text-muted-foreground">Projects</h2>
            <ul className="divide-y divide-border rounded-lg border border-border bg-card">
              {projects.data?.map((p) => (
                <li key={p.id}>
                  <Link to="/projects/$projectId" params={{ projectId: p.id }} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-accent">
                    <span className="font-medium">{p.name}</span>
                    <span className="truncate font-mono text-xs text-muted-foreground">{p.base_url}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-sm font-medium text-muted-foreground">Recent activity</h2>
            <ul className="divide-y divide-border rounded-lg border border-border bg-card">
              {all.length === 0 && <li className="px-4 py-6 text-sm text-muted-foreground">No runs yet. Open a project and run a test.</li>}
              {all.slice(0, 12).map((r) => (
                <li key={r.id}>
                  <Link to="/runs/$runId" params={{ runId: r.id }} className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent">
                    <StatusBadge status={r.status} />
                    <span className="truncate text-sm">{(r.tests as { name: string } | null)?.name}</span>
                    <span className="ml-auto shrink-0 font-mono text-xs text-muted-foreground">{fmtDuration(r.started_at, r.finished_at)}</span>
                    <span className="w-28 shrink-0 text-right text-xs text-muted-foreground">{fmtTime(r.created_at)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}
