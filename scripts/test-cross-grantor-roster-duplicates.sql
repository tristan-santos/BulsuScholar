-- Run inside a transaction after the migration; always ROLLBACK afterwards.
-- Verifies the reported five existing Johnvher / San Martin duplicates without changing them.
set local role service_role;
do $$
declare fixture record; batch text; candidate jsonb; before_count integer; i integer := 0;
begin
  if not public.roster_import_matches(
      '{"fullName":"Santos, Ana M.","course":"B.S.I.T.","yearLevel":"4th Year"}',
      '{"fullName":" santos ana m ","course":"BSIT","yearLevel":"Year 4"}') then
    raise exception 'Normalization failed'; end if;
  if public.roster_import_matches('{"fullName":"Ana","course":"BIT","yearLevel":"4"}',
      '{"fullName":"Ana","course":"BSBA","yearLevel":"4"}')
    or public.roster_import_matches('{"fullName":"Ana","course":"BIT","yearLevel":"4"}',
      '{"fullName":"Ana","course":"BIT","yearLevel":"3"}')
    or public.roster_import_matches('{"fullName":"Ana","course":"BIT"}',
      '{"fullName":"Ana","course":"BIT"}') then raise exception 'Incomplete/different profiles matched'; end if;
  if public.roster_import_matches('{"studentId":"one","fullName":"Ana","course":"BIT","yearLevel":"4"}',
      '{"studentId":"two","fullName":"Ana","course":"BIT","yearLevel":"4"}') then
    raise exception 'Different explicit student numbers matched'; end if;
  select count(*) into before_count from public.grantor_portal_scholars;
  for fixture in
    select j.id, j.parent_id, j.data from public.grantor_portal_scholars j
    where j.parent_id='grantor_johnvher'
      and exists(select 1 from public.grantor_portal_scholars s where s.parent_id='grantor_san'
        and public.roster_record_active(s.data) and public.roster_cycle(s.data) in ('',public.roster_current_cycle())
        and public.roster_import_matches(s.data,j.data))
    order by j.id limit 5
  loop
    i := i + 1;
    -- Test each actual record individually, also with an input number when the source lacks one.
    for n in 1..2 loop
      batch := 'verify_cross_grantor_' || i || '_' || n;
      insert into public.roster_import_batches(id,data) values(batch,
        jsonb_build_object('actorType','grantor','actorId',fixture.parent_id,'status','ready'));
      candidate := fixture.data || jsonb_build_object('studentId',case when n=1 then '' else 'verify-number-' || i end,
        'blocking',false,'rosterData',fixture.data);
      insert into public.roster_import_rows(id,parent_id,data) values(batch || '_row',batch,candidate);
      begin
        perform public.commit_roster_import_batch(batch,'grantor',fixture.parent_id);
        raise exception 'Cross-grantor duplicate was accepted: %',i;
      exception when others then
        if sqlerrm <> 'scholarship_already_committed' then raise; end if;
      end;
    end loop;
  end loop;
  if i <> 5 then raise exception 'Expected five live duplicate cases, found %',i; end if;
  -- A fresh row saved earlier in a stale batch must also roll back when a later row conflicts.
  batch := 'verify_cross_grantor_atomic';
  insert into public.roster_import_batches(id,data) values(batch,
    jsonb_build_object('actorType','grantor','actorId','grantor_johnvher','status','ready'));
  insert into public.roster_import_rows(id,parent_id,data) values(batch || '_a',batch,
    candidate || jsonb_build_object('studentId','','fullName','Synthetic atomic rollback verification',
      'rosterData',jsonb_build_object('fullName','Synthetic atomic rollback verification','course','BIT','yearLevel','4')));
  insert into public.roster_import_rows(id,parent_id,data) values(batch || '_z',batch,candidate);
  begin
    perform public.commit_roster_import_batch(batch,'grantor','grantor_johnvher');
    raise exception 'Mixed batch accepted a duplicate';
  exception when others then
    if sqlerrm <> 'scholarship_already_committed' then raise; end if;
  end;
  if (select count(*) from public.grantor_portal_scholars) <> before_count then
    raise exception 'Failed imports changed scholar records'; end if;
end;
$$;
reset role;
select 'Passed: all five live Johnvher/San Martin rows blocked without IDs and with mixed ID presence; normalization; distinct profiles; stale mixed-batch rollback; no scholar changes' as verification;
