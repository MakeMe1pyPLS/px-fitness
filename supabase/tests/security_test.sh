#!/usr/bin/env bash
# Runs the migrations on a throwaway Postgres and tries to break the privacy rules.
# Usage: PGHOST=/tmp/pgtest PGPORT=5499 bash supabase/tests/security_test.sh
set -uo pipefail
cd "$(dirname "$0")/../.."
export PGUSER=postgres
DB=px_sec_$$
createdb $DB || exit 1
q() { psql -X -q -tA -v ON_ERROR_STOP=1 -d $DB "$@"; }
pass=0; fail=0
ok() { echo "PASS  $1"; pass=$((pass+1)); }
bad() { echo "FAIL  $1  (got: $2)"; fail=$((fail+1)); }
# as USER_ID SQL → runs as that signed-in user (or anon when USER_ID is "anon")
as() { local who=$1; shift; local role=authenticated claims="{\"sub\":\"$who\"}"; [ "$who" = anon ] && role=anon claims='{}';
  psql -X -q -tA -d $DB -c "set role $role; select set_config('request.jwt.claims', '$claims', false);" -c "$*" 2>&1 | sed '/^$/d' | grep -v '^{"sub"\|^{}$'; }
expect() { local name=$1 want=$2 got=$3; [ "$got" = "$want" ] && ok "$name" || bad "$name" "$got"; }
expect_err() { local name=$1 got=$2; echo "$got" | grep -qiE 'error|denied|violates' && ok "$name" || bad "$name" "$got"; }

