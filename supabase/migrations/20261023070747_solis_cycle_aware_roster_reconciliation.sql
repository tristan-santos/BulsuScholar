begin;

create or replace function public.roster_cycle(p_data jsonb)
returns text language sql immutable set search_path = '' as $$
  select upper(coalesce(nullif(trim(p_data->>'academicCycle'), ''), nullif(trim(p_data->>'semesterTag'), ''), ''));
$$;

create or replace function public.roster_current_cycle()
returns text language plpgsql stable security invoker set search_path = '' as $$
declare cycle text;
begin
  select coalesce(nullif(data->>'semesterTag', ''), (data->>'academicYear') || '-' || (data->>'semester'))
    into cycle from public.system_configuration where id = 'academic_cycle';
  if cycle is null or cycle !~ '^\d{4}-\d{4}-(1ST|2ND|SUMMER)$' then
    raise exception 'academic_cycle_unavailable';
  end if;
  return cycle;
end;
$$;

create or replace function public.roster_name_key(p_name text)
returns text language sql immutable set search_path = '' as $$
  select trim(regexp_replace(lower(coalesce(p_name, '')), '[^a-z0-9]+', ' ', 'g'));
$$;

create or replace function public.roster_record_active(p_data jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(p_data->>'archived', 'false') <> 'true'
    and coalesce(p_data->>'rejected', 'false') <> 'true'
    and lower(trim(coalesce(p_data->>'status', 'active'))) not in
      ('archived', 'rejected', 'declined', 'withdrawn', 'inactive', 'cancelled', 'canceled', 'terminated', 'expired');
$$;

create or replace function public.roster_application_awarded(p_data jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select public.roster_record_active(p_data) and (
    coalesce(p_data->>'rosterConfirmedAward', 'false') = 'true'
    or coalesce(p_data->>'withdrawalLocked', 'false') = 'true'
    or coalesce(p_data->>'isLocked', 'false') = 'true'
    or nullif(p_data->>'requestedSoeAt', '') is not null
    or lower(trim(coalesce(p_data->>'status', ''))) in ('active', 'accepted', 'approved', 'awarded', 'finished', 'completed', 'finalized', 'protected'));
$$;

create or replace function public.save_grantor_profile_policy(
  p_grantor_id text, p_classification text, p_grantor_type text, p_name text,
  p_enabled boolean, p_locations jsonb, p_actor_id text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare result jsonb; previous_type text;
begin
  if not exists(select 1 from public.admins where id = p_actor_id and data->>'role' = 'full_admin') then
    raise exception 'full_admin_required';
  end if;
  if p_grantor_type is null or p_grantor_type not in ('internal', 'external') then raise exception 'invalid_grantor_type'; end if;
  select coalesce(data->>'grantorType', 'internal') into previous_type from public.providers where id = p_grantor_id for update;
  if not found then raise exception 'grantor_not_found'; end if;
  result := public.save_grantor_scope_policy_v3(p_grantor_id, p_classification, p_name, p_enabled, p_locations, p_actor_id);
  update public.providers set data = data || jsonb_build_object('grantorType', p_grantor_type), updated_at = now() where id = p_grantor_id;
  update public.grantor_portals set data = data || jsonb_build_object('grantorType', p_grantor_type), updated_at = now() where id = p_grantor_id;
  if previous_type is distinct from p_grantor_type then
    insert into public.roster_import_audit_events(id, data) values ('grantor_type_' || gen_random_uuid()::text,
      jsonb_build_object('action', 'grantor_type_changed', 'grantorId', p_grantor_id,
        'previousType', previous_type, 'grantorType', p_grantor_type, 'actorId', p_actor_id,
        'actorType', 'admin', 'createdAt', now()::text));
  end if;
  return result || jsonb_build_object('grantorType', p_grantor_type);
end;
$$;

create or replace function public.assign_authoritative_roster_scholarship(
  p_student_id text, p_grantor_id text, p_roster_id text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  student_data jsonb; roster_data jsonb; state_data jsonb; application_data jsonb;
  application_id text; cycle text; commitment_id text; commitment_data jsonb;
  target_scholarship_id text; scholarship_name text; existing_id text; competitor record;
  closed_ids text[] := '{}'; now_text text := now()::text; previous_choice text;
begin
  perform pg_advisory_xact_lock(734821, 1);
  perform pg_advisory_xact_lock(hashtext('student:' || p_student_id));
  cycle := public.roster_current_cycle();
  select data into student_data from public.students where id = p_student_id for update;
  if not found then raise exception 'student_not_found'; end if;
  if not public.roster_record_active(student_data) or student_data->>'disabled' = 'true'
    or student_data->>'adminBlocked' = 'true' or student_data->>'isPending' = 'true'
    or lower(coalesce(student_data->>'status', '')) in ('blocked', 'disabled', 'pending') then
    raise exception 'student_account_blocked';
  end if;
  select data into roster_data from public.grantor_portal_scholars where id = p_roster_id and parent_id = p_grantor_id for update;
  if not found or coalesce(roster_data->>'studentId', roster_data->>'studentnumber', roster_data->>'studentNumber', '') <> p_student_id
    or not public.roster_record_active(roster_data) then raise exception 'roster_match_not_found'; end if;
  -- Untagged legacy rows require staff verification; never guess their semester.
  if public.roster_cycle(roster_data) <> cycle then raise exception 'roster_cycle_requires_verification'; end if;
  if public.roster_name_key(coalesce(roster_data->>'fullName', concat_ws(' ', roster_data->>'fname', roster_data->>'mname', roster_data->>'lname'))) = ''
    or public.roster_name_key(coalesce(roster_data->>'fullName', concat_ws(' ', roster_data->>'fname', roster_data->>'mname', roster_data->>'lname')))
      <> public.roster_name_key(coalesce(student_data->>'fullName', concat_ws(' ', student_data->>'fname', student_data->>'mname', student_data->>'lname'))) then
    raise exception 'roster_identity_mismatch';
  end if;
  target_scholarship_id := coalesce(nullif(roster_data->>'scholarshipId', ''), roster_data->>'announcementId');
  scholarship_name := coalesce(roster_data->>'scholarshipTitle', roster_data->>'scholarshipName', 'Scholarship');
  if exists(select 1 from public.grantor_portal_scholars where id <> p_roster_id
    and coalesce(data->>'studentId', data->>'studentnumber', data->>'studentNumber') = p_student_id
    and public.roster_record_active(data) and public.roster_cycle(data) in ('', cycle)) then
    raise exception 'scholarship_already_committed';
  end if;
  select id, data into existing_id, application_data from public.scholarship_applications
    where data->>'studentId' = p_student_id and public.roster_cycle(data) = cycle
      and coalesce(data->>'grantorId', data->>'providerId') = p_grantor_id
      and coalesce(data->>'announcementId', data->>'scholarshipId') = target_scholarship_id
      and public.scholarship_application_open(data) and public.roster_record_active(data)
    order by case when data->>'source' = 'authoritative_roster' then 0 else 1 end, updated_at desc limit 1 for update;
  application_id := coalesce(existing_id, 'roster_' || md5(p_grantor_id || ':' || p_roster_id || ':' || p_student_id || ':' || cycle));
  select data into state_data from public.student_scholarship_state where student_id = p_student_id for update;
  if not found then state_data := jsonb_strip_nulls(jsonb_build_object(
    'scholarshipCommitment', student_data->'scholarshipCommitment', 'scholarshipLifecycleVersion', 2)); end if;
  commitment_id := nullif(state_data#>>'{scholarshipCommitment,applicationId}', '');
  if commitment_id is not null and commitment_id <> application_id then
    select data into commitment_data from public.scholarship_applications where id = commitment_id;
    if (commitment_data is null and public.roster_cycle(state_data->'scholarshipCommitment') in ('', cycle))
      or (commitment_data is not null and public.roster_cycle(commitment_data) in ('', cycle)
        and public.roster_record_active(commitment_data)) then raise exception 'scholarship_already_committed'; end if;
  end if;
  if exists(select 1 from public.scholarship_applications where data->>'studentId' = p_student_id and id <> application_id
    and public.roster_cycle(data) in ('', cycle) and public.roster_application_awarded(data)) then
    raise exception 'scholarship_already_committed';
  end if;
  if state_data#>>'{scholarshipCommitment,applicationId}' = application_id
    and application_data->>'source' = 'authoritative_roster' and application_data->>'rosterId' = p_roster_id then
    return jsonb_build_object('idempotent', true, 'applicationId', application_id, 'application', application_data,
      'student', student_data || state_data, 'closedApplicationIds', '[]'::jsonb);
  end if;
  -- An existing award survives grantor archival under office management, but
  -- an inactive provider/program cannot authorize a new assignment.
  if not exists(select 1 from public.grantor_portal_announcements where parent_id = p_grantor_id
    and (id = target_scholarship_id or data->>'programId' = target_scholarship_id or data->>'scholarshipId' = target_scholarship_id)
    and public.roster_record_active(data)) then raise exception 'roster_scholarship_not_recognized'; end if;
  if not exists(select 1 from public.providers where id = p_grantor_id and public.roster_record_active(data)) then
    raise exception 'roster_match_not_found';
  end if;
  previous_choice := coalesce(current_setting('bulsuscholar.choice_write', true), '');
  perform set_config('bulsuscholar.choice_write', 'true', true);
  if existing_id is not null and application_data->>'slotReserved' = 'true' and nullif(application_data->>'slotReleasedAt', '') is null then
    perform public.release_scholarship_slot_before_choice(application_id, jsonb_build_object('conversionSource', 'authoritative_roster'));
    select data into application_data from public.scholarship_applications where id = application_id;
  end if;
  application_data := coalesce(application_data, '{}'::jsonb) || jsonb_build_object(
    'id', application_id, 'applicationId', application_id, 'studentId', p_student_id,
    'applicationNumber', coalesce(application_data->>'applicationNumber', roster_data->>'applicationNumber', p_roster_id),
    'name', scholarship_name, 'scholarshipName', scholarship_name, 'scholarshipId', target_scholarship_id,
    'announcementId', target_scholarship_id, 'grantorId', p_grantor_id,
    'grantorName', coalesce(roster_data->>'grantorName', roster_data->>'provider', ''),
    'providerType', coalesce(roster_data->>'providerType', 'private'),
    'academicCycle', cycle, 'semesterTag', cycle,
    'status', case when public.roster_application_awarded(coalesce(application_data, '{}'))
      then application_data->>'status' else 'Awaiting Documents' end, 'lifecycleVersion', 2,
    'source', 'authoritative_roster', 'rosterId', p_roster_id, 'rosterConfirmedAward', true,
    'withdrawalLocked', true, 'slotReserved', false,
    'tracking', coalesce(application_data->'tracking', public.authoritative_roster_tracking(coalesce(roster_data->>'providerType', 'private'), scholarship_name, false)),
    'createdAt', coalesce(application_data->>'createdAt', now_text), 'updatedAt', now_text);
  insert into public.scholarship_applications(id, data, updated_at) values(application_id, application_data, now())
    on conflict(id) do update set data = excluded.data, updated_at = now();
  for competitor in select id, data from public.scholarship_applications
    where data->>'studentId' = p_student_id and id <> application_id and public.roster_cycle(data) = cycle
      and public.scholarship_application_open(data) and public.roster_record_active(data) and not public.roster_application_awarded(data) order by id for update
  loop
    perform public.release_scholarship_slot_before_choice(competitor.id, jsonb_build_object(
      'archived', true, 'status', 'Archived', 'readOnly', true, 'closureReason', 'authoritative_roster_assignment',
      'closureMessage', 'Closed because an official roster confirmed another scholarship.', 'closedAt', now_text, 'updatedAt', now_text));
    closed_ids := array_append(closed_ids, competitor.id);
  end loop;
  state_data := (coalesce(state_data, '{}') - 'scholarships' - 'scholarshipApplicationHistory' - 'rosterDecisionPending' - 'rosterScholarshipChoice')
    || jsonb_build_object('scholarshipLifecycleVersion', 2,
      'rosterAssignmentState', jsonb_build_object('status', 'assigned', 'academicCycle', cycle, 'rosterId', p_roster_id, 'applicationId', application_id, 'grantorId', p_grantor_id, 'assignedAt', now_text),
      'scholarshipCommitment', jsonb_build_object('applicationId', application_id, 'applicationNumber', application_data->>'applicationNumber',
        'grantorId', p_grantor_id, 'scholarshipId', target_scholarship_id, 'scholarshipName', scholarship_name,
        'academicCycle', cycle, 'source', 'authoritative_roster', 'rosterId', p_roster_id, 'withdrawalLocked', true, 'committedAt', now_text));
  insert into public.student_scholarship_state(id, student_id, data, updated_at) values(p_student_id, p_student_id, state_data, now())
    on conflict(student_id) do update set data = excluded.data, updated_at = now();
  update public.grantor_portal_scholars set data = data || jsonb_build_object('applicationId', application_id,
    'applicationNumber', application_data->>'applicationNumber', 'rosterConfirmed', true,
    'rosterConfirmedAt', coalesce(data->>'rosterConfirmedAt', now_text), 'updatedAt', now_text), updated_at = now() where id = p_roster_id;
  insert into public."studentNotifications"(id, data, updated_at) values('authoritative_roster_assigned_' || application_id,
    jsonb_build_object('studentId', p_student_id, 'applicationId', application_id, 'type', 'authoritative_roster_assigned',
      'title', 'Scholarship Assigned', 'message', scholarship_name || ' was assigned from the official scholar roster.',
      'route', '/student-dashboard/scholarships', 'read', false, 'createdAt', now_text), now()) on conflict(id) do nothing;
  insert into public.roster_import_audit_events(id, data) values('roster_assignment_' || application_id,
    jsonb_build_object('studentId', p_student_id, 'applicationId', application_id, 'academicCycle', cycle,
      'grantorId', p_grantor_id, 'rosterId', p_roster_id, 'action', 'roster_assigned', 'actorType', 'system',
      'closedApplicationIds', to_jsonb(closed_ids), 'createdAt', now_text)) on conflict(id) do nothing;
  application_data := public.complete_authoritative_roster_application(p_student_id, application_id);
  perform set_config('bulsuscholar.choice_write', previous_choice, true);
  return jsonb_build_object('idempotent', false, 'student', student_data || state_data, 'application', application_data,
    'applicationId', application_id, 'convertedExistingApplication', existing_id is not null, 'closedApplicationIds', to_jsonb(closed_ids));
end;
$$;

create or replace function public.reconcile_student_roster(p_student_id text, p_source text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare cycle text; student_data jsonb; state_data jsonb; roster record; matches integer; assignment jsonb;
  reason text; conflict_id text; first_conflict text; conflict_data jsonb; candidate jsonb;
begin
  if p_source is null or p_source not in ('verified_login', 'account_activation', 'import') then raise exception 'invalid_reconciliation_source'; end if;
  perform pg_advisory_xact_lock(734821, 1);
  perform pg_advisory_xact_lock(hashtext('student:' || p_student_id));
  cycle := public.roster_current_cycle();
  select data into student_data from public.students where id = p_student_id for update;
  if not found then raise exception 'student_not_found'; end if;
  if not public.roster_record_active(student_data) or student_data->>'isPending' = 'true'
    or student_data->>'disabled' = 'true' or student_data->>'adminBlocked' = 'true'
    or lower(coalesce(student_data->>'status', '')) in ('blocked', 'disabled', 'pending') then
    raise exception 'student_account_blocked';
  end if;
  select count(*) into matches from public.grantor_portal_scholars
    where coalesce(data->>'studentId', data->>'studentnumber', data->>'studentNumber') = p_student_id
      and public.roster_record_active(data) and public.roster_cycle(data) in ('', cycle);
  if matches = 0 then return jsonb_build_object('status', 'none', 'academicCycle', cycle); end if;
  if matches = 1 then
    select id, parent_id, data into roster from public.grantor_portal_scholars
      where coalesce(data->>'studentId', data->>'studentnumber', data->>'studentNumber') = p_student_id
        and public.roster_record_active(data) and public.roster_cycle(data) in ('', cycle);
    begin
      assignment := public.assign_authoritative_roster_scholarship(p_student_id, roster.parent_id, roster.id);
      return assignment || jsonb_build_object('status', 'assigned', 'academicCycle', cycle);
    exception when others then
      if sqlerrm not in ('roster_identity_mismatch', 'roster_cycle_requires_verification', 'roster_scholarship_not_recognized',
        'roster_match_not_found', 'scholarship_already_committed') then raise; end if;
      reason := sqlerrm;
    end;
  else reason := 'conflicting_active_roster'; end if;
  for roster in select id, parent_id, data from public.grantor_portal_scholars
    where coalesce(data->>'studentId', data->>'studentnumber', data->>'studentNumber') = p_student_id
      and public.roster_record_active(data) and public.roster_cycle(data) in ('', cycle) order by id
  loop
    conflict_id := 'roster_reconcile_' || md5(p_student_id || ':' || cycle || ':' || roster.id);
    first_conflict := coalesce(first_conflict, conflict_id);
    candidate := jsonb_build_object('rosterId', roster.id, 'grantorId', roster.parent_id,
      'scholarshipId', roster.data->>'scholarshipId', 'scholarshipTitle', coalesce(roster.data->>'scholarshipTitle', roster.data->>'scholarshipName'),
      'academicCycle', cycle, 'rosterData', roster.data);
    conflict_data := jsonb_build_object('status', 'open', 'studentId', p_student_id,
      'fullName', coalesce(student_data->>'fullName', concat_ws(' ', student_data->>'fname', student_data->>'mname', student_data->>'lname')),
      'academicCycle', cycle, 'reason', reason, 'disposition', reason, 'candidate', candidate,
      'source', p_source, 'createdAt', now()::text, 'updatedAt', now()::text);
    insert into public.roster_assignment_conflicts(id, data) values(conflict_id, conflict_data) on conflict(id) do nothing;
    insert into public.roster_import_audit_events(id, data) values(conflict_id,
      jsonb_build_object('action', 'roster_conflict_detected', 'studentId', p_student_id, 'academicCycle', cycle,
        'rosterId', roster.id, 'reason', reason, 'source', p_source, 'actorType', 'system', 'createdAt', now()::text)) on conflict(id) do nothing;
  end loop;
  select data into state_data from public.student_scholarship_state where student_id = p_student_id;
  insert into public.student_scholarship_state(id, student_id, data, updated_at)
    values(p_student_id, p_student_id, coalesce(state_data, '{}') || jsonb_build_object('scholarshipLifecycleVersion', 2,
      'rosterAssignmentState', jsonb_build_object('status', 'conflict', 'academicCycle', cycle,
        'reason', reason, 'conflictId', first_conflict, 'matchCount', matches)), now())
    on conflict(student_id) do update set data = excluded.data, updated_at = now();
  return jsonb_build_object('status', 'conflict', 'reason', reason, 'academicCycle', cycle, 'matchCount', matches);
end;
$$;

create or replace function public.commit_roster_import_batch(p_batch_id text, p_actor_type text, p_actor_id text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare batch_data jsonb; import_row record; row_data jsonb; roster_data jsonb; roster_id text;
  assignment jsonb; cycle text; previous_choice text;
  counts jsonb := '{"created":0,"assigned":0,"converted":0,"waitingForAccount":0,"alreadyImported":0}';
begin
  perform pg_advisory_xact_lock(734821, 1);
  cycle := public.roster_current_cycle();
  select data into batch_data from public.roster_import_batches where id = p_batch_id for update;
  if not found then raise exception 'roster_import_batch_not_found'; end if;
  if batch_data->>'actorType' is distinct from p_actor_type or batch_data->>'actorId' is distinct from p_actor_id then
    raise exception 'roster_import_batch_owner_mismatch'; end if;
  if batch_data->>'status' = 'committed' then return jsonb_build_object('idempotent', true, 'batchId', p_batch_id, 'counts', batch_data->'commitCounts'); end if;
  if batch_data->>'status' <> 'ready' or exists(select 1 from public.roster_import_rows where parent_id = p_batch_id and data->>'blocking' = 'true') then
    raise exception 'roster_import_has_blocking_errors'; end if;
  previous_choice := coalesce(current_setting('bulsuscholar.choice_write', true), '');
  perform set_config('bulsuscholar.choice_write', 'true', true);
  for import_row in select id, data from public.roster_import_rows where parent_id = p_batch_id order by id for update
  loop
    row_data := import_row.data;
    if public.roster_cycle(row_data) <> cycle then raise exception 'academic_cycle_changed'; end if;
    if p_actor_type = 'grantor' and row_data->>'grantorId' is distinct from p_actor_id then raise exception 'roster_import_batch_owner_mismatch'; end if;
    if nullif(trim(row_data->>'studentId'), '') is null or nullif(trim(row_data->>'fullName'), '') is null then raise exception 'invalid_roster_identity'; end if;
    if not exists(select 1 from public.providers where id = row_data->>'grantorId' and public.roster_record_active(data)) then raise exception 'grantor_archived'; end if;
    if not exists(select 1 from public.grantor_portal_announcements where parent_id = row_data->>'grantorId'
      and id = row_data->>'scholarshipId' and public.roster_record_active(data)) then raise exception 'roster_scholarship_not_recognized'; end if;
    select id into roster_id from public.grantor_portal_scholars where parent_id = row_data->>'grantorId'
      and coalesce(data->>'studentId', data->>'studentnumber', data->>'studentNumber') = row_data->>'studentId'
      and data->>'scholarshipId' = row_data->>'scholarshipId' and public.roster_cycle(data) = cycle and public.roster_record_active(data)
      order by id limit 1 for update;
    if roster_id is not null then
      counts := jsonb_set(counts, '{alreadyImported}', to_jsonb((counts->>'alreadyImported')::integer + 1));
    else
      if exists(select 1 from public.grantor_portal_scholars
        where coalesce(data->>'studentId', data->>'studentnumber', data->>'studentNumber') = row_data->>'studentId'
        and public.roster_record_active(data) and public.roster_cycle(data) in ('', cycle)) then raise exception 'scholarship_already_committed'; end if;
      roster_id := 'roster_' || md5((row_data->>'grantorId') || ':' || (row_data->>'scholarshipId') || ':' || (row_data->>'studentId') || ':' || cycle);
      roster_data := coalesce(row_data->'rosterData', '{}') || jsonb_build_object(
        'studentId', row_data->>'studentId', 'fullName', row_data->>'fullName', 'grantorId', row_data->>'grantorId',
        'scholarshipId', row_data->>'scholarshipId', 'announcementId', row_data->>'scholarshipId',
        'scholarshipTitle', row_data->>'scholarshipTitle', 'scholarshipName', row_data->>'scholarshipTitle',
        'providerType', row_data->>'providerType', 'academicCycle', cycle, 'semesterTag', cycle,
        'source', 'authoritative_roster', 'importBatchId', p_batch_id, 'importRowId', import_row.id,
        'status', 'Active', 'archived', false, 'createdAt', now()::text);
      -- An archived deterministic ID is history, not a row to overwrite.
      if exists(select 1 from public.grantor_portal_scholars where id = roster_id) then
        roster_id := roster_id || '_' || md5(p_batch_id);
      end if;
      insert into public.grantor_portal_scholars(id, parent_id, data, updated_at) values(roster_id, row_data->>'grantorId', roster_data, now());
      counts := jsonb_set(counts, '{created}', to_jsonb((counts->>'created')::integer + 1));
    end if;
    assignment := '{}';
    if exists(select 1 from public.students where id = row_data->>'studentId') then
      assignment := public.assign_authoritative_roster_scholarship(row_data->>'studentId', row_data->>'grantorId', roster_id);
      counts := jsonb_set(counts, '{assigned}', to_jsonb((counts->>'assigned')::integer + 1));
      if assignment->>'convertedExistingApplication' = 'true' then
        counts := jsonb_set(counts, '{converted}', to_jsonb((counts->>'converted')::integer + 1)); end if;
    else counts := jsonb_set(counts, '{waitingForAccount}', to_jsonb((counts->>'waitingForAccount')::integer + 1)); end if;
    update public.roster_import_rows set data = data || jsonb_build_object('commitStatus', 'committed', 'rosterId', roster_id,
      'assignment', assignment, 'committedAt', now()::text), updated_at = now() where id = import_row.id;
    insert into public.roster_import_audit_events(id, data) values('roster_import_' || md5(p_batch_id || ':' || import_row.id),
      jsonb_build_object('action', 'roster_row_committed', 'batchId', p_batch_id, 'studentId', row_data->>'studentId',
        'grantorId', row_data->>'grantorId', 'academicCycle', cycle, 'actorType', p_actor_type, 'actorId', p_actor_id, 'createdAt', now()::text)) on conflict(id) do nothing;
  end loop;
  update public.roster_import_batches set data = data || jsonb_build_object('status', 'committed', 'commitCounts', counts, 'committedAt', now()::text), updated_at = now() where id = p_batch_id;
  perform set_config('bulsuscholar.choice_write', previous_choice, true);
  return jsonb_build_object('idempotent', false, 'batchId', p_batch_id, 'counts', counts);
end;
$$;

create or replace function public.resolve_roster_assignment_conflict_v2(
  p_conflict_id text, p_resolution text, p_selected_roster_id text, p_actor_id text, p_reason text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare conflict_data jsonb; candidate jsonb; target_student_id text; cycle text; selected_id text;
  selected_grantor text; selected_data jsonb; assignment jsonb; protected_id text; state_data jsonb;
  previous_choice text;
begin
  if not exists(select 1 from public.admins where id = p_actor_id and data->>'role' = 'full_admin') then raise exception 'full_admin_required'; end if;
  if length(trim(coalesce(p_reason, ''))) < 10 or length(p_reason) > 2000 then raise exception 'roster_resolution_reason_required'; end if;
  if p_resolution is null or p_resolution not in ('candidate', 'existing', 'keep_current') then raise exception 'invalid_roster_conflict_resolution'; end if;
  perform pg_advisory_xact_lock(734821, 1);
  select data into conflict_data from public.roster_assignment_conflicts where id = p_conflict_id for update;
  if not found then raise exception 'roster_conflict_not_found'; end if;
  if conflict_data->>'status' <> 'open' then return jsonb_build_object('idempotent', true, 'conflictId', p_conflict_id); end if;
  target_student_id := conflict_data->>'studentId'; cycle := public.roster_current_cycle(); candidate := conflict_data->'candidate';
  if public.roster_cycle(conflict_data) <> cycle then raise exception 'academic_cycle_changed'; end if;
  perform pg_advisory_xact_lock(hashtext('student:' || target_student_id));
  select data into state_data from public.student_scholarship_state where student_id = target_student_id;
  select id into protected_id from public.scholarship_applications a where a.data->>'studentId' = target_student_id
    and public.roster_cycle(a.data) in ('', cycle) and (public.roster_application_awarded(a.data)
      or (a.id = state_data#>>'{scholarshipCommitment,applicationId}' and public.roster_record_active(a.data))) order by id limit 1;
  previous_choice := coalesce(current_setting('bulsuscholar.choice_write', true), '');
  perform set_config('bulsuscholar.choice_write', 'true', true);
  if p_resolution = 'keep_current' then
    if protected_id is null then raise exception 'existing_award_required'; end if;
    select data->>'rosterId' into selected_id from public.scholarship_applications where id = protected_id;
  elsif p_resolution = 'candidate' then
    if protected_id is not null then raise exception 'existing_award_must_be_preserved'; end if;
    selected_grantor := candidate->>'grantorId';
    selected_id := coalesce(nullif(candidate->>'rosterId', ''), 'roster_' || md5(selected_grantor || ':' || (candidate->>'scholarshipId') || ':' || target_student_id || ':' || cycle));
    selected_data := coalesce(candidate->'rosterData', '{}') || jsonb_build_object('studentId', target_student_id,
      'fullName', coalesce(candidate->>'fullName', candidate#>>'{rosterData,fullName}'), 'grantorId', selected_grantor,
      'scholarshipId', candidate->>'scholarshipId', 'scholarshipTitle', candidate->>'scholarshipTitle',
      'academicCycle', cycle, 'semesterTag', cycle, 'source', 'authoritative_roster', 'status', 'Active', 'archived', false,
      'conflictResolutionId', p_conflict_id, 'identityVerifiedBy', p_actor_id, 'identityVerificationReason', p_reason);
    -- Staff resolution verifies the imported identity against the account; it never changes the student's identity.
    select data into state_data from public.students where id = target_student_id;
    if state_data is null then raise exception 'student_not_found'; end if;
    selected_data := selected_data || jsonb_build_object('fullName', coalesce(state_data->>'fullName', concat_ws(' ', state_data->>'fname', state_data->>'mname', state_data->>'lname')));
    insert into public.grantor_portal_scholars(id, parent_id, data, updated_at) values(selected_id, selected_grantor, selected_data, now())
      on conflict(id) do update set data = public.grantor_portal_scholars.data || excluded.data, updated_at = now();
  else
    select id, parent_id, data into selected_id, selected_grantor, selected_data from public.grantor_portal_scholars
      where id = p_selected_roster_id and coalesce(data->>'studentId', data->>'studentnumber', data->>'studentNumber') = target_student_id
        and public.roster_cycle(data) = cycle and public.roster_record_active(data) for update;
    if not found then raise exception 'selected_roster_not_found'; end if;
    if protected_id is not null and not exists(select 1 from public.scholarship_applications where id = protected_id and data->>'rosterId' = selected_id) then
      raise exception 'existing_award_must_be_preserved'; end if;
  end if;
  update public.grantor_portal_scholars r set data = r.data || jsonb_build_object('archived', true, 'readOnly', true,
    'status', 'Archived', 'archiveReason', 'roster_conflict_resolution', 'conflictResolutionId', p_conflict_id,
    'archivedAt', now()::text), updated_at = now()
    where coalesce(r.data->>'studentId', r.data->>'studentnumber', r.data->>'studentNumber') = target_student_id
      and r.id is distinct from selected_id and public.roster_record_active(r.data)
      and public.roster_cycle(r.data) in ('', cycle);
  if p_resolution <> 'keep_current' then
    assignment := public.assign_authoritative_roster_scholarship(target_student_id, selected_grantor, selected_id);
  else
    update public.student_scholarship_state s set data = s.data || jsonb_build_object('rosterAssignmentState',
      jsonb_build_object('status', 'assigned', 'academicCycle', cycle, 'applicationId', protected_id, 'resolvedBy', p_actor_id)), updated_at = now()
      where s.student_id = target_student_id;
    assignment := jsonb_build_object('applicationId', protected_id);
  end if;
  update public.roster_assignment_conflicts c set data = c.data || jsonb_build_object('status', 'resolved',
    'resolution', jsonb_build_object('mode', p_resolution, 'selectedRosterId', selected_id, 'reason', trim(p_reason),
      'resolvedBy', p_actor_id, 'resolvedAt', now()::text)), updated_at = now()
    where c.data->>'studentId' = target_student_id and public.roster_cycle(c.data) = cycle and c.data->>'status' = 'open';
  insert into public.roster_import_audit_events(id, data) values('roster_resolution_' || p_conflict_id,
    jsonb_build_object('action', 'roster_conflict_resolved', 'conflictId', p_conflict_id, 'studentId', target_student_id,
      'academicCycle', cycle, 'selectedRosterId', selected_id, 'preservedApplicationId', protected_id,
      'resolution', p_resolution, 'reason', trim(p_reason), 'actorType', 'admin', 'actorId', p_actor_id, 'createdAt', now()::text)) on conflict(id) do nothing;
  perform set_config('bulsuscholar.choice_write', previous_choice, true);
  return jsonb_build_object('idempotent', false, 'conflictId', p_conflict_id, 'selectedRosterId', selected_id, 'assignment', assignment);
end;
$$;

-- Account gating stays in the existing approval workflow. Roster assignment runs
-- only after email-confirmed promotion, in the same transaction as activation.
create or replace function public.approve_pending_student_account(
  p_student_id text, p_auth_user_id text, p_email text, p_admin_id text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare student_data jsonb; pending_data jsonb; assignment jsonb;
begin
  if nullif(trim(coalesce(p_admin_id, '')), '') is null then raise exception 'admin_identity_required'; end if;
  if nullif(trim(coalesce(p_student_id, '')), '') is null or nullif(trim(coalesce(p_auth_user_id, '')), '') is null
    or nullif(trim(coalesce(p_email, '')), '') is null then raise exception 'pending_student_identity_missing'; end if;
  perform pg_advisory_xact_lock(734821, 1);
  perform pg_advisory_xact_lock(hashtext('student:' || p_student_id));
  select data into student_data from public.students where id = p_student_id for update;
  if found then
    if student_data->>'authUserId' is distinct from p_auth_user_id or lower(coalesce(student_data->>'email', '')) <> lower(p_email) then
      raise exception 'confirmed_identity_mismatch'; end if;
    return jsonb_build_object('approved', true, 'alreadyActive', true, 'student', student_data);
  end if;
  select data into pending_data from public.pending_students where id = p_student_id for update;
  if not found then raise exception 'pending_student_not_found'; end if;
  if nullif(pending_data->>'emailConfirmedAt', '') is null then raise exception 'student_email_not_confirmed'; end if;
  if pending_data->>'authUserId' is distinct from p_auth_user_id or lower(coalesce(pending_data->>'email', '')) <> lower(p_email) then
    raise exception 'confirmed_identity_mismatch'; end if;
  student_data := (pending_data - 'password' - 'rosterDecisionPending' - 'rosterScholarshipChoice') || jsonb_build_object(
    'scholarshipLifecycleVersion', 2, 'isPending', false, 'isValidated', true, 'validatedAt', now()::text,
    'accountReviewStatus', 'approved', 'accountApprovedBy', p_admin_id, 'accountApprovedAt', now()::text,
    'rosterAssignmentState', jsonb_build_object('status', 'none'), 'updatedAt', now()::text);
  insert into public.students(id, data, updated_at) values(p_student_id, student_data, now());
  delete from public.pending_students where id = p_student_id;
  assignment := public.reconcile_student_roster(p_student_id, 'account_activation');
  select s.data || coalesce(st.data, '{}') into student_data from public.students s
    left join public.student_scholarship_state st on st.student_id = s.id where s.id = p_student_id;
  insert into public.signup_account_decisions(id, data, updated_at) values(p_student_id || ':approved',
    jsonb_build_object('studentId', p_student_id, 'decision', 'approved', 'adminId', p_admin_id, 'decidedAt', now()::text), now()) on conflict(id) do nothing;
  insert into public."studentNotifications"(id, data, updated_at) values('account_approved_' || p_student_id,
    jsonb_build_object('studentId', p_student_id, 'type', 'account_approved', 'title', 'Account Approved',
      'message', 'Your BulsuScholar account was approved. You can now sign in.', 'route', '/student-dashboard', 'read', false, 'createdAt', now()::text), now()) on conflict(id) do nothing;
  return jsonb_build_object('approved', true, 'alreadyActive', false, 'student', student_data,
    'rosterAssigned', assignment->>'status' = 'assigned', 'rosterConflict', assignment->>'status' = 'conflict',
    'rosterMatchCount', coalesce((assignment->>'matchCount')::integer, case when assignment->>'status' = 'assigned' then 1 else 0 end),
    'rosterAssignmentReason', assignment->>'reason');
end;
$$;

create or replace function public.roster_application_blocker(p_student_id text)
returns text language plpgsql stable security invoker set search_path = '' as $$
declare student_data jsonb; state_data jsonb; committed_data jsonb; cycle text; commitment_id text;
begin
  cycle := public.roster_current_cycle();
  select data into student_data from public.students where id = p_student_id;
  if student_data is null then return 'student_not_found'; end if;
  if not public.roster_record_active(student_data) or student_data->>'disabled' = 'true'
    or student_data->>'adminBlocked' = 'true' or student_data->>'isPending' = 'true'
    or lower(coalesce(student_data->>'status', '')) in ('blocked', 'disabled', 'pending') then return 'student_account_blocked'; end if;
  select data into state_data from public.student_scholarship_state where student_id = p_student_id;
  if not found then state_data := student_data; end if;
  if state_data#>>'{rosterAssignmentState,status}' = 'conflict'
    and public.roster_cycle(state_data->'rosterAssignmentState') in ('', cycle) then return 'roster_assignment_conflict'; end if;
  commitment_id := nullif(state_data#>>'{scholarshipCommitment,applicationId}', '');
  if commitment_id is not null then
    select data into committed_data from public.scholarship_applications where id = commitment_id;
    if (committed_data is null and public.roster_cycle(state_data->'scholarshipCommitment') in ('', cycle))
      or (committed_data is not null and public.roster_cycle(committed_data) in ('', cycle) and public.roster_record_active(committed_data)) then
      return 'scholarship_already_committed'; end if;
  end if;
  if exists(select 1 from public.scholarship_applications where data->>'studentId' = p_student_id
    and public.roster_cycle(data) in ('', cycle) and public.roster_application_awarded(data)) then return 'scholarship_already_committed'; end if;
  if exists(select 1 from public.grantor_portal_scholars where coalesce(data->>'studentId', data->>'studentnumber', data->>'studentNumber') = p_student_id
    and public.roster_cycle(data) in ('', cycle) and public.roster_record_active(data)) then return 'commitment_requires_resolution'; end if;
  return null;
end;
$$;

create or replace function public.reserve_scholarship_application(
  p_student_id text, p_announcement_id text, p_grantor_id text, p_application_id text, p_application_number text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare s jsonb; a jsonb; app jsonb; existing record; cycle text; blocker text;
  minimum_grade numeric; student_grade numeric; remaining integer; invited boolean; previous_choice text;
begin
  perform pg_advisory_xact_lock(734821, 1);
  perform pg_advisory_xact_lock(hashtext('student:' || p_student_id));
  select data into s from public.students where id = p_student_id for update;
  blocker := public.roster_application_blocker(p_student_id);
  if blocker is not null then raise exception '%', blocker; end if;
  cycle := public.roster_current_cycle();
  select id, data into existing from public.scholarship_applications where data->>'studentId' = p_student_id
    and coalesce(data->>'grantorId', data->>'providerId') = p_grantor_id
    and public.roster_cycle(data) = cycle and public.scholarship_application_open(data) and public.roster_record_active(data) order by id limit 1 for update;
  if found then
    if existing.data->>'announcementId' = p_announcement_id then return jsonb_build_object('applicationId', existing.id, 'student', s, 'idempotent', true); end if;
    raise exception 'grantor_application_exists';
  end if;
  if exists(select 1 from public.scholarship_applications where data->>'studentId' = p_student_id
    and coalesce(data->>'grantorId', data->>'providerId') = p_grantor_id and public.roster_cycle(data) = cycle
    and (nullif(data->>'cooldownUntil', '')::timestamptz > now() or (lower(coalesce(data->>'status', '')) in ('rejected', 'denied', 'declined')
      and coalesce(nullif(data->>'rejectedAt', '')::timestamptz, updated_at) + interval '24 hours' > now()))) then raise exception 'reapply_cooldown_active'; end if;
  if not exists(select 1 from public.grantor_portals where id = p_grantor_id)
    or exists(select 1 from (select data from public.grantor_portals where id = p_grantor_id union all select data from public.providers where id = p_grantor_id) g
      where not public.roster_record_active(g.data) or g.data->>'disabled' = 'true' or g.data->>'applicationsBlocked' = 'true') then raise exception 'grantor_archived'; end if;
  select data into a from public.grantor_portal_announcements where id = p_announcement_id and parent_id = p_grantor_id for update;
  if not found then raise exception 'announcement_not_found'; end if;
  if public.roster_cycle(a) not in ('', cycle) then raise exception 'announcement_not_open_for_applications'; end if;
  select exists(select 1 from public.student_scholarship_invitations where student_id = p_student_id and grantor_id = p_grantor_id
    and lower(coalesce(data->>'status', 'pending')) in ('pending', 'invited')
    and (data->>'announcementId' = p_announcement_id or (nullif(data->>'announcementId', '') is null
      and lower(trim(data->>'scholarshipName')) = lower(trim(coalesce(a->>'scholarshipTitle', a->>'title')))))) into invited;
  if not invited and exists(select 1 from public.scholarship_applications where data->>'studentId' = p_student_id
    and coalesce(data->>'blockedGrantorId', data->>'grantorId', data->>'providerId') = p_grantor_id and public.roster_cycle(data) = cycle
    and coalesce(data->>'closureReason', '') not in ('student_withdrawal', 'selected_another_scholarship', 'authoritative_roster_assignment')
    and coalesce(data->>'rejected', 'false') <> 'true' and lower(coalesce(data->>'status', '')) !~ '(rejected|denied|declined)'
    and (data->>'archived' = 'true' or data->>'frozen' = 'true')) then raise exception 'archived_grantor_block'; end if;
  if coalesce(a->>'applicationEnabled', 'false') <> 'true' or not public.roster_record_active(a)
    or a->>'hiddenFromStudents' = 'true' or lower(coalesce(a->>'status', '')) in ('closed', 'ended')
    or nullif(a->>'endDate', '')::timestamptz < now() or nullif(a->>'startDate', '')::timestamptz > now() then raise exception 'announcement_not_open_for_applications'; end if;
  if coalesce(a->>'slotsConfigured', 'false') <> 'true' then raise exception 'slots_not_configured'; end if;
  remaining := greatest(coalesce((a->>'remainingSlots')::integer, 0), 0);
  if remaining < 1 then raise exception 'scholarship_full'; end if;
  minimum_grade := coalesce(nullif(a->>'minimumGrade', '')::numeric, nullif(a->>'minimumGwa', '')::numeric, nullif(a->>'minGwa', '')::numeric, 2.25);
  student_grade := coalesce(nullif(s->>'gwa', '')::numeric, nullif(s->>'currentGwa', '')::numeric);
  if student_grade is null or student_grade < 1 or student_grade > minimum_grade then raise exception 'scholarship_ineligible'; end if;
  if (a#>>'{requiredDocuments,cor}' = 'true' and public.scholarship_document_url(s, array['corFile','corDocument','cor']) is null)
    or (a#>>'{requiredDocuments,cog}' = 'true' and public.scholarship_document_url(s, array['rogFile','cogFile','rogDocument','rog']) is null)
    or (a#>>'{requiredDocuments,applicationForm}' = 'true' and public.scholarship_document_url(s, array['scholarshipApplicationFile','applicationFormFile']) is null) then raise exception 'scholarship_ineligible'; end if;
  app := jsonb_build_object('id', p_application_id, 'applicationId', p_application_id, 'applicationNumber', p_application_number,
    'studentId', p_student_id, 'studentNumber', p_student_id, 'grantorId', p_grantor_id,
    'announcementId', p_announcement_id, 'scholarshipId', p_announcement_id,
    'name', coalesce(a->>'scholarshipTitle', a->>'scholarshipName', a->>'title'),
    'scholarshipName', coalesce(a->>'scholarshipTitle', a->>'scholarshipName', a->>'title'),
    'grantorName', coalesce(a->>'grantorName', a->>'providerLabel'), 'providerType', a->>'providerType',
    'academicCycle', cycle, 'semesterTag', cycle, 'status', 'Applied', 'lifecycleVersion', 2, 'isLocked', false,
    'otherRequirements', coalesce(a->'otherRequirements', '[]'), 'requiredDocuments', coalesce(a->'requiredDocuments', '{}'),
    'customApplicationProfile', a->'customApplicationProfile', 'customApplicationForm', a->'customApplicationForm',
    'minimumGrade', minimum_grade, 'minGwa', minimum_grade, 'gwa', s->>'gwa', 'course', s->>'course', 'yearLevel', s->>'yearLevel', 'email', s->>'email',
    'fullName', coalesce(s->>'fullName', concat_ws(' ', s->>'fname', s->>'mname', s->>'lname')),
    'studentSnapshot', jsonb_build_object('studentId', p_student_id, 'fullName', coalesce(s->>'fullName', concat_ws(' ', s->>'fname', s->>'mname', s->>'lname')), 'course', s->>'course', 'yearLevel', s->>'yearLevel'),
    'slotReserved', true, 'slotReservedAt', now()::text, 'appliedAt', now()::text, 'appliedViaAnnouncement', true,
    'createdAt', now()::text, 'updatedAt', now()::text,
    'tracking', jsonb_build_object('completedStepIds', jsonb_build_array('account', 'announcement_apply', case when a->>'providerType' = 'kuya_win' then 'kwsp_apply' else 'scholarship_apply' end), 'history', '[]'::jsonb));
  previous_choice := coalesce(current_setting('bulsuscholar.choice_write', true), '');
  perform set_config('bulsuscholar.choice_write', 'true', true);
  insert into public.scholarship_applications(id, data) values(p_application_id, app);
  insert into public.student_scholarship_state(id, student_id, data) values(p_student_id, p_student_id, '{"scholarshipLifecycleVersion":2}')
    on conflict(student_id) do update set data = public.student_scholarship_state.data || excluded.data;
  if invited then update public.student_scholarship_invitations set data = data || jsonb_build_object('status', 'Accepted', 'acceptedAt', now()::text), status = 'Accepted'
    where student_id = p_student_id and grantor_id = p_grantor_id and lower(coalesce(data->>'status', 'pending')) in ('pending', 'invited')
      and (data->>'announcementId' = p_announcement_id or (nullif(data->>'announcementId', '') is null and lower(trim(data->>'scholarshipName')) = lower(trim(app->>'scholarshipName')))); end if;
  update public.grantor_portal_announcements set data = data || jsonb_build_object('remainingSlots', remaining - 1), updated_at = now() where id = p_announcement_id and parent_id = p_grantor_id;
  insert into public."grantorNotifications"(id, data, updated_at) values('application_' || p_application_id,
    jsonb_build_object('grantorId', p_grantor_id, 'studentId', p_student_id, 'applicationNumber', p_application_number,
      'type', 'application_submitted', 'title', 'New Student Application', 'message', coalesce(app->>'fullName', 'A student') || ' applied for your scholarship.', 'read', false, 'createdAt', now()::text), now()) on conflict(id) do nothing;
  perform set_config('bulsuscholar.choice_write', previous_choice, true);
  return jsonb_build_object('applicationId', p_application_id, 'student', s, 'remainingSlots', remaining - 1, 'idempotent', false);
end;
$$;

-- Existing scope checks and waitlist capacity rules remain in their original
-- functions. Add the normalized award gate before joining or receiving an offer.
alter function public.reserve_or_waitlist_scholarship(text, text, text, text, text) rename to reserve_or_waitlist_before_solis;
create function public.reserve_or_waitlist_scholarship(
  p_student_id text, p_announcement_id text, p_grantor_id text, p_application_id text, p_application_number text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare blocker text;
begin
  perform pg_advisory_xact_lock(734821, 1);
  perform pg_advisory_xact_lock(hashtext('student:' || p_student_id));
  blocker := public.roster_application_blocker(p_student_id);
  if blocker is not null then raise exception '%', blocker; end if;
  return public.reserve_or_waitlist_before_solis(p_student_id, p_announcement_id, p_grantor_id, p_application_id, p_application_number);
end;
$$;
alter function public.waitlist_dynamic_eligibility_reason(text) rename to waitlist_eligibility_before_solis;
create function public.waitlist_dynamic_eligibility_reason(p_entry_id text)
returns text language plpgsql stable security invoker set search_path = '' as $$
declare target_student text; blocker text;
begin
  select student_id into target_student from public.scholarship_waitlist_entries where id = p_entry_id;
  if not found then return 'waitlist_entry_not_found'; end if;
  blocker := public.roster_application_blocker(target_student);
  if blocker is not null then return blocker; end if;
  return public.waitlist_eligibility_before_solis(p_entry_id);
end;
$$;

-- Retire the old resolver: it could erase commitments and archive other cycles.
revoke all on function public.resolve_roster_assignment_conflict(text, text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.roster_cycle(jsonb) from public, anon, authenticated;
revoke all on function public.roster_current_cycle() from public, anon, authenticated;
revoke all on function public.roster_name_key(text) from public, anon, authenticated;
revoke all on function public.roster_record_active(jsonb) from public, anon, authenticated;
revoke all on function public.roster_application_awarded(jsonb) from public, anon, authenticated;
revoke all on function public.roster_application_blocker(text) from public, anon, authenticated;
revoke all on function public.reserve_scholarship_application(text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.waitlist_dynamic_eligibility_reason(text) from public, anon, authenticated;
revoke all on function public.reserve_or_waitlist_scholarship(text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.reserve_or_waitlist_before_solis(text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.waitlist_eligibility_before_solis(text) from public, anon, authenticated;
revoke all on function public.save_grantor_profile_policy(text, text, text, text, boolean, jsonb, text) from public, anon, authenticated;
revoke all on function public.assign_authoritative_roster_scholarship(text, text, text) from public, anon, authenticated;
revoke all on function public.reconcile_student_roster(text, text) from public, anon, authenticated;
revoke all on function public.commit_roster_import_batch(text, text, text) from public, anon, authenticated;
revoke all on function public.resolve_roster_assignment_conflict_v2(text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.approve_pending_student_account(text, text, text, text) from public, anon, authenticated;
grant execute on function public.roster_cycle(jsonb), public.roster_current_cycle(), public.roster_name_key(text),
  public.roster_record_active(jsonb), public.roster_application_awarded(jsonb),
  public.roster_application_blocker(text), public.reserve_scholarship_application(text, text, text, text, text), public.waitlist_dynamic_eligibility_reason(text),
  public.reserve_or_waitlist_scholarship(text, text, text, text, text),
  public.reserve_or_waitlist_before_solis(text, text, text, text, text), public.waitlist_eligibility_before_solis(text),
  public.save_grantor_profile_policy(text, text, text, text, boolean, jsonb, text),
  public.assign_authoritative_roster_scholarship(text, text, text), public.reconcile_student_roster(text, text),
  public.commit_roster_import_batch(text, text, text), public.resolve_roster_assignment_conflict_v2(text, text, text, text, text),
  public.approve_pending_student_account(text, text, text, text) to service_role;

notify pgrst, 'reload schema';
commit;
