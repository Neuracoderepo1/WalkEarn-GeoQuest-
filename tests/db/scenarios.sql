-- Behavioural tests for the claim/redeem/campaign engine. Each DO block is one transaction.
create schema test;
grant usage on schema test to anon, authenticated;
create table test.vars (k text primary key, v text);

create function test.as_user(p_uid uuid, p_role text default 'authenticated') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true);
  execute format('set local role %I', p_role);
end $$;

create function test.reset() returns void language plpgsql as $$
begin reset role; perform set_config('request.jwt.claim.sub', '', true); end $$;

create function test.expect_error(p_sql text, p_state text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlstate = p_state then return; end if;
    raise exception 'expected SQLSTATE %, got % (%) for: %', p_state, sqlstate, sqlerrm, p_sql;
  end;
  raise exception 'expected SQLSTATE % but statement succeeded: %', p_state, p_sql;
end $$;

create function test.json(p_sql text) returns jsonb language plpgsql as $$
declare r jsonb; begin execute p_sql into r; return r; end $$;

-- ---------------------------------------------------------------- fixtures
do $$
declare
  ua constant uuid := '00000000-0000-0000-0000-00000000000a';
  ub constant uuid := '00000000-0000-0000-0000-00000000000b';
  uc constant uuid := '00000000-0000-0000-0000-00000000000c';
  ud constant uuid := '00000000-0000-0000-0000-00000000000d';
  m1 constant uuid := '00000000-0000-0000-0000-0000000000a1';
  m2 constant uuid := '00000000-0000-0000-0000-0000000000a2';
  mid uuid; lid uuid; r jsonb; i int;
begin
  insert into auth.users(id, email, raw_user_meta_data) values
    (ua,'a@test','{"display_name":"Ama"}'), (ub,'b@test','{}'), (uc,'c@test','{}'), (ud,'d@test', jsonb_build_object('display_name', repeat('x', 80))),
    (m1,'m1@test','{}'), (m2,'m2@test','{}');
  assert (select display_name from public.profiles where id = ud) = repeat('x', 40), 'display name capped at 40 chars';
  assert (select display_name from public.profiles where id = ub) = 'Explorer', 'default display name';

  insert into public.merchants(name, slug) values ('Pilot Coffee', 'pilot-coffee') returning id into mid;
  insert into public.merchant_memberships(merchant_id, user_id, role) values (mid, m1, 'owner'), (mid, m2, 'staff');
  insert into public.merchant_locations(merchant_id, name, address, location, geofence_radius_m)
  values (mid, 'Main entrance', '1 Test Street', extensions.st_setsrid(extensions.st_makepoint(-0.1870, 5.6037), 4326)::extensions.geography, 60)
  returning id into lid;

  -- free exploration quest ~1.8 km north of the merchant
  insert into public.quests(title, location_name, category, xp_reward, geofence_radius_m, location, status)
  values ('Green Pause', 'Community Garden', 'Explore', 80, 100,
          extensions.st_setsrid(extensions.st_makepoint(-0.1870, 5.6200), 4326)::extensions.geography, 'active');

  -- nine free quests at one spot to exercise the daily cap
  for i in 1..9 loop
    insert into public.quests(title, location_name, category, xp_reward, geofence_radius_m, location, status)
    values ('Cap quest ' || i, 'Cap Square', 'Collect', 10, 100,
            extensions.st_setsrid(extensions.st_makepoint(-0.2000, 5.7000), 4326)::extensions.geography, 'active');
  end loop;

  perform test.as_user(m1);
  r := public.create_merchant_campaign('Coffee break', 'Free size upgrade', 5, 2.00, lid);
  perform test.reset();
  assert (r->>'success')::boolean, 'campaign created';
  insert into test.vars values ('campaign', r->'campaign'->>'id'), ('merchant_quest', r->>'quest_id'), ('merchant', mid::text);
end $$;

-- ---------------------------------------------------------------- discovery
do $$
declare r jsonb;
begin
  perform test.as_user(null, 'anon');
  r := public.nearby_quests(5.6037, -0.1870, 500);
  perform test.reset();
  assert jsonb_array_length(r) = 1, 'one quest within 500 m of the cafe, got ' || jsonb_array_length(r);
  assert r->0->>'merchant_name' = 'Pilot Coffee', 'merchant name visible for discovery';
  assert r->0->>'reward_description' = 'Free size upgrade', 'reward visible';
  assert (r->0->>'remaining')::int = 5, 'remaining redemptions';
  assert (r->0->>'claimed')::boolean = false, 'anon has not claimed';
  assert abs((r->0->>'latitude')::float - 5.6037) < 0.0001 and abs((r->0->>'longitude')::float + 0.1870) < 0.0001, 'coordinates returned';

  perform test.as_user(null, 'anon');
  r := public.nearby_quests(5.6037, -0.1870, 5000);
  perform test.reset();
  assert jsonb_array_length(r) = 2, 'both quests within 5 km';
  assert (r->0->>'distance_m')::int <= (r->1->>'distance_m')::int, 'sorted by distance';

  perform test.expect_error('select public.nearby_quests(95, 0, 1000)', '22023');
end $$;

-- ---------------------------------------------------------------- claim rules
do $$
declare
  ua constant uuid := '00000000-0000-0000-0000-00000000000a';
  q uuid := (select v::uuid from test.vars where k = 'merchant_quest');
  r jsonb;
begin
  perform test.expect_error(format('select public.claim_quest(%L, 5.6037, -0.1870, 5)', q), '28000'); -- no session
  perform test.as_user(ua);
  perform test.expect_error(format('select public.claim_quest(%L, 5.6037, -0.1870, 80)', q), '22023'); -- poor accuracy
  perform test.expect_error(format('select public.claim_quest(%L, 5.6047, -0.1870, 10)', q), '22023'); -- ~111 m away, radius 60
  perform test.expect_error(format('select public.claim_quest(%L, 123, -0.1870, 10)', q), '22023');   -- invalid coordinates
  r := public.claim_quest(q, 5.6037, -0.1870, 8);
  perform test.reset();
  assert (r->>'success')::boolean, 'inside geofence claim succeeds';
  assert r->>'redemption_code' ~ '^[0-9A-F]{10}$', 'ten-char hex code issued';
  assert (select token_hash from public.quest_claims where user_id = ua) = encode(extensions.digest(r->>'redemption_code', 'sha256'), 'hex'), 'only the hash is stored';
  assert (select xp from public.profiles where id = ua) = 50, 'xp awarded';
  assert (select claim_location is not null from public.quest_claims where user_id = ua), 'claim location recorded';
  insert into test.vars values ('code_a', r->>'redemption_code');

  perform test.as_user(ua);
  perform test.expect_error(format('select public.claim_quest(%L, 5.6037, -0.1870, 8)', q), '23505'); -- duplicate
  perform test.reset();

  perform test.as_user(ua);
  r := public.nearby_quests(5.6037, -0.1870, 500);
  perform test.reset();
  assert (r->0->>'claimed')::boolean, 'quest shows as claimed for the claimer';
  assert (r->0->>'remaining')::int = 5, 'remaining only drops on redemption';
end $$;

-- ---------------------------------------------------------------- anti-abuse
do $$
declare
  uc constant uuid := '00000000-0000-0000-0000-00000000000c';
  merchant_q uuid := (select v::uuid from test.vars where k = 'merchant_quest');
  park_q uuid := (select id from public.quests where title = 'Green Pause');
begin
  perform test.as_user(uc);
  perform public.claim_quest(merchant_q, 5.6037, -0.1870, 8);
  perform test.expect_error(format('select public.claim_quest(%L, 5.6200, -0.1870, 8)', park_q), '22023'); -- ~1.8 km in under a second
  perform test.reset();
  assert (select count(*) from public.quest_claims where user_id = uc) = 1, 'rejected claim leaves no row';
end $$;

do $$
declare
  ud constant uuid := '00000000-0000-0000-0000-00000000000d';
  qid uuid; n int := 0;
begin
  perform test.as_user(ud);
  for qid in select id from public.quests where title like 'Cap quest %' order by title loop
    n := n + 1;
    if n <= 8 then
      perform public.claim_quest(qid, 5.7000, -0.2000, 5);
    else
      perform test.expect_error(format('select public.claim_quest(%L, 5.7000, -0.2000, 5)', qid), '22023');
    end if;
  end loop;
  perform test.reset();
  assert (select count(*) from public.quest_claims where user_id = ud) = 8, 'daily cap holds at 8';
  assert (select xp from public.profiles where id = ud) = 8 * 10 + 100, 'daily bonus awarded exactly once (on the 3rd stop)';
  assert (select count(*) from public.quest_claims where user_id = ud and xp_awarded = 110) = 1, 'bonus sits on one claim';
end $$;

-- ---------------------------------------------------------------- redemption
do $$
declare
  ua constant uuid := '00000000-0000-0000-0000-00000000000a';
  ub constant uuid := '00000000-0000-0000-0000-00000000000b';
  m2 constant uuid := '00000000-0000-0000-0000-0000000000a2';
  q uuid := (select v::uuid from test.vars where k = 'merchant_quest');
  code_a text := (select v from test.vars where k = 'code_a');
  r jsonb; code_b text; code_b2 text; claim_b uuid;
begin
  -- B is a player, not a merchant member
  perform test.as_user(ub);
  r := public.claim_quest(q, 5.6037, -0.1870, 8);
  code_b := r->>'redemption_code';
  perform test.expect_error(format('select public.redeem_reward(%L)', code_b), '42501');
  perform test.reset();

  -- staff member of the merchant redeems A's code once
  perform test.as_user(m2);
  r := public.redeem_reward(code_a);
  assert (r->>'success')::boolean, 'staff can redeem';
  perform test.expect_error(format('select public.redeem_reward(%L)', code_a), '22023');
  perform test.expect_error('select public.redeem_reward(''SHORT'')', '22023');
  perform test.reset();
  assert (select redemption_count from public.reward_campaigns where id = (select v::uuid from test.vars where k = 'campaign')) = 1, 'campaign counter incremented once';

  -- B loses the code and asks for a new one
  select id into claim_b from public.quest_claims where user_id = ub;
  perform test.as_user(ua);
  perform test.expect_error(format('select public.reissue_claim_code(%L)', claim_b), 'P0002'); -- not A's claim
  perform test.reset();
  perform test.as_user(ub);
  r := public.reissue_claim_code(claim_b);
  code_b2 := r->>'redemption_code';
  assert code_b2 <> code_b, 'code rotated';
  perform test.reset();
  perform test.as_user(m2);
  perform test.expect_error(format('select public.redeem_reward(%L)', code_b), 'P0002'); -- old code is dead
  r := public.redeem_reward(code_b2);
  assert (r->>'success')::boolean, 'new code redeems';
  perform test.reset();
  perform test.as_user(ub);
  perform test.expect_error(format('select public.reissue_claim_code(%L)', claim_b), '22023'); -- already redeemed
  perform test.reset();
end $$;

-- ---------------------------------------------------------------- wallet + leaderboard
do $$
declare
  ua constant uuid := '00000000-0000-0000-0000-00000000000a';
  r jsonb;
begin
  perform test.as_user(ua);
  r := public.my_wallet();
  perform test.reset();
  assert r->>'display_name' = 'Ama', 'wallet profile';
  assert (r->>'xp')::int = 50, 'wallet xp';
  assert (r->>'streak_days')::int = 1, 'one-day streak, got ' || (r->>'streak_days');
  assert (r->>'rewards_redeemed')::int = 1, 'redeemed count';
  assert (r->>'today_stops')::int = 1 and (r->>'daily_bonus_stops')::int = 3, 'daily progress reported';
  assert r->'claims'->0->>'status' = 'redeemed', 'claim status shown';
  assert not (r->'claims'->0 ? 'redemption_code'), 'wallet never exposes codes';
  perform test.expect_error('select public.my_wallet()', '28000'); -- no session
  perform test.as_user(null, 'anon');
  perform test.expect_error('select public.my_wallet()', '42501'); -- anon cannot execute
  perform test.reset();

  perform test.as_user(null, 'anon');
  r := public.weekly_leaderboard();
  perform test.reset();
  assert (r->0->>'xp')::int >= (r->1->>'xp')::int, 'leaderboard ordered by xp';
  assert (r->0->>'rank')::int = 1, 'rank starts at 1';
  assert not (r->0 ? 'user_id'), 'leaderboard exposes no user ids';
end $$;

-- ---------------------------------------------------------------- campaign controls + dashboard
do $$
declare
  m1 constant uuid := '00000000-0000-0000-0000-0000000000a1';
  m2 constant uuid := '00000000-0000-0000-0000-0000000000a2';
  ua constant uuid := '00000000-0000-0000-0000-00000000000a';
  camp uuid := (select v::uuid from test.vars where k = 'campaign');
  q uuid := (select v::uuid from test.vars where k = 'merchant_quest');
  r jsonb;
begin
  perform test.as_user(m2);
  perform test.expect_error(format('select public.set_campaign_status(%L, ''paused'')', camp), '42501'); -- staff cannot manage
  r := public.merchant_dashboard();
  perform test.reset();
  assert not (r->>'can_manage')::boolean, 'staff cannot manage';

  perform test.as_user(m1);
  r := public.merchant_dashboard();
  assert (r->>'can_manage')::boolean, 'owner can manage';
  assert (r->'campaigns'->0->>'claim_count')::int = 3, 'claims counted per campaign (A, B, C), got ' || (r->'campaigns'->0->>'claim_count');
  assert (r->'campaigns'->0->>'redemption_count')::int = 2, 'two redemptions';
  assert (r->>'verified_redemptions')::int = 2, 'verified redemptions';
  perform public.set_campaign_status(camp, 'paused');
  perform test.expect_error('select public.set_campaign_status(gen_random_uuid(), ''paused'')', 'P0002');
  perform test.expect_error(format('select public.set_campaign_status(%L, ''banana'')', camp), '22023');
  perform test.reset();
  assert (select status from public.quests where id = q) = 'paused', 'quest follows campaign status';

  perform test.as_user(null, 'anon');
  r := public.nearby_quests(5.6037, -0.1870, 500);
  perform test.reset();
  assert jsonb_array_length(r) = 0, 'paused campaign disappears from discovery';

  perform test.as_user('00000000-0000-0000-0000-00000000000c');
  perform test.expect_error(format('select public.claim_quest(%L, 5.6037, -0.1870, 8)', q), 'P0002');
  perform test.reset();

  perform test.as_user(m1);
  perform public.set_campaign_status(camp, 'active');
  perform public.set_campaign_status(camp, 'ended');
  perform test.expect_error(format('select public.set_campaign_status(%L, ''active'')', camp), '22023');
  perform test.reset();
end $$;

-- ---------------------------------------------------------------- privilege boundaries
do $$
declare ua constant uuid := '00000000-0000-0000-0000-00000000000a';
begin
  perform test.as_user(ua);
  perform test.expect_error('update public.profiles set xp = 99999 where id = ''00000000-0000-0000-0000-00000000000a''', '42501');
  perform test.expect_error('insert into public.quest_claims(quest_id, user_id) select id, ''00000000-0000-0000-0000-00000000000a'' from public.quests limit 1', '42501');
  perform test.reset();
  perform test.as_user(null, 'anon');
  perform test.expect_error('select public.claim_quest(gen_random_uuid(), 5, 5, 5)', '42501');
  perform test.expect_error('select public.set_campaign_status(gen_random_uuid(), ''paused'')', '42501');
  perform test.reset();
end $$;
