-- Replace email OTP, recovery codes, and trusted devices with one permanent
-- hashed 10-digit root login code. The setup script supplies the hash.

alter table public.root_admins
  add column if not exists login_code_hash text,
  add column if not exists failed_code_attempts integer not null default 0,
  add column if not exists code_locked_until timestamptz;

alter table public.root_admins
  drop constraint if exists root_admins_failed_code_attempts_check;

alter table public.root_admins
  add constraint root_admins_failed_code_attempts_check
  check (failed_code_attempts between 0 and 5);

update public.root_sessions
set revoked_at = coalesce(revoked_at, now())
where revoked_at is null;

drop table if exists public.root_otp_challenges cascade;
drop table if exists public.root_trusted_devices cascade;

alter table public.root_admins
  drop column if exists must_change_password,
  drop column if exists recovery_code_hashes;

alter table public.root_sessions
  drop column if exists reauthenticated_at;

revoke all on public.root_admins, public.root_sessions from anon, authenticated;

notify pgrst, 'reload schema';
