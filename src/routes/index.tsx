import { createFileRoute, Link } from "@tanstack/react-router";
import { Logo } from "@/components/app-shell";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "DeployProof — Real-browser QA with evidence, not predictions" },
      { name: "description", content: "Describe a user journey in plain English. DeployProof runs it in a real browser and reports exactly what happened." },
      { property: "og:title", content: "DeployProof — Real-browser QA with evidence" },
      { property: "og:description", content: "Plain-English journeys, executed in real Chromium, with screenshots and honest pass/fail/inconclusive verdicts." },
    ],
  }),
  component: Landing,
});

const ROWS = [
  ["01", "goto /contact", "passed", "Loaded https://acme.dev/contact (HTTP 200)"],
  ["02", 'fill field "Email"', "passed", "Typed 18 characters into input"],
  ["03", 'click button "Send"', "passed", 'Clicked button "Send"'],
  ["04", 'expect text "Thanks"', "failed", 'Text not found within 8000ms. Page text starts: "something went wrong…"'],
];

function Landing() {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex h-14 max-w-6xl items-center px-4">
        <Logo />
        <div className="ml-auto">
          <Button asChild variant="ghost" size="sm">
            <Link to="/dashboard">Open app</Link>
          </Button>
        </div>
      </header>
      <section className="mx-auto max-w-6xl px-4 pb-20 pt-16">
        <p className="font-mono text-xs uppercase tracking-widest text-primary">Evidence-driven website QA</p>
        <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-tight tracking-tight md:text-5xl">
          Your journeys, run in a real browser. Verdicts backed by what actually happened.
        </h1>
        <p className="mt-5 max-w-2xl text-muted-foreground">
          Describe a critical flow in plain English. DeployProof turns it into a constrained, reviewable plan, executes it in remote Chromium, and records
          observations, screenshots and console errors. Nothing passes unless the browser proved it.
        </p>
        <div className="mt-8 flex gap-3">
          <Button asChild>
            <Link to="/auth">Get started</Link>
          </Button>
        </div>

        <div className="mt-16 overflow-hidden rounded-md border border-border bg-card font-mono text-xs">
          <div className="flex items-center gap-3 border-b border-border px-4 py-2 text-muted-foreground">
            <span>contact form submits</span>
            <span className="ml-auto text-destructive">FAILED · step 4/4</span>
          </div>
          {ROWS.map(([n, a, s, o]) => (
            <div key={n} className="grid grid-cols-[2rem_12rem_5rem_1fr] gap-3 border-b border-border/60 px-4 py-2 last:border-0">
              <span className="text-muted-foreground">{n}</span>
              <span>{a}</span>
              <span className={s === "passed" ? "text-success" : "text-destructive"}>{s}</span>
              <span className="truncate text-muted-foreground">{o}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Illustrative example of a report layout.</p>
      </section>
    </div>
  );
}
