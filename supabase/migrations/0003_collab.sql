-- PX-Fitness collaboration add-ons: coach & clients, train together, group challenges,
-- combat-sports size/fight sharing.
--
-- Rules enforced here:
--   * Coach links: a person connects to a coach with the coach's code; the coach accepts.
--     Linked coaches see that client's recent workouts. Check-in numbers (mood, energy,
--     sleep, stress, soreness) are shared ONLY if the client switches that on. Never notes.
--   * Train-together invites and challenges only work between accepted friends.
--   * All status changes go through functions that check who is allowed to make them.

alter table public.social_profiles
  add column is_coach boolean not null default false,
  add column share_combat boolean not null default false;

-- ── coach & clients ─────────────────────────────────────────────────────
create table public.coach_links (
  client_id uuid not null references auth.users on delete cascade,
  coach_id uuid not null references auth.users on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  share_checkins boolean not null default false,
  client_shared jsonb not null default '{}'::jsonb, -- { recent?: [...], checkins?: [...] } written only via set_coach_share()
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (client_id, coach_id),
  check (client_id <> coach_id)
);
create index coach_links_coach on public.coach_links (coach_id);

create table public.coach_notes (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users on delete cascade,
  client_id uuid not null references auth.users on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index coach_notes_pair on public.coach_notes (client_id, coach_id, created_at desc);

create or replace function public.is_coach_of(coach uuid, client uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.coach_links l where l.coach_id = coach and l.client_id = client and l.status = 'accepted');
$$;

alter table public.coach_links enable row level security;
alter table public.coach_notes enable row level security;

-- Each side reads its own links. The coach sees client_shared only once accepted (pending rows are always empty, see set_coach_share).
create policy "coach links: read own" on public.coach_links for select to authenticated
  using ((select auth.uid()) in (client_id, coach_id));
create policy "coach links: either side can end" on public.coach_links for delete to authenticated
  using ((select auth.uid()) in (client_id, coach_id));

create policy "coach notes: coach and client read" on public.coach_notes for select to authenticated
  using ((select auth.uid()) in (coach_id, client_id));
create policy "coach notes: coach writes to own clients" on public.coach_notes for insert to authenticated
  with check (coach_id = (select auth.uid()) and public.is_coach_of(coach_id, client_id));
create policy "coach notes: coach deletes own" on public.coach_notes for delete to authenticated
  using (coach_id = (select auth.uid()));

create or replace function public.request_coach(code text)
returns json language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); c uuid; c_name text; c_is boolean;
begin
  if me is null then return json_build_object('ok', false, 'reason', 'signed_out'); end if;
  select user_id, display_name, is_coach into c, c_name, c_is from public.social_profiles where friend_code = upper(trim(code));
  if c is null then return json_build_object('ok', false, 'reason', 'not_found'); end if;
  if c = me then return json_build_object('ok', false, 'reason', 'self'); end if;
  if not c_is then return json_build_object('ok', false, 'reason', 'not_coach'); end if;
  if exists (select 1 from public.coach_links where client_id = me and coach_id = c) then
    return json_build_object('ok', true, 'status', (select status from public.coach_links where client_id = me and coach_id = c), 'name', c_name);
  end if;
  insert into public.coach_links (client_id, coach_id) values (me, c);
  return json_build_object('ok', true, 'status', 'pending', 'name', c_name);
end;
$$;

