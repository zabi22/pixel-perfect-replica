import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { checkSite, createProject } from "@/lib/app.functions";
import { checkUrlStatic } from "@/lib/security/url-safety";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

export const Route = createFileRoute("/_authenticated/projects/new")({
  head: () => ({
    meta: [
      { title: "New project — DeployProof" },
      { name: "description", content: "Add a website you own or are authorised to test." },
      { property: "og:title", content: "New project — DeployProof" },
      { property: "og:description", content: "Add a website to test." },
    ],
  }),
  component: NewProject,
});

function NewProject() {
  const navigate = useNavigate();
  const check = useServerFn(checkSite);
  const create = useServerFn(createProject);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("https://");
  const [auth, setAuth] = useState(false);
  const [probe, setProbe] = useState<{ ok: boolean; reason: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const local = url.length > 8 ? checkUrlStatic(url) : null;

  async function runCheck() {
    setBusy(true);
    try {
      const r = await check({ data: { url } });
      setProbe({ ok: r.ok, reason: r.reason });
    } catch (e) {
      setProbe({ ok: false, reason: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await create({ data: { name, url, authorised: auth as true } });
      navigate({ to: "/projects/$projectId", params: { projectId: r.id } });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="max-w-lg space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">New project</h1>
      <div className="space-y-1.5">
        <Label htmlFor="name">Project name</Label>
        <Input id="name" required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="url">Website URL</Label>
        <div className="flex gap-2">
          <Input id="url" required className="font-mono" value={url} onChange={(e) => { setUrl(e.target.value); setProbe(null); }} />
          <Button type="button" variant="outline" onClick={runCheck} disabled={busy || !local?.ok}>
            Check
          </Button>
        </div>
        {local && !local.ok && <p className="text-xs text-destructive">{local.reason}</p>}
        {probe && <p className={`text-xs ${probe.ok ? "text-success" : "text-destructive"}`}>{probe.reason}</p>}
        <p className="text-xs text-muted-foreground">Public http(s) sites only. Internal and private network addresses are rejected by the server.</p>
      </div>
      <label className="flex items-start gap-3 rounded-md border border-border p-4 text-sm">
        <Checkbox checked={auth} onCheckedChange={(v) => setAuth(v === true)} className="mt-0.5" />
        <span>I own this website or I am authorised to run automated tests against it. I will only use synthetic test data.</span>
      </label>
      <Button type="submit" disabled={busy || !auth || !local?.ok}>
        Create project
      </Button>
    </form>
  );
}