q -f supabase/tests/shim.sql >/dev/null || exit 1
for f in supabase/migrations/*.sql; do q -f "$f" >/dev/null || { echo "migration failed: $f"; exit 1; }; done
echo "migrations applied"

A=aaaaaaaa-0000-0000-0000-000000000001; B=bbbbbbbb-0000-0000-0000-000000000002; C=cccccccc-0000-0000-0000-000000000003
q -c "insert into auth.users values ('$A','a@x'),('$B','b@x'),('$C','c@x')" >/dev/null

# ── accounts / paywall ─────────────────────────────────────────────────────
as $A "insert into user_data (user_id, data) values ('$A', '{\"x\":1}')" >/dev/null
expect "user data: others can't read it" "0" "$(as $B "select count(*) from user_data")"
expect_err "user data: can't write someone else's" "$(as $B "insert into user_data (user_id, data) values ('$A', '{}')")"
expect_err "paywall: users can't mark themselves paid" "$(as $A "insert into subscriptions (user_id, status) values ('$A','active')")"
expect "paywall: users can't edit their plan row" "0" "$(q -c "insert into subscriptions (user_id,status) values ('$B','canceled')" >/dev/null; as $B "with u as (update subscriptions set status='active' where user_id='$B' returning 1) select count(*) from u")"
expect "ai: not subscribed is refused" "not_subscribed" "$(as $A "select use_ai_credit(2)->>'reason'")"
q -c "insert into subscriptions (user_id,status) values ('$A','active')" >/dev/null
expect "ai: subscriber allowed (1/2)" "true" "$(as $A "select use_ai_credit(2)->>'allowed'")"
expect "ai: subscriber allowed (2/2)" "true" "$(as $A "select use_ai_credit(2)->>'allowed'")"
expect "ai: daily cap enforced" "daily_limit" "$(as $A "select use_ai_credit(2)->>'reason'")"
expect "ai: canceled plan refused" "not_subscribed" "$(as $B "select use_ai_credit(2)->>'reason'")"
expect_err "ai: signed-out callers can't use it" "$(as anon "select use_ai_credit(2)")"

# ── friends ────────────────────────────────────────────────────────────────
as $A "insert into social_profiles (user_id, display_name, friend_code, share_workouts, shared) values ('$A','Alex','AAAA2222', true, '{\"recent\":[{\"id\":\"s1\"}]}')" >/dev/null
as $B "insert into social_profiles (user_id, display_name, friend_code) values ('$B','Bri','BBBB3333')" >/dev/null
as $C "insert into social_profiles (user_id, display_name, friend_code) values ('$C','Cam','CCCC4444')" >/dev/null
expect_err "profile: can't create one for someone else" "$(as $A "insert into social_profiles (user_id, display_name, friend_code) values ('$C','Fake','ZZZZ9999')")"
expect "profile: strangers can't see you" "0" "$(as $B "select count(*) from social_profiles where user_id='$A'")"
expect "request: unknown code" "not_found" "$(as $B "select request_friend('ZZZZ9999')->>'reason'")"
expect "request: own code" "self" "$(as $A "select request_friend('aaaa2222')->>'reason'")"
expect "request: sent by code" "pending" "$(as $B "select request_friend('AAAA2222')->>'status'")"
expect "request: pending doesn't reveal profile" "0" "$(as $B "select count(*) from social_profiles where user_id='$A'")"
expect "request: recipient sees it as incoming" "Bri|true" "$(as $A "select display_name||'|'||incoming from my_connections()")"
expect "request: sender can't accept their own" "f" "$(as $B "select accept_friend('$A')")"
expect_err "request: can't insert friendships directly" "$(as $C "insert into friendships (user_a,user_b,requested_by,status) values ('$A','$C','$C','accepted')")"
expect "request: recipient accepts" "t" "$(as $A "select accept_friend('$B')")"
expect "friends: can now see each other" "Alex" "$(as $B "select display_name from social_profiles where user_id='$A'")"
expect "friends: outsiders still can't" "0" "$(as $C "select count(*) from social_profiles where user_id in ('$A','$B')")"
expect "friends: can't edit a friend's profile" "0" "$(as $B "with u as (update social_profiles set display_name='hacked' where user_id='$A' returning 1) select count(*) from u")"
expect "friends: outsider can't see the friendship" "0" "$(as $C "select count(*) from friendships")"
expect_err "anon: can't send requests" "$(as anon "select request_friend('AAAA2222')")"

# ── photos (table + storage) ───────────────────────────────────────────────
as $A "insert into shared_photos (user_id, local_id, path, taken_on) values ('$A','ph1','$A/p1.jpg','2026-10-01')" >/dev/null
expect_err "photos: can't file a photo under someone else's folder" "$(as $A "insert into shared_photos (user_id, local_id, path, taken_on) values ('$A','ph2','$B/p2.jpg','2026-10-01')")"
expect_err "photos: can't post as someone else" "$(as $C "insert into shared_photos (user_id, local_id, path, taken_on) values ('$A','ph3','$A/p3.jpg','2026-10-01')")"
as $A "insert into storage.objects (bucket_id, name) values ('friend-photos','$A/p1.jpg')" >/dev/null
expect_err "storage: can't upload into another user's folder" "$(as $A "insert into storage.objects (bucket_id, name) values ('friend-photos','$B/evil.jpg')")"
expect "storage: friend can download" "1" "$(as $B "select count(*) from storage.objects where name='$A/p1.jpg'")"
expect "storage: stranger can't download" "0" "$(as $C "select count(*) from storage.objects where name='$A/p1.jpg'")"
expect "photos: friend sees the listing" "1" "$(as $B "select count(*) from shared_photos where user_id='$A'")"
expect "photos: stranger doesn't" "0" "$(as $C "select count(*) from shared_photos")"
expect "storage: friend can't delete your photo" "0" "$(as $B "with d as (delete from storage.objects where name='$A/p1.jpg' returning 1) select count(*) from d")"

# ── cheers ─────────────────────────────────────────────────────────────────
as $B "insert into cheers (from_user,to_user,target) values ('$B','$A','w:s1')" >/dev/null
expect "cheers: friend can cheer" "1" "$(as $A "select count(*) from cheers where to_user='$A'")"
expect_err "cheers: stranger can't" "$(as $C "insert into cheers (from_user,to_user,target) values ('$C','$A','w:s1')")"
expect_err "cheers: can't cheer as someone else" "$(as $C "insert into cheers (from_user,to_user,target) values ('$B','$A','w:s2')")"

# ── removing a friend ends access ──────────────────────────────────────────
expect "remove: either side can end it" "1" "$(as $B "with d as (delete from friendships returning 1) select count(*) from d")"
expect "remove: profile hidden again" "0" "$(as $B "select count(*) from social_profiles where user_id='$A'")"
expect "remove: photos hidden again" "0" "$(as $B "select count(*) from shared_photos where user_id='$A'")"
expect "remove: files hidden again" "0" "$(as $B "select count(*) from storage.objects where name like '$A/%'")"
expect "remove: cheers cleared" "0" "$(q -c "select count(*) from cheers")"
expect "re-request after removal works" "pending" "$(as $B "select request_friend('AAAA2222')->>'status'")"
expect "crossing requests auto-accept" "accepted" "$(as $A "select request_friend('BBBB3333')->>'status'")"

# ── coach & clients ────────────────────────────────────────────────────────
D=dddddddd-0000-0000-0000-000000000004
q -c "insert into auth.users values ('$D','d@x')" >/dev/null
as $D "insert into social_profiles (user_id, display_name, friend_code) values ('$D','Dee','DDDD5555')" >/dev/null
expect "coach: can't link to someone who isn't a coach" "not_coach" "$(as $B "select request_coach('DDDD5555')->>'reason'")"
as $D "update social_profiles set is_coach = true where user_id = '$D'" >/dev/null
expect "coach: client requests by code" "pending" "$(as $B "select request_coach('DDDD5555')->>'status'")"
expect "coach: client can't share before acceptance" "f" "$(as $B "select set_coach_share('$D', true, '{\"recent\":[1]}')")"
expect "coach: client can't accept for the coach" "f" "$(as $B "select accept_client('$B')")"
expect_err "coach: can't create an accepted link directly" "$(as $C "insert into coach_links (client_id, coach_id, status) values ('$C','$D','accepted')")"
expect "coach: coach accepts" "t" "$(as $D "select accept_client('$B')")"
expect "coach: check-ins dropped while sharing is off" "1|" "$(as $B "select set_coach_share('$D', false, '{\"recent\":[1],\"checkins\":[{\"mood\":2}]}')::int || '|' || coalesce((select client_shared->>'checkins' from coach_links where client_id='$B'),'')")"
expect "coach: coach sees workouts" "[1]" "$(as $D "select client_shared->>'recent' from my_coach_links() where other_id='$B'")"
as $B "select set_coach_share('$D', true, '{\"recent\":[1],\"checkins\":[{\"mood\":2}]}')" >/dev/null
expect "coach: check-ins visible once switched on" "[{\"mood\": 2}]" "$(as $D "select client_shared->>'checkins' from my_coach_links() where other_id='$B'")"
expect "coach: other people see nothing" "0" "$(as $C "select count(*) from coach_links")"
expect_err "coach: coach can't rewrite the client's data" "$(as $D "update coach_links set client_shared = '{}' where client_id='$B' returning 1" ; as $D "select case when (select client_shared from coach_links where client_id='$B') = '{}'::jsonb then 'changed' else 'error: unchanged' end")"
as $D "insert into coach_notes (coach_id, client_id, body) values ('$D','$B','Great week, add a 4th set')" >/dev/null
expect "coach: client reads the note" "Great week, add a 4th set" "$(as $B "select body from coach_notes")"
expect_err "coach: can't write notes to non-clients" "$(as $D "insert into coach_notes (coach_id, client_id, body) values ('$D','$C','hi')")"
expect_err "coach: can't post notes as the coach" "$(as $C "insert into coach_notes (coach_id, client_id, body) values ('$D','$B','fake')")"
expect "coach: stranger can't read notes" "0" "$(as $C "select count(*) from coach_notes")"

# ── train together (needs friends: re-friend A and B) ───────────────────────
expect "train: can't invite a non-friend" "1" "$(as $C "insert into train_invites (from_user,to_user,day,workout) values ('$C','$A','2026-11-20','Legs')" 2>&1 | grep -ciE 'error|violates')"
expect "train: friends can invite" "pending" "$(as $A "insert into train_invites (from_user,to_user,day,at_time,workout) values ('$A','$B','2026-11-20','18:00','Push Day') returning status")"
INV=$(q -c "select id from train_invites limit 1")
expect "train: sender can't accept their own invite" "f" "$(as $A "select respond_train('$INV','accepted')")"
expect "train: outsider can't touch it" "f" "$(as $C "select respond_train('$INV','declined')")"
expect "train: outsider can't see it" "0" "$(as $C "select count(*) from train_invites")"
expect "train: invitee accepts" "t" "$(as $B "select respond_train('$INV','accepted')")"
expect_err "train: can't insert as someone else" "$(as $C "insert into train_invites (from_user,to_user,day,workout) values ('$A','$B','2026-11-21','x')")"

# ── challenges ─────────────────────────────────────────────────────────────
CH=$(as $A "insert into challenges (owner,name,goal,starts,ends) values ('$A','12 in Nov',12,'2026-11-01','2026-11-30') returning id")
expect "challenge: owner joined automatically" "joined" "$(as $A "select status from challenge_members where challenge_id='$CH'")"
expect "challenge: can invite a friend" "t" "$(as $A "select invite_to_challenge('$CH','$B')")"
expect "challenge: can't invite a non-friend" "f" "$(as $A "select invite_to_challenge('$CH','$C')")"
expect "challenge: non-owner can't invite" "f" "$(as $B "select invite_to_challenge('$CH','$C')")"
expect "challenge: outsider can't see it" "0" "$(as $C "select count(*) from challenges")"
expect "challenge: invited can't post progress before joining" "f" "$(as $B "select set_challenge_progress('$CH', 5)")"
expect "challenge: invitee joins" "t" "$(as $B "select join_challenge('$CH')")"
expect "challenge: progress saved" "t" "$(as $B "select set_challenge_progress('$CH', 5)")"
expect "challenge: members see each other" "2" "$(as $B "select count(*) from challenge_members where challenge_id='$CH'")"
expect "challenge: can't edit someone else's progress" "0" "$(as $B "with u as (update challenge_members set progress=99 where user_id='$A' returning 1) select count(*) from u")"
expect_err "challenge: can't add yourself" "$(as $C "insert into challenge_members (challenge_id,user_id,status) values ('$CH','$C','joined')")"
expect "challenge: names visible to members" "Alex,Bri" "$(as $B "select string_agg(display_name, ',' order by display_name) from my_challenge_people()")"
expect "unfriend cancels open training" "cancelled" "$(as $B "delete from friendships" >/dev/null; q -c "select status from train_invites where id='$INV'")"

# ── coaching payments (D is a coach; B is D's client; C is a stranger) ─────
expect_err "payments: coach can't mark themselves payable" "$(as $D "insert into coach_payouts (coach_id, stripe_account_id, charges_enabled) values ('$D','acct_fake',true)")"
q -c "insert into coach_payouts (coach_id, stripe_account_id, charges_enabled) values ('$D','acct_D',true)" >/dev/null
expect "payments: coach sees own payout status" "t" "$(as $D "select charges_enabled from coach_payouts")"
expect "payments: others can't see payout accounts" "0" "$(as $B "select count(*) from coach_payouts")"
expect_err "payments: coach can't flip their own status" "$(as $D "update coach_payouts set charges_enabled=false returning 1" ; as $D "select case when charges_enabled then 'error: unchanged' else 'changed' end from coach_payouts")"
as $D "insert into coach_offers (coach_id, name, price_cents) values ('$D','Single session',8000)" >/dev/null
expect_err "offers: non-coaches can't post prices" "$(as $C "insert into coach_offers (coach_id, name, price_cents) values ('$C','x',8000)")"
expect_err "offers: can't post for another coach" "$(as $B "insert into coach_offers (coach_id, name, price_cents) values ('$D','x',100)")"
expect_err "offers: price must be at least \$5" "$(as $D "insert into coach_offers (coach_id, name, price_cents) values ('$D','cheap',100)")"
expect "offers: linked client sees prices" "1" "$(as $B "select count(*) from coach_offers")"
expect "offers: stranger doesn't" "0" "$(as $C "select count(*) from coach_offers")"
expect "offers: client can't change the price" "0" "$(as $B "with u as (update coach_offers set price_cents=500 returning 1) select count(*) from u")"
expect_err "payments: client can't record a fake payment" "$(as $B "insert into coaching_payments (coach_id, client_id, offer_name, amount_cents, stripe_session_id) values ('$D','$B','x',8000,'cs_fake')")"
q -c "insert into coaching_payments (coach_id, client_id, offer_name, amount_cents, stripe_session_id) values ('$D','$B','Single session',8000,'cs_1')" >/dev/null
expect "payments: coach sees it" "8000" "$(as $D "select amount_cents from coaching_payments")"
expect "payments: client sees it" "1" "$(as $B "select count(*) from coaching_payments")"
expect "payments: stranger doesn't" "0" "$(as $C "select count(*) from coaching_payments")"
expect "payments: nobody can mark it refunded" "0" "$(as $D "with u as (update coaching_payments set status='refunded' returning 1) select count(*) from u")"
expect_err "payments: duplicate Stripe session is ignored" "$(q -c "insert into coaching_payments (coach_id, client_id, offer_name, amount_cents, stripe_session_id) values ('$D','$B','dup',1,'cs_1')" 2>&1)"

# ── PX Saturdays ───────────────────────────────────────────────────────────
expect_err "events: non-coaches can't post" "$(as $C "insert into coach_events (coach_id, title, starts_at, location) values ('$C','x', now() + interval '2 days', 'park')")"
EV=$(as $D "insert into coach_events (coach_id, title, starts_at, location, capacity) values ('$D','PX Saturday', now() + interval '3 days', 'Farquhar Park', 2) returning id")
expect "events: anyone with the link can view" "PX Saturday" "$(as $C "select get_event('$EV')->>'title'")"
expect "events: stranger doesn't get it in their list" "0" "$(as $C "select count(*) from my_events()")"
expect "events: linked client sees it in their list" "1" "$(as $B "select count(*) from my_events()")"
expect_err "events: can't RSVP directly (capacity bypass)" "$(as $C "insert into event_rsvps (event_id, user_id) values ('$EV','$C')")"
expect "events: RSVP by link" "true" "$(as $C "select rsvp_event('$EV')->>'ok'")"
expect "events: RSVP twice is fine" "true" "$(as $C "select rsvp_event('$EV')->>'ok'")"
expect "events: second person" "true" "$(as $B "select rsvp_event('$EV')->>'ok'")"
expect "events: capacity enforced" "full" "$(as $A "select rsvp_event('$EV')->>'reason'")"
expect "events: coach sees who's coming" "2" "$(as $D "select count(*) from event_attendees('$EV')")"
expect "events: attendees can't see the list" "0" "$(as $C "select count(*) from event_attendees('$EV')")"
expect "events: others can't edit the event" "0" "$(as $C "with u as (update coach_events set title='hacked' returning 1) select count(*) from u")"
expect "events: you can only cancel your own RSVP" "0" "$(as $C "with d as (delete from event_rsvps where user_id='$B' returning 1) select count(*) from d")"
expect "events: cancel own RSVP frees a spot" "true" "$(as $C "delete from event_rsvps where event_id='$EV'" >/dev/null; as $A "select rsvp_event('$EV')->>'ok'")"
as $D "update coach_events set cancelled = true where id = '$EV'" >/dev/null
expect "events: cancelled sessions take no sign-ups" "cancelled" "$(as $C "select rsvp_event('$EV')->>'reason'")"
expect_err "anon: can't view events" "$(as anon "select get_event('$EV')")"

dropdb $DB
echo; echo "$pass passed, $fail failed"
[ $fail -eq 0 ]
