-- A legacy roster row may identify a student without identifying a scholarship.
-- Keep the row for resolution, but do not block activation of an approved account.
create or replace function public.approve_pending_student_account(
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
  active_data jsonb;
  existing_active_data jsonb;
  match_count integer := 0;
  matched_grantor_id text;
  matched_roster_id text;
  assignment jsonb;
  roster_assignment_failure text;
  now_text text := now()::text;
begin
  if nullif(trim(coalesce(p_admin_id, '')), '') is null then
    raise exception 'admin_identity_required';
  end if;
  if nullif(trim(coalesce(p_student_id, '')), '') is null
    or nullif(trim(coalesce(p_auth_user_id, '')), '') is null
    or nullif(trim(coalesce(p_email, '')), '') is null then
    raise exception 'pending_student_identity_missing';
  end if;

  perform pg_advisory_xact_lock(hashtext('student:' || p_student_id));
  perform set_config('bulsuscholar.choice_write', 'true', true);

  select data into existing_active_data
  from public.students
  where id = p_student_id
  for update;

  if found then
    if existing_active_data->>'authUserId' is distinct from p_auth_user_id
      or lower(coalesce(existing_active_data->>'email', '')) <> lower(p_email) then
      raise exception 'confirmed_identity_mismatch';
    end if;
    return jsonb_build_object(
      'approved', true,
      'alreadyActive', true,
      'student', existing_active_data
    );
  end if;

  select data into pending_data
  from public.pending_students
  where id = p_student_id
  for update;

  if not found then
    raise exception 'pending_student_not_found';
  end if;
  if nullif(pending_data->>'emailConfirmedAt', '') is null then
    raise exception 'student_email_not_confirmed';
  end if;
  if pending_data->>'authUserId' is distinct from p_auth_user_id
    or lower(coalesce(pending_data->>'email', '')) <> lower(p_email) then
    raise exception 'confirmed_identity_mismatch';
  end if;

  select count(*), min(parent_id), min(id)
  into match_count, matched_grantor_id, matched_roster_id
  from public.grantor_portal_scholars
  where coalesce(data->>'studentId', data->>'studentnumber', data->>'studentNumber') = p_student_id
    and lower(coalesce(data->>'archived', 'false')) <> 'true'
    and lower(coalesce(data->>'status', 'active')) not in
      ('archived', 'rejected', 'declined', 'withdrawn');

  active_data := (
    pending_data
      - 'password'
      - 'rosterDecisionPending'
      - 'rosterScholarshipChoice'
  ) || jsonb_build_object(
    'scholarshipLifecycleVersion', 2,
    'isPending', false,
    'isValidated', true,
    'validatedAt', now_text,
    'accountReviewStatus', 'approved',
    'accountApprovedBy', p_admin_id,
    'accountApprovedAt', now_text,
    'rosterAssignmentState', case
      when match_count > 1 then jsonb_build_object(
        'status', 'conflict',
        'matchCount', match_count,
        'detectedAt', now_text
      )
      else jsonb_build_object(
        'status', 'none',
        'matchCount', 0,
        'checkedAt', now_text
      )
    end,
    'updatedAt', now_text
  );

  insert into public.students(id, data, updated_at)
  values (p_student_id, active_data, now());
  delete from public.pending_students where id = p_student_id;

  if match_count = 1 then
    begin
      assignment := public.assign_authoritative_roster_scholarship(
        p_student_id,
        matched_grantor_id,
        matched_roster_id
      );
      if jsonb_typeof(assignment->'student') = 'object' then
        active_data := assignment->'student';
      end if;
    exception when others then
      if sqlerrm not in (
        'roster_scholarship_not_recognized',
        'roster_match_not_found',
        'scholarship_already_committed'
      ) then
        raise;
      end if;
      roster_assignment_failure := sqlerrm;
      update public.students
      set data = data || jsonb_build_object(
          'rosterAssignmentState', jsonb_build_object(
            'status', 'conflict',
            'matchCount', 1,
            'rosterId', matched_roster_id,
            'grantorId', matched_grantor_id,
            'reason', roster_assignment_failure,
            'detectedAt', now_text
          ),
          'updatedAt', now_text
        ),
        updated_at = now()
      where id = p_student_id
      returning data into active_data;
    end;
  end if;

  if match_count > 1 or roster_assignment_failure is not null then
    insert into public."systemLogs"(id, data, updated_at)
    values (
      'roster_conflict_' || p_student_id,
      jsonb_build_object(
        'studentId', p_student_id,
        'type', 'roster_assignment_conflict',
        'title', 'Roster Assignment Conflict',
        'message', case
          when roster_assignment_failure = 'roster_scholarship_not_recognized'
            then 'The roster row does not identify a scholarship. The account was activated without an award.'
          when roster_assignment_failure is not null
            then 'The account was activated, but its roster scholarship requires staff resolution.'
          else 'The approved student has multiple active roster matches. Staff resolution is required.'
        end,
        'reason', roster_assignment_failure,
        'rosterId', matched_roster_id,
        'grantorId', matched_grantor_id,
        'route', '/admin/scholarships',
        'read', false,
        'createdAt', now_text,
        'notificationFallbackTable', 'adminNotifications',
        'action', 'roster_assignment_conflict',
        'actorType', 'system'
      ),
      now()
    ) on conflict(id) do update
      set data = excluded.data, updated_at = now();
  end if;

  insert into public.signup_account_decisions(id, data, updated_at)
  values (
    p_student_id || ':approved',
    jsonb_build_object(
      'studentId', p_student_id,
      'decision', 'approved',
      'adminId', p_admin_id,
      'decidedAt', now_text
    ),
    now()
  ) on conflict(id) do nothing;

  insert into public."studentNotifications"(id, data, updated_at)
  values (
    'account_approved_' || p_student_id,
    jsonb_build_object(
      'studentId', p_student_id,
      'type', 'account_approved',
      'title', 'Account Approved',
      'message', case
        when match_count = 1 and roster_assignment_failure is null
          then 'Your account was approved and your official roster scholarship was assigned.'
        when match_count > 1 or roster_assignment_failure is not null
          then 'Your account was approved. The scholarship office must resolve your roster information.'
        else 'Your BulsuScholar account was approved. You can now sign in.'
      end,
      'route', '/student-dashboard',
      'read', false,
      'createdAt', now_text,
      'updatedAt', now_text
    ),
    now()
  ) on conflict(id) do nothing;

  return jsonb_build_object(
    'approved', true,
    'student', active_data,
    'rosterMatchCount', match_count,
    'rosterAssigned', match_count = 1 and roster_assignment_failure is null,
    'rosterConflict', match_count > 1 or roster_assignment_failure is not null,
    'rosterAssignmentReason', roster_assignment_failure
  );
end;
$$;

revoke all on function public.approve_pending_student_account(text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.approve_pending_student_account(text, text, text, text)
  to service_role;
