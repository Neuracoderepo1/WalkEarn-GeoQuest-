-- WalkEarn v2 (a GeoQuest experience). Apply after 20261008000100_geoquest_mvp.sql.
-- Adds: claim-time location audit + anti-abuse limits, nearby quest discovery, player wallet,
-- weekly leaderboard, claim-code reissue, campaign pause/end controls, merchant redemption analytics.

alter table public.quest_claims
  add column if not exists claim_location extensions.geography(Point, 4326),
  add column if not exists claim_accuracy_m real;

alter table public.profiles
  add constraint profiles_display_name_length check (length(trim(display_name)) between 1 and 40) not valid;

-- Sign-up metadata is user-controlled: trim and cap the display name so it satisfies the new constraint.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, display_name)
  values (new.id, coalesce(nullif(left(trim(new.raw_user_meta_data ->> 'display_name'), 40), ''), 'Explorer'))
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- claim_quest v2: same contract as v1, plus per-user serialization, a daily claim cap,
-- and a walking-speed plausibility check between consecutive claims.
-- ---------------------------------------------------------------------------
create or replace function public.claim_quest(
  p_quest_id uuid,
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy_m double precision
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid();
  v_quest public.quests%rowtype;
  v_prev public.quest_claims%rowtype;
  v_point extensions.geography;
  v_token text;
  v_claim_id uuid;
  v_now timestamptz := now();
  v_recent integer;
  v_gap_m double precision;
  v_gap_s double precision;
  c_daily_cap constant integer := 8;
  c_bonus_stops constant integer := 3;
  c_bonus_xp constant integer := 100;
  v_today_count integer;
  v_bonus integer := 0;
  c_max_walk_speed_mps constant double precision := 4.0;
begin
  if v_user_id is null then raise exception using errcode = '28000', message = 'Sign in to claim a quest.'; end if;
  if p_latitude is null or p_longitude is null or p_accuracy_m is null
     or p_latitude not between -90 and 90 or p_longitude not between -180 and 180
     or p_accuracy_m < 0 or p_accuracy_m > 50 then
    raise exception using errcode = '22023', message = 'Location fix is missing or too imprecise.';
  end if;

  -- Serialize this player's claims so the daily cap and speed check cannot be raced.
  perform 1 from public.profiles p where p.id = v_user_id for update;

  select * into v_quest from public.quests q
  where q.id = p_quest_id and q.status = 'active'
    and q.starts_at <= v_now and (q.ends_at is null or q.ends_at > v_now)
  for share;
  if not found then raise exception using errcode = 'P0002', message = 'Quest is unavailable.'; end if;
  if v_quest.location is null then raise exception using errcode = '22023', message = 'Quest has no configured location.'; end if;
  if v_quest.campaign_id is not null and not exists (
    select 1 from public.reward_campaigns c where c.id = v_quest.campaign_id and c.status = 'active'
      and c.redemption_count < c.redemption_limit and c.starts_at <= v_now and (c.ends_at is null or c.ends_at > v_now)
  ) then raise exception using errcode = '22023', message = 'Campaign is unavailable or its redemption limit has been reached.'; end if;

  v_point := extensions.st_setsrid(extensions.st_makepoint(p_longitude, p_latitude), 4326)::extensions.geography;
  if not extensions.st_dwithin(v_quest.location, v_point, least(v_quest.geofence_radius_m, 250) + p_accuracy_m) then
    raise exception using errcode = '22023', message = 'You are outside this quest area.';
  end if;

  select count(*) into v_recent from public.quest_claims c
  where c.user_id = v_user_id and c.claimed_at > v_now - interval '24 hours';
  if v_recent >= c_daily_cap then
    raise exception using errcode = '22023', message = 'Daily claim limit reached. Come back tomorrow.';
  end if;

  select * into v_prev from public.quest_claims c
  where c.user_id = v_user_id and c.claim_location is not null
  order by c.claimed_at desc limit 1;
  if found then
    v_gap_m := greatest(extensions.st_distance(v_prev.claim_location, v_point) - coalesce(v_prev.claim_accuracy_m, 0) - p_accuracy_m, 0);
    v_gap_s := greatest(extract(epoch from (v_now - v_prev.claimed_at)), 1);
    if v_gap_m > 100 and v_gap_m / v_gap_s > c_max_walk_speed_mps then
      raise exception using errcode = '22023', message = 'Movement since your last claim is faster than walking speed.';
    end if;
  end if;

  -- Daily challenge: the third verified stop of the UTC day earns a one-time bonus.
  select count(*) into v_today_count from public.quest_claims c
  where c.user_id = v_user_id and c.claimed_at >= (date_trunc('day', v_now at time zone 'utc') at time zone 'utc');
  if v_today_count = c_bonus_stops - 1 then v_bonus := c_bonus_xp; end if;

  if v_quest.merchant_id is not null then v_token := upper(encode(extensions.gen_random_bytes(5), 'hex')); end if;
  insert into public.quest_claims(quest_id, user_id, xp_awarded, token_hash, claim_location, claim_accuracy_m)
  values (v_quest.id, v_user_id, v_quest.xp_reward + v_bonus,
          case when v_token is null then null else encode(extensions.digest(v_token, 'sha256'), 'hex') end,
          v_point, p_accuracy_m)
  returning id into v_claim_id;

  update public.profiles set xp = xp + v_quest.xp_reward + v_bonus, updated_at = v_now where id = v_user_id;
  insert into public.audit_events(actor_id, merchant_id, event_type, entity_type, entity_id, details)
  values (v_user_id, v_quest.merchant_id, 'quest.claimed', 'quest_claim', v_claim_id::text,
          jsonb_build_object('quest_id', v_quest.id, 'xp_awarded', v_quest.xp_reward + v_bonus, 'bonus_xp', v_bonus));

  return jsonb_build_object('success', true, 'claim_id', v_claim_id, 'xp_awarded', v_quest.xp_reward + v_bonus,
    'bonus_xp', v_bonus, 'redemption_code', v_token, 'expires_at', v_now + interval '24 hours');
exception when unique_violation then
  raise exception using errcode = '23505', message = 'You have already claimed this quest.';
end;
$$;

-- ---------------------------------------------------------------------------
-- Discovery: active quests near a point. Public by design (the map is public).
-- ---------------------------------------------------------------------------
create or replace function public.nearby_quests(
  p_latitude double precision,
  p_longitude double precision,
  p_radius_m integer default 3000
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := now();
  v_radius integer := least(greatest(coalesce(p_radius_m, 3000), 100), 20000);
  v_point extensions.geography;
  v_result jsonb;
begin
  if p_latitude is null or p_longitude is null or p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then
    raise exception using errcode = '22023', message = 'A valid latitude and longitude are required.';
  end if;
  v_point := extensions.st_setsrid(extensions.st_makepoint(p_longitude, p_latitude), 4326)::extensions.geography;

  select coalesce(jsonb_agg(to_jsonb(t) order by t.distance_m), '[]'::jsonb) into v_result from (
    select q.id, q.title, q.description, q.category, q.xp_reward, q.location_name, q.geofence_radius_m,
           extensions.st_y(q.location::extensions.geometry) as latitude,
           extensions.st_x(q.location::extensions.geometry) as longitude,
           round(extensions.st_distance(q.location, v_point))::integer as distance_m,
           m.name as merchant_name,
           c.reward_description,
           case when c.id is null then null else c.redemption_limit - c.redemption_count end as remaining,
           (v_user_id is not null and exists (
              select 1 from public.quest_claims qc where qc.quest_id = q.id and qc.user_id = v_user_id)) as claimed
    from public.quests q
    left join public.reward_campaigns c on c.id = q.campaign_id
    left join public.merchants m on m.id = q.merchant_id and m.is_active
    where q.status = 'active' and q.starts_at <= v_now and (q.ends_at is null or q.ends_at > v_now)
      and q.location is not null
      and (q.merchant_id is null or m.id is not null)
      and (c.id is null or (c.status = 'active' and c.redemption_count < c.redemption_limit
                            and c.starts_at <= v_now and (c.ends_at is null or c.ends_at > v_now)))
      and extensions.st_dwithin(q.location, v_point, v_radius)
    order by distance_m
    limit 50
  ) t;
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Player wallet: profile, streak, and claim history (codes are never readable after issue).
-- ---------------------------------------------------------------------------
create or replace function public.my_wallet()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_claims jsonb;
  v_streak integer := 0;
  v_expected date := (now() at time zone 'utc')::date;
  v_first boolean := true;
  v_day date;
begin
  if v_user_id is null then raise exception using errcode = '28000', message = 'Sign in to open your wallet.'; end if;
  select * into v_profile from public.profiles p where p.id = v_user_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'claim_id', c.id, 'quest_id', q.id, 'title', q.title, 'location_name', q.location_name,
    'merchant_name', m.name, 'reward_description', camp.reward_description,
    'status', case when c.status = 'claimed' and c.expires_at <= now() then 'expired' else c.status::text end,
    'has_code', c.token_hash is not null, 'xp_awarded', c.xp_awarded,
    'claimed_at', c.claimed_at, 'expires_at', c.expires_at, 'redeemed_at', c.redeemed_at
  ) order by c.claimed_at desc), '[]'::jsonb) into v_claims
  from (select * from public.quest_claims where user_id = v_user_id order by claimed_at desc limit 50) c
  join public.quests q on q.id = c.quest_id
  left join public.merchants m on m.id = q.merchant_id
  left join public.reward_campaigns camp on camp.id = q.campaign_id;

  for v_day in
    select distinct (c.claimed_at at time zone 'utc')::date as d
    from public.quest_claims c where c.user_id = v_user_id order by d desc limit 400
  loop
    if v_first then
      v_first := false;
      if v_day = v_expected then v_streak := 1; v_expected := v_expected - 1;
      elsif v_day = v_expected - 1 then v_streak := 1; v_expected := v_expected - 2;
      else exit; end if;
    elsif v_day = v_expected then
      v_streak := v_streak + 1; v_expected := v_expected - 1;
    else
      exit;
    end if;
  end loop;

  return jsonb_build_object(
    'display_name', v_profile.display_name, 'xp', v_profile.xp, 'streak_days', v_streak,
    'quests_completed', (select count(*) from public.quest_claims c where c.user_id = v_user_id),
    'today_stops', (select count(*) from public.quest_claims c where c.user_id = v_user_id
                    and c.claimed_at >= (date_trunc('day', now() at time zone 'utc') at time zone 'utc')),
    'daily_bonus_stops', 3, 'daily_bonus_xp', 100,
    'rewards_redeemed', (select count(*) from public.quest_claims c where c.user_id = v_user_id and c.status = 'redeemed'),
    'claims', v_claims);
