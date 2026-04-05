alter table public.games
  add column name text;

update public.games
set name = initcap(replace(game_type, '_', ' '))
where name is null;

alter table public.games
  alter column name set not null;
