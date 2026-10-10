ALTER TABLE public.step_results ADD COLUMN IF NOT EXISTS page_observation jsonb;
ALTER TABLE public.runs ADD COLUMN IF NOT EXISTS parent_run_id uuid REFERENCES public.runs(id) ON DELETE SET NULL;