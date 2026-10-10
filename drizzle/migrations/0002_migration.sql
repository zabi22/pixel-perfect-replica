create or replace function public.claim_run(_run_id uuid, _lease_seconds int default 90)
returns setof public.runs language plpgsql security definer set search_path = public as $$
begin
  return query
  update public.runs r set status = 'running', lease_until = now() + make_interval(secs => _lease_seconds),
    started_at = coalesce(r.started_at, now()), attempts = r.attempts + 1
  where r.id = (select id from public.runs where id = _run_id and status = 'queued' and not cancel_requested for update skip locked)
  returning r.*;
end $$;
revoke all on function public.claim_run(uuid, int) from public, anon, authenticated;
grant execute on function public.claim_run(uuid, int) to service_role;