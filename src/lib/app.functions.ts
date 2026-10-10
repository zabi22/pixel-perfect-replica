import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { checkUrlResolved } from "@/lib/security/url-safety";
import { LIMITS, validatePlan, type Step } from "@/lib/plan/schema";

/* ---------------- projects ---------------- */

async function probeReachability(url: string): Promise<{ ok: boolean; status?: number; note: string }> {
  // Follow up to 5 redirects manually, re-validating every hop.
  let current = url;
  for (let hop = 0; hop < 5; hop++) {
    const chk = await checkUrlResolved(current);
    if (!chk.ok) return { ok: false, note: `Redirect target rejected: ${chk.reason}` };
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 8000);
    try {
      const res = await fetch(current, { method: "GET", redirect: "manual", signal: ac.signal, headers: { "user-agent": "DeployProof-Check/1.0" } });
      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        current = new URL(res.headers.get("location")!, current).toString();
        continue;
      }
      return { ok: res.status < 500, status: res.status, note: `Responded HTTP ${res.status}${hop ? ` after ${hop} redirect(s)` : ""}` };
    } catch (e) {
      return { ok: false, note: `Could not connect: ${(e as Error).name === "AbortError" ? "timed out after 8s" : (e as Error).message}` };
    } finally {
      clearTimeout(t);
    }
  }
  return { ok: false, note: "Too many redirects" };
}

export const checkSite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { url: string }) => z.object({ url: z.string().max(2048) }).parse(d))
  .handler(async ({ data }) => {
    const chk = await checkUrlResolved(data.url);
    if (!chk.ok) return { ok: false as const, reason: chk.reason };
    const probe = await probeReachability(chk.url.toString());
    return { ok: probe.ok, reason: probe.note, normalized: chk.url.origin };
  });

export const createProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { name: string; url: string; authorised: boolean }) =>
    z.object({ name: z.string().trim().min(1).max(120), url: z.string().max(2048), authorised: z.literal(true) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const chk = await checkUrlResolved(data.url);
    if (!chk.ok) throw new Error(`URL rejected: ${chk.reason}`);
    const { data: row, error } = await context.supabase
      .from("projects")
      .insert({ name: data.name, base_url: chk.url.origin, authorised_at: new Date().toISOString(), user_id: context.userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

/* ---------------- tests ---------------- */

export const saveTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string; testId?: string; name: string; instruction: string; steps: unknown }) =>
    z
      .object({
        projectId: z.string().uuid(),
        testId: z.string().uuid().optional(),
        name: z.string().trim().min(1).max(120),
        instruction: z.string().max(4000),
        steps: z.unknown(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: project, error: pe } = await sb.from("projects").select("id,base_url").eq("id", data.projectId).single();
    if (pe || !project) throw new Error("Project not found");
    const v = validatePlan(data.steps, project.base_url);
    if (!v.ok) return { ok: false as const, issues: v.issues };
    let testId = data.testId;
    if (testId) {
      const { error } = await sb.from("tests").update({ name: data.name, instruction: data.instruction, updated_at: new Date().toISOString() }).eq("id", testId);
      if (error) throw new Error(error.message);
      await sb.from("test_steps").delete().eq("test_id", testId);
    } else {
      const { data: t, error } = await sb
        .from("tests")
        .insert({ project_id: project.id, name: data.name, instruction: data.instruction, user_id: context.userId })
        .select("id")
        .single();
      if (error) throw new Error(error.message.includes("at most 3") ? `A project can have at most ${LIMITS.maxTestsPerProject} tests` : error.message);
      testId = t.id;
    }
    const { error: se } = await sb
      .from("test_steps")
      .insert(v.steps.map((step, position) => ({ test_id: testId!, position, step: step as never, user_id: context.userId })));
    if (se) throw new Error(se.message);
    return { ok: true as const, testId: testId! };
  });

export const draftPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string; instruction: string }) =>
    z.object({ projectId: z.string().uuid(), instruction: z.string().trim().min(5).max(4000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: project } = await context.supabase.from("projects").select("base_url").eq("id", data.projectId).single();
    if (!project) throw new Error("Project not found");
    const { chatJson, AiUnavailable, PLAN_SYSTEM_PROMPT } = await import("@/lib/ai/provider.server");
    try {
      const out = await chatJson<{ steps: unknown }>(
        PLAN_SYSTEM_PROMPT,
        `Website: ${project.base_url}\nJourney:\n${data.instruction}`,
      );
      const v = validatePlan(out.steps, project.base_url);
      return { steps: (Array.isArray(out.steps) ? out.steps : []) as Step[], issues: v.ok ? [] : v.issues, error: null };
    } catch (e) {
      if (e instanceof AiUnavailable) return { steps: [] as Step[], issues: [], error: e.message };
      throw e;
    }
  });

