create extension if not exists pgcrypto;

create table if not exists public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'emergency' check (kind in ('emergency', 'direct', 'group')),
  title text,
  created_by_source text not null check (created_by_source in ('officer_users', 'supervisor_users', 'admin_users')),
  created_by_id bigint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chat_participants (
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  participant_source text not null check (participant_source in ('officer_users', 'supervisor_users', 'admin_users')),
  participant_id bigint not null,
  role_id integer not null,
  display_name text not null,
  badge_number text,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz,
  primary key (thread_id, participant_source, participant_id)
);

create table if not exists public.chat_messages (
  id bigserial primary key,
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  sender_source text not null check (sender_source in ('officer_users', 'supervisor_users', 'admin_users')),
  sender_id bigint not null,
  sender_role_id integer not null,
  sender_name text not null,
  body text not null check (char_length(body) between 1 and 4000),
  is_emergency boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_chat_threads_updated_at
  on public.chat_threads (updated_at desc);

create index if not exists idx_chat_participants_actor
  on public.chat_participants (participant_source, participant_id);

create index if not exists idx_chat_messages_thread_created
  on public.chat_messages (thread_id, created_at desc);

create or replace function public.touch_chat_thread_updated_at()
returns trigger
language plpgsql
as $$
begin
  update public.chat_threads
  set updated_at = now()
  where id = new.thread_id;
  return new;
end;
$$;

drop trigger if exists trg_chat_messages_touch_thread on public.chat_messages;
create trigger trg_chat_messages_touch_thread
after insert on public.chat_messages
for each row execute function public.touch_chat_thread_updated_at();
