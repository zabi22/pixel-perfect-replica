import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export function LogoMark({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect x="2" y="2" width="60" height="60" rx="16" fill="var(--primary)" />
      <circle cx="23" cy="25" r="4.5" fill="var(--primary-foreground)" />
      <circle cx="41" cy="25" r="4.5" fill="var(--primary-foreground)" />
      <path d="M17 38 L28 48 L47 33" fill="none" stroke="var(--primary-foreground)" strokeWidth="6.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo() {
  return (
    <span className="flex items-center gap-2 text-[15px] font-bold tracking-tight" aria-label="DeployProof">
      <LogoMark />
      <span aria-hidden="true">
        Deploy<span className="text-primary">Proof</span>
      </span>
    </span>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-12 max-w-6xl items-center gap-6 px-4">
          <Link to="/dashboard">
            <Logo />
          </Link>
          <nav className="flex gap-4 text-sm text-muted-foreground">
            <Link to="/dashboard" activeProps={{ className: "text-foreground" }}>
              Dashboard
            </Link>
            <Link to="/projects/new" activeProps={{ className: "text-foreground" }}>
              New project
            </Link>
          </nav>
          <div className="ml-auto">
            <Button variant="ghost" size="sm" onClick={signOut}>
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
