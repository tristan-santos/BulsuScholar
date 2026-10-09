begin;

-- Produce an actionable, student-safe readiness snapshot. This is advisory;
-- request_scholarship_materials repeats the checks while holding its locks.
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
  application_data jsonb;
  announcement_data jsonb;
  grantor_data jsonb;
  request_data jsonb;
  commitment jsonb;
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
begin
  if nullif(trim(p_student_id), '') is null or nullif(trim(p_application_id), '') is null then
    raise exception 'invalid_material_preflight_input';
  end if;

  select data into student_data from public.students where id = p_student_id;
  if not found then raise exception 'student_not_found'; end if;
  select data into application_data from public.scholarship_applications
    where id = p_application_id and data->>'studentId' = p_student_id;
  if not found then raise exception 'application_not_found'; end if;

  grantor_id := coalesce(application_data->>'grantorId', application_data->>'providerId');
  commitment := coalesce(student_data->'scholarshipCommitment', '{}'::jsonb);
  select data into request_data from public.soe_requests where id = 'choice_' || p_application_id;
  select data into announcement_data from public.grantor_portal_announcements
    where id = application_data->>'announcementId' and parent_id = grantor_id;
  select data into grantor_data from public.grantor_portals where id = grantor_id;
  if grantor_data is null then select data into grantor_data from public.providers where id = grantor_id; end if;

  scholarship_name := coalesce(application_data->>'scholarshipTitle', application_data->>'scholarshipName',
    announcement_data->>'scholarshipTitle', announcement_data->>'title', 'Scholarship');
  grantor_name := coalesce(application_data->>'grantorName', application_data->>'providerName',
    grantor_data->>'organization', grantor_data->>'name', 'Grantor');
  custom_form := coalesce(application_data->'customApplicationForm', application_data->'customApplicationProfile');
  if jsonb_typeof(custom_form) = 'object' and coalesce(custom_form->>'url', custom_form->>'publicUrl', '') <> '' then
    application_form_type := 'custom';
  end if;

  account_ready := not (
    student_data->>'archived' = 'true' or student_data->>'disabled' = 'true'
    or student_data->>'adminBlocked' = 'true'
    or lower(coalesce(student_data->>'status', '')) in ('archived','inactive','disabled','blocked')
    or lower(coalesce(student_data#>>'{rosterAssignmentState,status}', '')) = 'conflict'
  );
  application_ready := public.scholarship_application_open(application_data)
    and application_data->>'source' is distinct from 'authoritative_roster';
  grantor_ready := grantor_data is not null and not (
    grantor_data->>'archived' = 'true' or grantor_data->>'disabled' = 'true'
    or lower(coalesce(grantor_data->>'status', '')) in ('archived','inactive','disabled')
    or announcement_data is null or announcement_data->>'archived' = 'true'
    or announcement_data->>'hiddenFromStudents' = 'true'
    or lower(coalesce(announcement_data->>'status', '')) = 'archived'
  );
  minimum_grade := coalesce(nullif(announcement_data->>'minimumGrade','')::numeric,
    nullif(announcement_data->>'minimumGwa','')::numeric,
    nullif(announcement_data->>'minGwa','')::numeric, 2.25);
  student_grade := coalesce(nullif(student_data->>'gwa','')::numeric,
    nullif(student_data->>'currentGwa','')::numeric, 99);
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

  checklist := jsonb_build_array(
    jsonb_build_object('code','account_ready','label','Account is active','ready',account_ready),
    jsonb_build_object('code','application_open','label','Application is open','ready',application_ready),
    jsonb_build_object('code','grantor_available','label','Grantor and scholarship are available','ready',grantor_ready),
    jsonb_build_object('code','gwa_eligible','label','GWA requirement is met','ready',grade_ready),
    jsonb_build_object('code','documents_approved','label','Required documents are approved','ready',documents_ready),
    jsonb_build_object('code','profile_approved','label','Student Application Profile is approved','ready',profile_ready and versions_ready),
    jsonb_build_object('code','requirements_approved','label','Application requirements are approved','ready',requirements_ready),
    jsonb_build_object('code','slot_reserved','label','Application slot is reserved','ready',slot_ready)
  );

  if not account_ready then blockers := blockers || jsonb_build_array(jsonb_build_object(
    'code',case when lower(coalesce(student_data#>>'{rosterAssignmentState,status}','')) = 'conflict' then 'roster_assignment_conflict' else 'student_account_blocked' end,
    'message',case when lower(coalesce(student_data#>>'{rosterAssignmentState,status}','')) = 'conflict' then 'The Scholarship Office must resolve your roster assignment conflict.' else 'Your account is not currently eligible to request materials.' end,
    'actionLabel','View Application','route','/student-dashboard/scholarships'));
  end if;
  if not application_ready then blockers := blockers || jsonb_build_array(jsonb_build_object(
    'code',case when application_data->>'source' = 'authoritative_roster' then 'authoritative_roster_managed' else 'application_closed' end,
    'message',case when application_data->>'source' = 'authoritative_roster' then 'This official roster scholarship is managed automatically while your documents are reviewed.' else 'This application is no longer open.' end,
    'actionLabel','View Application','route','/student-dashboard/scholarships'));
  end if;
  if not grantor_ready then blockers := blockers || jsonb_build_array(jsonb_build_object(
    'code','grantor_archived','message','The grantor or scholarship is no longer available.','actionLabel','View Application','route','/student-dashboard/scholarships'));
  end if;
  if not grade_ready then blockers := blockers || jsonb_build_array(jsonb_build_object(
    'code','grade_not_eligible','message','Your current GWA does not meet this scholarship requirement.','actionLabel','View Application','route','/student-dashboard/scholarships'));
  end if;
  if not documents_ready then blockers := blockers || jsonb_build_array(jsonb_build_object(
    'code','document_review_required','message','Upload all required documents and wait for their approval.','actionLabel','Upload Documents','route','/student-dashboard/profile'));
  end if;
  if not versions_ready then blockers := blockers || jsonb_build_array(jsonb_build_object(
    'code','document_versions_changed','message','A document changed after review and its current version must be approved.','actionLabel','Wait for Review','route','/student-dashboard/profile'));
  end if;
  if not profile_ready then blockers := blockers || jsonb_build_array(jsonb_build_object(
    'code','profile_required','message','Complete and submit your Student Application Profile.','actionLabel','Complete Profile','route','/student-dashboard/profile/form'));
  end if;
  if not requirements_ready then blockers := blockers || jsonb_build_array(jsonb_build_object(
    'code','application_requirement_pending','message','An application-specific requirement is missing or awaiting review.','actionLabel','View Application','route','/student-dashboard/scholarships'));
  end if;
  if not slot_ready then blockers := blockers || jsonb_build_array(jsonb_build_object(
    'code','slot_reservation_missing','message','This application no longer has a reserved slot. Contact the Scholarship Office.','actionLabel','View Application','route','/student-dashboard/scholarships'));
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'applicationId', a.id,
    'applicationNumber', a.data->>'applicationNumber',
    'scholarshipName', coalesce(a.data->>'scholarshipTitle',a.data->>'scholarshipName','Scholarship'),
    'grantorName', coalesce(a.data->>'grantorName',a.data->>'providerName','Grantor'),
    'slotWillBeReleased', a.data->>'slotReserved' = 'true' and nullif(a.data->>'slotReleasedAt','') is null
  ) order by coalesce(a.data->>'createdAt', a.updated_at::text)), '[]'::jsonb)
  into competitors
  from public.scholarship_applications a
  where a.data->>'studentId' = p_student_id and a.id <> p_application_id
    and public.scholarship_application_open(a.data);

  return jsonb_build_object(
    'eligible', jsonb_array_length(blockers) = 0,
    'existingRequest', commitment->>'applicationId' = p_application_id and request_data is not null
      and lower(coalesce(request_data->>'status','')) <> 'rejected',
    'applicationId', p_application_id,
    'scholarship', jsonb_build_object('name',scholarship_name,'grantorName',grantor_name,
      'applicationNumber',application_data->>'applicationNumber'),
    'requiredMaterials', jsonb_build_array(
      jsonb_build_object('key','soe','label','Statement of Eligibility (SOE)'),
      jsonb_build_object('key','application_form','label',case when application_form_type = 'custom' then 'Grantor Application Form' else 'Standard Application Form' end,'source',application_form_type)
    ),
    'checklist', checklist,
    'blockers', blockers,
    'affectedApplications', competitors,
    'slotReleaseCount', (select count(*) from jsonb_array_elements(competitors) item where (item->>'slotWillBeReleased')::boolean),
    'withdrawalLocked', true
  );
end;
$$;

-- Choice requests always contain both official materials, including when the
-- scholarship uses the standard application form.
create or replace function public.enrich_choice_material_request()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  application_data jsonb;
  custom_form jsonb;
  form_type text := 'default';
  material_status text;
  material_timestamp text;
begin
  if new.id not like 'choice_%' or nullif(new.data->>'applicationId','') is null then return new; end if;
  select data into application_data from public.scholarship_applications where id = new.data->>'applicationId';
  custom_form := coalesce(application_data->'customApplicationForm', application_data->'customApplicationProfile');
  if jsonb_typeof(custom_form) = 'object' and coalesce(custom_form->>'url',custom_form->>'publicUrl','') <> '' then
    form_type := 'custom';
  else
    custom_form := null;
  end if;
  material_status := lower(coalesce(new.data#>>'{materials,soe,status}',new.data->>'reviewState',new.data->>'status','pending'));
  if material_status in ('approved','signed') then material_status := 'approved'; else material_status := 'pending'; end if;
  material_timestamp := coalesce(new.data#>>'{materials,soe,requestedAt}',new.data->>'timestamp',new.data->>'createdAt',now()::text);
  new.data := new.data || jsonb_build_object(
    'requestType','Materials','materialKey','materials','materialLabel','SOE and Application Form',
    'applicationFormType',form_type,'customApplicationForm',custom_form,
    'requestedMaterials',coalesce(new.data->'requestedMaterials','{}'::jsonb) || jsonb_build_object('soe',true,'application_form',true),
    'materials',coalesce(new.data->'materials','{}'::jsonb) || jsonb_build_object(
      'application_form',coalesce(new.data#>'{materials,application_form}','{}'::jsonb) || jsonb_build_object(
        'requested',true,'status',material_status,'requestedAt',material_timestamp,
        'approvedAt',case when material_status = 'approved' then coalesce(new.data#>>'{materials,application_form,approvedAt}',material_timestamp) else null end,
        'rejectedAt',null
      )
    )
  );
  return new;
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
  request_data jsonb;
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

  -- A committed, non-rejected request is the successful result of every retry.
  select data into request_data from public.soe_requests where id = 'choice_' || p_application_id;
  if student_data#>>'{scholarshipCommitment,applicationId}' = p_application_id
    and request_data is not null and lower(coalesce(request_data->>'status','')) <> 'rejected' then
    return jsonb_build_object('idempotent',true,'student',student_data,'materialRequest',request_data);
  end if;

  if not public.scholarship_application_open(application_data) then raise exception 'application_closed'; end if;
  if application_data->>'source' = 'authoritative_roster' then raise exception 'authoritative_roster_managed'; end if;
  if lower(coalesce(student_data#>>'{rosterAssignmentState,status}', '')) = 'conflict' then
    raise exception 'roster_assignment_conflict';
  end if;
  if student_data->>'archived' = 'true' or student_data->>'disabled' = 'true'
    or student_data->>'adminBlocked' = 'true'
    or lower(coalesce(student_data->>'status', '')) in ('archived','inactive','disabled','blocked') then
    raise exception 'student_account_blocked';
  end if;

  select data into announcement_data from public.grantor_portal_announcements
    where id = application_data->>'announcementId'
      and parent_id = coalesce(application_data->>'grantorId',application_data->>'providerId') for update;
  if not found or announcement_data->>'archived' = 'true'
    or announcement_data->>'hiddenFromStudents' = 'true'
    or lower(coalesce(announcement_data->>'status','')) = 'archived' then
    raise exception 'announcement_not_open_for_applications';
  end if;
  minimum_grade := coalesce(nullif(announcement_data->>'minimumGrade','')::numeric,
    nullif(announcement_data->>'minimumGwa','')::numeric,
    nullif(announcement_data->>'minGwa','')::numeric,2.25);
  student_grade := coalesce(nullif(student_data->>'gwa','')::numeric,
    nullif(student_data->>'currentGwa','')::numeric,99);
  if student_grade > minimum_grade then raise exception 'grade_not_eligible'; end if;
  if not public.scholarship_documents_complete_for_application(student_data,application_data)
    or not (coalesce(application_data#>'{tracking,completedStepIds}','[]'::jsonb) ? 'document_review') then
    raise exception 'document_review_required';
  end if;
  if application_data->'reviewedDocumentVersions'
    is distinct from public.scholarship_document_versions(student_data) then
    raise exception 'document_versions_changed';
  end if;
  if application_data->>'lifecycleVersion' = '2' and (
    nullif(application_data#>>'{applicationFormFile,url}','') is null
    or application_data->'applicationFormFile' is distinct from application_data->'reviewedApplicationFormVersion'
    or coalesce(application_data->'otherRequirementUploads','null'::jsonb)
      is distinct from coalesce(application_data->'reviewedOtherRequirementVersions','null'::jsonb)) then
    raise exception 'application_requirement_pending';
  end if;
  if application_data->>'slotReserved' <> 'true' or nullif(application_data->>'slotReleasedAt','') is not null then
    raise exception 'slot_reservation_missing';
  end if;
  return public.mutate_scholarship_choice(p_student_id,p_application_id,'choose');
end;
$$;

create or replace function public.cancel_portal_email_challenge(
  p_id text,
  p_auth_user_id uuid,
  p_reason text default 'delivery_failed'
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare affected integer;
begin
  update public.portal_email_challenges
  set status = 'cancelled', updated_at = now()
  where id = p_id and auth_user_id = p_auth_user_id and status = 'active';
  get diagnostics affected = row_count;
  return jsonb_build_object('cancelled',affected = 1,'reason',left(coalesce(p_reason,'cancelled'),80));
end;
$$;

revoke all on function public.scholarship_materials_preflight(text,text) from public, anon, authenticated;
revoke all on function public.request_scholarship_materials(text,text) from public, anon, authenticated;
revoke all on function public.cancel_portal_email_challenge(text,uuid,text) from public, anon, authenticated;
grant execute on function public.scholarship_materials_preflight(text,text) to service_role;
grant execute on function public.request_scholarship_materials(text,text) to service_role;
grant execute on function public.cancel_portal_email_challenge(text,uuid,text) to service_role;

notify pgrst, 'reload schema';
commit;
