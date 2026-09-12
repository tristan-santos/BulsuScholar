-- Run after the prerequisite and choice migration, inside BEGIN ... ROLLBACK.
-- All fixtures deliberately use unique IDs and fail rather than overwrite data.
insert into public.students(id, data) values
  ('__choice_test_legacy_award', '{"scholarships":[{"id":"legacy-award","applicationNumber":"legacy-award","grantorId":"legacy-owner","status":"Awarded","isLocked":true}]}'),
  ('__choice_test_legacy_pending', '{"scholarships":[{"id":"legacy-pending","applicationNumber":"legacy-pending","grantorId":"legacy-owner","status":"Applied","tracking":{"completedStepIds":["document_review"]}}]}'),
  ('__choice_test_legacy_ambiguous', '{"scholarships":[{"id":"unknown-award","status":"Awarded","isLocked":true},{"id":"unknown-second-award","status":"Awarded","isLocked":true}]}');
insert into public.scholarship_applications(id,data) values
  ('__choice_test_legacy_a1', '{"studentId":"__choice_test_legacy_award","applicationNumber":"legacy-award","grantorId":"legacy-owner","status":"Awarded"}'),
  ('__choice_test_legacy_a2', '{"studentId":"__choice_test_legacy_pending","applicationNumber":"legacy-pending","grantorId":"legacy-owner","status":"Applied"}');
