-- PX-Fitness Friends: friend codes, requests, opt-in sharing, shared photos, cheers.
--
-- Privacy rules enforced HERE (not just in the app):
--   * Nobody is searchable. You add a friend only with their private friend code.
--   * Only accepted friends can read your social profile, shared plan/workouts and shared photos.
--   * Sharing is off by default. Check-ins, mood, notes and meals are never shared.
--   * Photos live in a private storage bucket; each one is uploaded only when its owner shares it.

create table public.social_profiles (
  user_id uuid primary key references auth.users on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  friend_code text not null unique check (friend_code ~ '^[A-Z2-9]{8}$'),
  share_routine boolean not null default false,
  share_workouts boolean not null default false,
  shared jsonb not null default '{}'::jsonb, -- { routine?: [...], recent?: [...] } — only filled when sharing is on
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One row per pair; user_a < user_b keeps it unique regardless of who asked.
create table public.friendships (
  user_a uuid not null references auth.users on delete cascade,
  user_b uuid not null references auth.users on delete cascade,
  requested_by uuid not null references auth.users on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  primary key (user_a, user_b),
  check (user_a < user_b),
  check (requested_by in (user_a, user_b))
);
create index friendships_b on public.friendships (user_b);

create table public.shared_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  local_id text not null,
  path text not null unique,
  taken_on date not null,
  caption text check (char_length(caption) <= 140),
  created_at timestamptz not null default now(),
  unique (user_id, local_id)
);

create table public.cheers (
  from_user uuid not null references auth.users on delete cascade,
  to_user uuid not null references auth.users on delete cascade,
  target text not null check (char_length(target) <= 80), -- e.g. "w:<session id>" or "p:<photo id>"
  created_at timestamptz not null default now(),
  primary key (from_user, to_user, target)
);
create index cheers_to on public.cheers (to_user, created_at desc);

-- ── helper ───────────────────────────────────────────────────────────────
create or replace function public.are_friends(x uuid, y uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted' and f.user_a = least(x, y) and f.user_b = greatest(x, y)
  );
$$;
revoke all on function public.are_friends(uuid, uuid) from public, anon;
grant execute on function public.are_friends(uuid, uuid) to authenticated;

-- ── row-level security ───────────────────────────────────────────────────
alter table public.social_profiles enable row level security;
alter table public.friendships enable row level security;
alter table public.shared_photos enable row level security;
alter table public.cheers enable row level security;

create policy "social: read own or friends" on public.social_profiles for select to authenticated
  using (user_id = (select auth.uid()) or public.are_friends(user_id, (select auth.uid())));
create policy "social: create own" on public.social_profiles for insert to authenticated with check (user_id = (select auth.uid()));
create policy "social: update own" on public.social_profiles for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "social: delete own" on public.social_profiles for delete to authenticated using (user_id = (select auth.uid()));

-- Requests are created/accepted through the functions below; either person can end a friendship.
create policy "friends: read own" on public.friendships for select to authenticated
  using ((select auth.uid()) in (user_a, user_b));
create policy "friends: remove own" on public.friendships for delete to authenticated
  using ((select auth.uid()) in (user_a, user_b));

create policy "photos: read own or friends" on public.shared_photos for select to authenticated
  using (user_id = (select auth.uid()) or public.are_friends(user_id, (select auth.uid())));
create policy "photos: add own" on public.shared_photos for insert to authenticated
  with check (user_id = (select auth.uid()) and path like (select auth.uid())::text || '/%');
create policy "photos: remove own" on public.shared_photos for delete to authenticated using (user_id = (select auth.uid()));

create policy "cheers: read mine" on public.cheers for select to authenticated
  using ((select auth.uid()) in (from_user, to_user));
create policy "cheers: give to friends" on public.cheers for insert to authenticated
  with check (from_user = (select auth.uid()) and public.are_friends(from_user, to_user));
create policy "cheers: take back" on public.cheers for delete to authenticated using (from_user = (select auth.uid()));

-- ── friend requests ──────────────────────────────────────────────────────
-- Send (or auto-accept a crossing request) using someone's private code.
create or replace function public.request_friend(code text)
returns json language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  them uuid;
  them_name text;
  existing public.friendships;
begin
  if me is null then return json_build_object('ok', false, 'reason', 'signed_out'); end if;
  if not exists (select 1 from public.social_profiles where user_id = me) then
    return json_build_object('ok', false, 'reason', 'no_profile');
  end if;
  select user_id, display_name into them, them_name from public.social_profiles where friend_code = upper(trim(code));
  if them is null then return json_build_object('ok', false, 'reason', 'not_found'); end if;
  if them = me then return json_build_object('ok', false, 'reason', 'self'); end if;
  select * into existing from public.friendships where user_a = least(me, them) and user_b = greatest(me, them);
  if found then
    if existing.status = 'accepted' then return json_build_object('ok', false, 'reason', 'already_friends', 'name', them_name); end if;
    if existing.requested_by = them then -- they already asked me: accept
      update public.friendships set status = 'accepted', accepted_at = now() where user_a = existing.user_a and user_b = existing.user_b;
      return json_build_object('ok', true, 'status', 'accepted', 'name', them_name);
    end if;
    return json_build_object('ok', true, 'status', 'pending', 'name', them_name);
  end if;
  if (select count(*) from public.friendships where requested_by = me and status = 'pending') >= 50 then
    return json_build_object('ok', false, 'reason', 'too_many');
  end if;
  insert into public.friendships (user_a, user_b, requested_by) values (least(me, them), greatest(me, them), me);
  return json_build_object('ok', true, 'status', 'pending', 'name', them_name);
end;
$$;

create or replace function public.accept_friend(other uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid();
begin
  update public.friendships set status = 'accepted', accepted_at = now()
  where user_a = least(me, other) and user_b = greatest(me, other) and status = 'pending' and requested_by = other;
  return found;
end;
$$;

-- People you have a request or friendship with, with their display names (no one else).
create or replace function public.my_connections()
returns table (user_id uuid, display_name text, status text, incoming boolean, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select case when f.user_a = auth.uid() then f.user_b else f.user_a end,
         p.display_name, f.status, f.requested_by <> auth.uid(), f.created_at
  from public.friendships f
  left join public.social_profiles p on p.user_id = case when f.user_a = auth.uid() then f.user_b else f.user_a end
  where auth.uid() in (f.user_a, f.user_b)
  order by f.created_at desc;
$$;

revoke all on function public.request_friend(text), public.accept_friend(uuid), public.my_connections() from public, anon;
grant execute on function public.request_friend(text), public.accept_friend(uuid), public.my_connections() to authenticated;

-- Removing a friend also removes cheers between you.
create or replace function public.cleanup_unfriended() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from public.cheers where (from_user = old.user_a and to_user = old.user_b) or (from_user = old.user_b and to_user = old.user_a);
  return old;
end;
$$;
create trigger friendships_cleanup after delete on public.friendships for each row execute function public.cleanup_unfriended();

-- ── photo storage (private bucket, files under <user id>/...) ───────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('friend-photos', 'friend-photos', false, 1048576, array['image/jpeg', 'image/webp', 'image/png'])
on conflict (id) do nothing;

create policy "friend photos: upload own" on storage.objects for insert to authenticated
  with check (bucket_id = 'friend-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "friend photos: delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'friend-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "friend photos: view own or friends" on storage.objects for select to authenticated
  using (bucket_id = 'friend-photos' and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or public.are_friends(((storage.foldername(name))[1])::uuid, (select auth.uid()))
  ));
