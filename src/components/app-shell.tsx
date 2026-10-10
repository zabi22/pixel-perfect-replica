import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export function Logo() {
  return (
    <span className="flex items-center gap-2 font-mono text-sm font-bold tracking-tight">
      <span className="inline-block h-2.5 w-2.5 rounded-sm bg-primary" />
      deployproof
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
