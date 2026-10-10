import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getConfigStatus } from "@/lib/app.functions";
import { Button } from "@/components/ui/button";
import { StatusBadge, fmtTime } from "@/components/status";

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
  const runs = useQuery({
    queryKey: ["runs", "recent"],
    queryFn: async () =>
      (await supabase.from("runs").select("id,status,created_at,error_message,tests(name),projects(name)").order("created_at", { ascending: false }).limit(50)).data ?? [],
  });
  const all = runs.data ?? [];
  const count = (s: string) => all.filter((r) => r.status === s).length;
  const failures = all.filter((r) => r.status === "failed").slice(0, 5);

  return (
    <div>
      <ConfigBanner />
      <div className="mb-8 flex items-end justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <Button asChild>
          <Link to="/projects/new">New project</Link>
        </Button>
      </div>

      <div className="mb-10 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border md:grid-cols-4">
        {[
          ["Passed", count("passed"), "text-success"],
          ["Failed", count("failed"), "text-destructive"],
          ["Inconclusive", count("inconclusive") + count("infra_error"), "text-warning"],
          ["Total runs", all.length, "text-foreground"],
        ].map(([l, n, c]) => (
          <div key={l as string} className="bg-card px-4 py-4">
            <div className="text-xs text-muted-foreground">{l}</div>
            <div className={`mt-1 font-mono text-2xl ${c}`}>{n}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-10 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">Projects</h2>
          {projects.data?.length === 0 && (
            <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
              No projects yet. <Link to="/projects/new" className="text-primary">Create one</Link>.
            </div>
          )}
          <ul className="divide-y divide-border rounded-md border border-border">
            {projects.data?.map((p) => (
              <li key={p.id}>
                <Link to="/projects/$projectId" params={{ projectId: p.id }} className="flex items-center justify-between px-4 py-3 hover:bg-accent">
                  <span className="font-medium">{p.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">{p.base_url}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">Recent runs</h2>
          <ul className="divide-y divide-border rounded-md border border-border">
            {all.length === 0 && <li className="px-4 py-6 text-sm text-muted-foreground">No runs yet.</li>}
            {all.slice(0, 10).map((r) => (
              <li key={r.id}>
                <Link to="/runs/$runId" params={{ runId: r.id }} className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent">
                  <StatusBadge status={r.status} />
                  <span className="truncate text-sm">{(r.tests as { name: string } | null)?.name}</span>
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">{fmtTime(r.created_at)}</span>
                </Link>
              </li>
            ))}
          </ul>
          {failures.length > 0 && (
            <>
              <h2 className="mb-3 mt-8 text-sm font-medium text-muted-foreground">Latest failures</h2>
              <ul className="space-y-2">
                {failures.map((r) => (
                  <li key={r.id}>
                    <Link to="/runs/$runId" params={{ runId: r.id }} className="block rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 hover:bg-destructive/10">
                      <div className="text-sm font-medium">
                        {(r.projects as { name: string } | null)?.name} · {(r.tests as { name: string } | null)?.name}
                      </div>
                      <div className="mt-1 truncate font-mono text-xs text-muted-foreground">{r.error_message}</div>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
