	-- BulsuScholar full data reset script
	-- WARNING: This deletes application data from public tables and removes
	-- objects from the configured Supabase Storage bucket metadata.
	--
	-- Run this only when you intentionally want to refresh test data.
	-- Recommended: take a Supabase backup first.
	--
	-- This script keeps table structures, indexes, policies, and storage buckets.
	-- It does NOT delete Supabase Auth users by default. See the optional section
	-- at the bottom if you also need to remove Auth users.

	begin;

	-- Clear app data tables.
	-- CASCADE is used so dependent records are removed cleanly if constraints exist.
	truncate table
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
		public.admins
	restart identity cascade;

	-- Storage files cannot be deleted directly with SQL in Supabase.
	-- Supabase protects storage.objects with storage.protect_delete().
	-- Delete files from the Supabase Dashboard or use the Storage API instead.
	-- Bucket to clear: bulsuscholar

	-- Recreate the default admin app record after clearing data.
	-- This creates the row used by the app's legacy/admin lookup.
	-- Supabase Auth user creation is separate; if this admin should log in through
	-- Supabase Auth, create the same email in Authentication > Users.
	insert into public.admins (id, data, updated_at)
	values (
		'admin_01',
		'{
			"adminId": "admin_01",
			"fname": "System",
			"mname": "Test",
			"lname": "Administrator",
			"fullName": "System Test Administrator",
			"name": "System Test Administrator",
			"email": "admin@bulsu.edu.ph",
			"password": "geTEp4l7S3KGl+0oBp5uLzk1qmIzFFPlzSmNO3tV6zJwsVvywQ==",
			"role": "admin",
			"userType": "admin",
			"isValidated": true,
			"status": "Active",
			"createdAt": "2026-06-15T00:00:00.000Z",
			"updatedAt": "2026-06-15T00:00:00.000Z"
		}'::jsonb,
		now()
	)
	on conflict (id) do update
	set
		data = excluded.data,
		updated_at = now();

	commit;

	-- Verification counts. These should all return 0 after reset.
	select 'studentNotifications' as table_name, count(*) from public."studentNotifications"
	union all select 'grantorNotifications', count(*) from public."grantorNotifications"
	union all select 'systemLogs', count(*) from public."systemLogs"
	union all select 'student_document_usage', count(*) from public.student_document_usage
	union all select 'student_warnings', count(*) from public.student_warnings
	union all select 'scholarship_applications', count(*) from public.scholarship_applications
	union all select 'grantor_portal_applications', count(*) from public.grantor_portal_applications
	union all select 'grantor_portal_announcements', count(*) from public.grantor_portal_announcements
	union all select 'grantor_portal_scholars', count(*) from public.grantor_portal_scholars
	union all select 'soe_downloads', count(*) from public.soe_downloads
	union all select 'soe_requests', count(*) from public.soe_requests
	union all select 'announcements', count(*) from public.announcements
	union all select 'pending_students', count(*) from public.pending_students
	union all select 'students', count(*) from public.students
	union all select 'grantor_portals', count(*) from public.grantor_portals
	union all select 'providers', count(*) from public.providers
	union all select 'admins', count(*) from public.admins;

	-- OPTIONAL: Delete Supabase Auth users too.
	-- Do NOT run this unless you want to remove login accounts completely.
	-- If you delete Auth users, testers/admins/grantors must recreate accounts or be reseeded.
	--
	-- delete from auth.identities;
	-- delete from auth.sessions;
	-- delete from auth.refresh_tokens;
	-- delete from auth.users;
