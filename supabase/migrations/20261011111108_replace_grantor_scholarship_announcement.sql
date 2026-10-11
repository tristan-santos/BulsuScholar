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
  previous_data jsonb;
  replacement_data jsonb;
  safe_patch jsonb;
  replacement_id text;
  current_total integer;
  current_remaining integer;
  replacement_capacity integer;
  now_text text := now()::text;
begin
  perform pg_advisory_xact_lock(734821, 1);

  if coalesce(p_client_request_id, '') = '' then
    raise exception 'missing_republish_identity';
  end if;
  replacement_id := 'grantor_announcement_' || md5(p_grantor_id || ':' || p_client_request_id);

  select data into replacement_data
    from public.grantor_portal_announcements
    where id = replacement_id and parent_id = p_grantor_id;
  if found then
    return jsonb_build_object(
      'announcementId', replacement_id,
      'previousAnnouncementId', p_announcement_id,
      'totalSlots', coalesce((replacement_data->>'totalSlots')::integer, 0),
      'remainingSlots', coalesce((replacement_data->>'remainingSlots')::integer, 0),
      'additionalSlots', 0,
      'idempotent', true,
      'announcement', replacement_data
    );
  end if;

  select data into grantor_portal_data from public.grantor_portals where id = p_grantor_id for update;
  select data into provider_data from public.providers where id = p_grantor_id for update;
  if grantor_portal_data is null and provider_data is null then raise exception 'grantor_not_found'; end if;
  if coalesce((grantor_portal_data->>'archived')::boolean, false)
    or lower(coalesce(grantor_portal_data->>'status', grantor_portal_data->>'accountStatus', '')) in ('archived', 'inactive', 'disabled')
    or coalesce((provider_data->>'archived')::boolean, false)
    or lower(coalesce(provider_data->>'status', provider_data->>'accountStatus', '')) in ('archived', 'inactive', 'disabled')
  then raise exception 'grantor_archived'; end if;

  select data into previous_data
    from public.grantor_portal_announcements
    where id = p_announcement_id and parent_id = p_grantor_id
    for update;
  if not found then raise exception 'announcement_not_found'; end if;
  if coalesce((previous_data->>'archived')::boolean, false)
    or lower(coalesce(previous_data->>'status', '')) in ('archived', 'closed', 'ended', 'draft')
    or coalesce((previous_data->>'applicationEnabled')::boolean, false) is not true
    or coalesce((previous_data->>'slotsConfigured')::boolean, false) is not true
  then raise exception 'scholarship_not_active'; end if;

  current_total := coalesce((previous_data->>'totalSlots')::integer, 0);
  current_remaining := coalesce((previous_data->>'remainingSlots')::integer, 0);
  if current_total <> p_expected_total_slots or current_remaining <> p_expected_remaining_slots then
    raise exception 'stale_slot_capacity';
  end if;
  if p_additional_slots < 0 then raise exception 'invalid_slot_capacity'; end if;

  replacement_capacity := current_remaining + p_additional_slots;
  if replacement_capacity < 1 or replacement_capacity > 1000 then
    raise exception 'invalid_slot_capacity';
  end if;

  safe_patch := coalesce(p_announcement_patch, '{}'::jsonb)
    - array['id', 'grantorId', 'providerId', 'archived', 'hiddenFromStudents',
      'grantorAccountArchived', 'slotsConfigured', 'totalSlots', 'remainingSlots',
      'clientRequestId', 'lastRepublishRequestId', 'createdAt', 'updatedAt',
      'replacedByAnnouncementId'];
  replacement_data := previous_data || safe_patch || jsonb_build_object(
    'id', replacement_id,
    'grantorId', p_grantor_id,
    'applicationEnabled', true,
    'status', 'Open',
    'archived', false,
    'hiddenFromStudents', false,
    'slotsConfigured', true,
    'totalSlots', replacement_capacity,
    'remainingSlots', replacement_capacity,
    'clientRequestId', p_client_request_id,
    'replacesAnnouncementId', p_announcement_id,
    'continuationRootAnnouncementId', coalesce(previous_data->>'continuationRootAnnouncementId', p_announcement_id),
    'createdAt', now_text,
    'updatedAt', now_text
  );

  insert into public.grantor_portal_announcements(id, parent_id, data, updated_at)
  values(replacement_id, p_grantor_id, replacement_data, now());

  update public.scholarship_waitlist_entries
    set announcement_id = replacement_id,
      application_snapshot = application_snapshot || jsonb_build_object('announcementId', replacement_id),
      updated_at = now()
    where announcement_id = p_announcement_id and grantor_id = p_grantor_id
      and status in ('queued', 'offered');
  update public.scholarship_waitlist_offers
    set announcement_id = replacement_id, updated_at = now()
    where announcement_id = p_announcement_id and status = 'active';

  update public.grantor_portal_announcements
    set data = previous_data || jsonb_build_object(
      'archived', true,
      'hiddenFromStudents', true,
      'status', 'Archived',
      'remainingSlots', 0,
      'replacedByAnnouncementId', replacement_id,
      'archivedAt', now_text,
      'archiveReason', 'Continued by a newer scholarship announcement',
      'updatedAt', now_text
    ), updated_at = now()
    where id = p_announcement_id and parent_id = p_grantor_id;

  return jsonb_build_object(
    'announcementId', replacement_id,
    'previousAnnouncementId', p_announcement_id,
    'totalSlots', replacement_capacity,
    'remainingSlots', replacement_capacity,
    'additionalSlots', p_additional_slots,
    'idempotent', false,
    'announcement', replacement_data
  );
end;
$$;

revoke all on function public.republish_grantor_scholarship(text, text, integer, integer, integer, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.republish_grantor_scholarship(text, text, integer, integer, integer, jsonb, text)
  to service_role;
