CREATE TABLE public.ai_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  model TEXT NOT NULL,
  latency_ms INTEGER NOT NULL,
  success BOOLEAN NOT NULL,
  error_message TEXT,
  token_count INTEGER,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON public.ai_logs TO service_role;

ALTER TABLE public.ai_logs ENABLE ROW LEVEL SECURITY;

-- No client policies: writes/reads happen only via server functions using service role.

CREATE INDEX idx_ai_logs_created_at ON public.ai_logs(created_at DESC);
CREATE INDEX idx_ai_logs_model ON public.ai_logs(model);
CREATE INDEX idx_ai_logs_success ON public.ai_logs(success);
CREATE INDEX idx_ai_logs_project_id ON public.ai_logs(project_id);