
create type public.run_status as enum ('queued','running','passed','failed','inconclusive','cancelled','infra_error');
create type public.step_status as enum ('pending','running','passed','failed','skipped','inconclusive');

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  name text not null check (char_length(name) between 1 and 120),
  base_url text not null check (char_length(base_url) <= 2048),
  authorised_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index on public.projects(user_id, created_at desc);

create table public.tests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  instruction text not null default '' check (char_length(instruction) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.tests(project_id);

create table public.test_steps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  test_id uuid not null references public.tests(id) on delete cascade,
  position int not null,
  step jsonb not null,
  unique (test_id, position)
);

create table public.runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  test_id uuid not null references public.tests(id) on delete cascade,
  idempotency_key text not null,
  status public.run_status not null default 'queued',
  instruction text not null default '',
  plan jsonb not null,
  target_url text not null,
  provider text,
  cancel_requested boolean not null default false,
  lease_until timestamptz,
  attempts int not null default 0,
  error_code text,
  error_message text,
  analysis jsonb,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  unique (user_id, idempotency_key)
);
create index on public.runs(user_id, created_at desc);
create index on public.runs(test_id, created_at desc);
create index on public.runs(status) where status in ('queued','running');
create unique index runs_one_active_per_user on public.runs(user_id) where status in ('queued','running');

create table public.step_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  run_id uuid not null references public.runs(id) on delete cascade,
  position int not null,
  step jsonb not null,
  status public.step_status not null default 'pending',
  expected text,
  observed text,
  error_code text,
  console_errors jsonb not null default '[]',
  network_errors jsonb not null default '[]',
  screenshot_path text,
  url_after text,
  started_at timestamptz,
  finished_at timestamptz,
  duration_ms int,
  unique (run_id, position)
);

create table public.run_events (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  run_id uuid not null references public.runs(id) on delete cascade,
  kind text not null,
  message text not null,
  data jsonb,
  created_at timestamptz not null default now()
);
create index on public.run_events(run_id, id);

grant select, insert, update, delete on public.projects, public.tests, public.test_steps to authenticated;
grant select, insert on public.runs to authenticated;
grant update (cancel_requested) on public.runs to authenticated;
grant select on public.step_results, public.run_events to authenticated;
grant all on public.projects, public.tests, public.test_steps, public.runs, public.step_results, public.run_events to service_role;

alter table public.projects enable row level security;
alter table public.tests enable row level security;
alter table public.test_steps enable row level security;
alter table public.runs enable row level security;
alter table public.step_results enable row level security;
alter table public.run_events enable row level security;

create policy own_projects on public.projects for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_tests on public.tests for all to authenticated using (user_id = auth.uid())
  with check (user_id = auth.uid() and exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()));
create policy own_steps on public.test_steps for all to authenticated using (user_id = auth.uid())
  with check (user_id = auth.uid() and exists (select 1 from public.tests t where t.id = test_id and t.user_id = auth.uid()));
create policy own_runs_select on public.runs for select to authenticated using (user_id = auth.uid());
create policy own_runs_insert on public.runs for insert to authenticated
  with check (user_id = auth.uid() and status = 'queued'
    and exists (select 1 from public.tests t where t.id = test_id and t.user_id = auth.uid() and t.project_id = runs.project_id));
create policy own_runs_cancel on public.runs for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_results on public.step_results for select to authenticated using (user_id = auth.uid());
create policy own_events on public.run_events for select to authenticated using (user_id = auth.uid());

create or replace function public.enforce_test_limit() returns trigger language plpgsql set search_path = public as $$
begin
  if (select count(*) from public.tests where project_id = new.project_id) >= 3 then
    raise exception 'A project can have at most 3 tests';
  end if;
  return new;
end $$;
create trigger tests_limit before insert on public.tests for each row execute function public.enforce_test_limit();

-- Worker: claim one queued run atomically (service role only)
create or replace function public.claim_next_run(_lease_seconds int default 90)
returns setof public.runs language plpgsql security definer set search_path = public as $$
begin
  return query
  update public.runs r set status = 'running', lease_until = now() + make_interval(secs => _lease_seconds),
    started_at = coalesce(r.started_at, now()), attempts = r.attempts + 1
  where r.id = (select id from public.runs where status = 'queued' and not cancel_requested
                order by created_at limit 1 for update skip locked)
  returning r.*;
end $$;
revoke all on function public.claim_next_run(int) from public, anon, authenticated;
grant execute on function public.claim_next_run(int) to service_role;

-- Worker: mark expired leases as interrupted
create or replace function public.sweep_stale_runs()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  with stale as (
    update public.runs set status = case when cancel_requested then 'cancelled'::run_status else 'inconclusive'::run_status end,
      error_code = case when cancel_requested then 'cancelled' else 'worker_interrupted' end,
      error_message = case when cancel_requested then 'Run cancelled' else 'Worker stopped before the run finished (lease expired). No verdict.' end,
      finished_at = now(), lease_until = null
    where status = 'running' and lease_until < now() returning id)
  select count(*) into n from stale;
  update public.step_results set status = 'skipped' where status in ('pending','running')
    and run_id in (select id from public.runs where finished_at is not null);
  update public.runs set status = 'cancelled', error_code = 'cancelled', error_message = 'Cancelled before start', finished_at = now()
    where status = 'queued' and cancel_requested;
  return n;
end $$;
revoke all on function public.sweep_stale_runs() from public, anon, authenticated;
grant execute on function public.sweep_stale_runs() to service_role;
