import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Trash2, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { createRun, draftPlan, saveTest } from "@/lib/app.functions";
import { describeStep, stepSchema, type PlanIssue } from "@/lib/plan/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ConfigBanner } from "./dashboard";

export const Route = createFileRoute("/_authenticated/tests/$testId")({
  validateSearch: z.object({ projectId: z.string().uuid() }),
  head: () => ({
    meta: [
      { title: "Test builder — DeployProof" },
      { name: "description", content: "Turn a plain-English journey into a reviewable test plan and run it." },
      { property: "og:title", content: "Test builder — DeployProof" },
      { property: "og:description", content: "Build and run a real-browser test." },
    ],
  }),
  component: Builder,
});

type Row = { text: string };
const toRows = (steps: unknown[]) => steps.map((s) => ({ text: JSON.stringify(s) }));

function Builder() {
  const { testId } = Route.useParams();
  const { projectId } = Route.useSearch();
  const isNew = testId === "new";
  const navigate = useNavigate();
  const draft = useServerFn(draftPlan);
  const save = useServerFn(saveTest);
  const run = useServerFn(createRun);

  const [name, setName] = useState("");
  const [instruction, setInstruction] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [issues, setIssues] = useState<PlanIssue[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const existing = useQuery({
    queryKey: ["test", testId],
    enabled: !isNew,
    queryFn: async () => {
      const { data: t } = await supabase.from("tests").select("*").eq("id", testId).single();
      const { data: s } = await supabase.from("test_steps").select("step").eq("test_id", testId).order("position");
      return { t, steps: (s ?? []).map((x) => x.step) };
    },
  });
  useEffect(() => {
    if (existing.data?.t) {
      setName(existing.data.t.name);
      setInstruction(existing.data.t.instruction);
      setRows(toRows(existing.data.steps));
    }
  }, [existing.data]);
  const project = useQuery({
    queryKey: ["project", projectId],
    queryFn: async () => (await supabase.from("projects").select("name,base_url").eq("id", projectId).single()).data,
  });

  function parsedSteps() {
    return rows.map((r) => {
      try {
        return JSON.parse(r.text);
      } catch {
        return { invalid: r.text };
      }
    });
  }

  async function generate() {
    setBusy("draft");
    try {
      const r = await draft({ data: { projectId, instruction } });
      if (r.error) toast.error(`AI drafting unavailable: ${r.error}. You can still write steps by hand.`);
      setRows(toRows(r.steps));
      setIssues(r.issues);
      if (!name && instruction) setName(instruction.slice(0, 60));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function persist(): Promise<string | null> {
    const r = await save({ data: { projectId, testId: isNew ? undefined : testId, name: name || "Untitled test", instruction, steps: parsedSteps() } });
    if (!r.ok) {
      setIssues(r.issues);
      toast.error("The plan has problems. Fix the highlighted steps.");
      return null;
    }
    setIssues([]);
    return r.testId;
  }

  async function onSave() {
    setBusy("save");
    try {
      const id = await persist();
      if (id) {
        toast.success("Test saved");
        if (isNew) navigate({ to: "/tests/$testId", params: { testId: id }, search: { projectId }, replace: true });
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function onRun() {
    setBusy("run");
    try {
      const id = await persist();
      if (!id) return;
      const r = await run({ data: { testId: id, idempotencyKey: crypto.randomUUID() } });
      navigate({ to: "/runs/$runId", params: { runId: r.runId } });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const move = (i: number, d: number) => {
    const next = [...rows];
    const [x] = next.splice(i, 1);
    next.splice(i + d, 0, x);
    setRows(next);
  };

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_1.3fr]">
      <div className="space-y-5">
        <ConfigBanner />
        <div>
          <p className="text-xs text-muted-foreground">{project.data?.name}</p>
          <h1 className="text-2xl font-semibold tracking-tight">{isNew ? "New test" : "Edit test"}</h1>
          <p className="font-mono text-xs text-muted-foreground">{project.data?.base_url}</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tname">Name</Label>
          <Input id="tname" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="instr">Journey in plain English</Label>
          <Textarea
            id="instr"
            rows={7}
            value={instruction}
            maxLength={4000}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="Go to the contact page, fill in the form with test data, submit it, and verify that the success message appears."
          />
        </div>
        <Button variant="outline" onClick={generate} disabled={!!busy || instruction.trim().length < 5}>
          {busy === "draft" ? "Drafting…" : "Draft plan with AI"}
        </Button>
        <p className="text-xs text-muted-foreground">
          The AI only proposes steps. You review them, and only the allowed step types can run. Results come from the browser, never from the model.
        </p>
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">Plan ({rows.length} steps)</h2>
          <Button size="sm" variant="ghost" onClick={() => setRows([...rows, { text: '{"action":"assertText","text":""}' }])}>
            <Plus /> Add step
          </Button>
        </div>
        <ol className="space-y-2">
          {rows.length === 0 && <li className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">Draft a plan or add steps manually.</li>}
          {rows.map((r, i) => {
            let parsed: ReturnType<typeof stepSchema.safeParse> | null = null;
            try {
              parsed = stepSchema.safeParse(JSON.parse(r.text));
            } catch {
              parsed = null;
            }
            const stepIssues = issues.filter((x) => x.index === i);
            const bad = !parsed?.success || stepIssues.length > 0;
            return (
              <li key={i} className={`rounded-md border bg-card p-3 ${bad ? "border-destructive/50" : "border-border"}`}>
                <div className="mb-2 flex items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
                  <span className="text-sm">{parsed?.success ? describeStep(parsed.data) : <span className="text-destructive">Invalid step</span>}</span>
                  <div className="ml-auto flex">
                    <Button size="icon" variant="ghost" className="h-7 w-7" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">
                      <ArrowUp />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" disabled={i === rows.length - 1} onClick={() => move(i, 1)} aria-label="Move down">
                      <ArrowDown />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label="Delete step">
                      <Trash2 />
                    </Button>
                  </div>
                </div>
                <Textarea
                  className="min-h-0 font-mono text-xs"
                  rows={2}
                  value={r.text}
                  onChange={(e) => setRows(rows.map((x, j) => (j === i ? { text: e.target.value } : x)))}
                />
                {stepIssues.map((x, k) => (
                  <p key={k} className="mt-1 text-xs text-destructive">{x.message}</p>
                ))}
              </li>
            );
          })}
        </ol>
        {issues.some((x) => x.index < 0) && <p className="mt-2 text-xs text-destructive">{issues.filter((x) => x.index < 0).map((x) => x.message).join("; ")}</p>}
        <div className="mt-6 flex gap-3">
          <Button variant="outline" onClick={onSave} disabled={!!busy || rows.length === 0}>
            {busy === "save" ? "Saving…" : "Save"}
          </Button>
          <Button onClick={onRun} disabled={!!busy || rows.length === 0}>
            {busy === "run" ? "Starting…" : "Review done — run test"}
          </Button>
        </div>
      </div>
    </div>
  );
}
