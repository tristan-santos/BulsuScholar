begin;

create table if not exists public.roster_import_batches (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.roster_import_rows (
  id text primary key,
  parent_id text not null references public.roster_import_batches(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(parent_id, id)
);

create table if not exists public.roster_assignment_conflicts (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.roster_import_audit_events (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists roster_import_rows_batch_idx
  on public.roster_import_rows(parent_id, ((data->>'rowNumber')::integer));
create index if not exists roster_assignment_conflicts_status_idx
  on public.roster_assignment_conflicts((data->>'status'), (data->>'studentId'), updated_at desc);
create index if not exists roster_import_audit_target_idx
  on public.roster_import_audit_events((data->>'batchId'), (data->>'studentId'), created_at desc);

alter table public.roster_import_batches enable row level security;
alter table public.roster_import_rows enable row level security;
alter table public.roster_assignment_conflicts enable row level security;
alter table public.roster_import_audit_events enable row level security;

revoke all on public.roster_import_batches from public, anon, authenticated;
revoke all on public.roster_import_rows from public, anon, authenticated;
revoke all on public.roster_assignment_conflicts from public, anon, authenticated;
revoke all on public.roster_import_audit_events from public, anon, authenticated;
grant select, insert, update on public.roster_import_batches to service_role;
grant select, insert, update on public.roster_import_rows to service_role;
grant select, insert, update on public.roster_assignment_conflicts to service_role;
grant select, insert on public.roster_import_audit_events to service_role;

create or replace function public.protect_roster_import_audit_event()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'roster_import_audit_is_immutable';
end;
$$;

drop trigger if exists protect_roster_import_audit_event on public.roster_import_audit_events;
create trigger protect_roster_import_audit_event
before update or delete on public.roster_import_audit_events
for each row execute function public.protect_roster_import_audit_event();

create or replace function public.assign_authoritative_roster_scholarship(
  p_student_id text,
  p_grantor_id text,
  p_roster_id text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  student_data jsonb;
  roster_data jsonb;
  application_data jsonb;
  application_id text;
  existing_application_id text;
  scholarship_name text;
  scholarship_id text;
  provider_type text;
  tracking_data jsonb;
  competitor record;
  closed_ids text[] := '{}';
  now_text text := now()::text;
begin
  if nullif(trim(p_student_id), '') is null or nullif(trim(p_grantor_id), '') is null
    or nullif(trim(p_roster_id), '') is null then
    raise exception 'missing_roster_assignment_identity';
  end if;
  perform pg_advisory_xact_lock(734821, 1);
  perform pg_advisory_xact_lock(hashtext('student:' || p_student_id));
  perform set_config('bulsuscholar.choice_write', 'true', true);

  select data into student_data from public.students where id = p_student_id for update;
  if not found then raise exception 'student_not_found'; end if;
  select data into roster_data from public.grantor_portal_scholars
    where parent_id = p_grantor_id and id = p_roster_id for update;
  if not found
    or coalesce(roster_data->>'studentId', roster_data->>'studentnumber', roster_data->>'studentNumber') <> p_student_id
    or lower(coalesce(roster_data->>'archived', 'false')) = 'true' then
    raise exception 'roster_match_not_found';
  end if;

  scholarship_name := coalesce(roster_data->>'scholarshipName', roster_data->>'scholarshipTitle', 'Scholarship');
  scholarship_id := coalesce(roster_data->>'scholarshipId', roster_data->>'announcementId', '');
  if nullif(trim(scholarship_id), '') is null then raise exception 'roster_scholarship_not_recognized'; end if;
  provider_type := coalesce(roster_data->>'providerType', 'private');

  select id into existing_application_id
  from public.scholarship_applications
  where data->>'studentId' = p_student_id
    and coalesce(data->>'grantorId', data->>'providerId') = p_grantor_id
    and public.scholarship_application_open(data)
    and (
      (nullif(scholarship_id, '') is not null and coalesce(data->>'scholarshipId', data->>'announcementId') = scholarship_id)
      or lower(trim(coalesce(data->>'scholarshipName', data->>'scholarshipTitle', data->>'name', ''))) = lower(trim(scholarship_name))
    )
  order by case when data->>'source' = 'authoritative_roster' then 0 else 1 end, updated_at desc
  limit 1 for update;

  application_id := coalesce(existing_application_id,
    'roster_' || md5(p_grantor_id || ':' || p_roster_id || ':' || p_student_id));
  if nullif(student_data#>>'{scholarshipCommitment,applicationId}', '') is not null
    and student_data#>>'{scholarshipCommitment,applicationId}' <> application_id then
    raise exception 'scholarship_already_committed';
  end if;

  if existing_application_id is not null then
    select data into application_data from public.scholarship_applications
      where id = application_id for update;
    if application_data->>'slotReserved' = 'true' and nullif(application_data->>'slotReleasedAt', '') is null then
      perform public.release_scholarship_slot_before_choice(application_id,
        jsonb_build_object('conversionSource', 'authoritative_roster', 'updatedAt', now_text));
      select data into application_data from public.scholarship_applications where id = application_id for update;
    end if;
    tracking_data := coalesce(application_data->'tracking',
      public.authoritative_roster_tracking(provider_type, scholarship_name, false));
  else
    tracking_data := public.authoritative_roster_tracking(provider_type, scholarship_name, false);
    application_data := '{}'::jsonb;
  end if;

  application_data := application_data || roster_data || jsonb_build_object(
    'id', application_id, 'applicationId', application_id, 'studentId', p_student_id,
    'applicationNumber', coalesce(application_data->>'applicationNumber', roster_data->>'applicationNumber', p_roster_id),
    'name', scholarship_name, 'scholarshipName', scholarship_name,
    'scholarshipId', scholarship_id, 'announcementId', coalesce(roster_data->>'announcementId', scholarship_id),
    'grantorId', p_grantor_id,
    'grantorName', coalesce(roster_data->>'grantorName', roster_data->>'provider', application_data->>'grantorName', ''),
    'providerType', provider_type, 'status', 'Awaiting Documents', 'lifecycleVersion', 2,
    'source', 'authoritative_roster', 'rosterId', p_roster_id, 'rosterConfirmedAward', true,
    'withdrawalLocked', true, 'slotReserved', false, 'slotReleasedAt', coalesce(application_data->>'slotReleasedAt', now_text),
    'tracking', tracking_data, 'convertedFromApplication', existing_application_id is not null,
    'createdAt', coalesce(application_data->>'createdAt', roster_data->>'createdAt', now_text), 'updatedAt', now_text
  );
  insert into public.scholarship_applications(id, data, updated_at)
    values(application_id, application_data, now())
    on conflict(id) do update set data = excluded.data, updated_at = now()
    returning data into application_data;

  for competitor in
    select id, data from public.scholarship_applications
    where data->>'studentId' = p_student_id and id <> application_id
      and public.scholarship_application_open(data)
    order by id for update
  loop
    perform public.release_scholarship_slot_before_choice(competitor.id, jsonb_build_object(
      'archived', true, 'status', 'Archived', 'readOnly', true,
      'closureReason', 'authoritative_roster_assignment',
      'closureMessage', 'Closed because an official roster confirmed another scholarship.',
      'closedAt', now_text, 'cooldownUntil', null, 'updatedAt', now_text
    ));
    closed_ids := array_append(closed_ids, competitor.id);
  end loop;

  update public.students set data = (data - 'rosterDecisionPending' - 'rosterScholarshipChoice' - 'grantorArchiveChoice') || jsonb_build_object(
    'scholarshipLifecycleVersion', 2,
    'rosterAssignmentState', jsonb_build_object('status', 'assigned', 'rosterId', p_roster_id,
      'grantorId', p_grantor_id, 'applicationId', application_id, 'assignedAt', now_text),
    'scholarships', coalesce((
      select jsonb_agg(entry order by ordinal) from (
        select case when coalesce(entry->>'applicationId', entry->>'id') = application_id
          then application_data else entry end as entry, ordinal
        from jsonb_array_elements(coalesce(data->'scholarships', '[]'::jsonb))
          with ordinality existing(entry, ordinal)
        where not (coalesce(entry->>'applicationId', entry->>'id') = any(closed_ids))
        union all
        select application_data, 999999::bigint
        where not exists (
          select 1 from jsonb_array_elements(coalesce(data->'scholarships', '[]'::jsonb)) e
          where coalesce(e->>'applicationId', e->>'id') = application_id
        )
      ) merged
    ), jsonb_build_array(application_data)),
    'scholarshipApplicationHistory', coalesce(data->'scholarshipApplicationHistory', '[]'::jsonb) || coalesce((
      select jsonb_agg(a.data || jsonb_build_object('id', a.id))
      from public.scholarship_applications a where a.id = any(closed_ids)
    ), '[]'::jsonb),
    'scholarshipCommitment', jsonb_build_object('applicationId', application_id,
      'applicationNumber', application_data->>'applicationNumber', 'grantorId', p_grantor_id,
      'scholarshipId', scholarship_id, 'scholarshipName', scholarship_name,
      'source', 'authoritative_roster', 'rosterId', p_roster_id,
      'committedAt', now_text, 'withdrawalLocked', true),
    'updatedAt', now_text
  ), updated_at = now() where id = p_student_id returning data into student_data;

  update public.grantor_portal_scholars set data = data || jsonb_build_object(
    'applicationId', application_id, 'applicationNumber', application_data->>'applicationNumber',
    'scholarshipId', scholarship_id, 'scholarshipTitle', scholarship_name,
    'rosterConfirmed', true, 'rosterConfirmedAt', now_text, 'status', 'Active',
    'archived', false, 'readOnly', false, 'updatedAt', now_text
  ), updated_at = now() where parent_id = p_grantor_id and id = p_roster_id;

  insert into public."studentNotifications"(id, data, updated_at)
  values('authoritative_roster_assigned_' || application_id, jsonb_build_object(
    'studentId', p_student_id, 'grantorId', p_grantor_id, 'applicationId', application_id,
    'type', 'authoritative_roster_assigned', 'title', 'Scholarship Assigned',
    'message', scholarship_name || ' was assigned from the official scholar roster. Complete all applicable profile and identity-document requirements. You cannot change or withdraw this scholarship while your roster record is active.',
    'route', '/student-dashboard/scholarships', 'read', false, 'createdAt', now_text), now())
  on conflict(id) do nothing;

  application_data := public.complete_authoritative_roster_application(p_student_id, application_id);
  select data into student_data from public.students where id = p_student_id;
  return jsonb_build_object('student', student_data, 'application', application_data,
    'applicationId', application_id, 'convertedExistingApplication', existing_application_id is not null,
    'closedApplicationIds', to_jsonb(closed_ids));
end;
$$;

create or replace function public.commit_roster_import_batch(
  p_batch_id text,
  p_actor_type text,
  p_actor_id text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  batch_data jsonb;
  import_row record;
  row_data jsonb;
  roster_data jsonb;
  roster_id text;
  assignment jsonb;
  counts jsonb := jsonb_build_object('created', 0, 'assigned', 0, 'converted', 0, 'waitingForAccount', 0, 'alreadyImported', 0);
  now_text text := now()::text;
begin
  perform pg_advisory_xact_lock(734821, 1);
  perform set_config('bulsuscholar.choice_write', 'true', true);
  select data into batch_data from public.roster_import_batches where id = p_batch_id for update;
  if not found then raise exception 'roster_import_batch_not_found'; end if;
  if batch_data->>'actorType' <> p_actor_type or batch_data->>'actorId' <> p_actor_id then
    raise exception 'roster_import_batch_owner_mismatch';
  end if;
  if batch_data->>'status' = 'committed' then
    return jsonb_build_object('idempotent', true, 'batchId', p_batch_id,
      'counts', coalesce(batch_data->'commitCounts', '{}'::jsonb));
  end if;
  if batch_data->>'status' <> 'ready' then raise exception 'roster_import_batch_not_ready'; end if;
  if exists(select 1 from public.roster_import_rows where parent_id = p_batch_id
    and coalesce((data->>'blocking')::boolean, false)) then
    raise exception 'roster_import_has_blocking_errors';
  end if;

  for import_row in select id, data from public.roster_import_rows
    where parent_id = p_batch_id order by (data->>'rowNumber')::integer, id for update
  loop
    assignment := null;
    row_data := import_row.data;
    if row_data->>'disposition' = 'already_imported' then
      counts := jsonb_set(counts, '{alreadyImported}', to_jsonb((counts->>'alreadyImported')::integer + 1));
      update public.roster_import_rows set data = data || jsonb_build_object('commitStatus', 'unchanged', 'committedAt', now_text), updated_at = now()
        where id = import_row.id;
      continue;
    end if;
    roster_id := coalesce(row_data->>'rosterId', 'roster_' || md5(
      (row_data->>'grantorId') || ':' || (row_data->>'scholarshipId') || ':' || (row_data->>'studentId')));
    roster_data := coalesce(row_data->'rosterData', '{}'::jsonb) || jsonb_build_object(
      'id', roster_id, 'studentId', row_data->>'studentId', 'grantorId', row_data->>'grantorId',
      'scholarshipId', row_data->>'scholarshipId', 'announcementId', row_data->>'scholarshipId',
      'scholarshipTitle', row_data->>'scholarshipTitle', 'scholarshipName', row_data->>'scholarshipTitle',
      'source', 'authoritative_roster', 'importBatchId', p_batch_id, 'importRowId', import_row.id,
      'status', 'Active', 'archived', false, 'createdAt', coalesce(row_data#>>'{rosterData,createdAt}', now_text),
      'updatedAt', now_text
    );
    insert into public.grantor_portal_scholars(id, parent_id, data, updated_at)
      values(roster_id, row_data->>'grantorId', roster_data, now())
      on conflict(id) do update set data = public.grantor_portal_scholars.data || excluded.data, updated_at = now();
    counts := jsonb_set(counts, '{created}', to_jsonb((counts->>'created')::integer + 1));

    if exists(select 1 from public.students where id = row_data->>'studentId') then
      assignment := public.assign_authoritative_roster_scholarship(
        row_data->>'studentId', row_data->>'grantorId', roster_id);
      counts := jsonb_set(counts, '{assigned}', to_jsonb((counts->>'assigned')::integer + 1));
      if coalesce((assignment->>'convertedExistingApplication')::boolean, false) then
        counts := jsonb_set(counts, '{converted}', to_jsonb((counts->>'converted')::integer + 1));
      end if;
    else
      counts := jsonb_set(counts, '{waitingForAccount}', to_jsonb((counts->>'waitingForAccount')::integer + 1));
    end if;
    update public.roster_import_rows set data = data || jsonb_build_object(
      'commitStatus', 'committed', 'rosterId', roster_id, 'committedAt', now_text,
      'assignment', coalesce(assignment, '{}'::jsonb)), updated_at = now()
      where id = import_row.id;
    insert into public.roster_import_audit_events(id, data, created_at)
      values('roster_import_' || md5(p_batch_id || ':' || import_row.id), jsonb_build_object(
        'batchId', p_batch_id, 'rowId', import_row.id, 'studentId', row_data->>'studentId',
        'grantorId', row_data->>'grantorId', 'scholarshipId', row_data->>'scholarshipId',
        'actorType', p_actor_type, 'actorId', p_actor_id, 'action', 'roster_row_committed',
        'createdAt', now_text), now()) on conflict(id) do nothing;
  end loop;

  update public.roster_import_batches set data = data || jsonb_build_object(
    'status', 'committed', 'commitCounts', counts, 'committedAt', now_text, 'updatedAt', now_text
  ), updated_at = now() where id = p_batch_id;
  return jsonb_build_object('idempotent', false, 'batchId', p_batch_id, 'counts', counts);
end;
$$;

create or replace function public.request_scholarship_materials(
  p_student_id text,
  p_application_id text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  student_data jsonb;
  application_data jsonb;
  announcement_data jsonb;
  minimum_grade numeric;
  student_grade numeric;
begin
  perform pg_advisory_xact_lock(734821, 1);
  perform pg_advisory_xact_lock(hashtext('student:' || p_student_id));
  select data into student_data from public.students where id = p_student_id for update;
  if not found then raise exception 'student_not_found'; end if;
  select data into application_data from public.scholarship_applications
    where id = p_application_id and data->>'studentId' = p_student_id for update;
  if not found then raise exception 'application_not_found'; end if;
  if not public.scholarship_application_open(application_data) then raise exception 'application_closed'; end if;
  if application_data->>'source' = 'authoritative_roster' then raise exception 'authoritative_roster_managed'; end if;
  if lower(coalesce(student_data#>>'{rosterAssignmentState,status}', '')) = 'conflict' then
    raise exception 'roster_assignment_conflict';
  end if;
  if student_data->>'archived' = 'true' or student_data->>'disabled' = 'true'
    or student_data->>'adminBlocked' = 'true'
    or lower(coalesce(student_data->>'status', '')) in ('archived', 'inactive', 'disabled', 'blocked') then
    raise exception 'student_account_blocked';
  end if;

  select data into announcement_data from public.grantor_portal_announcements
    where id = application_data->>'announcementId'
      and parent_id = coalesce(application_data->>'grantorId', application_data->>'providerId') for update;
  if not found then raise exception 'announcement_not_open_for_applications'; end if;
  minimum_grade := coalesce(nullif(announcement_data->>'minimumGrade', '')::numeric,
    nullif(announcement_data->>'minimumGwa', '')::numeric,
    nullif(announcement_data->>'minGwa', '')::numeric, 2.25);
  student_grade := coalesce(nullif(student_data->>'gwa', '')::numeric,
    nullif(student_data->>'currentGwa', '')::numeric, 99);
  if student_grade > minimum_grade then raise exception 'grade_not_eligible'; end if;
  if not public.scholarship_documents_complete_for_application(student_data, application_data) then
    raise exception 'document_review_required';
  end if;
  if not (coalesce(application_data#>'{tracking,completedStepIds}', '[]'::jsonb) ? 'document_review') then
    raise exception 'document_review_required';
  end if;
  if application_data->'reviewedDocumentVersions' is distinct from public.scholarship_document_versions(student_data) then
    raise exception 'document_versions_changed';
  end if;
  if application_data->>'lifecycleVersion' = '2' and (
    nullif(application_data#>>'{applicationFormFile,url}', '') is null
    or application_data->'applicationFormFile' is distinct from application_data->'reviewedApplicationFormVersion'
    or coalesce(application_data->'otherRequirementUploads', 'null'::jsonb)
      is distinct from coalesce(application_data->'reviewedOtherRequirementVersions', 'null'::jsonb)) then
    raise exception 'application_requirement_pending';
  end if;
  if application_data->>'slotReserved' <> 'true' or nullif(application_data->>'slotReleasedAt', '') is not null then
    raise exception 'slot_reservation_missing';
  end if;
  return public.mutate_scholarship_choice(p_student_id, p_application_id, 'choose');
end;
$$;

create or replace function public.resolve_roster_assignment_conflict(
  p_conflict_id text,
  p_resolution text,
  p_selected_roster_id text,
  p_actor_id text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  conflict_data jsonb;
  candidate jsonb;
  student_id text;
  selected_roster_id text;
  selected_grantor_id text;
  selected_data jsonb;
  assignment jsonb;
  now_text text := now()::text;
begin
  perform pg_advisory_xact_lock(734821, 1);
  select data into conflict_data from public.roster_assignment_conflicts
    where id = p_conflict_id for update;
  if not found then raise exception 'roster_conflict_not_found'; end if;
  if conflict_data->>'status' <> 'open' then
    return jsonb_build_object('idempotent', true, 'conflictId', p_conflict_id,
      'status', conflict_data->>'status', 'resolution', conflict_data->'resolution');
  end if;
  candidate := coalesce(conflict_data->'candidate', '{}'::jsonb);
  student_id := conflict_data->>'studentId';
  perform pg_advisory_xact_lock(hashtext('student:' || student_id));
  perform set_config('bulsuscholar.choice_write', 'true', true);

  if p_resolution = 'candidate' then
    selected_grantor_id := candidate->>'grantorId';
    selected_roster_id := 'roster_' || md5(selected_grantor_id || ':' ||
      (candidate->>'scholarshipId') || ':' || student_id);
    selected_data := coalesce(candidate->'rosterData', '{}'::jsonb) || jsonb_build_object(
      'id', selected_roster_id, 'studentId', student_id, 'grantorId', selected_grantor_id,
      'scholarshipId', candidate->>'scholarshipId', 'announcementId', candidate->>'scholarshipId',
      'scholarshipTitle', candidate->>'scholarshipTitle', 'scholarshipName', candidate->>'scholarshipTitle',
      'source', 'authoritative_roster', 'status', 'Active', 'archived', false,
      'conflictResolutionId', p_conflict_id, 'updatedAt', now_text,
      'createdAt', coalesce(candidate#>>'{rosterData,createdAt}', now_text)
    );
    insert into public.grantor_portal_scholars(id, parent_id, data, updated_at)
      values(selected_roster_id, selected_grantor_id, selected_data, now())
      on conflict(id) do update set data = public.grantor_portal_scholars.data || excluded.data, updated_at = now();
  elsif p_resolution = 'existing' then
    selected_roster_id := nullif(trim(p_selected_roster_id), '');
    if selected_roster_id is null then raise exception 'selected_roster_required'; end if;
    select parent_id, data into selected_grantor_id, selected_data
      from public.grantor_portal_scholars where id = selected_roster_id
      and coalesce(data->>'studentId', data->>'studentnumber', data->>'studentNumber') = student_id
      and lower(coalesce(data->>'archived', 'false')) <> 'true' for update;
    if not found then raise exception 'selected_roster_not_found'; end if;
  else
    raise exception 'invalid_roster_conflict_resolution';
  end if;

  update public.grantor_portal_scholars set data = data || jsonb_build_object(
    'status', 'Archived', 'archived', true, 'readOnly', true,
    'archiveReason', 'roster_conflict_resolution', 'archivedAt', now_text,
    'cooldownUntil', null, 'updatedAt', now_text
  ), updated_at = now()
  where id <> selected_roster_id
    and coalesce(data->>'studentId', data->>'studentnumber', data->>'studentNumber') = student_id
    and lower(coalesce(data->>'archived', 'false')) <> 'true';

  update public.students set data = (data - 'scholarshipCommitment') || jsonb_build_object(
    'rosterAssignmentState', jsonb_build_object('status', 'resolving',
      'conflictId', p_conflict_id, 'updatedAt', now_text),
    'updatedAt', now_text
  ), updated_at = now() where id = student_id;
  if not found then raise exception 'student_not_found'; end if;

  assignment := public.assign_authoritative_roster_scholarship(
    student_id, selected_grantor_id, selected_roster_id);

  update public.roster_assignment_conflicts set data = data || jsonb_build_object(
    'status', 'resolved', 'resolution', jsonb_build_object(
      'selectedRosterId', selected_roster_id, 'selectedGrantorId', selected_grantor_id,
      'mode', p_resolution, 'resolvedBy', p_actor_id, 'resolvedAt', now_text),
    'updatedAt', now_text
  ), updated_at = now()
  where data->>'studentId' = student_id and data->>'status' = 'open';

  insert into public.roster_import_audit_events(id, data, created_at)
    values('roster_conflict_resolution_' || md5(p_conflict_id || ':' || selected_roster_id),
      jsonb_build_object('conflictId', p_conflict_id, 'studentId', student_id,
        'selectedRosterId', selected_roster_id, 'selectedGrantorId', selected_grantor_id,
        'resolution', p_resolution, 'actorType', 'admin', 'actorId', p_actor_id,
        'action', 'roster_conflict_resolved', 'createdAt', now_text), now())
    on conflict(id) do nothing;
  return jsonb_build_object('idempotent', false, 'conflictId', p_conflict_id,
    'selectedRosterId', selected_roster_id, 'assignment', assignment);
end;
$$;

revoke all on function public.protect_roster_import_audit_event() from public, anon, authenticated;
revoke all on function public.assign_authoritative_roster_scholarship(text, text, text) from public, anon, authenticated;
revoke all on function public.commit_roster_import_batch(text, text, text) from public, anon, authenticated;
revoke all on function public.request_scholarship_materials(text, text) from public, anon, authenticated;
revoke all on function public.resolve_roster_assignment_conflict(text, text, text, text) from public, anon, authenticated;
revoke execute on function public.reserve_archived_grantor_replacement_application(text, text, text, text, text) from service_role;
revoke execute on function public.commit_archived_grantor_replacement(text, text) from service_role;
revoke execute on function public.withdraw_archived_grantor_replacement(text, text) from service_role;
revoke execute on function public.resolve_archived_grantor_scholar_choice(text, text, text) from service_role;
grant execute on function public.assign_authoritative_roster_scholarship(text, text, text) to service_role;
grant execute on function public.commit_roster_import_batch(text, text, text) to service_role;
grant execute on function public.request_scholarship_materials(text, text) to service_role;
grant execute on function public.resolve_roster_assignment_conflict(text, text, text, text) to service_role;

notify pgrst, 'reload schema';
commit;
