-- BulsuScholar production data reset.
--
-- This file preserves exactly one root administrator: Tristan@Root.
-- It clears application data and restores required configuration defaults with
-- Maintenance Mode enabled. It does not modify auth.* or storage.objects.
--
-- Required order:
--   1. Create a Supabase backup.
--   2. Run this entire file in Supabase Dashboard > SQL Editor.
--   3. From the trusted local checkout, run:
--        $env:RESET_CONFIRMATION='DELETE_ALL_EXCEPT_ROOT'
--        npm.cmd run reset:except-root -- --execute
--        Remove-Item Env:RESET_CONFIRMATION
--   4. Verify root access, then disable Maintenance Mode from the root portal.

begin;

do $$
declare
  root_count integer;
  total_root_count integer;
  matching_auth_count integer;
  code_count integer;
  valid_code_count integer;
begin
  select count(*)::integer
  into total_root_count
  from public.root_admins;

  select count(*)::integer
  into root_count
  from public.root_admins
  where id = 'Tristan@Root'
    and active is true
    and auth_user_id is not null;

  if total_root_count <> 1 or root_count <> 1 then
    raise exception 'root_reset_aborted: expected Tristan@Root to be the only root record';
  end if;

  select jsonb_array_length(login_code_hashes)
  into code_count
  from public.root_admins
  where id = 'Tristan@Root';

  if code_count <> 10 then
    raise exception 'root_reset_aborted: expected ten root login code hashes, found %', coalesce(code_count, 0);
  end if;

  select count(distinct code_hash)::integer
  into valid_code_count
  from public.root_admins as root_admin,
    jsonb_array_elements_text(root_admin.login_code_hashes) as code_hash
  where root_admin.id = 'Tristan@Root'
    and code_hash ~ '^[0-9a-f]{64}$';

  if valid_code_count <> 10 then
    raise exception 'root_reset_aborted: expected ten unique SHA-256 root login code hashes';
  end if;

  select count(*)::integer
  into matching_auth_count
  from auth.users as auth_user
  join public.root_admins as root_admin
    on root_admin.auth_user_id = auth_user.id
  where root_admin.id = 'Tristan@Root';

  if matching_auth_count <> 1 then
    raise exception 'root_reset_aborted: root Auth identity is missing or ambiguous';
  end if;
end
$$;

truncate table
  public.admin_settings,
  public."studentNotifications",
  public."grantorNotifications",
  public."systemLogs",
  public.student_document_usage,
  public.student_warnings,
  public.scholarship_applications,
  public.grantor_portal_applications,
  public.grantor_portal_announcements,
  public.grantor_portal_scholars,
  public.soe_downloads,
  public.soe_requests,
  public.announcements,
  public.pending_students,
  public.students,
  public.grantor_portals,
  public.providers,
  public.admins,
  public.support_feedback,
  public.branding_versions,
  public.request_metric_buckets,
  public.root_sessions,
  public.root_audit_logs,
  public.system_configuration
restart identity cascade;

insert into public.system_configuration (id, data, updated_at)
values
  (
    'portal',
    jsonb_build_object(
      'maintenanceMode', true,
      'allowStudentSignup', true,
      'allowGrantorAnnouncements', true,
      'reportExportEnabled', true,
      'resetAt', now()
    ),
    now()
  ),
  (
    'academic_cycle',
    jsonb_build_object(
      'academicYear', case
        when extract(month from now()) >= 7 then
          extract(year from now())::integer::text || '-' || (extract(year from now())::integer + 1)::text
        else
          (extract(year from now())::integer - 1)::text || '-' || extract(year from now())::integer::text
      end,
      'semester', case when extract(month from now()) >= 7 then '1ST' else '2ND' end,
      'semesterTag', case
        when extract(month from now()) >= 7 then
          extract(year from now())::integer::text || '-' || (extract(year from now())::integer + 1)::text || '-1ST'
        else
          (extract(year from now())::integer - 1)::text || '-' || extract(year from now())::integer::text || '-2ND'
      end,
      'activatedAt', now()
    ),
    now()
  ),
  (
    'branding',
    jsonb_build_object(
      'productName', 'BulsuScholar',
      'fontFamily', 'Inter',
      'primaryColor', '#006b3c',
      'accentColor', '#16a34a',
      'logoUrl', '',
      'faviconUrl', '',
      'maintenanceMessage', 'BulsuScholar is temporarily under maintenance while system data is reset.'
    ),
    now()
  );

commit;

select 'root_admins' as table_name, count(*)::bigint as row_count from public.root_admins
union all select 'system_configuration', count(*) from public.system_configuration
union all select 'admin_settings', count(*) from public.admin_settings
union all select 'admins', count(*) from public.admins
union all select 'students', count(*) from public.students
union all select 'pending_students', count(*) from public.pending_students
union all select 'providers', count(*) from public.providers
union all select 'grantor_portals', count(*) from public.grantor_portals
union all select 'grantor_portal_scholars', count(*) from public.grantor_portal_scholars
union all select 'grantor_portal_applications', count(*) from public.grantor_portal_applications
union all select 'grantor_portal_announcements', count(*) from public.grantor_portal_announcements
union all select 'scholarship_applications', count(*) from public.scholarship_applications
union all select 'announcements', count(*) from public.announcements
union all select 'soe_requests', count(*) from public.soe_requests
union all select 'soe_downloads', count(*) from public.soe_downloads
union all select 'student_warnings', count(*) from public.student_warnings
union all select 'student_document_usage', count(*) from public.student_document_usage
union all select 'studentNotifications', count(*) from public."studentNotifications"
union all select 'grantorNotifications', count(*) from public."grantorNotifications"
union all select 'systemLogs', count(*) from public."systemLogs"
union all select 'support_feedback', count(*) from public.support_feedback
union all select 'branding_versions', count(*) from public.branding_versions
union all select 'request_metric_buckets', count(*) from public.request_metric_buckets
union all select 'root_sessions', count(*) from public.root_sessions
union all select 'root_audit_logs', count(*) from public.root_audit_logs
order by table_name;
