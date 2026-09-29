begin;

create table if not exists public.signup_document_batches (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists signup_document_batches_status_expiry_idx
  on public.signup_document_batches ((data->>'status'), (data->>'expiresAt'));
create index if not exists signup_document_batches_student_idx
  on public.signup_document_batches ((data->>'studentId'), created_at desc);

alter table public.signup_document_batches enable row level security;
revoke all on public.signup_document_batches from public, anon, authenticated;
grant select, insert, update, delete on public.signup_document_batches to service_role;

create or replace function public.claim_signup_document_batch(
  p_batch_id text,
  p_secret_hash text,
  p_student_id text,
  p_email text,
  p_auth_user_id text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  batch_data jsonb;
  batch_status text;
begin
  perform pg_advisory_xact_lock(hashtext('signup-document-batch:' || p_batch_id));
  select data into batch_data
  from public.signup_document_batches
  where id = p_batch_id
  for update;

  if not found then raise exception 'signup_document_batch_not_found'; end if;
  if batch_data->>'secretHash' is distinct from p_secret_hash then raise exception 'signup_document_batch_invalid'; end if;
  if batch_data->>'studentId' is distinct from p_student_id
    or lower(coalesce(batch_data->>'email', '')) <> lower(coalesce(p_email, '')) then
    raise exception 'signup_document_batch_identity_mismatch';
  end if;
  if (batch_data->>'expiresAt')::timestamptz <= now() then raise exception 'signup_document_batch_expired'; end if;

  batch_status := coalesce(batch_data->>'status', '');
  if batch_status = 'prepared' then
    batch_data := batch_data || jsonb_build_object(
      'status', 'processing',
      'authUserId', p_auth_user_id,
      'claimedAt', now()::text,
      'updatedAt', now()::text
    );
    update public.signup_document_batches set data = batch_data, updated_at = now() where id = p_batch_id;
  elsif batch_status in ('processing', 'consumed') then
    if batch_data->>'authUserId' is distinct from p_auth_user_id then
      raise exception 'signup_document_batch_already_used';
    end if;
  else
    raise exception 'signup_document_batch_not_available';
  end if;

  return batch_data - 'secretHash';
end;
$$;

revoke all on function public.claim_signup_document_batch(text,text,text,text,text)
  from public, anon, authenticated;
grant execute on function public.claim_signup_document_batch(text,text,text,text,text)
  to service_role;

commit;
