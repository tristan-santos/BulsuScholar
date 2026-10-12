begin;

create or replace function public.scholarship_materials_preflight(
  p_student_id text,
  p_application_id text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  student_data jsonb;
  state_data jsonb := '{}'::jsonb;
  application_data jsonb;
  announcement_data jsonb;
  grantor_data jsonb;
  request_data jsonb;
  commitment jsonb := '{}'::jsonb;
  blockers jsonb := '[]'::jsonb;
  checklist jsonb := '[]'::jsonb;
  competitors jsonb := '[]'::jsonb;
  minimum_grade numeric;
  student_grade numeric;
  grantor_id text;
  scholarship_name text;
  grantor_name text;
  custom_form jsonb;
  application_form_type text := 'default';
  account_ready boolean;
  application_ready boolean;
  grantor_ready boolean;
  grade_ready boolean;
  documents_ready boolean;
  versions_ready boolean;
  profile_ready boolean;
  requirements_ready boolean;
  slot_ready boolean;
  commitment_ready boolean;
begin
  if nullif(trim(coalesce(p_student_id, '')), '') is null
    or nullif(trim(coalesce(p_application_id, '')), '') is null then
    raise exception 'invalid_material_preflight_input';
  end if;

  select data into student_data from public.students where id = p_student_id;
  if not found then raise exception 'student_not_found'; end if;

  select data into state_data
  from public.student_scholarship_state
  where student_id = p_student_id;
  state_data := coalesce(state_data, '{}'::jsonb);

  select data into application_data
  from public.scholarship_applications
  where id = p_application_id and student_id = p_student_id;
  if not found then raise exception 'application_not_found'; end if;

  grantor_id := coalesce(application_data->>'grantorId', application_data->>'providerId');
  commitment := coalesce(state_data->'scholarshipCommitment', '{}'::jsonb);
  select data into request_data from public.soe_requests where id = 'choice_' || p_application_id;
  select data into announcement_data
  from public.grantor_portal_announcements
  where id = application_data->>'announcementId' and parent_id = grantor_id;
  select data into grantor_data from public.grantor_portals where id = grantor_id;
  if grantor_data is null then
    select data into grantor_data from public.providers where id = grantor_id;
  end if;

  scholarship_name := coalesce(
    application_data->>'scholarshipTitle', application_data->>'scholarshipName',
    announcement_data->>'scholarshipTitle', announcement_data->>'title', 'Scholarship'
  );
  grantor_name := coalesce(
    application_data->>'grantorName', application_data->>'providerName',
    grantor_data->>'organization', grantor_data->>'name', 'Grantor'
  );
  custom_form := coalesce(application_data->'customApplicationForm', application_data->'customApplicationProfile');
  if jsonb_typeof(custom_form) = 'object'
    and coalesce(custom_form->>'url', custom_form->>'publicUrl', '') <> '' then
    application_form_type := 'custom';
  else
    custom_form := null;
  end if;

  account_ready := not (
    student_data->>'archived' = 'true'
    or student_data->>'disabled' = 'true'
    or student_data->>'adminBlocked' = 'true'
    or lower(coalesce(student_data->>'status', '')) in ('archived', 'inactive', 'disabled', 'blocked')
    or lower(coalesce(state_data#>>'{rosterAssignmentState,status}', '')) = 'conflict'
  );
  application_ready := public.scholarship_application_open(application_data)
    and application_data->>'source' is distinct from 'authoritative_roster';
  grantor_ready := grantor_data is not null and announcement_data is not null and not (
    grantor_data->>'archived' = 'true'
    or grantor_data->>'disabled' = 'true'
    or lower(coalesce(grantor_data->>'status', '')) in ('archived', 'inactive', 'disabled')
    or announcement_data->>'archived' = 'true'
    or announcement_data->>'hiddenFromStudents' = 'true'
    or lower(coalesce(announcement_data->>'status', '')) in ('archived', 'closed', 'disabled')
  );
  minimum_grade := coalesce(
    nullif(announcement_data->>'minimumGrade', '')::numeric,
    nullif(announcement_data->>'minimumGwa', '')::numeric,
    nullif(announcement_data->>'minGwa', '')::numeric,
    2.25
  );
  student_grade := coalesce(
    nullif(student_data->>'gwa', '')::numeric,
    nullif(student_data->>'currentGwa', '')::numeric,
    99
  );
  grade_ready := student_grade <= minimum_grade;
  documents_ready := public.scholarship_documents_complete_for_application(student_data, application_data)
    and coalesce(application_data#>'{tracking,completedStepIds}', '[]'::jsonb) ? 'document_review';
  versions_ready := application_data->'reviewedDocumentVersions'
    is not distinct from public.scholarship_document_versions(student_data);
  profile_ready := application_data->>'lifecycleVersion' is distinct from '2'
    or nullif(application_data#>>'{applicationFormFile,url}', '') is not null;
  requirements_ready := application_data->>'lifecycleVersion' is distinct from '2' or (
    application_data->'applicationFormFile' is not distinct from application_data->'reviewedApplicationFormVersion'
    and coalesce(application_data->'otherRequirementUploads', 'null'::jsonb)
      is not distinct from coalesce(application_data->'reviewedOtherRequirementVersions', 'null'::jsonb)
  );
  slot_ready := application_data->>'slotReserved' = 'true'
    and nullif(application_data->>'slotReleasedAt', '') is null;
  commitment_ready := nullif(commitment->>'applicationId', '') is null
    or commitment->>'applicationId' = p_application_id;

  checklist := jsonb_build_array(
    jsonb_build_object('code', 'account_ready', 'label', 'Account is active', 'ready', account_ready),
    jsonb_build_object('code', 'application_open', 'label', 'Application is open', 'ready', application_ready),
    jsonb_build_object('code', 'grantor_available', 'label', 'Grantor and scholarship are available', 'ready', grantor_ready),
    jsonb_build_object('code', 'gwa_eligible', 'label', 'GWA requirement is met', 'ready', grade_ready),
    jsonb_build_object('code', 'documents_approved', 'label', 'Required documents are approved', 'ready', documents_ready),
    jsonb_build_object('code', 'profile_approved', 'label', 'Student Application Profile is approved', 'ready', profile_ready and versions_ready),
    jsonb_build_object('code', 'requirements_approved', 'label', 'Application requirements are approved', 'ready', requirements_ready),
    jsonb_build_object('code', 'slot_reserved', 'label', 'Application slot is reserved', 'ready', slot_ready),
    jsonb_build_object('code', 'commitment_available', 'label', 'No other scholarship is committed', 'ready', commitment_ready)
  );

  if not account_ready then
    blockers := blockers || jsonb_build_array(jsonb_build_object(
      'code', case when lower(coalesce(state_data#>>'{rosterAssignmentState,status}', '')) = 'conflict'
        then 'roster_assignment_conflict' else 'student_account_blocked' end,
      'message', case when lower(coalesce(state_data#>>'{rosterAssignmentState,status}', '')) = 'conflict'
        then 'The Scholarship Office must resolve your roster assignment conflict.'
        else 'Your account is not currently eligible to request materials.' end,
      'actionLabel', 'View Application', 'route', '/student-dashboard/scholarships'
    ));
  end if;
  if not application_ready then
    blockers := blockers || jsonb_build_array(jsonb_build_object(
      'code', case when application_data->>'source' = 'authoritative_roster'
        then 'authoritative_roster_managed' else 'application_closed' end,
      'message', case when application_data->>'source' = 'authoritative_roster'
        then 'This official roster scholarship is managed automatically while your documents are reviewed.'
        else 'This application is no longer open.' end,
      'actionLabel', 'View Application', 'route', '/student-dashboard/scholarships'
    ));
  end if;
  if not grantor_ready then
    blockers := blockers || jsonb_build_array(jsonb_build_object(
      'code', 'grantor_archived', 'message', 'The grantor or scholarship is no longer available.',
      'actionLabel', 'View Application', 'route', '/student-dashboard/scholarships'
    ));
  end if;
  if not grade_ready then
    blockers := blockers || jsonb_build_array(jsonb_build_object(
      'code', 'grade_not_eligible', 'message', 'Your current GWA does not meet this scholarship requirement.',
      'actionLabel', 'View Application', 'route', '/student-dashboard/scholarships'
    ));
  end if;
  if not documents_ready then
    blockers := blockers || jsonb_build_array(jsonb_build_object(
      'code', 'document_review_required', 'message', 'Upload all required documents and wait for their approval.',
      'actionLabel', 'Upload Documents', 'route', '/student-dashboard/profile'
    ));
  end if;
  if not versions_ready then
    blockers := blockers || jsonb_build_array(jsonb_build_object(
      'code', 'document_versions_changed', 'message', 'A document changed after review and its current version must be approved.',
      'actionLabel', 'Wait for Review', 'route', '/student-dashboard/profile'
    ));
  end if;
  if not profile_ready then
    blockers := blockers || jsonb_build_array(jsonb_build_object(
      'code', 'profile_required', 'message', 'Complete and submit your Student Application Profile.',
      'actionLabel', 'Complete Profile', 'route', '/student-dashboard/profile/form'
    ));
  end if;
  if not requirements_ready then
    blockers := blockers || jsonb_build_array(jsonb_build_object(
      'code', 'application_requirement_pending', 'message', 'An application-specific requirement is missing or awaiting review.',
      'actionLabel', 'View Application', 'route', '/student-dashboard/scholarships'
    ));
  end if;
  if not slot_ready then
    blockers := blockers || jsonb_build_array(jsonb_build_object(
      'code', 'slot_reservation_missing', 'message', 'This application no longer has a reserved slot. Contact the Scholarship Office.',
      'actionLabel', 'View Application', 'route', '/student-dashboard/scholarships'
    ));
  end if;
  if not commitment_ready then
    blockers := blockers || jsonb_build_array(jsonb_build_object(
      'code', 'scholarship_already_committed', 'message', 'Another scholarship has already been selected for this account.',
      'actionLabel', 'View Application', 'route', '/student-dashboard/scholarships'
    ));
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'applicationId', application.id,
    'applicationNumber', application.data->>'applicationNumber',
    'scholarshipName', coalesce(application.data->>'scholarshipTitle', application.data->>'scholarshipName', 'Scholarship'),
    'grantorName', coalesce(application.data->>'grantorName', application.data->>'providerName', 'Grantor'),
    'slotWillBeReleased', application.data->>'slotReserved' = 'true'
      and nullif(application.data->>'slotReleasedAt', '') is null
  ) order by coalesce(application.data->>'createdAt', application.updated_at::text)), '[]'::jsonb)
  into competitors
  from public.scholarship_applications application
  where application.student_id = p_student_id
    and application.id <> p_application_id
    and public.scholarship_application_open(application.data);

  return jsonb_build_object(
    'eligible', jsonb_array_length(blockers) = 0,
    'existingRequest', commitment->>'applicationId' = p_application_id
      and request_data is not null
      and lower(coalesce(request_data->>'status', '')) <> 'rejected',
    'applicationId', p_application_id,
    'scholarship', jsonb_build_object(
      'name', scholarship_name,
      'grantorName', grantor_name,
      'applicationNumber', application_data->>'applicationNumber'
    ),
    'requiredMaterials', jsonb_build_array(
      jsonb_build_object('key', 'soe', 'label', 'Statement of Eligibility (SOE)'),
      jsonb_build_object(
        'key', 'application_form',
        'label', case when application_form_type = 'custom' then 'Grantor Application Form' else 'Standard Application Form' end,
        'source', application_form_type
      )
    ),
    'checklist', checklist,
    'blockers', blockers,
    'affectedApplications', competitors,
    'slotReleaseCount', (
      select count(*) from jsonb_array_elements(competitors) item
      where coalesce((item->>'slotWillBeReleased')::boolean, false)
    ),
    'withdrawalLocked', true
  );
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
  state_data jsonb := '{}'::jsonb;
  application_data jsonb;
  request_data jsonb;
  preflight jsonb;
  commitment jsonb;
  custom_form jsonb;
  request_id text := 'choice_' || p_application_id;
  now_text text := now()::text;
  competitor record;
  closed_ids text[] := '{}';
  release_result jsonb;
  first_blocker text;
begin
  perform pg_advisory_xact_lock(hashtextextended('student-materials:' || p_student_id, 0));
  perform set_config('bulsuscholar.choice_write', 'true', true);

  select data into student_data from public.students where id = p_student_id for update;
  if not found then raise exception 'student_not_found'; end if;
  select data into state_data
  from public.student_scholarship_state
  where student_id = p_student_id
  for update;
  state_data := coalesce(state_data, '{}'::jsonb);
  select data into application_data
  from public.scholarship_applications
  where id = p_application_id and student_id = p_student_id
  for update;
  if not found then raise exception 'application_not_found'; end if;
  select data into request_data from public.soe_requests where id = request_id for update;

  if state_data#>>'{scholarshipCommitment,applicationId}' = p_application_id
    and request_data is not null
    and lower(coalesce(request_data->>'status', '')) <> 'rejected' then
    return jsonb_build_object(
      'idempotent', true,
      'student', student_data || jsonb_build_object('scholarshipCommitment', state_data->'scholarshipCommitment'),
      'materialRequest', request_data,
      'closedApplicationIds', '[]'::jsonb
    );
  end if;

  preflight := public.scholarship_materials_preflight(p_student_id, p_application_id);
  if coalesce((preflight->>'eligible')::boolean, false) is not true then
    first_blocker := preflight#>>'{blockers,0,code}';
    raise exception '%', coalesce(nullif(first_blocker, ''), 'material_request_not_eligible');
  end if;

  commitment := jsonb_build_object(
    'applicationId', p_application_id,
    'applicationNumber', application_data->>'applicationNumber',
    'grantorId', coalesce(application_data->>'grantorId', application_data->>'providerId'),
    'announcementId', application_data->>'announcementId',
    'scholarshipId', coalesce(application_data->>'scholarshipId', application_data->>'announcementId'),
    'semesterTag', coalesce(application_data->>'semesterTag', application_data->>'academicCycle'),
    'selectedAt', now_text,
    'withdrawalLocked', true
  );
  insert into public.student_scholarship_state(id, student_id, data, updated_at)
  values (
    p_student_id,
    p_student_id,
    jsonb_build_object('scholarshipCommitment', commitment, 'scholarshipLifecycleVersion', 2),
    now()
  )
  on conflict(id) do update
  set data = public.student_scholarship_state.data || excluded.data,
      updated_at = now();

  update public.scholarship_applications
  set data = data || jsonb_build_object(
        'committedAt', now_text,
        'isLocked', true,
        'withdrawalLocked', true,
        'requestedMaterialsAt', now_text,
        'updatedAt', now_text
      ),
      updated_at = now()
  where id = p_application_id;

  custom_form := coalesce(application_data->'customApplicationForm', application_data->'customApplicationProfile');
  if jsonb_typeof(custom_form) <> 'object'
    or coalesce(custom_form->>'url', custom_form->>'publicUrl', '') = '' then
    custom_form := null;
  end if;
  request_data := jsonb_build_object(
    'id', request_id,
    'studentId', p_student_id,
    'studentName', coalesce(application_data->>'fullName', application_data->>'studentName', p_student_id),
    'applicationId', p_application_id,
    'applicationNumber', application_data->>'applicationNumber',
    'requestNumber', request_id,
    'scholarshipId', coalesce(application_data->>'scholarshipId', application_data->>'announcementId'),
    'scholarshipName', coalesce(application_data->>'scholarshipTitle', application_data->>'scholarshipName', 'Scholarship'),
    'grantorId', coalesce(application_data->>'grantorId', application_data->>'providerId'),
    'grantorName', coalesce(application_data->>'grantorName', application_data->>'providerName', 'Grantor'),
    'providerType', application_data->>'providerType',
    'semesterTag', coalesce(application_data->>'semesterTag', application_data->>'academicCycle'),
    'status', 'Pending',
    'reviewState', 'incoming',
    'materialKey', 'materials',
    'requestType', 'Materials',
    'materialLabel', 'SOE and Application Form',
    'applicationFormType', case when custom_form is null then 'default' else 'custom' end,
    'customApplicationForm', custom_form,
    'timestamp', now_text,
    'createdAt', coalesce(request_data->>'createdAt', now_text),
    'updatedAt', now_text,
    'requestedMaterials', jsonb_build_object('soe', true, 'application_form', true),
    'materials', jsonb_build_object(
      'soe', jsonb_build_object('requested', true, 'status', 'pending', 'requestedAt', now_text),
      'application_form', jsonb_build_object('requested', true, 'status', 'pending', 'requestedAt', now_text)
    )
  );
  insert into public.soe_requests(id, data, updated_at)
  values(request_id, request_data, now())
  on conflict(id) do update
  set data = excluded.data,
      updated_at = excluded.updated_at;

  for competitor in
    select id, data
    from public.scholarship_applications
    where student_id = p_student_id
      and id <> p_application_id
      and public.scholarship_application_open(data)
    order by id
    for update
  loop
    release_result := public.release_scholarship_slot_before_choice(
      competitor.id,
      jsonb_build_object(
        'archived', true,
        'status', 'Archived',
        'closureReason', 'selected_another_scholarship',
        'closureMessage', 'Student selected another scholarship',
        'closedAt', now_text,
        'readOnly', true,
        'updatedAt', now_text
      )
    );
    if competitor.data->>'slotReserved' = 'true'
      and nullif(competitor.data->>'slotReleasedAt', '') is null
      and release_result->>'released' is distinct from 'true' then
      raise exception 'slot_reservation_missing';
    end if;
    closed_ids := array_append(closed_ids, competitor.id);
    insert into public."grantorNotifications"(id, data, updated_at)
    values (
      'choice_closed_' || competitor.id,
      jsonb_build_object(
        'grantorId', coalesce(competitor.data->>'grantorId', competitor.data->>'providerId'),
        'studentId', p_student_id,
        'applicationNumber', competitor.data->>'applicationNumber',
        'type', 'application_closed',
        'title', 'Application closed',
        'message', 'Student selected another scholarship',
        'read', false,
        'createdAt', now_text
      ),
      now()
    ) on conflict(id) do nothing;
  end loop;

  insert into public."studentNotifications"(id, data, updated_at)
  values (
    'choice_choose_' || p_application_id,
    jsonb_build_object(
      'studentId', p_student_id,
      'type', 'scholarship_choice',
      'title', 'Scholarship selected',
      'message', 'Your scholarship selection and materials request were submitted. Other applications were closed.',
      'route', '/student-dashboard/scholarships',
      'actionLabel', 'View Scholarship',
      'read', false,
      'createdAt', now_text
    ),
    now()
  ) on conflict(id) do nothing;

  insert into public."grantorNotifications"(id, data, updated_at)
  values (
    'choice_selected_' || p_application_id,
    jsonb_build_object(
      'grantorId', coalesce(application_data->>'grantorId', application_data->>'providerId'),
      'studentId', p_student_id,
      'applicationNumber', application_data->>'applicationNumber',
      'type', 'scholarship_selected',
      'title', 'Scholarship selected',
      'message', 'Student selected your scholarship and requested materials.',
      'read', false,
      'createdAt', now_text
    ),
    now()
  ) on conflict(id) do nothing;

  return jsonb_build_object(
    'idempotent', false,
    'student', student_data || jsonb_build_object('scholarshipCommitment', commitment),
    'closedApplicationIds', to_jsonb(closed_ids),
    'materialRequest', request_data
  );
end;
$$;

revoke all on function public.scholarship_materials_preflight(text, text) from public, anon, authenticated;
revoke all on function public.request_scholarship_materials(text, text) from public, anon, authenticated;
grant execute on function public.scholarship_materials_preflight(text, text) to service_role;
grant execute on function public.request_scholarship_materials(text, text) to service_role;

notify pgrst, 'reload schema';
commit;
