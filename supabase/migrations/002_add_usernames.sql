create or replace function public.normalize_username(input text)
returns text
language sql
immutable
as $$
  select nullif(
    regexp_replace(
      lower(trim(coalesce(input, ''))),
      '[^a-z0-9_]+',
      '',
      'g'
    ),
    ''
  )
$$;

create or replace function public.generate_unique_username(
  desired_username text,
  fallback_email text,
  fallback_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  base_username text;
  candidate text;
  suffix integer := 0;
begin
  base_username := coalesce(
    public.normalize_username(desired_username),
    public.normalize_username(split_part(coalesce(fallback_email, ''), '@', 1)),
    'user' || replace(left(fallback_id::text, 8), '-', '')
  );

  candidate := base_username;

  loop
    exit when not exists (
      select 1
      from public.profiles
      where lower(username) = lower(candidate)
        and id <> fallback_id
    );

    suffix := suffix + 1;
    candidate := base_username || suffix::text;
  end loop;

  return candidate;
end;
$$;

alter table public.profiles
  add column username text;

update public.profiles
set username = public.generate_unique_username(username, email, id)
where username is null;

alter table public.profiles
  alter column username set not null;

create unique index profiles_username_lower_idx
  on public.profiles (lower(username));

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, name, email, username)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email,
    public.generate_unique_username(new.raw_user_meta_data->>'username', new.email, new.id)
  );
  return new;
end;
$$ language plpgsql security definer;

create or replace function public.get_login_email(login_identifier text)
returns text
language sql
security definer
set search_path = public
as $$
  select email
  from public.profiles
  where lower(username) = lower(trim(login_identifier))
  limit 1
$$;

grant execute on function public.get_login_email(text) to anon, authenticated;
