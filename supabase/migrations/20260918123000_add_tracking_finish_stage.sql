-- Include the automatic Finish stage in compliance-pause resume metadata.
create or replace function public.scholarship_resume_step_id(p_application jsonb, p_completed_steps jsonb)
returns text language plpgsql immutable set search_path = '' as $$
declare
  ordered_steps text[];
  highest_completed integer := 0;
  step_index integer;
begin
  if p_application->>'providerType' = 'kuya_win' then
    ordered_steps := case when p_application#>>'{tracking,appliedViaAnnouncement}' = 'true'
      or nullif(p_application->>'announcementId', '') is not null
      then array['account','announcement_apply','kwsp_apply','document_uploading',
        'application_form','document_review','admin_review','interview','application_review',
        'final_screening','request_materials','download_materials','signing_materials','finish']
      else array['account','kwsp_apply','document_uploading','application_form','document_review',
        'admin_review','interview','application_review','final_screening','request_materials',
        'download_materials','signing_materials','finish'] end;
  else
    ordered_steps := case when p_application#>>'{tracking,appliedViaAnnouncement}' = 'true'
      or nullif(p_application->>'announcementId', '') is not null
      then array['account','announcement_apply','scholarship_apply','document_uploading',
        'application_form','document_review','request_materials','download_materials','signing_materials','finish']
      else array['account','scholarship_apply','document_uploading','application_form',
        'document_review','request_materials','download_materials','signing_materials','finish'] end;
  end if;
  for step_index in 1..array_length(ordered_steps, 1) loop
    if p_completed_steps ? ordered_steps[step_index] then highest_completed := step_index; end if;
  end loop;
  if highest_completed < array_length(ordered_steps, 1) then
    return ordered_steps[greatest(highest_completed + 1, 1)];
  end if;
  return ordered_steps[array_length(ordered_steps, 1)];
end;
$$;

revoke all on function public.scholarship_resume_step_id(jsonb, jsonb) from public, anon, authenticated;
