-- Normalize scholarship workflow records while preserving compatibility data.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.student_scholarship_migration_backup (
  student_id text primary key,
  scholarship_data jsonb not null,
  captured_at timestamptz not null default now()
);
revoke all on private.student_scholarship_migration_backup from public, anon, authenticated;

insert into private.student_scholarship_migration_backup(student_id, scholarship_data)
select id, jsonb_strip_nulls(jsonb_build_object(
  'scholarships', data->'scholarships',
  'scholarshipApplicationHistory', data->'scholarshipApplicationHistory',
  'previousScholars', data->'previousScholars',
  'scholarshipCommitment', data->'scholarshipCommitment',
  'scholarshipInvitations', data->'scholarshipInvitations',
  'rosterAssignmentState', data->'rosterAssignmentState',
  'rosterDecisionPending', data->'rosterDecisionPending',
  'rosterMatchCount', data->'rosterMatchCount',
  'rosterMatchNotice', data->'rosterMatchNotice',
  'rosterScholarshipChoice', data->'rosterScholarshipChoice',
  'scholarshipConflictMessage', data->'scholarshipConflictMessage',
  'scholarshipConflictWarning', data->'scholarshipConflictWarning',
  'scholarshipRestrictionReason', data->'scholarshipRestrictionReason',
  'scholarshipLifecycleVersion', data->'scholarshipLifecycleVersion',
  'scholarshipApplicationFile', data->'scholarshipApplicationFile',
  'applicationFormFile', data->'applicationFormFile'
))
from public.students
on conflict(student_id) do nothing;

alter table public.scholarship_applications
  add column if not exists student_id text,
  add column if not exists grantor_id text,
  add column if not exists scholarship_id text,
  add column if not exists academic_cycle text,
  add column if not exists status text,
  add column if not exists closed_at timestamptz;

create or replace function public.sync_scholarship_application_columns()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  closed_value text;
begin
  new.student_id := coalesce(nullif(new.data->>'studentId', ''), nullif(new.data->>'studentNumber', ''), new.student_id);
  new.grantor_id := coalesce(nullif(new.data->>'grantorId', ''), nullif(new.data->>'providerId', ''), new.grantor_id);
  new.scholarship_id := coalesce(nullif(new.data->>'scholarshipId', ''), nullif(new.data->>'announcementId', ''), new.scholarship_id);
  new.academic_cycle := coalesce(nullif(new.data->>'academicCycle', ''), nullif(new.data->>'semesterTag', ''), new.academic_cycle);
  new.status := coalesce(nullif(new.data->>'status', ''), new.status, 'Unknown');
  closed_value := coalesce(nullif(new.data->>'closedAt', ''), nullif(new.data->>'archivedAt', ''), nullif(new.data->>'withdrawnAt', ''), nullif(new.data->>'rejectedAt', ''));
  if closed_value ~ '^\d{4}-\d{2}-\d{2}T' then
    begin new.closed_at := closed_value::timestamptz; exception when others then new.closed_at := null; end;
  elsif public.scholarship_application_open(new.data) then
    new.closed_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_scholarship_application_relational_columns on public.scholarship_applications;
create trigger sync_scholarship_application_relational_columns
before insert or update on public.scholarship_applications
for each row execute function public.sync_scholarship_application_columns();

select set_config('bulsuscholar.choice_write', 'true', true);

with embedded as (
  select s.id as student_id, entry.value as application_data
  from public.students s
  cross join lateral jsonb_array_elements(coalesce(s.data->'scholarships', '[]'::jsonb)) entry
  union all
  select s.id, entry.value
  from public.students s
  cross join lateral jsonb_array_elements(coalesce(s.data->'scholarshipApplicationHistory', '[]'::jsonb)) entry
  union all
  select s.id, entry.value
  from public.students s
  cross join lateral jsonb_array_elements(coalesce(s.data->'previousScholars', '[]'::jsonb)) entry
), normalized as (
  select student_id,
    coalesce(
      nullif(application_data->>'applicationId', ''),
      nullif(application_data->>'id', ''),
      'legacy_' || md5(student_id || ':' || coalesce(application_data->>'applicationNumber', '') || ':' || coalesce(application_data->>'grantorId', application_data->>'providerId', '') || ':' || coalesce(application_data->>'createdAt', ''))
    ) as application_id,
    application_data
  from embedded
)
insert into public.scholarship_applications(id, data, updated_at)
select application_id,
  application_data || jsonb_build_object(
    'id', application_id,
    'applicationId', application_id,
    'studentId', student_id
  ),
  now()
