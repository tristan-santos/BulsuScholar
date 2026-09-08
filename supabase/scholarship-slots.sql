-- Scholarship application capacity. Run in Supabase Dashboard > SQL Editor.
-- Slot mutations are restricted to the backend service role and serialized with row locks.

create or replace function public.configure_scholarship_slots(
  p_announcement_id text,
  p_grantor_id text,
  p_total_slots integer
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  announcement_row public.grantor_portal_announcements%rowtype;
  occupied integer;
  remaining integer;
begin
  if p_total_slots < 1 or p_total_slots > 1000 then
    raise exception 'invalid_slot_capacity';
  end if;

  select * into announcement_row
  from public.grantor_portal_announcements
  where id = p_announcement_id and parent_id = p_grantor_id
  for update;

  if not found then raise exception 'announcement_not_found'; end if;
  if coalesce((announcement_row.data->>'applicationEnabled')::boolean, false) is not true then
    raise exception 'announcement_not_open_for_applications';
  end if;

  select count(*) into occupied
  from public.scholarship_applications
  where data->>'announcementId' = p_announcement_id
    and coalesce(lower(data->>'status'), '') not in
      ('rejected', 'cancelled', 'canceled', 'withdrawn', 'archived', 'resolved', 'expired');

  if p_total_slots < occupied then raise exception 'capacity_below_occupied'; end if;
  remaining := p_total_slots - occupied;

  update public.scholarship_applications
  set data = data || jsonb_build_object('slotReserved', true, 'slotReleasedAt', null), updated_at = now()
  where data->>'announcementId' = p_announcement_id
    and coalesce(lower(data->>'status'), '') not in
      ('rejected', 'cancelled', 'canceled', 'withdrawn', 'archived', 'resolved', 'expired');

  update public.grantor_portal_announcements
  set data = data || jsonb_build_object(
    'slotsConfigured', true,
    'totalSlots', p_total_slots,
    'remainingSlots', remaining,
    'updatedAt', now()::text
  ), updated_at = now()
  where id = p_announcement_id and parent_id = p_grantor_id;

  return jsonb_build_object('totalSlots', p_total_slots, 'remainingSlots', remaining, 'occupiedSlots', occupied);
end;
$$;

create or replace function public.apply_scholarship_with_slot(
  p_announcement_id text,
  p_grantor_id text,
  p_student_id text,
  p_application_id text,
  p_application_data jsonb,
  p_student_update jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  announcement_row public.grantor_portal_announcements%rowtype;
  student_row public.students%rowtype;
  remaining integer;
  existing_application_id text;
begin
  select * into announcement_row
  from public.grantor_portal_announcements
  where id = p_announcement_id and parent_id = p_grantor_id
  for update;
  if not found then raise exception 'announcement_not_found'; end if;
  if coalesce((announcement_row.data->>'applicationEnabled')::boolean, false) is not true
    or coalesce((announcement_row.data->>'archived')::boolean, false) is true
    or lower(coalesce(announcement_row.data->>'status', 'open')) = 'archived' then
    raise exception 'announcement_not_open_for_applications';
  end if;
  if nullif(announcement_row.data->>'endDate', '') is not null
    and (announcement_row.data->>'endDate')::timestamptz < now() then
    raise exception 'announcement_not_open_for_applications';
  end if;
  if coalesce((announcement_row.data->>'slotsConfigured')::boolean, false) is not true then
    raise exception 'slots_not_configured';
  end if;

  remaining := greatest(coalesce((announcement_row.data->>'remainingSlots')::integer, 0), 0);
  if remaining <= 0 then raise exception 'scholarship_full'; end if;

  select * into student_row from public.students where id = p_student_id for update;
  if not found then raise exception 'student_not_found'; end if;

  select id into existing_application_id
  from public.scholarship_applications
  where data->>'studentId' = p_student_id
    and coalesce(lower(data->>'status'), '') not in
      ('rejected', 'cancelled', 'canceled', 'withdrawn', 'archived', 'resolved', 'expired')
  limit 1;
  if existing_application_id is not null then
    if exists (
      select 1 from public.scholarship_applications
      where id = existing_application_id and data->>'announcementId' = p_announcement_id
    ) then
      return jsonb_build_object('idempotent', true, 'applicationId', existing_application_id, 'remainingSlots', remaining);
    end if;
    raise exception 'student_already_has_active_scholarship';
  end if;

  update public.students
  set data = data || coalesce(p_student_update, '{}'::jsonb), updated_at = now()
  where id = p_student_id;

  insert into public.scholarship_applications (id, data, updated_at)
  values (
    p_application_id,
    coalesce(p_application_data, '{}'::jsonb) || jsonb_build_object(
      'slotReserved', true,
      'slotReservedAt', now()::text,
      'slotReleasedAt', null
    ),
    now()
  );

  remaining := remaining - 1;
  update public.grantor_portal_announcements
  set data = data || jsonb_build_object('remainingSlots', remaining), updated_at = now()
  where id = p_announcement_id and parent_id = p_grantor_id;

  return jsonb_build_object('applicationId', p_application_id, 'remainingSlots', remaining, 'idempotent', false);
end;
$$;

create or replace function public.release_scholarship_slot_for_application(
  p_application_id text,
  p_application_patch jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  application_row public.scholarship_applications%rowtype;
  announcement_row public.grantor_portal_announcements%rowtype;
  announcement_id text;
  grantor_id text;
  remaining integer;
  total integer;
  released boolean := false;
begin
  select * into application_row from public.scholarship_applications where id = p_application_id for update;
  if not found then raise exception 'application_not_found'; end if;

  announcement_id := application_row.data->>'announcementId';
  grantor_id := coalesce(application_row.data->>'grantorId', application_row.data->>'providerId');

  if coalesce((application_row.data->>'slotReserved')::boolean, false)
    and nullif(application_row.data->>'slotReleasedAt', '') is null
    and announcement_id is not null then
    select * into announcement_row
    from public.grantor_portal_announcements
    where id = announcement_id and parent_id = grantor_id
    for update;

    if found and coalesce((announcement_row.data->>'slotsConfigured')::boolean, false) then
      total := greatest(coalesce((announcement_row.data->>'totalSlots')::integer, 0), 0);
      remaining := least(greatest(coalesce((announcement_row.data->>'remainingSlots')::integer, 0), 0) + 1, total);
      update public.grantor_portal_announcements
      set data = data || jsonb_build_object('remainingSlots', remaining), updated_at = now()
      where id = announcement_id and parent_id = grantor_id;
      released := true;
    end if;
  end if;

  update public.scholarship_applications
  set data = data || coalesce(p_application_patch, '{}'::jsonb) ||
    case when released then jsonb_build_object('slotReleasedAt', now()::text) else '{}'::jsonb end,
    updated_at = now()
  where id = p_application_id;

  return jsonb_build_object('released', released, 'remainingSlots', remaining);
end;
$$;

revoke all on function public.configure_scholarship_slots(text, text, integer) from public, anon, authenticated;
revoke all on function public.apply_scholarship_with_slot(text, text, text, text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.release_scholarship_slot_for_application(text, jsonb) from public, anon, authenticated;
grant execute on function public.configure_scholarship_slots(text, text, integer) to service_role;
grant execute on function public.apply_scholarship_with_slot(text, text, text, text, jsonb, jsonb) to service_role;
grant execute on function public.release_scholarship_slot_for_application(text, jsonb) to service_role;

notify pgrst, 'reload schema';
