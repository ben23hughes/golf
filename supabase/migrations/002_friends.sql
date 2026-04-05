-- =====================
-- Add username to profiles
-- =====================
alter table public.profiles
  add column if not exists username text unique;

-- Update RLS: friends can view each other's profiles
drop policy if exists "Users can view own profile" on public.profiles;

create policy "Users can view profiles"
  on public.profiles for select
  using (true); -- profiles are public for friend discovery

-- =====================
-- FRIENDSHIPS
-- =====================
create table public.friendships (
  id uuid default uuid_generate_v4() primary key,
  requester_id uuid references public.profiles(id) on delete cascade not null,
  addressee_id uuid references public.profiles(id) on delete cascade not null,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz default now(),
  unique (requester_id, addressee_id)
);

alter table public.friendships enable row level security;

create policy "Users can view their own friendships"
  on public.friendships for select
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

create policy "Users can send friend requests"
  on public.friendships for insert
  with check (auth.uid() = requester_id);

create policy "Addressee can accept requests"
  on public.friendships for update
  using (auth.uid() = addressee_id);

create policy "Either party can remove friendship"
  on public.friendships for delete
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

-- =====================
-- RPC: lookup email by username (for login)
-- =====================
create or replace function public.get_login_email(login_identifier text)
returns text
language sql
security definer
stable
as $$
  select email from public.profiles
  where lower(username) = lower(login_identifier)
  limit 1;
$$;

-- =====================
-- RPC: search users by username/name (for adding friends)
-- =====================
create or replace function public.search_users(query text, requesting_user_id uuid)
returns table (
  id uuid,
  name text,
  username text
)
language sql
security definer
stable
as $$
  select p.id, p.name, p.username
  from public.profiles p
  where p.id != requesting_user_id
    and (
      lower(p.username) like lower(query || '%')
      or lower(p.name) like lower(query || '%')
    )
  limit 10;
$$;
