import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

/** Controlled target site for acceptance tests (form, success state, never-completing action). */
export const Route = createFileRoute("/test-site")({
  head: () => ({
    meta: [
      { title: "DeployProof test site — Contact" },
      { name: "description", content: "A controlled page used to verify DeployProof browser runs." },
      { property: "og:title", content: "DeployProof test site" },
      { property: "og:description", content: "Controlled acceptance-test target." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: TestSite,
});

function TestSite() {
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [loading, setLoading] = useState(false);
  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="text-2xl font-semibold">Contact us</h1>
      {state === "sent" ? (
        <p role="status" className="mt-6 rounded-md border border-success/40 bg-success/10 p-4 text-success">
          Thanks, your message was sent.
        </p>
      ) : (
        <form
          className="mt-6 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setState("sending");
            setTimeout(() => setState("sent"), 800);
          }}
        >
          <label className="block text-sm">
            Name
            <input name="name" required className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2" />
          </label>
          <label className="block text-sm">
            Email
            <input name="email" type="email" required className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2" />
          </label>
          <label className="block text-sm">
            Topic
            <select name="topic" className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2">
              <option>General</option>
              <option>Support</option>
            </select>
          </label>
          <label className="block text-sm">
            Message
            <textarea name="message" required className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2" />
          </label>
          <button type="submit" disabled={state === "sending"} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
            {state === "sending" ? "Sending…" : "Send message"}
          </button>
        </form>
      )}
      <hr className="my-10 border-border" />
      <button onClick={() => setLoading(true)} className="rounded-md border border-input px-4 py-2 text-sm">
        Load report
      </button>
      {loading && <p className="mt-2 text-sm text-muted-foreground">Loading report…</p>}
    </div>
  );
}
