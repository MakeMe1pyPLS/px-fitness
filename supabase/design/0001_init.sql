-- Kova cloud schema (not yet connected). Mirrors src/lib/types.ts.
-- Every table is owned by auth.uid() and protected by row-level security.

create table public.profiles (
  user_id uuid primary key references auth.users on delete cascade,
  name text,
  goal text not null check (goal in ('strength','muscle','general','endurance')),
  experience text not null check (experience in ('beginner','intermediate','advanced')),
  equipment text[] not null default '{}',
  session_minutes int not null check (session_minutes between 10 and 180),
  training_days int[] not null,
  preferred_time text not null,
  unit text not null default 'lb' check (unit in ('lb','kg')),
  checkins_enabled boolean not null default true,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.templates (
  id text primary key,
  user_id uuid not null references auth.users on delete cascade,
  name text not null,
  focus text,
  exercises jsonb not null,
  position int not null default 0,
  updated_at timestamptz not null default now()
);

create table public.sessions (
  id text primary key,
  user_id uuid not null references auth.users on delete cascade,
  template_id text,
  name text not null,
  variant text not null check (variant in ('full','short')),
  planned_for date not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  status text not null check (status in ('in_progress','completed','abandoned')),
  exercises jsonb not null,
  effort smallint check (effort between 1 and 5),
  note text,
  updated_at timestamptz not null default now()
);
create index sessions_user_date on public.sessions (user_id, planned_for desc);

create table public.skips (
  id text primary key,
  user_id uuid not null references auth.users on delete cascade,
  date date not null,
  reason text not null,
  note text,
  created_at timestamptz not null default now(),
  unique (user_id, date)
);

-- Check-ins are sensitive (mood, sleep): minimal fields, user-deletable.
create table public.checkins (
  user_id uuid not null references auth.users on delete cascade,
  date date not null,
  mood smallint check (mood between 1 and 5),
  energy smallint check (energy between 1 and 5),
  stress smallint check (stress between 1 and 5),
  soreness smallint check (soreness between 1 and 5),
  sleep_hours numeric(3,1),
  available_minutes int,
  note text,
  updated_at timestamptz not null default now(),
  primary key (user_id, date)
);

create table public.recommendations (
  id text primary key,
  user_id uuid not null references auth.users on delete cascade,
  rule_id text not null,
  status text not null check (status in ('accepted','dismissed','not_accurate')),
  summary text not null,
  baseline_rate numeric,
  created_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['profiles','templates','sessions','skips','checkins','recommendations'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "own rows" on public.%I for all using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;
