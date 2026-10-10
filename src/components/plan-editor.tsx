import { useState } from "react";
import type { Step } from "@/lib/plan/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const ROLES = ["link", "button", "heading", "textbox", "checkbox", "radio", "combobox"] as const;
const BYS = ["role", "text", "label", "placeholder", "testId"] as const;
type AnyStep = Record<string, unknown> & { action: string };
type AnyTarget = { by: string; role?: string; name?: string; value?: string };

/** Lets the user edit element name, locator strategy, expected result and timeout per step. */
export function PlanEditor({ plan, highlight, onSubmit, onCancel, busy }: {
  plan: Step[]; highlight?: number; busy?: boolean; onCancel: () => void; onSubmit: (plan: Step[]) => void;
}) {
  const [steps, setSteps] = useState<AnyStep[]>(() => JSON.parse(JSON.stringify(plan)));
  const set = (i: number, patch: Partial<AnyStep>) => setSteps((s) => s.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const setTarget = (i: number, t: AnyTarget) => set(i, { target: t });

  return (
    <div className="rounded-md border border-border bg-card p-4">
      <h2 className="text-sm font-semibold">Edit steps and rerun</h2>
      <p className="mt-1 text-xs text-muted-foreground">Creates a new run. The original run and its evidence are kept unchanged. The saved test is not modified.</p>
      <ol className="mt-4 space-y-3">
        {steps.map((s, i) => {
          const t = s.target as AnyTarget | undefined;
          const tmo = (s.timeoutMs as number | undefined) ?? "";
          return (
            <li key={i} className={`rounded border p-3 text-xs ${i === highlight ? "border-warning" : "border-border"}`}>
              <div className="mb-2 font-mono text-muted-foreground">{String(i + 1).padStart(2, "0")} · {s.action}</div>
              <div className="flex flex-wrap items-end gap-2">
                {t && (
                  <>
                    <label className="flex flex-col gap-1">Locator
                      <select className="h-9 rounded-md border border-input bg-background px-2" value={t.by}
                        onChange={(e) => {
                          const by = e.target.value; const text = t.by === "role" ? t.name ?? "" : t.value ?? "";
                          setTarget(i, by === "role" ? { by, role: "link", name: text } : { by, value: text });
                        }}>
                        {BYS.map((b) => <option key={b} value={b}>{b}</option>)}
                      </select>
                    </label>
                    {t.by === "role" && (
                      <label className="flex flex-col gap-1">Role
                        <select className="h-9 rounded-md border border-input bg-background px-2" value={t.role}
                          onChange={(e) => setTarget(i, { ...t, role: e.target.value })}>
                          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                        </select>
                      </label>
                    )}
                    <label className="flex min-w-48 flex-1 flex-col gap-1">Element name
                      <Input value={t.by === "role" ? t.name ?? "" : t.value ?? ""}
                        onChange={(e) => setTarget(i, t.by === "role" ? { ...t, name: e.target.value } : { ...t, value: e.target.value })} />
                    </label>
                  </>
                )}
                {(s.action === "assertText" || s.action === "assertNoText") && (
                  <label className="flex min-w-48 flex-1 flex-col gap-1">Expected text
                    <Input value={String(s.text ?? "")} onChange={(e) => set(i, { text: e.target.value })} />
                  </label>
                )}
                {s.action === "assertUrl" && (
                  <label className="flex min-w-48 flex-1 flex-col gap-1">Expected URL contains
                    <Input value={String(s.contains ?? "")} onChange={(e) => set(i, { contains: e.target.value })} />
                  </label>
                )}
                {s.action === "goto" && (
                  <label className="flex min-w-48 flex-1 flex-col gap-1">Path
                    <Input value={String(s.path ?? "")} onChange={(e) => set(i, { path: e.target.value })} />
                  </label>
                )}
                {s.action !== "press" && (
                  <label className="flex w-28 flex-col gap-1">Timeout (ms)
                    <Input type="number" min={500} max={15000} step={500} value={tmo} placeholder="8000"
                      onChange={(e) => set(i, { timeoutMs: e.target.value === "" ? undefined : Number(e.target.value) })} />
                  </label>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      <div className="mt-4 flex gap-2">
        <Button disabled={busy} onClick={() => onSubmit(steps as unknown as Step[])}>{busy ? "Starting…" : "Run edited steps"}</Button>
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

type Obs = { url?: string; title?: string; want?: string; textMentions?: number; hiddenMatches?: number; collapsedMenus?: string[];
  matches?: { role: string; name: string; href?: string }[]; elements?: { role: string; name: string; href?: string }[] };

/** Recorded browser observation for a locator failure. Facts only — no AI. */
export function ObservationPanel({ obs }: { obs: Obs }) {
  const list = (xs: Obs["elements"]) => (
    <ul className="mt-1 max-h-56 overflow-auto font-mono text-[11px] text-muted-foreground">
      {(xs ?? []).map((e, i) => <li key={i}>{e.role} "{e.name}"{e.href ? ` → ${e.href}` : ""}</li>)}
    </ul>
  );
  return (
    <details className="text-xs">
      <summary className="cursor-pointer">What the browser observed (recorded)</summary>
      <div className="mt-1 space-y-1 text-muted-foreground">
        <div>Page: {obs.title} <span className="font-mono">{obs.url}</span></div>
        <div>"{obs.want}" in page text: {obs.textMentions ?? 0} time(s) · hidden matching elements: {obs.hiddenMatches ?? 0}</div>
        {!!obs.collapsedMenus?.length && <div>Collapsed menu controls: {obs.collapsedMenus.join(", ")}</div>}
        {!!obs.matches?.length && <div className="text-warning">Matching visible elements ({obs.matches.length}):{list(obs.matches)}</div>}
        <div>Visible interactive elements ({obs.elements?.length ?? 0}):{list(obs.elements)}</div>
      </div>
    </details>
  );
}
