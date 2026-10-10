create or replace function public.claim_pending_student_confirmation_resend(
  p_student_id text,
  p_admin_id text,
  p_request_id text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  pending_row public.pending_students%rowtype;
  pending_data jsonb;
  current_claim jsonb;
  last_sent_at timestamptz;
  claim_started_at timestamptz;
  available_at timestamptz;
  retry_after integer;
begin
  if nullif(trim(coalesce(p_student_id, '')), '') is null
    or nullif(trim(coalesce(p_admin_id, '')), '') is null
    or nullif(trim(coalesce(p_request_id, '')), '') is null then
    raise exception 'confirmation_resend_identity_required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('confirmation-resend:' || p_student_id, 0));

  select * into pending_row
  from public.pending_students
  where id = p_student_id
  for update;

  if not found then
    raise exception 'pending_student_not_found';
  end if;

  pending_data := coalesce(pending_row.data, '{}'::jsonb);
  if nullif(pending_data->>'emailConfirmedAt', '') is not null then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'student_email_already_confirmed',
      'alreadyConfirmed', true,
      'retryAfter', 0
    );
  end if;

  begin
    last_sent_at := nullif(pending_data->>'confirmationEmailLastSentAt', '')::timestamptz;
  exception when others then
    last_sent_at := null;
  end;
  if last_sent_at is null then
    begin
      last_sent_at := nullif(pending_data->>'createdAt', '')::timestamptz;
    exception when others then
      last_sent_at := null;
    end;
  end if;
  last_sent_at := coalesce(last_sent_at, pending_row.created_at, now());
  available_at := last_sent_at + interval '5 minutes';

  if now() < available_at then
    retry_after := greatest(1, ceil(extract(epoch from (available_at - now())))::integer);
    return jsonb_build_object(
      'allowed', false,
      'reason', 'confirmation_resend_cooldown',
      'availableAt', available_at,
      'retryAfter', retry_after
    );
  end if;

  current_claim := pending_data->'confirmationEmailResendClaim';
  begin
    claim_started_at := nullif(current_claim->>'claimedAt', '')::timestamptz;
  exception when others then
    claim_started_at := null;
  end;
  if claim_started_at is not null and claim_started_at > now() - interval '2 minutes' then
    retry_after := greatest(1, ceil(extract(epoch from ((claim_started_at + interval '2 minutes') - now())))::integer);
    return jsonb_build_object(
      'allowed', false,
      'reason', 'confirmation_resend_in_progress',
      'availableAt', claim_started_at + interval '2 minutes',
      'retryAfter', retry_after
    );
  end if;

  pending_data := jsonb_set(
    pending_data,
    '{confirmationEmailResendClaim}',
    jsonb_build_object('id', p_request_id, 'adminId', p_admin_id, 'claimedAt', now()::text),
    true
  );
  update public.pending_students
  set data = pending_data,
      updated_at = now()
  where id = p_student_id;

  return jsonb_build_object(
    'allowed', true,
    'requestId', p_request_id,
    'retryAfter', 0
  );
end;
$$;

create or replace function public.complete_pending_student_confirmation_resend(
  p_student_id text,
  p_request_id text,
  p_succeeded boolean
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  pending_row public.pending_students%rowtype;
  pending_data jsonb;
  current_claim jsonb;
  sent_at timestamptz := now();
  resend_count integer := 0;
begin
  perform pg_advisory_xact_lock(hashtextextended('confirmation-resend:' || p_student_id, 0));

  select * into pending_row
  from public.pending_students
  where id = p_student_id
  for update;

  if not found then
    raise exception 'pending_student_not_found';
  end if;

  pending_data := coalesce(pending_row.data, '{}'::jsonb);
  current_claim := pending_data->'confirmationEmailResendClaim';
  if current_claim is null or current_claim->>'id' is distinct from p_request_id then
    raise exception 'confirmation_resend_claim_mismatch';
  end if;

  pending_data := pending_data - 'confirmationEmailResendClaim';
  if coalesce(p_succeeded, false) then
    begin
      resend_count := greatest(0, coalesce((pending_data->>'confirmationEmailResendCount')::integer, 0));
    exception when others then
      resend_count := 0;
    end;
    pending_data := pending_data || jsonb_build_object(
      'confirmationEmailLastSentAt', sent_at::text,
      'confirmationEmailLastSentBy', current_claim->>'adminId',
      'confirmationEmailResendCount', resend_count + 1,
      'updatedAt', sent_at::text
    );
  end if;

  update public.pending_students
  set data = pending_data,
      updated_at = now()
  where id = p_student_id;

  return jsonb_build_object(
    'completed', true,
    'sent', coalesce(p_succeeded, false),
    'availableAt', case when p_succeeded then sent_at + interval '5 minutes' else now() end,
    'retryAfter', case when p_succeeded then 300 else 0 end
  );
end;
$$;

revoke all on function public.claim_pending_student_confirmation_resend(text, text, text)
  from public, anon, authenticated;
grant execute on function public.claim_pending_student_confirmation_resend(text, text, text)
  to service_role;

revoke all on function public.complete_pending_student_confirmation_resend(text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.complete_pending_student_confirmation_resend(text, text, boolean)
  to service_role;
