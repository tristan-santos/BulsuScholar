-- Root administration security, configuration, support, branding, and telemetry.

create table if not exists public.root_admins (
  id text primary key,
  auth_user_id uuid unique not null,
  email text not null,
  display_name text not null default 'Root Administrator',
  active boolean not null default true,
  must_change_password boolean not null default true,
  recovery_code_hashes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.root_otp_challenges (
  id uuid primary key default gen_random_uuid(),
  root_id text not null references public.root_admins(id) on delete cascade,
  code_hash text not null,
  attempts integer not null default 0,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.root_trusted_devices (
  id uuid primary key default gen_random_uuid(),
  root_id text not null references public.root_admins(id) on delete cascade,
  token_hash text unique not null,
  label text not null default 'Trusted device',
  user_agent text not null default '',
  last_used_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.root_sessions (
  id uuid primary key default gen_random_uuid(),
  root_id text not null references public.root_admins(id) on delete cascade,
  token_hash text unique not null,
  user_agent text not null default '',
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_used_at timestamptz not null default now(),
  reauthenticated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.root_sessions
  add column if not exists reauthenticated_at timestamptz not null default now();

create table if not exists public.root_audit_logs (
  id uuid primary key default gen_random_uuid(),
  root_id text not null,
  action text not null,
  target text not null default '',
  details jsonb not null default '{}'::jsonb,
  ip_address text not null default '',
  user_agent text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.system_configuration (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.system_configuration (id, data)
values
  ('portal', jsonb_build_object(
    'maintenanceMode', false,
    'allowStudentSignup', true,
    'allowGrantorAnnouncements', true,
    'reportExportEnabled', true
  )),
  ('academic_cycle', jsonb_build_object(
    'academicYear', case when extract(month from now()) >= 7
      then extract(year from now())::int::text || '-' || (extract(year from now())::int + 1)::text
      else (extract(year from now())::int - 1)::text || '-' || extract(year from now())::int::text end,
    'semester', case when extract(month from now()) >= 7 then '1ST' else '2ND' end,
    'activatedAt', now()
  )),
  ('branding', jsonb_build_object(
    'productName', 'BulsuScholar',
    'fontFamily', 'Inter',
    'primaryColor', '#006b3c',
    'accentColor', '#16a34a',
    'logoUrl', '',
    'faviconUrl', '',
    'maintenanceMessage', 'BulsuScholar is temporarily under maintenance.'
  ))
on conflict (id) do nothing;

create table if not exists public.branding_versions (
  id uuid primary key default gen_random_uuid(),
  data jsonb not null default '{}'::jsonb,
  status text not null check (status in ('draft', 'published', 'archived')),
  created_by text not null,
  created_at timestamptz not null default now(),
  published_at timestamptz
);

create table if not exists public.request_metric_buckets (
  bucket_start timestamptz primary key,
  request_count bigint not null default 0,
  error_count bigint not null default 0,
  total_duration_ms double precision not null default 0,
  max_duration_ms double precision not null default 0,
  route_counts jsonb not null default '{}'::jsonb,
  status_counts jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists root_otp_root_created_idx on public.root_otp_challenges(root_id, created_at desc);
create index if not exists root_devices_root_idx on public.root_trusted_devices(root_id, created_at desc);
create index if not exists root_sessions_root_idx on public.root_sessions(root_id, created_at desc);
create index if not exists root_audit_created_idx on public.root_audit_logs(created_at desc);
create index if not exists branding_versions_created_idx on public.branding_versions(created_at desc);

alter table public.support_feedback add column if not exists assigned_to text;
alter table public.support_feedback add column if not exists priority text not null default 'normal';
alter table public.support_feedback add column if not exists status text not null default 'open';
alter table public.support_feedback add column if not exists resolved_at timestamptz;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'root_admins', 'root_otp_challenges', 'root_trusted_devices', 'root_sessions',
    'root_audit_logs', 'system_configuration', 'branding_versions', 'request_metric_buckets',
    'support_feedback'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists "Allow app client read" on public.%I', table_name);
    execute format('drop policy if exists "Allow app client insert" on public.%I', table_name);
    execute format('drop policy if exists "Allow app client update" on public.%I', table_name);
    execute format('drop policy if exists "Allow app client delete" on public.%I', table_name);
  end loop;
end $$;

-- These records are service-role only. Public configuration is exposed through a
-- deliberately limited backend endpoint.
revoke all on public.root_admins, public.root_otp_challenges, public.root_trusted_devices,
  public.root_sessions, public.root_audit_logs, public.system_configuration,
  public.branding_versions, public.request_metric_buckets, public.support_feedback
from anon, authenticated;

create or replace function public.prevent_root_audit_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'root_audit_logs_are_append_only';
end $$;

drop trigger if exists root_audit_no_update on public.root_audit_logs;
create trigger root_audit_no_update before update or delete on public.root_audit_logs
for each row execute function public.prevent_root_audit_mutation();

notify pgrst, 'reload schema';
