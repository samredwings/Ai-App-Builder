
REVOKE SELECT (prompt, ai_remote_endpoint, ai_remote_model, ai_ondevice_model)
  ON public.projects FROM anon;
REVOKE SELECT (prompt, ai_remote_endpoint, ai_remote_model, ai_ondevice_model)
  ON public.projects FROM authenticated;

GRANT SELECT (
  id, owner_id, slug, title, template_family, icon_url, theme,
  is_published, current_version_id, ai_runtime,
  created_at, updated_at
) ON public.projects TO anon;

GRANT SELECT (
  id, owner_id, slug, title, template_family, icon_url, theme,
  is_published, current_version_id, ai_runtime,
  created_at, updated_at
) ON public.projects TO authenticated;
