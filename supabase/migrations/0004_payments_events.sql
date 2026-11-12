-- PX-Fitness: in-app coaching payments (Stripe Connect, direct charges) and PX Saturdays events.
--
-- Money: clients pay the coach's own Stripe account directly. Stripe takes its fee from the
-- coach's side; the platform takes no cut. Only the server (Stripe webhook / API functions,
-- using the service role) can write payout status or payment records.

-- ── coaching payments ───────────────────────────────────────────────────
create table public.coach_payouts (
  coach_id uuid primary key references auth.users on delete cascade,
  stripe_account_id text not null unique,
  charges_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.coach_offers (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  price_cents int not null check (price_cents between 500 and 100000),
  sessions int not null default 1 check (sessions between 1 and 50),
  minutes int check (minutes between 10 and 240),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index coach_offers_coach on public.coach_offers (coach_id);

create table public.coaching_payments (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users on delete cascade,
  client_id uuid not null references auth.users on delete cascade,
  offer_name text not null,
  amount_cents int not null,
  currency text not null default 'usd',
  status text not null default 'paid' check (status in ('paid', 'refunded')),
  note text,
  stripe_session_id text not null unique,
  created_at timestamptz not null default now()
);
create index coaching_payments_coach on public.coaching_payments (coach_id, created_at desc);

alter table public.coach_payouts enable row level security;
alter table public.coach_offers enable row level security;
alter table public.coaching_payments enable row level security;

create policy "payouts: coach reads own" on public.coach_payouts for select to authenticated using (coach_id = (select auth.uid()));
-- (no insert/update policies: only server functions write payout status)

create policy "offers: coach and linked clients read" on public.coach_offers for select to authenticated
  using (coach_id = (select auth.uid()) or public.is_coach_of(coach_id, (select auth.uid())));
create policy "offers: coach adds own" on public.coach_offers for insert to authenticated
  with check (coach_id = (select auth.uid()) and exists (select 1 from public.social_profiles where user_id = (select auth.uid()) and is_coach));
create policy "offers: coach edits own" on public.coach_offers for update to authenticated
  using (coach_id = (select auth.uid())) with check (coach_id = (select auth.uid()));
create policy "offers: coach removes own" on public.coach_offers for delete to authenticated using (coach_id = (select auth.uid()));

create policy "payments: coach and client read" on public.coaching_payments for select to authenticated
  using ((select auth.uid()) in (coach_id, client_id));
-- (no insert/update policies: only the Stripe webhook records payments)

-- ── PX Saturdays (coach events) ─────────────────────────────────────────
create table public.coach_events (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  starts_at timestamptz not null,
  minutes int not null default 60 check (minutes between 15 and 480),
  location text not null check (char_length(location) between 1 and 160),
  details text check (char_length(details) <= 500),
  capacity int check (capacity between 1 and 500),
  cancelled boolean not null default false,
  created_at timestamptz not null default now()
);
create index coach_events_coach on public.coach_events (coach_id, starts_at);

create table public.event_rsvps (
  event_id uuid not null references public.coach_events on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

alter table public.coach_events enable row level security;
alter table public.event_rsvps enable row level security;

-- Coaches post and manage their own events. Everyone else reads them through get_event /
-- my_events (anyone with the link can see one event; friends and clients see the list).
create policy "events: coach reads own" on public.coach_events for select to authenticated using (coach_id = (select auth.uid()));
create policy "events: coach posts" on public.coach_events for insert to authenticated
  with check (coach_id = (select auth.uid()) and exists (select 1 from public.social_profiles where user_id = (select auth.uid()) and is_coach));
create policy "events: coach edits" on public.coach_events for update to authenticated using (coach_id = (select auth.uid())) with check (coach_id = (select auth.uid()));
create policy "events: coach deletes" on public.coach_events for delete to authenticated using (coach_id = (select auth.uid()));

create policy "rsvps: see own" on public.event_rsvps for select to authenticated using (user_id = (select auth.uid()));
create policy "rsvps: cancel own" on public.event_rsvps for delete to authenticated using (user_id = (select auth.uid()));
-- (RSVPs are created through rsvp_event so capacity is enforced)

create or replace function public.event_view(e public.coach_events)
returns json language sql stable security definer set search_path = '' as $$
  select json_build_object(
    'id', e.id, 'coach_id', e.coach_id, 'coach_name', (select display_name from public.social_profiles where user_id = e.coach_id),
    'title', e.title, 'starts_at', e.starts_at, 'minutes', e.minutes, 'location', e.location, 'details', e.details,
    'capacity', e.capacity, 'cancelled', e.cancelled,
    'going', (select count(*) from public.event_rsvps r where r.event_id = e.id),
    'me_going', exists (select 1 from public.event_rsvps r where r.event_id = e.id and r.user_id = auth.uid()));
$$;

-- One event, for anyone signed in who has the link.
create or replace function public.get_event(event uuid)
returns json language sql stable security definer set search_path = '' as $$
  select public.event_view(e) from public.coach_events e where e.id = event;
$$;

-- Upcoming events from coaches I'm friends with or linked to, plus my own.
create or replace function public.my_events()
returns setof json language sql stable security definer set search_path = '' as $$
  select public.event_view(e) from public.coach_events e
  where e.starts_at > now() - interval '6 hours'
    and (e.coach_id = auth.uid() or public.are_friends(e.coach_id, auth.uid()) or public.is_coach_of(e.coach_id, auth.uid())
         or exists (select 1 from public.event_rsvps r where r.event_id = e.id and r.user_id = auth.uid()))
  order by e.starts_at;
$$;

create or replace function public.rsvp_event(event uuid)
returns json language plpgsql security definer set search_path = '' as $$
declare e public.coach_events; n int;
begin
  if auth.uid() is null then return json_build_object('ok', false, 'reason', 'signed_out'); end if;
  select * into e from public.coach_events where id = event for update;
  if not found then return json_build_object('ok', false, 'reason', 'not_found'); end if;
  if e.cancelled then return json_build_object('ok', false, 'reason', 'cancelled'); end if;
  if e.starts_at < now() then return json_build_object('ok', false, 'reason', 'past'); end if;
  if exists (select 1 from public.event_rsvps where event_id = event and user_id = auth.uid()) then return json_build_object('ok', true); end if;
  select count(*) into n from public.event_rsvps where event_id = event;
  if e.capacity is not null and n >= e.capacity then return json_build_object('ok', false, 'reason', 'full'); end if;
  insert into public.event_rsvps (event_id, user_id) values (event, auth.uid());
  return json_build_object('ok', true);
end;
$$;

-- Coach sees who's coming to their own event.
create or replace function public.event_attendees(event uuid)
returns table (user_id uuid, display_name text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select r.user_id, coalesce(p.display_name, 'PX member'), r.created_at
  from public.event_rsvps r
  join public.coach_events e on e.id = r.event_id and e.coach_id = auth.uid()
  left join public.social_profiles p on p.user_id = r.user_id
  where r.event_id = event
  order by r.created_at;
$$;

revoke all on function public.event_view(public.coach_events), public.get_event(uuid), public.my_events(), public.rsvp_event(uuid), public.event_attendees(uuid) from public, anon;
grant execute on function public.get_event(uuid), public.my_events(), public.rsvp_event(uuid), public.event_attendees(uuid) to authenticated;
