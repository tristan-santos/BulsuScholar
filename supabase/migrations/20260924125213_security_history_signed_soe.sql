begin;

alter table public.login_security_state
  add column if not exists last_meaningful_activity_at timestamptz,
  add column if not exists otp_grace_until timestamptz;

update public.login_security_state
set otp_grace_until = coalesce(otp_grace_until, now() + interval '30 days'),
    last_meaningful_activity_at = coalesce(last_meaningful_activity_at, last_succeeded_at, now())
where account_type in ('student', 'grantor');

create table if not exists public.portal_email_challenges (
  id text primary key,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  account_type text not null check (account_type in ('student', 'grantor')),
  account_id text not null,
  code_hash text not null,
  status text not null default 'active' check (status in ('active', 'verified', 'expired', 'superseded')),
  attempts integer not null default 0 check (attempts between 0 and 3),
  send_count integer not null default 1 check (send_count between 1 and 5),
  send_window_started_at timestamptz not null default now(),
  last_sent_at timestamptz not null default now(),
  expires_at timestamptz not null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.portal_verified_sessions (
  session_id uuid primary key,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  account_type text not null check (account_type in ('student', 'grantor', 'admin')),
  account_id text not null,
  verification_method text not null check (verification_method in ('password', 'email_code')),
  verified_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.public_recovery_tickets (
  id text primary key,
  ticket_number text not null unique,
  capability_hash text not null unique,
  supplied_user_id text not null,
  auth_user_id uuid references auth.users(id) on delete set null,
  account_type text,
  account_id text,
  status text not null default 'open' check (status in ('open', 'under_review', 'awaiting_email_confirmation', 'resolved', 'rejected', 'deleted')),
  proposed_email text,
  confirmation_hash text,
  confirmation_expires_at timestamptz,
  confirmation_attempts integer not null default 0,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists public.public_recovery_messages (
  id text primary key,
  ticket_id text not null references public.public_recovery_tickets(id) on delete cascade,
  sender_type text not null check (sender_type in ('requester', 'root', 'system')),
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.public_recovery_attachments (
  id text primary key,
  ticket_id text not null references public.public_recovery_tickets(id) on delete cascade,
  message_id text references public.public_recovery_messages(id) on delete set null,
  storage_bucket text not null,
  storage_path text not null,
  file_name text not null,
  content_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  created_at timestamptz not null default now()
);

create table if not exists public.public_recovery_audit_events (
  id text primary key,
  ticket_id text,
  event_type text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.student_history_events (
  id text primary key,
  student_id text not null,
  event_type text not null,
  academic_cycle text,
  occurred_at timestamptz not null,
  related_type text,
  related_id text,
  route text,
  description text not null,
  safe_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.signed_soe_submissions (
  id text primary key,
  student_id text not null,
  application_id text not null,
  academic_cycle text not null,
  version integer not null check (version > 0),
  status text not null default 'submitted' check (status in ('submitted', 'reopened')),
  storage_bucket text not null,
  storage_path text not null,
  file_name text not null,
  content_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  submitted_at timestamptz not null default now(),
  reopened_at timestamptz,
  reopened_by text,
  reopen_reason text,
  created_at timestamptz not null default now(),
  unique(application_id, academic_cycle, version)
);

create table if not exists public.signed_soe_audit_events (
  id text primary key,
  submission_id text,
  application_id text not null,
  event_type text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists portal_email_challenges_identity_idx on public.portal_email_challenges(auth_user_id, created_at desc);
create index if not exists portal_verified_sessions_user_idx on public.portal_verified_sessions(auth_user_id, last_activity_at desc) where revoked_at is null;
create index if not exists public_recovery_messages_ticket_idx on public.public_recovery_messages(ticket_id, created_at, id);
create index if not exists public_recovery_attachments_ticket_idx on public.public_recovery_attachments(ticket_id, created_at);
create index if not exists student_history_events_timeline_idx on public.student_history_events(student_id, occurred_at desc, id desc);
create index if not exists signed_soe_application_idx on public.signed_soe_submissions(application_id, version desc);

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'portal_email_challenges', 'portal_verified_sessions', 'public_recovery_tickets',
    'public_recovery_messages', 'public_recovery_attachments', 'public_recovery_audit_events',
    'student_history_events', 'signed_soe_submissions', 'signed_soe_audit_events'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from public, anon, authenticated', table_name);
    execute format('grant select, insert, update, delete on table public.%I to service_role', table_name);
  end loop;
end $$;

create or replace function public.protect_security_history_event()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'immutable_audit_event';
end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array['public_recovery_audit_events', 'student_history_events', 'signed_soe_audit_events'] loop
    execute format('drop trigger if exists protect_immutable_event on public.%I', table_name);
    execute format('create trigger protect_immutable_event before update or delete on public.%I for each row execute function public.protect_security_history_event()', table_name);
  end loop;
end $$;

create or replace function public.issue_portal_email_challenge(
  p_id text, p_auth_user_id uuid, p_account_type text, p_account_id text, p_code_hash text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare recent_count integer; existing public.portal_email_challenges%rowtype;
begin
  if p_account_type not in ('student', 'grantor') or length(p_code_hash) <> 64 then raise exception 'invalid_email_challenge'; end if;
  perform pg_advisory_xact_lock(hashtext('portal-email:' || p_auth_user_id::text));
  select count(*) into recent_count from public.portal_email_challenges
    where auth_user_id = p_auth_user_id and last_sent_at > now() - interval '1 hour';
  if recent_count >= 5 then raise exception 'email_challenge_hourly_limit'; end if;
  update public.portal_email_challenges set status = 'superseded', updated_at = now()
    where auth_user_id = p_auth_user_id and status = 'active';
  insert into public.portal_email_challenges(id, auth_user_id, account_type, account_id, code_hash, expires_at)
    values(p_id, p_auth_user_id, p_account_type, p_account_id, p_code_hash, now() + interval '10 minutes');
  return jsonb_build_object('challengeId', p_id, 'expiresIn', 600, 'resendAfter', 60, 'remainingAttempts', 3);
end;
$$;

create or replace function public.check_portal_email_challenge(p_id text, p_code_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare c public.portal_email_challenges%rowtype;
begin
  select * into c from public.portal_email_challenges where id = p_id for update;
  if not found or c.status <> 'active' or c.expires_at <= now() then raise exception 'email_challenge_expired'; end if;
  if c.attempts >= 3 then raise exception 'email_challenge_attempts_exhausted'; end if;
  if c.code_hash <> p_code_hash then
    update public.portal_email_challenges set attempts = attempts + 1,
      status = case when attempts + 1 >= 3 then 'expired' else status end, updated_at = now() where id = p_id;
    return jsonb_build_object('verified', false, 'remainingAttempts', greatest(0, 2 - c.attempts));
  end if;
  return jsonb_build_object('verified', true, 'authUserId', c.auth_user_id,
    'accountType', c.account_type, 'accountId', c.account_id);
end;
$$;

create or replace function public.complete_portal_verified_session(
  p_challenge_id text, p_code_hash text, p_session_id uuid, p_auth_user_id uuid,
  p_account_type text, p_account_id text, p_method text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare c public.portal_email_challenges%rowtype;
begin
  if p_method = 'email_code' then
    select * into c from public.portal_email_challenges where id = p_challenge_id for update;
    if not found or c.status <> 'active' or c.expires_at <= now() or c.code_hash <> p_code_hash
      or c.auth_user_id <> p_auth_user_id or c.account_type <> p_account_type or c.account_id <> p_account_id then
      raise exception 'email_challenge_not_verified';
    end if;
    update public.portal_email_challenges set status = 'verified', verified_at = now(), updated_at = now() where id = p_challenge_id;
  end if;
  if not exists(select 1 from auth.sessions where id = p_session_id and user_id = p_auth_user_id) then
    raise exception 'auth_session_not_found';
  end if;
  insert into public.portal_verified_sessions(session_id, auth_user_id, account_type, account_id, verification_method)
    values(p_session_id, p_auth_user_id, p_account_type, p_account_id, p_method)
    on conflict(session_id) do update set revoked_at = null, verification_method = excluded.verification_method,
      verified_at = now(), last_activity_at = now(), updated_at = now();
  update public.login_security_state set failed_attempts = 0, last_succeeded_at = now(),
    last_meaningful_activity_at = now(), otp_grace_until = null, updated_at = now()
    where auth_user_id = p_auth_user_id;
  return jsonb_build_object('verified', true, 'sessionId', p_session_id);
end;
$$;

create or replace function public.validate_portal_verified_session(p_session_id uuid, p_auth_user_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v public.portal_verified_sessions%rowtype; locked_at timestamptz;
begin
  select blocked_at into locked_at from public.login_security_state where auth_user_id = p_auth_user_id;
  if locked_at is not null then return jsonb_build_object('valid', false, 'reason', 'account_locked'); end if;
  select * into v from public.portal_verified_sessions where session_id = p_session_id and auth_user_id = p_auth_user_id and revoked_at is null for update;
  if not found then return jsonb_build_object('valid', false, 'reason', 'email_verification_required'); end if;
  if not exists(select 1 from auth.sessions where id = p_session_id and user_id = p_auth_user_id) then
    return jsonb_build_object('valid', false, 'reason', 'auth_session_revoked');
  end if;
  if v.last_activity_at < now() - interval '1 hour' then
    update public.portal_verified_sessions set last_activity_at = now(), updated_at = now() where session_id = p_session_id;
    update public.login_security_state set last_meaningful_activity_at = now(), updated_at = now() where auth_user_id = p_auth_user_id;
  end if;
  return jsonb_build_object('valid', true, 'accountType', v.account_type, 'accountId', v.account_id);
end;
$$;

create or replace function public.discard_portal_auth_session(p_session_id uuid, p_auth_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.portal_verified_sessions where session_id = p_session_id and auth_user_id = p_auth_user_id;
  delete from auth.sessions where id = p_session_id and user_id = p_auth_user_id;
end;
$$;

create or replace function public.complete_public_recovery_profile(p_ticket_id text, p_email text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare t public.public_recovery_tickets%rowtype; now_text text := now()::text;
begin
  select * into t from public.public_recovery_tickets where id = p_ticket_id for update;
  if not found or t.status <> 'awaiting_email_confirmation' or t.auth_user_id is null then raise exception 'recovery_ticket_not_ready'; end if;
  if t.account_type = 'student' then
    update public.students set email=lower(p_email), data=data || jsonb_build_object('email',lower(p_email),'sessionValidAfter',now_text,'updatedAt',now_text), updated_at=now() where id=t.account_id;
  elsif t.account_type = 'grantor' then
    update public.providers set email=lower(p_email), data=data || jsonb_build_object('email',lower(p_email),'sessionValidAfter',now_text,'updatedAt',now_text), updated_at=now() where id=t.account_id;
    update public.grantor_portals set data=data || jsonb_build_object('email',lower(p_email),'sessionValidAfter',now_text,'updatedAt',now_text), updated_at=now() where id=t.account_id;
  else raise exception 'recovery_account_not_supported'; end if;
  update public.login_security_state set failed_attempts=0,blocked_at=null,blocked_reason=null,unblocked_at=now(),unblocked_by='lost_email_recovery',last_meaningful_activity_at=null,otp_grace_until=now()+interval '30 days',updated_at=now() where auth_user_id=t.auth_user_id;
  delete from public.portal_verified_sessions where auth_user_id=t.auth_user_id;
  delete from auth.sessions where user_id=t.auth_user_id;
  update public.public_recovery_tickets set status='resolved',confirmation_hash=null,confirmation_expires_at=null,resolved_at=now(),updated_at=now() where id=p_ticket_id;
  insert into public.public_recovery_audit_events(id,ticket_id,event_type,data) values(
    'recovery_resolved_' || p_ticket_id,p_ticket_id,'email_changed',jsonb_build_object('accountType',t.account_type,'accountId',t.account_id,'createdAt',now_text)) on conflict(id) do nothing;
  return jsonb_build_object('ok',true,'status','resolved');
end;
$$;

create or replace function public.portal_email_in_use(p_email text, p_exclude_auth_user_id uuid default null)
returns boolean language sql security definer set search_path = '' as $$
  select exists(select 1 from auth.users where lower(email)=lower(trim(p_email)) and (p_exclude_auth_user_id is null or id<>p_exclude_auth_user_id))
    or exists(select 1 from public.students s where lower(coalesce(s.email,s.data->>'email',''))=lower(trim(p_email)) and (p_exclude_auth_user_id is null or coalesce(nullif(to_jsonb(s)->>'auth_user_id',''),nullif(s.data->>'authUserId','')) is distinct from p_exclude_auth_user_id::text))
    or exists(select 1 from public.pending_students s where lower(coalesce(s.email,s.data->>'email',''))=lower(trim(p_email)) and (p_exclude_auth_user_id is null or coalesce(nullif(to_jsonb(s)->>'auth_user_id',''),nullif(s.data->>'authUserId','')) is distinct from p_exclude_auth_user_id::text))
    or exists(select 1 from public.providers p where lower(coalesce(p.email,p.data->>'email',''))=lower(trim(p_email)) and (p_exclude_auth_user_id is null or coalesce(nullif(to_jsonb(p)->>'auth_user_id',''),nullif(p.data->>'authUserId','')) is distinct from p_exclude_auth_user_id::text))
    or exists(select 1 from public.admins a where lower(coalesce(a.email,a.data->>'email',''))=lower(trim(p_email)) and (p_exclude_auth_user_id is null or coalesce(nullif(to_jsonb(a)->>'auth_user_id',''),nullif(a.data->>'authUserId','')) is distinct from p_exclude_auth_user_id::text))
    or exists(select 1 from public.public_recovery_tickets where status='awaiting_email_confirmation' and lower(proposed_email)=lower(trim(p_email)) and (p_exclude_auth_user_id is null or auth_user_id<>p_exclude_auth_user_id));
$$;

create or replace function public.finalize_signed_soe_submission(
  p_submission_id text, p_student_id text, p_application_id text, p_cycle text,
  p_bucket text, p_path text, p_file_name text, p_content_type text, p_size bigint
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare a public.scholarship_applications%rowtype; d jsonb; tracking jsonb; completed jsonb; next_version integer; now_text text := now()::text;
begin
  perform pg_advisory_xact_lock(hashtext('signed-soe:' || p_application_id));
  select * into a from public.scholarship_applications where id = p_application_id for update;
  if not found then raise exception 'application_not_found'; end if;
  d := a.data;
  if d->>'studentId' <> p_student_id then raise exception 'application_access_denied'; end if;
  if d->>'source' = 'authoritative_roster' then raise exception 'authoritative_roster_exempt'; end if;
  if nullif(d->>'committedAt', '') is null then raise exception 'scholarship_not_committed'; end if;
  if not (coalesce(d#>'{tracking,completedStepIds}', '[]'::jsonb) ? 'signing_materials') then raise exception 'signing_stage_incomplete'; end if;
  if lower(coalesce(d->>'status', '')) in ('withdrawn','rejected','denied','cancelled','archived','expired') then raise exception 'application_closed'; end if;
  if exists(select 1 from public.signed_soe_submissions where application_id = p_application_id and academic_cycle = p_cycle and status = 'submitted') then raise exception 'signed_soe_already_submitted'; end if;
  select coalesce(max(version), 0) + 1 into next_version from public.signed_soe_submissions where application_id = p_application_id and academic_cycle = p_cycle;
  insert into public.signed_soe_submissions(id, student_id, application_id, academic_cycle, version, storage_bucket, storage_path, file_name, content_type, size_bytes)
    values(p_submission_id, p_student_id, p_application_id, p_cycle, next_version, p_bucket, p_path, p_file_name, p_content_type, p_size);
  tracking := coalesce(d->'tracking', '{}'::jsonb);
  completed := coalesce(tracking->'completedStepIds', '[]'::jsonb);
  if not (completed ? 'signed_soe_upload') then completed := completed || '"signed_soe_upload"'::jsonb; end if;
  if not (completed ? 'finish') then completed := completed || '"finish"'::jsonb; end if;
  tracking := tracking || jsonb_build_object('completedStepIds', completed, 'currentStepId', 'finish', 'updatedAt', now_text,
    'history', coalesce(tracking->'history', '[]'::jsonb) || jsonb_build_array(
      jsonb_build_object('stepId','signed_soe_upload','label','Upload Signed SOE','completedAt',now_text,'completedBy','student','completionSource','signed_soe_submission'),
      jsonb_build_object('stepId','finish','label','Finish','completedAt',now_text,'completedBy','system','completionSource','signed_soe_submission')));
  update public.scholarship_applications set data = d || jsonb_build_object('tracking', tracking,
    'signedSoeSubmissionId', p_submission_id, 'signedSoeStatus', 'submitted', 'finishedAt', now_text, 'updatedAt', now_text), updated_at = now() where id = p_application_id;
  insert into public.signed_soe_audit_events(id, submission_id, application_id, event_type, data)
    values('signed_soe_submitted_' || p_submission_id, p_submission_id, p_application_id, 'submitted', jsonb_build_object('studentId',p_student_id,'cycle',p_cycle,'createdAt',now_text));
  insert into public.student_history_events(id, student_id, event_type, academic_cycle, occurred_at, related_type, related_id, route, description, safe_data)
    values('history_signed_soe_' || p_submission_id, p_student_id, 'signed_soe_submitted', p_cycle, now(), 'application', p_application_id,
      '/student-dashboard/scholarships', 'Signed SOE submitted. This scholarship cycle is finished.', jsonb_build_object('submissionId',p_submission_id)) on conflict(id) do nothing;
  return jsonb_build_object('submissionId', p_submission_id, 'version', next_version, 'status', 'submitted', 'finishCompleted', true);
end;
$$;

create or replace function public.reopen_signed_soe_submission(p_submission_id text, p_actor_id text, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.signed_soe_submissions%rowtype; a public.scholarship_applications%rowtype; t jsonb; ids jsonb; now_text text := now()::text;
begin
  if length(trim(coalesce(p_reason,''))) < 5 then raise exception 'reopen_reason_required'; end if;
  select * into s from public.signed_soe_submissions where id = p_submission_id for update;
  if not found then raise exception 'signed_soe_not_found'; end if;
  if s.status <> 'submitted' then raise exception 'signed_soe_already_reopened'; end if;
  select * into a from public.scholarship_applications where id = s.application_id for update;
  t := coalesce(a.data->'tracking','{}'::jsonb);
  select coalesce(jsonb_agg(value), '[]'::jsonb) into ids from jsonb_array_elements(coalesce(t->'completedStepIds','[]'::jsonb)) value where value #>> '{}' not in ('signed_soe_upload','finish');
  t := t || jsonb_build_object('completedStepIds',ids,'currentStepId','signed_soe_upload','updatedAt',now_text);
  update public.signed_soe_submissions set status='reopened', reopened_at=now(), reopened_by=p_actor_id, reopen_reason=trim(p_reason) where id=p_submission_id;
  update public.scholarship_applications set data=a.data || jsonb_build_object('tracking',t,'signedSoeStatus','reopened','signedSoeReopenReason',trim(p_reason),'finishedAt',null,'updatedAt',now_text), updated_at=now() where id=s.application_id;
  insert into public.signed_soe_audit_events(id, submission_id, application_id, event_type, data) values(
    'signed_soe_reopened_' || p_submission_id, p_submission_id, s.application_id, 'reopened', jsonb_build_object('actorId',p_actor_id,'reason',trim(p_reason),'createdAt',now_text));
  insert into public.student_history_events(id,student_id,event_type,academic_cycle,occurred_at,related_type,related_id,route,description,safe_data) values(
    'history_signed_soe_reopened_' || p_submission_id,s.student_id,'signed_soe_reopened',s.academic_cycle,now(),'application',s.application_id,
    '/student-dashboard/scholarships','Signed SOE needs correction. Upload a new file to finish this cycle.',jsonb_build_object('reason',trim(p_reason))) on conflict(id) do nothing;
  insert into public."studentNotifications"(id,data,updated_at) values('signed_soe_reopened_' || p_submission_id,
    jsonb_build_object('studentId',s.student_id,'type','signed_soe_reopened','title','Signed SOE needs correction','message',trim(p_reason),'route','/student-dashboard/scholarships','read',false,'createdAt',now_text),now()) on conflict(id) do nothing;
  return jsonb_build_object('submissionId',p_submission_id,'status','reopened','currentStepId','signed_soe_upload');
end;
$$;

create or replace function public.restart_scholarship_cycle_history()
returns trigger language plpgsql security definer set search_path = '' as $$
declare a record; old_cycle text; new_cycle text; kept_steps jsonb; tracking jsonb; now_text text := now()::text;
begin
  if new.id <> 'academic_cycle' then return new; end if;
  old_cycle := coalesce(old.data->>'semesterTag', trim(concat(old.data->>'academicYear',' ',old.data->>'semester')));
  new_cycle := coalesce(new.data->>'semesterTag', trim(concat(new.data->>'academicYear',' ',new.data->>'semester')));
  if nullif(new_cycle,'') is null or new_cycle = old_cycle then return new; end if;
  for a in select * from public.scholarship_applications
    where nullif(data->>'studentId','') is not null and nullif(data->>'committedAt','') is not null
      and lower(coalesce(data->>'status','')) not in ('withdrawn','rejected','denied','cancelled','archived','expired')
    for update loop
    tracking := coalesce(a.data->'tracking','{}'::jsonb);
    select coalesce(jsonb_agg(value), '[]'::jsonb) into kept_steps
      from jsonb_array_elements(coalesce(tracking->'completedStepIds','[]'::jsonb)) value
      where value #>> '{}' in ('account','announcement_apply','scholarship_apply','kwsp_apply');
    insert into public.student_history_events(id,student_id,event_type,academic_cycle,occurred_at,related_type,related_id,route,description,safe_data)
      values('history_cycle_' || md5(a.id || ':' || old_cycle || ':' || new_cycle),a.data->>'studentId','academic_cycle_completed',old_cycle,now(),
        'application',a.id,'/student-dashboard/history','Scholarship cycle completed and preserved before renewal.',
        jsonb_build_object('nextCycle',new_cycle,'scholarshipName',coalesce(a.data->>'scholarshipName',a.data->>'scholarshipTitle')))
      on conflict(id) do nothing;
    tracking := tracking || jsonb_build_object('completedStepIds',kept_steps,'currentStepId','document_uploading','semesterTag',new_cycle,'updatedAt',now_text,
      'cycleSnapshots',coalesce(tracking->'cycleSnapshots','[]'::jsonb) || jsonb_build_array(jsonb_build_object(
        'academicCycle',old_cycle,'completedStepIds',coalesce(tracking->'completedStepIds','[]'::jsonb),'snapshottedAt',now_text)));
    update public.scholarship_applications set data=(a.data - array['signedSoeSubmissionId','signedSoeStatus','signedSoeReopenReason','finishedAt'])
      || jsonb_build_object('academicCycle',new_cycle,'semesterTag',new_cycle,'tracking',tracking,'updatedAt',now_text), updated_at=now() where id=a.id;
  end loop;
  return new;
end;
$$;

drop trigger if exists restart_scholarships_after_cycle_change on public.system_configuration;
create trigger restart_scholarships_after_cycle_change after update on public.system_configuration
for each row execute function public.restart_scholarship_cycle_history();

insert into public.student_history_events(id, student_id, event_type, academic_cycle, occurred_at, related_type, related_id, route, description, safe_data)
select 'history_application_' || a.id, a.data->>'studentId', 'application_created',
  coalesce(a.data->>'academicCycle', a.data->>'semesterTag'), coalesce(a.created_at, a.updated_at, now()),
  'application', a.id, '/student-dashboard/scholarships',
  'Application recorded for ' || coalesce(a.data->>'scholarshipTitle', a.data->>'scholarshipName', 'a scholarship') || '.',
  jsonb_build_object('status',coalesce(a.data->>'status','Pending'))
from public.scholarship_applications a where nullif(a.data->>'studentId','') is not null
on conflict(id) do nothing;

insert into public.student_history_events(id, student_id, event_type, academic_cycle, occurred_at, related_type, related_id, route, description, safe_data)
select 'history_document_' || d.id, d.data->>'studentId', 'document_' || lower(coalesce(d.data->>'status','submitted')),
  d.data->>'academicCycle', coalesce(d.updated_at,d.created_at,now()), 'document', d.id, '/student-dashboard/profile',
  coalesce(initcap(replace(d.data->>'documentType','_',' ')),'Document') || ' ' || lower(coalesce(d.data->>'status','submitted')) || '.', '{}'::jsonb
from public.student_document_submissions d where nullif(d.data->>'studentId','') is not null
on conflict(id) do nothing;

revoke all on function public.protect_security_history_event() from public, anon, authenticated;
revoke all on function public.issue_portal_email_challenge(text,uuid,text,text,text) from public, anon, authenticated;
revoke all on function public.check_portal_email_challenge(text,text) from public, anon, authenticated;
revoke all on function public.complete_portal_verified_session(text,text,uuid,uuid,text,text,text) from public, anon, authenticated;
revoke all on function public.validate_portal_verified_session(uuid,uuid) from public, anon, authenticated;
revoke all on function public.discard_portal_auth_session(uuid,uuid) from public, anon, authenticated;
revoke all on function public.complete_public_recovery_profile(text,text) from public, anon, authenticated;
revoke all on function public.portal_email_in_use(text,uuid) from public, anon, authenticated;
revoke all on function public.finalize_signed_soe_submission(text,text,text,text,text,text,text,text,bigint) from public, anon, authenticated;
revoke all on function public.reopen_signed_soe_submission(text,text,text) from public, anon, authenticated;
revoke all on function public.restart_scholarship_cycle_history() from public, anon, authenticated;
grant execute on function public.issue_portal_email_challenge(text,uuid,text,text,text) to service_role;
grant execute on function public.check_portal_email_challenge(text,text) to service_role;
grant execute on function public.complete_portal_verified_session(text,text,uuid,uuid,text,text,text) to service_role;
grant execute on function public.validate_portal_verified_session(uuid,uuid) to service_role;
grant execute on function public.discard_portal_auth_session(uuid,uuid) to service_role;
grant execute on function public.complete_public_recovery_profile(text,text) to service_role;
grant execute on function public.portal_email_in_use(text,uuid) to service_role;
grant execute on function public.finalize_signed_soe_submission(text,text,text,text,text,text,text,text,bigint) to service_role;
grant execute on function public.reopen_signed_soe_submission(text,text,text) to service_role;

commit;
