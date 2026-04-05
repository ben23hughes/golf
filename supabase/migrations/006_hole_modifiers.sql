create table public.hole_modifiers (
  id uuid primary key default gen_random_uuid(),
  round_id uuid references public.rounds(id) on delete cascade not null,
  hole_number int not null check (hole_number between 1 and 18),
  multiplier int not null default 1 check (multiplier in (1, 2, 3)),
  unique (round_id, hole_number)
);

alter table public.hole_modifiers enable row level security;

-- Anyone can read modifiers for any round (needed for leaderboard)
create policy "Hole modifiers are publicly readable"
  on public.hole_modifiers for select
  using (true);

-- Only players in the round can insert/update/delete
create policy "Players can manage hole modifiers"
  on public.hole_modifiers for insert
  with check (
    exists (
      select 1 from public.players
      where players.round_id = hole_modifiers.round_id
        and players.user_id = auth.uid()
    )
  );

create policy "Players can update hole modifiers"
  on public.hole_modifiers for update
  using (
    exists (
      select 1 from public.players
      where players.round_id = hole_modifiers.round_id
        and players.user_id = auth.uid()
    )
  );

create policy "Players can delete hole modifiers"
  on public.hole_modifiers for delete
  using (
    exists (
      select 1 from public.players
      where players.round_id = hole_modifiers.round_id
        and players.user_id = auth.uid()
    )
  );
