-- Exact fallback matching for imports that lack a student number on either side.
-- Different explicit student numbers remain distinct even if profiles coincide.
create or replace function public.roster_import_profile_key(p_data jsonb)
returns text language sql immutable security invoker set search_path = '' as $$
  with fields as (
    select trim(regexp_replace(lower(coalesce(nullif(trim(p_data->>'fullName'), ''),
        concat_ws(' ', nullif(trim(p_data->>'fname'), ''), nullif(trim(p_data->>'mname'), ''), nullif(trim(p_data->>'lname'), '')))), '[^a-z0-9]+', ' ', 'g')) as name,
      regexp_replace(lower(coalesce(p_data->>'course', '')), '[^a-z0-9]+', '', 'g') as course,
      trim(regexp_replace(lower(coalesce(nullif(p_data->>'yearLevel',''), nullif(p_data->>'year',''), p_data->>'yearLevelLabel', '')), '[^a-z0-9]+', ' ', 'g')) as year
  ), normalized as (
    select name, course, case when year ~ '^(year )?([1-6])(st|nd|rd|th)?( year)?$'
      then substring(year from '[1-6]') else year end as year from fields
  )
  select case when name <> '' and course <> '' and year <> '' then name || '|' || course || '|' || year else null end from normalized;
$$;
create or replace function public.roster_import_matches(p_left jsonb, p_right jsonb)
returns boolean language sql immutable security invoker set search_path = '' as $$
  with ids as (
    select coalesce(nullif(trim(p_left->>'studentId'), ''), nullif(trim(p_left->>'studentnumber'), ''), nullif(trim(p_left->>'studentNumber'), '')) as left_id,
      coalesce(nullif(trim(p_right->>'studentId'), ''), nullif(trim(p_right->>'studentnumber'), ''), nullif(trim(p_right->>'studentNumber'), '')) as right_id
  )
  select case when left_id is not null and right_id is not null then left_id = right_id
    else coalesce(public.roster_import_profile_key(p_left) = public.roster_import_profile_key(p_right), false) end from ids;
