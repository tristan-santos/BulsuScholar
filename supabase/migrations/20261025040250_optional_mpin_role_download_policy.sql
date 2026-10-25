-- Private MPIN state. Versioned compare-and-swap keeps attempts safe across API workers.
create table public.mpin_security (
  principal text primary key,
  state jsonb not null default '{"version":0,"enabled":false}'::jsonb
);
create table public.mpin_authorizations (
  token text primary key, principal text not null, session_id text not null,
  path text not null, payload_digest text not null, generation bigint not null,
  expires_at timestamptz not null default now() + interval '2 minutes'
);
create index mpin_authorizations_expiry_idx on public.mpin_authorizations(expires_at);
create table public.mpin_security_events (
  id bigint generated always as identity primary key,
  principal text not null, event text not null,
  created_at timestamptz not null default now()
);
alter table public.mpin_security enable row level security;
alter table public.mpin_authorizations enable row level security;
alter table public.mpin_security_events enable row level security;
revoke all on public.mpin_security, public.mpin_authorizations, public.mpin_security_events from public, anon, authenticated;
grant select, insert, update on public.mpin_security to service_role;
grant select, insert, delete on public.mpin_authorizations to service_role;
grant select, insert on public.mpin_security_events to service_role;
grant usage on sequence public.mpin_security_events_id_seq to service_role;
create trigger mpin_events_immutable before update or delete on public.mpin_security_events
for each row execute function public.protect_download_audit_history();

create function public.mpin_transaction(p_principal text, p_operation text, p_values jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare current_state jsonb; ticket jsonb; consumed text;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_principal, 745923));
  insert into public.mpin_security(principal) values(p_principal) on conflict do nothing;
  select state into current_state from public.mpin_security where principal = p_principal for update;
  if p_operation = 'read' then return current_state; end if;
  if p_operation = 'commit' then
    if (current_state->>'version')::bigint <> (p_values->>'version')::bigint then
      return jsonb_build_object('committed',false);
    end if;
    update public.mpin_security set state = (p_values->'state') || jsonb_build_object('version',(current_state->>'version')::bigint+1)
      where principal = p_principal;
    insert into public.mpin_security_events(principal,event) values(p_principal,p_values->>'event');
    ticket := p_values->'ticket';
    if ticket is not null then
      insert into public.mpin_authorizations(token,principal,session_id,path,payload_digest,generation)
      values(ticket->>'token',p_principal,ticket->>'session',ticket->>'path',ticket->>'digest',(ticket->>'generation')::bigint);
    end if;
    delete from public.mpin_authorizations where expires_at < now();
    return jsonb_build_object('committed',true);
  end if;
  if p_operation = 'consume' then
    delete from public.mpin_authorizations where token = p_values->>'token' and principal = p_principal
      and session_id = p_values->>'session' and path = p_values->>'path'
      and payload_digest = p_values->>'digest' and expires_at > now()
      and generation = coalesce((current_state->>'generation')::bigint,0)
      returning token into consumed;
    if consumed is not null then
      insert into public.mpin_security_events(principal,event) values(p_principal,'action_authorized');
    end if;
    return jsonb_build_object('consumed',consumed is not null);
  end if;
  raise exception 'invalid_mpin_operation';
end;
$$;
revoke all on function public.mpin_transaction(text,text,jsonb) from public, anon, authenticated;
grant execute on function public.mpin_transaction(text,text,jsonb) to service_role;
