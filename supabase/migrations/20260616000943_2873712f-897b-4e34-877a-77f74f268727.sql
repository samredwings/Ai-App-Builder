-- Requirements (BRD) per project
CREATE TABLE public.requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'added' CHECK (source IN ('original','added','changed','manual')),
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','done','changed','removed')),
  position INTEGER NOT NULL DEFAULT 0,
  version_first_seen INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.requirements TO authenticated;
GRANT ALL ON public.requirements TO service_role;
ALTER TABLE public.requirements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owners manage requirements"
  ON public.requirements FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = requirements.project_id AND p.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = requirements.project_id AND p.owner_id = auth.uid()));
CREATE INDEX requirements_project_idx ON public.requirements(project_id, position);
CREATE TRIGGER requirements_touch BEFORE UPDATE ON public.requirements
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Test results per project/version
CREATE TABLE public.test_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  version_id UUID REFERENCES public.project_versions(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('static','behavioral')),
  passed BOOLEAN NOT NULL,
  issue_count INTEGER NOT NULL DEFAULT 0,
  issues JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.test_results TO authenticated;
GRANT ALL ON public.test_results TO service_role;
ALTER TABLE public.test_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owners read test_results"
  ON public.test_results FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = test_results.project_id AND p.owner_id = auth.uid()));
CREATE INDEX test_results_project_idx ON public.test_results(project_id, created_at DESC);