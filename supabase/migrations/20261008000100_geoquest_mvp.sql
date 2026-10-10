-- GeoQuest MVP schema. Apply to a fresh Supabase project.
create extension if not exists pgcrypto with schema extensions;
create extension if not exists postgis with schema extensions;

create type public.member_role as enum ('owner', 'manager', 'staff');
create type public.quest_status as enum ('draft', 'active', 'paused', 'ended');
create type public.campaign_status as enum ('draft', 'active', 'paused', 'ended');
create type public.claim_status as enum ('claimed', 'redeemed', 'expired', 'revoked');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Explorer',
  xp integer not null default 0 check (xp >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.merchants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 120),
  slug text not null unique,
  description text not null default '',
  contact_email text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.merchant_memberships (
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.member_role not null default 'staff',
  created_at timestamptz not null default now(),
  primary key (merchant_id, user_id)
);

create table public.merchant_locations (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  name text not null,
  address text not null,
  location extensions.geography(Point, 4326) not null,
  geofence_radius_m integer not null default 80 check (geofence_radius_m between 20 and 250),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index merchant_locations_geo_idx on public.merchant_locations using gist(location);
create index merchant_locations_merchant_idx on public.merchant_locations(merchant_id);

create table public.reward_campaigns (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  location_id uuid references public.merchant_locations(id) on delete set null,
  title text not null check (length(trim(title)) between 3 and 100),
  reward_description text not null check (length(trim(reward_description)) between 3 and 240),
  status public.campaign_status not null default 'draft',
  redemption_limit integer not null default 50 check (redemption_limit between 1 and 100000),
  redemption_count integer not null default 0 check (redemption_count >= 0),
  fee_per_redemption numeric(10,2) not null default 0 check (fee_per_redemption >= 0),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at),
  check (redemption_count <= redemption_limit)
);
create index campaigns_merchant_status_idx on public.reward_campaigns(merchant_id, status);

create table public.quests (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.reward_campaigns(id) on delete set null,
  merchant_id uuid references public.merchants(id) on delete cascade,
  location_id uuid references public.merchant_locations(id) on delete set null,
  title text not null check (length(trim(title)) between 3 and 100),
  description text not null default '',
  location_name text not null default 'Quest location',
  category text not null default 'Local' check (category in ('Explore','Collect','Local')),
  xp_reward integer not null default 50 check (xp_reward between 0 and 1000),
  geofence_radius_m integer not null default 100 check (geofence_radius_m between 20 and 250),
  location extensions.geography(Point, 4326),
  status public.quest_status not null default 'draft',
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at),
  check (merchant_id is null or location_id is not null)
);
create index quests_active_idx on public.quests(status, starts_at, ends_at);
create index quests_geo_idx on public.quests using gist(location);

