
alter function public.touch_updated_at() set search_path = public;

drop policy if exists "public read app icons" on storage.objects;
