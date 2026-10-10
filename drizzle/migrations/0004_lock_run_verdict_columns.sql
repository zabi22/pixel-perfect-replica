-- Verdicts are written only by the worker (service role). Users may insert queued runs and request cancellation.
REVOKE UPDATE ON public.runs FROM authenticated;
GRANT UPDATE (cancel_requested) ON public.runs TO authenticated;
REVOKE INSERT ON public.runs FROM authenticated;
GRANT INSERT (user_id, project_id, test_id, idempotency_key, instruction, plan, target_url, parent_run_id) ON public.runs TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.step_results, public.run_events FROM authenticated;
REVOKE ALL ON public.runs, public.step_results, public.run_events, public.projects, public.tests, public.test_steps FROM anon;
-- Cancellation can only be requested, never withdrawn.
CREATE OR REPLACE FUNCTION public.runs_cancel_only_forward() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user = 'authenticated' AND OLD.cancel_requested AND NOT NEW.cancel_requested THEN
    RAISE EXCEPTION 'cancel_requested cannot be cleared';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS runs_cancel_only_forward ON public.runs;
CREATE TRIGGER runs_cancel_only_forward BEFORE UPDATE ON public.runs FOR EACH ROW EXECUTE FUNCTION public.runs_cancel_only_forward();