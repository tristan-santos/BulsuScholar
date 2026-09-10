begin;

insert into public.grantor_portals(id, data)
values ('__republish_g1', '{"status":"active","archived":false}')
on conflict (id) do update set data = excluded.data;

insert into public.grantor_portal_announcements(id, parent_id, data)
values (
  '__republish_a1',
  '__republish_g1',
  jsonb_build_object(
    'title', 'Republish Test',
    'applicationEnabled', true,
    'slotsConfigured', true,
    'totalSlots', 25,
    'remainingSlots', 18,
    'status', 'Open',
    'archived', false,
    'hiddenFromStudents', false,
    'grantorAccountArchived', false,
    'startDate', (now() - interval '1 day')::text,
    'endDate', (now() + interval '1 day')::text
  )
)
on conflict (parent_id, id) do update set data = excluded.data;

do $$
declare
  result jsonb;
begin
  result := public.republish_grantor_scholarship(
    '__republish_a1', '__republish_g1', 25, 18, 25,
    '{"description":"Republished","totalSlots":999,"remainingSlots":999}'::jsonb,
    '__republish_request_1'
  );
  if (result->>'totalSlots')::integer <> 50 then raise exception 'expected total slots to be 50'; end if;
  if (result->>'remainingSlots')::integer <> 43 then raise exception 'expected remaining slots to be 43'; end if;

  result := public.republish_grantor_scholarship(
    '__republish_a1', '__republish_g1', 25, 18, 25, '{}'::jsonb, '__republish_request_1'
  );
  if coalesce((result->>'idempotent')::boolean, false) is not true then raise exception 'retry must be idempotent'; end if;
  if (result->>'totalSlots')::integer <> 50 then raise exception 'retry added slots twice'; end if;

  begin
    perform public.republish_grantor_scholarship(
      '__republish_a1', '__republish_g1', 25, 18, 25, '{}'::jsonb, '__republish_request_2'
    );
    raise exception 'expected stale_slot_capacity';
  exception when others then
    if sqlerrm <> 'stale_slot_capacity' then raise; end if;
  end;
end;
$$;

rollback;
