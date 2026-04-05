create policy "Round participants can update games"
  on public.games for update
  using (
    exists (
      select 1 from public.players
      where players.round_id = games.round_id
        and players.user_id = auth.uid()
    )
  );
