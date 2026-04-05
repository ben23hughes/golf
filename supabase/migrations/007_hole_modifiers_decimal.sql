alter table public.hole_modifiers
  alter column multiplier type numeric(10,2) using multiplier::numeric,
  alter column multiplier set default 1;

alter table public.hole_modifiers
  drop constraint if exists hole_modifiers_multiplier_check;

alter table public.hole_modifiers
  add constraint hole_modifiers_multiplier_check check (multiplier > 0);
