-- Goals, disciplines and nutrition (not yet connected). Mirrors src/lib/types.ts v2.
alter table public.profiles
  add column secondary_goals text[] not null default '{}',
  add column disciplines text[] not null default '{}',
  add column primary_discipline text,
  add column goal_history jsonb not null default '[]'::jsonb;
alter table public.profiles drop constraint if exists profiles_goal_check;

create table public.nutrition_prefs (
  user_id uuid primary key references auth.users on delete cascade,
  prefs jsonb not null,            -- pattern, allergies, dislikes, kitchen, optional body data
  budget jsonb,
  prices jsonb not null default '{}'::jsonb,
  location_label text,             -- coarse only; no location history is stored
  location_lat numeric(5,2),
  location_lon numeric(6,2),
  updated_at timestamptz not null default now()
);
create table public.meal_plans (id text primary key, user_id uuid not null references auth.users on delete cascade, plan jsonb not null, status text not null, created_at timestamptz not null default now());
create table public.grocery_items (id text primary key, user_id uuid not null references auth.users on delete cascade, item jsonb not null, checked boolean not null default false);
create table public.meal_log (id text primary key, user_id uuid not null references auth.users on delete cascade, date date not null, entry jsonb not null);
create table public.meal_feedback (id bigserial primary key, user_id uuid not null references auth.users on delete cascade, recipe_id text not null, kind text not null, at timestamptz not null default now());
create table public.food_spending (id text primary key, user_id uuid not null references auth.users on delete cascade, date date not null, amount numeric(10,2) not null check (amount >= 0), kind text not null check (kind in ('grocery','eating_out')), note text);
create table public.saved_places (id text, user_id uuid not null references auth.users on delete cascade, place jsonb not null, primary key (user_id, id));

do $$
declare t text;
begin
  foreach t in array array['nutrition_prefs','meal_plans','grocery_items','meal_log','meal_feedback','food_spending','saved_places'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "own rows" on public.%I for all using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;
