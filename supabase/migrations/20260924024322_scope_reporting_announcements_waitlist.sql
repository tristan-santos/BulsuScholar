begin;

create table if not exists public.grantor_scope_policies (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.grantor_scope_policy_versions (
  id text primary key,
  grantor_id text not null,
  version integer not null check (version > 0),
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(grantor_id, version)
);

create table if not exists public.portal_report_audit_events (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.student_number_change_events (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.announcement_audience_previews (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create table if not exists public.announcement_recipient_snapshots (
  id text primary key,
  parent_id text not null references public.announcement_audience_previews(id) on delete cascade,
  student_id text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(parent_id, student_id)
);

create table if not exists public.notification_delivery_events (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.scholarship_waitlist_entries (
  id text primary key,
  student_id text not null,
  announcement_id text not null,
  grantor_id text not null,
  status text not null check (status in ('queued', 'offered', 'accepted', 'declined', 'expired', 'closed')),
  queued_at timestamptz not null default now(),
  offered_at timestamptz,
  expires_at timestamptz,
  application_id text,
  scope_snapshot jsonb not null default '{}'::jsonb,
  application_snapshot jsonb not null default '{}'::jsonb,
  attempt_number integer not null default 1 check (attempt_number > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.scholarship_waitlist_offers (
  id text primary key,
  entry_id text not null references public.scholarship_waitlist_entries(id),
  student_id text not null,
  announcement_id text not null,
  status text not null check (status in ('active', 'accepted', 'declined', 'expired', 'closed')),
  offered_at timestamptz not null default now(),
  expires_at timestamptz not null,
  resolved_at timestamptz,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.scholarship_waitlist_audit_events (
  id text primary key,
  entry_id text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists scholarship_waitlist_one_active_entry_idx
  on public.scholarship_waitlist_entries(student_id, announcement_id)
  where status in ('queued', 'offered');
create unique index if not exists scholarship_waitlist_one_active_offer_idx
  on public.scholarship_waitlist_offers(entry_id) where status = 'active';
create index if not exists scholarship_waitlist_fifo_idx
  on public.scholarship_waitlist_entries(announcement_id, queued_at, id) where status = 'queued';
create index if not exists scholarship_waitlist_offer_expiry_idx
  on public.scholarship_waitlist_offers(expires_at, id) where status = 'active';
create index if not exists announcement_recipient_student_idx
  on public.announcement_recipient_snapshots(student_id, created_at desc);
create index if not exists portal_report_audit_actor_idx
  on public.portal_report_audit_events((data->>'actorType'), (data->>'actorId'), created_at desc);
create index if not exists grantor_scope_policy_versions_grantor_idx
  on public.grantor_scope_policy_versions(grantor_id, version desc);

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'grantor_scope_policies', 'grantor_scope_policy_versions', 'portal_report_audit_events', 'student_number_change_events',
    'announcement_audience_previews', 'announcement_recipient_snapshots',
    'notification_delivery_events', 'scholarship_waitlist_entries',
    'scholarship_waitlist_offers', 'scholarship_waitlist_audit_events'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from public, anon, authenticated', table_name);
    execute format('grant select, insert, update, delete on table public.%I to service_role', table_name);
  end loop;
end $$;

create or replace function public.protect_portal_immutable_event()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'immutable_audit_event';
end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'grantor_scope_policy_versions', 'portal_report_audit_events', 'notification_delivery_events',
    'scholarship_waitlist_audit_events'
  ] loop
    execute format('drop trigger if exists protect_immutable_event on public.%I', table_name);
    execute format('create trigger protect_immutable_event before update or delete on public.%I for each row execute function public.protect_portal_immutable_event()', table_name);
  end loop;
end $$;

create or replace function public.normalize_scope_location(p_value text)
returns text language sql immutable set search_path = '' as $$
  select trim(regexp_replace(lower(coalesce(p_value, '')), '[^a-z0-9]+', ' ', 'g'));
$$;

create or replace function public.save_grantor_scope_policy(
  p_grantor_id text, p_classification text, p_name text, p_enabled boolean,
  p_municipalities jsonb, p_actor_id text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare current_version integer; next_version integer; policy jsonb; now_text text := now()::text;
begin
  if p_classification not in ('government', 'private', 'other') then
    raise exception 'invalid_grantor_classification';
  end if;
  if jsonb_typeof(coalesce(p_municipalities, '[]'::jsonb)) <> 'array' then
    raise exception 'invalid_scope_municipalities';
  end if;
  if p_enabled and jsonb_array_length(coalesce(p_municipalities, '[]'::jsonb)) = 0 then
    raise exception 'scope_municipalities_required';
  end if;
  perform pg_advisory_xact_lock(hashtext('grantor-scope:' || p_grantor_id));
  if not exists(select 1 from public.providers where id = p_grantor_id)
    and not exists(select 1 from public.grantor_portals where id = p_grantor_id) then
    raise exception 'grantor_not_found';
  end if;
  select coalesce((data->>'version')::integer, 0) into current_version
    from public.grantor_scope_policies where id = p_grantor_id for update;
  next_version := coalesce(current_version, 0) + 1;
  policy := jsonb_build_object('grantorId', p_grantor_id, 'name', left(trim(coalesce(p_name, '')), 120),
    'enabled', p_enabled, 'municipalities', coalesce(p_municipalities, '[]'::jsonb),
    'version', next_version, 'addressSource', 'self_declared_permanent_address',
    'updatedBy', p_actor_id, 'updatedAt', now_text);
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

create or replace function public.publish_announcement_preview(
  p_preview_id text, p_actor_type text, p_actor_id text, p_announcement_id text,
  p_title text, p_message text, p_route text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare preview_row record; recipient_row record; digest text; notification_id text;
  inserted_count integer := 0; affected integer; now_text text := now()::text;
begin
  select * into preview_row from public.announcement_audience_previews
    where id = p_preview_id for update;
  if not found then raise exception 'audience_preview_not_found'; end if;
  if preview_row.data->>'actorType' <> p_actor_type or preview_row.data->>'actorId' <> p_actor_id then
    raise exception 'audience_preview_owner_mismatch';
  end if;
  if preview_row.data->>'status' = 'published' then
    return jsonb_build_object('announcementId', preview_row.data->>'announcementId',
      'delivered', coalesce((preview_row.data->>'recipientCount')::integer, 0), 'idempotent', true);
  end if;
  if preview_row.expires_at <= now() then raise exception 'audience_preview_expired'; end if;
  if nullif(trim(p_title), '') is null or nullif(trim(p_message), '') is null then
    raise exception 'announcement_content_required';
  end if;
  for recipient_row in select * from public.announcement_recipient_snapshots
    where parent_id = p_preview_id order by student_id
  loop
    digest := md5(p_announcement_id || ':' || recipient_row.student_id);
    notification_id := 'targeted_announcement_' || digest;
    insert into public."studentNotifications"(id, data, updated_at) values(
      notification_id,
      jsonb_build_object('studentId', recipient_row.student_id, 'announcementId', p_announcement_id,
        'audiencePreviewId', p_preview_id, 'type', 'targeted_announcement',
        'title', left(trim(p_title), 160), 'message', left(trim(p_message), 4000),
        'route', coalesce(nullif(trim(p_route), ''), '/student-dashboard/announcements/' || p_announcement_id),
        'read', false, 'archived', false, 'createdAt', now_text), now())
      on conflict(id) do nothing;
    get diagnostics affected = row_count;
    inserted_count := inserted_count + affected;
    insert into public.notification_delivery_events(id, data) values(
      'delivery_' || digest,
      jsonb_build_object('studentId', recipient_row.student_id, 'sourceId', p_announcement_id,
        'notificationId', notification_id, 'channel', 'inbox_dashboard', 'status', 'delivered',
        'attempts', 1, 'createdAt', now_text)) on conflict(id) do nothing;
  end loop;
  update public.announcement_audience_previews set data = data || jsonb_build_object(
    'status', 'published', 'announcementId', p_announcement_id,
    'publishedAt', now_text, 'deliveredCount', inserted_count)
    where id = p_preview_id;
  return jsonb_build_object('announcementId', p_announcement_id,
    'delivered', inserted_count, 'idempotent', false);
end;
$$;

create or replace function public.grantor_scope_snapshot(p_grantor_id text, p_student_data jsonb)
returns jsonb language plpgsql stable set search_path = '' as $$
declare policy jsonb; address_text text; normalized_address text; municipality text; allowed jsonb;
begin
  select data into policy from public.grantor_scope_policies where id = p_grantor_id;
  address_text := coalesce(
    p_student_data#>>'{address,permanentAddress}', p_student_data#>>'{address,permanent}',
    concat_ws(', ', nullif(p_student_data#>>'{permanentAddress,street}', ''),
      nullif(p_student_data#>>'{permanentAddress,barangay}', ''),
      nullif(p_student_data#>>'{permanentAddress,city}', ''),
      nullif(p_student_data#>>'{permanentAddress,province}', '')),
    p_student_data->>'homeAddress', p_student_data->>'address', ''
  );
  normalized_address := public.normalize_scope_location(address_text);
  municipality := public.normalize_scope_location(coalesce(
    p_student_data#>>'{address,permanentMunicipality}', p_student_data->>'permanentMunicipality',
    p_student_data#>>'{permanentAddress,city}', p_student_data->>'municipality', p_student_data->>'city', ''
  ));
  allowed := coalesce(policy->'municipalities', '[]'::jsonb);
  return jsonb_build_object(
    'policyId', p_grantor_id,
    'version', coalesce((policy->>'version')::integer, 0),
    'name', coalesce(policy->>'name', ''),
    'enabled', coalesce((policy->>'enabled')::boolean, false),
    'addressSource', 'self_declared_permanent_address',
    'address', address_text,
    'normalizedAddress', normalized_address,
    'municipality', municipality,
    'eligible', case
      when not coalesce((policy->>'enabled')::boolean, false) then true
      else exists (
        select 1 from jsonb_array_elements_text(allowed) item
        where public.normalize_scope_location(item) = municipality
          or (municipality = '' and normalized_address like '%' || public.normalize_scope_location(item) || '%')
      )
    end
  );
end;
$$;

create or replace function public.waitlist_global_capacity()
returns integer language sql stable set search_path = '' as $$
  select coalesce((
    select greatest(0, coalesce((data->>'waitlistCapacity')::integer, 0))
    from public.system_configuration where id = 'portal'
  ), 0);
$$;

create or replace function public.waitlist_dynamic_eligibility_reason(p_entry_id text)
returns text language plpgsql stable security definer set search_path = '' as $$
declare entry_row record; student_data jsonb; announcement_data jsonb; minimum_grade numeric; student_grade numeric;
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

create or replace function public.promote_waitlist_for_announcement(p_announcement_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare announcement_row record; entry_row record; eligibility_reason text; offer_id text; now_text text := now()::text;
begin
  perform pg_advisory_xact_lock(hashtext('waitlist:' || p_announcement_id));
  select * into announcement_row from public.grantor_portal_announcements where id = p_announcement_id for update;
  if not found or greatest(coalesce((announcement_row.data->>'remainingSlots')::integer, 0), 0) < 1 then
    return jsonb_build_object('promoted', false, 'reason', 'no_available_slot');
  end if;

  for entry_row in
    select * from public.scholarship_waitlist_entries
    where announcement_id = p_announcement_id and status = 'queued'
    order by queued_at, id for update skip locked
  loop
    eligibility_reason := public.waitlist_dynamic_eligibility_reason(entry_row.id);
    if eligibility_reason is not null then
      update public.scholarship_waitlist_entries set status = 'closed', updated_at = now()
        where id = entry_row.id;
      insert into public.scholarship_waitlist_audit_events(id, entry_id, data)
        values('waitlist_closed_' || md5(entry_row.id || now_text), entry_row.id,
          jsonb_build_object('action', 'closed_ineligible', 'reason', eligibility_reason,
            'studentId', entry_row.student_id, 'createdAt', now_text));
      continue;
    end if;

    offer_id := 'offer_' || md5(entry_row.id || ':' || now_text);
    update public.grantor_portal_announcements set
      data = data || jsonb_build_object('remainingSlots', greatest((data->>'remainingSlots')::integer - 1, 0), 'updatedAt', now_text),
      updated_at = now() where id = p_announcement_id;
    update public.scholarship_waitlist_entries set status = 'offered', offered_at = now(),
      expires_at = now() + interval '24 hours', updated_at = now() where id = entry_row.id;
    insert into public.scholarship_waitlist_offers(id, entry_id, student_id, announcement_id, status, expires_at, data)
      values(offer_id, entry_row.id, entry_row.student_id, p_announcement_id, 'active', now() + interval '24 hours',
        jsonb_build_object('grantorId', entry_row.grantor_id, 'reservedSlot', true));
    insert into public."studentNotifications"(id, data, updated_at) values(
      'waitlist_offer_' || offer_id,
      jsonb_build_object('studentId', entry_row.student_id, 'announcementId', p_announcement_id,
        'waitlistEntryId', entry_row.id, 'offerId', offer_id, 'type', 'waitlist_offer',
        'title', 'Scholarship slot available',
        'message', 'A scholarship application slot is reserved for you for 24 hours. Accept or decline the offer in Scholarships.',
        'route', '/student-dashboard/scholarships?waitlistOffer=' || offer_id,
        'read', false, 'createdAt', now_text), now()) on conflict(id) do nothing;
    insert into public.notification_delivery_events(id, data) values(
      'delivery_waitlist_offer_' || offer_id,
      jsonb_build_object('studentId', entry_row.student_id, 'channel', 'inbox_dashboard', 'status', 'delivered',
        'eventType', 'waitlist_offer', 'sourceId', offer_id, 'createdAt', now_text)) on conflict(id) do nothing;
    insert into public.scholarship_waitlist_audit_events(id, entry_id, data) values(
      'waitlist_offered_' || offer_id, entry_row.id,
      jsonb_build_object('action', 'offered', 'offerId', offer_id, 'expiresAt', (now() + interval '24 hours')::text, 'createdAt', now_text));
    return jsonb_build_object('promoted', true, 'entryId', entry_row.id, 'offerId', offer_id);
  end loop;
  return jsonb_build_object('promoted', false, 'reason', 'no_eligible_waitlist_entry');
end;
$$;

create or replace function public.reserve_or_waitlist_scholarship(
  p_student_id text, p_announcement_id text, p_grantor_id text,
  p_application_id text, p_application_number text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare student_data jsonb; announcement_data jsonb; scope jsonb; active_count integer; attempt integer; entry_id text; result jsonb;
begin
  perform pg_advisory_xact_lock(hashtext('student:' || p_student_id));
  perform pg_advisory_xact_lock(hashtext('waitlist:' || p_announcement_id));
  select data into student_data from public.students where id = p_student_id for update;
  if not found then raise exception 'student_not_found'; end if;
  select data into announcement_data from public.grantor_portal_announcements
    where id = p_announcement_id and parent_id = p_grantor_id for update;
  if not found then raise exception 'announcement_not_found'; end if;
  scope := public.grantor_scope_snapshot(p_grantor_id, student_data);
  if not coalesce((scope->>'eligible')::boolean, false) then raise exception 'location_out_of_scope'; end if;

  begin
    result := public.reserve_scholarship_application(p_student_id, p_announcement_id, p_grantor_id, p_application_id, p_application_number);
    update public.scholarship_applications set data = data || jsonb_build_object('scopeSnapshot', scope)
      where id = p_application_id;
    return result || jsonb_build_object('disposition', 'applied', 'scopeSnapshot', scope);
  exception when others then
    if position('scholarship_full' in sqlerrm) = 0 then raise; end if;
  end;

  perform pg_advisory_xact_lock(hashtext('waitlist:global-capacity'));
  if public.waitlist_global_capacity() <= 0 then raise exception 'scholarship_full'; end if;
  select count(*) into active_count from public.scholarship_waitlist_entries where status in ('queued', 'offered');
  if active_count >= public.waitlist_global_capacity() then raise exception 'waitlist_full'; end if;
  if exists(select 1 from public.scholarship_waitlist_entries where student_id = p_student_id
    and announcement_id = p_announcement_id and status in ('queued', 'offered')) then
    select id into entry_id from public.scholarship_waitlist_entries where student_id = p_student_id
      and announcement_id = p_announcement_id and status in ('queued', 'offered') limit 1;
    return jsonb_build_object('disposition', 'queued', 'waitlistEntryId', entry_id, 'idempotent', true);
  end if;
  select coalesce(max(attempt_number), 0) + 1 into attempt from public.scholarship_waitlist_entries
    where student_id = p_student_id and announcement_id = p_announcement_id;
  entry_id := 'queue_' || md5(p_student_id || ':' || p_announcement_id || ':' || clock_timestamp()::text);
  insert into public.scholarship_waitlist_entries(
    id, student_id, announcement_id, grantor_id, status, scope_snapshot, application_snapshot, attempt_number
  ) values (
    entry_id, p_student_id, p_announcement_id, p_grantor_id, 'queued', scope,
    jsonb_build_object('applicationId', p_application_id, 'applicationNumber', p_application_number,
      'studentId', p_student_id, 'announcementId', p_announcement_id, 'grantorId', p_grantor_id,
      'scholarshipName', coalesce(announcement_data->>'scholarshipTitle', announcement_data->>'title', 'Scholarship'),
      'academicCycle', coalesce(announcement_data->>'academicCycle', announcement_data->>'semesterTag', '')),
    attempt
  );
  insert into public.scholarship_waitlist_audit_events(id, entry_id, data) values(
    'waitlist_joined_' || entry_id, entry_id,
    jsonb_build_object('action', 'joined', 'studentId', p_student_id, 'announcementId', p_announcement_id,
      'attemptNumber', attempt, 'createdAt', now()::text));
  return jsonb_build_object('disposition', 'queued', 'waitlistEntryId', entry_id,
    'queuePosition', (select count(*) from public.scholarship_waitlist_entries
      where announcement_id = p_announcement_id and status = 'queued' and (queued_at, id) <= (now(), entry_id)),
    'scopeSnapshot', scope, 'idempotent', false);
end;
$$;

create or replace function public.resolve_waitlist_offer(p_student_id text, p_offer_id text, p_action text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare offer_row record; entry_row record; announcement_data jsonb; student_data jsonb; application_data jsonb;
  v_application_id text; application_number text; eligibility_reason text; now_text text := now()::text; promoted jsonb;
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
  v_application_id := coalesce(entry_row.application_snapshot->>'applicationId', 'application_' || md5(entry_row.id));
  application_number := coalesce(entry_row.application_snapshot->>'applicationNumber', p_student_id || '-' || substr(md5(entry_row.id), 1, 8));
  application_data := entry_row.application_snapshot || announcement_data || jsonb_build_object(
    'id', v_application_id, 'applicationId', v_application_id, 'applicationNumber', application_number,
    'studentId', p_student_id, 'announcementId', offer_row.announcement_id, 'grantorId', entry_row.grantor_id,
    'status', 'Applied', 'slotReserved', true, 'waitlistEntryId', entry_row.id,
    'waitlistOfferId', p_offer_id, 'scopeSnapshot', entry_row.scope_snapshot,
    'applicationDate', now_text, 'createdAt', now_text, 'updatedAt', now_text
  );
  insert into public.scholarship_applications(id, data, updated_at) values(v_application_id, application_data, now())
    on conflict(id) do update set data = excluded.data, updated_at = now();
  update public.students set data = data || jsonb_build_object(
    'scholarships', coalesce(data->'scholarships', '[]'::jsonb) || jsonb_build_array(application_data), 'updatedAt', now_text
  ), updated_at = now() where id = p_student_id;
  update public.scholarship_waitlist_offers set status = 'accepted', resolved_at = now(), updated_at = now() where id = p_offer_id;
  update public.scholarship_waitlist_entries set status = 'accepted', application_id = v_application_id, updated_at = now() where id = entry_row.id;
  insert into public.scholarship_waitlist_audit_events(id, entry_id, data) values(
    'waitlist_accepted_' || p_offer_id, entry_row.id,
    jsonb_build_object('action', 'accepted', 'applicationId', v_application_id, 'createdAt', now_text));
  return jsonb_build_object('status', 'accepted', 'applicationId', v_application_id, 'application', application_data);
end;
$$;

create or replace function public.expire_waitlist_offers(p_limit integer default 100)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare offer_row record; processed integer := 0; promoted jsonb; now_text text := now()::text;
begin
  for offer_row in select * from public.scholarship_waitlist_offers
    where status = 'active' and expires_at <= now() order by expires_at, id limit least(greatest(p_limit, 1), 500) for update skip locked
  loop
    update public.scholarship_waitlist_offers set status = 'expired', resolved_at = now(), updated_at = now() where id = offer_row.id;
    update public.scholarship_waitlist_entries set status = 'expired', updated_at = now() where id = offer_row.entry_id;
    update public.grantor_portal_announcements set data = data || jsonb_build_object(
      'remainingSlots', greatest(coalesce((data->>'remainingSlots')::integer, 0), 0) + 1, 'updatedAt', now_text), updated_at = now()
      where id = offer_row.announcement_id;
    insert into public."studentNotifications"(id, data, updated_at) values(
      'waitlist_expired_' || offer_row.id,
      jsonb_build_object('studentId', offer_row.student_id, 'announcementId', offer_row.announcement_id,
        'type', 'waitlist_offer_expired', 'title', 'Scholarship slot offer expired',
        'message', 'Your 24-hour application-slot offer expired. You may join the waitlist again at the end of the queue.',
        'route', '/student-dashboard/scholarships', 'read', false, 'createdAt', now_text), now()) on conflict(id) do nothing;
    insert into public.scholarship_waitlist_audit_events(id, entry_id, data) values(
      'waitlist_expired_' || offer_row.id, offer_row.entry_id,
      jsonb_build_object('action', 'expired', 'offerId', offer_row.id, 'createdAt', now_text));
    promoted := public.promote_waitlist_for_announcement(offer_row.announcement_id);
    processed := processed + 1;
  end loop;
  return jsonb_build_object('processed', processed);
end;
$$;

create or replace function public.promote_waitlist_after_slot_increase()
returns trigger language plpgsql security definer set search_path = '' as $$
declare increase integer; i integer;
begin
  if pg_trigger_depth() > 1 then return new; end if;
  increase := greatest(coalesce((new.data->>'remainingSlots')::integer, 0), 0)
    - greatest(coalesce((old.data->>'remainingSlots')::integer, 0), 0);
  if increase > 0 then
    for i in 1..increase loop perform public.promote_waitlist_for_announcement(new.id); end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists promote_waitlist_after_slot_increase on public.grantor_portal_announcements;
create trigger promote_waitlist_after_slot_increase
after update of data on public.grantor_portal_announcements
for each row when (
  greatest(coalesce((new.data->>'remainingSlots')::integer, 0), 0)
  > greatest(coalesce((old.data->>'remainingSlots')::integer, 0), 0)
) execute function public.promote_waitlist_after_slot_increase();

create or replace function public.close_waitlists_after_commitment()
returns trigger language plpgsql security definer set search_path = '' as $$
declare entry_row record; now_text text := now()::text;
begin
  if nullif(new.data#>>'{scholarshipCommitment,applicationId}', '') is null
    or nullif(new.data#>>'{scholarshipCommitment,applicationId}', '') is not distinct from nullif(old.data#>>'{scholarshipCommitment,applicationId}', '') then
    return new;
  end if;
  for entry_row in select * from public.scholarship_waitlist_entries
    where student_id = new.id and status in ('queued', 'offered') for update
  loop
    if entry_row.status = 'offered' then
      update public.scholarship_waitlist_offers set status = 'closed', resolved_at = now(), updated_at = now()
        where entry_id = entry_row.id and status = 'active';
      update public.grantor_portal_announcements set data = data || jsonb_build_object(
        'remainingSlots', greatest(coalesce((data->>'remainingSlots')::integer, 0), 0) + 1,
        'updatedAt', now_text), updated_at = now() where id = entry_row.announcement_id;
    end if;
    update public.scholarship_waitlist_entries set status = 'closed', updated_at = now() where id = entry_row.id;
    insert into public.scholarship_waitlist_audit_events(id, entry_id, data) values(
      'waitlist_commitment_closed_' || md5(entry_row.id || now_text), entry_row.id,
      jsonb_build_object('action', 'closed_after_commitment',
        'commitmentApplicationId', new.data#>>'{scholarshipCommitment,applicationId}', 'createdAt', now_text));
  end loop;
  return new;
end;
$$;

drop trigger if exists close_waitlists_after_commitment on public.students;
create trigger close_waitlists_after_commitment
after update of data on public.students
for each row execute function public.close_waitlists_after_commitment();

create or replace function public.replace_exact_json_string(p_value jsonb, p_old text, p_new text)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare result jsonb; item record;
begin
  case jsonb_typeof(p_value)
    when 'string' then return case when p_value = to_jsonb(p_old) then to_jsonb(p_new) else p_value end;
    when 'array' then select coalesce(jsonb_agg(public.replace_exact_json_string(value, p_old, p_new)), '[]'::jsonb)
      into result from jsonb_array_elements(p_value); return result;
    when 'object' then
      result := '{}'::jsonb;
      for item in select * from jsonb_each(p_value) loop
        result := result || jsonb_build_object(item.key, public.replace_exact_json_string(item.value, p_old, p_new));
      end loop;
      return result;
    else return p_value;
  end case;
end;
$$;

create or replace function public.protect_student_document_submission_content()
returns trigger language plpgsql set search_path = '' as $$
declare mutable_keys text[] := array[
  'status', 'rejectionReason', 'reviewNotes', 'fieldErrors',
  'reviewedBy', 'reviewedAt', 'updatedAt'
];
begin
  if coalesce(current_setting('bulsuscholar.student_number_correction', true), '') = 'true' then
    return new;
  end if;
  if (old.data - mutable_keys) is distinct from (new.data - mutable_keys) then
    raise exception 'submitted student document content is immutable';
  end if;
  return new;
end;
$$;

create or replace function public.correct_student_number(
  p_old_student_id text, p_new_student_id text, p_actor_id text, p_reason text, p_event_id text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare student_row record; existing_event jsonb; target_table text; has_updated_at boolean; now_text text := now()::text;
begin
  if p_new_student_id !~ '^[A-Za-z0-9][A-Za-z0-9_-]{3,39}$' then raise exception 'invalid_student_number'; end if;
  if length(trim(p_reason)) < 10 then raise exception 'correction_reason_required'; end if;
  perform pg_advisory_xact_lock(hashtext('student-number:' || p_old_student_id));
  select data into existing_event from public.student_number_change_events where id = p_event_id;
  if existing_event is not null then
    return jsonb_build_object('idempotent', true, 'studentId', existing_event->>'newStudentId',
      'authUserId', existing_event->>'authUserId', 'eventId', p_event_id);
  end if;
  select * into student_row from public.students where id = p_old_student_id for update;
  if not found then raise exception 'student_not_found'; end if;
  if exists(select 1 from public.students where id = p_new_student_id)
    or exists(select 1 from public.pending_students where id = p_new_student_id)
    or exists(select 1 from public.login_security_state where account_type = 'student' and account_id = p_new_student_id)
    or exists(select 1 from public.student_document_usage where student_id = p_new_student_id or account_id = p_new_student_id)
    or exists(select 1 from public.grantor_portal_scholars where coalesce(
      data->>'studentId', data->>'studentnumber', data->>'studentNumber') = p_new_student_id)
    or exists(select 1 from public.roster_import_rows where coalesce(
      data->>'studentId', data->>'studentnumber', data->>'studentNumber') = p_new_student_id)
    or exists(select 1 from public.student_number_change_events where p_new_student_id in (
      data->>'oldStudentId', data->>'newStudentId')) then raise exception 'student_number_exists'; end if;
  perform set_config('bulsuscholar.student_number_correction', 'true', true);
  insert into public.students(id, data, updated_at) values(
    p_new_student_id,
    public.replace_exact_json_string(student_row.data, p_old_student_id, p_new_student_id)
      || jsonb_build_object('studentId', p_new_student_id, 'studentNumber', p_new_student_id, 'sessionValidAfter', now_text, 'updatedAt', now_text),
    now()
  );
  foreach target_table in array array[
    'scholarship_applications', 'grantor_portal_scholars', 'studentNotifications', 'student_warnings',
    'soe_requests', 'soe_downloads', 'support_feedback', 'student_profile_drafts',
    'student_profile_revisions', 'student_document_submissions', 'student_document_exceptions',
    'student_next_action_events', 'roster_assignment_conflicts', 'roster_import_rows'
  ] loop
    if to_regclass('public.' || target_table) is not null then
      select exists(select 1 from information_schema.columns
        where table_schema = 'public' and table_name = target_table and column_name = 'updated_at')
        into has_updated_at;
      if has_updated_at then
        execute format('update public.%I set data = public.replace_exact_json_string(data, $1, $2), updated_at = now() where data::text like $3', target_table)
          using p_old_student_id, p_new_student_id, '%' || p_old_student_id || '%';
      else
        execute format('update public.%I set data = public.replace_exact_json_string(data, $1, $2) where data::text like $3', target_table)
          using p_old_student_id, p_new_student_id, '%' || p_old_student_id || '%';
      end if;
    end if;
  end loop;
  update public.login_security_state set account_id = p_new_student_id, updated_at = now()
    where account_type = 'student' and account_id = p_old_student_id;
  update public.student_document_usage set student_id = p_new_student_id,
    account_id = case when account_id = p_old_student_id then p_new_student_id else account_id end,
    data = public.replace_exact_json_string(data, p_old_student_id, p_new_student_id), updated_at = now()
    where student_id = p_old_student_id or account_id = p_old_student_id or data::text like '%' || p_old_student_id || '%';
  update public.support_ticket_messages set sender_id = p_new_student_id
    where sender_type = 'student' and sender_id = p_old_student_id;
  update public.scholarship_waitlist_entries set student_id = p_new_student_id,
    application_snapshot = public.replace_exact_json_string(application_snapshot, p_old_student_id, p_new_student_id), updated_at = now()
    where student_id = p_old_student_id;
  update public.scholarship_waitlist_offers set student_id = p_new_student_id, updated_at = now() where student_id = p_old_student_id;
  update public.announcement_recipient_snapshots set student_id = p_new_student_id where student_id = p_old_student_id;
  delete from public.students where id = p_old_student_id;
  insert into public.student_number_change_events(id, data) values(p_event_id, jsonb_build_object(
    'oldStudentId', p_old_student_id, 'newStudentId', p_new_student_id, 'actorId', p_actor_id,
    'reason', trim(p_reason), 'status', 'database_updated', 'authUserId', student_row.data->>'authUserId', 'createdAt', now_text));
  insert into public."studentNotifications"(id, data, updated_at) values(
    'student_number_changed_' || p_event_id,
    jsonb_build_object('studentId', p_new_student_id, 'type', 'student_number_changed',
      'title', 'Student number updated', 'message', 'Your student number was corrected by the scholarship office. Sign in again using your new student number.',
      'route', '/login', 'read', false, 'createdAt', now_text), now()) on conflict(id) do nothing;
  return jsonb_build_object('idempotent', false, 'studentId', p_new_student_id,
    'authUserId', student_row.data->>'authUserId', 'eventId', p_event_id);
end;
$$;

revoke all on function public.protect_portal_immutable_event() from public, anon, authenticated;
revoke all on function public.normalize_scope_location(text) from public, anon, authenticated;
revoke all on function public.save_grantor_scope_policy(text, text, text, boolean, jsonb, text) from public, anon, authenticated;
revoke all on function public.publish_announcement_preview(text, text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.grantor_scope_snapshot(text, jsonb) from public, anon, authenticated;
revoke all on function public.waitlist_global_capacity() from public, anon, authenticated;
revoke all on function public.waitlist_dynamic_eligibility_reason(text) from public, anon, authenticated;
revoke all on function public.promote_waitlist_for_announcement(text) from public, anon, authenticated;
revoke all on function public.reserve_or_waitlist_scholarship(text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.resolve_waitlist_offer(text, text, text) from public, anon, authenticated;
revoke all on function public.expire_waitlist_offers(integer) from public, anon, authenticated;
revoke all on function public.promote_waitlist_after_slot_increase() from public, anon, authenticated;
revoke all on function public.close_waitlists_after_commitment() from public, anon, authenticated;
revoke all on function public.replace_exact_json_string(jsonb, text, text) from public, anon, authenticated;
revoke all on function public.protect_student_document_submission_content() from public, anon, authenticated;
revoke all on function public.correct_student_number(text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.grantor_scope_snapshot(text, jsonb) to service_role;
grant execute on function public.save_grantor_scope_policy(text, text, text, boolean, jsonb, text) to service_role;
grant execute on function public.publish_announcement_preview(text, text, text, text, text, text, text) to service_role;
grant execute on function public.waitlist_global_capacity() to service_role;
grant execute on function public.promote_waitlist_for_announcement(text) to service_role;
grant execute on function public.reserve_or_waitlist_scholarship(text, text, text, text, text) to service_role;
grant execute on function public.resolve_waitlist_offer(text, text, text) to service_role;
grant execute on function public.expire_waitlist_offers(integer) to service_role;
grant execute on function public.correct_student_number(text, text, text, text, text) to service_role;

commit;
