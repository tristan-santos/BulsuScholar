create or replace function public.normalize_scope_location(p_value text)
returns text language sql immutable set search_path = '' as $$
  with cleaned as (
    select trim(regexp_replace(
      regexp_replace(
        translate(lower(coalesce(p_value, '')), 'áéíóúñü', 'aeiounu'),
        '\m(city|municipality)\s+of\M', ' ', 'g'
      ),
      '\mcity\M|[^a-z0-9]+', ' ', 'g'
    )) as value
  )
  select case when value = 'baliuag' then 'baliwag' else value end from cleaned;
$$;

create or replace function public.save_grantor_scope_policy_v2(
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
  region3_catalog jsonb := $catalog${
    "Aurora": ["Baler", "Casiguran", "Dilasag", "Dinalungan", "Dingalan", "Dipaculao", "Maria Aurora", "San Luis"],
    "Bataan": ["Balanga City", "Abucay", "Bagac", "Dinalupihan", "Hermosa", "Limay", "Mariveles", "Morong", "Orani", "Orion", "Pilar", "Samal"],
    "Bulacan": ["Malolos City", "Meycauayan City", "San Jose del Monte City", "Angat", "Balagtas", "Baliuag", "Bocaue", "Bulakan", "Bustos", "Calumpit", "Doña Remedios Trinidad", "Guiguinto", "Hagonoy", "Marilao", "Norzagaray", "Obando", "Pandi", "Paombong", "Plaridel", "Pulilan", "San Ildefonso", "San Miguel", "San Rafael", "Santa Maria"],
    "Nueva Ecija": ["Cabanatuan City", "Gapan City", "Muñoz City", "Palayan City", "San Jose City", "Aliaga", "Bongabon", "Cabiao", "Carranglan", "Cuyapo", "Gabaldon", "General Mamerto Natividad", "General Tinio", "Guimba", "Jaen", "Laur", "Licab", "Llanera", "Lupao", "Nampicuan", "Pantabangan", "Peñaranda", "Quezon", "Rizal", "San Antonio", "San Isidro", "San Leonardo", "Santa Rosa", "Santo Domingo", "Talavera", "Talugtug", "Zaragoza"],
    "Pampanga": ["Angeles City", "San Fernando City", "Mabalacat City", "Apalit", "Arayat", "Bacolor", "Candaba", "Floridablanca", "Guagua", "Lubao", "Macabebe", "Magalang", "Masantol", "Mexico", "Minalin", "Porac", "San Luis", "San Simon", "Santa Ana", "Santa Rita", "Santo Tomas", "Sasmuan"],
    "Tarlac": ["Tarlac City", "Anao", "Bamban", "Camiling", "Capas", "Concepcion", "Gerona", "La Paz", "Mayantoc", "Moncada", "Paniqui", "Pura", "Ramos", "San Clemente", "San Jose", "San Manuel", "Santa Ignacia", "Victoria"],
    "Zambales": ["Olongapo City", "Botolan", "Cabangan", "Candelaria", "Castillejos", "Iba", "Masinloc", "Palauig", "San Antonio", "San Felipe", "San Marcelino", "San Narciso", "Santa Cruz", "Subic"]
  }$catalog$::jsonb;
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
      or public.normalize_scope_location(item->>'province') not in
        ('aurora', 'bataan', 'bulacan', 'nueva ecija', 'pampanga', 'tarlac', 'zambales')
      or not (region3_catalog ? trim(item->>'province'))
      or not ((region3_catalog->trim(item->>'province')) ? trim(item->>'municipality'))
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

update public.grantor_scope_policies
set data = data || jsonb_build_object('locations', '[]'::jsonb), updated_at = now()
where not (data ? 'locations')
  and jsonb_typeof(coalesce(data->'municipalities', '[]'::jsonb)) = 'array'
  and jsonb_array_length(coalesce(data->'municipalities', '[]'::jsonb)) = 0;

create or replace function public.grantor_scope_snapshot(p_grantor_id text, p_student_data jsonb)
returns jsonb language plpgsql stable set search_path = '' as $$
declare
  policy jsonb;
  province text;
  municipality text;
  normalized_province text;
  normalized_municipality text;
  allowed_locations jsonb;
  legacy_municipalities jsonb;
  matched_location jsonb;
  is_eligible boolean;
begin
  select data into policy from public.grantor_scope_policies where id = p_grantor_id;
  province := coalesce(
    p_student_data#>>'{permanentAddress,province}',
    p_student_data#>>'{address,permanentProvince}',
    p_student_data->>'permanentProvince',
    p_student_data->>'province',
    ''
  );
  municipality := coalesce(
    p_student_data#>>'{permanentAddress,city}',
    p_student_data#>>'{address,permanentMunicipality}',
    p_student_data->>'permanentMunicipality',
    p_student_data->>'municipality',
    p_student_data->>'city',
    ''
  );
  normalized_province := public.normalize_scope_location(province);
  normalized_municipality := public.normalize_scope_location(municipality);
  allowed_locations := case when jsonb_typeof(policy->'locations') = 'array' then policy->'locations' else '[]'::jsonb end;
  legacy_municipalities := case when not (coalesce(policy, '{}'::jsonb) ? 'locations')
    and jsonb_typeof(policy->'municipalities') = 'array' then policy->'municipalities' else '[]'::jsonb end;

  select item into matched_location
    from jsonb_array_elements(allowed_locations) item
    where public.normalize_scope_location(item->>'province') = normalized_province
      and public.normalize_scope_location(item->>'municipality') = normalized_municipality
    limit 1;

  is_eligible := case
    when not coalesce((policy->>'enabled')::boolean, false) then true
    when normalized_province = '' or normalized_municipality = '' then false
    when matched_location is not null then true
    when jsonb_array_length(legacy_municipalities) > 0 then exists (
      select 1 from jsonb_array_elements_text(legacy_municipalities) item
      where public.normalize_scope_location(item) = normalized_municipality
    )
    else false
  end;

  return jsonb_build_object(
    'policyId', p_grantor_id,
    'version', coalesce((policy->>'version')::integer, 0),
    'name', coalesce(policy->>'name', ''),
    'enabled', coalesce((policy->>'enabled')::boolean, false),
    'addressSource', 'self_declared_permanent_address',
    'province', province,
    'municipality', municipality,
    'normalizedProvince', normalized_province,
    'normalizedMunicipality', normalized_municipality,
    'matchedLocation', matched_location,
    'eligible', is_eligible
  );
end;
$$;

create or replace function public.waitlist_dynamic_eligibility_reason(p_entry_id text)
returns text language plpgsql stable security definer set search_path = '' as $$
declare entry_row record; student_data jsonb; announcement_data jsonb; minimum_grade numeric; student_grade numeric; scope jsonb;
begin
  select * into entry_row from public.scholarship_waitlist_entries where id = p_entry_id;
  if not found then return 'waitlist_entry_not_found'; end if;
  select data into student_data from public.students where id = entry_row.student_id;
  if student_data is null then return 'student_not_found'; end if;
  if student_data->>'archived' = 'true' or student_data->>'disabled' = 'true'
    or student_data->>'adminBlocked' = 'true'
    or lower(coalesce(student_data->>'status', '')) in ('archived', 'inactive', 'disabled', 'blocked') then
    return 'student_account_blocked';
  end if;
  scope := public.grantor_scope_snapshot(entry_row.grantor_id, student_data);
  if not coalesce((scope->>'eligible')::boolean, false) then return 'location_out_of_scope'; end if;
  if nullif(student_data#>>'{scholarshipCommitment,applicationId}', '') is not null then
    return 'scholarship_already_committed';
  end if;
  if lower(coalesce(student_data#>>'{rosterAssignmentState,status}', '')) = 'conflict' then
    return 'roster_assignment_conflict';
  end if;
  if exists(select 1 from public.scholarship_applications application
    where application.data->>'studentId' = entry_row.student_id
      and coalesce(application.data->>'grantorId', application.data->>'providerId') = entry_row.grantor_id
      and public.scholarship_application_open(application.data)) then
    return 'grantor_application_exists';
  end if;
  if exists(select 1 from public.scholarship_applications application
    where application.data->>'studentId' = entry_row.student_id
      and coalesce(application.data->>'grantorId', application.data->>'providerId') = entry_row.grantor_id
      and (nullif(application.data->>'cooldownUntil', '')::timestamptz > now()
        or (lower(coalesce(application.data->>'status', '')) in ('rejected', 'denied', 'declined')
          and coalesce(nullif(application.data->>'rejectedAt', '')::timestamptz, application.updated_at)
            + interval '24 hours' > now()))) then
    return 'reapply_cooldown_active';
  end if;
  if not exists(select 1 from public.grantor_portals where id = entry_row.grantor_id)
    or exists(select 1 from (select data from public.grantor_portals where id = entry_row.grantor_id
      union all select data from public.providers where id = entry_row.grantor_id) grantor
      where grantor.data->>'archived' = 'true' or grantor.data->>'disabled' = 'true'
        or grantor.data->>'applicationsBlocked' = 'true'
        or lower(coalesce(grantor.data->>'status', '')) in ('archived', 'inactive', 'disabled')) then
    return 'grantor_archived';
  end if;
  select data into announcement_data from public.grantor_portal_announcements
    where id = entry_row.announcement_id and parent_id = entry_row.grantor_id;
  if announcement_data is null or coalesce(announcement_data->>'applicationEnabled', 'false') <> 'true'
    or announcement_data->>'archived' = 'true' or announcement_data->>'hiddenFromStudents' = 'true'
    or lower(coalesce(announcement_data->>'status', '')) in ('archived', 'closed', 'ended')
    or nullif(announcement_data->>'endDate', '')::timestamptz < now()
    or nullif(announcement_data->>'startDate', '')::timestamptz > now() then
    return 'announcement_not_open_for_applications';
  end if;
  minimum_grade := coalesce(nullif(announcement_data->>'minimumGrade', '')::numeric,
    nullif(announcement_data->>'minimumGwa', '')::numeric,
    nullif(announcement_data->>'minGwa', '')::numeric, 2.25);
  student_grade := coalesce(nullif(student_data->>'gwa', '')::numeric,
    nullif(student_data->>'currentGwa', '')::numeric);
  if student_grade is null or student_grade > minimum_grade or student_grade < 1 then
    return 'grade_not_eligible';
  end if;
  return null;
end;
$$;

create or replace function public.resolve_waitlist_offer(p_student_id text, p_offer_id text, p_action text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare offer_row record; entry_row record; announcement_data jsonb; student_data jsonb; application_data jsonb;
  current_scope jsonb; v_application_id text; application_number text; eligibility_reason text;
  now_text text := now()::text; promoted jsonb;
begin
  if p_action not in ('accept', 'decline') then raise exception 'invalid_waitlist_action'; end if;
  select * into offer_row from public.scholarship_waitlist_offers where id = p_offer_id for update;
  if not found or offer_row.student_id <> p_student_id then raise exception 'waitlist_offer_not_found'; end if;
  if offer_row.status <> 'active' then
    return jsonb_build_object('idempotent', true, 'status', offer_row.status);
  end if;
  if offer_row.expires_at <= now() then raise exception 'waitlist_offer_expired'; end if;
  select * into entry_row from public.scholarship_waitlist_entries where id = offer_row.entry_id for update;
  select data into student_data from public.students where id = p_student_id for update;
  select data into announcement_data from public.grantor_portal_announcements where id = offer_row.announcement_id for update;
  if p_action = 'decline' then
    update public.scholarship_waitlist_offers set status = 'declined', resolved_at = now(), updated_at = now() where id = p_offer_id;
    update public.scholarship_waitlist_entries set status = 'declined', updated_at = now() where id = entry_row.id;
    update public.grantor_portal_announcements set data = data || jsonb_build_object(
      'remainingSlots', greatest(coalesce((data->>'remainingSlots')::integer, 0), 0) + 1, 'updatedAt', now_text), updated_at = now()
      where id = offer_row.announcement_id;
    promoted := public.promote_waitlist_for_announcement(offer_row.announcement_id);
    return jsonb_build_object('status', 'declined', 'promotion', promoted);
  end if;
  eligibility_reason := public.waitlist_dynamic_eligibility_reason(entry_row.id);
  if eligibility_reason is not null then
    update public.scholarship_waitlist_offers set status = 'closed', resolved_at = now(), updated_at = now() where id = p_offer_id;
    update public.scholarship_waitlist_entries set status = 'closed', updated_at = now() where id = entry_row.id;
    update public.grantor_portal_announcements set data = data || jsonb_build_object(
      'remainingSlots', greatest(coalesce((data->>'remainingSlots')::integer, 0), 0) + 1, 'updatedAt', now_text), updated_at = now()
      where id = offer_row.announcement_id;
    insert into public.scholarship_waitlist_audit_events(id, entry_id, data) values(
      'waitlist_acceptance_closed_' || p_offer_id, entry_row.id,
      jsonb_build_object('action', 'acceptance_closed_ineligible', 'reason', eligibility_reason,
        'offerId', p_offer_id, 'createdAt', now_text));
    promoted := public.promote_waitlist_for_announcement(offer_row.announcement_id);
    return jsonb_build_object('status', 'closed', 'reason', eligibility_reason, 'promotion', promoted);
  end if;
  current_scope := public.grantor_scope_snapshot(entry_row.grantor_id, student_data);
  if not coalesce((current_scope->>'eligible')::boolean, false) then raise exception 'location_out_of_scope'; end if;
  v_application_id := coalesce(entry_row.application_snapshot->>'applicationId', 'application_' || md5(entry_row.id));
  application_number := coalesce(entry_row.application_snapshot->>'applicationNumber', p_student_id || '-' || substr(md5(entry_row.id), 1, 8));
  application_data := entry_row.application_snapshot || announcement_data || jsonb_build_object(
    'id', v_application_id, 'applicationId', v_application_id, 'applicationNumber', application_number,
    'studentId', p_student_id, 'announcementId', offer_row.announcement_id, 'grantorId', entry_row.grantor_id,
    'status', 'Applied', 'slotReserved', true, 'waitlistEntryId', entry_row.id,
    'waitlistOfferId', p_offer_id, 'scopeSnapshot', current_scope,
    'applicationDate', now_text, 'createdAt', now_text, 'updatedAt', now_text
  );
  insert into public.scholarship_applications(id, data, updated_at) values(v_application_id, application_data, now())
    on conflict(id) do update set data = excluded.data, updated_at = now();
  update public.students set data = data || jsonb_build_object(
    'scholarships', coalesce(data->'scholarships', '[]'::jsonb) || jsonb_build_array(application_data), 'updatedAt', now_text
  ), updated_at = now() where id = p_student_id;
  update public.scholarship_waitlist_offers set status = 'accepted', resolved_at = now(), updated_at = now() where id = p_offer_id;
  update public.scholarship_waitlist_entries set status = 'accepted', application_id = v_application_id,
    scope_snapshot = current_scope, updated_at = now() where id = entry_row.id;
  insert into public.scholarship_waitlist_audit_events(id, entry_id, data) values(
    'waitlist_accepted_' || p_offer_id, entry_row.id,
    jsonb_build_object('action', 'accepted', 'applicationId', v_application_id,
      'scopeVersion', current_scope->>'version', 'createdAt', now_text));
  return jsonb_build_object('status', 'accepted', 'applicationId', v_application_id, 'application', application_data);
end;
$$;

revoke all on function public.save_grantor_scope_policy_v2(text, text, text, boolean, jsonb, text) from public, anon, authenticated;
revoke all on function public.normalize_scope_location(text) from public, anon, authenticated;
revoke all on function public.grantor_scope_snapshot(text, jsonb) from public, anon, authenticated;
revoke all on function public.waitlist_dynamic_eligibility_reason(text) from public, anon, authenticated;
revoke all on function public.resolve_waitlist_offer(text, text, text) from public, anon, authenticated;

grant execute on function public.save_grantor_scope_policy_v2(text, text, text, boolean, jsonb, text) to service_role;
grant execute on function public.normalize_scope_location(text) to service_role;
grant execute on function public.grantor_scope_snapshot(text, jsonb) to service_role;
grant execute on function public.waitlist_dynamic_eligibility_reason(text) to service_role;
grant execute on function public.resolve_waitlist_offer(text, text, text) to service_role;