$$;
revoke all on function public.roster_import_profile_key(jsonb) from public, anon, authenticated;
revoke all on function public.roster_import_matches(jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.roster_import_profile_key(jsonb), public.roster_import_matches(jsonb,jsonb) to service_role;

create or replace function public.commit_roster_import_batch(p_batch_id text, p_actor_type text, p_actor_id text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare batch_data jsonb; import_row record; row_data jsonb; roster_data jsonb; roster_id text;
  assignment jsonb; cycle text; previous_choice text; identity_key text;
  counts jsonb := '{"created":0,"assigned":0,"converted":0,"waitingForAccount":0,"alreadyImported":0,"unlinked":0}';
begin
  perform pg_advisory_xact_lock(734821, 1);
  cycle := public.roster_current_cycle();
  select data into batch_data from public.roster_import_batches where id = p_batch_id for update;
  if not found then raise exception 'roster_import_batch_not_found'; end if;
  if batch_data->>'actorType' is distinct from p_actor_type or batch_data->>'actorId' is distinct from p_actor_id then
    raise exception 'roster_import_batch_owner_mismatch'; end if;
  if batch_data->>'status' = 'committed' then return jsonb_build_object('idempotent', true, 'batchId', p_batch_id, 'counts', batch_data->'commitCounts'); end if;
  if batch_data->>'status' <> 'ready' or exists(select 1 from public.roster_import_rows where parent_id = p_batch_id and data->>'blocking' = 'true') then
    raise exception 'roster_import_has_blocking_errors'; end if;
  previous_choice := coalesce(current_setting('bulsuscholar.choice_write', true), '');
  perform set_config('bulsuscholar.choice_write', 'true', true);
  for import_row in select id, data from public.roster_import_rows where parent_id = p_batch_id order by id for update
  loop
    row_data := import_row.data;
    if public.roster_cycle(row_data) <> cycle then raise exception 'academic_cycle_changed'; end if;
    if p_actor_type = 'grantor' and row_data->>'grantorId' is distinct from p_actor_id then raise exception 'roster_import_batch_owner_mismatch'; end if;
    if nullif(trim(row_data->>'fullName'), '') is null then raise exception 'invalid_roster_identity'; end if;
    if nullif(trim(row_data->>'studentId'), '') is null and
      (nullif(trim(row_data#>>'{rosterData,course}'), '') is null or nullif(trim(row_data#>>'{rosterData,yearLevel}'), '') is null) then
      raise exception 'roster_course_and_year_required'; end if;
    identity_key := public.roster_import_identity(coalesce(row_data->'rosterData', '{}') || row_data);
    if not exists(select 1 from public.providers where id = row_data->>'grantorId' and public.roster_record_active(data)) then raise exception 'grantor_archived'; end if;
    if not exists(select 1 from public.grantor_portal_announcements where parent_id = row_data->>'grantorId'
      and id = row_data->>'scholarshipId' and public.roster_record_active(data)) then raise exception 'roster_scholarship_not_recognized'; end if;
    -- Recheck against every active roster under the same transaction lock.
    -- This deliberately runs before same-list deduplication: a row already present
    -- here must not hide a conflicting award that also exists under another grantor.
    if exists(select 1 from public.grantor_portal_scholars r
      where public.roster_import_matches(r.data, coalesce(row_data->'rosterData', '{}') || row_data)
      and public.roster_record_active(r.data) and public.roster_cycle(r.data) in ('', cycle)
      and (r.parent_id = row_data->>'grantorId' and r.data->>'scholarshipId' = row_data->>'scholarshipId'
        and public.roster_cycle(r.data) = cycle) is not true) then
      raise exception 'scholarship_already_committed';
    end if;
    select id into roster_id from public.grantor_portal_scholars where parent_id = row_data->>'grantorId'
      and public.roster_import_matches(data, coalesce(row_data->'rosterData', '{}') || row_data)
      and data->>'scholarshipId' = row_data->>'scholarshipId' and public.roster_cycle(data) = cycle and public.roster_record_active(data)
      order by id limit 1 for update;
    if roster_id is not null then
      counts := jsonb_set(counts, '{alreadyImported}', to_jsonb((counts->>'alreadyImported')::integer + 1));
    else
      roster_id := 'roster_' || md5((row_data->>'grantorId') || ':' || (row_data->>'scholarshipId') || ':' || identity_key || ':' || cycle);
      roster_data := coalesce(row_data->'rosterData', '{}') || jsonb_build_object(
        'studentId', row_data->>'studentId', 'fullName', row_data->>'fullName', 'grantorId', row_data->>'grantorId',
        'scholarshipId', row_data->>'scholarshipId', 'announcementId', row_data->>'scholarshipId',
        'scholarshipTitle', row_data->>'scholarshipTitle', 'scholarshipName', row_data->>'scholarshipTitle',
        'providerType', row_data->>'providerType', 'academicCycle', cycle, 'semesterTag', cycle,
        'source', 'authoritative_roster', 'accountLinkStatus', case when nullif(trim(row_data->>'studentId'), '') is null then 'unlinked' else 'identified' end, 'importBatchId', p_batch_id, 'importRowId', import_row.id,
        'status', 'Active', 'archived', false, 'createdAt', now()::text);
      -- An archived deterministic ID is history, not a row to overwrite.
      if exists(select 1 from public.grantor_portal_scholars where id = roster_id) then
        roster_id := roster_id || '_' || md5(p_batch_id);
      end if;
      insert into public.grantor_portal_scholars(id, parent_id, data, updated_at) values(roster_id, row_data->>'grantorId', roster_data, now());
      counts := jsonb_set(counts, '{created}', to_jsonb((counts->>'created')::integer + 1));
    end if;
    assignment := '{}';
    if nullif(trim(row_data->>'studentId'), '') is null then
      counts := jsonb_set(counts, '{unlinked}', to_jsonb((counts->>'unlinked')::integer + 1));
    elsif exists(select 1 from public.students where id = row_data->>'studentId') then
      assignment := public.assign_authoritative_roster_scholarship(row_data->>'studentId', row_data->>'grantorId', roster_id);
      counts := jsonb_set(counts, '{assigned}', to_jsonb((counts->>'assigned')::integer + 1));
      if assignment->>'convertedExistingApplication' = 'true' then
        counts := jsonb_set(counts, '{converted}', to_jsonb((counts->>'converted')::integer + 1)); end if;
    else counts := jsonb_set(counts, '{waitingForAccount}', to_jsonb((counts->>'waitingForAccount')::integer + 1)); end if;
    update public.roster_import_rows set data = data || jsonb_build_object('commitStatus', 'committed', 'rosterId', roster_id,
      'assignment', assignment, 'committedAt', now()::text), updated_at = now() where id = import_row.id;
    insert into public.roster_import_audit_events(id, data) values('roster_import_' || md5(p_batch_id || ':' || import_row.id),
      jsonb_build_object('action', 'roster_row_committed', 'batchId', p_batch_id, 'studentId', row_data->>'studentId',
        'grantorId', row_data->>'grantorId', 'academicCycle', cycle, 'actorType', p_actor_type, 'actorId', p_actor_id, 'createdAt', now()::text)) on conflict(id) do nothing;
  end loop;
  update public.roster_import_batches set data = data || jsonb_build_object('status', 'committed', 'commitCounts', counts, 'committedAt', now()::text), updated_at = now() where id = p_batch_id;
  perform set_config('bulsuscholar.choice_write', previous_choice, true);
  return jsonb_build_object('idempotent', false, 'batchId', p_batch_id, 'counts', counts);
end;
$$;
