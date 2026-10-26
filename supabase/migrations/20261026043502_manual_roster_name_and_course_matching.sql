-- Match manual Given/Middle/Surname fields to Excel's Surname, Given/Middle format.
-- Course labels from the manual dropdown share the same keys as roster abbreviations.
create or replace function public.roster_import_profile_key(p_data jsonb)
returns text language sql immutable security invoker set search_path = '' as $$
  with raw as (
    select coalesce(nullif(trim(p_data->>'fullName'), ''),
      concat_ws(' ', nullif(trim(p_data->>'fname'), ''), nullif(trim(p_data->>'mname'), ''), nullif(trim(p_data->>'lname'), ''))) as name
  ), fields as (
    select trim(regexp_replace(lower(case when position(',' in name) > 0
        then substring(name from position(',' in name)+1) || ' ' || split_part(name, ',', 1) else name end), '[^a-z0-9]+', ' ', 'g')) as name,
      regexp_replace(lower(coalesce(p_data->>'course', '')), '[^a-z0-9]+', '', 'g') as course,
      trim(regexp_replace(lower(coalesce(nullif(p_data->>'yearLevel',''), nullif(p_data->>'year',''), p_data->>'yearLevelLabel', '')), '[^a-z0-9]+', ' ', 'g')) as year
    from raw
  ), normalized as (
    select name, case course
      when 'bachelorofelementaryeducation' then 'beed'
      when 'bachelorofearlychildhoodeducation' then 'beced'
      when 'bachelorofsecondaryeducation' then 'bsed'
      when 'bacheloroftechnologyandlivelihoodeducationhomeeconomics' then 'btledhe'
      when 'bachelorofphysicaleducation' then 'bped'
      when 'bachelorofscienceinbusinessadministration' then 'bsba'
      when 'bachelorofscienceinentrepreneurship' then 'bsentrep'
      when 'bachelorofscienceininformationtechnology' then 'bsit'
      when 'bachelorofscienceincomputerengineering' then 'bscpe'
      when 'bachelorofscienceinindustrialengineering' then 'bsie'
      when 'bachelorinindustrialtechnology' then 'bit'
      else course end as course,
      case when year ~ '^(year )?([1-6])(st|nd|rd|th)?( year)?$'
        then substring(year from '[1-6]') else year end as year from fields
  )
  select case when name <> '' and course <> '' and year <> '' then name || '|' || course || '|' || year else null end from normalized;
$$;
revoke all on function public.roster_import_profile_key(jsonb) from public, anon, authenticated;
grant execute on function public.roster_import_profile_key(jsonb) to service_role;
