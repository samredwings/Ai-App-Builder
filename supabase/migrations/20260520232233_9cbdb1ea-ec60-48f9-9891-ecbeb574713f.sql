
-- Projects
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  slug text not null unique,
  title text not null default 'Untitled app',
  prompt text not null default '',
  template_family text not null default 'utility',
  icon_url text,
  theme jsonb not null default '{"primary":"#4f46e5","background":"#ffffff","foreground":"#0f172a","accent":"#a78bfa"}'::jsonb,
  current_version_id uuid,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.projects enable row level security;

create policy "owners crud own projects"
  on public.projects for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "public can read published projects"
  on public.projects for select
  using (is_published = true);

create index on public.projects(owner_id);
create index on public.projects(slug);

-- Versions
create table public.project_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  version_num int not null,
  tabs jsonb not null,
  created_by_message text,
  created_at timestamptz not null default now()
);

alter table public.project_versions enable row level security;

create policy "owners crud own versions"
  on public.project_versions for all
  using (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()))
  with check (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()));

create policy "public can read versions of published projects"
  on public.project_versions for select
  using (exists (select 1 from public.projects p where p.id = project_id and p.is_published = true));

create index on public.project_versions(project_id);

-- Messages
create table public.project_messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  role text not null check (role in ('user','assistant','system')),
  content text not null,
  version_id_after uuid references public.project_versions(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.project_messages enable row level security;

create policy "owners crud own messages"
  on public.project_messages for all
  using (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()))
  with check (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()));

create index on public.project_messages(project_id);

-- App data (per-device KV for generated apps)
create table public.app_data (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  device_key text not null,
  key text not null,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  unique (project_id, device_key, key)
);

alter table public.app_data enable row level security;

-- Anyone (anon or auth) may read/write to a published project's data scoped by their device_key.
create policy "anyone read app data for published projects"
  on public.app_data for select
  using (exists (select 1 from public.projects p where p.id = project_id and p.is_published = true));

create policy "anyone insert app data for published projects"
  on public.app_data for insert
  with check (exists (select 1 from public.projects p where p.id = project_id and p.is_published = true));

create policy "anyone update app data for published projects"
  on public.app_data for update
  using (exists (select 1 from public.projects p where p.id = project_id and p.is_published = true))
  with check (exists (select 1 from public.projects p where p.id = project_id and p.is_published = true));

create index on public.app_data(project_id, device_key);

-- Updated_at trigger
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger projects_touch_updated_at
  before update on public.projects
  for each row execute function public.touch_updated_at();

create trigger app_data_touch_updated_at
  before update on public.app_data
  for each row execute function public.touch_updated_at();

-- Storage bucket for app icons
insert into storage.buckets (id, name, public)
values ('app-icons','app-icons', true)
on conflict (id) do nothing;

create policy "public read app icons"
  on storage.objects for select
  using (bucket_id = 'app-icons');

create policy "auth users upload own app icons"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'app-icons' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "auth users update own app icons"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'app-icons' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "auth users delete own app icons"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'app-icons' and (storage.foldername(name))[1] = auth.uid()::text);
