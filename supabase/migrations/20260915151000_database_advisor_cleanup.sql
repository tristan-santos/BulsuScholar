begin;

do $$
begin
  if to_regprocedure('public.prevent_root_audit_mutation()') is not null then
    execute 'alter function public.prevent_root_audit_mutation() set search_path = ''''';
  end if;
end;
$$;

-- Keep system_logs_created_at_idx; both indexes have the same definition.
drop index if exists public.system_logs_created_idx;

commit;
