create table if not exists public.scholarship_cycle_snapshots (
  id text primary key,
  application_id text not null references public.scholarship_applications(id) on delete restrict,
  student_id text not null references public.students(id) on delete restrict,
  academic_cycle text not null,
  application_data jsonb not null,
  snapshot_source text not null default 'exact',
  captured_at timestamptz not null default now(),
  unique(application_id, academic_cycle)
);

create index if not exists scholarship_cycle_snapshots_student_cycle_idx
  on public.scholarship_cycle_snapshots(student_id, academic_cycle, captured_at desc);

create table if not exists public.academic_cycle_transition_events (
  id uuid primary key default gen_random_uuid(),
  previous_cycle text not null,
  activated_cycle text not null,
  direction text not null check(direction in ('forward', 'rollback')),
  actor_id text not null,
  actor_type text not null check(actor_type in ('root', 'admin')),
  affected_application_count integer not null default 0,
  exact_restoration_count integer not null default 0,
  reconstructed_count integer not null default 0,
  restoration_method text not null check(restoration_method in ('exact', 'reconstructed', 'mixed')),
  created_at timestamptz not null default now()
);

alter table public.scholarship_cycle_snapshots enable row level security;
alter table public.academic_cycle_transition_events enable row level security;
revoke all on public.scholarship_cycle_snapshots, public.academic_cycle_transition_events
  from public, anon, authenticated;
grant select, insert, update on public.scholarship_cycle_snapshots to service_role;
grant select, insert on public.academic_cycle_transition_events to service_role;

create or replace function public.academic_cycle_sort_key(p_cycle text)
returns integer
language plpgsql
immutable
set search_path = ''
as $$
declare
  cycle_match text[];
begin
  cycle_match := regexp_match(coalesce(p_cycle, ''), '^(\d{4})-(\d{4})-(1ST|2ND)$');
  if cycle_match is null then
    return null;
  end if;
  return cycle_match[1]::integer * 10 + case cycle_match[3] when '1ST' then 1 else 2 end;
end;
$$;

create or replace function public.academic_cycle_document_file(p_submission_id text, p_data jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_data->'file', '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
    'url', '/student/profile/documents/' || p_submission_id || '/content',
    'name', coalesce(p_data->>'name', p_data#>>'{file,name}'),
    'uploadedAt', coalesce(p_data->>'submittedAt', p_data->>'updatedAt'),
    'semesterTag', p_data->>'academicCycle',
    'submissionId', p_submission_id,
    'reviewStatus', coalesce(p_data->>'status', 'pending'),
    'documentKind', p_data->>'documentKind',
    'profileRevisionId', p_data->>'profileRevisionId'
  ));
$$;

