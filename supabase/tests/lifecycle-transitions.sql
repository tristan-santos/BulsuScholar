-- Run after 20260915133000 and 20260915150000. Every fixture is rolled back.
begin;

insert into public.grantor_portals(id, data) values
  ('__lifecycle_g1', '{"status":"Active","archived":false}'),
  ('__lifecycle_g2', '{"status":"Active","archived":false}');

insert into public.pending_students(id, data) values
  ('__lifecycle_s1', '{"authUserId":"auth-lifecycle-s1","email":"student1@example.test","fullName":"Ana Student","scholarships":[]}'),
  ('__lifecycle_s2', '{"authUserId":"auth-lifecycle-s2","email":"student2@example.test","fullName":"Ben Student","scholarships":[]}');

insert into public.grantor_portal_scholars(id, parent_id, data) values
  ('__lifecycle_r1', '__lifecycle_g1', '{"studentId":"__lifecycle_s1","grantorName":"Grantor One","scholarshipName":"Scholarship One","status":"Pending"}'),
  ('__lifecycle_r2', '__lifecycle_g2', '{"studentId":"__lifecycle_s1","grantorName":"Grantor Two","scholarshipName":"Scholarship Two","status":"Pending"}'),
  ('__lifecycle_r3', '__lifecycle_g1', '{"studentId":"__lifecycle_s2","grantorName":"Grantor One","scholarshipName":"Scholarship Three","status":"Pending"}');

do $$
declare
  result jsonb;
  application_id text;
