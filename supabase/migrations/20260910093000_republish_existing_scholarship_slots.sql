create or replace function public.republish_grantor_scholarship(
  p_announcement_id text,
  p_grantor_id text,
  p_expected_total_slots integer,
  p_expected_remaining_slots integer,
  p_additional_slots integer,
  p_announcement_patch jsonb,
  p_client_request_id text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  grantor_portal_data jsonb;
  provider_data jsonb;
  announcement_data jsonb;
  safe_patch jsonb;
  current_total integer;
  current_remaining integer;
  next_total integer;
  next_remaining integer;
begin
  perform pg_advisory_xact_lock(734821, 1);

  select data into grantor_portal_data from public.grantor_portals where id = p_grantor_id for update;
  select data into provider_data from public.providers where id = p_grantor_id for update;
  if grantor_portal_data is null and provider_data is null then raise exception 'grantor_not_found'; end if;
  if coalesce((grantor_portal_data->>'archived')::boolean, false)
    or lower(coalesce(grantor_portal_data->>'status', grantor_portal_data->>'accountStatus', '')) in ('archived', 'inactive', 'disabled')
    or coalesce((provider_data->>'archived')::boolean, false)
    or lower(coalesce(provider_data->>'status', provider_data->>'accountStatus', '')) in ('archived', 'inactive', 'disabled')
  then raise exception 'grantor_archived'; end if;

  select data into announcement_data
    from public.grantor_portal_announcements
    where id = p_announcement_id and parent_id = p_grantor_id
    for update;
  if not found then raise exception 'announcement_not_found'; end if;

  if announcement_data->>'lastRepublishRequestId' = p_client_request_id then
    return jsonb_build_object(
      'announcementId', p_announcement_id,
      'totalSlots', (announcement_data->>'totalSlots')::integer,
      'remainingSlots', (announcement_data->>'remainingSlots')::integer,
      'additionalSlots', 0,
      'idempotent', true,
      'announcement', announcement_data
    );
  end if;

  if coalesce((announcement_data->>'archived')::boolean, false)
    or coalesce((announcement_data->>'hiddenFromStudents')::boolean, false)
    or coalesce((announcement_data->>'grantorAccountArchived')::boolean, false)
    or lower(coalesce(announcement_data->>'status', '')) in ('archived', 'closed', 'ended', 'draft')
    or coalesce((announcement_data->>'applicationEnabled')::boolean, false) is not true
    or coalesce((announcement_data->>'slotsConfigured')::boolean, false) is not true
    or (nullif(announcement_data->>'startDate', '') is not null and (announcement_data->>'startDate')::timestamptz > now())
    or (nullif(announcement_data->>'endDate', '') is not null and (announcement_data->>'endDate')::timestamptz < now())
  then raise exception 'scholarship_not_active'; end if;

  current_total := coalesce((announcement_data->>'totalSlots')::integer, 0);
  current_remaining := coalesce((announcement_data->>'remainingSlots')::integer, 0);
  if current_total <> p_expected_total_slots or current_remaining <> p_expected_remaining_slots then
    raise exception 'stale_slot_capacity';
  end if;
  if p_additional_slots < 0 then raise exception 'invalid_slot_capacity'; end if;

  next_total := current_total + p_additional_slots;
  next_remaining := current_remaining + p_additional_slots;
  if next_total < 1 or next_total > 1000 or next_remaining < 0 or next_remaining > next_total then
    raise exception 'invalid_slot_capacity';
  end if;

  safe_patch := coalesce(p_announcement_patch, '{}'::jsonb)
    - array['id', 'grantorId', 'providerId', 'archived', 'hiddenFromStudents',
      'grantorAccountArchived', 'slotsConfigured', 'totalSlots', 'remainingSlots',
      'clientRequestId', 'lastRepublishRequestId', 'createdAt'];
  announcement_data := announcement_data || safe_patch || jsonb_build_object(
    'applicationEnabled', true,
    'status', 'Open',
    'slotsConfigured', true,
    'totalSlots', next_total,
    'remainingSlots', next_remaining,
    'lastRepublishRequestId', p_client_request_id,
    'lastRepublishedAt', now()::text,
    'updatedAt', now()::text
  );

  update public.grantor_portal_announcements
    set data = announcement_data, updated_at = now()
    where id = p_announcement_id and parent_id = p_grantor_id;

  return jsonb_build_object(
    'announcementId', p_announcement_id,
    'totalSlots', next_total,
    'remainingSlots', next_remaining,
    'additionalSlots', p_additional_slots,
    'idempotent', false,
    'announcement', announcement_data
  );
end;
$$;

revoke all on function public.republish_grantor_scholarship(text, text, integer, integer, integer, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.republish_grantor_scholarship(text, text, integer, integer, integer, jsonb, text)
  to service_role;
