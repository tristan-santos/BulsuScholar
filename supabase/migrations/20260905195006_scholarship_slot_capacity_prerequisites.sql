-- Backend-only scholarship capacity primitives. The lifecycle migration wraps
-- these functions with the shared scholarship mutation lock.
create or replace function public.configure_scholarship_slots(
  p_announcement_id text, p_grantor_id text, p_total_slots integer
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  announcement_data jsonb;
  occupied integer;
begin
  if p_total_slots < 1 or p_total_slots > 1000 then raise exception 'invalid_slot_capacity'; end if;
  select data into announcement_data from public.grantor_portal_announcements
    where id = p_announcement_id and parent_id = p_grantor_id for update;
  if not found then raise exception 'announcement_not_found'; end if;
  if announcement_data->>'applicationEnabled' <> 'true' then raise exception 'announcement_not_open_for_applications'; end if;
  select count(*)::integer into occupied from public.scholarship_applications
    where coalesce(data->>'announcementId', '') = p_announcement_id
      and coalesce(data->>'grantorId', data->>'providerId', '') = p_grantor_id
      and data->>'slotReserved' = 'true' and nullif(data->>'slotReleasedAt', '') is null;
  if p_total_slots < occupied then raise exception 'capacity_below_occupied'; end if;
  update public.grantor_portal_announcements set
    data = data || jsonb_build_object('slotsConfigured', true, 'totalSlots', p_total_slots,
      'remainingSlots', p_total_slots - occupied, 'updatedAt', now()::text),
    updated_at = now()
    where id = p_announcement_id and parent_id = p_grantor_id
    returning data into announcement_data;
  return jsonb_build_object('announcementId', p_announcement_id, 'totalSlots', p_total_slots,
    'remainingSlots', p_total_slots - occupied, 'occupiedSlots', occupied, 'announcement', announcement_data);
end;
$$;

create or replace function public.apply_scholarship_with_slot(
  p_announcement_id text, p_grantor_id text, p_student_id text,
  p_application_id text, p_application_data jsonb, p_student_update jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  announcement_data jsonb;
  remaining integer;
begin
  perform 1 from public.students where id = p_student_id for update;
  if not found then raise exception 'student_not_found'; end if;
  select data into announcement_data from public.grantor_portal_announcements
    where id = p_announcement_id and parent_id = p_grantor_id for update;
  if not found then raise exception 'announcement_not_found'; end if;
  if announcement_data->>'applicationEnabled' <> 'true' or announcement_data->>'archived' = 'true'
    or announcement_data->>'hiddenFromStudents' = 'true' then raise exception 'announcement_not_open_for_applications'; end if;
  if announcement_data->>'slotsConfigured' <> 'true' then raise exception 'slots_not_configured'; end if;
  remaining := greatest(coalesce((announcement_data->>'remainingSlots')::integer, 0), 0);
  if remaining < 1 then raise exception 'scholarship_full'; end if;
  if exists(select 1 from public.scholarship_applications
    where data->>'studentId' = p_student_id and data->>'announcementId' = p_announcement_id
      and coalesce(data->>'archived', 'false') <> 'true'
      and lower(coalesce(data->>'status', '')) not in ('rejected','denied','declined','withdrawn','cancelled','canceled')) then
    return jsonb_build_object('idempotent', true, 'remainingSlots', remaining);
  end if;
  insert into public.scholarship_applications(id, data, updated_at)
    values (p_application_id, p_application_data || jsonb_build_object('slotReserved', true,
      'slotReservedAt', now()::text, 'slotReleasedAt', null), now());
  update public.students set data = data || p_student_update, updated_at = now() where id = p_student_id;
  update public.grantor_portal_announcements set data = data || jsonb_build_object(
    'remainingSlots', remaining - 1, 'updatedAt', now()::text), updated_at = now()
    where id = p_announcement_id and parent_id = p_grantor_id;
  return jsonb_build_object('idempotent', false, 'applicationId', p_application_id,
    'remainingSlots', remaining - 1);
end;
$$;

create or replace function public.release_scholarship_slot_for_application(
  p_application_id text, p_application_patch jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  application_data jsonb;
  announcement_data jsonb;
  next_remaining integer;
begin
  select data into application_data from public.scholarship_applications
    where id = p_application_id for update;
  if not found then raise exception 'application_not_found'; end if;
  if application_data->>'slotReserved' <> 'true' or nullif(application_data->>'slotReleasedAt', '') is not null then
    update public.scholarship_applications set data = data || p_application_patch, updated_at = now()
      where id = p_application_id returning data into application_data;
    return jsonb_build_object('idempotent', true, 'application', application_data);
  end if;
  select data into announcement_data from public.grantor_portal_announcements
    where id = application_data->>'announcementId'
      and parent_id = coalesce(application_data->>'grantorId', application_data->>'providerId') for update;
  if not found then raise exception 'slot_reservation_missing'; end if;
  next_remaining := least(coalesce((announcement_data->>'totalSlots')::integer, 0),
    greatest(coalesce((announcement_data->>'remainingSlots')::integer, 0), 0) + 1);
  update public.grantor_portal_announcements set data = data || jsonb_build_object(
    'remainingSlots', next_remaining, 'updatedAt', now()::text), updated_at = now()
    where id = application_data->>'announcementId'
      and parent_id = coalesce(application_data->>'grantorId', application_data->>'providerId');
  update public.scholarship_applications set data = data || p_application_patch || jsonb_build_object(
    'slotReleasedAt', now()::text, 'slotReserved', false, 'updatedAt', now()::text), updated_at = now()
    where id = p_application_id returning data into application_data;
  return jsonb_build_object('idempotent', false, 'released', true, 'application', application_data,
    'remainingSlots', next_remaining);
end;
$$;

revoke all on function public.configure_scholarship_slots(text, text, integer) from public, anon, authenticated;
revoke all on function public.apply_scholarship_with_slot(text, text, text, text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.release_scholarship_slot_for_application(text, jsonb) from public, anon, authenticated;
grant execute on function public.configure_scholarship_slots(text, text, integer) to service_role;
grant execute on function public.apply_scholarship_with_slot(text, text, text, text, jsonb, jsonb) to service_role;
grant execute on function public.release_scholarship_slot_for_application(text, jsonb) to service_role;
