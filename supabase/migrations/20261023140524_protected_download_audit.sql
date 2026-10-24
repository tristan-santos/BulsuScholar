-- Processing derivatives are private, non-authoritative copies; original references never change.
alter table public.signed_soe_submissions add column processing_file jsonb;
create function public.finalize_protected_signed_soe_submission(
  p_submission_id text, p_student_id text, p_application_id text, p_cycle text,
  p_bucket text, p_path text, p_file_name text, p_content_type text, p_size bigint,
  p_processing_file jsonb default null
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare result jsonb;
begin
  if p_processing_file is not null and (
    p_content_type <> 'application/pdf'
    or p_processing_file->>'bucket' is distinct from p_bucket
    or p_processing_file->>'path' is distinct from p_path || '.preview.pdf'
  ) then raise exception 'invalid_processing_reference'; end if;
  result := public.finalize_signed_soe_submission(p_submission_id, p_student_id,
    p_application_id, p_cycle, p_bucket, p_path, p_file_name, p_content_type, p_size);
  if p_processing_file is not null then
    update public.signed_soe_submissions set processing_file = p_processing_file where id = p_submission_id;
  end if;
  return result;
end;
$$;
revoke all on function public.finalize_protected_signed_soe_submission(text,text,text,text,text,text,text,text,bigint,jsonb) from public, anon, authenticated;
grant execute on function public.finalize_protected_signed_soe_submission(text,text,text,text,text,text,text,text,bigint,jsonb) to service_role;
create table public.protected_download_events (
  id uuid primary key,
  actor_id text not null,
  actor_type text not null,
  resource text not null,
  resource_version text not null default '',
  protection text not null,
  format text not null,
  outcome text not null check (outcome in ('prepared', 'failed')),
  reason text not null default '',
  created_at timestamptz not null default now()
);
alter table public.protected_download_events enable row level security;
revoke all on public.protected_download_events from public, anon, authenticated, service_role;
grant select, insert on public.protected_download_events to service_role;
create index protected_download_events_created_idx on public.protected_download_events (created_at desc);
create function public.protect_download_audit_history() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  raise exception 'download_audit_is_append_only';
end;
$$;
revoke all on function public.protect_download_audit_history() from public, anon, authenticated;
create trigger protected_download_events_immutable before update or delete
on public.protected_download_events for each row execute function public.protect_download_audit_history();