create table public.quest_claims (
  id uuid primary key default gen_random_uuid(),
  quest_id uuid not null references public.quests(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete cascade,
  status public.claim_status not null default 'claimed',
  xp_awarded integer not null default 0 check (xp_awarded >= 0),
  token_hash text unique,
  claimed_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  redeemed_at timestamptz,
  unique (quest_id, user_id),
  check ((status = 'redeemed') = (redeemed_at is not null))
);
create index quest_claims_user_idx on public.quest_claims(user_id, claimed_at desc);
create index quest_claims_status_expiry_idx on public.quest_claims(status, expires_at);

create table public.redemptions (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null unique references public.quest_claims(id) on delete restrict,
  campaign_id uuid references public.reward_campaigns(id) on delete restrict,
  merchant_id uuid not null references public.merchants(id) on delete restrict,
  redeemed_by uuid not null references auth.users(id),
  redeemed_at timestamptz not null default now(),
  request_id uuid not null unique default gen_random_uuid()
);
create index redemptions_merchant_date_idx on public.redemptions(merchant_id, redeemed_at desc);

create table public.audit_events (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  merchant_id uuid references public.merchants(id) on delete set null,
  event_type text not null,
  entity_type text not null,
  entity_id text,
  request_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_events_created_idx on public.audit_events(created_at desc);
create index audit_events_actor_idx on public.audit_events(actor_id, created_at desc);

-- Automatic profile provisioning; authorization never depends on user-editable metadata.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, display_name)
  values (new.id, coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), 'Explorer'))
  on conflict (id) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.is_merchant_member(p_merchant_id uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select exists (
    select 1 from public.merchant_memberships mm
    where mm.merchant_id = p_merchant_id and mm.user_id = (select auth.uid())
  );
$$;

-- Claim a quest only after server-side distance, accuracy, timing, and uniqueness checks.
-- Token plaintext is returned once; only its SHA-256 hash is persisted.
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
  v_token text;
  v_claim_id uuid;
  v_now timestamptz := now();
begin
  if v_user_id is null then raise exception using errcode = '28000', message = 'Sign in to claim a quest.'; end if;
  if p_latitude is null or p_longitude is null or p_accuracy_m is null
     or p_latitude not between -90 and 90 or p_longitude not between -180 and 180
     or p_accuracy_m < 0 or p_accuracy_m > 50 then
    raise exception using errcode = '22023', message = 'Location fix is missing or too imprecise.';
  end if;

  select * into v_quest from public.quests q
  where q.id = p_quest_id and q.status = 'active'
    and q.starts_at <= v_now and (q.ends_at is null or q.ends_at > v_now)
  for share;
  if not found then raise exception using errcode = 'P0002', message = 'Quest is unavailable.'; end if;
  if v_quest.location is null then raise exception using errcode = '22023', message = 'Quest has no configured location.'; end if;
  if v_quest.campaign_id is not null and not exists (
    select 1 from public.reward_campaigns c where c.id=v_quest.campaign_id and c.status='active'
      and c.redemption_count < c.redemption_limit and c.starts_at <= v_now and (c.ends_at is null or c.ends_at > v_now)
  ) then raise exception using errcode = '22023', message = 'Campaign is unavailable or its redemption limit has been reached.'; end if;
  if not extensions.st_dwithin(
      v_quest.location,
      extensions.st_setsrid(extensions.st_makepoint(p_longitude, p_latitude),4326)::extensions.geography,
      least(v_quest.geofence_radius_m, 250) + p_accuracy_m
    ) then
    raise exception using errcode = '22023', message = 'You are outside this quest area.';
  end if;

  if v_quest.merchant_id is not null then v_token := upper(encode(extensions.gen_random_bytes(5), 'hex')); end if;
  insert into public.quest_claims(quest_id, user_id, xp_awarded, token_hash)
  values (v_quest.id, v_user_id, v_quest.xp_reward, case when v_token is null then null else encode(extensions.digest(v_token, 'sha256'), 'hex') end)
  returning id into v_claim_id;

  update public.profiles set xp = xp + v_quest.xp_reward, updated_at = v_now where id = v_user_id;
  insert into public.audit_events(actor_id, merchant_id, event_type, entity_type, entity_id, details)
  values (v_user_id, v_quest.merchant_id, 'quest.claimed', 'quest_claim', v_claim_id::text,
          jsonb_build_object('quest_id', v_quest.id, 'xp_awarded', v_quest.xp_reward));

  return jsonb_build_object('success', true, 'claim_id', v_claim_id, 'xp_awarded', v_quest.xp_reward,
    'redemption_code', v_token, 'expires_at', v_now + interval '24 hours');
exception when unique_violation then
  raise exception using errcode = '23505', message = 'You have already claimed this quest.';
end;
$$;

-- Merchant-only, one-time redemption. The lock prevents two simultaneous requests winning.
create or replace function public.redeem_reward(p_code text, p_request_id uuid default gen_random_uuid())
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid();
  v_claim public.quest_claims%rowtype;
  v_quest public.quests%rowtype;
  v_campaign public.reward_campaigns%rowtype;
  v_merchant_id uuid;
  v_redemption_id uuid;
  v_hash text;
begin
  if v_user_id is null then raise exception using errcode = '28000', message = 'Sign in with a merchant account.'; end if;
  if p_code is null or length(trim(p_code)) < 8 or length(trim(p_code)) > 32 then
    raise exception using errcode = '22023', message = 'Invalid redemption code.';
  end if;
  v_hash := encode(extensions.digest(upper(trim(p_code)), 'sha256'), 'hex');
  select c.* into v_claim from public.quest_claims c where c.token_hash = v_hash for update;
  if not found then raise exception using errcode = 'P0002', message = 'Redemption code not found.'; end if;
  if v_claim.status <> 'claimed' or v_claim.expires_at <= now() then
    raise exception using errcode = '22023', message = 'Code is expired or has already been used.';
  end if;
  select q.* into v_quest from public.quests q where q.id = v_claim.quest_id;
  v_merchant_id := v_quest.merchant_id;
  if v_merchant_id is null or not public.is_merchant_member(v_merchant_id) then
    raise exception using errcode = '42501', message = 'This account cannot redeem this reward.';
  end if;
  if v_quest.campaign_id is not null then
    select c.* into v_campaign from public.reward_campaigns c where c.id = v_quest.campaign_id for update;
    if v_campaign.status <> 'active' or v_campaign.redemption_count >= v_campaign.redemption_limit then
      raise exception using errcode = '22023', message = 'Campaign is paused or its redemption limit has been reached.';
    end if;
    update public.reward_campaigns set redemption_count = redemption_count + 1, updated_at = now()
    where id = v_campaign.id;
  end if;
  update public.quest_claims set status = 'redeemed', redeemed_at = now() where id = v_claim.id;
  insert into public.redemptions(claim_id, campaign_id, merchant_id, redeemed_by, request_id)
  values (v_claim.id, v_quest.campaign_id, v_merchant_id, v_user_id, p_request_id)
  returning id into v_redemption_id;
  insert into public.audit_events(actor_id, merchant_id, event_type, entity_type, entity_id, request_id, details)
  values (v_user_id, v_merchant_id, 'reward.redeemed', 'redemption', v_redemption_id::text, p_request_id,
          jsonb_build_object('claim_id', v_claim.id, 'campaign_id', v_quest.campaign_id));
  return jsonb_build_object('success', true, 'redemption_id', v_redemption_id, 'redeemed_at', now());
end;
$$;

create or replace function public.create_merchant_campaign(
  p_title text, p_reward_description text, p_redemption_limit integer,
  p_fee_per_redemption numeric, p_location_id uuid default null,
  p_starts_at timestamptz default now(), p_ends_at timestamptz default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid(); v_merchant_id uuid; v_campaign public.reward_campaigns%rowtype; v_location public.merchant_locations%rowtype; v_quest_id uuid;
begin
  if v_user_id is null then raise exception using errcode = '28000', message = 'Sign in first.'; end if;
  if length(trim(coalesce(p_title,''))) not between 3 and 100 or length(trim(coalesce(p_reward_description,''))) not between 3 and 240 then
    raise exception using errcode = '22023', message = 'Enter a valid campaign title and reward description.';
  end if;
  if p_redemption_limit not between 1 and 100000 or p_fee_per_redemption < 0 then
    raise exception using errcode = '22023', message = 'Invalid campaign limits or fee.';
  end if;
  select mm.merchant_id into v_merchant_id from public.merchant_memberships mm
  where mm.user_id = v_user_id and mm.role in ('owner','manager') order by mm.created_at limit 1;
  if v_merchant_id is null then raise exception using errcode = '42501', message = 'Merchant owner or manager access is required.'; end if;
  if p_location_id is not null and not exists(select 1 from public.merchant_locations ml where ml.id=p_location_id and ml.merchant_id=v_merchant_id and ml.is_active) then
    raise exception using errcode = '42501', message = 'Selected location does not belong to this merchant.';
  end if;
  if p_location_id is null then raise exception using errcode = '22023', message = 'Choose an active merchant location to launch a campaign.'; end if;
  select * into v_location from public.merchant_locations ml where ml.id=p_location_id and ml.merchant_id=v_merchant_id and ml.is_active;
  if not found then raise exception using errcode = '42501', message = 'Selected location does not belong to this merchant.'; end if;
  insert into public.reward_campaigns(merchant_id, location_id, title, reward_description, status, redemption_limit,
    fee_per_redemption, starts_at, ends_at, created_by)
  values(v_merchant_id, p_location_id, trim(p_title), trim(p_reward_description), 'active', p_redemption_limit,
    p_fee_per_redemption, coalesce(p_starts_at, now()), p_ends_at, v_user_id)
  returning * into v_campaign;
  insert into public.quests(campaign_id, merchant_id, location_id, title, description, location_name, category, xp_reward, geofence_radius_m, location, status, starts_at, ends_at)
  values(v_campaign.id, v_merchant_id, v_location.id, v_campaign.title, v_campaign.reward_description, v_location.name, 'Local', 50,
    v_location.geofence_radius_m, v_location.location, 'active', v_campaign.starts_at, v_campaign.ends_at) returning id into v_quest_id;
  insert into public.audit_events(actor_id, merchant_id, event_type, entity_type, entity_id, details)
  values(v_user_id, v_merchant_id, 'campaign.created', 'campaign', v_campaign.id::text,
    jsonb_build_object('title',v_campaign.title,'redemption_limit',v_campaign.redemption_limit,'quest_id',v_quest_id));
  return jsonb_build_object('success',true,'campaign',to_jsonb(v_campaign),'quest_id',v_quest_id);
end;
$$;

create or replace function public.merchant_dashboard()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid := auth.uid(); v_merchant_id uuid; v_merchant public.merchants%rowtype; v_campaigns jsonb; v_locations jsonb;
begin
  if v_user_id is null then raise exception using errcode = '28000', message = 'Sign in first.'; end if;
  select mm.merchant_id into v_merchant_id from public.merchant_memberships mm
  where mm.user_id=v_user_id order by mm.created_at limit 1;
  if v_merchant_id is null then raise exception using errcode = '42501', message = 'No merchant workspace is assigned to this account.'; end if;
  select * into v_merchant from public.merchants m where m.id=v_merchant_id and m.is_active;
  select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'title',c.title,'status',c.status,
    'reward_description',c.reward_description,'redemption_count',c.redemption_count,'redemption_limit',c.redemption_limit,
    'fee_per_redemption',c.fee_per_redemption,'created_at',c.created_at) order by c.created_at desc),'[]'::jsonb)
  into v_campaigns from public.reward_campaigns c where c.merchant_id=v_merchant_id;
  select coalesce(jsonb_agg(jsonb_build_object('id',ml.id,'name',ml.name,'address',ml.address,'geofence_radius_m',ml.geofence_radius_m) order by ml.name),'[]'::jsonb)
    into v_locations from public.merchant_locations ml where ml.merchant_id=v_merchant_id and ml.is_active;
  return jsonb_build_object('merchant_name',v_merchant.name,'campaigns',v_campaigns,'locations',v_locations,
    'verified_redemptions',(select count(*) from public.redemptions r where r.merchant_id=v_merchant_id));
