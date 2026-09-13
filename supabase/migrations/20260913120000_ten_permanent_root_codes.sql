-- Allow any of ten reusable permanent root login codes while storing hashes only.

alter table public.root_admins
  add column if not exists login_code_hashes jsonb not null default '[]'::jsonb;

update public.root_admins
set login_code_hashes = jsonb_build_array(login_code_hash)
where login_code_hash is not null
  and login_code_hash <> ''
  and jsonb_array_length(login_code_hashes) = 0;

alter table public.root_admins
  drop constraint if exists root_admins_login_code_hashes_array_check;

alter table public.root_admins
  add constraint root_admins_login_code_hashes_array_check
  check (
    jsonb_typeof(login_code_hashes) = 'array'
    and jsonb_array_length(login_code_hashes) <= 10
  );

alter table public.root_admins
  drop column if exists login_code_hash;

update public.root_sessions
set revoked_at = coalesce(revoked_at, now())
where revoked_at is null;

revoke all on public.root_admins, public.root_sessions from anon, authenticated;

notify pgrst, 'reload schema';
