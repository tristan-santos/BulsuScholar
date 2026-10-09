create or replace function public.sync_scholarship_application_columns()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  closed_value text;
begin
  new.student_id := coalesce(nullif(new.data->>'studentId', ''), nullif(new.data->>'studentNumber', ''), new.student_id);
  new.grantor_id := coalesce(nullif(new.data->>'grantorId', ''), nullif(new.data->>'providerId', ''), new.grantor_id);
  new.scholarship_id := coalesce(nullif(new.data->>'scholarshipId', ''), nullif(new.data->>'announcementId', ''), new.scholarship_id);
  new.academic_cycle := coalesce(nullif(new.data->>'academicCycle', ''), nullif(new.data->>'semesterTag', ''), new.academic_cycle);
  new.status := coalesce(nullif(new.data->>'status', ''), new.status, 'Unknown');
  closed_value := coalesce(
    nullif(new.data->>'closedAt', ''),
    nullif(new.data->>'archivedAt', ''),
    nullif(new.data->>'withdrawnAt', ''),
    nullif(new.data->>'rejectedAt', '')
  );
  if closed_value ~ '^\d{4}-\d{2}-\d{2}T' then
    begin
      new.closed_at := closed_value::timestamptz;
    exception when others then
      new.closed_at := coalesce(new.closed_at, new.updated_at, now());
    end;
  elsif public.scholarship_application_open(new.data) then
    new.closed_at := null;
  else
    new.closed_at := coalesce(new.closed_at, new.updated_at, now());
  end if;
  return new;
end;
$$;

select set_config('bulsuscholar.choice_write', 'true', true);

update public.scholarship_applications
set closed_at = coalesce(
  case
    when coalesce(
      nullif(data->>'closedAt', ''),
      nullif(data->>'archivedAt', ''),
      nullif(data->>'withdrawnAt', ''),
      nullif(data->>'rejectedAt', '')
    ) ~ '^\d{4}-\d{2}-\d{2}T'
    then coalesce(
      nullif(data->>'closedAt', ''),
      nullif(data->>'archivedAt', ''),
      nullif(data->>'withdrawnAt', ''),
      nullif(data->>'rejectedAt', '')
    )::timestamptz
  end,
  updated_at,
  created_at
)
where not public.scholarship_application_open(data)
  and closed_at is null;

revoke all on function public.sync_scholarship_application_columns() from public, anon, authenticated;
grant execute on function public.sync_scholarship_application_columns() to service_role;
