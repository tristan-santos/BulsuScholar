begin;

-- Clear only student state written by the retired leave workflow.
update public.students
set data = (
  data
  - 'loaStatus'
  - 'loaApprovedAt'
  - 'returnedAt'
  - 'recommendedPreviousScholarship'
  - 'scholarshipFrozen'
) || case
  when data->>'accountStatus' = 'leave_of_absence'
    then jsonb_build_object('accountStatus', 'active')
  else '{}'::jsonb
end,
updated_at = now()
where data ? 'loaStatus'
   or data ? 'loaApprovedAt'
   or data ? 'returnedAt'
   or data ? 'recommendedPreviousScholarship'
   or data->>'accountStatus' = 'leave_of_absence';

-- Restore only applications frozen by the exact retired workflow reason.
update public.scholarship_applications
set data = (
  data
  - 'frozenReason'
  - 'frozenAt'
) || jsonb_build_object(
  'status', 'pending',
  'applicationStatus', 'pending',
  'updatedAt', now()::text
),
updated_at = now()
where lower(coalesce(data->>'frozenReason', '')) = lower('Approved Leave of Absence')
  and (
    lower(coalesce(data->>'status', '')) = 'frozen'
    or lower(coalesce(data->>'applicationStatus', '')) = 'frozen'
  );

-- Remove notifications and logs created by the retired workflows.
do $cleanup$
declare
  target_table text;
begin
  foreach target_table in array array[
    'studentNotifications',
    'grantorNotifications',
    'student_warnings',
    'systemLogs'
  ] loop
    if to_regclass(format('public.%I', target_table)) is not null then
      execute format(
        'delete from public.%I
         where coalesce(data->>''type'', '''') ~* ''^(loa_|return_|unifast_)''
            or coalesce(data->>''action'', '''') ~* ''^(loa_|return_|unifast_)''
            or coalesce(data->>''notificationType'', '''') ~* ''^(loa_|return_|unifast_)''
            or coalesce(data->>''route'', '''') in (''/admin/leave-requests'', ''/student-dashboard/leave'', ''/admin/unifast'')
            or coalesce(data#>>''{metadata,route}'', '''') in (''/admin/leave-requests'', ''/student-dashboard/leave'', ''/admin/unifast'')',
        target_table
      );
    end if;
  end loop;
end
$cleanup$;

drop table if exists public.leave_requests cascade;
drop table if exists public.unifast_records cascade;

commit;
