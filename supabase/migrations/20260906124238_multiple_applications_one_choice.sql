-- Rollout prerequisite: scholarship-slots.sql. Do not enable the API feature flag
-- until all student and grantor callers have migrated to the transactional routes.

create or replace function public.scholarship_application_open(p_data jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(p_data->>'archived', 'false') <> 'true'
    and coalesce(p_data->>'frozen', 'false') <> 'true'
    and coalesce(p_data->>'rejected', 'false') <> 'true'
    and lower(coalesce(p_data->>'status', '')) !~
      '(rejected|denied|declined|cancelled|canceled|withdrawn|archived|resolved|expired)';
$$;

create or replace function public.scholarship_document_versions(p_student jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
  from jsonb_each(p_student)
  where key in ('corFile', 'corDocument', 'cor', 'rogFile', 'cogFile',
    'rogDocument', 'cogDocument', 'rog', 'cog', 'schoolIdFile',
    'studentIdFile', 'validIdFile', 'idFile');
$$;

create or replace function public.scholarship_document_url(p_student jsonb, p_keys text[])
returns text language sql immutable set search_path = '' as $$
  select coalesce(nullif(p_student->k.key->>'url', ''),
    case when jsonb_typeof(p_student->k.key) = 'string' then p_student->>k.key else null end)
  from unnest(p_keys) with ordinality k(key, position)
  where coalesce(nullif(p_student->k.key->>'url', ''),
    case when jsonb_typeof(p_student->k.key) = 'string' then p_student->>k.key else null end) is not null
  order by k.position limit 1;
$$;

create or replace function public.serialize_scholarship_mutation()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(734821, 1);
  return null;
end;
$$;
create trigger scholarship_student_write_lock before insert or update or delete on public.students
for each statement execute function public.serialize_scholarship_mutation();
create trigger scholarship_application_write_lock before insert or update or delete on public.scholarship_applications
for each statement execute function public.serialize_scholarship_mutation();
create trigger scholarship_capacity_write_lock before insert or update or delete on public.grantor_portal_announcements
for each statement execute function public.serialize_scholarship_mutation();
create trigger scholarship_material_write_lock before insert or update or delete on public.soe_requests
for each statement execute function public.serialize_scholarship_mutation();
create trigger scholarship_roster_write_lock before insert or update or delete on public.grantor_portal_scholars
for each statement execute function public.serialize_scholarship_mutation();

-- One transaction lock also covers the legacy slot RPCs during the rollout.
-- Acquiring it before any row lock avoids opposite app/student/announcement
-- lock orders in the old functions. Calls are short; no network I/O holds it.
alter function public.configure_scholarship_slots(text, text, integer)
  rename to configure_scholarship_slots_before_choice;
alter function public.apply_scholarship_with_slot(text, text, text, text, jsonb, jsonb)
  rename to apply_scholarship_with_slot_before_choice;
alter function public.release_scholarship_slot_for_application(text, jsonb)
  rename to release_scholarship_slot_before_choice;

create or replace function public.configure_scholarship_slots(
  p_announcement_id text, p_grantor_id text, p_total_slots integer
) returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(734821, 1);
  return public.configure_scholarship_slots_before_choice(p_announcement_id, p_grantor_id, p_total_slots);
end;
$$;

create or replace function public.apply_scholarship_with_slot(
  p_announcement_id text, p_grantor_id text, p_student_id text,
  p_application_id text, p_application_data jsonb, p_student_update jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(734821, 1);
  return public.apply_scholarship_with_slot_before_choice(p_announcement_id, p_grantor_id,
    p_student_id, p_application_id, p_application_data, p_student_update);
end;
$$;

create or replace function public.release_scholarship_slot_for_application(
  p_application_id text, p_application_patch jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  result jsonb;
  application_data jsonb;
begin
  perform pg_advisory_xact_lock(734821, 1);
  select data into application_data from public.scholarship_applications
    where id = p_application_id for update;
  if application_data->>'closureReason' in ('selected_another_scholarship', 'student_withdrawal') then
    raise exception 'application_closed';
  end if;
  result := public.release_scholarship_slot_before_choice(p_application_id, p_application_patch);
  perform set_config('bulsuscholar.choice_write', 'true', true);
  if not public.scholarship_application_open(application_data || p_application_patch) then
    update public.students set data = (data - 'scholarshipCommitment') ||
      jsonb_build_object('scholarships', coalesce((
        select jsonb_agg(case when entry->>'applicationId' = p_application_id
          or entry->>'applicationNumber' = application_data->>'applicationNumber'
          then entry || p_application_patch || jsonb_build_object('isLocked', false)
          else entry end)
        from jsonb_array_elements(coalesce(data->'scholarships', '[]')) entry
      ), '[]'::jsonb)), updated_at = now()
    where id = application_data->>'studentId'
      and data#>>'{scholarshipCommitment,applicationId}' = p_application_id;
  end if;
  return result;
end;
$$;

create or replace function public.reserve_scholarship_application(
  p_student_id text, p_announcement_id text, p_grantor_id text,
  p_application_id text, p_application_number text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  s jsonb;
  a jsonb;
  app jsonb;
  entry jsonb;
  existing record;
  minimum_grade numeric;
  student_grade numeric;
  remaining integer;
  cycle text;
  invited boolean;
begin
  perform pg_advisory_xact_lock(734821, 1);
  perform set_config('bulsuscholar.choice_write', 'true', true);
  select data into s from public.students where id = p_student_id for update;
  if not found then raise exception 'student_not_found'; end if;
  if s->>'archived' = 'true' or s->>'disabled' = 'true' or s->>'adminBlocked' = 'true'
    or lower(coalesce(s->>'status', '')) in ('archived', 'inactive', 'disabled', 'blocked') then
    raise exception 'student_account_blocked';
  end if;
  if s->>'commitmentRequiresResolution' = 'true' then raise exception 'commitment_requires_resolution'; end if;
  if exists(select 1 from public.grantor_portal_scholars roster
    where coalesce(roster.data->>'studentId', roster.data->>'studentnumber', roster.data->>'studentNumber') = p_student_id
      and coalesce(roster.data->>'archived', 'false') <> 'true'
      and lower(coalesce(roster.data->>'status', '')) in ('active', 'approved', 'awarded', 'accepted')
      and not exists(select 1 from public.scholarship_applications pending
        where pending.data->>'studentId' = p_student_id and pending.data->>'grantorId' = roster.parent_id
          and pending.data->>'lifecycleVersion' = '2' and public.scholarship_application_open(pending.data))) then
    raise exception 'commitment_requires_resolution';
  end if;
  if nullif(s#>>'{scholarshipCommitment,applicationId}', '') is not null
    or exists(select 1 from jsonb_array_elements(coalesce(s->'scholarships', '[]')) e
      where public.scholarship_application_open(e) and (e->>'isLocked' = 'true'
        or lower(coalesce(e->>'status', '')) in ('awarded', 'accepted', 'finalized')
        or nullif(e->>'requestedSoeAt', '') is not null)) then
    raise exception 'scholarship_already_committed';
  end if;
  select id, data into existing from public.scholarship_applications
    where data->>'studentId' = p_student_id
      and coalesce(data->>'grantorId', data->>'providerId') = p_grantor_id
      and public.scholarship_application_open(data) order by id limit 1 for update;
  if found then
    if existing.data->>'announcementId' = p_announcement_id then
      return jsonb_build_object('applicationId', existing.id, 'student', s, 'idempotent', true);
    end if;
    raise exception 'grantor_application_exists';
  end if;
  if exists(select 1 from public.scholarship_applications where data->>'studentId' = p_student_id
    and coalesce(data->>'grantorId', data->>'providerId') = p_grantor_id
    and (nullif(data->>'cooldownUntil', '')::timestamptz > now() or
      (lower(coalesce(data->>'status', '')) in ('rejected', 'denied', 'declined')
        and coalesce(nullif(data->>'rejectedAt', '')::timestamptz, updated_at) + interval '24 hours' > now()))) then
    raise exception 'reapply_cooldown_active';
  end if;
  if not exists(select 1 from public.grantor_portals where id = p_grantor_id)
    or exists(select 1 from (select data from public.grantor_portals where id = p_grantor_id
      union all select data from public.providers where id = p_grantor_id) g
      where g.data->>'archived' = 'true' or g.data->>'disabled' = 'true'
        or g.data->>'applicationsBlocked' = 'true'
        or lower(coalesce(g.data->>'status', '')) in ('archived', 'inactive', 'disabled')) then
    raise exception 'grantor_archived';
  end if;
  select data into a from public.grantor_portal_announcements
    where id = p_announcement_id and parent_id = p_grantor_id for update;
  if not found then raise exception 'announcement_not_found'; end if;
  select exists(select 1 from jsonb_array_elements(coalesce(s->'scholarshipInvitations', '[]')) i
    where coalesce(i->>'grantorId', i->>'providerId') = p_grantor_id
      and (i->>'announcementId' = p_announcement_id or (nullif(i->>'announcementId', '') is null
        and lower(trim(i->>'scholarshipName')) = lower(trim(coalesce(a->>'scholarshipTitle', a->>'title')))))
      and lower(coalesce(i->>'status', 'pending')) in ('pending', 'invited')) into invited;
  if not invited and exists(select 1 from jsonb_array_elements(
    coalesce(s->'scholarships', '[]') || coalesce(s->'previousScholars', '[]')) e
    where coalesce(e->>'blockedGrantorId', e->>'grantorId', e->>'providerId') = p_grantor_id
      and coalesce(e->>'closureReason', '') not in ('student_withdrawal', 'selected_another_scholarship')
      and coalesce(e->>'rejected', 'false') <> 'true'
      and lower(coalesce(e->>'status', '')) !~ '(rejected|denied|declined)'
      and (e->>'archived' = 'true' or e->>'frozen' = 'true'
        or lower(coalesce(e->>'status', '')) ~ '(archived|frozen)')) then
    raise exception 'archived_grantor_block';
  end if;
  select data into a from public.grantor_portal_announcements
    where id = p_announcement_id and parent_id = p_grantor_id for update;
  if not found then raise exception 'announcement_not_found'; end if;
  if coalesce(a->>'applicationEnabled', 'false') <> 'true'
    or a->>'archived' = 'true' or a->>'hiddenFromStudents' = 'true'
    or lower(coalesce(a->>'status', '')) in ('archived', 'closed', 'ended')
    or nullif(a->>'endDate', '')::timestamptz < now()
    or nullif(a->>'startDate', '')::timestamptz > now() then
    raise exception 'announcement_not_open_for_applications';
  end if;
  if coalesce(a->>'slotsConfigured', 'false') <> 'true' then raise exception 'slots_not_configured'; end if;
  remaining := greatest(coalesce((a->>'remainingSlots')::integer, 0), 0);
  if remaining < 1 then raise exception 'scholarship_full'; end if;
  minimum_grade := coalesce(nullif(a->>'minimumGrade', '')::numeric,
    nullif(a->>'minimumGwa', '')::numeric, nullif(a->>'minGwa', '')::numeric, 2.25);
  student_grade := coalesce(nullif(s->>'gwa', '')::numeric, nullif(s->>'currentGwa', '')::numeric);
  if student_grade is null or student_grade > minimum_grade or student_grade < 1 then
    raise exception 'scholarship_ineligible';
  end if;
  if (a#>>'{requiredDocuments,cor}' = 'true' and public.scholarship_document_url(s, array['corFile','corDocument','cor']) is null)
    or (a#>>'{requiredDocuments,cog}' = 'true' and public.scholarship_document_url(s, array['rogFile','cogFile','rogDocument','cogDocument','rog','cog']) is null)
    or (a#>>'{requiredDocuments,applicationForm}' = 'true' and public.scholarship_document_url(s, array['scholarshipApplicationFile','applicationFormFile','scholarshipFormFile']) is null) then
    raise exception 'scholarship_ineligible';
  end if;
  cycle := coalesce(nullif(a->>'semesterTag', ''),
    case when extract(month from now()) >= 7 then
      extract(year from now())::integer::text || '-' || (extract(year from now())::integer + 1)::text || '-1ST'
    else (extract(year from now())::integer - 1)::text || '-' || extract(year from now())::integer::text || '-2ND' end);
  entry := jsonb_build_object('id', p_application_number, 'applicationNumber', p_application_number,
    'applicationId', p_application_id, 'requestNumber', p_application_number,
    'announcementId', p_announcement_id, 'grantorId', p_grantor_id,
    'name', coalesce(a->>'scholarshipTitle', a->>'scholarshipName', a->>'title'),
    'otherRequirements', coalesce(a->'otherRequirements', '[]'),
    'requiredDocuments', coalesce(a->'requiredDocuments', '{}'),
    'customApplicationProfile', a->'customApplicationProfile', 'customApplicationForm', a->'customApplicationForm',
    'minimumGrade', minimum_grade, 'minGwa', minimum_grade,
    'provider', coalesce(a->>'providerLabel', a->>'grantorName', a->>'title'),
    'grantorName', coalesce(a->>'grantorName', a->>'providerLabel'), 'providerType', a->>'providerType',
    'status', 'Applied', 'isLocked', false, 'appliedAt', now()::text,
    'appliedViaAnnouncement', true, 'semesterTag', cycle, 'lifecycleVersion', 2,
    'tracking', jsonb_build_object('completedStepIds', jsonb_build_array('account', 'announcement_apply',
      case when a->>'providerType' = 'kuya_win' then 'kwsp_apply' else 'scholarship_apply' end), 'history', '[]'::jsonb));
  app := entry || jsonb_build_object('id', p_application_id, 'studentId', p_student_id,
    'gwa', s->>'gwa', 'course', s->>'course', 'yearLevel', s->>'yearLevel', 'email', s->>'email',
    'studentSnapshot', jsonb_build_object('fullName', coalesce(s->>'fullName', concat_ws(' ', s->>'fname', s->>'mname', s->>'lname')),
      'studentId', p_student_id, 'course', s->>'course', 'yearLevel', s->>'yearLevel'),
    'studentNumber', coalesce(s->>'studentnumber', s->>'studentNumber', p_student_id),
    'fullName', coalesce(s->>'fullName', concat_ws(' ', s->>'fname', s->>'mname', s->>'lname')),
    'scholarshipId', p_application_number, 'scholarshipName', entry->>'name',
    'slotReserved', true, 'slotReservedAt', now()::text, 'slotReleasedAt', null,
    'createdAt', now()::text, 'updatedAt', now()::text);
  insert into public.scholarship_applications(id, data) values(p_application_id, app);
  update public.students set data = data || jsonb_build_object('scholarships',
    coalesce(data->'scholarships', '[]') || jsonb_build_array(entry), 'scholarshipLifecycleVersion', 2,
    'scholarshipInvitations', case when invited then coalesce((select jsonb_agg(case
      when coalesce(i->>'grantorId', i->>'providerId') = p_grantor_id and
        (i->>'announcementId' = p_announcement_id or (nullif(i->>'announcementId', '') is null and
          lower(trim(i->>'scholarshipName')) = lower(trim(coalesce(a->>'scholarshipTitle', a->>'title')))))
      then i || jsonb_build_object('status', 'Accepted', 'acceptedAt', now()::text) else i end)
      from jsonb_array_elements(coalesce(data->'scholarshipInvitations','[]')) i), '[]')
      else coalesce(data->'scholarshipInvitations', '[]') end),
    updated_at = now() where id = p_student_id returning data into s;
  update public.grantor_portal_announcements set data = data || jsonb_build_object('remainingSlots', remaining - 1),
    updated_at = now() where id = p_announcement_id and parent_id = p_grantor_id;
  insert into public."grantorNotifications"(id, data, updated_at) values (
    'application_' || p_application_id, jsonb_build_object('grantorId', p_grantor_id,
      'studentId', p_student_id, 'applicationNumber', p_application_number,
      'type', 'application_submitted', 'title', 'New Student Application',
      'message', coalesce(app->>'fullName', 'A student') || ' applied for your scholarship.',
      'read', false, 'createdAt', now()::text), now()) on conflict(id) do nothing;
  return jsonb_build_object('applicationId', p_application_id, 'student', s,
    'remainingSlots', remaining - 1, 'idempotent', false);
end;
$$;

create or replace function public.guard_closed_scholarship_application()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  student_data jsonb;
begin
  if tg_op = 'INSERT' then
    if (new.data->>'lifecycleVersion' = '2' or exists(select 1 from public.students
      where id = new.data->>'studentId' and data->>'scholarshipLifecycleVersion' = '2'))
      and (current_user not in ('postgres', 'service_role') or coalesce(current_setting('bulsuscholar.choice_write', true), '') <> 'true') then
      raise exception 'application_workflow_required';
    end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    if old.data->>'lifecycleVersion' = '2' then raise exception 'application_history_required'; end if;
    if old.data->>'closureReason' in ('selected_another_scholarship', 'student_withdrawal') then
      raise exception 'application_closed';
    end if;
    return old;
  end if;
    if old.data->>'closureReason' in ('selected_another_scholarship', 'student_withdrawal')
      and new.data is distinct from old.data then
      raise exception 'application_closed';
    end if;
    if old.data->>'lifecycleVersion' = '2' and not public.scholarship_application_open(old.data)
      and public.scholarship_application_open(new.data) then
      raise exception 'application_closed';
    end if;
  if old.data->>'lifecycleVersion' = '2' and current_user not in ('postgres', 'service_role')
    and new.data is distinct from old.data then
    raise exception 'application_workflow_required';
  end if;
  if (new.data->>'lifecycleVersion' = '2' or current_user in ('postgres', 'service_role'))
    and coalesce(new.data#>'{tracking,completedStepIds}', '[]'::jsonb) ? 'document_review'
    and not (coalesce(old.data#>'{tracking,completedStepIds}', '[]'::jsonb) ? 'document_review') then
    select data into student_data from public.students where id = new.data->>'studentId';
    new.data := new.data || jsonb_build_object('reviewedDocumentVersions',
      public.scholarship_document_versions(coalesce(student_data, '{}'::jsonb)),
      'reviewedApplicationFormVersion', new.data->'applicationFormFile',
      'reviewedOtherRequirementVersions', new.data->'otherRequirementUploads',
      'documentUrls', jsonb_build_object(
        'cor', coalesce(student_data#>>'{corFile,url}', student_data#>>'{corDocument,url}'),
        'cog', coalesce(student_data#>>'{rogFile,url}', student_data#>>'{cogFile,url}', student_data#>>'{rogDocument,url}'),
        'schoolId', coalesce(student_data#>>'{schoolIdFile,url}', student_data#>>'{studentIdFile,url}'),
        'applicationForm', new.data#>>'{applicationFormFile,url}'));
  end if;
  return new;
end;
$$;

create trigger scholarship_application_history_guard
before insert or update or delete on public.scholarship_applications
for each row execute function public.guard_closed_scholarship_application();

create or replace function public.mutate_scholarship_choice(
  p_student_id text, p_application_id text, p_action text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  student_data jsonb;
  app_data jsonb;
  announcement_data jsonb;
  chosen_entry jsonb;
  commitment jsonb;
  competitor record;
  closed_ids text[] := '{}';
  request_id text;
  request_data jsonb;
  now_text text := now()::text;
  grantor_id text;
  closure_reason text;
  closure_message text;
  release_result jsonb;
begin
  if p_action not in ('choose', 'withdraw') then raise exception 'invalid_choice_action'; end if;
  perform pg_advisory_xact_lock(734821, 1);
  perform set_config('bulsuscholar.choice_write', 'true', true);
  select data into student_data from public.students where id = p_student_id for update;
  if not found then raise exception 'student_not_found'; end if;
  select data into app_data from public.scholarship_applications
    where id = p_application_id and data->>'studentId' = p_student_id for update;
  if not found then raise exception 'application_not_found'; end if;
  commitment := student_data->'scholarshipCommitment';

  if p_action = 'withdraw' and app_data->>'closureReason' = 'student_withdrawal' then
    return jsonb_build_object('idempotent', true, 'student', student_data);
  end if;
  if not public.scholarship_application_open(app_data) then raise exception 'application_closed'; end if;
  if student_data->>'commitmentRequiresResolution' = 'true' then
    raise exception 'commitment_requires_resolution';
  end if;
  if commitment->>'applicationId' is not null
    and (p_action = 'withdraw' or commitment->>'applicationId' <> p_application_id) then
    raise exception 'scholarship_already_committed';
  end if;
  if exists (select 1 from jsonb_array_elements(coalesce(student_data->'scholarships', '[]')) e
    where public.scholarship_application_open(e) and
      (e->>'isLocked' = 'true' or lower(e->>'status') in ('awarded', 'accepted', 'finalized'))
      and (p_action = 'withdraw' or coalesce(e->>'applicationNumber', e->>'id', '') <>
        coalesce(app_data->>'applicationNumber', p_application_id))) then
    raise exception 'scholarship_already_committed';
  end if;
  if student_data->>'archived' = 'true' or student_data->>'disabled' = 'true'
    or student_data->>'adminBlocked' = 'true'
    or lower(coalesce(student_data->>'status', '')) in ('archived', 'inactive', 'disabled', 'blocked') then
    raise exception 'student_account_blocked';
  end if;
  grantor_id := coalesce(app_data->>'grantorId', app_data->>'providerId');
  select e into chosen_entry from jsonb_array_elements(coalesce(student_data->'scholarships', '[]')) e
    where e->>'applicationId' = p_application_id
      or (e->>'applicationNumber' = app_data->>'applicationNumber'
        and coalesce(e->>'grantorId', e->>'providerId') = grantor_id)
    limit 1;
  if chosen_entry is null then raise exception 'application_not_found'; end if;

  if p_action = 'choose' then
    if not exists (select 1 from public.grantor_portals where id = grantor_id)
      or exists (select 1 from (
        select data from public.grantor_portals where id = grantor_id
        union all select data from public.providers where id = grantor_id
      ) g where g.data->>'archived' = 'true' or g.data->>'disabled' = 'true'
        or lower(coalesce(g.data->>'status', '')) in ('archived', 'inactive', 'disabled')) then
      raise exception 'grantor_archived';
    end if;
    select data into announcement_data from public.grantor_portal_announcements
      where id = app_data->>'announcementId' and parent_id = grantor_id for update;
    if not found or announcement_data->>'archived' = 'true'
      or announcement_data->>'hiddenFromStudents' = 'true'
      or lower(coalesce(announcement_data->>'status', '')) = 'archived' then
      raise exception 'announcement_not_open_for_applications';
    end if;
    if app_data->>'lifecycleVersion' = '2' and (
      coalesce(nullif(student_data->>'gwa','')::numeric, nullif(student_data->>'currentGwa','')::numeric, 99) >
        coalesce(nullif(announcement_data->>'minimumGrade','')::numeric,
          nullif(announcement_data->>'minimumGwa','')::numeric, nullif(announcement_data->>'minGwa','')::numeric, 2.25)
      or public.scholarship_document_url(student_data, array['corFile','corDocument','cor']) is null
      or public.scholarship_document_url(student_data, array['rogFile','cogFile','rogDocument','cogDocument','rog','cog']) is null
      or public.scholarship_document_url(student_data, array['schoolIdFile','studentIdFile','validIdFile','idFile']) is null) then
      raise exception 'scholarship_ineligible';
    end if;
    -- An application deadline is deliberately not checked for an existing application.
    if app_data->>'slotReserved' <> 'true' or app_data->>'slotReserved' is null
      or nullif(app_data->>'slotReleasedAt', '') is not null then
      raise exception 'slot_reservation_missing';
    end if;
    if commitment->>'applicationId' is distinct from p_application_id then
    if app_data->>'adminBlocked' = 'true' or chosen_entry->>'adminBlocked' = 'true'
      or not (coalesce(app_data#>'{tracking,completedStepIds}', '[]') ? 'document_review') then
      raise exception 'document_review_required';
    end if;
    if app_data->'reviewedDocumentVersions' is distinct from public.scholarship_document_versions(student_data) then
      raise exception 'document_versions_changed';
    end if;
    if app_data->>'lifecycleVersion' = '2' and (
      nullif(app_data#>>'{applicationFormFile,url}', '') is null
      or app_data->'applicationFormFile' is distinct from app_data->'reviewedApplicationFormVersion'
      or coalesce(app_data->'otherRequirementUploads', 'null') is distinct from coalesce(app_data->'reviewedOtherRequirementVersions', 'null')) then
      raise exception 'document_review_required';
    end if;
    if app_data->>'providerType' = 'kuya_win' and not (
      coalesce(app_data#>'{tracking,completedStepIds}', '[]') ?&
      array['admin_review', 'interview', 'application_review', 'final_screening']) then
      raise exception 'document_review_required';
    end if;
    end if;
    request_id := 'choice_' || p_application_id;
    select data into request_data from public.soe_requests where id = request_id;
    if commitment->>'applicationId' = p_application_id and request_data is not null
      and lower(coalesce(request_data->>'status', '')) <> 'rejected' then
      return jsonb_build_object('idempotent', true, 'student', student_data, 'materialRequest', request_data);
    end if;
    commitment := coalesce(nullif(commitment, 'null'::jsonb), jsonb_build_object(
      'applicationId', p_application_id, 'applicationNumber', app_data->>'applicationNumber',
      'grantorId', grantor_id, 'announcementId', app_data->>'announcementId',
      'scholarshipId', chosen_entry->>'id', 'semesterTag', app_data->>'semesterTag', 'selectedAt', now_text));
    chosen_entry := chosen_entry || jsonb_build_object('applicationId', p_application_id,
      'isLocked', true, 'status', 'Finalized', 'finalizedState', 'Pending Approval', 'requestedSoeAt', now_text);
    update public.scholarship_applications set data = data || jsonb_build_object(
      'committedAt', commitment->>'selectedAt', 'updatedAt', now_text), updated_at = now()
      where id = p_application_id;
    request_data := jsonb_build_object('id', request_id, 'studentId', p_student_id,
      'studentName', coalesce(app_data->>'fullName', app_data->>'studentName', p_student_id),
      'applicationId', p_application_id, 'applicationNumber', app_data->>'applicationNumber',
      'requestNumber', request_id, 'scholarshipId', chosen_entry->>'id',
      'scholarshipName', coalesce(chosen_entry->>'name', app_data->>'scholarshipName'),
      'grantorId', grantor_id, 'providerType', app_data->>'providerType',
      'semesterTag', app_data->>'semesterTag', 'status', 'Pending', 'reviewState', 'incoming',
      'materialKey', 'soe', 'requestType', 'SOE', 'timestamp', now_text,
      'createdAt', coalesce(request_data->>'createdAt', now_text), 'updatedAt', now_text,
      'requestedMaterials', jsonb_build_object('soe', true), 'materials', jsonb_build_object(
        'soe', jsonb_build_object('requested', true, 'status', 'pending', 'requestedAt', now_text)));
    insert into public.soe_requests(id, data, updated_at) values(request_id, request_data, now())
      on conflict(id) do update set data = excluded.data, updated_at = excluded.updated_at;
    closure_reason := 'selected_another_scholarship';
    closure_message := 'Student selected another scholarship';
  else
    closure_reason := 'student_withdrawal';
    closure_message := 'Student withdrew their application';
  end if;

  for competitor in select id, data from public.scholarship_applications
    where data->>'studentId' = p_student_id and public.scholarship_application_open(data)
      and ((p_action = 'choose' and id <> p_application_id) or
        (p_action = 'withdraw' and id = p_application_id))
    order by id for update
  loop
    release_result := public.release_scholarship_slot_before_choice(competitor.id,
      jsonb_build_object('archived', true, 'status', 'Archived', 'closureReason', closure_reason,
        'closureMessage', closure_message, 'closedAt', now_text, 'readOnly', true,
        'documentUrls', coalesce(competitor.data->'documentUrls', jsonb_build_object(
          'cor', public.scholarship_document_url(student_data, array['corFile','corDocument','cor']),
          'cog', public.scholarship_document_url(student_data, array['rogFile','cogFile','rogDocument','cogDocument','rog','cog']),
          'schoolId', public.scholarship_document_url(student_data, array['schoolIdFile','studentIdFile','validIdFile','idFile']),
          'applicationForm', competitor.data#>>'{applicationFormFile,url}')),
        'updatedAt', now_text, 'cooldownUntil', case when p_action = 'withdraw'
          then (now() + interval '24 hours')::text else null end));
    if competitor.data->>'slotReserved' = 'true'
      and nullif(competitor.data->>'slotReleasedAt', '') is null
      and release_result->>'released' is distinct from 'true' then
      raise exception 'slot_reservation_missing';
    end if;
    closed_ids := array_append(closed_ids, competitor.id);
    insert into public."grantorNotifications"(id, data, updated_at)
      values ('choice_closed_' || competitor.id, jsonb_build_object(
        'grantorId', coalesce(competitor.data->>'grantorId', competitor.data->>'providerId'),
        'studentId', p_student_id, 'applicationNumber', competitor.data->>'applicationNumber',
        'type', 'application_closed', 'title', 'Application closed', 'message', closure_message,
        'read', false, 'createdAt', now_text), now()) on conflict(id) do nothing;
  end loop;

  select coalesce(jsonb_agg(e), '[]'::jsonb) into student_data
    from jsonb_array_elements(coalesce(student_data->'scholarships', '[]')) e
    where not exists (select 1 from public.scholarship_applications a
      where a.id = any(closed_ids) and (e->>'applicationId' = a.id or
        (e->>'applicationNumber' = a.data->>'applicationNumber' and
          coalesce(e->>'grantorId', e->>'providerId') = coalesce(a.data->>'grantorId', a.data->>'providerId'))));
  if p_action = 'choose' then
    select coalesce(jsonb_agg(case when e->>'id' = chosen_entry->>'id' then chosen_entry else e end), '[]')
      into student_data from jsonb_array_elements(student_data) e;
  end if;
  update public.students set data = data || jsonb_build_object('scholarships', student_data,
    'updatedAt', now_text, 'scholarshipApplicationHistory', coalesce(data->'scholarshipApplicationHistory', '[]') ||
      coalesce((select jsonb_agg(a.data || jsonb_build_object('id', a.id))
        from public.scholarship_applications a where a.id = any(closed_ids)), '[]')) || case when p_action = 'choose'
      then jsonb_build_object('scholarshipCommitment', commitment) else '{}'::jsonb end,
    updated_at = now() where id = p_student_id returning data into student_data;
  if p_action = 'choose' and app_data->>'lifecycleVersion' = '2' and app_data->>'providerType' = 'kuya_win'
    and not exists(select 1 from public.grantor_portal_scholars where parent_id = grantor_id
      and data->>'applicationId' = p_application_id) then
    insert into public.grantor_portal_scholars(id, parent_id, data, updated_at)
      values('choice_' || p_application_id, grantor_id,
        (select coalesce(jsonb_object_agg(key, value), '{}') from jsonb_each(student_data)
          where key in ('fname','mname','lname','email','cpNumber','street','city','province','barangay','postalCode','course','yearLevel','gwa')) ||
        jsonb_build_object('studentId', p_student_id, 'fullName', app_data->>'fullName',
          'grantorId', grantor_id, 'grantorName', chosen_entry->>'grantorName', 'providerType', app_data->>'providerType',
          'scholarshipTitle', chosen_entry->>'name', 'scholarshipId', chosen_entry->>'id',
          'applicationId', p_application_id, 'applicationNumber', app_data->>'applicationNumber',
          'status', 'Active', 'archived', false, 'selectionManaged', true, 'createdAt', now_text), now());
  end if;
  insert into public."studentNotifications"(id, data, updated_at)
    values('choice_' || p_action || '_' || p_application_id, jsonb_build_object(
      'studentId', p_student_id, 'type', 'scholarship_choice', 'title', case when p_action = 'choose'
        then 'Scholarship selected' else 'Application withdrawn' end,
      'message', case when p_action = 'choose' then 'Your scholarship selection and SOE request were submitted. Other applications were closed.'
        else 'Your application was withdrawn. You may apply to this grantor again after 24 hours.' end,
      'read', false, 'createdAt', now_text), now()) on conflict(id) do nothing;
  if p_action = 'choose' then
    insert into public."grantorNotifications"(id, data, updated_at)
      values('choice_selected_' || p_application_id, jsonb_build_object('grantorId', grantor_id,
        'studentId', p_student_id, 'applicationNumber', app_data->>'applicationNumber',
        'type', 'scholarship_selected', 'title', 'Scholarship selected',
        'message', 'Student selected your scholarship and requested materials.',
        'read', false, 'createdAt', now_text), now()) on conflict(id) do nothing;
  end if;
  return jsonb_build_object('idempotent', false, 'student', student_data,
    'closedApplicationIds', to_jsonb(closed_ids), 'materialRequest', request_data);
end;
$$;

create or replace function public.protect_student_scholarship_state()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if old.data->>'scholarshipLifecycleVersion' = '2'
    and coalesce(current_setting('bulsuscholar.choice_write', true), '') <> 'true' then
    new.data := (new.data - 'scholarshipCommitment' - 'scholarshipApplicationHistory' - 'scholarships') ||
      jsonb_build_object('scholarshipLifecycleVersion', 2, 'scholarships', old.data->'scholarships',
        'scholarshipApplicationHistory', coalesce(old.data->'scholarshipApplicationHistory', '[]')) ||
      case when old.data ? 'scholarshipCommitment'
        then jsonb_build_object('scholarshipCommitment', old.data->'scholarshipCommitment') else '{}'::jsonb end;
  end if;
  return new;
end;
$$;
create trigger student_scholarship_state_guard before update on public.students
for each row execute function public.protect_student_scholarship_state();

create or replace function public.guard_scholarship_roster_commitment()
returns trigger language plpgsql security definer set search_path = '' as $$
declare s jsonb; a jsonb;
begin
  if not public.scholarship_application_open(new.data) then return new; end if;
  select data into s from public.students
    where id = coalesce(new.data->>'studentId', new.data->>'studentnumber', new.data->>'studentNumber');
  if s->>'scholarshipLifecycleVersion' = '2' then
    select data into a from public.scholarship_applications where id = s#>>'{scholarshipCommitment,applicationId}';
    if a is null or not public.scholarship_application_open(a)
      or a->>'grantorId' is distinct from new.parent_id
      or (nullif(new.data->>'applicationId', '') is not null
        and new.data->>'applicationId' is distinct from s#>>'{scholarshipCommitment,applicationId}') then
      raise exception 'scholarship_choice_required';
    end if;
    new.data := new.data || jsonb_build_object('applicationId', s#>>'{scholarshipCommitment,applicationId}',
      'applicationNumber', a->>'applicationNumber', 'scholarshipId', a->>'scholarshipId', 'grantorId', new.parent_id);
  end if;
  return new;
end;
$$;
create trigger scholarship_roster_commitment_guard before insert or update on public.grantor_portal_scholars
for each row execute function public.guard_scholarship_roster_commitment();
revoke all on function public.guard_scholarship_roster_commitment() from public, anon, authenticated;

create or replace function public.sync_application_tracking_to_student()
returns trigger language plpgsql security definer set search_path = '' as $$
declare old_mode text;
begin
  if new.data->>'lifecycleVersion' <> '2' or new.data->>'lifecycleVersion' is null
    or not public.scholarship_application_open(new.data) then return new; end if;
  old_mode := coalesce(current_setting('bulsuscholar.choice_write', true), '');
  perform set_config('bulsuscholar.choice_write', 'true', true);
  update public.students set data = jsonb_set(data, '{scholarships}', coalesce((
    select jsonb_agg(case when e->>'applicationId' = new.id then e || jsonb_build_object(
      'tracking', new.data->'tracking', 'reviewedDocumentVersions', new.data->'reviewedDocumentVersions',
      'applicationFormFile', new.data->'applicationFormFile', 'otherRequirementUploads', new.data->'otherRequirementUploads',
      'status', case when e->>'isLocked' = 'true' then e->>'status' else new.data->>'status' end)
      else e end) from jsonb_array_elements(coalesce(data->'scholarships', '[]')) e), '[]')), updated_at = now()
    where id = new.data->>'studentId';
  perform set_config('bulsuscholar.choice_write', old_mode, true);
  return new;
end;
$$;
create trigger scholarship_application_tracking_sync after update on public.scholarship_applications
for each row execute function public.sync_application_tracking_to_student();

create or replace function public.close_terminal_scholarship_application()
returns trigger language plpgsql security definer set search_path = '' as $$
declare old_mode text;
begin
  if new.data->>'lifecycleVersion' = '2' and public.scholarship_application_open(old.data)
    and not public.scholarship_application_open(new.data)
    and coalesce(new.data->>'closureReason', '') not in ('selected_another_scholarship', 'student_withdrawal') then
    old_mode := coalesce(current_setting('bulsuscholar.choice_write', true), '');
    perform set_config('bulsuscholar.choice_write', 'true', true);
    if new.data->>'slotReserved' = 'true' and nullif(new.data->>'slotReleasedAt', '') is null then
      perform public.release_scholarship_slot_for_application(new.id, '{}'::jsonb);
    end if;
    update public.grantor_portal_scholars set data = data || jsonb_build_object(
      'archived', true, 'status', 'Rejected', 'rejected', true, 'closedAt', now()::text), updated_at = now()
      where data->>'selectionManaged' = 'true' and data->>'applicationId' = new.id;
    update public.students set data = (case when data#>>'{scholarshipCommitment,applicationId}' = new.id
      then data - 'scholarshipCommitment' else data end) || jsonb_build_object(
        'scholarships', coalesce((select jsonb_agg(e) from jsonb_array_elements(coalesce(data->'scholarships', '[]')) e
          where coalesce(e->>'applicationId', '') <> new.id), '[]'),
        'scholarshipApplicationHistory', coalesce(data->'scholarshipApplicationHistory', '[]') ||
          jsonb_build_array(new.data || jsonb_build_object('id', new.id, 'updatedAt', now()::text))),
      updated_at = now() where id = new.data->>'studentId';
    perform set_config('bulsuscholar.choice_write', old_mode, true);
  end if;
  return new;
end;
$$;
create trigger scholarship_application_terminal_state after update on public.scholarship_applications
for each row execute function public.close_terminal_scholarship_application();

create or replace function public.invalidate_changed_scholarship_documents()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if public.scholarship_document_versions(new.data) is distinct from public.scholarship_document_versions(old.data) then
    update public.scholarship_applications set data = (data - 'reviewedDocumentVersions') ||
      jsonb_build_object('tracking', coalesce(data->'tracking', '{}') || jsonb_build_object('completedStepIds',
        coalesce((select jsonb_agg(step) from jsonb_array_elements(coalesce(data#>'{tracking,completedStepIds}', '[]')) step
          where step #>> '{}' not in ('document_review', 'admin_review', 'interview', 'application_review', 'final_screening')), '[]'))),
      updated_at = now()
      where data->>'studentId' = new.id and data->>'lifecycleVersion' = '2'
        and public.scholarship_application_open(data) and nullif(data->>'committedAt', '') is null;
  end if;
  return new;
end;
$$;
create trigger scholarship_document_review_invalidation after update on public.students
for each row execute function public.invalidate_changed_scholarship_documents();

create or replace function public.guard_scholarship_material_identity()
returns trigger language plpgsql security definer set search_path = '' as $$
declare s jsonb;
begin
  select data into s from public.students where id = new.data->>'studentId';
  if s->>'scholarshipLifecycleVersion' = '2' then
    if nullif(s#>>'{scholarshipCommitment,applicationId}', '') is null
      and coalesce(current_setting('bulsuscholar.choice_write', true), '') <> 'true' then
      raise exception 'scholarship_choice_required';
    end if;
    if s#>>'{scholarshipCommitment,applicationId}' is not null and
      (new.data->>'applicationNumber' is distinct from s#>>'{scholarshipCommitment,applicationNumber}') then
      raise exception 'application_closed';
    end if;
  end if;
  return new;
end;
$$;
create trigger scholarship_material_identity_guard before insert or update on public.soe_requests
for each row execute function public.guard_scholarship_material_identity();

create or replace function public.update_scholarship_application_documents(
  p_student_id text, p_application_id text, p_field text, p_value jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare a jsonb; s jsonb;
begin
  if p_field not in ('applicationFormFile', 'otherRequirementUploads') or jsonb_typeof(p_value) <> 'object' then
    raise exception 'invalid_application_documents';
  end if;
  perform pg_advisory_xact_lock(734821, 1);
  select data into s from public.students where id = p_student_id for update;
  if not found or s->>'archived' = 'true' then raise exception 'student_account_blocked'; end if;
  select data into a from public.scholarship_applications where id = p_application_id
    and data->>'studentId' = p_student_id for update;
  if not found then raise exception 'application_not_found'; end if;
  if not public.scholarship_application_open(a) then raise exception 'application_closed'; end if;
  a := jsonb_set(a, array[p_field], p_value);
  if nullif(a->>'committedAt', '') is null then
    a := (a - 'reviewedDocumentVersions') || jsonb_build_object('tracking', coalesce(a->'tracking', '{}') ||
      jsonb_build_object('completedStepIds', coalesce((select jsonb_agg(step)
        from jsonb_array_elements(coalesce(a#>'{tracking,completedStepIds}', '[]')) step
        where step #>> '{}' not in ('document_review', 'admin_review', 'interview', 'application_review', 'final_screening')), '[]')));
  end if;
  update public.scholarship_applications set data = a, updated_at = now() where id = p_application_id;
  select data into s from public.students where id = p_student_id;
  return jsonb_build_object('student', s);
end;
$$;

revoke all on function public.scholarship_application_open(jsonb) from public, anon, authenticated;
revoke all on function public.scholarship_document_versions(jsonb) from public, anon, authenticated;
revoke all on function public.scholarship_document_url(jsonb, text[]) from public, anon, authenticated;
revoke all on function public.guard_closed_scholarship_application() from public, anon, authenticated;
revoke all on function public.configure_scholarship_slots(text, text, integer) from public, anon, authenticated;
revoke all on function public.apply_scholarship_with_slot(text, text, text, text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.release_scholarship_slot_for_application(text, jsonb) from public, anon, authenticated;
revoke all on function public.mutate_scholarship_choice(text, text, text) from public, anon, authenticated;
revoke all on function public.reserve_scholarship_application(text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.update_scholarship_application_documents(text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.serialize_scholarship_mutation(), public.protect_student_scholarship_state(),
  public.sync_application_tracking_to_student(), public.invalidate_changed_scholarship_documents(),
  public.close_terminal_scholarship_application() from public, anon, authenticated;
revoke all on function public.guard_scholarship_material_identity() from public, anon, authenticated;
grant execute on function public.scholarship_application_open(jsonb), public.scholarship_document_versions(jsonb),
  public.guard_closed_scholarship_application(), public.configure_scholarship_slots(text, text, integer),
  public.apply_scholarship_with_slot(text, text, text, text, jsonb, jsonb),
  public.release_scholarship_slot_for_application(text, jsonb),
  public.mutate_scholarship_choice(text, text, text) to service_role;
grant execute on function public.reserve_scholarship_application(text, text, text, text, text) to service_role;
grant execute on function public.update_scholarship_application_documents(text, text, text, jsonb) to service_role;
grant execute on function public.scholarship_document_url(jsonb, text[]) to service_role;

-- Preserve legacy awards and material-request commitments. Link only exact
-- application numbers; uncertain legacy records require office resolution.
create or replace function public.migrate_legacy_scholarship_choices(p_student_ids text[] default null)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare s record; e jsonb; a record; entries jsonb; candidates jsonb; candidate jsonb;
  matches integer; ambiguous boolean; linked boolean;
begin
  perform pg_advisory_xact_lock(734821, 1);
  perform set_config('bulsuscholar.choice_write', 'true', true);
  for s in select id, data from public.students where jsonb_typeof(data->'scholarships') = 'array'
    and jsonb_array_length(data->'scholarships') > 0
    and (p_student_ids is null or id = any(p_student_ids)) order by id for update
  loop
    if s.data->>'scholarshipLifecycleVersion' = '2' then continue; end if;
    entries := '[]'; candidates := '[]'; ambiguous := false; linked := false;
    for e in select value from jsonb_array_elements(s.data->'scholarships')
    loop
      if not public.scholarship_application_open(e) then
        entries := entries || jsonb_build_array(e); continue;
      end if;
      select count(*) into matches from public.scholarship_applications
        where data->>'studentId' = s.id and data->>'applicationNumber' = coalesce(e->>'applicationNumber', e->>'id')
          and (nullif(e->>'grantorId', '') is null or data->>'grantorId' = e->>'grantorId');
      if matches = 1 then
        select id, data into a from public.scholarship_applications
          where data->>'studentId' = s.id and data->>'applicationNumber' = coalesce(e->>'applicationNumber', e->>'id')
            and (nullif(e->>'grantorId', '') is null or data->>'grantorId' = e->>'grantorId');
        e := e || jsonb_build_object('applicationId', a.id, 'lifecycleVersion', 2,
          'grantorId', a.data->>'grantorId', 'announcementId', a.data->>'announcementId',
          'applicationFormFile', coalesce(e->'applicationFormFile', s.data->'scholarshipApplicationFile', s.data->'applicationFormFile'));
        if coalesce(e->>'isLocked', 'false') <> 'true' and nullif(e->>'requestedSoeAt', '') is null
          and lower(coalesce(e->>'status', '')) not in ('awarded', 'accepted', 'finalized') then
          e := e || jsonb_build_object('reviewMigrationRequired', true, 'tracking', coalesce(e->'tracking', '{}') ||
            jsonb_build_object('completedStepIds', coalesce((select jsonb_agg(step)
              from jsonb_array_elements(coalesce(e#>'{tracking,completedStepIds}', '[]')) step
              where step #>> '{}' not in ('document_review', 'admin_review', 'interview', 'application_review', 'final_screening')), '[]')));
        end if;
        linked := true;
        update public.scholarship_applications set data = data || jsonb_build_object(
          'lifecycleVersion', 2, 'applicationFormFile', e->'applicationFormFile', 'tracking', coalesce(e->'tracking', data->'tracking')),
          updated_at = now() where id = a.id;
      elsif lower(coalesce(e->>'status', '')) <> 'saved' then
        ambiguous := true;
      end if;
      if e->>'isLocked' = 'true' or lower(coalesce(e->>'status', '')) in ('awarded', 'accepted', 'finalized')
        or nullif(e->>'requestedSoeAt', '') is not null or exists(select 1 from public.soe_requests r
          where r.data->>'studentId' = s.id and coalesce(r.data->>'materialKey', 'soe') <> 'application_form'
            and (r.data->>'applicationNumber' = coalesce(e->>'applicationNumber', e->>'id')
              or r.data->>'scholarshipId' = e->>'id')) then
        e := e || jsonb_build_object('isLocked', true);
        candidates := candidates || jsonb_build_array(e);
      end if;
      entries := entries || jsonb_build_array(e);
    end loop;
    if jsonb_array_length(candidates) > 1 then ambiguous := true; end if;
    if exists(select 1 from public.scholarship_applications where data->>'studentId' = s.id
      and public.scholarship_application_open(data) group by data->>'grantorId' having count(*) > 1) then
      ambiguous := true;
    end if;
    if jsonb_array_length(candidates) = 1 then
      candidate := candidates->0;
      update public.students set data = data || jsonb_build_object('scholarshipCommitment', jsonb_build_object(
        'applicationId', coalesce(candidate->>'applicationId', 'legacy_' || s.id),
        'applicationNumber', coalesce(candidate->>'applicationNumber', candidate->>'id'),
        'grantorId', candidate->>'grantorId', 'announcementId', candidate->>'announcementId',
        'scholarshipId', candidate->>'id', 'semesterTag', candidate->>'semesterTag',
        'selectedAt', coalesce(candidate->>'requestedSoeAt', candidate->>'finalizedAt', now()::text),
        'migrated', true)) where id = s.id;
    end if;
    update public.students set data = data || jsonb_build_object('scholarships', entries,
      'commitmentRequiresResolution', ambiguous) || case when linked then jsonb_build_object('scholarshipLifecycleVersion', 2)
        else '{}'::jsonb end || case when ambiguous then jsonb_build_object('scholarshipConflictWarning', true,
          'scholarshipConflictMessage', 'Existing scholarship commitments need scholarship office review.') else '{}'::jsonb end,
      updated_at = now() where id = s.id;
  end loop;
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.migrate_legacy_scholarship_choices(text[]) from public, anon, authenticated;
grant execute on function public.migrate_legacy_scholarship_choices(text[]) to service_role;
