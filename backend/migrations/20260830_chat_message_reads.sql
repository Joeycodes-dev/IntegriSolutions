create table if not exists public.chat_message_reads (
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  message_id bigint not null references public.chat_messages(id) on delete cascade,
  viewer_source text not null check (viewer_source in ('officer_users', 'supervisor_users', 'admin_users')),
  viewer_id bigint not null,
  role_id integer not null,
  viewer_name text not null,
  badge_number text,
  read_at timestamptz not null default now(),
  primary key (thread_id, message_id, viewer_source, viewer_id)
);

create index if not exists idx_chat_message_reads_thread_message
  on public.chat_message_reads (thread_id, message_id);

create index if not exists idx_chat_message_reads_viewer
  on public.chat_message_reads (viewer_source, viewer_id);
