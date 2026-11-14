-- 0005 · Coaches are staff, not a self-serve switch.
-- PX (the owner) decides who coaches. Members can't make themselves coaches:
-- social_profiles.is_coach is now derived from the staff table, whatever a client sends.
-- Bootstrap the owner once, from the SQL editor, after they've signed up:
--   insert into public.staff (user_id, role) values ('<owner user id>', 'owner');

create table public.staff (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'coach')),
  added_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.staff enable row level security;
-- No policies: nobody reads or writes this table directly. Everything goes through the functions below.
revoke all on public.staff from anon, authenticated;

create or replace function public.staff_role(u uuid)
returns text language sql stable security definer set search_path = '' as $$
  select role from public.staff where user_id = u
$$;

-- is_coach always mirrors the staff table.
create or replace function public.sync_is_coach()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.is_coach := exists (select 1 from public.staff where user_id = new.user_id);
  return new;
end $$;
create trigger social_profiles_is_coach before insert or update on public.social_profiles
  for each row execute function public.sync_is_coach();

create or replace function public.staff_changed()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.social_profiles set updated_at = updated_at where user_id = coalesce(new.user_id, old.user_id);
  return null;
end $$;
create trigger staff_sync after insert or update or delete on public.staff
  for each row execute function public.staff_changed();

-- Profiles made before this migration: correct any self-set flags now.
update public.social_profiles set updated_at = updated_at;

-- ── For the app ─────────────────────────────────────────────────────────
-- Your own role: 'owner', 'coach' or null.
create or replace function public.my_role()
returns text language sql stable security definer set search_path = '' as $$
  select role from public.staff where user_id = auth.uid()
$$;

-- PX coaches members can connect to (name + code only).
create or replace function public.public_coaches()
returns table (user_id uuid, display_name text, friend_code text, role text)
language sql stable security definer set search_path = '' as $$
  select p.user_id, p.display_name, p.friend_code, s.role
  from public.staff s join public.social_profiles p on p.user_id = s.user_id
  where auth.uid() is not null
  order by (s.role = 'owner') desc, p.display_name
$$;

-- Owner only: the team, add a coach by friend code, remove a coach.
create or replace function public.list_staff()
returns table (user_id uuid, display_name text, role text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select s.user_id, p.display_name, s.role, s.created_at
  from public.staff s left join public.social_profiles p on p.user_id = s.user_id
  where public.staff_role(auth.uid()) = 'owner'
  order by s.created_at
$$;

create or replace function public.add_coach(code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare them uuid; nm text;
begin
  if public.staff_role(auth.uid()) is distinct from 'owner' then return jsonb_build_object('ok', false, 'reason', 'not_owner'); end if;
  select user_id, display_name into them, nm from public.social_profiles where friend_code = upper(trim(code));
  if them is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if exists (select 1 from public.staff where user_id = them) then return jsonb_build_object('ok', false, 'reason', 'already'); end if;
  insert into public.staff (user_id, role, added_by) values (them, 'coach', auth.uid());
  return jsonb_build_object('ok', true, 'name', nm);
end $$;

create or replace function public.remove_coach(coach uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if public.staff_role(auth.uid()) is distinct from 'owner' then return false; end if;
  delete from public.staff where user_id = coach and role = 'coach';
  return found;
end $$;

revoke all on function public.staff_role(uuid), public.sync_is_coach(), public.staff_changed(), public.my_role(),
  public.public_coaches(), public.list_staff(), public.add_coach(text), public.remove_coach(uuid) from public, anon;
grant execute on function public.my_role(), public.public_coaches(), public.list_staff(), public.add_coach(text), public.remove_coach(uuid) to authenticated;
