create or replace function public.search_round_players(query text, current_user_id uuid default null)
returns table (
  id uuid,
  name text,
  username text,
  handicap numeric,
  avatar_url text
)
language sql
security definer
stable
as $$
  select p.id, p.name, p.username, p.handicap, p.avatar_url
  from public.profiles p
  where (
    lower(p.username) like lower(query || '%')
    or lower(p.name) like lower(query || '%')
  )
  order by
    case
      when lower(p.username) = lower(query) then 0
      when lower(p.name) = lower(query) then 1
      when lower(p.username) like lower(query || '%') then 2
      else 3
    end,
    p.name asc
  limit 8
$$;

grant execute on function public.search_round_players(text, uuid) to anon, authenticated;
