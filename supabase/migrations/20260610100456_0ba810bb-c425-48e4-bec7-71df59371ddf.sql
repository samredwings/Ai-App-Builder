REVOKE SELECT (prompt, ai_remote_endpoint, ai_remote_model, ai_ondevice_model) ON public.projects FROM anon, authenticated;

CREATE POLICY "public can read icons of published projects"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (
  bucket_id = 'app-icons'
  AND EXISTS (
    SELECT 1 FROM public.projects p
    WHERE (storage.foldername(name))[1] = p.owner_id::text
      AND p.is_published = true
  )
);

CREATE POLICY "owners read own app icons"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'app-icons'
  AND (storage.foldername(name))[1] = auth.uid()::text
);