begin
  result := public.promote_email_confirmed_student(
    '__lifecycle_s1', 'auth-lifecycle-s1', 'student1@example.test'
  );
  if result->>'promoted' <> 'true'
    or result->>'rosterConflict' <> 'true'
    or result#>>'{student,rosterAssignmentState,status}' <> 'conflict' then
    raise exception 'TEST FAILED: multiple roster matches were not blocked for correction';
  end if;
  if exists(select 1 from public.pending_students where id = '__lifecycle_s1') then
    raise exception 'TEST FAILED: promoted student remained pending';
  end if;
  if exists(select 1 from public.scholarship_applications where data->>'studentId' = '__lifecycle_s1') then
    raise exception 'TEST FAILED: conflicting roster matches created an application';
  end if;

  result := public.promote_email_confirmed_student(
    '__lifecycle_s2', 'auth-lifecycle-s2', 'student2@example.test'
  );
  application_id := result#>>'{student,scholarshipCommitment,applicationId}';
  if result->>'rosterAssigned' <> 'true' or coalesce(application_id, '') = ''
    or not exists(select 1 from public.scholarship_applications where id = application_id
      and data->>'source' = 'authoritative_roster' and data->>'withdrawalLocked' = 'true') then
    raise exception 'TEST FAILED: single roster match was not assigned automatically';
  end if;
  update public.students set data = data || '{"corFile":{"url":"cor"},"rogFile":{"url":"rog"},"schoolIdFile":{"url":"id"}}'::jsonb
    where id = '__lifecycle_s2';
  update public.scholarship_applications set data = data || '{"applicationFormFile":{"url":"profile"}}'::jsonb
    where id = application_id;
  if not exists(select 1 from public.scholarship_applications where id = application_id
      and data->>'status' = 'Finished' and data->>'completionSource' = 'authoritative_roster'
      and data#>'{tracking,completedStepIds}' ? 'finish') then
    raise exception 'TEST FAILED: valid roster documents did not finish the workflow';
  end if;
  if exists(select 1 from public.soe_requests where data->>'applicationId' = application_id)
    or exists(select 1 from public.soe_downloads where data->>'applicationId' = application_id) then
    raise exception 'TEST FAILED: roster completion fabricated material artifacts';
  end if;
  result := public.update_authoritative_roster_scholar(
    'admin','__test_admin','__lifecycle_g1','__lifecycle_r3','{"archived":true}'::jsonb
  );
  if result->>'released' <> 'true'
    or result#>>'{application,withdrawalLocked}' <> 'false'
    or coalesce(result#>>'{application,cooldownUntil}','') = ''
    or exists(select 1 from public.students where id = '__lifecycle_s2' and data ? 'scholarshipCommitment') then
    raise exception 'TEST FAILED: individual roster archive did not release the commitment and start cooldown';
  end if;

  if has_function_privilege('authenticated',
      'public.promote_email_confirmed_student(text,text,text)', 'EXECUTE')
    or has_function_privilege('anon',
      'public.assign_authoritative_roster_scholarship(text,text,text)', 'EXECUTE') then
    raise exception 'TEST FAILED: lifecycle procedures are browser executable';
  end if;
end;
$$;

insert into public.students(id, data) values (
  '__lifecycle_tracking_student',
  '{"scholarshipLifecycleVersion":2,"scholarships":[{"id":"__lifecycle_tracking_app","applicationId":"__lifecycle_tracking_app","grantorId":"__lifecycle_g1","status":"Applied","tracking":{"completedStepIds":["account","scholarship_apply"]}}]}'
);
insert into public.scholarship_applications(id, data) values (
  '__lifecycle_tracking_app',
  '{"studentId":"__lifecycle_tracking_student","grantorId":"__lifecycle_g1","status":"Applied","lifecycleVersion":2,"tracking":{"completedStepIds":["account","scholarship_apply"]},"decisionConfirmation":{"status":"pending","decision":"approve","stepId":"admin_decision","stepLabel":"Administrator Decision"}}'
);

do $$
declare result jsonb;
begin
  result := public.confirm_grantor_admin_decision('__lifecycle_g1', '__lifecycle_tracking_app');
  if not (result#>'{application,tracking,completedStepIds}' ? 'admin_decision')
    or result#>>'{application,grantorConfirmationDecision}' <> 'approve' then
    raise exception 'TEST FAILED: grantor confirmation did not advance the stored step';
  end if;
  result := public.confirm_grantor_admin_decision('__lifecycle_g1', '__lifecycle_tracking_app');
  if result->>'idempotent' <> 'true' then
    raise exception 'TEST FAILED: repeated grantor confirmation was not idempotent';
  end if;
  if (select count(*) from public."studentNotifications"
      where id = 'grantor_decision___lifecycle_tracking_app_admin_decision_approve') <> 1 then
    raise exception 'TEST FAILED: deterministic confirmation notification missing';
  end if;
end;
$$;

insert into public.grantor_portal_announcements(id, parent_id, data) values (
  '__lifecycle_archive_offering', '__lifecycle_g1',
  '{"applicationEnabled":true,"slotsConfigured":true,"totalSlots":25,"remainingSlots":24,"status":"Open","archived":false}'
);
insert into public.students(id, data) values (
  '__lifecycle_archive_student',
  '{"scholarshipLifecycleVersion":2,"scholarships":[{"id":"__lifecycle_archive_app","applicationId":"__lifecycle_archive_app","grantorId":"__lifecycle_g1","scholarshipName":"Preserved Scholarship","status":"Awarded","slotReserved":true}],"scholarshipCommitment":{"applicationId":"__lifecycle_archive_app","grantorId":"__lifecycle_g1","scholarshipName":"Preserved Scholarship"}}'
);
insert into public.scholarship_applications(id, data) values (
  '__lifecycle_archive_app',
  '{"studentId":"__lifecycle_archive_student","grantorId":"__lifecycle_g1","announcementId":"__lifecycle_archive_offering","scholarshipName":"Preserved Scholarship","status":"Awarded","lifecycleVersion":2,"slotReserved":true,"tracking":{"completedStepIds":["account","scholarship_apply","document_review"]}}'
);
insert into public.grantor_portal_scholars(id, parent_id, data) values (
  '__lifecycle_archive_roster', '__lifecycle_g1',
  '{"studentId":"__lifecycle_archive_student","applicationId":"__lifecycle_archive_app","scholarshipName":"Preserved Scholarship","status":"Active"}'
);

do $$
declare result jsonb;
begin
  update public.grantor_portals set data = data || '{"archived":true,"status":"Archived"}'::jsonb
    where id = '__lifecycle_g1';
  result := public.sync_archived_grantor_scholar_choices('__lifecycle_g1', true, '__lifecycle_admin');
  if result->>'affectedScholarCount' <> '1'
    or not exists(select 1 from public.students where id = '__lifecycle_archive_student'
      and not (data ? 'grantorArchiveChoice')
      and data#>>'{scholarships,0,grantorArchiveDecision}' = 'auto_keep'
      and data#>>'{scholarships,0,servicingOwner}' = 'admin'
      and data#>>'{scholarshipCommitment,applicationId}' = '__lifecycle_archive_app') then
    raise exception 'TEST FAILED: archived grantor scholar was not moved to administrator servicing';
  end if;
  if (select data->>'remainingSlots' from public.grantor_portal_announcements
      where id = '__lifecycle_archive_offering') <> '24' then
    raise exception 'TEST FAILED: archive released the preserved scholarship slot';
  end if;
  update public.grantor_portals set data = data || '{"archived":false,"status":"Active"}'::jsonb
    where id = '__lifecycle_g1';
  result := public.sync_archived_grantor_scholar_choices('__lifecycle_g1', false, '__lifecycle_admin');
  if exists(select 1 from public.students where id = '__lifecycle_archive_student'
      and data ? 'grantorArchiveChoice')
    or not exists(select 1 from public.students where id = '__lifecycle_archive_student'
      and data#>>'{scholarships,0,servicingOwner}' = 'grantor') then
    raise exception 'TEST FAILED: restored auto-serviced record did not return to grantor management';
  end if;
end;
$$;

rollback;
