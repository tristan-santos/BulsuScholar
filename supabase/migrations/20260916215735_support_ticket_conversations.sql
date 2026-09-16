-- Persistent, backend-owned support conversations between portal users and root.

alter table public.support_feedback
  add column if not exists ticket_number text,
  add column if not exists subject text not null default 'Support request',
  add column if not exists last_message_at timestamptz not null default now();

update public.support_feedback
set ticket_number = 'BST-' || upper(substr(md5(id), 1, 8))
where ticket_number is null or btrim(ticket_number) = '';

alter table public.support_feedback
  alter column ticket_number set not null;

create unique index if not exists support_feedback_ticket_number_unique
  on public.support_feedback(ticket_number);
create index if not exists support_feedback_fifo_queue_idx
  on public.support_feedback(status, created_at asc);
create index if not exists support_feedback_owner_idx
  on public.support_feedback((data->>'userType'), (data->>'userId'), created_at desc);

create table if not exists public.support_ticket_messages (
  id text primary key,
  ticket_id text not null references public.support_feedback(id) on delete cascade,
  sender_id text not null,
  sender_type text not null check (sender_type in ('student', 'grantor', 'admin', 'root')),
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index if not exists support_ticket_messages_thread_idx
  on public.support_ticket_messages(ticket_id, created_at asc, id asc);

insert into public.support_ticket_messages (id, ticket_id, sender_id, sender_type, body, created_at)
select
  'initial-' || feedback.id,
  feedback.id,
  coalesce(nullif(feedback.data->>'userId', ''), 'legacy-user'),
  case
    when lower(coalesce(feedback.data->>'userType', '')) in ('student', 'grantor', 'admin')
      then lower(feedback.data->>'userType')
    else 'admin'
  end,
  left(coalesce(nullif(feedback.data->>'message', ''), 'Legacy support request'), 4000),
  feedback.created_at
from public.support_feedback feedback
where not exists (
  select 1 from public.support_ticket_messages message
  where message.ticket_id = feedback.id
);

alter table public.support_ticket_messages enable row level security;
revoke all on public.support_ticket_messages from anon, authenticated;

do $$ begin
  alter publication supabase_realtime add table public.support_ticket_messages;
exception when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';
