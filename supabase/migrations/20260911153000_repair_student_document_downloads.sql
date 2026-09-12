begin;

-- Every scholarship choice releases an application form with the SOE. The
-- application snapshot decides whether that form is custom or the BulSU
-- default; later grantor profile changes cannot alter an existing request.
create or replace function public.enrich_choice_material_request()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  application_data jsonb;
  custom_form jsonb;
  form_type text := 'default';
  existing_form_type text;
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

  existing_form_type := lower(coalesce(new.data->>'applicationFormType', ''));
  custom_form := new.data->'customApplicationForm';
  if jsonb_typeof(custom_form) is distinct from 'object'
    or coalesce(custom_form->>'url', custom_form->>'publicUrl', custom_form->>'path',
      custom_form->>'publicId', custom_form->>'storagePath', '') = '' then
    custom_form := new.data->'customApplicationProfile';
  end if;
  if existing_form_type not in ('custom', 'default') and (
    jsonb_typeof(custom_form) is distinct from 'object'
    or coalesce(custom_form->>'url', custom_form->>'publicUrl', custom_form->>'path',
      custom_form->>'publicId', custom_form->>'storagePath', '') = '') then
    custom_form := application_data->'customApplicationForm';
  end if;
  if existing_form_type not in ('custom', 'default') and (
    jsonb_typeof(custom_form) is distinct from 'object'
    or coalesce(custom_form->>'url', custom_form->>'publicUrl', custom_form->>'path',
      custom_form->>'publicId', custom_form->>'storagePath', '') = '') then
    custom_form := application_data->'customApplicationProfile';
  end if;
  if existing_form_type in ('custom', 'default') then
    form_type := existing_form_type;
  elsif jsonb_typeof(custom_form) = 'object'
    and coalesce(custom_form->>'url', custom_form->>'publicUrl', custom_form->>'path',
      custom_form->>'publicId', custom_form->>'storagePath', '') <> '' then
    form_type := 'custom';
  else
    custom_form := null;
  end if;

  new.data := new.data || jsonb_build_object('applicationFormType', form_type);
  if form_type = 'custom' then
    new.data := new.data || jsonb_build_object('customApplicationForm', custom_form);
  else
    new.data := new.data - 'customApplicationForm' - 'customApplicationProfile';
  end if;

  -- Preserve completed decisions and download timestamps on later updates.
  if coalesce(new.data#>>'{materials,application_form,requested}', 'false') = 'true' then
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
    -- A rejected SOE-only record receives the form when a retry returns the
    -- package to pending; rejection never unlocks a form by itself.
    return new;
  end if;

  new.data := new.data || jsonb_build_object(
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

-- Upgrade pending and approved committed requests. Rejected requests retain
-- their decision and are enriched when the student successfully retries.
update public.soe_requests request
set data = request.data,
    updated_at = request.updated_at
where request.id like 'choice_%'
  and nullif(request.data->>'applicationId', '') is not null
  and lower(coalesce(
    request.data#>>'{materials,soe,status}',
    request.data->>'reviewState',
    request.data->>'status',
    ''
  )) in ('approved', 'signed', 'pending', 'incoming', 'requested')
  and exists (
    select 1
    from public.students student
    where student.id = request.data->>'studentId'
      and student.data#>>'{scholarshipCommitment,applicationId}' = request.data->>'applicationId'
  );

commit;
