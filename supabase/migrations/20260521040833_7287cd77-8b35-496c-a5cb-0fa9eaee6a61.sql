ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS ai_runtime text NOT NULL DEFAULT 'lovable',
  ADD COLUMN IF NOT EXISTS ai_remote_endpoint text,
  ADD COLUMN IF NOT EXISTS ai_remote_model text,
  ADD COLUMN IF NOT EXISTS ai_ondevice_model text;

ALTER TABLE public.projects
  ADD CONSTRAINT projects_ai_runtime_check
  CHECK (ai_runtime IN ('lovable', 'remote', 'on-device'));