do $$
begin
  perform public.migrate_legacy_scholarship_choices(array['__choice_test_legacy_award', '__choice_test_legacy_pending', '__choice_test_legacy_ambiguous']);
  if not exists(select 1 from public.students where id = '__choice_test_legacy_award'
    and data#>>'{scholarshipCommitment,applicationId}' = '__choice_test_legacy_a1'
    and data#>>'{scholarships,0,isLocked}' = 'true') then
    raise exception 'TEST FAILED: legacy award was not preserved';
  end if;
  if exists(select 1 from public.students where id = '__choice_test_legacy_pending'
    and (data ? 'scholarshipCommitment' or data#>'{scholarships,0,tracking,completedStepIds}' ? 'document_review')) then
    raise exception 'TEST FAILED: legacy pending review was trusted or committed';
  end if;
  if not exists(select 1 from public.students where id = '__choice_test_legacy_ambiguous'
    and data->>'commitmentRequiresResolution' = 'true' and jsonb_array_length(data->'scholarships') = 2) then
    raise exception 'TEST FAILED: ambiguous awards were not preserved and flagged';
  end if;
end;
$$;
insert into public.grantor_portals(id, data) values
  ('__choice_test_g1', '{"status":"Active"}'), ('__choice_test_g2', '{"status":"Active"}');
insert into public.grantor_portal_announcements(id, parent_id, data) values
  ('__choice_test_o1', '__choice_test_g1', '{"applicationEnabled":true,"slotsConfigured":true,"totalSlots":25,"remainingSlots":24}'),
  ('__choice_test_o2', '__choice_test_g2', '{"applicationEnabled":true,"slotsConfigured":true,"totalSlots":25,"remainingSlots":24}');
insert into public.students(id, data) values ('__choice_test_s', '{"status":"Active","corFile":{"url":"test-cor"},"rogFile":{"url":"test-rog"},"schoolIdFile":{"url":"test-id"},"scholarships":[{"id":"test-number-1","applicationNumber":"test-number-1","grantorId":"__choice_test_g1","status":"Applied"},{"id":"test-number-2","applicationNumber":"test-number-2","grantorId":"__choice_test_g2","status":"Applied"}]}');
insert into public.scholarship_applications(id, data) values
  ('__choice_test_a1', '{"studentId":"__choice_test_s","grantorId":"__choice_test_g1","announcementId":"__choice_test_o1","applicationNumber":"test-number-1","slotReserved":true,"status":"Applied","semesterTag":"test-cycle"}'),
  ('__choice_test_a2', '{"studentId":"__choice_test_s","grantorId":"__choice_test_g2","announcementId":"__choice_test_o2","applicationNumber":"test-number-2","slotReserved":true,"status":"Applied","semesterTag":"test-cycle"}');

do $$
declare r jsonb; n integer;
begin
  begin
    perform public.mutate_scholarship_choice('__choice_test_s', '__choice_test_a1', 'choose');
    raise exception 'TEST FAILED: unreviewed application committed';
  exception when raise_exception then
    if sqlerrm <> 'document_review_required' then raise; end if;
  end;
  if exists(select 1 from public.soe_requests where id = 'choice___choice_test_a1') then
    raise exception 'TEST FAILED: failed choice created a material request';
  end if;
  update public.scholarship_applications set data = data ||
    '{"tracking":{"completedStepIds":["document_review"]}}'::jsonb where id = '__choice_test_a1';
  update public.students set data = data || '{"corFile":{"url":"replacement-cor"}}'::jsonb
    where id = '__choice_test_s';
  begin
    perform public.mutate_scholarship_choice('__choice_test_s', '__choice_test_a1', 'choose');
    raise exception 'TEST FAILED: obsolete documents committed';
  exception when raise_exception then
    if sqlerrm <> 'document_versions_changed' then raise; end if;
  end;
  update public.scholarship_applications set data = jsonb_set(data, '{tracking,completedStepIds}', '[]')
    where id = '__choice_test_a1';
  update public.scholarship_applications set data = jsonb_set(data, '{tracking,completedStepIds}', '["document_review"]')
    where id = '__choice_test_a1';
  r := public.mutate_scholarship_choice('__choice_test_s', '__choice_test_a1', 'choose');
  if r#>>'{student,scholarshipCommitment,applicationId}' <> '__choice_test_a1'
    or jsonb_array_length(r#>'{student,scholarships}') <> 1 then
    raise exception 'TEST FAILED: incorrect commitment or active entries';
  end if;
  if (select data->>'remainingSlots' from public.grantor_portal_announcements
    where id = '__choice_test_o2' and parent_id = '__choice_test_g2') <> '25' then
    raise exception 'TEST FAILED: competitor slot not returned';
  end if;
  if (select data->>'remainingSlots' from public.grantor_portal_announcements
    where id = '__choice_test_o1' and parent_id = '__choice_test_g1') <> '24' then
    raise exception 'TEST FAILED: selected slot released';
  end if;
  if not exists(select 1 from public.soe_requests where id = 'choice___choice_test_a1'
    and data->>'applicationFormType' = 'default'
    and data#>>'{materials,application_form,status}' = 'pending') then
    raise exception 'TEST FAILED: default application form was not included in the material request';
  end if;
  r := public.mutate_scholarship_choice('__choice_test_s', '__choice_test_a1', 'choose');
  if r->>'idempotent' <> 'true' then raise exception 'TEST FAILED: retry was not idempotent'; end if;
  select count(*) into n from public."grantorNotifications" where id in (
    'choice_selected___choice_test_a1', 'choice_closed___choice_test_a2');
  if n <> 2 then raise exception 'TEST FAILED: grantor notification deduplication'; end if;
  if (select data->>'message' from public."grantorNotifications" where id = 'choice_closed___choice_test_a2')
      <> 'Student selected another scholarship' then
    raise exception 'TEST FAILED: competitor privacy';
  end if;
  begin
    update public.scholarship_applications set data = data || '{"archived":false,"status":"Approved"}'
      where id = '__choice_test_a2';
    raise exception 'TEST FAILED: archived application restored';
  exception when raise_exception then
    if sqlerrm <> 'application_closed' then raise; end if;
  end;
  begin
    perform public.mutate_scholarship_choice('__choice_test_s', '__choice_test_a1', 'withdraw');
    raise exception 'TEST FAILED: committed application withdrawn';
  exception when raise_exception then
    if sqlerrm <> 'scholarship_already_committed' then raise; end if;
  end;
  update public.soe_requests set data = data || '{"status":"Rejected"}' where id = 'choice___choice_test_a1';
  if not exists(select 1 from public.students where id = '__choice_test_s'
    and data#>>'{scholarshipCommitment,applicationId}' = '__choice_test_a1') then
    raise exception 'TEST FAILED: material rejection removed commitment';
  end if;
  perform public.release_scholarship_slot_for_application('__choice_test_a1', '{"status":"Rejected"}');
  if exists(select 1 from public.students where id = '__choice_test_s' and data ? 'scholarshipCommitment') then
    raise exception 'TEST FAILED: application rejection retained commitment';
  end if;
  perform public.release_scholarship_slot_for_application('__choice_test_a1', '{"status":"Rejected"}');
  if (select data->>'remainingSlots' from public.grantor_portal_announcements
    where id = '__choice_test_o1' and parent_id = '__choice_test_g1') <> '25' then
    raise exception 'TEST FAILED: repeat rejection released slot twice';
  end if;
end;
$$;


insert into public.students(id, data) values ('__choice_test_multi', '{"status":"Active","gwa":"1.75","scholarships":[]}');
do $$
declare r jsonb;
begin
  perform public.reserve_scholarship_application('__choice_test_multi', '__choice_test_o1', '__choice_test_g1', '__choice_test_m1', 'test-m1');
  r := public.reserve_scholarship_application('__choice_test_multi', '__choice_test_o2', '__choice_test_g2', '__choice_test_m2', 'test-m2');
  if jsonb_array_length(r#>'{student,scholarships}') <> 2 then
    raise exception 'TEST FAILED: second application overwrote first';
  end if;
  r := public.reserve_scholarship_application('__choice_test_multi', '__choice_test_o1', '__choice_test_g1', '__choice_test_duplicate', 'test-duplicate');
  if r->>'idempotent' <> 'true' or r->>'applicationId' <> '__choice_test_m1' then
    raise exception 'TEST FAILED: duplicate submission reserved twice';
  end if;
  begin
    perform public.reserve_scholarship_application('__choice_test_multi', 'another-offering', '__choice_test_g1', '__choice_test_other', 'test-other');
    raise exception 'TEST FAILED: two applications to same grantor';
  exception when raise_exception then
    if sqlerrm <> 'grantor_application_exists' then raise; end if;
  end;
  r := public.mutate_scholarship_choice('__choice_test_multi', '__choice_test_m1', 'withdraw');
  if jsonb_array_length(r#>'{student,scholarships}') <> 1 then
    raise exception 'TEST FAILED: withdrawal affected competing application';
  end if;
  r := public.mutate_scholarship_choice('__choice_test_multi', '__choice_test_m1', 'withdraw');
  if r->>'idempotent' <> 'true' then raise exception 'TEST FAILED: withdrawal retry'; end if;
  if (select data->>'remainingSlots' from public.grantor_portal_announcements
    where id = '__choice_test_o1' and parent_id = '__choice_test_g1') <> '25' then
    raise exception 'TEST FAILED: withdrawal slot release';
  end if;
  begin
    perform public.reserve_scholarship_application('__choice_test_multi', '__choice_test_o1', '__choice_test_g1', '__choice_test_cooldown', 'test-cooldown');
    raise exception 'TEST FAILED: withdrawal cooldown bypassed';
  exception when raise_exception then
    if sqlerrm <> 'reapply_cooldown_active' then raise; end if;
  end;
  if not exists(select 1 from public.scholarship_applications where id = '__choice_test_m2'
    and public.scholarship_application_open(data)) then
    raise exception 'TEST FAILED: withdrawal closed other grantor application';
  end if;
  if has_function_privilege('authenticated', 'public.mutate_scholarship_choice(text,text,text)', 'EXECUTE')
    or has_function_privilege('anon', 'public.reserve_scholarship_application(text,text,text,text,text)', 'EXECUTE') then
    raise exception 'TEST FAILED: public RPC mutation access';
  end if;
end;
$$;

-- A failure after creating the chosen request must roll back every write.
insert into public.students(id, data) values ('__choice_test_failure',
  '{"status":"Active","scholarships":[{"id":"failure-number","applicationNumber":"failure-number","grantorId":"__choice_test_g1","status":"Applied"}]}');
insert into public.scholarship_applications(id, data) values
  ('__choice_test_failure_a1', '{"studentId":"__choice_test_failure","grantorId":"__choice_test_g1","announcementId":"__choice_test_o1","applicationNumber":"failure-number","slotReserved":true,"status":"Applied"}'),
  ('__choice_test_failure_a2', '{"studentId":"__choice_test_failure","grantorId":"__choice_test_g2","announcementId":"__choice_test_missing_offering","applicationNumber":"failure-other","slotReserved":true,"status":"Applied"}');
do $$
begin
  update public.scholarship_applications set data = data || '{"tracking":{"completedStepIds":["document_review"]}}'
    where id = '__choice_test_failure_a1';
  begin
    perform public.mutate_scholarship_choice('__choice_test_failure', '__choice_test_failure_a1', 'choose');
    raise exception 'TEST FAILED: missing competitor reservation did not abort';
  exception when raise_exception then
    if sqlerrm <> 'slot_reservation_missing' then raise; end if;
  end;
  if exists(select 1 from public.soe_requests where id = 'choice___choice_test_failure_a1')
    or exists(select 1 from public.scholarship_applications where id = '__choice_test_failure_a1' and data ? 'committedAt')
    or exists(select 1 from public.scholarship_applications where id = '__choice_test_failure_a2' and data->>'archived' = 'true') then
    raise exception 'TEST FAILED: failed transaction left partial changes';
  end if;
end;
$$;

-- Shared file replacements invalidate only pending applications' reviews.
do $$
declare r jsonb;
begin
  update public.students set data = data || '{"corFile":{"url":"v2-cor"},"cogFile":{"url":"v2-rog"},"schoolIdFile":{"url":"v2-id"}}'
    where id = '__choice_test_multi';
  perform public.update_scholarship_application_documents('__choice_test_multi', '__choice_test_m2',
    'applicationFormFile', '{"url":"v2-form","name":"form.pdf"}');
  begin
    insert into public.grantor_portal_scholars(id, parent_id, data) values (
      '__choice_test_premature_roster', '__choice_test_g2',
      '{"studentId":"__choice_test_multi","applicationId":"__choice_test_m2","status":"Active"}');
    raise exception 'TEST FAILED: pending application became an active scholar';
  exception when raise_exception then
    if sqlerrm <> 'scholarship_choice_required' then raise; end if;
  end;
  update public.scholarship_applications set data = jsonb_set(data, '{tracking,completedStepIds}', '["document_review"]')
    where id = '__choice_test_m2';
  update public.students set data = data || '{"corFile":{"url":"v2-cor-replacement"}}'
    where id = '__choice_test_multi';
  if exists(select 1 from public.scholarship_applications where id = '__choice_test_m2'
    and data#>'{tracking,completedStepIds}' ? 'document_review') then
    raise exception 'TEST FAILED: changed shared document left approval active';
  end if;
  update public.scholarship_applications set data = jsonb_set(data, '{tracking,completedStepIds}', '["document_review"]')
    where id = '__choice_test_m2';
  update public.scholarship_applications set data = data || '{"providerType":"kuya_win","customApplicationForm":{"url":"https://example.test/grantor-form.pdf","name":"grantor-form.pdf"}}'
    where id = '__choice_test_m2';
  begin
    perform public.mutate_scholarship_choice('__choice_test_multi', '__choice_test_m2', 'choose');
    raise exception 'TEST FAILED: KWSP screening was bypassed';
  exception when raise_exception then
    if sqlerrm <> 'document_review_required' then raise; end if;
  end;
  update public.scholarship_applications set data = jsonb_set(data, '{tracking,completedStepIds}',
    '["document_review","admin_review","interview","application_review","final_screening"]') where id = '__choice_test_m2';
  r := public.mutate_scholarship_choice('__choice_test_multi', '__choice_test_m2', 'choose');
  if not exists(select 1 from public.grantor_portal_scholars where id = 'choice___choice_test_m2'
    and data->>'selectionManaged' = 'true' and data->>'status' = 'Active') then
    raise exception 'TEST FAILED: chosen KWSP scholar did not reach roster';
  end if;
  if r#>>'{student,scholarshipCommitment,applicationId}' <> '__choice_test_m2' then
    raise exception 'TEST FAILED: reviewed v2 application could not commit';
  end if;
  if not exists(select 1 from public.soe_requests where id = 'choice___choice_test_m2'
    and data#>>'{materials,application_form,status}' = 'pending'
    and data->>'applicationFormType' = 'custom'
    and data#>>'{customApplicationForm,name}' = 'grantor-form.pdf') then
    raise exception 'TEST FAILED: grantor custom form was not included in the material request';
  end if;
  perform public.update_scholarship_application_documents('__choice_test_multi', '__choice_test_m2',
    'applicationFormFile', '{"url":"corrected-form"}');
  update public.soe_requests set data = data || '{"status":"Rejected"}' where id = 'choice___choice_test_m2';
  r := public.mutate_scholarship_choice('__choice_test_multi', '__choice_test_m2', 'choose');
  if r#>>'{materialRequest,status}' <> 'Pending' or r#>>'{student,scholarshipCommitment,applicationId}' <> '__choice_test_m2' then
    raise exception 'TEST FAILED: material correction did not retain and resubmit commitment';
  end if;
  perform set_config('bulsuscholar.choice_write', '', true);
  update public.students set data = (data - 'scholarshipCommitment') || '{"scholarships":[]}'
    where id = '__choice_test_multi';
  if not exists(select 1 from public.students where id = '__choice_test_multi'
    and data#>>'{scholarshipCommitment,applicationId}' = '__choice_test_m2'
    and jsonb_array_length(data->'scholarships') = 1) then
    raise exception 'TEST FAILED: stale profile save bypassed commitment';
  end if;
  update public.scholarship_applications set data = data || '{"status":"Rejected"}' where id = '__choice_test_m2';
  if exists(select 1 from public.grantor_portal_scholars where id = 'choice___choice_test_m2'
    and data->>'archived' <> 'true') then
    raise exception 'TEST FAILED: rejected commitment left an active roster entry';
  end if;
  if exists(select 1 from public.students where id = '__choice_test_multi' and data ? 'scholarshipCommitment') then
    raise exception 'TEST FAILED: legacy rejection route retained v2 commitment';
  end if;
end;
$$;
