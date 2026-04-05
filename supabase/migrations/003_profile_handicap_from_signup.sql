create or replace function public.handle_new_user()
returns trigger as $$
declare
  raw_handicap text;
begin
  raw_handicap := new.raw_user_meta_data->>'handicap';

  insert into public.profiles (id, name, email, username, handicap)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email,
    public.generate_unique_username(new.raw_user_meta_data->>'username', new.email, new.id),
    case
      when raw_handicap is null or btrim(raw_handicap) = '' then null
      else raw_handicap::numeric(4,1)
    end
  );
  return new;
end;
$$ language plpgsql security definer;
