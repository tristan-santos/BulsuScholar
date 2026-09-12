begin;

create or replace function public.student_shared_application_profile(student_data jsonb)
returns jsonb
language sql
immutable
security invoker
set search_path = ''
as $$
  select coalesce(
    nullif(student_data->'scholarshipApplicationFile', 'null'::jsonb),
    nullif(student_data->'applicationFormFile', 'null'::jsonb),
    nullif(student_data->'scholarshipFormFile', 'null'::jsonb)
  );
$$;

create or replace function public.student_shared_document_urls(student_data jsonb)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'cor', public.scholarship_document_url(student_data, array['corFile','corDocument','cor']),
    'cog', public.scholarship_document_url(student_data, array['rogFile','cogFile','rogDocument','cogDocument','rog','cog']),
    'schoolId', public.scholarship_document_url(student_data, array['schoolIdFile','studentIdFile','validIdFile','idFile']),
    'applicationForm', public.scholarship_document_url(student_data, array['scholarshipApplicationFile','applicationFormFile','scholarshipFormFile'])
  ));
$$;

create or replace function public.hydrate_scholarship_application_shared_documents()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  student_data jsonb;
  profile_file jsonb;
begin
  if new.data->>'lifecycleVersion' <> '2' or nullif(new.data->>'studentId', '') is null then
    return new;
  end if;

  select data into student_data
  from public.students
  where id = new.data->>'studentId';

  if not found then
    return new;
  end if;

  profile_file := public.student_shared_application_profile(student_data);
  new.data := jsonb_set(
    new.data,
    '{documentUrls}',
    coalesce(new.data->'documentUrls', '{}'::jsonb) || public.student_shared_document_urls(student_data),
    true
  );

  if profile_file is not null and nullif(new.data#>>'{applicationFormFile,url}', '') is null then
    new.data := jsonb_set(new.data, '{applicationFormFile}', profile_file, true);
  end if;

  return new;
end;
$$;

drop trigger if exists scholarship_application_shared_documents on public.scholarship_applications;
create trigger scholarship_application_shared_documents
before insert or update on public.scholarship_applications
for each row execute function public.hydrate_scholarship_application_shared_documents();

create or replace function public.hydrate_student_scholarship_shared_documents()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile_file jsonb;
  shared_urls jsonb;
begin
  if jsonb_typeof(new.data->'scholarships') <> 'array' then
    return new;
  end if;

  profile_file := public.student_shared_application_profile(new.data);
  shared_urls := public.student_shared_document_urls(new.data);

  new.data := jsonb_set(
    new.data,
    '{scholarships}',
    coalesce((
      select jsonb_agg(
        case
          when entry->>'lifecycleVersion' = '2' and public.scholarship_application_open(entry) then
            (case
              when profile_file is not null and nullif(entry#>>'{applicationFormFile,url}', '') is null
                then jsonb_set(entry, '{applicationFormFile}', profile_file, true)
              else entry
            end) || jsonb_build_object(
              'documentUrls', coalesce(entry->'documentUrls', '{}'::jsonb) || shared_urls
            )
          else entry
        end
        order by ordinal
      )
      from jsonb_array_elements(new.data->'scholarships') with ordinality as scholarship(entry, ordinal)
    ), '[]'::jsonb),
    true
  );

  return new;
end;
$$;

drop trigger if exists student_scholarship_shared_documents on public.students;
create trigger student_scholarship_shared_documents
before insert or update on public.students
for each row execute function public.hydrate_student_scholarship_shared_documents();

select set_config('bulsuscholar.choice_write', 'true', true);

update public.scholarship_applications application
set data = application.data,
    updated_at = application.updated_at
where application.data->>'lifecycleVersion' = '2'
  and public.scholarship_application_open(application.data);

update public.students student
set data = student.data,
    updated_at = student.updated_at
where jsonb_typeof(student.data->'scholarships') = 'array'
  and exists (
    select 1
    from jsonb_array_elements(student.data->'scholarships') entry
    where entry->>'lifecycleVersion' = '2'
      and public.scholarship_application_open(entry)
  );

revoke all on function public.student_shared_application_profile(jsonb) from public, anon, authenticated;
revoke all on function public.student_shared_document_urls(jsonb) from public, anon, authenticated;
revoke all on function public.hydrate_scholarship_application_shared_documents() from public, anon, authenticated;
revoke all on function public.hydrate_student_scholarship_shared_documents() from public, anon, authenticated;
grant execute on function public.student_shared_application_profile(jsonb) to service_role;
grant execute on function public.student_shared_document_urls(jsonb) to service_role;

commit;
