create policy "Round creator can delete"
  on public.rounds for delete
  using (auth.uid() = created_by);