create or replace function public.refresh_student_cycle_documents(p_cycle text, p_semester text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected integer := 0;
begin
  with ranked as (
    select d.id, d.data,
      d.data->>'studentId' as student_id,
      d.data->>'documentType' as document_type,
      row_number() over (
        partition by d.data->>'studentId', d.data->>'documentType'
        order by coalesce((d.data->>'version')::integer, 0) desc,
          coalesce(d.data->>'submittedAt', d.updated_at::text) desc, d.id desc
      ) as rank
    from public.student_document_submissions d
    where d.data->>'academicCycle' = p_cycle
      and d.data->>'documentType' in ('cor', 'rog', 'identity', 'profile')
  ), current_documents as (
    select student_id,
      jsonb_object_agg(document_type, public.academic_cycle_document_file(id, data)) as files,
      jsonb_object_agg(document_type, jsonb_build_object(
        'submissionId', id,
        'version', coalesce((data->>'version')::integer, 0),
        'status', coalesce(data->>'status', 'missing'),
        'reason', coalesce(data->>'rejectionReason', ''),
        'fieldErrors', coalesce(data->'fieldErrors', '{}'::jsonb)
      )) as verification
    from ranked where rank = 1 group by student_id
  )
  update public.students s
  set data = (
      s.data - array['corFile', 'cogFile', 'rogFile', 'schoolIdFile', 'scholarshipApplicationFile', 'applicationFormFile']
    )
    || case when coalesce(c.files ? 'cor', false) then jsonb_build_object('corFile', c.files->'cor') else '{}'::jsonb end
    || case when coalesce(c.files ? 'rog', false) then jsonb_build_object('cogFile', c.files->'rog', 'rogFile', c.files->'rog') else '{}'::jsonb end
    || case when coalesce(c.files ? 'identity', false) then jsonb_build_object('schoolIdFile', c.files->'identity') else '{}'::jsonb end
    || case when coalesce(c.files ? 'profile', false) then jsonb_build_object('scholarshipApplicationFile', c.files->'profile', 'applicationFormFile', c.files->'profile') else '{}'::jsonb end
    || jsonb_build_object('documentVerification', jsonb_build_object(
      'academicCycle', p_cycle,
      'requirements', jsonb_build_object(
        'academicCycle', p_cycle,
        'yearLevel', coalesce(s.data->>'year', ''),
        'semester', p_semester,
        'rogRequired', not (
          regexp_replace(lower(coalesce(s.data->>'year', '')), '[^a-z0-9]', '', 'g') in ('1', '1st', 'first', 'firstyear', 'year1')
          and p_semester = '1ST'
        ),
        'rogExemptionReason', case when
          regexp_replace(lower(coalesce(s.data->>'year', '')), '[^a-z0-9]', '', 'g') in ('1', '1st', 'first', 'firstyear', 'year1')
          and p_semester = '1ST' then 'first_year_first_semester' else '' end
      ),
      'cor', coalesce(c.verification->'cor', jsonb_build_object('status', 'missing')),
      'rog', case when
        regexp_replace(lower(coalesce(s.data->>'year', '')), '[^a-z0-9]', '', 'g') in ('1', '1st', 'first', 'firstyear', 'year1')
        and p_semester = '1ST' then jsonb_build_object('status', 'exempt', 'exemptionReason', 'first_year_first_semester')
        else coalesce(c.verification->'rog', jsonb_build_object('status', 'missing')) end,
      'identity', coalesce(c.verification->'identity', jsonb_build_object('status', 'missing')),
      'profile', coalesce(c.verification->'profile', jsonb_build_object('status', 'missing'))
    )),
    updated_at = now()
  from (select s2.id as student_id, d.files, d.verification from public.students s2 left join current_documents d on d.student_id = s2.id) c
  where c.student_id = s.id;

  get diagnostics affected = row_count;
  return affected;
end;
$$;

drop trigger if exists restart_scholarships_after_cycle_change on public.system_configuration;

create or replace function public.activate_academic_cycle(
  p_academic_year text,
  p_semester text,
  p_expected_current_cycle text,
  p_actor_id text,
  p_actor_type text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  config_row public.system_configuration%rowtype;
  previous_cycle text;
  target_cycle text;
  direction_value text;
  application_row public.scholarship_applications%rowtype;
  saved_snapshot public.scholarship_cycle_snapshots%rowtype;
  legacy_snapshot jsonb;
  restored_data jsonb;
  tracking_data jsonb;
  kept_steps jsonb;
  signed_submission_id text;
  signed_submission_status text;
  affected_count integer := 0;
  exact_count integer := 0;
  reconstructed_count integer := 0;
  now_text text := now()::text;
begin
  if p_academic_year !~ '^\d{4}-\d{4}$'
    or split_part(p_academic_year, '-', 2)::integer <> split_part(p_academic_year, '-', 1)::integer + 1
    or p_semester not in ('1ST', '2ND') then
    raise exception 'invalid_academic_cycle';
  end if;
  if nullif(trim(coalesce(p_actor_id, '')), '') is null or p_actor_type not in ('root', 'admin') then
    raise exception 'academic_cycle_actor_required';
  end if;

  select * into config_row from public.system_configuration where id = 'academic_cycle' for update;
  if not found then
    raise exception 'academic_cycle_not_configured';
  end if;
  previous_cycle := coalesce(config_row.data->>'semesterTag', concat(config_row.data->>'academicYear', '-', config_row.data->>'semester'));
  target_cycle := p_academic_year || '-' || p_semester;
  if coalesce(p_expected_current_cycle, '') <> previous_cycle then
    raise exception 'academic_cycle_changed';
  end if;
  if target_cycle = previous_cycle then
    return jsonb_build_object(
      'academicCycle', target_cycle, 'semesterTag', target_cycle,
      'previousCycle', previous_cycle, 'direction', 'unchanged',
      'affectedApplicationCount', 0, 'exactRestorationCount', 0, 'reconstructedCount', 0
    );
  end if;
  direction_value := case when public.academic_cycle_sort_key(target_cycle) < public.academic_cycle_sort_key(previous_cycle) then 'rollback' else 'forward' end;

  perform set_config('bulsuscholar.choice_write', 'true', true);

  insert into public.scholarship_cycle_snapshots(
    id, application_id, student_id, academic_cycle, application_data, snapshot_source, captured_at
  )
  select 'cycle_snapshot_' || md5(a.id || ':' || previous_cycle), a.id, a.student_id,
    previous_cycle, a.data, 'exact', now()
  from public.scholarship_applications a
  where nullif(a.student_id, '') is not null
    and lower(coalesce(a.status, a.data->>'status', '')) not in ('withdrawn', 'rejected', 'denied', 'cancelled', 'archived', 'expired')
  on conflict(application_id, academic_cycle) do update
    set application_data = excluded.application_data,
        snapshot_source = 'exact', captured_at = now();

  for application_row in
    select * from public.scholarship_applications a
    where nullif(a.student_id, '') is not null
      and lower(coalesce(a.status, a.data->>'status', '')) not in ('withdrawn', 'rejected', 'denied', 'cancelled', 'archived', 'expired')
    for update
  loop
    affected_count := affected_count + 1;
    saved_snapshot := null;
    legacy_snapshot := null;
    signed_submission_id := null;
    signed_submission_status := null;
    select * into saved_snapshot
      from public.scholarship_cycle_snapshots s
      where s.application_id = application_row.id and s.academic_cycle = target_cycle;

    if found then
      restored_data := saved_snapshot.application_data
        || jsonb_build_object('academicCycle', target_cycle, 'semesterTag', target_cycle, 'updatedAt', now_text);
      exact_count := exact_count + 1;
    else
      reconstructed_count := reconstructed_count + 1;
      tracking_data := coalesce(application_row.data->'tracking', '{}'::jsonb);
      select value into legacy_snapshot
      from jsonb_array_elements(coalesce(tracking_data->'cycleSnapshots', '[]'::jsonb)) value
      where value->>'academicCycle' = target_cycle
      order by coalesce(value->>'snapshottedAt', '') desc limit 1;

      if legacy_snapshot is not null then
        kept_steps := coalesce(legacy_snapshot->'completedStepIds', '[]'::jsonb);
      else
        select coalesce(jsonb_agg(value), '[]'::jsonb) into kept_steps
        from jsonb_array_elements(coalesce(tracking_data->'completedStepIds', '[]'::jsonb)) value
        where value #>> '{}' in ('account', 'announcement_apply', 'scholarship_apply', 'kwsp_apply');
      end if;

      select s.id, s.status into signed_submission_id, signed_submission_status
      from public.signed_soe_submissions s
      where s.application_id = application_row.id and s.academic_cycle = target_cycle
      order by s.version desc, s.created_at desc limit 1;
      if signed_submission_id is not null and signed_submission_status = 'submitted' then
        kept_steps := kept_steps || jsonb_build_array('signed_soe_upload', 'finish');
      end if;

      tracking_data := tracking_data || jsonb_build_object(
        'completedStepIds', kept_steps,
        'currentStepId', case when signed_submission_id is not null and signed_submission_status = 'submitted' then 'finish' else 'document_uploading' end,
        'semesterTag', target_cycle,
        'updatedAt', now_text
      );
      restored_data := (application_row.data - array['signedSoeSubmissionId', 'signedSoeStatus', 'signedSoeReopenReason', 'finishedAt'])
        || jsonb_build_object('academicCycle', target_cycle, 'semesterTag', target_cycle, 'tracking', tracking_data, 'updatedAt', now_text);
      if signed_submission_id is not null then
        restored_data := restored_data || jsonb_build_object(
          'signedSoeSubmissionId', signed_submission_id,
          'signedSoeStatus', signed_submission_status
        );
      end if;
    end if;

    update public.scholarship_applications
      set data = restored_data, updated_at = now()
      where id = application_row.id;

    insert into public.student_history_events(
      id, student_id, event_type, academic_cycle, occurred_at,
      related_type, related_id, route, description, safe_data
    ) values (
      'history_cycle_transition_' || md5(application_row.id || ':' || previous_cycle || ':' || target_cycle),
      application_row.student_id, 'academic_cycle_changed', target_cycle, now(),
      'application', application_row.id, '/student-dashboard/scholarships',
      case when direction_value = 'rollback' then 'A previous academic cycle was restored.' else 'A new academic cycle was activated.' end,
      jsonb_build_object('previousCycle', previous_cycle, 'direction', direction_value)
    ) on conflict(id) do nothing;
  end loop;

  update public.system_configuration
  set data = config_row.data || jsonb_build_object(
      'academicYear', p_academic_year,
      'semester', p_semester,
      'semesterTag', target_cycle,
      'activatedAt', now_text,
      'updatedAt', now_text,
      'updatedBy', p_actor_id,
      'updatedByType', p_actor_type
    ),
    updated_at = now()
  where id = 'academic_cycle';

  perform public.refresh_student_cycle_documents(target_cycle, p_semester);

  insert into public.academic_cycle_transition_events(
    previous_cycle, activated_cycle, direction, actor_id, actor_type,
    affected_application_count, exact_restoration_count, reconstructed_count, restoration_method
  ) values (
    previous_cycle, target_cycle, direction_value, p_actor_id, p_actor_type,
    affected_count, exact_count, reconstructed_count,
    case
      when exact_count > 0 and reconstructed_count > 0 then 'mixed'
      when exact_count > 0 then 'exact'
      else 'reconstructed'
    end
  );

  return jsonb_build_object(
    'academicCycle', target_cycle,
    'semesterTag', target_cycle,
    'previousCycle', previous_cycle,
    'direction', direction_value,
    'affectedApplicationCount', affected_count,
    'exactRestorationCount', exact_count,
    'reconstructedCount', reconstructed_count,
    'restorationMethod', case
      when exact_count > 0 and reconstructed_count > 0 then 'mixed'
      when exact_count > 0 then 'exact'
      else 'reconstructed'
    end,
    'academicYear', p_academic_year,
    'semester', p_semester,
    'activatedAt', now_text,
    'updatedBy', p_actor_id,
    'updatedByType', p_actor_type
  );
end;
$$;

insert into public.scholarship_cycle_snapshots(
  id, application_id, student_id, academic_cycle, application_data, snapshot_source, captured_at
)
select 'cycle_snapshot_' || md5(a.id || ':' || coalesce(c.data->>'semesterTag', concat(c.data->>'academicYear', '-', c.data->>'semester'))),
  a.id, a.student_id, coalesce(c.data->>'semesterTag', concat(c.data->>'academicYear', '-', c.data->>'semester')), a.data, 'initial_baseline', now()
from public.scholarship_applications a
cross join public.system_configuration c
where c.id = 'academic_cycle'
  and nullif(coalesce(c.data->>'semesterTag', concat(c.data->>'academicYear', '-', c.data->>'semester')), '') is not null
  and nullif(a.student_id, '') is not null
  and lower(coalesce(a.status, a.data->>'status', '')) not in ('withdrawn', 'rejected', 'denied', 'cancelled', 'archived', 'expired')
on conflict(application_id, academic_cycle) do nothing;

revoke all on function public.academic_cycle_sort_key(text) from public, anon, authenticated;
revoke all on function public.academic_cycle_document_file(text, jsonb) from public, anon, authenticated;
revoke all on function public.refresh_student_cycle_documents(text, text) from public, anon, authenticated;
revoke all on function public.activate_academic_cycle(text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.activate_academic_cycle(text, text, text, text, text) to service_role;

notify pgrst, 'reload schema';