end;
$$;

-- Least-privilege RLS. Public users can discover active quests; personal claims remain private.
alter table public.profiles enable row level security;
alter table public.merchants enable row level security;
alter table public.merchant_memberships enable row level security;
alter table public.merchant_locations enable row level security;
alter table public.reward_campaigns enable row level security;
alter table public.quests enable row level security;
alter table public.quest_claims enable row level security;
alter table public.redemptions enable row level security;
alter table public.audit_events enable row level security;

create policy "profiles read own" on public.profiles for select to authenticated using (id=(select auth.uid()));
create policy "profiles update own safe fields" on public.profiles for update to authenticated using (id=(select auth.uid())) with check (id=(select auth.uid()));
create policy "merchants read when member" on public.merchants for select to authenticated using (public.is_merchant_member(id));
create policy "memberships read own" on public.merchant_memberships for select to authenticated using (user_id=(select auth.uid()));
create policy "locations discover active" on public.merchant_locations for select to authenticated using (is_active and public.is_merchant_member(merchant_id));
create policy "campaigns member read" on public.reward_campaigns for select to authenticated using (public.is_merchant_member(merchant_id));
create policy "quests public active read" on public.quests for select to anon, authenticated using (status='active' and starts_at<=now() and (ends_at is null or ends_at>now()));
create policy "quests merchant member read" on public.quests for select to authenticated using (merchant_id is not null and public.is_merchant_member(merchant_id));
create policy "claims read own" on public.quest_claims for select to authenticated using (user_id=(select auth.uid()));
create policy "redemptions merchant read" on public.redemptions for select to authenticated using (public.is_merchant_member(merchant_id));
create policy "audit events merchant read" on public.audit_events for select to authenticated using (merchant_id is not null and public.is_merchant_member(merchant_id) and (select auth.uid())=actor_id);

revoke all on public.quest_claims, public.redemptions, public.audit_events from anon, authenticated;
grant select on public.profiles, public.merchants, public.merchant_memberships, public.merchant_locations,
  public.reward_campaigns, public.quests, public.quest_claims, public.redemptions, public.audit_events to authenticated;
grant select on public.quests to anon;
grant update(display_name) on public.profiles to authenticated;
revoke execute on function public.is_merchant_member(uuid) from public, anon;
grant execute on function public.is_merchant_member(uuid) to authenticated;
revoke execute on function public.claim_quest(uuid,double precision,double precision,double precision) from public, anon;
revoke execute on function public.redeem_reward(text,uuid) from public, anon;
revoke execute on function public.create_merchant_campaign(text,text,integer,numeric,uuid,timestamptz,timestamptz) from public, anon;
revoke execute on function public.merchant_dashboard() from public, anon;
grant execute on function public.claim_quest(uuid,double precision,double precision,double precision) to authenticated;
grant execute on function public.redeem_reward(text,uuid) to authenticated;
grant execute on function public.create_merchant_campaign(text,text,integer,numeric,uuid,timestamptz,timestamptz) to authenticated;
grant execute on function public.merchant_dashboard() to authenticated;
