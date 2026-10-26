-- Run after the optional-student-number migration inside a transaction and ROLLBACK.
-- Uses synthetic import rows with an existing active grantor/program. No awards assigned.
set local role service_role;
do $$
declare g text; program text; cycle text; row_data jsonb; result jsonb; i integer;
  batch text := 'verify_optional_number_roster';
begin
  select p.id, a.id into g, program from public.providers p
    join public.grantor_portal_announcements a on a.parent_id = p.id
    where public.roster_record_active(p.data) and public.roster_record_active(a.data) limit 1;
  if g is null then raise exception 'Test requires an active grantor and program'; end if;
  cycle := public.roster_current_cycle();
  insert into public.roster_import_batches(id, data) values(batch,
    jsonb_build_object('actorType', 'grantor', 'actorId', g, 'status', 'ready'));
  for i in 1..4 loop
    row_data := jsonb_build_object('fullName', case when i=4 then 'Synthetic Other Scholar' else 'Synthetic Optional Number Scholar' end,
      'studentId', '', 'grantorId', g, 'scholarshipId', program, 'academicCycle', cycle,
      'scholarshipTitle', 'Synthetic optional-number verification', 'blocking', false,
      'rosterData', jsonb_build_object('course', case when i=2 then 'BSIT' else 'BIT' end, 'yearLevel', case when i=3 then '3' else '4' end));
    insert into public.roster_import_rows(id, parent_id, data) values(batch || '_' || i, batch, row_data);
  end loop;
  result := public.commit_roster_import_batch(batch, 'grantor', g);
  if result#>>'{counts,created}' <> '4' or result#>>'{counts,unlinked}' <> '4' or result#>>'{counts,assigned}' <> '0' then
    raise exception 'Name/course/year records failed: %', result; end if;
  if (select count(*) from public.grantor_portal_scholars where data->>'importBatchId'=batch
      and data->>'accountLinkStatus'='unlinked' and data->>'studentId'='') <> 4 then
    raise exception 'Rows were collapsed or student numbers fabricated'; end if;
  result := public.commit_roster_import_batch(batch, 'grantor', g);
  if result->>'idempotent' <> 'true' then raise exception 'Retry not idempotent'; end if;
  insert into public.roster_import_batches(id, data) values(batch || '_retry',
    jsonb_build_object('actorType', 'grantor', 'actorId', g, 'status', 'ready'));
  insert into public.roster_import_rows(id,parent_id,data)
    select id || '_retry', batch || '_retry', data - 'commitStatus' - 'assignment' - 'rosterId' - 'committedAt'
    from public.roster_import_rows where parent_id=batch;
  result := public.commit_roster_import_batch(batch || '_retry', 'grantor', g);
  if result#>>'{counts,alreadyImported}' <> '4' or result#>>'{counts,created}' <> '0' then
    raise exception 'Reimport created duplicates: %', result; end if;
  begin
    perform public.commit_roster_import_batch(batch, 'grantor', 'different-grantor');
    raise exception 'Owner mismatch was accepted';
  exception when others then
    if sqlerrm <> 'roster_import_batch_owner_mismatch' then raise; end if;
  end;
  insert into public.roster_import_batches(id,data) values(batch || '_invalid',
    jsonb_build_object('actorType','grantor','actorId',g,'status','ready'));
  insert into public.roster_import_rows(id,parent_id,data) values(batch || '_invalid_row',batch || '_invalid',
    row_data || jsonb_build_object('rosterData',jsonb_build_object('course','BIT')));
  begin
    perform public.commit_roster_import_batch(batch || '_invalid','grantor',g);
    raise exception 'Missing year was accepted';
  exception when others then
    if sqlerrm <> 'roster_course_and_year_required' then raise; end if;
  end;
end;
$$;
reset role;
select 'Passed: optional numbers, four distinct rows, no account awards, idempotency, duplicate reimport, ownership, required course/year' as verification;
