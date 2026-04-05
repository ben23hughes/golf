-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- =====================
-- PROFILES
-- =====================
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  name text not null,
  email text not null,
  handicap numeric(4,1),
  ghin_number text,
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- =====================
-- ROUNDS
-- =====================
create table public.rounds (
  id uuid default uuid_generate_v4() primary key,
  course_name text not null,
  date date not null,
  tee_box text not null default 'White',
  created_by uuid references public.profiles(id) on delete cascade not null,
  status text not null default 'active' check (status in ('active', 'completed')),
  created_at timestamptz default now()
);

alter table public.rounds enable row level security;

create policy "Rounds are viewable by anyone with the link"
  on public.rounds for select
  using (true);

create policy "Authenticated users can create rounds"
  on public.rounds for insert
  with check (auth.uid() = created_by);

create policy "Round creator can update"
  on public.rounds for update
  using (auth.uid() = created_by);

-- =====================
-- PLAYERS
-- =====================
create table public.players (
  id uuid default uuid_generate_v4() primary key,
  round_id uuid references public.rounds(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete set null,
  name text not null,
  handicap numeric(4,1),
  created_at timestamptz default now()
);

alter table public.players enable row level security;

create policy "Players are viewable by anyone"
  on public.players for select
  using (true);

create policy "Round creator can manage players"
  on public.players for all
  using (
    exists (
      select 1 from public.rounds
      where rounds.id = players.round_id
      and rounds.created_by = auth.uid()
    )
  );

-- =====================
-- SCORES
-- =====================
create table public.scores (
  id uuid default uuid_generate_v4() primary key,
  round_id uuid references public.rounds(id) on delete cascade not null,
  player_id uuid references public.players(id) on delete cascade not null,
  hole_number int not null check (hole_number between 1 and 18),
  strokes int not null check (strokes > 0),
  created_at timestamptz default now(),
  unique (player_id, hole_number)
);

alter table public.scores enable row level security;

create policy "Scores are viewable by anyone"
  on public.scores for select
  using (true);

create policy "Round creator can manage scores"
  on public.scores for all
  using (
    exists (
      select 1 from public.rounds
      where rounds.id = scores.round_id
      and rounds.created_by = auth.uid()
    )
  );

-- =====================
-- GAMES
-- =====================
create table public.games (
  id uuid default uuid_generate_v4() primary key,
  round_id uuid references public.rounds(id) on delete cascade not null,
  game_type text not null,
  stake numeric(10,2) not null default 0,
  rules_json jsonb not null default '{}',
  created_at timestamptz default now()
);

alter table public.games enable row level security;

create policy "Games are viewable by anyone"
  on public.games for select
  using (true);

create policy "Round creator can manage games"
  on public.games for all
  using (
    exists (
      select 1 from public.rounds
      where rounds.id = games.round_id
      and rounds.created_by = auth.uid()
    )
  );

-- =====================
-- GAME TEMPLATES
-- =====================
create table public.game_templates (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  name text not null,
  games_json jsonb not null default '[]',
  created_at timestamptz default now()
);

alter table public.game_templates enable row level security;

create policy "Users can manage own templates"
  on public.game_templates for all
  using (auth.uid() = user_id);
