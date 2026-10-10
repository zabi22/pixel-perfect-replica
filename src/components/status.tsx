import { cn } from "@/lib/utils";

const STYLES: Record<string, string> = {
  passed: "bg-success/15 text-success border-success/30",
  failed: "bg-destructive/15 text-destructive border-destructive/30",
  inconclusive: "bg-warning/15 text-warning border-warning/30",
  infra_error: "bg-warning/15 text-warning border-warning/30",
  running: "bg-info/15 text-info border-info/30",
  queued: "bg-muted text-muted-foreground border-border",
  pending: "bg-muted text-muted-foreground border-border",
  skipped: "bg-muted text-muted-foreground border-border",
  cancelled: "bg-muted text-muted-foreground border-border",
};

const LABELS: Record<string, string> = { infra_error: "infra error" };

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded border px-1.5 py-0.5 font-mono text-[11px] uppercase tracking-wide",
        STYLES[status] ?? STYLES.queued,
        className,
      )}
    >
      {status === "running" && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />}
      {LABELS[status] ?? status}
    </span>
  );
}

export function fmtTime(s: string | null | undefined) {
  if (!s) return "—";
  return new Date(s).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function fmtDuration(a: string | null, b: string | null) {
  if (!a || !b) return "—";
  const ms = new Date(b).getTime() - new Date(a).getTime();
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}