create or replace function public.accept_client(client uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.coach_links set status = 'accepted', updated_at = now()
  where coach_id = auth.uid() and client_id = client and status = 'pending'
    and exists (select 1 from public.social_profiles where user_id = auth.uid() and is_coach);
  return found;
end;
$$;

-- The client controls what the coach sees. Check-ins are dropped unless share_checkins is on.
create or replace function public.set_coach_share(coach uuid, checkins_on boolean, payload jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
declare clean jsonb := coalesce(payload, '{}'::jsonb);
begin
  if not checkins_on then clean := clean - 'checkins'; end if;
  update public.coach_links set share_checkins = checkins_on, client_shared = clean, updated_at = now()
  where client_id = auth.uid() and coach_id = coach and status = 'accepted';
  return found;
end;
$$;

-- People on either side of my coach links, with names.
create or replace function public.my_coach_links()
returns table (other_id uuid, display_name text, i_am text, status text, share_checkins boolean, client_shared jsonb, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select case when l.coach_id = auth.uid() then l.client_id else l.coach_id end,
         p.display_name,
         case when l.coach_id = auth.uid() then 'coach' else 'client' end,
         l.status, l.share_checkins,
         case when l.coach_id = auth.uid() and l.status <> 'accepted' then '{}'::jsonb else l.client_shared end,
         l.created_at
  from public.coach_links l
  left join public.social_profiles p on p.user_id = case when l.coach_id = auth.uid() then l.client_id else l.coach_id end
  where auth.uid() in (l.client_id, l.coach_id)
  order by l.created_at desc;
$$;

-- ── train together ──────────────────────────────────────────────────────
create table public.train_invites (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null references auth.users on delete cascade,
  to_user uuid not null references auth.users on delete cascade,
  day date not null,
  at_time text check (at_time ~ '^[0-2][0-9]:[0-5][0-9]$'),
  workout text not null check (char_length(workout) between 1 and 80),
  note text check (char_length(note) <= 200),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  check (from_user <> to_user)
);
create index train_invites_to on public.train_invites (to_user, day);
alter table public.train_invites enable row level security;

create policy "train: read own" on public.train_invites for select to authenticated
  using ((select auth.uid()) in (from_user, to_user));
create policy "train: invite friends" on public.train_invites for insert to authenticated
  with check (from_user = (select auth.uid()) and status = 'pending' and public.are_friends(from_user, to_user));

create or replace function public.respond_train(invite uuid, response text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.train_invites set status = response
  where id = invite and status in ('pending', 'accepted') and (
    (to_user = auth.uid() and response in ('accepted', 'declined'))
    or (from_user = auth.uid() and response = 'cancelled')
    or (to_user = auth.uid() and response = 'cancelled' and status = 'accepted')
  );
  return found;
end;
$$;

-- ── group challenges ────────────────────────────────────────────────────
create table public.challenges (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  goal int not null check (goal between 1 and 200),
  starts date not null,
  ends date not null,
  created_at timestamptz not null default now(),
  check (ends >= starts and ends - starts <= 120)
);

create table public.challenge_members (
  challenge_id uuid not null references public.challenges on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  status text not null default 'invited' check (status in ('invited', 'joined')),
  progress int not null default 0 check (progress between 0 and 1000),
  joined_at timestamptz,
  primary key (challenge_id, user_id)
);
create index challenge_members_user on public.challenge_members (user_id);

create or replace function public.in_challenge(c uuid, u uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.challenge_members m where m.challenge_id = c and m.user_id = u);
$$;

alter table public.challenges enable row level security;
alter table public.challenge_members enable row level security;

create policy "challenges: members read" on public.challenges for select to authenticated
  using (owner = (select auth.uid()) or public.in_challenge(id, (select auth.uid())));
create policy "challenges: create own" on public.challenges for insert to authenticated with check (owner = (select auth.uid()));
create policy "challenges: owner deletes" on public.challenges for delete to authenticated using (owner = (select auth.uid()));

create policy "members: see your challenge" on public.challenge_members for select to authenticated
  using (public.in_challenge(challenge_id, (select auth.uid())));
create policy "members: leave" on public.challenge_members for delete to authenticated
  using (user_id = (select auth.uid()));

-- Owner joins automatically.
create or replace function public.challenge_owner_joins() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.challenge_members (challenge_id, user_id, status, joined_at) values (new.id, new.owner, 'joined', now());
  return new;
end;
$$;
create trigger challenges_owner_joins after insert on public.challenges for each row execute function public.challenge_owner_joins();

create or replace function public.invite_to_challenge(challenge uuid, friend uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.challenges where id = challenge and owner = auth.uid()) then return false; end if;
  if not public.are_friends(auth.uid(), friend) then return false; end if;
  insert into public.challenge_members (challenge_id, user_id) values (challenge, friend) on conflict do nothing;
  return true;
end;
$$;

create or replace function public.join_challenge(challenge uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.challenge_members set status = 'joined', joined_at = now()
  where challenge_id = challenge and user_id = auth.uid() and status = 'invited';
  return found;
end;
$$;

create or replace function public.set_challenge_progress(challenge uuid, n int)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.challenge_members set progress = greatest(0, least(n, 1000))
  where challenge_id = challenge and user_id = auth.uid() and status = 'joined';
  return found;
end;
$$;

-- Names of the people in my challenges (they may not all be my friends).
create or replace function public.my_challenge_people()
returns table (user_id uuid, display_name text)
language sql stable security definer set search_path = '' as $$
  select distinct m.user_id, p.display_name
  from public.challenge_members m
  join public.social_profiles p on p.user_id = m.user_id
  where public.in_challenge(m.challenge_id, auth.uid());
$$;

-- ── permissions ─────────────────────────────────────────────────────────
revoke all on function public.is_coach_of(uuid, uuid), public.request_coach(text), public.accept_client(uuid),
  public.set_coach_share(uuid, boolean, jsonb), public.my_coach_links(), public.respond_train(uuid, text),
  public.in_challenge(uuid, uuid), public.invite_to_challenge(uuid, uuid), public.join_challenge(uuid),
  public.set_challenge_progress(uuid, int), public.my_challenge_people() from public, anon;
grant execute on function public.is_coach_of(uuid, uuid), public.request_coach(text), public.accept_client(uuid),
  public.set_coach_share(uuid, boolean, jsonb), public.my_coach_links(), public.respond_train(uuid, text),
  public.in_challenge(uuid, uuid), public.invite_to_challenge(uuid, uuid), public.join_challenge(uuid),
  public.set_challenge_progress(uuid, int), public.my_challenge_people() to authenticated;

-- Unfriending also cancels open train-together invites between the two.
create or replace function public.cleanup_unfriended() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from public.cheers where (from_user = old.user_a and to_user = old.user_b) or (from_user = old.user_b and to_user = old.user_a);
  update public.train_invites set status = 'cancelled'
  where status in ('pending', 'accepted') and ((from_user = old.user_a and to_user = old.user_b) or (from_user = old.user_b and to_user = old.user_a));
  return old;
end;
$$;
