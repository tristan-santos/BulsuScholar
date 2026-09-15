begin;

create or replace function public.guard_student_lifecycle_transitions()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user not in ('postgres', 'service_role')
    and coalesce(current_setting('bulsuscholar.choice_write', true), '') <> 'true' then
    new.data := (new.data
      - 'rosterDecisionPending'
      - 'rosterScholarshipChoice'
      - 'grantorArchiveChoice'
      - 'grantorArchiveChoiceHistory'
      - 'scholarshipCommitment'
      - 'scholarships')
      || case when old.data ? 'rosterDecisionPending' then jsonb_build_object('rosterDecisionPending', old.data->'rosterDecisionPending') else '{}'::jsonb end
      || case when old.data ? 'rosterScholarshipChoice' then jsonb_build_object('rosterScholarshipChoice', old.data->'rosterScholarshipChoice') else '{}'::jsonb end
      || case when old.data ? 'grantorArchiveChoice' then jsonb_build_object('grantorArchiveChoice', old.data->'grantorArchiveChoice') else '{}'::jsonb end
      || case when old.data ? 'grantorArchiveChoiceHistory' then jsonb_build_object('grantorArchiveChoiceHistory', old.data->'grantorArchiveChoiceHistory') else '{}'::jsonb end
      || case when old.data ? 'scholarshipCommitment' then jsonb_build_object('scholarshipCommitment', old.data->'scholarshipCommitment') else '{}'::jsonb end
      || case when old.data ? 'scholarships' then jsonb_build_object('scholarships', old.data->'scholarships') else '{}'::jsonb end;
  end if;
  return new;
end;
$$;

drop trigger if exists student_lifecycle_transition_guard on public.students;
create trigger student_lifecycle_transition_guard
before update on public.students
for each row execute function public.guard_student_lifecycle_transitions();

create or replace function public.promote_email_confirmed_student(
  p_student_id text,
  p_auth_user_id text,
  p_email text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  pending_data jsonb;
  active_data jsonb;
  matches jsonb := '[]'::jsonb;
  now_text text := now()::text;
begin
  perform pg_advisory_xact_lock(hashtext('student:' || p_student_id));
  select data into active_data from public.students where id = p_student_id for update;
  if found then
    if active_data->>'authUserId' is distinct from p_auth_user_id then
      raise exception 'confirmed_identity_mismatch';
    end if;
    return jsonb_build_object('alreadyActive', true, 'student', active_data);
  end if;

  select data into pending_data from public.pending_students where id = p_student_id for update;
  if not found then raise exception 'pending_student_not_found'; end if;
  if lower(coalesce(pending_data->>'email', '')) <> lower(coalesce(p_email, ''))
    or pending_data->>'authUserId' is distinct from p_auth_user_id then
    raise exception 'confirmed_identity_mismatch';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'rosterId', roster.id,
    'grantorId', roster.parent_id,
    'grantorName', coalesce(roster.data->>'grantorName', roster.data->>'provider', ''),
    'scholarshipName', coalesce(roster.data->>'scholarshipName', roster.data->>'scholarshipTitle', ''),
    'providerType', coalesce(roster.data->>'providerType', ''),
    'applicationNumber', coalesce(roster.data->>'applicationNumber', roster.data->>'requestNumber', '')
  ) order by roster.parent_id, roster.id), '[]'::jsonb)
  into matches
  from public.grantor_portal_scholars roster
  where coalesce(roster.data->>'studentId', roster.data->>'studentnumber', roster.data->>'studentNumber') = p_student_id
    and lower(coalesce(roster.data->>'archived', 'false')) <> 'true'
    and lower(coalesce(roster.data->>'status', 'active')) not in ('archived', 'rejected', 'declined', 'withdrawn');

  active_data := pending_data || jsonb_build_object(
	'scholarshipLifecycleVersion', 2,
    'isPending', false,
    'isValidated', true,
    'validatedAt', now_text,
    'emailConfirmedAt', now_text,
    'rosterDecisionPending', jsonb_array_length(matches) > 0,
    'rosterScholarshipChoice', case when jsonb_array_length(matches) > 0 then jsonb_build_object(
      'status', 'pending', 'matches', matches, 'createdAt', now_text, 'updatedAt', now_text
    ) else jsonb_build_object('status', 'resolved', 'matches', '[]'::jsonb, 'resolvedAt', now_text) end,
    'updatedAt', now_text
  );
  insert into public.students(id, data, updated_at) values(p_student_id, active_data, now())
  on conflict(id) do update set data = excluded.data, updated_at = excluded.updated_at;
  delete from public.pending_students where id = p_student_id;

  insert into public."studentNotifications"(id, data, updated_at)
  values('email_confirmed_' || p_student_id, jsonb_build_object(
    'studentId', p_student_id, 'type', 'account_confirmed', 'title', 'Account Ready',
    'message', case when jsonb_array_length(matches) > 0
      then 'Your email is confirmed. Review the scholarship roster record shown in your dashboard.'
      else 'Your email is confirmed. Your student dashboard is ready.' end,
    'route', '/student-dashboard', 'read', false, 'createdAt', now_text, 'updatedAt', now_text
  ), now()) on conflict(id) do nothing;
  insert into public."systemLogs"(id, data, updated_at)
  values('student_confirmed_' || p_student_id, jsonb_build_object(
    'studentId', p_student_id, 'type', 'student_account_confirmed', 'title', 'Student Account Confirmed',
    'message', 'A student confirmed their email and activated their dashboard account.',
    'route', '/admin/students', 'read', false, 'createdAt', now_text, 'updatedAt', now_text,
    'notificationFallbackTable', 'adminNotifications', 'action', 'student_account_confirmed', 'actorType', 'system'
  ), now()) on conflict(id) do nothing;

  return jsonb_build_object('promoted', true, 'student', active_data, 'rosterMatches', matches);
