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
    or jsonb_array_length(result->'rosterMatches') <> 2
    or result#>>'{student,rosterDecisionPending}' <> 'true' then
    raise exception 'TEST FAILED: confirmed student roster gate was not created';
  end if;
  if exists(select 1 from public.pending_students where id = '__lifecycle_s1') then
    raise exception 'TEST FAILED: promoted student remained pending';
  end if;

  result := public.resolve_student_roster_scholarship(
    '__lifecycle_s1', '__lifecycle_g2', '__lifecycle_r2', 'confirm'
  );
  application_id := result#>>'{application,applicationId}';
  if coalesce(application_id, '') = ''
    or result#>>'{student,scholarshipCommitment,applicationId}' <> application_id
    or result#>>'{application,slotReserved}' <> 'false' then
    raise exception 'TEST FAILED: roster confirmation did not create a no-capacity commitment';
  end if;
  if not exists(select 1 from public.grantor_portal_scholars
    where id = '__lifecycle_r1' and parent_id = '__lifecycle_g1'
      and data->>'rosterConflictReview' = 'true') then
    raise exception 'TEST FAILED: competing roster match was not flagged';
  end if;
  result := public.resolve_student_roster_scholarship(
    '__lifecycle_s1', '__lifecycle_g2', '__lifecycle_r2', 'confirm'
  );
  if result->>'idempotent' <> 'true' then
    raise exception 'TEST FAILED: roster confirmation retry was not idempotent';
  end if;

  result := public.promote_email_confirmed_student(
    '__lifecycle_s2', 'auth-lifecycle-s2', 'student2@example.test'
  );
  result := public.resolve_student_roster_scholarship(
    '__lifecycle_s2', '__lifecycle_g1', '__lifecycle_r3', 'decline'
  );
  if result#>>'{student,rosterDecisionPending}' <> 'false'
    or not exists(select 1 from public.grantor_portal_scholars
      where id = '__lifecycle_r3' and data->>'rosterDisputed' = 'true'
        and data->>'archived' = 'true') then
    raise exception 'TEST FAILED: roster dispute was not archived and resolved';
  end if;
  result := public.resolve_student_roster_scholarship(
    '__lifecycle_s2', '__lifecycle_g1', '__lifecycle_r3', 'decline'
  );
  if result->>'idempotent' <> 'true' then
    raise exception 'TEST FAILED: roster dispute retry was not idempotent';
  end if;

  if has_function_privilege('authenticated',
      'public.promote_email_confirmed_student(text,text,text)', 'EXECUTE')
    or has_function_privilege('anon',
      'public.resolve_student_roster_scholarship(text,text,text,text)', 'EXECUTE') then
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
      and data#>>'{grantorArchiveChoice,decision}' = 'pending'
      and data#>>'{scholarshipCommitment,applicationId}' = '__lifecycle_archive_app') then
    raise exception 'TEST FAILED: archived grantor scholar was not preserved';
  end if;
  if (select data->>'remainingSlots' from public.grantor_portal_announcements
      where id = '__lifecycle_archive_offering') <> '24' then
    raise exception 'TEST FAILED: archive released the preserved scholarship slot';
  end if;

  result := public.resolve_archived_grantor_scholar_choice(
    '__lifecycle_archive_student', '__lifecycle_archive_app', 'keep'
  );
  if result#>>'{choice,servicingOwner}' <> 'admin'
    or result#>>'{choice,workflowPaused}' <> 'false' then
    raise exception 'TEST FAILED: Keep did not assign continuation to the administrator';
  end if;

  update public.grantor_portals set data = data || '{"archived":false,"status":"Active"}'::jsonb
    where id = '__lifecycle_g1';
  result := public.sync_archived_grantor_scholar_choices('__lifecycle_g1', false, '__lifecycle_admin');
  if exists(select 1 from public.students where id = '__lifecycle_archive_student'
      and data ? 'grantorArchiveChoice')
    or not exists(select 1 from public.students where id = '__lifecycle_archive_student'
      and data#>>'{scholarships,0,servicingOwner}' = 'grantor') then
    raise exception 'TEST FAILED: restored Keep record did not return to grantor management';
  end if;
end;
$$;

rollback;
