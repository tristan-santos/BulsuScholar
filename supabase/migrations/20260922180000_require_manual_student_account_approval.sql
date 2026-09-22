-- Preserve the existing activation function for the authorized approval path.
create table if not exists public.signup_account_decisions (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.signup_account_decisions enable row level security;
revoke all on public.signup_account_decisions from anon, authenticated;
grant all on public.signup_account_decisions to service_role;

alter function public.promote_email_confirmed_student(text, text, text)
  rename to activate_approved_student;
revoke all on function public.activate_approved_student(text, text, text)
  from public, anon, authenticated, service_role;

create function public.promote_email_confirmed_student(
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
  select data into active_data from public.students where id = p_student_id;
  if found then
    if active_data->>'authUserId' is distinct from p_auth_user_id then
      raise exception 'confirmed_identity_mismatch';
    end if;
    return jsonb_build_object('alreadyActive', true);
  end if;

  select data into pending_data from public.pending_students
    where id = p_student_id for update;
  if not found then raise exception 'pending_student_not_found'; end if;
  if lower(coalesce(pending_data->>'email', '')) <> lower(coalesce(p_email, ''))
    or pending_data->>'authUserId' is distinct from p_auth_user_id then
    raise exception 'confirmed_identity_mismatch';
  end if;

  confirmed_at := coalesce(pending_data->>'emailConfirmedAt', confirmed_at);
  update public.pending_students
    set data = pending_data || jsonb_build_object(
      'emailConfirmedAt', confirmed_at,
      'accountReviewStatus', 'pending',
      'isPending', true,
      'isValidated', false,
      'updatedAt', now()::text
    ), updated_at = now()
    where id = p_student_id;
  return jsonb_build_object('pendingApproval', true, 'studentId', p_student_id);
end;
$$;

revoke all on function public.promote_email_confirmed_student(text, text, text)
  from public, anon, authenticated;
grant execute on function public.promote_email_confirmed_student(text, text, text)
  to service_role;

create function public.approve_pending_student_account(
  p_student_id text,
  p_auth_user_id text,
  p_email text,
  p_admin_id text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  pending_data jsonb;
  activated jsonb;
  approved_data jsonb;
begin
  if nullif(trim(p_admin_id), '') is null then
    raise exception 'admin_identity_required';
  end if;
  perform pg_advisory_xact_lock(hashtext('student:' || p_student_id));
  select data into pending_data from public.pending_students
    where id = p_student_id for update;
  if not found then raise exception 'pending_student_not_found'; end if;
  if nullif(pending_data->>'emailConfirmedAt', '') is null then
    raise exception 'student_email_not_confirmed';
  end if;

  activated := public.activate_approved_student(p_student_id, p_auth_user_id, p_email);
  update public.students
    set data = data || jsonb_build_object(
      'accountReviewStatus', 'approved',
      'accountApprovedBy', p_admin_id,
      'accountApprovedAt', now()::text
    ), updated_at = now()
    where id = p_student_id
    returning data into approved_data;
  insert into public.signup_account_decisions(id, data)
  values (p_student_id || ':approved', jsonb_build_object(
    'studentId', p_student_id,
    'decision', 'approved',
    'adminId', p_admin_id,
    'decidedAt', now()::text
  )) on conflict (id) do nothing;
  return (activated - 'student') || jsonb_build_object('approved', true, 'student', approved_data);
end;
$$;

revoke all on function public.approve_pending_student_account(text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.approve_pending_student_account(text, text, text, text)
  to service_role;