from normalized
where nullif(student_id, '') is not null
on conflict(id) do nothing;

update public.scholarship_applications
set data = data,
    updated_at = updated_at;

alter table public.scholarship_applications
  alter column student_id set not null,
  alter column grantor_id set not null,
  alter column scholarship_id set not null,
  alter column status set not null;

alter table public.scholarship_applications
  drop constraint if exists scholarship_applications_student_fk;
alter table public.scholarship_applications
  add constraint scholarship_applications_student_fk
  foreign key(student_id) references public.students(id) on delete restrict not valid;
alter table public.scholarship_applications validate constraint scholarship_applications_student_fk;

create index if not exists scholarship_applications_student_timeline_idx
  on public.scholarship_applications(student_id, updated_at desc, id desc);
create index if not exists scholarship_applications_student_status_idx
  on public.scholarship_applications(student_id, status);
create index if not exists scholarship_applications_grantor_status_idx
  on public.scholarship_applications(grantor_id, status);
create index if not exists scholarship_applications_cycle_idx
  on public.scholarship_applications(academic_cycle) where academic_cycle is not null;

create table if not exists public.student_scholarship_state (
  id text primary key,
  student_id text not null unique references public.students(id) on delete restrict,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.student_scholarship_state enable row level security;
revoke all on public.student_scholarship_state from public, anon, authenticated;
grant select, insert, update, delete on public.student_scholarship_state to service_role;

insert into public.student_scholarship_state(id, student_id, data, updated_at)
select id, id, jsonb_strip_nulls(jsonb_build_object(
  'scholarshipCommitment', data->'scholarshipCommitment',
  'rosterAssignmentState', data->'rosterAssignmentState',
  'rosterDecisionPending', data->'rosterDecisionPending',
  'rosterMatchCount', data->'rosterMatchCount',
  'rosterMatchNotice', data->'rosterMatchNotice',
  'rosterScholarshipChoice', data->'rosterScholarshipChoice',
  'scholarshipConflictMessage', data->'scholarshipConflictMessage',
  'scholarshipConflictWarning', data->'scholarshipConflictWarning',
  'scholarshipRestrictionReason', data->'scholarshipRestrictionReason',
  'scholarshipLifecycleVersion', data->'scholarshipLifecycleVersion'
)), now()
from public.students
on conflict(id) do update
set data = public.student_scholarship_state.data || excluded.data,
    updated_at = now();

create table if not exists public.student_scholarship_invitations (
  id text primary key,
  student_id text not null references public.students(id) on delete restrict,
  grantor_id text not null,
  scholarship_id text,
  status text not null default 'Pending',
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.student_scholarship_invitations enable row level security;
revoke all on public.student_scholarship_invitations from public, anon, authenticated;
grant select, insert, update, delete on public.student_scholarship_invitations to service_role;
create index if not exists student_scholarship_invitations_student_status_idx
  on public.student_scholarship_invitations(student_id, status, updated_at desc);
create index if not exists student_scholarship_invitations_grantor_status_idx
  on public.student_scholarship_invitations(grantor_id, status);

insert into public.student_scholarship_invitations(id, student_id, grantor_id, scholarship_id, status, data, updated_at)
select coalesce(nullif(invitation.value->>'id', ''), 'legacy_invitation_' || md5(student.id || ':' || invitation.ordinality::text)),
  student.id,
  coalesce(nullif(invitation.value->>'grantorId', ''), nullif(invitation.value->>'providerId', ''), 'unknown'),
  coalesce(nullif(invitation.value->>'scholarshipId', ''), nullif(invitation.value->>'announcementId', '')),
  coalesce(nullif(invitation.value->>'status', ''), 'Pending'),
  invitation.value || jsonb_build_object('studentId', student.id),
  now()
from public.students student
cross join lateral jsonb_array_elements(coalesce(student.data->'scholarshipInvitations', '[]'::jsonb))
  with ordinality invitation(value, ordinality)
on conflict(id) do update
set data = public.student_scholarship_invitations.data || excluded.data,
    status = excluded.status,
    updated_at = now();

-- During the compatibility release, older screens can still submit embedded
-- scholarship fields. Persist them atomically without writing them back into
-- students.data. Closed applications remain immutable.
create or replace function public.persist_student_scholarship_compatibility(
  p_student_id text,
  p_payload jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  entry jsonb;
  application_id text;
  invitation_id text;
  existing_application jsonb;
  state_patch jsonb;
  applications_written integer := 0;
  invitations_written integer := 0;
begin
  if nullif(trim(coalesce(p_student_id, '')), '') is null
    or not exists (select 1 from public.students where id = p_student_id) then
    raise exception 'student_not_found';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('student-scholarship:' || p_student_id, 0));
  perform set_config('bulsuscholar.choice_write', 'true', true);

  for entry in
    select value
    from jsonb_array_elements(
      coalesce(p_payload->'scholarships', '[]'::jsonb)
      || coalesce(p_payload->'scholarshipApplicationHistory', '[]'::jsonb)
      || coalesce(p_payload->'previousScholars', '[]'::jsonb)
    )
  loop
    if jsonb_typeof(entry) <> 'object' then
      continue;
    end if;
    application_id := coalesce(
      nullif(entry->>'applicationId', ''),
      nullif(entry->>'id', ''),
      'legacy_' || md5(p_student_id || ':' || coalesce(entry->>'applicationNumber', '') || ':' || coalesce(entry->>'grantorId', entry->>'providerId', '') || ':' || coalesce(entry->>'createdAt', ''))
    );
    select data into existing_application
    from public.scholarship_applications
    where id = application_id
    for update;

    if existing_application is null then
      insert into public.scholarship_applications(id, data, updated_at)
      values (
        application_id,
        entry || jsonb_build_object('id', application_id, 'applicationId', application_id, 'studentId', p_student_id),
        now()
      );
      applications_written := applications_written + 1;
    elsif public.scholarship_application_open(existing_application) then
      update public.scholarship_applications
      set data = existing_application || entry || jsonb_build_object(
            'id', application_id,
            'applicationId', application_id,
            'studentId', p_student_id
          ),
          updated_at = now()
      where id = application_id;
      applications_written := applications_written + 1;
    end if;
  end loop;

  for entry in
    select value
    from jsonb_array_elements(coalesce(p_payload->'scholarshipInvitations', '[]'::jsonb))
  loop
    if jsonb_typeof(entry) <> 'object' then
      continue;
    end if;
    invitation_id := coalesce(
      nullif(entry->>'id', ''),
      'legacy_invitation_' || md5(p_student_id || ':' || entry::text)
    );
    insert into public.student_scholarship_invitations(
      id, student_id, grantor_id, scholarship_id, status, data, updated_at
    ) values (
      invitation_id,
      p_student_id,
      coalesce(nullif(entry->>'grantorId', ''), nullif(entry->>'providerId', ''), 'unknown'),
      coalesce(nullif(entry->>'scholarshipId', ''), nullif(entry->>'announcementId', '')),
      coalesce(nullif(entry->>'status', ''), 'Pending'),
      entry || jsonb_build_object('id', invitation_id, 'studentId', p_student_id),
      now()
    )
    on conflict(id) do update
    set grantor_id = excluded.grantor_id,
        scholarship_id = excluded.scholarship_id,
        status = excluded.status,
        data = public.student_scholarship_invitations.data || excluded.data,
        updated_at = now();
    invitations_written := invitations_written + 1;
  end loop;

  state_patch := jsonb_strip_nulls(jsonb_build_object(
    'scholarshipCommitment', p_payload->'scholarshipCommitment',
    'rosterAssignmentState', p_payload->'rosterAssignmentState',
    'rosterDecisionPending', p_payload->'rosterDecisionPending',
    'rosterMatchCount', p_payload->'rosterMatchCount',
    'rosterMatchNotice', p_payload->'rosterMatchNotice',
    'rosterScholarshipChoice', p_payload->'rosterScholarshipChoice',
    'scholarshipConflictMessage', p_payload->'scholarshipConflictMessage',
    'scholarshipConflictWarning', p_payload->'scholarshipConflictWarning',
    'scholarshipRestrictionReason', p_payload->'scholarshipRestrictionReason',
    'scholarshipLifecycleVersion', p_payload->'scholarshipLifecycleVersion'
  ));
  if state_patch <> '{}'::jsonb then
    insert into public.student_scholarship_state(id, student_id, data, updated_at)
    values (p_student_id, p_student_id, state_patch, now())
    on conflict(id) do update
    set data = public.student_scholarship_state.data || excluded.data,
        updated_at = now();
  end if;

  return jsonb_build_object(
    'studentId', p_student_id,
    'applicationsWritten', applications_written,
    'invitationsWritten', invitations_written
  );
end;
$$;

-- Preserve legacy profile-file references as immutable imported revisions when
-- they are not already backed by the profile revision workflow.
insert into public.student_profile_revisions(id, data, updated_at)
select 'legacy_profile_' || md5(student.id || ':' || coalesce(student.data#>>'{scholarshipApplicationFile,path}', student.data#>>'{scholarshipApplicationFile,url}', student.id)),
  jsonb_build_object(
    'studentId', student.id,
    'academicCycle', coalesce(student.data#>>'{scholarshipApplicationFile,semesterTag}', 'legacy'),
    'version', 0,
    'status', coalesce(student.data#>>'{scholarshipApplicationFile,reviewStatus}', 'approved'),
    'profile', '{}'::jsonb,
    'signature', null,
    'pdf', student.data->'scholarshipApplicationFile',
    'requirementsSnapshot', '{}'::jsonb,
    'submittedAt', coalesce(student.data#>>'{scholarshipApplicationFile,uploadedAt}', student.updated_at::text),
    'updatedAt', student.updated_at::text,
    'source', 'legacy_student_record'
  ),
  now()
from public.students student
where jsonb_typeof(student.data->'scholarshipApplicationFile') = 'object'
  and coalesce(
    nullif(student.data#>>'{scholarshipApplicationFile,path}', ''),
    nullif(student.data#>>'{scholarshipApplicationFile,url}', '')
  ) is not null
  and not exists (
    select 1 from public.student_profile_revisions revision
    where revision.id = student.data#>>'{scholarshipApplicationFile,profileRevisionId}'
  )
on conflict(id) do nothing;

insert into public.student_document_submissions(id, data, updated_at)
select 'legacy_profile_submission_' || md5(student.id || ':' || coalesce(student.data#>>'{scholarshipApplicationFile,path}', student.data#>>'{scholarshipApplicationFile,url}', student.id)),
  jsonb_build_object(
    'studentId', student.id,
    'documentType', 'profile',
    'name', coalesce(student.data#>>'{scholarshipApplicationFile,name}', 'Student Application Profile.pdf'),
    'academicCycle', coalesce(student.data#>>'{scholarshipApplicationFile,semesterTag}', 'legacy'),
    'status', coalesce(student.data#>>'{scholarshipApplicationFile,reviewStatus}', 'approved'),
    'file', student.data->'scholarshipApplicationFile',
    'profileRevisionId', 'legacy_profile_' || md5(student.id || ':' || coalesce(student.data#>>'{scholarshipApplicationFile,path}', student.data#>>'{scholarshipApplicationFile,url}', student.id)),
    'submittedAt', coalesce(student.data#>>'{scholarshipApplicationFile,uploadedAt}', student.updated_at::text),
    'updatedAt', student.updated_at::text,
    'source', 'legacy_student_record'
  ),
  now()
from public.students student
where jsonb_typeof(student.data->'scholarshipApplicationFile') = 'object'
  and coalesce(
    nullif(student.data#>>'{scholarshipApplicationFile,path}', ''),
    nullif(student.data#>>'{scholarshipApplicationFile,url}', '')
  ) is not null
  and not exists (
    select 1 from public.student_document_submissions submission
    where submission.data->>'profileRevisionId' = student.data#>>'{scholarshipApplicationFile,profileRevisionId}'
       or submission.data->'file'->>'path' = student.data#>>'{scholarshipApplicationFile,path}'
  )
on conflict(id) do nothing;

revoke all on function public.sync_scholarship_application_columns() from public, anon, authenticated;
grant execute on function public.sync_scholarship_application_columns() to service_role;
revoke all on function public.persist_student_scholarship_compatibility(text, jsonb) from public, anon, authenticated;
grant execute on function public.persist_student_scholarship_compatibility(text, jsonb) to service_role;
grant select, insert, update, delete on public.scholarship_applications to service_role;
revoke all on public.scholarship_applications from public, anon, authenticated;
