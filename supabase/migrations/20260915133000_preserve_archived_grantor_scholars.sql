begin;

create or replace function public.sync_archived_grantor_scholar_choices(
  p_grantor_id text,
  p_archived boolean,
  p_actor_id text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  student_row record;
  application_data jsonb;
  choice_data jsonb;
  choice_status text;
  now_text text := now()::text;
  affected_count integer := 0;
  notification_count integer := 0;
  initialized boolean;
begin
  if nullif(trim(p_grantor_id), '') is null then
    raise exception 'missing_grantor_id';
  end if;
  perform pg_advisory_xact_lock(734821, 1);
  perform set_config('bulsuscholar.choice_write', 'true', true);

  if not exists(select 1 from public.providers where id = p_grantor_id)
    and not exists(select 1 from public.grantor_portals where id = p_grantor_id) then
    raise exception 'grantor_not_found';
  end if;
  insert into public.providers(id, data, updated_at) values (
    p_grantor_id,
    jsonb_build_object('archived', p_archived, 'archivedAt', case when p_archived then now_text else null end,
      'status', case when p_archived then 'Archived' else 'Active' end, 'updatedAt', now_text),
    now()
  ) on conflict(id) do update set data = public.providers.data || excluded.data, updated_at = excluded.updated_at;
  insert into public.grantor_portals(id, data, updated_at) values (
    p_grantor_id,
    jsonb_build_object('archived', p_archived, 'archivedAt', case when p_archived then now_text else null end,
      'status', case when p_archived then 'Archived' else 'Active' end, 'updatedAt', now_text),
    now()
  ) on conflict(id) do update set data = public.grantor_portals.data || excluded.data, updated_at = excluded.updated_at;

  for student_row in
    select id, data
    from public.students
    where coalesce(data#>>'{scholarshipCommitment,grantorId}', '') = p_grantor_id
      or coalesce(data#>>'{grantorArchiveChoice,grantorId}', '') = p_grantor_id
    order by id
    for update
  loop
    choice_data := student_row.data->'grantorArchiveChoice';
    choice_status := lower(coalesce(choice_data->>'decision', ''));

    if p_archived then
      select data into application_data
      from public.scholarship_applications
      where id = student_row.data#>>'{scholarshipCommitment,applicationId}'
        and coalesce(data->>'grantorId', data->>'providerId') = p_grantor_id
      for update;
      if not found or not public.scholarship_application_open(application_data) then
        continue;
      end if;

      initialized := not (
        choice_data->>'applicationId' = student_row.data#>>'{scholarshipCommitment,applicationId}'
        and choice_status in ('pending', 'keep', 'change')
      );
      if initialized then
        choice_data := jsonb_build_object(
          'applicationId', student_row.data#>>'{scholarshipCommitment,applicationId}',
          'applicationNumber', coalesce(application_data->>'applicationNumber', student_row.data#>>'{scholarshipCommitment,applicationNumber}'),
          'scholarshipId', coalesce(application_data->>'scholarshipId', student_row.data#>>'{scholarshipCommitment,scholarshipId}'),
          'scholarshipName', coalesce(application_data->>'scholarshipName', application_data->>'name'),
          'grantorId', p_grantor_id,
          'grantorName', coalesce(application_data->>'grantorName', application_data->>'provider'),
          'archivedAt', now_text,
          'decision', 'pending',
          'workflowPaused', true,
          'servicingOwner', 'none',
          'replacementApplicationId', null,
          'createdBy', coalesce(nullif(p_actor_id, ''), 'admin'),
          'updatedAt', now_text
        );
      end if;

      update public.students
      set data = data || jsonb_build_object(
        'grantorArchiveChoice', choice_data,
        'scholarships', coalesce((
          select jsonb_agg(case when entry->>'applicationId' = choice_data->>'applicationId'
            then entry || jsonb_build_object(
              'grantorAccountArchived', true,
              'grantorArchiveDecision', choice_data->>'decision',
              'workflowPaused', choice_data->>'decision' in ('pending', 'change'),
              'servicingOwner', case when choice_data->>'decision' = 'keep' then 'admin' else 'none' end,
              'updatedAt', now_text
            ) else entry end order by ordinal)
          from jsonb_array_elements(coalesce(data->'scholarships', '[]')) with ordinality scholarship(entry, ordinal)
        ), '[]'::jsonb),
        'updatedAt', now_text
      ), updated_at = now()
      where id = student_row.id;

      update public.scholarship_applications
      set data = data || jsonb_build_object(
        'grantorAccountArchived', true,
        'grantorArchiveDecision', choice_data->>'decision',
        'workflowPaused', choice_data->>'decision' in ('pending', 'change'),
        'servicingOwner', case when choice_data->>'decision' = 'keep' then 'admin' else 'none' end,
        'updatedAt', now_text
      ), updated_at = now()
      where id = choice_data->>'applicationId';

      update public.grantor_portal_scholars
      set data = data || jsonb_build_object(
        'grantorAccountArchived', true,
        'grantorArchiveDecision', choice_data->>'decision',
        'workflowPaused', choice_data->>'decision' in ('pending', 'change'),
        'servicingOwner', case when choice_data->>'decision' = 'keep' then 'admin' else 'none' end,
        'updatedAt', now_text
      ), updated_at = now()
      where parent_id = p_grantor_id
        and data->>'applicationId' = choice_data->>'applicationId';

      affected_count := affected_count + 1;
      if initialized then
        insert into public."studentNotifications"(id, data, updated_at)
        values (
          concat('grantor_archive_choice_', choice_data->>'applicationId'),
          jsonb_build_object(
            'studentId', student_row.id,
            'type', 'grantor_archive_choice_required',
            'title', 'Scholarship Decision Required',
            'message', 'Your grantor account was archived. Choose whether to keep this scholarship under administrator management or apply for a replacement.',
            'grantorId', p_grantor_id,
            'applicationId', choice_data->>'applicationId',
            'applicationNumber', choice_data->>'applicationNumber',
            'scholarshipName', choice_data->>'scholarshipName',
            'route', '/student-dashboard/scholarships',
            'read', false,
            'createdAt', now_text,
            'updatedAt', now_text
          ), now()
        ) on conflict(id) do nothing;
        if found then notification_count := notification_count + 1; end if;
      end if;
    elsif choice_status in ('pending', 'keep') then
      update public.scholarship_applications
      set data = (data - 'grantorArchiveDecision' - 'workflowPaused') || jsonb_build_object(
        'grantorAccountArchived', false,
        'servicingOwner', 'grantor',
        'updatedAt', now_text
      ), updated_at = now()
      where id = choice_data->>'applicationId';

      update public.grantor_portal_scholars
      set data = (data - 'grantorArchiveDecision' - 'workflowPaused') || jsonb_build_object(
        'grantorAccountArchived', false,
        'servicingOwner', 'grantor',
        'updatedAt', now_text
      ), updated_at = now()
      where parent_id = p_grantor_id and data->>'applicationId' = choice_data->>'applicationId';

      update public.students
      set data = (data - 'grantorArchiveChoice') || jsonb_build_object(
        'grantorArchiveChoiceHistory', coalesce(data->'grantorArchiveChoiceHistory', '[]'::jsonb) ||
          jsonb_build_array(choice_data || jsonb_build_object('resolution', 'grantor_restored', 'resolvedAt', now_text)),
        'scholarships', coalesce((
          select jsonb_agg(case when entry->>'applicationId' = choice_data->>'applicationId'
            then (entry - 'grantorArchiveDecision' - 'workflowPaused') || jsonb_build_object(
              'grantorAccountArchived', false, 'servicingOwner', 'grantor', 'updatedAt', now_text
            ) else entry end order by ordinal)
          from jsonb_array_elements(coalesce(data->'scholarships', '[]')) with ordinality scholarship(entry, ordinal)
        ), '[]'::jsonb),
        'updatedAt', now_text
      ), updated_at = now()
      where id = student_row.id;

      insert into public."studentNotifications"(id, data, updated_at)
      values (
        concat('grantor_archive_restored_', choice_data->>'applicationId', '_', md5(choice_data->>'archivedAt')),
        jsonb_build_object('studentId', student_row.id, 'type', 'grantor_restored',
          'title', 'Grantor Account Restored',
          'message', 'Your existing scholarship has returned to grantor management and can continue from its current stage.',
          'grantorId', p_grantor_id, 'applicationId', choice_data->>'applicationId',
          'route', '/student-dashboard/scholarships', 'read', false, 'createdAt', now_text, 'updatedAt', now_text), now()
      ) on conflict(id) do nothing;
      if found then notification_count := notification_count + 1; end if;
      affected_count := affected_count + 1;
    elsif choice_status = 'change' then
      update public.students
      set data = jsonb_set(data, '{grantorArchiveChoice}', choice_data || jsonb_build_object(
        'originalGrantorRestored', true, 'grantorRestoredAt', now_text, 'updatedAt', now_text
      ), true), updated_at = now()
      where id = student_row.id;
      update public.scholarship_applications
      set data = data || jsonb_build_object('grantorAccountArchived', false, 'updatedAt', now_text), updated_at = now()
      where id = choice_data->>'applicationId';
      affected_count := affected_count + 1;
    end if;
  end loop;

  return jsonb_build_object('affectedScholarCount', affected_count, 'choiceNotificationCount', notification_count);
end;
$$;

create or replace function public.reserve_archived_grantor_replacement_application(
  p_student_id text, p_announcement_id text, p_grantor_id text,
  p_application_id text, p_application_number text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  student_data jsonb;
  original_commitment jsonb;
  original_choice jsonb;
  original_entry jsonb;
  result jsonb;
  final_student jsonb;
begin
  perform pg_advisory_xact_lock(734821, 1);
  perform set_config('bulsuscholar.choice_write', 'true', true);
  select data into student_data from public.students where id = p_student_id for update;
  if not found then raise exception 'student_not_found'; end if;
  original_commitment := student_data->'scholarshipCommitment';
  original_choice := student_data->'grantorArchiveChoice';
  if lower(coalesce(original_choice->>'decision', '')) <> 'change'
    or original_choice->>'applicationId' is distinct from original_commitment->>'applicationId' then
    raise exception 'replacement_not_allowed';
  end if;
  if p_grantor_id = original_choice->>'grantorId' then raise exception 'replacement_not_allowed'; end if;
  select entry into original_entry
  from jsonb_array_elements(coalesce(student_data->'scholarships', '[]')) entry
  where entry->>'applicationId' = original_choice->>'applicationId' limit 1;
  if original_entry is null then raise exception 'original_commitment_missing'; end if;

  update public.students
  set data = (data - 'scholarshipCommitment') || jsonb_build_object(
    'scholarships', coalesce((select jsonb_agg(entry) from jsonb_array_elements(coalesce(data->'scholarships', '[]')) entry
      where entry->>'applicationId' <> original_choice->>'applicationId'), '[]'::jsonb)
  ), updated_at = now()
  where id = p_student_id;

  result := public.reserve_scholarship_application(
    p_student_id, p_announcement_id, p_grantor_id, p_application_id, p_application_number
  );

  update public.students
  set data = data || jsonb_build_object(
    'scholarshipCommitment', original_commitment,
    'grantorArchiveChoice', original_choice,
    'scholarships', coalesce(data->'scholarships', '[]'::jsonb) || jsonb_build_array(original_entry),
    'updatedAt', now()::text
  ), updated_at = now()
  where id = p_student_id returning data into final_student;

  update public.scholarship_applications
  set data = data || jsonb_build_object(
    'replacementForApplicationId', original_choice->>'applicationId',
    'replacementForGrantorId', original_choice->>'grantorId',
    'updatedAt', now()::text
  ), updated_at = now()
  where id = p_application_id;

  update public.students
  set data = jsonb_set(data, '{scholarships}', coalesce((
    select jsonb_agg(case when entry->>'applicationId' = p_application_id
      then entry || jsonb_build_object('replacementForApplicationId', original_choice->>'applicationId',
        'replacementForGrantorId', original_choice->>'grantorId') else entry end)
    from jsonb_array_elements(coalesce(data->'scholarships', '[]')) entry
  ), '[]'::jsonb), true), updated_at = now()
  where id = p_student_id returning data into final_student;

  return result || jsonb_build_object('student', final_student, 'replacement', true);
end;
$$;

create or replace function public.commit_archived_grantor_replacement(
  p_student_id text,
  p_application_id text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  student_data jsonb;
  original_commitment jsonb;
  original_choice jsonb;
  original_entry jsonb;
  result jsonb;
  final_student jsonb;
  now_text text := now()::text;
begin
  perform pg_advisory_xact_lock(734821, 1);
  perform set_config('bulsuscholar.choice_write', 'true', true);
  select data into student_data from public.students where id = p_student_id for update;
  if not found then raise exception 'student_not_found'; end if;
  original_commitment := student_data->'scholarshipCommitment';
  original_choice := student_data->'grantorArchiveChoice';
  if lower(coalesce(original_choice->>'decision', '')) <> 'change'
    or original_choice->>'applicationId' is distinct from original_commitment->>'applicationId' then
    raise exception 'replacement_not_allowed';
  end if;
  if p_application_id = original_choice->>'applicationId' then raise exception 'replacement_not_allowed'; end if;
  if not exists(select 1 from public.scholarship_applications where id = p_application_id
      and data->>'studentId' = p_student_id
      and data->>'replacementForApplicationId' = original_choice->>'applicationId') then
    raise exception 'replacement_not_allowed';
  end if;
  select entry into original_entry from jsonb_array_elements(coalesce(student_data->'scholarships', '[]')) entry
    where entry->>'applicationId' = original_choice->>'applicationId' limit 1;
  if original_entry is null then raise exception 'original_commitment_missing'; end if;

  update public.students
  set data = (data - 'scholarshipCommitment') || jsonb_build_object(
    'scholarships', coalesce((select jsonb_agg(entry) from jsonb_array_elements(coalesce(data->'scholarships', '[]')) entry
      where entry->>'applicationId' <> original_choice->>'applicationId'), '[]'::jsonb)
  ), updated_at = now()
  where id = p_student_id;

  update public.scholarship_applications
  set data = data || jsonb_build_object(
    'replacementClosureReason', 'archived_grantor_replacement',
    'replacedByApplicationId', p_application_id,
    'updatedAt', now_text
  ), updated_at = now()
  where id = original_choice->>'applicationId';

  result := public.mutate_scholarship_choice(p_student_id, p_application_id, 'choose');

  update public.soe_requests
  set data = data || jsonb_build_object(
    'status', 'Cancelled', 'reviewState', 'cancelled',
    'cancellationReason', 'archived_grantor_replacement',
    'cancelledAt', now_text, 'updatedAt', now_text
  ), updated_at = now()
  where data->>'applicationId' = original_choice->>'applicationId'
    and lower(coalesce(data->>'status', '')) not in ('rejected', 'cancelled', 'canceled');

  update public.grantor_portal_scholars
  set data = data || jsonb_build_object(
    'archived', true, 'status', 'Archived', 'readOnly', true,
    'closureReason', 'archived_grantor_replacement',
    'replacedByApplicationId', p_application_id,
    'closedAt', now_text, 'updatedAt', now_text
  ), updated_at = now()
  where parent_id = original_choice->>'grantorId'
    and data->>'applicationId' = original_choice->>'applicationId';

  update public.students
  set data = (data - 'grantorArchiveChoice') || jsonb_build_object(
    'grantorArchiveChoiceHistory', coalesce(data->'grantorArchiveChoiceHistory', '[]'::jsonb) ||
      jsonb_build_array(original_choice || jsonb_build_object(
        'resolution', 'replacement_committed', 'replacementApplicationId', p_application_id, 'resolvedAt', now_text
      )),
    'updatedAt', now_text
  ), updated_at = now()
  where id = p_student_id returning data into final_student;

  insert into public."grantorNotifications"(id, data, updated_at)
  values (
    concat('archived_grantor_replaced_', original_choice->>'applicationId'),
    jsonb_build_object('grantorId', original_choice->>'grantorId', 'studentId', p_student_id,
      'applicationId', original_choice->>'applicationId', 'type', 'scholarship_replaced',
      'title', 'Scholarship Replaced',
      'message', 'The student committed to a replacement scholarship after the grantor account was archived.',
      'read', false, 'createdAt', now_text), now()
  ) on conflict(id) do nothing;

  return result || jsonb_build_object('student', final_student, 'replacementCommitted', true,
    'replacedApplicationId', original_choice->>'applicationId');
end;
$$;

create or replace function public.withdraw_archived_grantor_replacement(
  p_student_id text,
  p_application_id text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  student_data jsonb;
  original_commitment jsonb;
  original_choice jsonb;
  original_entry jsonb;
  result jsonb;
  final_student jsonb;
begin
  perform pg_advisory_xact_lock(734821, 1);
  perform set_config('bulsuscholar.choice_write', 'true', true);
  select data into student_data from public.students where id = p_student_id for update;
  if not found then raise exception 'student_not_found'; end if;
  original_commitment := student_data->'scholarshipCommitment';
  original_choice := student_data->'grantorArchiveChoice';
  if lower(coalesce(original_choice->>'decision', '')) <> 'change'
    or original_choice->>'applicationId' is distinct from original_commitment->>'applicationId'
    or p_application_id = original_choice->>'applicationId'
    or not exists(select 1 from public.scholarship_applications where id = p_application_id
      and data->>'studentId' = p_student_id
      and data->>'replacementForApplicationId' = original_choice->>'applicationId') then
    raise exception 'replacement_not_allowed';
  end if;
  select entry into original_entry from jsonb_array_elements(coalesce(student_data->'scholarships', '[]')) entry
    where entry->>'applicationId' = original_choice->>'applicationId' limit 1;
  if original_entry is null then raise exception 'original_commitment_missing'; end if;

  update public.students
  set data = (data - 'scholarshipCommitment') || jsonb_build_object(
    'scholarships', coalesce((select jsonb_agg(entry) from jsonb_array_elements(coalesce(data->'scholarships', '[]')) entry
      where entry->>'applicationId' <> original_choice->>'applicationId'), '[]'::jsonb)
  ), updated_at = now() where id = p_student_id;

  result := public.mutate_scholarship_choice(p_student_id, p_application_id, 'withdraw');

  update public.students
  set data = data || jsonb_build_object(
    'scholarshipCommitment', original_commitment,
    'grantorArchiveChoice', original_choice,
    'scholarships', coalesce(data->'scholarships', '[]'::jsonb) || jsonb_build_array(original_entry),
    'updatedAt', now()::text
  ), updated_at = now() where id = p_student_id returning data into final_student;

  return result || jsonb_build_object('student', final_student, 'replacementWithdrawn', true);
end;
$$;

create or replace function public.resolve_archived_grantor_scholar_choice(
  p_student_id text,
  p_application_id text,
  p_action text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  student_data jsonb;
  choice_data jsonb;
  original_application jsonb;
  replacement record;
  closed_ids text[] := '{}';
  release_result jsonb;
  grantor_is_archived boolean;
  next_choice jsonb;
  final_student jsonb;
  now_text text := now()::text;
begin
  if p_action not in ('keep', 'change') then raise exception 'invalid_archive_choice'; end if;
  perform pg_advisory_xact_lock(734821, 1);
  perform set_config('bulsuscholar.choice_write', 'true', true);
  select data into student_data from public.students where id = p_student_id for update;
  if not found then raise exception 'student_not_found'; end if;
  choice_data := student_data->'grantorArchiveChoice';
  if choice_data->>'applicationId' is distinct from p_application_id
    or student_data#>>'{scholarshipCommitment,applicationId}' is distinct from p_application_id then
    raise exception 'original_commitment_missing';
  end if;
  select data into original_application from public.scholarship_applications
    where id = p_application_id and data->>'studentId' = p_student_id for update;
  if not found or not public.scholarship_application_open(original_application) then
    raise exception 'original_commitment_missing';
  end if;

  if p_action = 'change' then
    if lower(coalesce(choice_data->>'decision', '')) = 'keep' then raise exception 'invalid_archive_choice'; end if;
    if lower(coalesce(choice_data->>'decision', '')) = 'change' then
      return jsonb_build_object('idempotent', true, 'student', student_data, 'choice', choice_data);
    end if;
    next_choice := choice_data || jsonb_build_object(
      'decision', 'change', 'workflowPaused', true, 'servicingOwner', 'none',
      'decidedAt', now_text, 'updatedAt', now_text
    );
    update public.scholarship_applications set data = data || jsonb_build_object(
      'grantorArchiveDecision', 'change', 'workflowPaused', true, 'servicingOwner', 'none', 'updatedAt', now_text
    ), updated_at = now() where id = p_application_id;
    update public.grantor_portal_scholars set data = data || jsonb_build_object(
      'grantorArchiveDecision', 'change', 'workflowPaused', true, 'servicingOwner', 'none', 'updatedAt', now_text
    ), updated_at = now() where parent_id = choice_data->>'grantorId' and data->>'applicationId' = p_application_id;
    update public.students set data = data || jsonb_build_object(
      'grantorArchiveChoice', next_choice,
      'scholarships', coalesce((select jsonb_agg(case when entry->>'applicationId' = p_application_id
        then entry || jsonb_build_object('grantorArchiveDecision', 'change', 'workflowPaused', true,
          'servicingOwner', 'none', 'updatedAt', now_text) else entry end order by ordinal)
        from jsonb_array_elements(coalesce(data->'scholarships', '[]')) with ordinality scholarship(entry, ordinal)), '[]'::jsonb),
      'updatedAt', now_text
    ), updated_at = now() where id = p_student_id returning data into final_student;
    return jsonb_build_object('idempotent', false, 'student', final_student, 'choice', next_choice);
  end if;

  for replacement in
    select id, data from public.scholarship_applications
    where data->>'studentId' = p_student_id and id <> p_application_id
      and public.scholarship_application_open(data)
      and data->>'replacementForApplicationId' = p_application_id
    order by id for update
  loop
    release_result := public.release_scholarship_slot_before_choice(replacement.id, jsonb_build_object(
      'archived', true, 'status', 'Archived', 'closureReason', 'selected_another_scholarship',
      'archiveTransitionResolution', 'kept_archived_grantor_scholarship',
      'closureMessage', 'Student kept the original scholarship', 'closedAt', now_text,
      'readOnly', true, 'updatedAt', now_text
    ));
    if replacement.data->>'slotReserved' = 'true' and nullif(replacement.data->>'slotReleasedAt', '') is null
      and release_result->>'released' is distinct from 'true' then raise exception 'slot_reservation_missing'; end if;
    closed_ids := array_append(closed_ids, replacement.id);
  end loop;

  select exists(select 1 from public.grantor_portals where id = choice_data->>'grantorId'
      and (data->>'archived' = 'true' or data->>'disabled' = 'true'
        or lower(coalesce(data->>'status', '')) in ('archived', 'inactive', 'disabled')))
    or exists(select 1 from public.providers where id = choice_data->>'grantorId'
      and (data->>'archived' = 'true' or data->>'disabled' = 'true'
        or lower(coalesce(data->>'status', '')) in ('archived', 'inactive', 'disabled')))
    into grantor_is_archived;
  next_choice := choice_data || jsonb_build_object(
    'decision', 'keep', 'workflowPaused', false,
    'servicingOwner', case when grantor_is_archived then 'admin' else 'grantor' end,
    'decidedAt', now_text, 'updatedAt', now_text
  );

  update public.scholarship_applications set data = (data - 'workflowPaused') || jsonb_build_object(
    'grantorAccountArchived', grantor_is_archived, 'grantorArchiveDecision', 'keep',
    'servicingOwner', case when grantor_is_archived then 'admin' else 'grantor' end, 'updatedAt', now_text
  ), updated_at = now() where id = p_application_id;
  update public.grantor_portal_scholars set data = (data - 'workflowPaused') || jsonb_build_object(
    'grantorAccountArchived', grantor_is_archived, 'grantorArchiveDecision', 'keep',
    'servicingOwner', case when grantor_is_archived then 'admin' else 'grantor' end, 'updatedAt', now_text
  ), updated_at = now() where parent_id = choice_data->>'grantorId' and data->>'applicationId' = p_application_id;

  update public.students set data = data || jsonb_build_object(
    'grantorArchiveChoice', next_choice,
    'scholarships', coalesce((select jsonb_agg(
      case when entry->>'applicationId' = p_application_id then (entry - 'workflowPaused') || jsonb_build_object(
        'grantorAccountArchived', grantor_is_archived, 'grantorArchiveDecision', 'keep',
        'servicingOwner', case when grantor_is_archived then 'admin' else 'grantor' end, 'updatedAt', now_text)
      else entry end order by ordinal)
      from jsonb_array_elements(coalesce(data->'scholarships', '[]')) with ordinality scholarship(entry, ordinal)
      where not (entry->>'applicationId' = any(closed_ids))), '[]'::jsonb),
    'scholarshipApplicationHistory', coalesce(data->'scholarshipApplicationHistory', '[]'::jsonb) || coalesce((
      select jsonb_agg(application.data || jsonb_build_object('id', application.id))
      from public.scholarship_applications application where application.id = any(closed_ids)
    ), '[]'::jsonb),
    'updatedAt', now_text
  ), updated_at = now() where id = p_student_id returning data into final_student;

  if not grantor_is_archived then
    update public.students set data = (data - 'grantorArchiveChoice') || jsonb_build_object(
      'grantorArchiveChoiceHistory', coalesce(data->'grantorArchiveChoiceHistory', '[]'::jsonb) ||
        jsonb_build_array(next_choice || jsonb_build_object('resolution', 'kept_after_restore', 'resolvedAt', now_text))
    ), updated_at = now() where id = p_student_id returning data into final_student;
  end if;

  insert into public."studentNotifications"(id, data, updated_at)
  values (concat('grantor_archive_keep_', p_application_id, '_', md5(choice_data->>'archivedAt')),
    jsonb_build_object('studentId', p_student_id, 'type', 'grantor_archive_choice_resolved',
      'title', 'Scholarship Kept',
      'message', case when grantor_is_archived
        then 'Your scholarship is preserved and will continue under administrator management.'
        else 'Your scholarship is preserved and will continue under grantor management.' end,
      'grantorId', choice_data->>'grantorId', 'applicationId', p_application_id,
      'route', '/student-dashboard/scholarships', 'read', false, 'createdAt', now_text, 'updatedAt', now_text), now())
  on conflict(id) do nothing;

  return jsonb_build_object('idempotent', false, 'student', final_student, 'choice', next_choice,
    'closedApplicationIds', to_jsonb(closed_ids));
end;
$$;

revoke all on function public.sync_archived_grantor_scholar_choices(text, boolean, text) from public, anon, authenticated;
revoke all on function public.reserve_archived_grantor_replacement_application(text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.commit_archived_grantor_replacement(text, text) from public, anon, authenticated;
revoke all on function public.withdraw_archived_grantor_replacement(text, text) from public, anon, authenticated;
revoke all on function public.resolve_archived_grantor_scholar_choice(text, text, text) from public, anon, authenticated;
grant execute on function public.sync_archived_grantor_scholar_choices(text, boolean, text) to service_role;
grant execute on function public.reserve_archived_grantor_replacement_application(text, text, text, text, text) to service_role;
grant execute on function public.commit_archived_grantor_replacement(text, text) to service_role;
grant execute on function public.withdraw_archived_grantor_replacement(text, text) to service_role;
grant execute on function public.resolve_archived_grantor_scholar_choice(text, text, text) to service_role;

commit;
