begin;

do $$
declare
  student_id text := 'manual_approval_test_' || txid_current()::text;
  auth_id text := '00000000-0000-4000-8000-000000000001';
  result jsonb;
begin
  if has_table_privilege('anon', 'public.students', 'SELECT')
    or has_table_privilege('authenticated', 'public.pending_students', 'SELECT') then
    raise exception 'Direct student-table access is still granted';
  end if;

  insert into public.pending_students(id, data, updated_at)
  values (student_id, jsonb_build_object(
    'authUserId', auth_id,
    'email', 'manual-approval-test@example.invalid',
    'studentnumber', student_id,
    'fname', 'Test',
    'lname', 'Student',
    'isPending', true,
    'isValidated', false
  ), now());

  begin
    perform public.approve_pending_student_account(
      student_id, auth_id, 'manual-approval-test@example.invalid', 'test-admin'
    );
    raise exception 'Unconfirmed student was approved';
  exception when others then
    if sqlerrm <> 'student_email_not_confirmed' then raise; end if;
  end;

  result := public.promote_email_confirmed_student(
    student_id, auth_id, 'manual-approval-test@example.invalid'
  );
  if result->>'pendingApproval' <> 'true' then
    raise exception 'Confirmation did not queue manual review';
  end if;
  if exists (select 1 from public.students where id = student_id) then
    raise exception 'Student activated before approval';
  end if;

  result := public.approve_pending_student_account(
    student_id, auth_id, 'manual-approval-test@example.invalid', 'test-admin'
  );
  if result->>'approved' <> 'true'
    or not exists (select 1 from public.students where id = student_id)
    or exists (select 1 from public.pending_students where id = student_id)
    or not exists (select 1 from public.signup_account_decisions
      where id = student_id || ':approved') then
    raise exception 'Approval transition was incomplete';
  end if;
end;
$$;

rollback;