end;
$$;

-- ---------------------------------------------------------------------------
-- Weekly leaderboard: XP from verified claims in the last 7 days. Display names only.
-- ---------------------------------------------------------------------------
create or replace function public.weekly_leaderboard()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_user_id uuid := auth.uid(); v_result jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('rank', r.rank, 'display_name', r.display_name, 'xp', r.xp,
           'is_you', v_user_id is not null and r.user_id = v_user_id) order by r.rank), '[]'::jsonb)
  into v_result from (
    select row_number() over (order by sum(c.xp_awarded) desc, min(c.claimed_at)) as rank,
           c.user_id, p.display_name, sum(c.xp_awarded)::integer as xp
    from public.quest_claims c join public.profiles p on p.id = c.user_id
    where c.claimed_at > now() - interval '7 days'
    group by c.user_id, p.display_name
    order by 1 limit 20
  ) r;
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Lost your code? Rotate it. The previous code stops working immediately.
-- ---------------------------------------------------------------------------
create or replace function public.reissue_claim_code(p_claim_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid := auth.uid(); v_claim public.quest_claims%rowtype; v_token text;
begin
  if v_user_id is null then raise exception using errcode = '28000', message = 'Sign in first.'; end if;
  select * into v_claim from public.quest_claims c where c.id = p_claim_id and c.user_id = v_user_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Claim not found.'; end if;
  if v_claim.token_hash is null then raise exception using errcode = '22023', message = 'This quest has no redemption code.'; end if;
  if v_claim.status <> 'claimed' or v_claim.expires_at <= now() then
    raise exception using errcode = '22023', message = 'This reward has expired or was already redeemed.';
  end if;
  v_token := upper(encode(extensions.gen_random_bytes(5), 'hex'));
  update public.quest_claims set token_hash = encode(extensions.digest(v_token, 'sha256'), 'hex') where id = v_claim.id;
  insert into public.audit_events(actor_id, event_type, entity_type, entity_id, details)
  values (v_user_id, 'claim.code_reissued', 'quest_claim', v_claim.id::text, '{}'::jsonb);
  return jsonb_build_object('success', true, 'claim_id', v_claim.id, 'redemption_code', v_token, 'expires_at', v_claim.expires_at);
end;
$$;

-- ---------------------------------------------------------------------------
-- Campaign controls: pause, resume, end. Keeps the linked quest in sync.
-- ---------------------------------------------------------------------------
create or replace function public.set_campaign_status(p_campaign_id uuid, p_status text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid := auth.uid(); v_campaign public.reward_campaigns%rowtype;
begin
  if v_user_id is null then raise exception using errcode = '28000', message = 'Sign in first.'; end if;
  if p_status is null or p_status not in ('active', 'paused', 'ended') then
    raise exception using errcode = '22023', message = 'Status must be active, paused, or ended.';
  end if;
  select * into v_campaign from public.reward_campaigns c where c.id = p_campaign_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Campaign not found.'; end if;
  if not exists (select 1 from public.merchant_memberships mm
                 where mm.merchant_id = v_campaign.merchant_id and mm.user_id = v_user_id and mm.role in ('owner', 'manager')) then
    raise exception using errcode = '42501', message = 'Merchant owner or manager access is required.';
  end if;
  if v_campaign.status = 'ended' then raise exception using errcode = '22023', message = 'Ended campaigns cannot be reopened.'; end if;
  update public.reward_campaigns set status = p_status::public.campaign_status, updated_at = now() where id = v_campaign.id;
  update public.quests set status = p_status::public.quest_status where campaign_id = v_campaign.id;
  insert into public.audit_events(actor_id, merchant_id, event_type, entity_type, entity_id, details)
  values (v_user_id, v_campaign.merchant_id, 'campaign.status_changed', 'campaign', v_campaign.id::text,
          jsonb_build_object('from', v_campaign.status, 'to', p_status));
  return jsonb_build_object('success', true, 'campaign_id', v_campaign.id, 'status', p_status);
end;
$$;

-- ---------------------------------------------------------------------------
-- Merchant dashboard v2: adds claims, redemption rate inputs, and the caller's role.
-- ---------------------------------------------------------------------------
create or replace function public.merchant_dashboard()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid := auth.uid(); v_merchant_id uuid; v_role public.member_role; v_merchant public.merchants%rowtype; v_campaigns jsonb; v_locations jsonb;
begin
  if v_user_id is null then raise exception using errcode = '28000', message = 'Sign in first.'; end if;
  select mm.merchant_id, mm.role into v_merchant_id, v_role from public.merchant_memberships mm
  where mm.user_id = v_user_id order by mm.created_at limit 1;
  if v_merchant_id is null then raise exception using errcode = '42501', message = 'No merchant workspace is assigned to this account.'; end if;
  select * into v_merchant from public.merchants m where m.id = v_merchant_id and m.is_active;
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'title', c.title, 'status', c.status,
    'reward_description', c.reward_description, 'redemption_count', c.redemption_count, 'redemption_limit', c.redemption_limit,
    'fee_per_redemption', c.fee_per_redemption, 'created_at', c.created_at,
    'claim_count', (select count(*) from public.quest_claims qc join public.quests q on q.id = qc.quest_id where q.campaign_id = c.id)
  ) order by c.created_at desc), '[]'::jsonb)
  into v_campaigns from public.reward_campaigns c where c.merchant_id = v_merchant_id;
  select coalesce(jsonb_agg(jsonb_build_object('id', ml.id, 'name', ml.name, 'address', ml.address, 'geofence_radius_m', ml.geofence_radius_m) order by ml.name), '[]'::jsonb)
  into v_locations from public.merchant_locations ml where ml.merchant_id = v_merchant_id and ml.is_active;
  return jsonb_build_object('merchant_name', v_merchant.name, 'role', v_role, 'can_manage', v_role in ('owner', 'manager'),
    'campaigns', v_campaigns, 'locations', v_locations,
    'verified_redemptions', (select count(*) from public.redemptions r where r.merchant_id = v_merchant_id));
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges: nothing is executable by PUBLIC. Discovery and leaderboard are open to anon.
-- ---------------------------------------------------------------------------
revoke execute on function public.nearby_quests(double precision, double precision, integer) from public;
revoke execute on function public.weekly_leaderboard() from public;
revoke execute on function public.my_wallet() from public, anon;
revoke execute on function public.reissue_claim_code(uuid) from public, anon;
revoke execute on function public.set_campaign_status(uuid, text) from public, anon;
grant execute on function public.nearby_quests(double precision, double precision, integer) to anon, authenticated;
grant execute on function public.weekly_leaderboard() to anon, authenticated;
grant execute on function public.my_wallet() to authenticated;
grant execute on function public.reissue_claim_code(uuid) to authenticated;
grant execute on function public.set_campaign_status(uuid, text) to authenticated;