end;
$$;

create or replace function public.resolve_student_roster_scholarship(
  p_student_id text,
  p_grantor_id text,
  p_roster_id text,
  p_action text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  student_data jsonb;
  choice_data jsonb;
  roster_data jsonb;
  selected_match jsonb;
  remaining_matches jsonb := '[]'::jsonb;
  application_id text;
  scholarship_name text;
  provider_type text;
  apply_step text;
  tracking jsonb;
  scholarship_entry jsonb;
  final_student jsonb;
  now_text text := now()::text;
begin
  if p_action not in ('confirm', 'decline') then raise exception 'invalid_roster_decision'; end if;
  perform pg_advisory_xact_lock(hashtext('student:' || p_student_id));
  perform set_config('bulsuscholar.choice_write', 'true', true);
  select data into student_data from public.students where id = p_student_id for update;
  if not found then raise exception 'student_not_found'; end if;
  choice_data := student_data->'rosterScholarshipChoice';
  if p_action = 'confirm'
    and student_data#>>'{scholarshipCommitment,rosterId}' = p_roster_id
    and student_data#>>'{scholarshipCommitment,grantorId}' = p_grantor_id then
    select data into roster_data from public.scholarship_applications
      where id = student_data#>>'{scholarshipCommitment,applicationId}';
    return jsonb_build_object('decision', 'confirm', 'student', student_data,
      'application', roster_data, 'idempotent', true);
  end if;
  if p_action = 'decline'
    and choice_data->>'lastDecision' = 'decline'
    and choice_data->>'lastRosterId' = p_roster_id then
    return jsonb_build_object('decision', 'decline', 'student', student_data,
      'remainingMatches', coalesce(choice_data->'matches', '[]'::jsonb), 'idempotent', true);
  end if;
  if student_data->'scholarshipCommitment' is not null then raise exception 'scholarship_already_committed'; end if;
  if lower(coalesce(choice_data->>'status', '')) <> 'pending' then raise exception 'roster_decision_required'; end if;
  select roster_match into selected_match
  from jsonb_array_elements(coalesce(choice_data->'matches', '[]'::jsonb)) roster_match
  where roster_match->>'rosterId' = p_roster_id
    and roster_match->>'grantorId' = p_grantor_id
  limit 1;
  if selected_match is null then raise exception 'roster_match_not_found'; end if;
  select data into roster_data from public.grantor_portal_scholars
    where id = p_roster_id and parent_id = p_grantor_id for update;
  if not found or coalesce(roster_data->>'studentId', roster_data->>'studentnumber', roster_data->>'studentNumber') <> p_student_id
    or lower(coalesce(roster_data->>'archived', 'false')) = 'true' then raise exception 'roster_match_not_found'; end if;

  if p_action = 'decline' then
    update public.grantor_portal_scholars set data = data || jsonb_build_object(
      'archived', true, 'status', 'Archived', 'readOnly', true,
      'rosterDisputed', true, 'archiveReason', 'student_disputed_roster_identity',
      'disputedByStudentAt', now_text, 'updatedAt', now_text
    ), updated_at = now() where id = p_roster_id and parent_id = p_grantor_id;
    select coalesce(jsonb_agg(roster_match), '[]'::jsonb) into remaining_matches
      from jsonb_array_elements(coalesce(choice_data->'matches', '[]'::jsonb)) roster_match
      where not (roster_match->>'rosterId' = p_roster_id and roster_match->>'grantorId' = p_grantor_id);
    update public.students set data = data || jsonb_build_object(
      'rosterDecisionPending', jsonb_array_length(remaining_matches) > 0,
      'rosterScholarshipChoice', jsonb_build_object(
        'status', case when jsonb_array_length(remaining_matches) > 0 then 'pending' else 'resolved' end,
        'matches', remaining_matches, 'lastDecision', 'decline', 'lastRosterId', p_roster_id,
        'updatedAt', now_text, 'resolvedAt', case when jsonb_array_length(remaining_matches) = 0 then now_text else null end
      ), 'updatedAt', now_text
    ), updated_at = now() where id = p_student_id returning data into final_student;
    insert into public."grantorNotifications"(id, data, updated_at) values(
      'roster_disputed_' || p_grantor_id || '_' || p_roster_id,
      jsonb_build_object('grantorId', p_grantor_id, 'studentId', p_student_id, 'type', 'roster_record_disputed',
        'title', 'Roster Record Disputed', 'message', 'A student reported that this scholarship roster record does not belong to them.',
        'route', '/provider-dashboard/scholars', 'read', false, 'createdAt', now_text), now()
    ) on conflict(id) do nothing;
    insert into public."systemLogs"(id, data, updated_at) values(
      'roster_disputed_' || p_grantor_id || '_' || p_roster_id,
      jsonb_build_object('studentId', p_student_id, 'grantorId', p_grantor_id, 'type', 'roster_record_disputed',
        'title', 'Roster Record Disputed', 'message', 'A student declined a matched scholarship roster record. The original row is preserved as archived history.',
        'route', '/admin/scholarships', 'read', false, 'createdAt', now_text,
        'notificationFallbackTable', 'adminNotifications', 'action', 'roster_record_disputed', 'actorType', 'system'), now()
    ) on conflict(id) do nothing;
    return jsonb_build_object('decision', 'decline', 'student', final_student, 'remainingMatches', remaining_matches);
  end if;

  application_id := 'roster_' || md5(p_grantor_id || ':' || p_roster_id || ':' || p_student_id);
  scholarship_name := coalesce(roster_data->>'scholarshipName', roster_data->>'scholarshipTitle', selected_match->>'scholarshipName', 'Scholarship');
  provider_type := coalesce(roster_data->>'providerType', selected_match->>'providerType', 'private');
  apply_step := case when lower(provider_type) in ('kuya_win', 'kwsp') then 'kwsp_apply' else 'scholarship_apply' end;
  tracking := jsonb_build_object(
    'flowType', case when apply_step = 'kwsp_apply' then 'kwsp' else 'standard' end,
    'completedStepIds', jsonb_build_array('account', apply_step), 'lastCompletedStepId', apply_step,
    'updatedAt', now_text, 'history', jsonb_build_array(
      jsonb_build_object('stepId', 'account', 'label', 'Creation of Account', 'completedBy', 'system', 'completedAt', now_text),
      jsonb_build_object('stepId', apply_step, 'label', 'Application for ' || scholarship_name, 'completedBy', 'system', 'completedAt', now_text)
    )
  );
  scholarship_entry := jsonb_build_object(
    'id', application_id, 'applicationId', application_id, 'applicationNumber', coalesce(roster_data->>'applicationNumber', p_roster_id),
    'name', scholarship_name, 'scholarshipName', scholarship_name,
    'grantorId', p_grantor_id, 'grantorName', coalesce(roster_data->>'grantorName', roster_data->>'provider', ''),
    'providerType', provider_type, 'status', 'Applied', 'lifecycleVersion', 2,
    'source', 'confirmed_roster', 'rosterId', p_roster_id, 'rosterConfirmedAward', true,
    'withdrawalLocked', true, 'slotReserved', false, 'tracking', tracking,
    'createdAt', now_text, 'updatedAt', now_text
  );
  insert into public.scholarship_applications(id, data, updated_at) values(
    application_id,
    scholarship_entry || jsonb_build_object('studentId', p_student_id, 'fullName', coalesce(student_data->>'fullName', '')),
    now()
  ) on conflict(id) do update set data = excluded.data, updated_at = excluded.updated_at;
  update public.students set data = data || jsonb_build_object(
	'scholarshipLifecycleVersion', 2,
    'scholarships', coalesce(data->'scholarships', '[]'::jsonb) || jsonb_build_array(scholarship_entry),
    'scholarshipCommitment', jsonb_build_object(
      'applicationId', application_id, 'grantorId', p_grantor_id, 'scholarshipName', scholarship_name,
      'source', 'confirmed_roster', 'rosterId', p_roster_id, 'committedAt', now_text
    ),
    'rosterDecisionPending', false,
    'rosterScholarshipChoice', jsonb_build_object(
      'status', 'confirmed', 'selectedRosterId', p_roster_id, 'selectedGrantorId', p_grantor_id,
      'selectedApplicationId', application_id, 'resolvedAt', now_text, 'updatedAt', now_text
    ), 'updatedAt', now_text
  ), updated_at = now() where id = p_student_id returning data into final_student;
  update public.grantor_portal_scholars set data = data || jsonb_build_object(
    'applicationId', application_id, 'rosterConfirmed', true, 'rosterConfirmedAt', now_text,
    'status', 'Active', 'archived', false, 'readOnly', false, 'updatedAt', now_text
  ), updated_at = now() where id = p_roster_id and parent_id = p_grantor_id;
  update public.grantor_portal_scholars set data = data || jsonb_build_object(
    'rosterConflictReview', true, 'rosterConflictReason', 'another_roster_record_confirmed',
    'rosterConflictApplicationId', application_id, 'updatedAt', now_text
  ), updated_at = now()
  where coalesce(data->>'studentId', data->>'studentnumber', data->>'studentNumber') = p_student_id
    and not (id = p_roster_id and parent_id = p_grantor_id)
    and lower(coalesce(data->>'archived', 'false')) <> 'true';
  insert into public."studentNotifications"(id, data, updated_at) values(
    'roster_confirmed_' || application_id,
    jsonb_build_object('studentId', p_student_id, 'grantorId', p_grantor_id, 'applicationId', application_id,
      'type', 'roster_record_confirmed', 'title', 'Scholarship Record Confirmed',
      'message', scholarship_name || ' is now your active scholarship commitment.',
      'route', '/student-dashboard/scholarships', 'read', false, 'createdAt', now_text), now()
  ) on conflict(id) do nothing;
  return jsonb_build_object('decision', 'confirm', 'student', final_student, 'application', scholarship_entry);
end;
$$;

create or replace function public.confirm_grantor_admin_decision(
  p_grantor_id text,
  p_application_id text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  application_data jsonb;
  confirmation jsonb;
  tracking jsonb;
  completed_ids jsonb;
  next_status text;
  student_id text;
  decision text;
  step_id text;
  warning text := null;
  now_text text := now()::text;
  final_application jsonb;
begin
  perform pg_advisory_xact_lock(hashtext('application:' || p_application_id));
  perform set_config('bulsuscholar.choice_write', 'true', true);
  if exists(select 1 from public.grantor_portals where id = p_grantor_id and (
    lower(coalesce(data->>'archived', 'false')) = 'true'
    or lower(coalesce(data->>'disabled', 'false')) = 'true'
    or lower(coalesce(data->>'status', '')) in ('archived', 'disabled', 'inactive')
  )) then raise exception 'grantor_archived'; end if;
  if exists(select 1 from public.providers where id = p_grantor_id and (
    lower(coalesce(data->>'archived', 'false')) = 'true'
    or lower(coalesce(data->>'disabled', 'false')) = 'true'
    or lower(coalesce(data->>'status', '')) in ('archived', 'disabled', 'inactive')
  )) then raise exception 'grantor_archived'; end if;
  select data into application_data from public.scholarship_applications where id = p_application_id for update;
  if not found then raise exception 'application_not_found'; end if;
  if coalesce(application_data->>'grantorId', application_data->>'providerId') <> p_grantor_id then
    raise exception 'portal_record_owner_mismatch';
  end if;
  confirmation := application_data->'decisionConfirmation';
  if lower(coalesce(confirmation->>'status', '')) <> 'pending' then
    if nullif(application_data->>'grantorConfirmationResolvedAt', '') is not null
      and nullif(application_data->>'grantorConfirmationDecision', '') is not null then
      return jsonb_build_object('application', application_data,
        'decision', application_data->>'grantorConfirmationDecision', 'idempotent', true, 'warning', null);
    end if;
    raise exception 'grantor_confirmation_not_pending';
  end if;
  decision := lower(coalesce(confirmation->>'decision', ''));
  step_id := confirmation->>'stepId';
  student_id := coalesce(application_data->>'studentId', confirmation->>'studentId');
  if decision not in ('approve', 'reject') or coalesce(step_id, '') = '' then raise exception 'grantor_confirmation_stale'; end if;
  tracking := coalesce(application_data->'tracking', '{}'::jsonb);
  completed_ids := coalesce(tracking->'completedStepIds', '[]'::jsonb);
  if completed_ids ? step_id then
    raise exception 'grantor_confirmation_stale';
  end if;

  if decision = 'approve' then
    completed_ids := completed_ids || to_jsonb(step_id);
    tracking := tracking || jsonb_build_object(
      'completedStepIds', completed_ids, 'lastCompletedStepId', step_id, 'updatedAt', now_text,
      'history', coalesce(tracking->'history', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
        'stepId', step_id, 'label', coalesce(confirmation->>'stepLabel', step_id),
        'completedBy', 'grantor', 'completedAt', now_text
      ))
    );
    next_status := 'In Progress';
    update public.scholarship_applications set data = (data - 'decisionConfirmation') || jsonb_build_object(
      'status', next_status, 'tracking', tracking, 'grantorConfirmationPending', false,
      'grantorConfirmationDecision', decision, 'grantorConfirmationResolvedAt', now_text,
      'updatedAt', now_text
    ), updated_at = now() where id = p_application_id returning data into final_application;
    update public.students set data = jsonb_set(data, '{scholarships}', coalesce((
      select jsonb_agg(case when entry->>'applicationId' = p_application_id or entry->>'id' = p_application_id
        then entry || jsonb_build_object('status', next_status, 'tracking', tracking, 'updatedAt', now_text)
        else entry end order by ordinal)
      from jsonb_array_elements(coalesce(data->'scholarships', '[]'::jsonb)) with ordinality scholarship(entry, ordinal)
    ), '[]'::jsonb), true) || jsonb_build_object('updatedAt', now_text), updated_at = now() where id = student_id;
  else
    perform public.release_scholarship_slot_before_choice(p_application_id, jsonb_build_object(
      'status', 'Rejected', 'archived', true, 'readOnly', true, 'rejectedAt', now_text,
      'rejectionReason', coalesce(confirmation->>'reason', 'Administrator decision'),
      'rejectionNotes', coalesce(confirmation->>'notes', ''), 'closureReason', 'application_rejected',
      'decisionConfirmation', null, 'grantorConfirmationPending', false,
      'grantorConfirmationDecision', decision, 'grantorConfirmationResolvedAt', now_text, 'updatedAt', now_text
    ));
    select data into final_application from public.scholarship_applications where id = p_application_id;
    update public.students set data = jsonb_set(data, '{scholarships}', coalesce((
      select jsonb_agg(case when entry->>'applicationId' = p_application_id or entry->>'id' = p_application_id
        then entry || jsonb_build_object('status', 'Rejected', 'archived', true, 'readOnly', true,
          'rejectedAt', now_text, 'rejectionReason', coalesce(confirmation->>'reason', 'Administrator decision'),
          'rejectionNotes', coalesce(confirmation->>'notes', ''), 'closureReason', 'application_rejected', 'updatedAt', now_text)
        else entry end order by ordinal)
      from jsonb_array_elements(coalesce(data->'scholarships', '[]'::jsonb)) with ordinality scholarship(entry, ordinal)
    ), '[]'::jsonb), true) || jsonb_build_object('updatedAt', now_text), updated_at = now() where id = student_id;
  end if;

  begin
    insert into public."studentNotifications"(id, data, updated_at) values(
      'grantor_decision_' || p_application_id || '_' || step_id || '_' || decision,
      jsonb_build_object('studentId', student_id, 'grantorId', p_grantor_id, 'applicationId', p_application_id,
        'type', 'application_confirmation_resolved',
        'title', case when decision = 'approve' then coalesce(confirmation->>'stepLabel', 'Application Stage') || ' Completed' else 'Application Rejected' end,
        'message', case when decision = 'approve' then 'The grantor confirmed the administrator decision. Your application can continue.' else 'The grantor confirmed the application rejection.' end,
        'route', '/student-dashboard/scholarships', 'read', false, 'createdAt', now_text), now()
    ) on conflict(id) do nothing;
    insert into public."systemLogs"(id, data, updated_at) values(
      'grantor_decision_' || p_application_id || '_' || step_id || '_' || decision,
      jsonb_build_object('studentId', student_id, 'grantorId', p_grantor_id, 'applicationId', p_application_id,
        'type', 'application_confirmation_resolved', 'title', 'Grantor Confirmed Decision',
        'message', 'The grantor confirmed the stored administrator decision.',
        'route', '/admin/scholarships', 'read', false, 'createdAt', now_text,
        'notificationFallbackTable', 'adminNotifications', 'action', 'application_confirmation_resolved', 'actorType', 'grantor'), now()
    ) on conflict(id) do nothing;
  exception when others then
    warning := 'notification_delivery_unconfirmed';
  end;
  return jsonb_build_object('application', final_application, 'decision', decision, 'stepId', step_id,
    'idempotent', false, 'warning', warning);
end;
$$;

revoke all on function public.promote_email_confirmed_student(text, text, text) from public, anon, authenticated;
revoke all on function public.resolve_student_roster_scholarship(text, text, text, text) from public, anon, authenticated;
revoke all on function public.confirm_grantor_admin_decision(text, text) from public, anon, authenticated;
grant execute on function public.promote_email_confirmed_student(text, text, text) to service_role;
grant execute on function public.resolve_student_roster_scholarship(text, text, text, text) to service_role;
grant execute on function public.confirm_grantor_admin_decision(text, text) to service_role;

commit;
