-- Only the authenticated backend may append validated private file references.
create or replace function public.append_scholarship_requirement_files(
  p_student_id text, p_application_id text, p_requirement_key text, p_files jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  application_data jsonb;
  student_data jsonb;
  requirement jsonb;
  uploads jsonb;
  entry jsonb;
  existing_files jsonb;
  upload_limit integer;
begin
  perform pg_advisory_xact_lock(734821, 1);
  select data into student_data from public.students where id = p_student_id for update;
  if not found or student_data->>'archived' = 'true' or student_data->>'disabled' = 'true'
    or student_data->>'isPending' = 'true' or student_data->>'isValidated' = 'false' then
    raise exception 'student_account_blocked';
  end if;
  select data into application_data from public.scholarship_applications
    where id = p_application_id and data->>'studentId' = p_student_id for update;
  if not found then raise exception 'application_not_found'; end if;
  if not public.scholarship_application_open(application_data) or application_data->>'adminBlocked' = 'true' then
    raise exception 'application_closed';
  end if;
  select item into requirement from jsonb_array_elements(coalesce(application_data->'otherRequirements', '[]'))
    with ordinality as requirements(item, position)
    where trim(both '_' from regexp_replace(lower(trim(coalesce(nullif(item->>'id', ''),
      nullif(item->>'requirementId', ''), nullif(item->>'key', ''), nullif(item->>'name', ''),
      nullif(item->>'label', ''), 'requirement_' || position))), '[^a-z0-9]+', '_', 'g')) = p_requirement_key
    limit 1;
  if requirement is null then raise exception 'scholarship_requirement_not_found'; end if;
  upload_limit := greatest(1, coalesce(nullif(requirement->>'uploadCount', ''),
    nullif(requirement->>'uploadsNeeded', ''), nullif(requirement->>'count', ''), '1')::integer);
  uploads := coalesce(application_data->'otherRequirementUploads', '{}');
  entry := coalesce(uploads->p_requirement_key, '{}');
  existing_files := coalesce(entry->'files', '[]');
  if p_files is null or jsonb_typeof(p_files) <> 'array' then raise exception 'invalid_application_documents'; end if;
  if jsonb_array_length(p_files) = 0 or jsonb_array_length(existing_files) + jsonb_array_length(p_files) > upload_limit then
    raise exception 'requirement_upload_limit_reached';
  end if;
  if exists(select 1 from jsonb_array_elements(p_files) file where
      nullif(file->>'id', '') is null or nullif(file->>'bucket', '') is null
      or left(coalesce(file->>'path', ''), length('students/' || p_student_id || '/other-requirements/'))
        <> 'students/' || p_student_id || '/other-requirements/'
      or file->>'type' not in ('application/pdf', 'image/png')
      or (upper(coalesce(requirement->>'fileType', 'PDF')) = 'PNG' and file->>'type' <> 'image/png')
      or (upper(coalesce(requirement->>'fileType', 'PDF')) = 'PDF' and file->>'type' <> 'application/pdf')) then
    raise exception 'invalid_application_documents';
  end if;
  entry := entry || jsonb_build_object('requirementId', p_requirement_key,
    'name', coalesce(requirement->>'name', requirement->>'label'), 'fileType', coalesce(requirement->>'fileType', 'PDF'),
    'uploadCount', upload_limit, 'files', existing_files || p_files, 'updatedAt', now()::text);
  perform public.update_scholarship_application_documents(p_student_id, p_application_id,
    'otherRequirementUploads', jsonb_set(uploads, array[p_requirement_key], entry));
  select data into application_data from public.scholarship_applications where id = p_application_id;
  insert into public."systemLogs"(id, data, updated_at) values ('requirement_upload_' || gen_random_uuid()::text,
    jsonb_build_object('action', 'scholarship_requirement_uploaded', 'actorType', 'student', 'actorId', p_student_id,
      'target', p_application_id, 'details', jsonb_build_object('requirementId', p_requirement_key,
        'fileCount', jsonb_array_length(p_files)), 'createdAt', now()::text), now());
  return jsonb_build_object('application', application_data || jsonb_build_object('id', p_application_id));
end;
$$;
revoke all on function public.append_scholarship_requirement_files(text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.append_scholarship_requirement_files(text, text, text, jsonb) to service_role;
