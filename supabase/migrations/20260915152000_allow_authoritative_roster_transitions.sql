begin;

create or replace function public.guard_scholarship_roster_commitment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  student_data jsonb;
  application_data jsonb;
begin
  if coalesce(current_setting('bulsuscholar.choice_write', true), '') = 'true' then
    return new;
  end if;
  if not public.scholarship_application_open(new.data) then
    return new;
  end if;
  select data into student_data
  from public.students
  where id = coalesce(new.data->>'studentId', new.data->>'studentnumber', new.data->>'studentNumber');
  if student_data->>'scholarshipLifecycleVersion' = '2' then
    select data into application_data
    from public.scholarship_applications
    where id = student_data#>>'{scholarshipCommitment,applicationId}';
    if application_data is null
      or not public.scholarship_application_open(application_data)
      or application_data->>'grantorId' is distinct from new.parent_id
      or (nullif(new.data->>'applicationId', '') is not null
        and new.data->>'applicationId' is distinct from student_data#>>'{scholarshipCommitment,applicationId}') then
      raise exception 'scholarship_choice_required';
    end if;
    new.data := new.data || jsonb_build_object(
      'applicationId', student_data#>>'{scholarshipCommitment,applicationId}',
      'applicationNumber', application_data->>'applicationNumber',
      'scholarshipId', application_data->>'scholarshipId',
      'grantorId', new.parent_id
    );
  end if;
  return new;
end;
$$;

revoke all on function public.guard_scholarship_roster_commitment() from public, anon, authenticated;

commit;
