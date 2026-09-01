alter table public.chat_messages
add column if not exists priority text not null default 'medium'
check (priority in ('high', 'medium', 'low'));
