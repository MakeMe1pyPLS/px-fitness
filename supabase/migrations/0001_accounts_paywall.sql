-- PX-Fitness accounts, sync and paywall.
-- user_data: one JSON copy of each person's app data (same shape as the on-device store).
-- subscriptions: written ONLY by the Stripe webhook (service role). Users can read their own row.
-- ai_usage: per-day AI check-in counter, changed only through use_ai_credit().

create table public.user_data (
  user_id uuid primary key references auth.users on delete cascade,
  data jsonb not null,
  schema_version int not null default 3,
  updated_at timestamptz not null default now()
);

create table public.subscriptions (
  user_id uuid primary key references auth.users on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  status text not null default 'none',
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.ai_usage (
  user_id uuid not null references auth.users on delete cascade,
  day date not null,
  count int not null default 0,
  primary key (user_id, day)
);

alter table public.user_data enable row level security;
alter table public.subscriptions enable row level security;
alter table public.ai_usage enable row level security;

create policy "own data: read" on public.user_data for select to authenticated using ((select auth.uid()) = user_id);
create policy "own data: insert" on public.user_data for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own data: update" on public.user_data for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own data: delete" on public.user_data for delete to authenticated using ((select auth.uid()) = user_id);

create policy "own subscription: read" on public.subscriptions for select to authenticated using ((select auth.uid()) = user_id);
create policy "own usage: read" on public.ai_usage for select to authenticated using ((select auth.uid()) = user_id);

-- Called by /api/checkin with the user's own token. Checks the subscription and
-- takes one credit from today's allowance in a single step.
create or replace function public.use_ai_credit(daily_limit int default 30)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  active boolean;
  used int;
begin
  if uid is null then
    return json_build_object('allowed', false, 'reason', 'signed_out');
  end if;
  select s.status in ('active', 'trialing') into active from public.subscriptions s where s.user_id = uid;
  if not coalesce(active, false) then
    return json_build_object('allowed', false, 'reason', 'not_subscribed');
  end if;
  insert into public.ai_usage as u (user_id, day, count) values (uid, current_date, 1)
  on conflict (user_id, day) do update set count = u.count + 1
  where u.count < daily_limit
  returning u.count into used;
  if used is null then
    return json_build_object('allowed', false, 'reason', 'daily_limit', 'limit', daily_limit);
  end if;
  return json_build_object('allowed', true, 'used', used, 'limit', daily_limit);
end;
$$;

revoke all on function public.use_ai_credit(int) from public, anon;
grant execute on function public.use_ai_credit(int) to authenticated;
