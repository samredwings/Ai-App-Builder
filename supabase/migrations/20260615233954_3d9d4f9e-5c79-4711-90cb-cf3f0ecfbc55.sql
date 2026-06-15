
-- 1. Helper to check published status without exposing projects to anon
CREATE OR REPLACE FUNCTION public.is_project_published(_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.projects p WHERE p.id = _project_id AND p.is_published = true);
$$;

GRANT EXECUTE ON FUNCTION public.is_project_published(uuid) TO anon, authenticated;

-- 2. Rewrite app_data policies to use the helper (so we can drop public projects SELECT)
DROP POLICY IF EXISTS "anyone insert app data for published projects" ON public.app_data;
DROP POLICY IF EXISTS "read own device app data for published projects" ON public.app_data;
DROP POLICY IF EXISTS "update own device app data for published projects" ON public.app_data;

CREATE POLICY "anyone insert app data for published projects"
  ON public.app_data FOR INSERT
  WITH CHECK (public.is_project_published(project_id));

CREATE POLICY "read own device app data for published projects"
  ON public.app_data FOR SELECT
  USING (
    device_key IS NOT NULL
    AND device_key = ((current_setting('request.headers'::text, true))::json ->> 'x-device-key'::text)
    AND public.is_project_published(project_id)
  );

CREATE POLICY "update own device app data for published projects"
  ON public.app_data FOR UPDATE
  USING (
    device_key IS NOT NULL
    AND device_key = ((current_setting('request.headers'::text, true))::json ->> 'x-device-key'::text)
    AND public.is_project_published(project_id)
  )
  WITH CHECK (
    device_key IS NOT NULL
    AND device_key = ((current_setting('request.headers'::text, true))::json ->> 'x-device-key'::text)
    AND public.is_project_published(project_id)
  );

-- 3. Drop the public SELECT policies that exposed sensitive project columns.
--    All published-app rendering goes through server functions using the service-role client.
DROP POLICY IF EXISTS "public can read published projects" ON public.projects;
DROP POLICY IF EXISTS "public can read versions of published projects" ON public.project_versions;

-- 4. ai_logs: add owner SELECT policy so the linter no-policy warning resolves
--    and project owners can review their own usage. Writes happen via service role.
CREATE POLICY "owners view own ai logs"
  ON public.ai_logs FOR SELECT
  USING (
    project_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.projects p WHERE p.id = ai_logs.project_id AND p.owner_id = auth.uid())
  );
