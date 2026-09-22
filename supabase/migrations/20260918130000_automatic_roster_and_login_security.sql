begin;

-- Server-owned login state. The browser must never read or mutate this table.
create table if not exists public.login_security_state (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  account_type text not null check (account_type in ('student', 'grantor', 'admin')),
  account_id text not null,
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  blocked_at timestamptz,
  blocked_reason text,
  last_failed_at timestamptz,
  last_succeeded_at timestamptz,
  unblocked_at timestamptz,
  unblocked_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_type, account_id)
);

create index if not exists login_security_blocked_idx
  on public.login_security_state(blocked_at) where blocked_at is not null;

alter table public.login_security_state enable row level security;
revoke all on public.login_security_state from public, anon, authenticated;
grant select, insert, update, delete on public.login_security_state to service_role;

create table if not exists public.portal_recovery_challenges (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  token_hash text not null,
  password_hash_at_issue text not null,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null
);
alter table public.portal_recovery_challenges enable row level security;
revoke all on public.portal_recovery_challenges from public, anon, authenticated;

create or replace function public.issue_portal_recovery_challenge(
  p_auth_user_id uuid,
  p_token_hash text,
  p_account_type text,
  p_account_id text
) returns void
language plpgsql security definer set search_path = ''
as $$
declare current_password_hash text;
begin
  select encrypted_password into current_password_hash from auth.users
    where id = p_auth_user_id for update;
  if current_password_hash is null or length(p_token_hash) <> 64
    or p_account_type not in ('student', 'grantor')
    or nullif(trim(p_account_id), '') is null then
    raise exception 'invalid_recovery_challenge';
  end if;
  insert into public.login_security_state(auth_user_id, account_type, account_id)
    values (p_auth_user_id, p_account_type, p_account_id)
    on conflict(auth_user_id) do nothing;
  insert into public.portal_recovery_challenges(
    auth_user_id, token_hash, password_hash_at_issue, issued_at, expires_at
  ) values (p_auth_user_id, p_token_hash, current_password_hash, now(), now() + interval '30 minutes')
  on conflict(auth_user_id) do update set
    token_hash = excluded.token_hash,
    password_hash_at_issue = excluded.password_hash_at_issue,
    issued_at = excluded.issued_at,
    expires_at = excluded.expires_at;
end;
$$;

