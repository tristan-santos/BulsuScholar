-- Non-public scholarship definitions for office-managed, non-login grantors.
create table public.roster_programs (
  id text primary key,
  parent_id text not null references public.providers(id),
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create unique index roster_programs_title_idx on public.roster_programs
  (parent_id, (data->>'titleKey'));
alter table public.roster_programs enable row level security;
revoke all on public.roster_programs from public, anon, authenticated;
grant select, insert, update on public.roster_programs to service_role;
create policy roster_programs_service_only on public.roster_programs
  to service_role using (true) with check (true);

create function public.roster_grantor_name_key(p_name text)
returns text language sql immutable security invoker set search_path = '' as $$
  select trim(regexp_replace(lower(coalesce(p_name, '')), '[^a-z0-9]+', ' ', 'g'));
$$;

create function public.roster_program_recognized(p_grantor_id text, p_program_id text)
returns boolean language sql stable security invoker set search_path = '' as $$
  select exists(select 1 from public.grantor_portal_announcements
    where parent_id = p_grantor_id
      and (id = p_program_id or data->>'programId' = p_program_id or data->>'scholarshipId' = p_program_id)
      and public.roster_record_active(data))
    or exists(select 1 from public.roster_programs rp join public.providers p on p.id = rp.parent_id
      where rp.parent_id = p_grantor_id and rp.id = p_program_id
        and p.data->>'nonLogin' = 'true' and public.roster_record_active(p.data)
        and public.roster_record_active(rp.data));
$$;

-- Retain the complete existing award/commit guards, changing program resolution only.
do $migration$
declare original text; revised text;
begin
  original := replace(pg_get_functiondef('public.assign_authoritative_roster_scholarship(text,text,text)'::regprocedure), E'\r\n', E'\n');
  revised := replace(original, $old$if not exists(select 1 from public.grantor_portal_announcements where parent_id = p_grantor_id
    and (id = target_scholarship_id or data->>'programId' = target_scholarship_id or data->>'scholarshipId' = target_scholarship_id)
    and public.roster_record_active(data))$old$,
    'if not public.roster_program_recognized(p_grantor_id, target_scholarship_id)');
  if original = revised then raise exception 'assignment_program_guard_definition_changed'; end if;
  execute revised;
  original := replace(pg_get_functiondef('public.commit_roster_import_batch(text,text,text)'::regprocedure), E'\r\n', E'\n');
  revised := replace(original, $old$if not exists(select 1 from public.grantor_portal_announcements where parent_id = row_data->>'grantorId'
      and id = row_data->>'scholarshipId' and public.roster_record_active(data))$old$,
    $new$if not public.roster_program_recognized(row_data->>'grantorId', row_data->>'scholarshipId')$new$);
  if original = revised then raise exception 'import_program_guard_definition_changed'; end if;
  execute revised;
end;
$migration$;

alter function public.commit_roster_import_batch(text,text,text) rename to commit_roster_import_batch_before_single_grantor;
revoke all on function public.commit_roster_import_batch_before_single_grantor(text,text,text) from public, anon, authenticated;

create function public.commit_roster_import_batch(p_batch_id text, p_actor_type text, p_actor_id text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare batch jsonb; selection jsonb; grantor_id text; name text; name_key text;
  program jsonb; provider jsonb; result jsonb; now_text text := now()::text;
begin
  -- Same lock as the existing commit: creation, duplicate checks and awards are one transaction.
  perform pg_advisory_xact_lock(734821, 1);
  select data into batch from public.roster_import_batches where id = p_batch_id for update;
  if not found then raise exception 'roster_import_batch_not_found'; end if;
  if batch->>'actorType' is distinct from p_actor_type or batch->>'actorId' is distinct from p_actor_id then
    raise exception 'roster_import_batch_owner_mismatch'; end if;
  if batch->>'status' = 'committed' then
    return public.commit_roster_import_batch_before_single_grantor(p_batch_id, p_actor_type, p_actor_id);
  end if;
  selection := batch->'grantorSelection';
  if selection is not null then
    if p_actor_type <> 'admin' then raise exception 'admin_grantor_selection_required'; end if;
    if batch->>'status' <> 'ready' or exists(select 1 from public.roster_import_rows
      where parent_id = p_batch_id and data->>'blocking' = 'true') then
      raise exception 'roster_import_has_blocking_errors'; end if;
    grantor_id := selection->>'grantorId';
    if nullif(grantor_id, '') is null or not exists(select 1 from public.roster_import_rows where parent_id = p_batch_id)
      or exists(select 1 from public.roster_import_rows where parent_id = p_batch_id
        and data->>'grantorId' is distinct from grantor_id) then raise exception 'roster_single_grantor_required'; end if;
    if selection->>'mode' = 'new' then
      name := trim(regexp_replace(selection->>'name', '\s+', ' ', 'g'));
      name_key := public.roster_grantor_name_key(name);
      if length(name) not between 2 and 160 or nullif(name_key, '') is null
        or grantor_id is distinct from 'roster_grantor_' || md5(name_key) then raise exception 'invalid_grantor_name'; end if;
      if exists(select 1 from (select data from public.providers union all select data from public.grantor_portals) p
        where name_key = any(array[
          public.roster_grantor_name_key(p.data->>'providerName'), public.roster_grantor_name_key(p.data->>'grantorName'),
          public.roster_grantor_name_key(p.data->>'name'), public.roster_grantor_name_key(p.data->>'displayName'),
          public.roster_grantor_name_key(p.data->>'organization'),
          public.roster_grantor_name_key(concat_ws(' ',p.data->>'fname',p.data->>'mname',p.data->>'lname'))])) then
        raise exception 'grantor_name_exists_select_existing'; end if;
      provider := jsonb_build_object('providerName',name,'name',name,'grantorName',name,
        'providerType','private','grantorClassification','private','grantorType','external','nonLogin',true,
        'status','Active','archived',false,'applicationEnabled',false,'createdAt',now_text,
        'createdBy',p_actor_id,'source','admin_roster_import','importBatchId',p_batch_id,
        'locationScope',jsonb_build_object('enabled',false,'locations','[]'::jsonb));
      insert into public.providers(id,data,updated_at) values(grantor_id,provider,now());
      insert into public.roster_import_audit_events(id,data) values('roster_grantor_' || p_batch_id,
        jsonb_build_object('action','non_login_grantor_created','grantorId',grantor_id,'batchId',p_batch_id,
          'actorType',p_actor_type,'actorId',p_actor_id,'createdAt',now_text));
    elsif selection->>'mode' is distinct from 'existing' then raise exception 'invalid_grantor_selection'; end if;
    select data into provider from public.providers where id = grantor_id for update;
    if not found or not public.roster_record_active(provider) or lower(provider->>'status') = 'disabled' then raise exception 'grantor_archived'; end if;
    if jsonb_array_length(coalesce(batch->'pendingPrograms','[]'::jsonb)) > 0 and provider->>'nonLogin' is distinct from 'true' then
      raise exception 'roster_program_creation_not_allowed'; end if;
    for program in select value from jsonb_array_elements(coalesce(batch->'pendingPrograms','[]'::jsonb)) loop
      if nullif(trim(program->>'title'),'') is null or program->>'id' is distinct from
        'roster_program_' || md5(grantor_id || ':' || public.roster_grantor_name_key(program->>'title')) then
        raise exception 'invalid_roster_program'; end if;
      insert into public.roster_programs(id,parent_id,data) values(program->>'id',grantor_id,
        jsonb_build_object('title',program->>'title','titleKey',public.roster_grantor_name_key(program->>'title'),
          'archived',false,'status','Active','createdBy',p_actor_id,'createdAt',now_text,'source','admin_roster_import'))
        on conflict(id) do nothing;
    end loop;
  end if;
  result := public.commit_roster_import_batch_before_single_grantor(p_batch_id,p_actor_type,p_actor_id);
  return result || case when selection is not null then jsonb_build_object('grantorId',grantor_id) else '{}'::jsonb end;
end;
$$;

revoke all on function public.roster_grantor_name_key(text), public.roster_program_recognized(text,text),
  public.commit_roster_import_batch(text,text,text) from public, anon, authenticated;
grant execute on function public.roster_grantor_name_key(text), public.roster_program_recognized(text,text),
  public.commit_roster_import_batch(text,text,text), public.commit_roster_import_batch_before_single_grantor(text,text,text) to service_role;
