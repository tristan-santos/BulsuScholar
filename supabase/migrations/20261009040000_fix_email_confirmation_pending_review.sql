-- Email confirmation only marks the pending account ready for administrator review.
-- Roster assignment runs after account approval and must never block confirmation.
create or replace function public.promote_email_confirmed_student(
  p_student_id text,
  p_auth_user_id text,
  p_email text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  pending_data jsonb;
  active_data jsonb;
  confirmed_at text := now()::text;
begin
  perform pg_advisory_xact_lock(hashtext('student:' || p_student_id));

  select data into active_data
  from public.students
  where id = p_student_id;

  if found then
    if active_data->>'authUserId' is distinct from p_auth_user_id then
      raise exception 'confirmed_identity_mismatch';
    end if;
    return jsonb_build_object('alreadyActive', true);
  end if;

  select data into pending_data
  from public.pending_students
  where id = p_student_id
  for update;

  if not found then
    raise exception 'pending_student_not_found';
  end if;

  if lower(coalesce(pending_data->>'email', '')) <> lower(coalesce(p_email, ''))
    or pending_data->>'authUserId' is distinct from p_auth_user_id then
    raise exception 'confirmed_identity_mismatch';
  end if;

  confirmed_at := coalesce(nullif(pending_data->>'emailConfirmedAt', ''), confirmed_at);
  update public.pending_students
  set data = pending_data || jsonb_build_object(
      'emailConfirmedAt', confirmed_at,
      'accountReviewStatus', 'pending',
      'isPending', true,
      'isValidated', false,
      'updatedAt', now()::text
    ),
    updated_at = now()
  where id = p_student_id;

  return jsonb_build_object(
    'pendingApproval', true,
    'studentId', p_student_id
  );
end;
$$;

revoke all on function public.promote_email_confirmed_student(text, text, text)
  from public, anon, authenticated;
grant execute on function public.promote_email_confirmed_student(text, text, text)
  to service_role;
