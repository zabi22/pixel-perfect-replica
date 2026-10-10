import { createFileRoute } from "@tanstack/react-router";

/** Deliberately slow page (25s) for the timeout acceptance scenario. */
export const Route = createFileRoute("/api/public/test-site/slow")({
  server: {
    handlers: {
      GET: async () => {
        await new Promise((r) => setTimeout(r, 25_000));
        return new Response("<html><body><h1>Finally loaded</h1></body></html>", { headers: { "content-type": "text/html" } });
      },
    },
  },
});