create or replace function public.complete_portal_recovery_challenge(
  p_auth_user_id uuid,
  p_token_hash text
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  challenge_row public.portal_recovery_challenges%rowtype;
  current_password_hash text;
  account_kind text;
begin
  select encrypted_password into current_password_hash from auth.users
    where id = p_auth_user_id for update;
  select account_type into account_kind from public.login_security_state
    where auth_user_id = p_auth_user_id for update;
  if account_kind is null or account_kind not in ('student', 'grantor') then
    raise exception 'recovery_not_available';
  end if;
  select * into challenge_row from public.portal_recovery_challenges
    where auth_user_id = p_auth_user_id for update;
  if not found or challenge_row.expires_at <= now()
    or challenge_row.token_hash <> p_token_hash then
    raise exception 'invalid_or_expired_recovery_challenge';
  end if;
  if current_password_hash is not distinct from challenge_row.password_hash_at_issue then
    raise exception 'password_not_changed';
  end if;
  update public.login_security_state set failed_attempts = 0, blocked_at = null,
    blocked_reason = null, unblocked_at = now(), unblocked_by = 'verified_password_recovery',
    updated_at = now() where auth_user_id = p_auth_user_id;
  delete from auth.sessions where user_id = p_auth_user_id;
  delete from public.portal_recovery_challenges where auth_user_id = p_auth_user_id;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.issue_portal_recovery_challenge(uuid,text,text,text) from public, anon, authenticated;
revoke all on function public.complete_portal_recovery_challenge(uuid,text) from public, anon, authenticated;
grant execute on function public.issue_portal_recovery_challenge(uuid,text,text,text) to service_role;
grant execute on function public.complete_portal_recovery_challenge(uuid,text) to service_role;

insert into public.system_configuration(id, data, updated_at)
values ('portal_security', jsonb_build_object('loginAttemptLimit', 3), now())
on conflict(id) do update set
  data = public.system_configuration.data || jsonb_build_object(
    'loginAttemptLimit', greatest(3, least(10,
      coalesce((public.system_configuration.data->>'loginAttemptLimit')::integer, 3)))
  ),
  updated_at = now();

create or replace function public.record_portal_login_attempt(
  p_auth_user_id uuid,
  p_account_type text,
  p_account_id text,
  p_succeeded boolean
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  security_row public.login_security_state%rowtype;
  attempt_limit integer;
begin
  if p_auth_user_id is null or p_account_type not in ('student', 'grantor', 'admin')
    or nullif(trim(p_account_id), '') is null then
    raise exception 'invalid_login_security_identity';
  end if;

  select greatest(3, least(10, coalesce((data->>'loginAttemptLimit')::integer, 3)))
    into attempt_limit from public.system_configuration where id = 'portal_security';
  attempt_limit := coalesce(attempt_limit, 3);

  insert into public.login_security_state(auth_user_id, account_type, account_id)
  values(p_auth_user_id, p_account_type, p_account_id)
  on conflict(auth_user_id) do nothing;

  select * into security_row from public.login_security_state
    where auth_user_id = p_auth_user_id for update;

  if p_succeeded then
    if security_row.blocked_at is null then
      update public.login_security_state set
        failed_attempts = 0,
        last_succeeded_at = now(),
        updated_at = now()
      where auth_user_id = p_auth_user_id returning * into security_row;
    end if;
  elsif security_row.blocked_at is null then
    update public.login_security_state set
      failed_attempts = failed_attempts + 1,
      last_failed_at = now(),
      blocked_at = case when failed_attempts + 1 >= attempt_limit then now() else null end,
      blocked_reason = case when failed_attempts + 1 >= attempt_limit then 'failed_login_limit' else null end,
      updated_at = now()
    where auth_user_id = p_auth_user_id returning * into security_row;
    if security_row.blocked_at is not null then
      -- Equivalent to a global Auth sign-out for this user: refresh sessions are
      -- revoked immediately, while backend authorization rejects any remaining
      -- short-lived access token by consulting login_security_state.
      delete from auth.sessions where user_id = p_auth_user_id;
    end if;
  end if;

  return jsonb_build_object(
    'failedAttempts', security_row.failed_attempts,
    'attemptLimit', attempt_limit,
    'blocked', security_row.blocked_at is not null,
    'blockedAt', security_row.blocked_at,
    'remainingAttempts', greatest(0, attempt_limit - security_row.failed_attempts)
  );
end;
$$;

create or replace function public.unblock_portal_account(
  p_auth_user_id uuid,
  p_unblocked_by text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare security_row public.login_security_state%rowtype;
begin
  update public.login_security_state set
    failed_attempts = 0,
    blocked_at = null,
    blocked_reason = null,
    unblocked_at = now(),
    unblocked_by = nullif(trim(p_unblocked_by), ''),
    updated_at = now()
  where auth_user_id = p_auth_user_id returning * into security_row;
  if not found then raise exception 'login_security_record_not_found'; end if;
  return jsonb_build_object('accountType', security_row.account_type,
    'accountId', security_row.account_id, 'blocked', false);
end;
$$;

revoke all on function public.record_portal_login_attempt(uuid,text,text,boolean) from public, anon, authenticated;
revoke all on function public.unblock_portal_account(uuid,text) from public, anon, authenticated;
grant execute on function public.record_portal_login_attempt(uuid,text,text,boolean) to service_role;
grant execute on function public.unblock_portal_account(uuid,text) to service_role;

create or replace function public.authoritative_roster_tracking(
  p_provider_type text,
  p_scholarship_name text,
  p_completed boolean default false
) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  apply_step text := case when lower(coalesce(p_provider_type, '')) in ('kuya_win', 'kwsp')
    then 'kwsp_apply' else 'scholarship_apply' end;
  step_ids text[];
  step_id text;
  history_data jsonb := '[]'::jsonb;
  now_text text := now()::text;
begin
  step_ids := case when p_completed then
    case when apply_step = 'kwsp_apply'
      then array['account','kwsp_apply','document_uploading','application_form','document_review',
        'admin_review','interview','application_review','final_screening','request_materials',
        'download_materials','signing_materials','finish']
      else array['account','scholarship_apply','document_uploading','application_form','document_review',
        'request_materials','download_materials','signing_materials','finish'] end
    else array['account', apply_step] end;

  foreach step_id in array step_ids loop
    history_data := history_data || jsonb_build_array(jsonb_build_object(
      'stepId', step_id,
      'label', case step_id
        when 'account' then 'Creation of Account'
        when 'scholarship_apply' then 'Application for ' || coalesce(p_scholarship_name, 'Scholarship')
        when 'kwsp_apply' then 'Application for ' || coalesce(p_scholarship_name, 'Scholarship')
        when 'document_uploading' then 'Uploading of Document'
        when 'application_form' then 'Student Application Profile'
        when 'document_review' then 'Document Review'
        when 'admin_review' then 'Admin Review'
        when 'interview' then 'Interview'
        when 'application_review' then 'Application Review'
        when 'final_screening' then 'Final Screening'
        when 'request_materials' then 'Request Materials'
        when 'download_materials' then 'Downloading of Materials'
        when 'signing_materials' then 'Signing of Materials'
        when 'finish' then 'Finish' else step_id end,
      'completedBy', 'system',
      'completionSource', 'authoritative_roster',
      'completedAt', now_text
    ));
  end loop;

  return jsonb_build_object(
    'flowType', case when apply_step = 'kwsp_apply' then 'kwsp' else 'standard' end,
    'completedStepIds', to_jsonb(step_ids),
    'lastCompletedStepId', step_ids[array_length(step_ids, 1)],
    'completionSource', 'authoritative_roster',
    'updatedAt', now_text,
    'history', history_data
  );
end;
$$;

create or replace function public.complete_authoritative_roster_application(
  p_student_id text,
  p_application_id text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  student_data jsonb;
  application_data jsonb;
  tracking_data jsonb;
  scholarship_name text;
  now_text text := now()::text;
begin
  perform pg_advisory_xact_lock(hashtext('student:' || p_student_id));
  select data into student_data from public.students where id = p_student_id for update;
  select data into application_data from public.scholarship_applications
    where id = p_application_id and data->>'studentId' = p_student_id for update;
  if student_data is null or application_data is null then raise exception 'application_not_found'; end if;
  if application_data->>'source' <> 'authoritative_roster' then return application_data; end if;
  if nullif(application_data->>'rosterVerifiedAt', '') is not null then return application_data; end if;
  if not public.scholarship_documents_complete_for_application(student_data, application_data) then
    return application_data;
  end if;

  scholarship_name := coalesce(application_data->>'scholarshipName', application_data->>'name', 'Scholarship');
  tracking_data := public.authoritative_roster_tracking(
    application_data->>'providerType', scholarship_name, true);
  application_data := application_data || jsonb_build_object(
    'status', 'Finished',
    'tracking', tracking_data,
    'rosterVerifiedAt', now_text,
    'completedAt', now_text,
    'completionSource', 'authoritative_roster',
    'reviewedDocumentVersions', public.scholarship_document_versions(student_data),
    'reviewedApplicationFormVersion', application_data->'applicationFormFile',
    'updatedAt', now_text
  );
  update public.scholarship_applications set data = application_data, updated_at = now()
    where id = p_application_id;

  perform set_config('bulsuscholar.choice_write', 'true', true);
  update public.students set data = jsonb_set(data, '{scholarships}', coalesce((
    select jsonb_agg(case when entry->>'applicationId' = p_application_id or entry->>'id' = p_application_id
      then entry || jsonb_build_object('status','Finished','tracking',tracking_data,
        'rosterVerifiedAt',now_text,'completedAt',now_text,
        'completionSource','authoritative_roster','updatedAt',now_text)
      else entry end order by ordinal)
    from jsonb_array_elements(coalesce(data->'scholarships','[]'::jsonb))
      with ordinality scholarship(entry, ordinal)
  ), '[]'::jsonb), true) || jsonb_build_object('updatedAt', now_text), updated_at = now()
  where id = p_student_id;

  insert into public."studentNotifications"(id, data, updated_at)
  values('authoritative_roster_finished_' || p_application_id, jsonb_build_object(
    'studentId',p_student_id,'applicationId',p_application_id,'type','roster_scholarship_finished',
    'title','Scholarship Requirements Verified',
    'message',scholarship_name || ' is complete for this cycle. Wait for the next semester to renew your scholarship requirements.',
    'route','/student-dashboard/scholarships','read',false,'createdAt',now_text), now())
  on conflict(id) do nothing;
  return application_data;
end;
$$;

create or replace function public.assign_authoritative_roster_scholarship(
  p_student_id text,
  p_grantor_id text,
  p_roster_id text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  student_data jsonb;
  roster_data jsonb;
  application_data jsonb;
  application_id text := 'roster_' || md5(p_grantor_id || ':' || p_roster_id || ':' || p_student_id);
  scholarship_name text;
  provider_type text;
  tracking_data jsonb;
  now_text text := now()::text;
begin
  perform pg_advisory_xact_lock(hashtext('student:' || p_student_id));
  perform set_config('bulsuscholar.choice_write', 'true', true);
  select data into student_data from public.students where id = p_student_id for update;
  if not found then raise exception 'student_not_found'; end if;
  select data into roster_data from public.grantor_portal_scholars
    where parent_id = p_grantor_id and id = p_roster_id for update;
  if not found
    or coalesce(roster_data->>'studentId',roster_data->>'studentnumber',roster_data->>'studentNumber') <> p_student_id
    or lower(coalesce(roster_data->>'archived','false')) = 'true' then
    raise exception 'roster_match_not_found';
  end if;
  if student_data->'scholarshipCommitment' is not null
    and student_data#>>'{scholarshipCommitment,applicationId}' <> application_id then
    raise exception 'scholarship_already_committed';
  end if;

  scholarship_name := coalesce(roster_data->>'scholarshipName',roster_data->>'scholarshipTitle','Scholarship');
  provider_type := coalesce(roster_data->>'providerType','private');
  tracking_data := public.authoritative_roster_tracking(provider_type, scholarship_name, false);
  application_data := roster_data || jsonb_build_object(
    'id',application_id,'applicationId',application_id,'studentId',p_student_id,
    'applicationNumber',coalesce(roster_data->>'applicationNumber',p_roster_id),
    'name',scholarship_name,'scholarshipName',scholarship_name,
    'grantorId',p_grantor_id,'grantorName',coalesce(roster_data->>'grantorName',roster_data->>'provider',''),
    'providerType',provider_type,'status','Awaiting Documents','lifecycleVersion',2,
    'source','authoritative_roster','rosterId',p_roster_id,'rosterConfirmedAward',true,
    'withdrawalLocked',true,'slotReserved',false,'tracking',tracking_data,
    'createdAt',coalesce(roster_data->>'createdAt',now_text),'updatedAt',now_text
  );
  insert into public.scholarship_applications(id,data,updated_at)
    values(application_id,application_data,now())
    on conflict(id) do update set data = public.scholarship_applications.data || excluded.data,
      updated_at = now() returning data into application_data;

  update public.students set data = (data - 'rosterDecisionPending' - 'rosterScholarshipChoice') || jsonb_build_object(
    'scholarshipLifecycleVersion',2,
    'rosterAssignmentState',jsonb_build_object('status','assigned','rosterId',p_roster_id,
      'grantorId',p_grantor_id,'applicationId',application_id,'assignedAt',now_text),
    'scholarships',coalesce((select jsonb_agg(entry order by ordinal) from (
      select entry, ordinal from jsonb_array_elements(coalesce(data->'scholarships','[]'::jsonb))
        with ordinality existing(entry,ordinal)
      where coalesce(entry->>'applicationId',entry->>'id') <> application_id
      union all select application_data, 999999::bigint
    ) merged), '[]'::jsonb),
    'scholarshipCommitment',jsonb_build_object('applicationId',application_id,'grantorId',p_grantor_id,
      'scholarshipName',scholarship_name,'source','authoritative_roster','rosterId',p_roster_id,
      'committedAt',now_text,'withdrawalLocked',true),
    'updatedAt',now_text
  ), updated_at = now() where id = p_student_id returning data into student_data;

  update public.grantor_portal_scholars set data = data || jsonb_build_object(
    'applicationId',application_id,'rosterConfirmed',true,'rosterConfirmedAt',now_text,
    'status','Active','archived',false,'readOnly',false,'updatedAt',now_text), updated_at = now()
  where parent_id = p_grantor_id and id = p_roster_id;

  insert into public."studentNotifications"(id,data,updated_at)
  values('authoritative_roster_assigned_' || application_id,jsonb_build_object(
    'studentId',p_student_id,'grantorId',p_grantor_id,'applicationId',application_id,
    'type','authoritative_roster_assigned','title','Scholarship Assigned',
    'message',scholarship_name || ' was assigned from the official scholar roster. Complete COR, ROG, Student ID, and Student Application Profile requirements. You cannot change or withdraw this scholarship while your roster record is active.',
    'route','/student-dashboard/scholarships','read',false,'createdAt',now_text),now())
  on conflict(id) do nothing;

  application_data := public.complete_authoritative_roster_application(p_student_id, application_id);
  select data into student_data from public.students where id = p_student_id;
  return jsonb_build_object('student',student_data,'application',application_data);
end;
$$;

revoke all on function public.authoritative_roster_tracking(text,text,boolean) from public, anon, authenticated;
revoke all on function public.complete_authoritative_roster_application(text,text) from public, anon, authenticated;
revoke all on function public.assign_authoritative_roster_scholarship(text,text,text) from public, anon, authenticated;
grant execute on function public.complete_authoritative_roster_application(text,text) to service_role;
grant execute on function public.assign_authoritative_roster_scholarship(text,text,text) to service_role;
revoke execute on function public.resolve_student_roster_scholarship(text,text,text,text) from service_role;
revoke execute on function public.resolve_archived_grantor_scholar_choice(text,text,text) from service_role;

create or replace function public.promote_email_confirmed_student(
  p_student_id text,
  p_auth_user_id text,
  p_email text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  pending_data jsonb;
  active_data jsonb;
  match_count integer;
  matched_grantor_id text;
  matched_roster_id text;
  assignment jsonb;
  now_text text := now()::text;
begin
  perform pg_advisory_xact_lock(hashtext('student:' || p_student_id));
  select data into active_data from public.students where id = p_student_id for update;
  if found then
    if active_data->>'authUserId' is distinct from p_auth_user_id then raise exception 'confirmed_identity_mismatch'; end if;
    return jsonb_build_object('alreadyActive',true,'student',active_data);
  end if;
  select data into pending_data from public.pending_students where id = p_student_id for update;
  if not found then raise exception 'pending_student_not_found'; end if;
  if lower(coalesce(pending_data->>'email','')) <> lower(coalesce(p_email,''))
    or pending_data->>'authUserId' is distinct from p_auth_user_id then
    raise exception 'confirmed_identity_mismatch';
  end if;

  select count(*), min(parent_id), min(id) into match_count, matched_grantor_id, matched_roster_id
  from public.grantor_portal_scholars
  where coalesce(data->>'studentId',data->>'studentnumber',data->>'studentNumber') = p_student_id
    and lower(coalesce(data->>'archived','false')) <> 'true'
    and lower(coalesce(data->>'status','active')) not in ('archived','rejected','declined','withdrawn');

  active_data := (pending_data - 'password' - 'rosterDecisionPending' - 'rosterScholarshipChoice') || jsonb_build_object(
    'scholarshipLifecycleVersion',2,'isPending',false,'isValidated',true,
    'validatedAt',now_text,'emailConfirmedAt',now_text,
    'rosterAssignmentState',case when match_count > 1
      then jsonb_build_object('status','conflict','matchCount',match_count,'detectedAt',now_text)
      else jsonb_build_object('status','none','matchCount',0,'checkedAt',now_text) end,
    'updatedAt',now_text
  );
  insert into public.students(id,data,updated_at) values(p_student_id,active_data,now());
  delete from public.pending_students where id = p_student_id;

  if match_count = 1 then
    assignment := public.assign_authoritative_roster_scholarship(p_student_id,matched_grantor_id,matched_roster_id);
    active_data := assignment->'student';
  elsif match_count > 1 then
    insert into public."systemLogs"(id,data,updated_at)
    values('roster_conflict_' || p_student_id,jsonb_build_object(
      'studentId',p_student_id,'type','roster_assignment_conflict','title','Roster Assignment Conflict',
      'message','A confirmed student has multiple active roster matches. No scholarship was assigned.',
      'route','/admin/scholarships','read',false,'createdAt',now_text,
      'notificationFallbackTable','adminNotifications','action','roster_assignment_conflict','actorType','system'),now())
    on conflict(id) do update set data = excluded.data, updated_at = now();
  end if;

  insert into public."studentNotifications"(id,data,updated_at)
  values('email_confirmed_' || p_student_id,jsonb_build_object(
    'studentId',p_student_id,'type','account_confirmed','title','Account Ready',
    'message',case when match_count = 1 then 'Your email is confirmed and your official roster scholarship was assigned.'
      when match_count > 1 then 'Your email is confirmed. The scholarship office must resolve conflicting roster records before assigning your scholarship.'
      else 'Your email is confirmed. Your student dashboard is ready.' end,
    'route','/student-dashboard','read',false,'createdAt',now_text,'updatedAt',now_text),now())
  on conflict(id) do nothing;
  return jsonb_build_object('promoted',true,'student',active_data,'rosterMatchCount',match_count,
    'rosterAssigned',match_count = 1,'rosterConflict',match_count > 1);
end;
$$;

revoke all on function public.promote_email_confirmed_student(text,text,text) from public, anon, authenticated;
grant execute on function public.promote_email_confirmed_student(text,text,text) to service_role;

create or replace function public.complete_authoritative_roster_on_document_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare application_row record;
begin
  for application_row in select id from public.scholarship_applications
    where data->>'studentId' = new.id and data->>'source' = 'authoritative_roster'
      and nullif(data->>'rosterVerifiedAt','') is null
  loop
    perform public.complete_authoritative_roster_application(new.id, application_row.id);
  end loop;
  return new;
end;
$$;

drop trigger if exists complete_authoritative_roster_documents on public.students;
create trigger complete_authoritative_roster_documents
after update of data on public.students
for each row when (old.data is distinct from new.data)
execute function public.complete_authoritative_roster_on_document_change();

create or replace function public.complete_authoritative_roster_on_application_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.data->>'source' = 'authoritative_roster'
    and nullif(new.data->>'rosterVerifiedAt','') is null then
    perform public.complete_authoritative_roster_application(new.data->>'studentId', new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists complete_authoritative_roster_application_documents on public.scholarship_applications;
create trigger complete_authoritative_roster_application_documents
after update of data on public.scholarship_applications
for each row when (
  new.data->>'source' = 'authoritative_roster'
  and old.data#>>'{applicationFormFile,url}' is distinct from new.data#>>'{applicationFormFile,url}'
)
execute function public.complete_authoritative_roster_on_application_change();

revoke all on function public.complete_authoritative_roster_on_document_change() from public, anon, authenticated;
revoke all on function public.complete_authoritative_roster_on_application_change() from public, anon, authenticated;

create or replace function public.update_authoritative_roster_scholar(
  p_actor_type text,
  p_actor_id text,
  p_grantor_id text,
  p_roster_id text,
  p_update jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  roster_data jsonb;
  student_id text;
  application_id text;
  application_data jsonb;
  student_data jsonb;
  now_text text := now()::text;
  cooldown_text text := (now() + interval '24 hours')::text;
begin
  if p_actor_type not in ('admin','grantor') or (p_actor_type = 'grantor' and p_actor_id <> p_grantor_id) then
    raise exception 'portal_record_owner_mismatch';
  end if;
  perform pg_advisory_xact_lock(hashtext('roster:' || p_grantor_id || ':' || p_roster_id));
  perform set_config('bulsuscholar.choice_write', 'true', true);
  select data into roster_data from public.grantor_portal_scholars
    where parent_id = p_grantor_id and id = p_roster_id for update;
  if not found then raise exception 'roster_match_not_found'; end if;
  roster_data := roster_data || coalesce(p_update,'{}'::jsonb) || jsonb_build_object('updatedAt',now_text);
  update public.grantor_portal_scholars set data = roster_data, updated_at = now()
    where parent_id = p_grantor_id and id = p_roster_id;

  if lower(coalesce(roster_data->>'archived','false')) <> 'true' then
    return jsonb_build_object('roster',roster_data,'released',false);
  end if;
  student_id := coalesce(roster_data->>'studentId',roster_data->>'studentnumber',roster_data->>'studentNumber');
  application_id := roster_data->>'applicationId';
  if nullif(student_id,'') is null or nullif(application_id,'') is null then
    return jsonb_build_object('roster',roster_data,'released',false);
  end if;
  select data into application_data from public.scholarship_applications where id = application_id for update;
  if application_data->>'source' <> 'authoritative_roster' then
    return jsonb_build_object('roster',roster_data,'released',false);
  end if;

  application_data := application_data || jsonb_build_object(
    'status','Archived','archived',true,'readOnly',true,'withdrawalLocked',false,
    'archivedAt',now_text,'closureReason','grantor_archived_scholar',
    'cooldownUntil',cooldown_text,'updatedAt',now_text);
  update public.scholarship_applications set data = application_data, updated_at = now()
    where id = application_id;
  update public.students set data = (data - 'scholarshipCommitment') || jsonb_build_object(
    'scholarships',coalesce((select jsonb_agg(case when coalesce(entry->>'applicationId',entry->>'id') = application_id
      then entry || jsonb_build_object('status','Archived','archived',true,'readOnly',true,
        'withdrawalLocked',false,'archivedAt',now_text,'closureReason','grantor_archived_scholar',
        'cooldownUntil',cooldown_text,'updatedAt',now_text) else entry end order by ordinal)
      from jsonb_array_elements(coalesce(data->'scholarships','[]'::jsonb)) with ordinality s(entry,ordinal)), '[]'::jsonb),
    'rosterAssignmentState',jsonb_build_object('status','released','rosterId',p_roster_id,
      'grantorId',p_grantor_id,'applicationId',application_id,'releasedAt',now_text,
      'cooldownUntil',cooldown_text),'updatedAt',now_text
  ), updated_at = now() where id = student_id returning data into student_data;
  insert into public."studentNotifications"(id,data,updated_at)
  values('authoritative_roster_released_' || application_id,jsonb_build_object(
    'studentId',student_id,'grantorId',p_grantor_id,'applicationId',application_id,
    'type','roster_scholarship_archived','title','Scholarship Record Archived',
    'message','Your grantor archived your scholar record. This scholarship is no longer locked; its 24-hour reapplication cooldown is now active.',
    'route','/student-dashboard/scholarships','read',false,'createdAt',now_text),now())
  on conflict(id) do nothing;
  return jsonb_build_object('roster',roster_data,'application',application_data,'student',student_data,'released',true);
end;
$$;

revoke all on function public.update_authoritative_roster_scholar(text,text,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.update_authoritative_roster_scholar(text,text,text,text,jsonb) to service_role;

-- Archiving a grantor account keeps committed awards active under administrator
-- servicing. Existing, already-resolved replacement workflows are left intact.
create or replace function public.sync_archived_grantor_scholar_choices(
  p_grantor_id text,
  p_archived boolean,
  p_actor_id text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  student_row record;
  application_id text;
  application_data jsonb;
  previous_choice jsonb;
  now_text text := now()::text;
  affected_count integer := 0;
  notification_count integer := 0;
begin
  if nullif(trim(p_grantor_id), '') is null then raise exception 'missing_grantor_id'; end if;
  perform pg_advisory_xact_lock(734821, 1);
  perform set_config('bulsuscholar.choice_write', 'true', true);

  if not exists(select 1 from public.providers where id = p_grantor_id)
    and not exists(select 1 from public.grantor_portals where id = p_grantor_id) then
    raise exception 'grantor_not_found';
  end if;
  insert into public.providers(id,data,updated_at) values(p_grantor_id,jsonb_build_object(
    'archived',p_archived,'archivedAt',case when p_archived then now_text else null end,
    'status',case when p_archived then 'Archived' else 'Active' end,'updatedAt',now_text),now())
  on conflict(id) do update set data = public.providers.data || excluded.data, updated_at = now();
  insert into public.grantor_portals(id,data,updated_at) values(p_grantor_id,jsonb_build_object(
    'archived',p_archived,'archivedAt',case when p_archived then now_text else null end,
    'status',case when p_archived then 'Archived' else 'Active' end,'updatedAt',now_text),now())
  on conflict(id) do update set data = public.grantor_portals.data || excluded.data, updated_at = now();

  for student_row in
    select id,data from public.students
    where data#>>'{scholarshipCommitment,grantorId}' = p_grantor_id
       or data#>>'{grantorArchiveChoice,grantorId}' = p_grantor_id
    order by id for update
  loop
    previous_choice := student_row.data->'grantorArchiveChoice';
    if lower(coalesce(previous_choice->>'decision','')) = 'change' then
      continue;
    end if;
    application_id := coalesce(
      student_row.data#>>'{scholarshipCommitment,applicationId}',
      previous_choice->>'applicationId'
    );
    if nullif(application_id,'') is null then continue; end if;
    select data into application_data from public.scholarship_applications
      where id = application_id and coalesce(data->>'grantorId',data->>'providerId') = p_grantor_id
      for update;
    if not found or not public.scholarship_application_open(application_data) then continue; end if;

    if p_archived then
      update public.scholarship_applications set data = (data - 'workflowPaused') || jsonb_build_object(
        'grantorAccountArchived',true,'grantorArchiveDecision','auto_keep',
        'servicingOwner','admin','updatedAt',now_text), updated_at = now()
      where id = application_id;
      update public.grantor_portal_scholars set data = (data - 'workflowPaused') || jsonb_build_object(
        'grantorAccountArchived',true,'grantorArchiveDecision','auto_keep',
        'servicingOwner','admin','updatedAt',now_text), updated_at = now()
      where parent_id = p_grantor_id and data->>'applicationId' = application_id;
      update public.students set data = (data - 'grantorArchiveChoice') || jsonb_build_object(
        'grantorArchiveChoiceHistory',coalesce(data->'grantorArchiveChoiceHistory','[]'::jsonb) ||
          case when previous_choice is null then '[]'::jsonb else jsonb_build_array(previous_choice ||
            jsonb_build_object('resolution','administrator_serviced','decision','auto_keep','resolvedAt',now_text)) end,
        'scholarships',coalesce((select jsonb_agg(case when coalesce(entry->>'applicationId',entry->>'id') = application_id
          then (entry - 'workflowPaused') || jsonb_build_object('grantorAccountArchived',true,
            'grantorArchiveDecision','auto_keep','servicingOwner','admin','updatedAt',now_text)
          else entry end order by ordinal)
          from jsonb_array_elements(coalesce(data->'scholarships','[]'::jsonb)) with ordinality s(entry,ordinal)), '[]'::jsonb),
        'updatedAt',now_text), updated_at = now() where id = student_row.id;
      insert into public."studentNotifications"(id,data,updated_at) values(
        'grantor_archive_admin_serviced_' || application_id,
        jsonb_build_object('studentId',student_row.id,'grantorId',p_grantor_id,
          'applicationId',application_id,'type','grantor_archive_admin_serviced',
          'title','Scholarship Continues Under Scholarship Office',
          'message','Your grantor account was archived, but your scholarship remains active and is now serviced by the scholarship office. You cannot change or withdraw it unless your individual scholar record is archived.',
          'route','/student-dashboard/scholarships','read',false,'createdAt',now_text),now())
      on conflict(id) do nothing;
      if found then notification_count := notification_count + 1; end if;
    else
      update public.scholarship_applications set data =
        (data - 'grantorArchiveDecision' - 'workflowPaused') || jsonb_build_object(
          'grantorAccountArchived',false,'servicingOwner','grantor','updatedAt',now_text), updated_at = now()
      where id = application_id and data->>'grantorArchiveDecision' = 'auto_keep';
      update public.grantor_portal_scholars set data =
        (data - 'grantorArchiveDecision' - 'workflowPaused') || jsonb_build_object(
          'grantorAccountArchived',false,'servicingOwner','grantor','updatedAt',now_text), updated_at = now()
      where parent_id = p_grantor_id and data->>'applicationId' = application_id
        and data->>'grantorArchiveDecision' = 'auto_keep';
      update public.students set data = jsonb_build_object(
        'scholarships',coalesce((select jsonb_agg(case when coalesce(entry->>'applicationId',entry->>'id') = application_id
          and entry->>'grantorArchiveDecision' = 'auto_keep'
          then (entry - 'grantorArchiveDecision' - 'workflowPaused') || jsonb_build_object(
            'grantorAccountArchived',false,'servicingOwner','grantor','updatedAt',now_text)
          else entry end order by ordinal)
          from jsonb_array_elements(coalesce(data->'scholarships','[]'::jsonb)) with ordinality s(entry,ordinal)), '[]'::jsonb)
      ) || (data - 'scholarships') || jsonb_build_object('updatedAt',now_text), updated_at = now()
      where id = student_row.id;
    end if;
    affected_count := affected_count + 1;
  end loop;
  return jsonb_build_object('affectedScholarCount',affected_count,
    'choiceNotificationCount',notification_count,'automaticServicing',true);
end;
$$;

revoke all on function public.sync_archived_grantor_scholar_choices(text,boolean,text) from public, anon, authenticated;
grant execute on function public.sync_archived_grantor_scholar_choices(text,boolean,text) to service_role;

-- Existing pending grantor-account choices become administrator-serviced awards.
update public.students set data = (data - 'grantorArchiveChoice') || jsonb_build_object(
  'grantorArchiveChoiceHistory',coalesce(data->'grantorArchiveChoiceHistory','[]'::jsonb) ||
    jsonb_build_array(coalesce(data->'grantorArchiveChoice','{}'::jsonb) || jsonb_build_object(
      'decision','auto_keep','servicingOwner','admin','resolvedAt',now()::text)),
  'scholarships',coalesce((select jsonb_agg(case when entry->>'applicationId' = data#>>'{grantorArchiveChoice,applicationId}'
    then (entry - 'workflowPaused') || jsonb_build_object('grantorArchiveDecision','auto_keep',
      'servicingOwner','admin','updatedAt',now()::text) else entry end order by ordinal)
    from jsonb_array_elements(coalesce(data->'scholarships','[]'::jsonb)) with ordinality s(entry,ordinal)), '[]'::jsonb),
  'updatedAt',now()::text
) where lower(coalesce(data#>>'{grantorArchiveChoice,decision}','')) = 'pending';

update public.scholarship_applications set data = (data - 'workflowPaused') || jsonb_build_object(
  'grantorArchiveDecision','auto_keep','servicingOwner','admin','updatedAt',now()::text
) where lower(coalesce(data->>'grantorArchiveDecision','')) = 'pending';

-- Backfill only safe, unambiguous pending roster choices.
do $$
declare student_row record; match_row record; active_matches integer;
begin
  for student_row in select id from public.students where data->>'rosterDecisionPending' = 'true' order by id loop
    select count(*) into active_matches from public.grantor_portal_scholars
      where coalesce(data->>'studentId',data->>'studentnumber',data->>'studentNumber') = student_row.id
        and lower(coalesce(data->>'archived','false')) <> 'true'
        and lower(coalesce(data->>'status','active')) not in ('archived','rejected','declined','withdrawn');
    if active_matches = 1 then
      select parent_id,id into match_row from public.grantor_portal_scholars
        where coalesce(data->>'studentId',data->>'studentnumber',data->>'studentNumber') = student_row.id
          and lower(coalesce(data->>'archived','false')) <> 'true'
          and lower(coalesce(data->>'status','active')) not in ('archived','rejected','declined','withdrawn') limit 1;
      perform public.assign_authoritative_roster_scholarship(student_row.id,match_row.parent_id,match_row.id);
    else
      update public.students set data = (data - 'rosterDecisionPending' - 'rosterScholarshipChoice') || jsonb_build_object(
        'rosterAssignmentState',jsonb_build_object('status',case when active_matches > 1 then 'conflict' else 'no_match' end,
          'matchCount',active_matches,'detectedAt',now()::text),'updatedAt',now()::text), updated_at = now()
      where id = student_row.id;
      insert into public."systemLogs"(id,data,updated_at) values(
        'roster_backfill_review_' || student_row.id,
        jsonb_build_object('studentId',student_row.id,'type','roster_assignment_review',
          'title','Roster Assignment Review Required',
          'message',case when active_matches > 1
            then 'A legacy pending student has multiple active roster matches. Correct the roster before assignment.'
            else 'A legacy pending student no longer has an active roster match. Review the roster record.' end,
          'route','/admin/scholarships','read',false,'createdAt',now()::text,
          'notificationFallbackTable','adminNotifications','action','roster_assignment_review','actorType','system'),now())
      on conflict(id) do update set data = excluded.data, updated_at = now();
    end if;
  end loop;
end;
$$;

notify pgrst, 'reload schema';
commit;
