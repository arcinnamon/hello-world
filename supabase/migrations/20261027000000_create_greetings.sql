-- Read-only greetings table for the first UI -> server -> database slice.
-- Additive only: the currently deployed app does not reference this table.

create table public.greetings (
  id         bigint generated always as identity primary key,
  message    text not null check (char_length(message) between 1 and 200),
  created_at timestamptz not null default now()
);

alter table public.greetings enable row level security;

-- Least privilege: the server uses the publishable key (anon role). Read only.
revoke all on public.greetings from anon, authenticated;
grant select on public.greetings to anon, authenticated;

create policy "greetings are publicly readable"
  on public.greetings for select
  to anon, authenticated
  using (true);

insert into public.greetings (message) values
  ('Hello, world.'),
  ('Hello from Supabase.'),
  ('Hello from Vercel.');
