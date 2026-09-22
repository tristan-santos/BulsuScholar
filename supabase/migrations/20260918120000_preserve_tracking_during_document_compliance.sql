-- Temporarily pause progressed applications when required documents become
-- incomplete, without destroying stages that were already completed.

create or replace function public.scholarship_documents_complete_for_application(
  p_student jsonb, p_application jsonb
) returns boolean language sql immutable set search_path = '' as $$
  select public.scholarship_document_url(p_student, array['corFile','corDocument','cor']) is not null
    and public.scholarship_document_url(p_student, array['rogFile','cogFile','rogDocument','cogDocument','rog','cog']) is not null
    and public.scholarship_document_url(p_student, array['schoolIdFile','studentIdFile','validIdFile','idFile']) is not null
    and coalesce(nullif(p_application#>>'{applicationFormFile,url}', ''),
      public.scholarship_document_url(p_student,
        array['scholarshipApplicationFile','applicationFormFile','scholarshipFormFile'])) is not null
    and (coalesce(p_student#>>'{corFile,semesterTag}', p_student#>>'{corDocument,semesterTag}', '') = ''
      or coalesce(p_application->>'semesterTag', '') = ''
      or coalesce(p_student#>>'{corFile,semesterTag}', p_student#>>'{corDocument,semesterTag}') = p_application->>'semesterTag')
    and (coalesce(p_student#>>'{rogFile,semesterTag}', p_student#>>'{cogFile,semesterTag}',
      p_student#>>'{rogDocument,semesterTag}', p_student#>>'{cogDocument,semesterTag}', '') = ''
      or coalesce(p_application->>'semesterTag', '') = ''
      or coalesce(p_student#>>'{rogFile,semesterTag}', p_student#>>'{cogFile,semesterTag}',
        p_student#>>'{rogDocument,semesterTag}', p_student#>>'{cogDocument,semesterTag}') = p_application->>'semesterTag');
$$;

create or replace function public.scholarship_recoverable_completed_steps(p_tracking jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select coalesce(jsonb_agg(to_jsonb(steps.step) order by steps.first_position), '[]'::jsonb)
  from (
    select candidate.step, min(candidate.position) as first_position
    from (
      select value #>> '{}' as step, ordinality::bigint as position
      from jsonb_array_elements(coalesce(p_tracking->'completedStepIds', '[]'::jsonb)) with ordinality
      union all
      select value #>> '{}' as step, (1000 + ordinality)::bigint as position
      from jsonb_array_elements(coalesce(p_tracking#>'{compliancePause,completedStepIds}', '[]'::jsonb)) with ordinality
      union all
      select value->>'stepId' as step, (2000 + ordinality)::bigint as position
      from jsonb_array_elements(coalesce(p_tracking->'history', '[]'::jsonb)) with ordinality
    ) candidate
    where nullif(candidate.step, '') is not null
    group by candidate.step
  ) steps;
$$;

create or replace function public.scholarship_resume_step_id(p_application jsonb, p_completed_steps jsonb)
returns text language plpgsql immutable set search_path = '' as $$
declare
  ordered_steps text[];
  highest_completed integer := 0;
  step_index integer;
begin
  if p_application->>'providerType' = 'kuya_win' then
    ordered_steps := case when p_application#>>'{tracking,appliedViaAnnouncement}' = 'true'
      or nullif(p_application->>'announcementId', '') is not null
      then array['account','announcement_apply','kwsp_apply','document_uploading',
        'application_form','document_review','admin_review','interview','application_review',
        'final_screening','request_materials','download_materials','signing_materials']
      else array['account','kwsp_apply','document_uploading','application_form','document_review',
        'admin_review','interview','application_review','final_screening','request_materials',
        'download_materials','signing_materials'] end;
  else
    ordered_steps := case when p_application#>>'{tracking,appliedViaAnnouncement}' = 'true'
      or nullif(p_application->>'announcementId', '') is not null
      then array['account','announcement_apply','scholarship_apply','document_uploading',
        'application_form','document_review','request_materials','download_materials','signing_materials']
      else array['account','scholarship_apply','document_uploading','application_form',
        'document_review','request_materials','download_materials','signing_materials'] end;
  end if;
  for step_index in 1..array_length(ordered_steps, 1) loop
    if p_completed_steps ? ordered_steps[step_index] then highest_completed := step_index; end if;
  end loop;
  if highest_completed < array_length(ordered_steps, 1) then
    return ordered_steps[greatest(highest_completed + 1, 1)];
  end if;
  return ordered_steps[array_length(ordered_steps, 1)];
end;
$$;

create or replace function public.invalidate_changed_scholarship_documents()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  application_row record;
  tracking_data jsonb;
  pause_data jsonb;
  completed_steps jsonb;
  documents_complete boolean;
  now_text text := now()::text;
begin
  if public.scholarship_document_versions(new.data) is not distinct from public.scholarship_document_versions(old.data) then
    return new;
  end if;

  for application_row in
    select id, data from public.scholarship_applications
    where data->>'studentId' = new.id and data->>'lifecycleVersion' = '2'
      and public.scholarship_application_open(data) and nullif(data->>'committedAt', '') is null
    order by id for update
  loop
    tracking_data := coalesce(application_row.data->'tracking', '{}'::jsonb);
    pause_data := coalesce(tracking_data->'compliancePause', '{}'::jsonb);
    completed_steps := public.scholarship_recoverable_completed_steps(tracking_data);
    documents_complete := public.scholarship_documents_complete_for_application(new.data, application_row.data);

    if documents_complete then
      if pause_data->>'active' = 'true' then
        tracking_data := tracking_data || jsonb_build_object(
          'completedStepIds', completed_steps,
          'lastCompletedStepId', coalesce(nullif(pause_data->>'lastCompletedStepId', ''), tracking_data->>'lastCompletedStepId'),
          'updatedAt', now_text,
          'compliancePause', pause_data || jsonb_build_object('active', false, 'resumedAt', now_text)
        );
      end if;
      if completed_steps ? 'document_review' then
        update public.scholarship_applications set data = data || jsonb_build_object(
          'tracking', tracking_data,
          'reviewedDocumentVersions', public.scholarship_document_versions(new.data),
          'reviewedApplicationFormVersion', application_row.data->'applicationFormFile',
          'reviewedOtherRequirementVersions', application_row.data->'otherRequirementUploads'
        ), updated_at = now() where id = application_row.id;
      elsif pause_data->>'active' = 'true' then
        update public.scholarship_applications set data = data || jsonb_build_object('tracking', tracking_data),
          updated_at = now() where id = application_row.id;
      end if;
    elsif completed_steps ?| array['application_form','document_review','admin_review','interview',
      'application_review','final_screening','request_materials','download_materials','signing_materials'] then
      tracking_data := tracking_data || jsonb_build_object(
        'updatedAt', now_text,
        'compliancePause', pause_data || jsonb_build_object(
          'active', true,
          'pausedAt', coalesce(nullif(pause_data->>'pausedAt', ''), now_text),
          'completedStepIds', completed_steps,
          'lastCompletedStepId', coalesce(tracking_data->>'lastCompletedStepId', ''),
          'resumeStepId', public.scholarship_resume_step_id(application_row.data, completed_steps)
        )
      );
      update public.scholarship_applications set data = data || jsonb_build_object('tracking', tracking_data),
        updated_at = now() where id = application_row.id;
    end if;
  end loop;
  return new;
end;
$$;

create or replace function public.update_scholarship_application_documents(
  p_student_id text, p_application_id text, p_field text, p_value jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  application_data jsonb;
  student_data jsonb;
  tracking_data jsonb;
  pause_data jsonb;
  completed_steps jsonb;
  documents_complete boolean;
  now_text text := now()::text;
begin
  if p_field not in ('applicationFormFile', 'otherRequirementUploads') or jsonb_typeof(p_value) <> 'object' then
    raise exception 'invalid_application_documents';
  end if;
  perform pg_advisory_xact_lock(734821, 1);
  select data into student_data from public.students where id = p_student_id for update;
  if not found or student_data->>'archived' = 'true' then raise exception 'student_account_blocked'; end if;
  select data into application_data from public.scholarship_applications
    where id = p_application_id and data->>'studentId' = p_student_id for update;
  if not found then raise exception 'application_not_found'; end if;
  if not public.scholarship_application_open(application_data) then raise exception 'application_closed'; end if;

  application_data := jsonb_set(application_data, array[p_field], p_value);
  if nullif(application_data->>'committedAt', '') is null then
    tracking_data := coalesce(application_data->'tracking', '{}'::jsonb);
    pause_data := coalesce(tracking_data->'compliancePause', '{}'::jsonb);
    completed_steps := public.scholarship_recoverable_completed_steps(tracking_data);
    documents_complete := public.scholarship_documents_complete_for_application(student_data, application_data);

    if documents_complete and pause_data->>'active' = 'true' then
      tracking_data := tracking_data || jsonb_build_object(
        'completedStepIds', completed_steps,
        'lastCompletedStepId', coalesce(nullif(pause_data->>'lastCompletedStepId', ''), tracking_data->>'lastCompletedStepId'),
        'updatedAt', now_text,
        'compliancePause', pause_data || jsonb_build_object('active', false, 'resumedAt', now_text)
      );
    elsif not documents_complete and completed_steps ?| array['application_form','document_review','admin_review',
      'interview','application_review','final_screening','request_materials','download_materials','signing_materials'] then
      tracking_data := tracking_data || jsonb_build_object(
        'updatedAt', now_text,
        'compliancePause', pause_data || jsonb_build_object(
          'active', true,
          'pausedAt', coalesce(nullif(pause_data->>'pausedAt', ''), now_text),
          'completedStepIds', completed_steps,
          'lastCompletedStepId', coalesce(tracking_data->>'lastCompletedStepId', ''),
          'resumeStepId', public.scholarship_resume_step_id(application_data, completed_steps)
        )
      );
    end if;

    application_data := application_data || jsonb_build_object('tracking', tracking_data);
    if documents_complete and completed_steps ? 'document_review' then
      application_data := application_data || jsonb_build_object(
        'reviewedDocumentVersions', public.scholarship_document_versions(student_data),
        'reviewedApplicationFormVersion', application_data->'applicationFormFile',
        'reviewedOtherRequirementVersions', application_data->'otherRequirementUploads'
      );
    end if;
  end if;

  update public.scholarship_applications set data = application_data, updated_at = now()
    where id = p_application_id;
  select data into student_data from public.students where id = p_student_id;
  return jsonb_build_object('student', student_data);
end;
$$;

-- Recover already-inconsistent open applications from their append-only history.
do $$
declare
  application_row record;
  student_data jsonb;
  tracking_data jsonb;
  completed_steps jsonb;
  now_text text := now()::text;
begin
  for application_row in
    select id, data from public.scholarship_applications
    where data->>'lifecycleVersion' = '2' and public.scholarship_application_open(data)
      and nullif(data->>'committedAt', '') is null
    order by id for update
  loop
    select data into student_data from public.students where id = application_row.data->>'studentId';
    if student_data is null or public.scholarship_documents_complete_for_application(student_data, application_row.data) then
      continue;
    end if;
    tracking_data := coalesce(application_row.data->'tracking', '{}'::jsonb);
    completed_steps := public.scholarship_recoverable_completed_steps(tracking_data);
    if completed_steps ?| array['application_form','document_review','admin_review','interview',
      'application_review','final_screening','request_materials','download_materials','signing_materials'] then
      tracking_data := tracking_data || jsonb_build_object('updatedAt', now_text, 'compliancePause', jsonb_build_object(
        'active', true, 'pausedAt', now_text, 'completedStepIds', completed_steps,
        'lastCompletedStepId', coalesce(tracking_data->>'lastCompletedStepId', ''),
        'resumeStepId', public.scholarship_resume_step_id(application_row.data, completed_steps)));
      update public.scholarship_applications set data = data || jsonb_build_object('tracking', tracking_data),
        updated_at = now() where id = application_row.id;
    end if;
  end loop;
end;
$$;

revoke all on function public.scholarship_documents_complete_for_application(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.scholarship_recoverable_completed_steps(jsonb) from public, anon, authenticated;
revoke all on function public.scholarship_resume_step_id(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.invalidate_changed_scholarship_documents() from public, anon, authenticated;
revoke all on function public.update_scholarship_application_documents(text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.update_scholarship_application_documents(text, text, text, jsonb) to service_role;
