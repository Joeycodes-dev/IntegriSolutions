-- Chat file attachments table for storing file metadata
create table if not exists public.chat_attachments (
  id bigserial primary key,
  message_id bigint not null references public.chat_messages(id) on delete cascade,
  file_name text not null,
  file_type text not null,
  file_size bigint not null check (file_size > 0 and file_size <= 10485760), -- 10MB max
  storage_path text not null unique,
  storage_url text not null,
  created_at timestamptz not null default now()
);

-- Track when attachments are viewed (similar to message read receipts)
create table if not exists public.chat_attachment_reads (
  attachment_id bigint not null references public.chat_attachments(id) on delete cascade,
  viewer_source text not null check (viewer_source in ('officer_users', 'supervisor_users', 'admin_users')),
  viewer_id bigint not null,
  role_id integer not null,
  viewer_name text not null,
  badge_number text,
  opened_at timestamptz not null default now(),
  primary key (attachment_id, viewer_source, viewer_id)
);

-- Indexes for performance
create index if not exists idx_chat_attachments_message
  on public.chat_attachments (message_id);

create index if not exists idx_chat_attachment_reads_attachment
  on public.chat_attachment_reads (attachment_id);

create index if not exists idx_chat_attachment_reads_viewer
  on public.chat_attachment_reads (viewer_source, viewer_id);
