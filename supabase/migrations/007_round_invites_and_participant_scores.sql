create table public.round_invites (
  id uuid primary key default gen_random_uuid(),
  round_id uuid references public.rounds(id) on delete cascade not null,
  player_id uuid references public.players(id) on delete cascade not null,
  invited_user_id uuid references public.profiles(id) on delete cascade not null,
  invited_by uuid references public.profiles(id) on delete cascade not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz default now(),
  unique (round_id, invited_user_id)
);

alter table public.round_invites enable row level security;

create policy "Users can view relevant round invites"
  on public.round_invites for select
  using (auth.uid() = invited_user_id or auth.uid() = invited_by);

create policy "Round creators can send round invites"
  on public.round_invites for insert
  with check (auth.uid() = invited_by);

create policy "Invited users can respond to round invites"
  on public.round_invites for update
  using (auth.uid() = invited_user_id);

create policy "Invited users can delete round invites"
  on public.round_invites for delete
  using (auth.uid() = invited_user_id or auth.uid() = invited_by);

drop policy if exists "Round creator can manage scores" on public.scores;

create policy "Round participants can manage scores"
  on public.scores for all
  using (
    exists (
      select 1 from public.players
      where players.round_id = scores.round_id
        and players.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.players
      where players.round_id = scores.round_id
        and players.user_id = auth.uid()
    )
  );
