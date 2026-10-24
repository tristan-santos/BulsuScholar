-- Read the normalized commitment without reviving stale legacy pointers.
create or replace function public.scholarship_guard_student_state(p_student_id text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare student_data jsonb; state_data jsonb;
begin
  select data into student_data from public.students where id = p_student_id;
  select data into state_data from public.student_scholarship_state where student_id = p_student_id;
  if found then
    return (coalesce(student_data, '{}') - 'scholarshipCommitment') || coalesce(state_data, '{}');
  end if;
  return coalesce(student_data, '{}');
end;
$$;

create or replace function public.guard_scholarship_material_identity()
returns trigger language plpgsql security definer set search_path = '' as $$
declare student_data jsonb;
begin
  student_data := public.scholarship_guard_student_state(new.data->>'studentId');
  if student_data->>'scholarshipLifecycleVersion' = '2' then
    if nullif(student_data#>>'{scholarshipCommitment,applicationId}', '') is null
      and coalesce(current_setting('bulsuscholar.choice_write', true), '') <> 'true' then
      raise exception 'scholarship_choice_required';
    end if;
    if student_data#>>'{scholarshipCommitment,applicationId}' is not null and
      (new.data->>'applicationNumber' is distinct from student_data#>>'{scholarshipCommitment,applicationNumber}'
       or (nullif(new.data->>'applicationId', '') is not null and
         new.data->>'applicationId' is distinct from student_data#>>'{scholarshipCommitment,applicationId}')) then
      raise exception 'application_closed';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.guard_scholarship_roster_commitment()
returns trigger language plpgsql security definer set search_path = '' as $$
declare student_data jsonb; application_data jsonb;
begin
  if coalesce(current_setting('bulsuscholar.choice_write', true), '') = 'true' then return new; end if;
  if not public.scholarship_application_open(new.data) then return new; end if;
  student_data := public.scholarship_guard_student_state(coalesce(new.data->>'studentId', new.data->>'studentnumber', new.data->>'studentNumber'));
  if student_data->>'scholarshipLifecycleVersion' = '2' then
    select data into application_data from public.scholarship_applications
      where id = student_data#>>'{scholarshipCommitment,applicationId}';
    if application_data is null or not public.scholarship_application_open(application_data)
      or application_data->>'grantorId' is distinct from new.parent_id
      or (nullif(new.data->>'applicationId', '') is not null and
        new.data->>'applicationId' is distinct from student_data#>>'{scholarshipCommitment,applicationId}') then
      raise exception 'scholarship_choice_required';
    end if;
    new.data := new.data || jsonb_build_object('applicationId', student_data#>>'{scholarshipCommitment,applicationId}',
      'applicationNumber', application_data->>'applicationNumber', 'scholarshipId', application_data->>'scholarshipId', 'grantorId', new.parent_id);
  end if;
  return new;
end;
$$;

revoke all on function public.scholarship_guard_student_state(text) from public, anon, authenticated;
revoke all on function public.guard_scholarship_material_identity() from public, anon, authenticated;
revoke all on function public.guard_scholarship_roster_commitment() from public, anon, authenticated;
grant execute on function public.scholarship_guard_student_state(text) to service_role;
