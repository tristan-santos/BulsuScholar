-- Priority 2-4 production migration.
-- Safe to run repeatedly in the Supabase SQL Editor.

do $$
declare
  statement text;
begin
  for statement in
    select value from (values
      ('create index if not exists students_studentnumber_idx on public.students ((data->>''studentnumber''))'),
      ('create index if not exists students_email_lower_idx on public.students ((lower(data->>''email'')))'),
      ('create index if not exists students_grantor_idx on public.students ((coalesce(data->>''grantorId'', data->>''providerId'')))'),
      ('create index if not exists students_status_idx on public.students ((data->>''status''))'),
      ('create index if not exists pending_students_studentnumber_idx on public.pending_students ((data->>''studentnumber''))'),
      ('create index if not exists scholarship_applications_student_idx on public.scholarship_applications ((data->>''studentId''))'),
      ('create index if not exists scholarship_applications_grantor_idx on public.scholarship_applications ((data->>''grantorId''))'),
      ('create index if not exists scholarship_applications_status_idx on public.scholarship_applications ((data->>''status''))'),
      ('create index if not exists scholarship_applications_announcement_idx on public.scholarship_applications ((data->>''announcementId''))'),
      ('create index if not exists grantor_scholars_parent_student_idx on public.grantor_portal_scholars (parent_id, ((coalesce(data->>''studentId'', data->>''studentnumber''))))'),
      ('create index if not exists grantor_scholars_parent_status_idx on public.grantor_portal_scholars (parent_id, ((data->>''status'')))'),
      ('create index if not exists grantor_applications_parent_student_idx on public.grantor_portal_applications (parent_id, ((data->>''studentId'')))'),
      ('create index if not exists grantor_applications_parent_status_idx on public.grantor_portal_applications (parent_id, ((data->>''status'')))'),
      ('create index if not exists grantor_announcements_parent_status_idx on public.grantor_portal_announcements (parent_id, ((data->>''status'')))'),
      ('create index if not exists student_notifications_owner_created_idx on public."studentNotifications" (((data->>''studentId'')), created_at desc)'),
      ('create index if not exists grantor_notifications_owner_created_idx on public."grantorNotifications" (((data->>''grantorId'')), created_at desc)'),
      ('create index if not exists admin_notifications_created_idx on public."adminNotifications" (created_at desc)'),
      ('create index if not exists system_logs_created_idx on public."systemLogs" (created_at desc)')
    ) as statements(value)
  loop
    begin
      execute statement;
    exception
      when undefined_table or undefined_column then
        raise notice 'Skipped unavailable table or column: %', statement;
    end;
  end loop;
end $$;

-- Canonicalize ROG fields while retaining read compatibility for older records.
update public.students
set data = jsonb_set(data, '{rogFile}', data->'cogFile', true)
where data ? 'cogFile' and not data ? 'rogFile';

update public.students
set data = jsonb_set(
  data,
  '{documentScan,rog}',
  data#>'{documentScan,cog}',
  true
)
where data#>'{documentScan,cog}' is not null
  and data#>'{documentScan,rog}' is null;

analyze public.students;
analyze public.scholarship_applications;
analyze public.grantor_portal_scholars;
analyze public.grantor_portal_applications;
analyze public.grantor_portal_announcements;

notify pgrst, 'reload schema';
