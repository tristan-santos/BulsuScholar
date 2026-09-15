begin;

do $migration$
declare
  function_definition text;
begin
  select pg_get_functiondef(to_regprocedure(
    'public.sync_archived_grantor_scholar_choices(text,boolean,text)'
  )) into function_definition;
  function_definition := replace(
    function_definition,
    '''grantor_archive_choice_'' || choice_data->>''applicationId''',
    'concat(''grantor_archive_choice_'', choice_data->>''applicationId'')'
  );
  function_definition := replace(
    function_definition,
    '''grantor_archive_restored_'' || choice_data->>''applicationId'' || ''_'' || md5(choice_data->>''archivedAt'')',
    'concat(''grantor_archive_restored_'', choice_data->>''applicationId'', ''_'', md5(choice_data->>''archivedAt''))'
  );
  execute function_definition;

  select pg_get_functiondef(to_regprocedure(
    'public.commit_archived_grantor_replacement(text,text)'
  )) into function_definition;
  function_definition := replace(
    function_definition,
    '''archived_grantor_replaced_'' || original_choice->>''applicationId''',
    'concat(''archived_grantor_replaced_'', original_choice->>''applicationId'')'
  );
  execute function_definition;

  select pg_get_functiondef(to_regprocedure(
    'public.resolve_archived_grantor_scholar_choice(text,text,text)'
  )) into function_definition;
  function_definition := replace(
    function_definition,
    '''grantor_archive_keep_'' || p_application_id || ''_'' || md5(choice_data->>''archivedAt'')',
    'concat(''grantor_archive_keep_'', p_application_id, ''_'', md5(choice_data->>''archivedAt''))'
  );
  execute function_definition;
end;
$migration$;

commit;
