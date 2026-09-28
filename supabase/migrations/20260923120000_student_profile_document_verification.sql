-- Server-owned student profile drafts, immutable revisions, and document reviews.

create table if not exists public.student_profile_drafts (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.student_profile_revisions (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.student_document_submissions (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.student_document_reviews (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.student_document_exceptions (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.student_profile_application_snapshots (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.student_next_action_events (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists student_profile_revisions_queue_idx
  on public.student_profile_revisions ((data->>'status'), (data->>'academicCycle'), updated_at);
create index if not exists student_document_submissions_queue_idx
  on public.student_document_submissions ((data->>'status'), (data->>'academicCycle'), (data->>'documentType'), updated_at);
create index if not exists student_document_submissions_student_idx
  on public.student_document_submissions ((data->>'studentId'), (data->>'academicCycle'), (data->>'documentType'), ((data->>'version')::integer) desc);
create index if not exists student_document_reviews_submission_idx
  on public.student_document_reviews ((data->>'submissionId'), created_at desc);
create index if not exists student_document_exceptions_student_idx
  on public.student_document_exceptions ((data->>'studentId'), (data->>'academicCycle'), (data->>'exceptionType'), (data->>'status'));

alter table public.student_profile_drafts enable row level security;
alter table public.student_profile_revisions enable row level security;
alter table public.student_document_submissions enable row level security;
alter table public.student_document_reviews enable row level security;
alter table public.student_document_exceptions enable row level security;
alter table public.student_profile_application_snapshots enable row level security;
alter table public.student_next_action_events enable row level security;

revoke all on public.student_profile_drafts from public, anon, authenticated;
revoke all on public.student_profile_revisions from public, anon, authenticated;
revoke all on public.student_document_submissions from public, anon, authenticated;
revoke all on public.student_document_reviews from public, anon, authenticated;
revoke all on public.student_document_exceptions from public, anon, authenticated;
revoke all on public.student_profile_application_snapshots from public, anon, authenticated;
revoke all on public.student_next_action_events from public, anon, authenticated;

grant select, insert, update, delete on public.student_profile_drafts to service_role;
grant select, insert, update, delete on public.student_profile_revisions to service_role;
grant select, insert, update, delete on public.student_document_submissions to service_role;
grant select, insert on public.student_document_reviews to service_role;
grant select, insert, update on public.student_document_exceptions to service_role;
grant select, insert on public.student_profile_application_snapshots to service_role;
grant select, insert on public.student_next_action_events to service_role;

create or replace function public.protect_student_document_submission_content()
returns trigger language plpgsql set search_path = '' as $$
declare
  mutable_keys text[] := array[
    'status', 'rejectionReason', 'reviewNotes', 'fieldErrors',
    'reviewedBy', 'reviewedAt', 'updatedAt'
  ];
begin
  if (old.data - mutable_keys) is distinct from (new.data - mutable_keys) then
    raise exception 'submitted student document content is immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_student_profile_revision_content on public.student_profile_revisions;
create trigger protect_student_profile_revision_content
before update on public.student_profile_revisions
for each row execute function public.protect_student_document_submission_content();

drop trigger if exists protect_student_document_submission_content on public.student_document_submissions;
create trigger protect_student_document_submission_content
before update on public.student_document_submissions
for each row execute function public.protect_student_document_submission_content();

revoke all on function public.protect_student_document_submission_content()
  from public, anon, authenticated;

insert into public.system_configuration (id, data, updated_at)
values ('document_policy', jsonb_build_object('corMode', 'cor_only'), now())
on conflict (id) do update set data = public.system_configuration.data ||
  jsonb_build_object('corMode', coalesce(public.system_configuration.data->>'corMode', 'cor_only')),
  updated_at = now();

-- Keep old student fields readable while making review state authoritative.
update public.students
set data = data || jsonb_build_object(
  'permanentAddress', coalesce(data->'permanentAddress', jsonb_build_object(
    'street', coalesce(data->>'street', ''),
    'barangay', coalesce(data->>'barangay', ''),
    'city', coalesce(data->>'city', ''),
    'province', coalesce(data->>'province', ''),
    'postalCode', coalesce(data->>'postalCode', '')
  )),
  'currentAddress', coalesce(data->'currentAddress', '{}'::jsonb),
  'documentVerification', coalesce(data->'documentVerification', '{}'::jsonb)
), updated_at = now();

create or replace function public.scholarship_documents_complete_for_application(
  p_student jsonb, p_application jsonb
) returns boolean language sql stable set search_path = '' as $$
  select
    coalesce(p_student#>>'{documentVerification,cor,status}', '') = 'approved'
    and (
      coalesce(p_student#>>'{documentVerification,rog,status}', '') = 'approved'
      or coalesce(p_student#>>'{documentVerification,rog,exemptionReason}', '') = 'first_year_first_semester'
    )
    and coalesce(p_student#>>'{documentVerification,identity,status}', '') = 'approved'
    and coalesce(p_student#>>'{documentVerification,profile,status}', '') = 'approved'
    and coalesce(p_student#>>'{documentVerification,academicCycle}', '') =
      coalesce(p_application->>'semesterTag', p_student#>>'{documentVerification,academicCycle}', '');
$$;

revoke all on function public.scholarship_documents_complete_for_application(jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.scholarship_documents_complete_for_application(jsonb, jsonb)
  to service_role;

-- Existing scholarship RPCs ask this helper for a ROG URL. Return a derived
-- exemption marker without creating a fake upload or submission record.
create or replace function public.scholarship_document_url(p_student jsonb, p_keys text[])
returns text language sql immutable set search_path = '' as $$
  select coalesce(
    (select coalesce(nullif(p_student->k.key->>'url', ''),
      case when jsonb_typeof(p_student->k.key) = 'string' then p_student->>k.key else null end)
     from unnest(p_keys) with ordinality k(key, position)
     where coalesce(nullif(p_student->k.key->>'url', ''),
       case when jsonb_typeof(p_student->k.key) = 'string' then p_student->>k.key else null end) is not null
     order by k.position limit 1),
    case when p_keys && array['rogFile','cogFile','rogDocument','cogDocument','rog','cog']
      and p_student#>>'{documentVerification,rog,exemptionReason}' = 'first_year_first_semester'
      then 'exempt:first_year_first_semester' else null end
  );
$$;

create or replace function public.scholarship_document_versions(p_student jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
  from jsonb_each(p_student)
  where key in ('corFile', 'corDocument', 'cor', 'rogFile', 'cogFile',
    'rogDocument', 'cogDocument', 'rog', 'cog', 'schoolIdFile',
    'studentIdFile', 'validIdFile', 'idFile', 'documentVerification');
$$;

create or replace function public.complete_approved_student_document_reviews()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  application_row record;
  tracking_data jsonb;
  completed_steps jsonb;
  now_text text := now()::text;
begin
  if new.data->'documentVerification' is not distinct from old.data->'documentVerification' then
    return new;
  end if;

  for application_row in
    select id, data from public.scholarship_applications
    where data->>'studentId' = new.id and public.scholarship_application_open(data)
  loop
    if public.scholarship_documents_complete_for_application(new.data, application_row.data) then
      tracking_data := coalesce(application_row.data->'tracking', '{}'::jsonb);
      completed_steps := coalesce(tracking_data->'completedStepIds', '[]'::jsonb);
      if not completed_steps ? 'document_review' then
        completed_steps := completed_steps || '"document_review"'::jsonb;
        tracking_data := tracking_data || jsonb_build_object(
          'completedStepIds', completed_steps,
          'currentStepId', case
            when lower(coalesce(application_row.data->>'providerType', '')) = 'kuya_win'
              then 'admin_review'
            else 'request_materials'
          end,
          'updatedAt', now_text,
          'history', coalesce(tracking_data->'history', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
            'stepId', 'document_review',
            'stepLabel', 'Document Review',
            'completedBy', 'authorized_document_review',
            'completedAt', now_text,
            'semesterTag', new.data#>>'{documentVerification,academicCycle}'
          ))
        );
        update public.scholarship_applications
        set data = application_row.data || jsonb_build_object(
          'tracking', tracking_data,
          'reviewedDocumentVersions', public.scholarship_document_versions(new.data),
          'documentReviewCompletedAt', now_text,
          'documentReviewSource', 'student_document_reviews'
        ), updated_at = now()
        where id = application_row.id;
      end if;
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists complete_approved_student_document_reviews on public.students;
create trigger complete_approved_student_document_reviews
after update of data on public.students
for each row execute function public.complete_approved_student_document_reviews();

revoke all on function public.scholarship_document_url(jsonb, text[]) from public, anon, authenticated;
revoke all on function public.scholarship_document_versions(jsonb) from public, anon, authenticated;
revoke all on function public.complete_approved_student_document_reviews() from public, anon, authenticated;
grant execute on function public.scholarship_document_url(jsonb, text[]) to service_role;
grant execute on function public.scholarship_document_versions(jsonb) to service_role;
