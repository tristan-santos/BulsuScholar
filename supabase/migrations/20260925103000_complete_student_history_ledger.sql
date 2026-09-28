-- Complete the student-safe append-only history ledger without exposing staff notes.
begin;

create or replace function public.record_student_application_history()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  student_id text := coalesce(new.data->>'studentId', '');
  event_type text;
  stage text := coalesce(new.data#>>'{tracking,currentStepId}', new.data#>>'{tracking,currentStage}', '');
  old_stage text := case when tg_op = 'UPDATE' then coalesce(old.data#>>'{tracking,currentStepId}', old.data#>>'{tracking,currentStage}', '') else '' end;
  status text := lower(coalesce(new.data->>'status', 'applied'));
  old_status text := case when tg_op = 'UPDATE' then lower(coalesce(old.data->>'status', '')) else '' end;
  cycle text := coalesce(new.data->>'academicCycle', new.data->>'semesterTag', '');
  description text;
begin
  if student_id = '' then return new; end if;
  if tg_op = 'INSERT' then
    event_type := 'application_created';
    description := 'Scholarship application recorded.';
  elsif new.data->>'withdrawnAt' is distinct from old.data->>'withdrawnAt' and new.data->>'withdrawnAt' is not null then
    event_type := 'application_withdrawn';
    description := 'Scholarship application withdrawn.';
  elsif coalesce(new.data->>'cooldownUntil','') is distinct from coalesce(old.data->>'cooldownUntil','') then
    event_type := 'application_cooldown_updated';
    description := 'Application cooldown updated.';
  elsif coalesce(new.data#>>'{scholarshipCommitment,applicationId}','') is distinct from coalesce(old.data#>>'{scholarshipCommitment,applicationId}','') then
    event_type := 'scholarship_commitment_updated';
    description := 'Scholarship commitment updated.';
  elsif stage is distinct from old_stage then
    event_type := 'tracking_stage_updated';
    description := 'Scholarship tracking advanced to ' || coalesce(nullif(stage,''), 'the next stage') || '.';
  elsif status is distinct from old_status then
    event_type := 'application_status_updated';
    description := 'Scholarship application status changed to ' || initcap(status) || '.';
  else
    return new;
  end if;
  insert into public.student_history_events(id,student_id,event_type,academic_cycle,occurred_at,related_type,related_id,route,description,safe_data)
  values ('history_application_event_' || md5(new.id || ':' || event_type || ':' || status || ':' || stage || ':' || coalesce(new.data->>'cooldownUntil','')),
    student_id,event_type,cycle,now(),'application',new.id,'/student-dashboard/scholarships',description,
    jsonb_build_object('status',new.data->>'status','stage',stage,'scholarshipName',coalesce(new.data->>'scholarshipName',new.data->>'scholarshipTitle')))
  on conflict(id) do nothing;
  return new;
end;
$$;

create or replace function public.record_student_document_history()
returns trigger language plpgsql security definer set search_path = '' as $$
declare student_id text := coalesce(new.data->>'studentId',''); status text := lower(coalesce(new.data->>'status','pending'));
begin
  if student_id = '' or (tg_op = 'UPDATE' and status = lower(coalesce(old.data->>'status','pending'))) then return new; end if;
  insert into public.student_history_events(id,student_id,event_type,academic_cycle,occurred_at,related_type,related_id,route,description,safe_data)
  values ('history_document_event_' || md5(new.id || ':' || status),student_id,'document_' || status,new.data->>'academicCycle',now(),'document',new.id,
    '/student-dashboard/profile',initcap(replace(coalesce(new.data->>'documentType','document'),'_',' ')) || ' ' || status || '.',
    jsonb_build_object('documentType',new.data->>'documentType','status',status)) on conflict(id) do nothing;
  return new;
end;
$$;

create or replace function public.record_roster_history()
returns trigger language plpgsql security definer set search_path = '' as $$
declare student_id text := coalesce(new.data->>'studentId',new.data->>'studentnumber',new.data->>'studentNumber','');
begin
  if student_id = '' then return new; end if;
  if tg_op = 'UPDATE' and new.data is not distinct from old.data then return new; end if;
  insert into public.student_history_events(id,student_id,event_type,occurred_at,related_type,related_id,route,description,safe_data)
  values ('history_roster_event_' || md5(new.id || ':' || coalesce(new.data->>'archived','false') || ':' || coalesce(new.data->>'status','active')),
    student_id,case when lower(coalesce(new.data->>'archived','false')) = 'true' then 'roster_archived' else 'roster_updated' end,now(),'roster',new.id,
    '/student-dashboard/scholarships',case when lower(coalesce(new.data->>'archived','false')) = 'true' then 'Roster scholarship record archived.' else 'Roster scholarship record updated.' end,
    jsonb_build_object('grantorId',coalesce(new.data->>'grantorId',new.parent_id),'status',new.data->>'status')) on conflict(id) do nothing;
  return new;
end;
$$;

create or replace function public.record_waitlist_history()
returns trigger language plpgsql security definer set search_path = '' as $$
declare student_id text := new.student_id; status text := coalesce(new.status,'queued');
begin
  if tg_op = 'UPDATE' and status = old.status then return new; end if;
  insert into public.student_history_events(id,student_id,event_type,occurred_at,related_type,related_id,route,description,safe_data)
  values ('history_waitlist_event_' || md5(new.id || ':' || status),student_id,'waitlist_' || status,now(),'waitlist',new.id,
    '/student-dashboard/scholarships','Waitlist status changed to ' || initcap(status) || '.',jsonb_build_object('announcementId',new.announcement_id,'status',status)) on conflict(id) do nothing;
  return new;
end;
$$;

create or replace function public.record_student_commitment_history()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  old_commitment text := case when tg_op = 'UPDATE' then coalesce(old.data#>>'{scholarshipCommitment,applicationId}','') else '' end;
  new_commitment text := coalesce(new.data#>>'{scholarshipCommitment,applicationId}','');
begin
  if tg_op <> 'UPDATE' or old_commitment is not distinct from new_commitment then return new; end if;
  insert into public.student_history_events(id,student_id,event_type,occurred_at,related_type,related_id,route,description,safe_data)
  values ('history_commitment_event_' || md5(new.id || ':' || new_commitment),new.id,
    case when new_commitment = '' then 'scholarship_commitment_released' else 'scholarship_commitment_created' end,
    now(),'application',null,'/student-dashboard/scholarships',
    case when new_commitment = '' then 'Scholarship commitment released.' else 'Scholarship commitment recorded.' end,
    jsonb_build_object('applicationId',new_commitment)) on conflict(id) do nothing;
  return new;
end;
$$;

drop trigger if exists history_application_events on public.scholarship_applications;
create trigger history_application_events after insert or update on public.scholarship_applications for each row execute function public.record_student_application_history();
drop trigger if exists history_document_events on public.student_document_submissions;
create trigger history_document_events after insert or update on public.student_document_submissions for each row execute function public.record_student_document_history();
drop trigger if exists history_roster_events on public.grantor_portal_scholars;
create trigger history_roster_events after insert or update on public.grantor_portal_scholars for each row execute function public.record_roster_history();
drop trigger if exists history_waitlist_events on public.scholarship_waitlist_entries;
create trigger history_waitlist_events after insert or update on public.scholarship_waitlist_entries for each row execute function public.record_waitlist_history();
drop trigger if exists history_student_commitment_events on public.students;
create trigger history_student_commitment_events after update on public.students for each row execute function public.record_student_commitment_history();

revoke all on function public.record_student_application_history() from public, anon, authenticated;
revoke all on function public.record_student_document_history() from public, anon, authenticated;
revoke all on function public.record_roster_history() from public, anon, authenticated;
revoke all on function public.record_waitlist_history() from public, anon, authenticated;
revoke all on function public.record_student_commitment_history() from public, anon, authenticated;
commit;
