
-- 1. Hide sensitive project columns from anon/authenticated readers.
--    The public-read RLS policy stays, but PostgREST will refuse to return revoked columns.
REVOKE SELECT (prompt, ai_remote_endpoint, ai_remote_model, ai_ondevice_model)
  ON public.projects FROM anon, authenticated;

-- 2. app_data: scope read/update to the caller's own device via x-device-key header.
DROP POLICY IF EXISTS "anyone read app data for published projects" ON public.app_data;
DROP POLICY IF EXISTS "anyone update app data for published projects" ON public.app_data;

CREATE POLICY "read own device app data for published projects"
  ON public.app_data FOR SELECT
  USING (
    device_key = current_setting('request.headers', true)::json->>'x-device-key'
    AND device_key IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.projects p WHERE p.id = app_data.project_id AND p.is_published = true)
  );

CREATE POLICY "update own device app data for published projects"
  ON public.app_data FOR UPDATE
  USING (
    device_key = current_setting('request.headers', true)::json->>'x-device-key'
    AND device_key IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.projects p WHERE p.id = app_data.project_id AND p.is_published = true)
  )
  WITH CHECK (
    device_key = current_setting('request.headers', true)::json->>'x-device-key'
    AND device_key IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.projects p WHERE p.id = app_data.project_id AND p.is_published = true)
  );

-- 3. Allow project owners to delete app_data for their own projects.
CREATE POLICY "owners delete app data for own projects"
  ON public.app_data FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM public.projects p WHERE p.id = app_data.project_id AND p.owner_id = auth.uid())
  );