/* ---------------- runs ---------------- */

export const createRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { testId: string; idempotencyKey: string }) =>
    z.object({ testId: z.string().uuid(), idempotencyKey: z.string().min(8).max(100) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: existing } = await sb.from("runs").select("id").eq("idempotency_key", data.idempotencyKey).maybeSingle();
    if (existing) return { runId: existing.id, duplicate: true };
    const { data: test } = await sb.from("tests").select("id,project_id,instruction,projects(base_url)").eq("id", data.testId).single();
    if (!test) throw new Error("Test not found");
    const baseUrl = (test.projects as unknown as { base_url: string }).base_url;
    const { data: steps } = await sb.from("test_steps").select("step").eq("test_id", test.id).order("position");
    const v = validatePlan((steps ?? []).map((s) => s.step), baseUrl);
    if (!v.ok) throw new Error(`Plan is invalid: ${v.issues.map((i) => i.message).join("; ")}`);
    const chk = await checkUrlResolved(baseUrl);
    if (!chk.ok) throw new Error(`Target rejected by security policy: ${chk.reason}`);
    const { data: run, error } = await sb
      .from("runs")
      .insert({
        user_id: context.userId,
        project_id: test.project_id,
        test_id: test.id,
        idempotency_key: data.idempotencyKey,
        instruction: test.instruction,
        plan: v.steps as never,
        target_url: baseUrl,
      })
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505" && error.message.includes("runs_one_active")) throw new Error("You already have a run in progress. Wait for it to finish or cancel it.");
      if (error.code === "23505") {
        const { data: dup } = await sb.from("runs").select("id").eq("idempotency_key", data.idempotencyKey).single();
        if (dup) return { runId: dup.id, duplicate: true };
      }
      throw new Error(error.message);
    }
    return { runId: run.id, duplicate: false };
  });

/** Drives a queued run forward. Executes in this request (bounded by the run budget). */
export const advanceRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { runId: string }) => z.object({ runId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: run } = await context.supabase.from("runs").select("id,status").eq("id", data.runId).single();
    if (!run) throw new Error("Run not found");
    const { executeRunById, sweep } = await import("@/lib/worker/run-worker.server");
    if (run.status === "queued") await executeRunById(run.id);
    else if (run.status === "running") await sweep();
    return { ok: true };
  });

export const cancelRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { runId: string }) => z.object({ runId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("runs").update({ cancel_requested: true }).eq("id", data.runId);
    if (error) throw new Error(error.message);
    const { sweep } = await import("@/lib/worker/run-worker.server");
    await sweep();
    return { ok: true };
  });

export const getRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { runId: string }) => z.object({ runId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: run, error } = await sb.from("runs").select("*, tests(name), projects(name)").eq("id", data.runId).single();
    if (error || !run) throw new Error("Run not found");
    const { data: steps } = await sb.from("step_results").select("*").eq("run_id", run.id).order("position");
    const { data: events } = await sb.from("run_events").select("id,kind,message,created_at").eq("run_id", run.id).order("id");
    const paths = (steps ?? []).map((s) => s.screenshot_path).filter(Boolean) as string[];
    const signed: Record<string, string> = {};
    if (paths.length) {
      const { data: urls } = await sb.storage.from("evidence").createSignedUrls(paths, 600);
      for (const u of urls ?? []) if (u.path && u.signedUrl) signed[u.path] = u.signedUrl;
    }
    return {
      run: run as typeof run & { tests: { name: string } | null; projects: { name: string } | null },
      steps: (steps ?? []).map((s) => ({ ...s, screenshot_url: s.screenshot_path ? signed[s.screenshot_path] ?? null : null })),
      events: events ?? [],
    };
  });

export const getConfigStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { getAiConfig } = await import("@/lib/ai/provider.server");
    return {
      browserConfigured: !!process.env["BROWSERLESS_TOKEN"],
      browserProvider: process.env["BROWSER_PROVIDER"] || "browserless-function",
      aiConfigured: !!getAiConfig(),
    };
  });
