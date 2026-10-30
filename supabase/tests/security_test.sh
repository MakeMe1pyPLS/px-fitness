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

dropdb $DB
echo; echo "$pass passed, $fail failed"
[ $fail -eq 0 ]
