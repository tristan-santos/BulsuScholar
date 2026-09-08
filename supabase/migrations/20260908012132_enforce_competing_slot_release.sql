create or replace function public.release_scholarship_slot_before_choice(
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
    return jsonb_build_object('idempotent', true, 'released', false, 'application', application_data);
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

do $$
declare
  original_definition text;
  corrected_definition text;
begin
  select pg_get_functiondef('public.mutate_scholarship_choice(text,text,text)'::regprocedure)
    into original_definition;
  if position('release_result->>''released'' is distinct from ''true''' in original_definition) > 0 then
    return;
  end if;
  corrected_definition := replace(
    original_definition,
    'release_result->>''released'' <> ''true''',
    'release_result->>''released'' is distinct from ''true'''
  );
  if corrected_definition = original_definition then
    raise exception 'mutate_scholarship_choice release guard was not found';
  end if;
  execute corrected_definition;
end;
$$;

revoke all on function public.release_scholarship_slot_before_choice(text, jsonb) from public, anon, authenticated;
grant execute on function public.release_scholarship_slot_before_choice(text, jsonb) to service_role;
