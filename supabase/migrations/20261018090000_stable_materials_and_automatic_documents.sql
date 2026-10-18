begin;

-- Existing active-account replacements that already passed their scanner no
-- longer need a staff decision. Rejected records remain immutable.
update public.student_document_submissions submission
set data = submission.data || jsonb_build_object(
      'status', 'approved',
      'rejectionReason', '',
      'reviewNotes', 'Automatically approved after validated document processing.',
      'reviewedBy', 'system',
      'reviewedAt', now()::text,
      'updatedAt', now()::text,
      'completionSource', 'automatic_document_validation'
    ),
    updated_at = now()
where submission.data->>'status' = 'pending'
  and submission.data->>'source' is distinct from 'student_signup'
  and nullif(submission.data->>'signupBatchId', '') is null
  and submission.id not like 'signup_document_%'
  and submission.data->>'documentType' in ('cor', 'rog', 'identity')
  and exists (
    select 1 from public.students student
    where student.id = submission.data->>'studentId'
  )
  and (
    submission.data->>'documentType' = 'identity'
    or (
      submission.data->>'documentType' = 'cor'
      and lower(coalesce(submission.data#>>'{scan,isValidCorDocument}', 'false')) in ('true', 't', '1', 'yes')
    )
    or (
      submission.data->>'documentType' = 'rog'
      and lower(coalesce(submission.data#>>'{scan,isValidCogDocument}', 'false')) in ('true', 't', '1', 'yes')
    )
  );

insert into public.student_document_reviews(id, data, created_at)
select
  'review_' || submission.id || '_system',
  jsonb_build_object(
    'submissionId', submission.id,
    'studentId', submission.data->>'studentId',
    'reviewerId', 'system',
    'reviewerRole', 'system',
    'decision', 'approved',
    'reason', '',
    'notes', 'Automatically approved after validated document processing.',
    'fieldErrors', '{}'::jsonb,
    'completionSource', 'automatic_document_validation',
    'createdAt', coalesce(submission.data->>'reviewedAt', now()::text)
  ),
  now()
from public.student_document_submissions submission
where submission.data->>'status' = 'approved'
  and submission.data->>'reviewedBy' = 'system'
  and submission.data->>'completionSource' = 'automatic_document_validation'
on conflict(id) do nothing;

-- Rebuild the active compatibility verification summary from authoritative
-- submissions. Identity can come from signup or any later approved replacement.
with current_cycle as (
  select coalesce(
    nullif(data->>'semesterTag', ''),
    concat(data->>'academicYear', '-', data->>'semester')
  ) as cycle
  from public.system_configuration
  where id = 'academic_cycle'
), ranked as (
  select
    submission.data->>'studentId' as student_id,
    submission.data->>'documentType' as document_type,
    submission.id,
    submission.data,
    row_number() over (
      partition by submission.data->>'studentId', submission.data->>'documentType'
      order by
        case when coalesce(submission.data->>'version', '') ~ '^[0-9]+$'
          then (submission.data->>'version')::integer else 0 end desc,
        coalesce(submission.data->>'submittedAt', submission.updated_at::text) desc,
        submission.id desc
    ) as position
  from public.student_document_submissions submission
  cross join current_cycle cycle
  where submission.data->>'documentType' in ('cor', 'rog', 'identity', 'profile')
    and (
      submission.data->>'documentType' = 'identity'
      or submission.data->>'academicCycle' = cycle.cycle
    )
), summaries as (
  select
    student_id,
    jsonb_object_agg(document_type, jsonb_build_object(
      'submissionId', id,
      'version', case when coalesce(data->>'version', '') ~ '^[0-9]+$'
        then (data->>'version')::integer else 0 end,
      'status', coalesce(data->>'status', 'missing'),
      'reason', coalesce(data->>'rejectionReason', ''),
      'fieldErrors', coalesce(data->'fieldErrors', '{}'::jsonb)
    )) as verification
  from ranked
  where position = 1
  group by student_id
)
update public.students student
set data = jsonb_set(
      student.data,
      '{documentVerification}',
      coalesce(student.data->'documentVerification', '{}'::jsonb)
        || summaries.verification
        || jsonb_build_object('academicCycle', cycle.cycle),
      true
    ) || jsonb_build_object('updatedAt', now()::text),
    updated_at = now()
from summaries
cross join current_cycle cycle
where student.id = summaries.student_id;

-- Repair the application profile pointer for approved normalized revisions.
with ranked_profiles as (
  select
    submission.data->>'studentId' as student_id,
    submission.data->>'academicCycle' as academic_cycle,
    submission.id,
    submission.data,
    row_number() over (
      partition by submission.data->>'studentId', submission.data->>'academicCycle'
      order by
        case when coalesce(submission.data->>'version', '') ~ '^[0-9]+$'
          then (submission.data->>'version')::integer else 0 end desc,
        coalesce(submission.data->>'submittedAt', submission.updated_at::text) desc,
        submission.id desc
    ) as position
  from public.student_document_submissions submission
  where submission.data->>'documentType' = 'profile'
    and submission.data->>'status' = 'approved'
), latest_profiles as (
  select * from ranked_profiles where position = 1
)
update public.scholarship_applications application
set data = application.data || jsonb_build_object(
      'applicationFormFile', jsonb_build_object(
        'url', '/student/profile/documents/' || profile.id || '/content',
        'bucket', profile.data#>>'{file,bucket}',
        'path', profile.data#>>'{file,path}',
        'name', profile.data->>'name',
        'type', profile.data#>>'{file,type}',
        'semesterTag', profile.academic_cycle,
        'submissionId', profile.id,
        'profileRevisionId', profile.data->>'profileRevisionId',
        'reviewStatus', 'approved'
      ),
      'reviewedApplicationFormVersion', jsonb_build_object(
        'url', '/student/profile/documents/' || profile.id || '/content',
        'bucket', profile.data#>>'{file,bucket}',
        'path', profile.data#>>'{file,path}',
        'name', profile.data->>'name',
        'type', profile.data#>>'{file,type}',
        'semesterTag', profile.academic_cycle,
        'submissionId', profile.id,
        'profileRevisionId', profile.data->>'profileRevisionId',
        'reviewStatus', 'approved'
      ),
      'updatedAt', now()::text
    ),
    updated_at = now()
from latest_profiles profile
where application.student_id = profile.student_id
  and coalesce(application.academic_cycle, application.data->>'academicCycle', application.data->>'semesterTag') = profile.academic_cycle;

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
  cor_submission jsonb;
  rog_submission jsonb;
  identity_submission jsonb;
  profile_submission jsonb;
  blockers jsonb := '[]'::jsonb;
  checklist jsonb := '[]'::jsonb;
  competitors jsonb := '[]'::jsonb;
  minimum_grade numeric := 2.25;
  student_grade numeric := 99;
  grantor_id text;
  scholarship_name text;
  grantor_name text;
  application_cycle text;
  custom_form jsonb;
  application_form_type text := 'default';
  account_ready boolean;
  application_ready boolean;
  grantor_ready boolean;
  grade_ready boolean;
  cor_ready boolean;
  rog_ready boolean;
  identity_ready boolean;
  documents_ready boolean;
  profile_ready boolean;
  versions_ready boolean;
  requirements_ready boolean;
  workflow_ready boolean;
  slot_ready boolean;
  commitment_ready boolean;
  rog_required boolean := true;
  current_step text;
begin
  if nullif(trim(coalesce(p_student_id, '')), '') is null
    or nullif(trim(coalesce(p_application_id, '')), '') is null then
    raise exception 'invalid_material_preflight_input';
  end if;

  select data into student_data from public.students where id = p_student_id;
  if not found then raise exception 'student_not_found'; end if;

  select data into state_data from public.student_scholarship_state where student_id = p_student_id;
  state_data := coalesce(state_data, '{}'::jsonb);

  select data into application_data
  from public.scholarship_applications
  where id = p_application_id and student_id = p_student_id;
  if not found then raise exception 'application_not_found'; end if;

  select coalesce(
    nullif(application_data->>'academicCycle', ''),
    nullif(application_data->>'semesterTag', ''),
    nullif(config.data->>'semesterTag', ''),
    concat(config.data->>'academicYear', '-', config.data->>'semester')
  ) into application_cycle
  from public.system_configuration config
  where config.id = 'academic_cycle';
  application_cycle := coalesce(
    application_cycle,
    application_data->>'academicCycle',
    application_data->>'semesterTag',
    ''
  );

  grantor_id := coalesce(application_data->>'grantorId', application_data->>'providerId');
  commitment := coalesce(state_data->'scholarshipCommitment', '{}'::jsonb);
  select data into request_data from public.soe_requests where id = 'choice_' || p_application_id;
  select data into grantor_data from public.grantor_portals where id = grantor_id;
  if grantor_data is null then
    select data into grantor_data from public.providers where id = grantor_id;
  end if;
  select announcement.data into announcement_data
  from public.grantor_portal_announcements announcement
  where announcement.parent_id = grantor_id
    and (
      announcement.id = application_data->>'announcementId'
      or announcement.data->>'programId' = coalesce(application_data->>'scholarshipId', application_data->>'programId')
      or lower(coalesce(announcement.data->>'scholarshipTitle', announcement.data->>'title', '')) =
         lower(coalesce(application_data->>'scholarshipTitle', application_data->>'scholarshipName', ''))
    )
  order by
    (announcement.id = application_data->>'announcementId') desc,
    (announcement.data->>'archived' is distinct from 'true') desc,
    announcement.updated_at desc
  limit 1;

  select submission.data into cor_submission
  from public.student_document_submissions submission
  where submission.data->>'studentId' = p_student_id
    and submission.data->>'academicCycle' = application_cycle
    and submission.data->>'documentType' = 'cor'
  order by
    case when coalesce(submission.data->>'version', '') ~ '^[0-9]+$'
      then (submission.data->>'version')::integer else 0 end desc,
    coalesce(submission.data->>'submittedAt', submission.updated_at::text) desc,
    submission.id desc
  limit 1;

  select submission.data into rog_submission
  from public.student_document_submissions submission
  where submission.data->>'studentId' = p_student_id
    and submission.data->>'academicCycle' = application_cycle
    and submission.data->>'documentType' = 'rog'
  order by
    case when coalesce(submission.data->>'version', '') ~ '^[0-9]+$'
      then (submission.data->>'version')::integer else 0 end desc,
    coalesce(submission.data->>'submittedAt', submission.updated_at::text) desc,
    submission.id desc
  limit 1;

  select submission.data into identity_submission
  from public.student_document_submissions submission
  where submission.data->>'studentId' = p_student_id
    and submission.data->>'documentType' = 'identity'
    and submission.data->>'status' = 'approved'
  order by coalesce(submission.data->>'submittedAt', submission.updated_at::text) desc, submission.id desc
  limit 1;

  select submission.data into profile_submission
  from public.student_document_submissions submission
  where submission.data->>'studentId' = p_student_id
    and submission.data->>'academicCycle' = application_cycle
    and submission.data->>'documentType' = 'profile'
  order by
    case when coalesce(submission.data->>'version', '') ~ '^[0-9]+$'
      then (submission.data->>'version')::integer else 0 end desc,
    coalesce(submission.data->>'submittedAt', submission.updated_at::text) desc,
    submission.id desc
  limit 1;

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
    or lower(coalesce(student_data->>'status', 'active')) in ('archived', 'inactive', 'disabled', 'blocked')
    or lower(coalesce(state_data#>>'{rosterAssignmentState,status}', '')) = 'conflict'
  );
  application_ready := public.scholarship_application_open(application_data)
    and application_data->>'source' is distinct from 'authoritative_roster';
  grantor_ready := grantor_data is not null and not (
    grantor_data->>'archived' = 'true'
    or grantor_data->>'disabled' = 'true'
    or lower(coalesce(grantor_data->>'status', 'active')) in ('archived', 'inactive', 'disabled')
  );

  if coalesce(application_data->>'minimumGrade', announcement_data->>'minimumGrade', '') ~ '^[0-9]+([.][0-9]+)?$' then
    minimum_grade := coalesce(application_data->>'minimumGrade', announcement_data->>'minimumGrade')::numeric;
  elsif coalesce(application_data->>'minimumGwa', announcement_data->>'minimumGwa', '') ~ '^[0-9]+([.][0-9]+)?$' then
    minimum_grade := coalesce(application_data->>'minimumGwa', announcement_data->>'minimumGwa')::numeric;
  end if;
  if coalesce(student_data->>'gwa', student_data->>'currentGwa', '') ~ '^[0-9]+([.][0-9]+)?$' then
    student_grade := coalesce(student_data->>'gwa', student_data->>'currentGwa')::numeric;
  end if;
  grade_ready := student_grade <= minimum_grade;

  rog_required := coalesce(
    case lower(coalesce(profile_submission#>>'{requirementsSnapshot,rogRequired}', ''))
      when 'true' then true when 't' then true when '1' then true when 'yes' then true
      when 'false' then false when 'f' then false when '0' then false when 'no' then false
      else null
    end,
    case lower(coalesce(cor_submission#>>'{requirementsSnapshot,rogRequired}', ''))
      when 'true' then true when 't' then true when '1' then true when 'yes' then true
      when 'false' then false when 'f' then false when '0' then false when 'no' then false
      else null
    end,
    not (
      lower(regexp_replace(coalesce(student_data->>'year', ''), '[^a-zA-Z0-9]', '', 'g')) in ('1', '1st', 'first', 'firstyear', 'year1')
      and application_cycle like '%-1ST'
    )
  );
  cor_ready := coalesce(cor_submission->>'status', '') = 'approved';
  rog_ready := not rog_required or coalesce(rog_submission->>'status', '') = 'approved';
  identity_ready := identity_submission is not null;
  documents_ready := cor_ready and rog_ready and identity_ready;
  profile_ready := coalesce(profile_submission->>'status', '') = 'approved';
  versions_ready := application_data->>'lifecycleVersion' is distinct from '2'
    or (
      nullif(profile_submission->>'profileRevisionId', '') is not null
      and profile_submission->>'profileRevisionId' = application_data#>>'{applicationFormFile,profileRevisionId}'
    );

  current_step := coalesce(application_data#>>'{tracking,currentStepId}', '');
  workflow_ready := current_step in ('request_materials', 'download_materials', 'signing_materials', 'signed_soe_upload', 'finish', 'payout')
    or coalesce(application_data#>'{tracking,completedStepIds}', '[]'::jsonb) ? 'document_review';
  requirements_ready := workflow_ready
    or application_data->>'lifecycleVersion' is distinct from '2'
    or (
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
    jsonb_build_object('code', 'documents_approved', 'label', 'COR and ROG are validated', 'ready', documents_ready),
    jsonb_build_object('code', 'profile_approved', 'label', 'Student Application Profile is approved', 'ready', profile_ready and versions_ready),
    jsonb_build_object('code', 'requirements_approved', 'label', 'Application requirements are complete', 'ready', requirements_ready),
    jsonb_build_object('code', 'slot_reserved', 'label', 'Application slot is reserved', 'ready', slot_ready),
    jsonb_build_object('code', 'commitment_available', 'label', 'No other scholarship is committed', 'ready', commitment_ready)
  );

  if not account_ready then blockers := blockers || jsonb_build_array(jsonb_build_object(
    'code', case when lower(coalesce(state_data#>>'{rosterAssignmentState,status}', '')) = 'conflict' then 'roster_assignment_conflict' else 'student_account_blocked' end,
    'message', case when lower(coalesce(state_data#>>'{rosterAssignmentState,status}', '')) = 'conflict' then 'The Scholarship Office must resolve your roster assignment conflict.' else 'Your account is not currently eligible to request materials.' end,
    'actionLabel', 'View Application', 'route', '/student-dashboard/scholarships')); end if;
  if not application_ready then blockers := blockers || jsonb_build_array(jsonb_build_object(
    'code', case when application_data->>'source' = 'authoritative_roster' then 'authoritative_roster_managed' else 'application_closed' end,
    'message', case when application_data->>'source' = 'authoritative_roster' then 'This official roster scholarship is managed automatically.' else 'This application is no longer open.' end,
    'actionLabel', 'View Application', 'route', '/student-dashboard/scholarships')); end if;
  if not grantor_ready then blockers := blockers || jsonb_build_array(jsonb_build_object(
    'code', 'grantor_archived', 'message', 'The grantor is no longer available.', 'actionLabel', 'View Application', 'route', '/student-dashboard/scholarships')); end if;
  if not grade_ready then blockers := blockers || jsonb_build_array(jsonb_build_object(
    'code', 'grade_not_eligible', 'message', 'Your current GWA does not meet this scholarship requirement.', 'actionLabel', 'View Application', 'route', '/student-dashboard/scholarships')); end if;
  if not documents_ready then blockers := blockers || jsonb_build_array(jsonb_build_object(
    'code', 'document_review_required', 'message', 'Upload a valid current-semester COR and applicable ROG.', 'actionLabel', 'Upload Documents', 'route', '/student-dashboard/profile')); end if;
  if not profile_ready then blockers := blockers || jsonb_build_array(jsonb_build_object(
    'code', 'profile_required', 'message', 'Submit your Student Application Profile and wait for administrator approval.', 'actionLabel', 'Complete Profile', 'route', '/student-dashboard/profile/form')); end if;
  if profile_ready and not versions_ready then blockers := blockers || jsonb_build_array(jsonb_build_object(
    'code', 'document_versions_changed', 'message', 'The approved Student Application Profile has not been attached to this application.', 'actionLabel', 'Wait for Review', 'route', '/student-dashboard/profile')); end if;
  if not requirements_ready then blockers := blockers || jsonb_build_array(jsonb_build_object(
    'code', 'application_requirement_pending', 'message', 'An application-specific requirement is missing or awaiting workflow review.', 'actionLabel', 'View Application', 'route', '/student-dashboard/scholarships')); end if;
  if not slot_ready then blockers := blockers || jsonb_build_array(jsonb_build_object(
    'code', 'slot_reservation_missing', 'message', 'This application no longer has a reserved slot. Contact the Scholarship Office.', 'actionLabel', 'View Application', 'route', '/student-dashboard/scholarships')); end if;
  if not commitment_ready then blockers := blockers || jsonb_build_array(jsonb_build_object(
    'code', 'scholarship_already_committed', 'message', 'Another scholarship has already been selected for this account.', 'actionLabel', 'View Application', 'route', '/student-dashboard/scholarships')); end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'applicationId', competitor.id,
    'applicationNumber', competitor.data->>'applicationNumber',
    'scholarshipName', coalesce(competitor.data->>'scholarshipTitle', competitor.data->>'scholarshipName', 'Scholarship'),
    'grantorName', coalesce(competitor.data->>'grantorName', competitor.data->>'providerName', 'Grantor'),
    'slotWillBeReleased', competitor.data->>'slotReserved' = 'true' and nullif(competitor.data->>'slotReleasedAt', '') is null
  ) order by coalesce(competitor.data->>'createdAt', competitor.updated_at::text)), '[]'::jsonb)
  into competitors
  from public.scholarship_applications competitor
  where competitor.student_id = p_student_id
    and competitor.id <> p_application_id
    and public.scholarship_application_open(competitor.data);

  return jsonb_build_object(
    'eligible', jsonb_array_length(blockers) = 0,
    'existingRequest', commitment->>'applicationId' = p_application_id
      and request_data is not null
      and lower(coalesce(request_data->>'status', '')) <> 'rejected',
    'applicationId', p_application_id,
    'scholarship', jsonb_build_object('name', scholarship_name, 'grantorName', grantor_name, 'applicationNumber', application_data->>'applicationNumber'),
    'requiredMaterials', jsonb_build_array(
      jsonb_build_object('key', 'soe', 'label', 'Statement of Eligibility (SOE)'),
      jsonb_build_object('key', 'application_form', 'label', case when application_form_type = 'custom' then 'Grantor Application Form' else 'Standard Application Form' end, 'source', application_form_type)
    ),
    'checklist', checklist,
    'blockers', blockers,
    'affectedApplications', competitors,
    'slotReleaseCount', (select count(*) from jsonb_array_elements(competitors) item where item->>'slotWillBeReleased' = 'true'),
    'withdrawalLocked', true
  );
end;
$$;

revoke all on function public.scholarship_materials_preflight(text, text) from public, anon, authenticated;
grant execute on function public.scholarship_materials_preflight(text, text) to service_role;

notify pgrst, 'reload schema';
commit;
