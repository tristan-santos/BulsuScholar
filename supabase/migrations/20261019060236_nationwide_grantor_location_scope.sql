create or replace function public.save_grantor_scope_policy_v3(
  p_grantor_id text, p_classification text, p_name text, p_enabled boolean,
  p_locations jsonb, p_actor_id text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  current_version integer;
  next_version integer;
  policy jsonb;
  normalized_locations jsonb;
  location_count integer;
  distinct_count integer;
  now_text text := now()::text;
begin
  if p_classification not in ('government', 'private', 'other') then
    raise exception 'invalid_grantor_classification';
  end if;
  if jsonb_typeof(coalesce(p_locations, '[]'::jsonb)) <> 'array' then
    raise exception 'invalid_scope_locations';
  end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_locations, '[]'::jsonb)) item
    where jsonb_typeof(item) <> 'object'
      or nullif(trim(item->>'province'), '') is null
      or nullif(trim(item->>'municipality'), '') is null
      or length(trim(item->>'province')) > 100
      or length(trim(item->>'municipality')) > 120
  ) then
    raise exception 'invalid_scope_location';
  end if;

  select count(*), count(distinct public.normalize_scope_location(item->>'province') || ':' || public.normalize_scope_location(item->>'municipality'))
    into location_count, distinct_count
    from jsonb_array_elements(coalesce(p_locations, '[]'::jsonb)) item;
  if location_count <> distinct_count then
    raise exception 'duplicate_scope_location';
  end if;
  if p_enabled and location_count = 0 then
    raise exception 'scope_locations_required';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'province', trim(item->>'province'),
    'municipality', trim(item->>'municipality')
  ) order by trim(item->>'province'), trim(item->>'municipality')), '[]'::jsonb)
    into normalized_locations
    from jsonb_array_elements(coalesce(p_locations, '[]'::jsonb)) item;

  perform pg_advisory_xact_lock(hashtext('grantor-scope:' || p_grantor_id));
  if not exists(select 1 from public.providers where id = p_grantor_id)
    and not exists(select 1 from public.grantor_portals where id = p_grantor_id) then
    raise exception 'grantor_not_found';
  end if;
  select coalesce((data->>'version')::integer, 0) into current_version
    from public.grantor_scope_policies where id = p_grantor_id for update;
  next_version := coalesce(current_version, 0) + 1;
  policy := jsonb_build_object(
    'grantorId', p_grantor_id,
    'name', left(trim(coalesce(p_name, '')), 120),
    'enabled', p_enabled,
    'locations', normalized_locations,
    'version', next_version,
    'addressSource', 'self_declared_permanent_address',
    'updatedBy', p_actor_id,
    'updatedAt', now_text
  );
  insert into public.grantor_scope_policies(id, data, updated_at)
    values(p_grantor_id, policy, now())
    on conflict(id) do update set data = excluded.data, updated_at = now();
  insert into public.grantor_scope_policy_versions(id, grantor_id, version, data)
    values('scope_' || md5(p_grantor_id || ':' || next_version::text), p_grantor_id, next_version, policy);
  update public.providers set data = data || jsonb_build_object(
    'grantorClassification', p_classification, 'locationScopeVersion', next_version, 'updatedAt', now_text),
    updated_at = now() where id = p_grantor_id;
  update public.grantor_portals set data = data || jsonb_build_object(
    'grantorClassification', p_classification, 'locationScopeVersion', next_version, 'updatedAt', now_text),
    updated_at = now() where id = p_grantor_id;
  return jsonb_build_object('grantorId', p_grantor_id, 'classification', p_classification, 'policy', policy);
end;
$$;

revoke all on function public.save_grantor_scope_policy_v3(text, text, text, boolean, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.save_grantor_scope_policy_v3(text, text, text, boolean, jsonb, text)
  to service_role;
