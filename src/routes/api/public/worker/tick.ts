import { createFileRoute } from "@tanstack/react-router";

async function sha256(s: string) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
}
async function safeEqual(a: string, b: string) {
  const [x, y] = await Promise.all([sha256(a), sha256(b)]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/**
 * Worker tick: sweeps expired leases and executes the oldest queued run.
 * Auth: Bearer WORKER_SECRET (falls back to LOVABLE_CRON_SECRET on Lovable hosting).
 * Callable by pg_cron/pg_net, Vercel Cron or Cloudflare Cron Triggers.
 */
export const Route = createFileRoute("/api/public/worker/tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["WORKER_SECRET"] || process.env["LOVABLE_CRON_SECRET"];
        if (!secret) return new Response("Worker secret not configured", { status: 500 });
        const token = /^Bearer (\S+)$/.exec(request.headers.get("authorization") ?? "")?.[1];
        if (!token || !(await safeEqual(token, secret))) return new Response("Unauthorized", { status: 401 });
        const { executeNextRun } = await import("@/lib/worker/run-worker.server");
        const ran = await executeNextRun();
        return Response.json({ ok: true, executed: ran ? 1 : 0 });
      },
    },
  },
});
