-- Add the application-snapshotted grantor form to choice-created material
-- requests in the same transaction that creates or retries the SOE request.
create or replace function public.enrich_choice_material_request()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  application_data jsonb;
  custom_form jsonb;
  material_status text;
  material_timestamp text;
begin
  if new.id not like 'choice_%'
    or nullif(new.data->>'applicationId', '') is null then
    return new;
  end if;

  select data into application_data
  from public.scholarship_applications
  where id = new.data->>'applicationId';

  custom_form := application_data->'customApplicationForm';
  if jsonb_typeof(custom_form) is distinct from 'object'
    or coalesce(custom_form->>'url', custom_form->>'publicUrl', '') = '' then
    custom_form := application_data->'customApplicationProfile';
  end if;

  if jsonb_typeof(custom_form) is distinct from 'object'
    or coalesce(custom_form->>'url', custom_form->>'publicUrl', '') = '' then
    return new;
  end if;

  -- Preserve an existing decision/download timestamp on later updates.
  if coalesce(new.data#>>'{materials,application_form,requested}', 'false') = 'true' then
    new.data := new.data || jsonb_build_object('customApplicationForm', custom_form);
    return new;
  end if;

  material_status := lower(coalesce(
    new.data#>>'{materials,soe,status}',
    new.data->>'reviewState',
    new.data->>'status',
    ''
  ));

  if material_status in ('approved', 'signed') then
    material_status := 'approved';
    material_timestamp := coalesce(
      new.data#>>'{materials,soe,approvedAt}',
      new.data->>'checkedAt',
      new.data->>'updatedAt',
      now()::text
    );
  elsif material_status in ('pending', 'incoming', 'requested') then
    material_status := 'pending';
    material_timestamp := coalesce(
      new.data#>>'{materials,soe,requestedAt}',
      new.data->>'timestamp',
      new.data->>'createdAt',
      now()::text
    );
  else
    -- Rejected historical requests receive the form when a retry changes the
    -- request back to pending; they are not silently made downloadable.
    return new;
  end if;

  new.data := new.data || jsonb_build_object(
    'customApplicationForm', custom_form,
    'requestedMaterials', coalesce(new.data->'requestedMaterials', '{}'::jsonb)
      || jsonb_build_object('application_form', true),
    'materials', coalesce(new.data->'materials', '{}'::jsonb)
      || jsonb_build_object('application_form', jsonb_build_object(
        'requested', true,
        'status', material_status,
        'requestedAt', material_timestamp,
        'approvedAt', case when material_status = 'approved' then material_timestamp else null end,
        'rejectedAt', null,
        'downloadedAt', null
      ))
  );
  return new;
end;
$$;

drop trigger if exists enrich_choice_material_request_trigger on public.soe_requests;
create trigger enrich_choice_material_request_trigger
before insert or update of data on public.soe_requests
for each row execute function public.enrich_choice_material_request();

-- Existing pending and approved choice requests are upgraded according to
-- their current SOE decision. Rejected rows remain unchanged until retried.
update public.soe_requests
set data = data,
    updated_at = updated_at
where id like 'choice_%'
  and nullif(data->>'applicationId', '') is not null;

create or replace function public.normalize_choice_material_notification()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.id like 'choice_choose_%'
    and new.data->>'type' = 'scholarship_choice' then
    new.data := jsonb_set(
      new.data,
      '{message}',
      to_jsonb('Your scholarship selection and materials request were submitted. Other applications were closed.'::text),
      true
    );
  end if;
  return new;
end;
$$;

drop trigger if exists normalize_choice_material_notification_trigger on public."studentNotifications";
create trigger normalize_choice_material_notification_trigger
before insert or update of data on public."studentNotifications"
for each row execute function public.normalize_choice_material_notification();

update public."studentNotifications"
set data = jsonb_set(
  data,
  '{message}',
  to_jsonb('Your scholarship selection and materials request were submitted. Other applications were closed.'::text),
  true
)
where id like 'choice_choose_%'
  and data->>'type' = 'scholarship_choice';
