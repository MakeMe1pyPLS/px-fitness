-- PX coaching: coach accounts own their business data; clients can only create
-- inquiries and read the coach's public profile. Not yet connected.
create table public.coaches (
  user_id uuid primary key references auth.users on delete cascade,
  profile jsonb not null default '{}'::jsonb,   -- public: name, headline, bio, specialties, location
  hours jsonb not null default '{}'::jsonb,     -- public
  links jsonb not null default '{}'::jsonb,     -- public: calendly, meet, email
  tiers jsonb not null default '[]'::jsonb,     -- public
  tiers_confirmed boolean not null default false
);
create table public.coach_clients (id text primary key, coach_id uuid not null references public.coaches on delete cascade, client_user_id uuid references auth.users, data jsonb not null);
create table public.coach_sessions (id text primary key, coach_id uuid not null references public.coaches on delete cascade, data jsonb not null);
create table public.coach_payments (id text primary key, coach_id uuid not null references public.coaches on delete cascade, data jsonb not null);
create table public.inquiries (
  id text primary key, coach_id uuid not null references public.coaches on delete cascade,
  from_user_id uuid references auth.users, name text not null, contact text not null,
  tier_id text, preferred text, message text, status text not null default 'new', created_at timestamptz not null default now()
);
alter table public.coaches enable row level security;
create policy "public profile readable" on public.coaches for select using (true);
create policy "coach edits own" on public.coaches for all using (user_id = auth.uid()) with check (user_id = auth.uid());
do $$ declare t text; begin
  foreach t in array array['coach_clients','coach_sessions','coach_payments'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "coach only" on public.%I for all using (coach_id = auth.uid()) with check (coach_id = auth.uid())', t);
  end loop; end $$;
alter table public.inquiries enable row level security;
create policy "anyone signed in can ask" on public.inquiries for insert with check (auth.uid() is not null);
create policy "coach reads and updates own" on public.inquiries for select using (coach_id = auth.uid());
create policy "coach updates status" on public.inquiries for update using (coach_id = auth.uid());
