import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const migration = read('supabase/migrations/20261008000100_geoquest_mvp.sql');

test('quest claims enforce one claim per player and quest', () => {
  assert.match(migration, /unique\s*\(quest_id,\s*user_id\)/i);
  assert.match(migration, /p_accuracy_m\s*>\s*50/i);
  assert.match(migration, /st_dwithin/i);
});

test('redemption is transactionally single-use and campaign-capped', () => {
  assert.match(migration, /where c\.token_hash\s*=\s*v_hash\s+for update/i);
  assert.match(migration, /claim_id uuid not null unique/i);
  assert.match(migration, /redemption_count\s*>=\s*v_campaign\.redemption_limit/i);
  assert.match(migration, /status = 'redeemed'/i);
});

test('privileged RPCs have fixed search paths and restricted execute grants', () => {
  for (const fn of ['claim_quest', 'redeem_reward', 'create_merchant_campaign', 'merchant_dashboard']) {
    assert.match(migration, new RegExp(`function public\\.${fn}[\\s\\S]*?security definer set search_path = ''`, 'i'));
  }
  assert.match(migration, /revoke execute on function public\.claim_quest[\s\S]*?from public, anon/i);
  assert.match(migration, /grant execute on function public\.claim_quest[\s\S]*?to authenticated/i);
});

test('all exposed business tables have row-level security enabled', () => {
  for (const table of ['profiles','merchants','merchant_memberships','merchant_locations','reward_campaigns','quests','quest_claims','redemptions','audit_events']) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
  }
});

test('required Edge Functions exist and use authenticated user context', () => {
  for (const fn of ['claim-quest','redeem-reward','merchant-dashboard','create-campaign']) {
    const path = `supabase/functions/${fn}/index.ts`;
    assert.ok(existsSync(new URL(path, root)), `${path} exists`);
    const source = read(path);
    assert.match(source, /auth\.getUser\(\)/);
    assert.match(source, /supabase\.rpc\(/);
  }
});

test('frontend never exposes a service-role key', () => {
  const supabaseClient = read('src/lib/supabase.ts');
  assert.doesNotMatch(supabaseClient, /SERVICE_ROLE|service_role|secret_key/i);
  assert.match(supabaseClient, /VITE_SUPABASE_ANON_KEY/);
});

// ---- WalkEarn v2 ----
import { readdirSync } from 'node:fs';
const migrations = readdirSync(new URL('supabase/migrations/', root)).sort().map(f => read(`supabase/migrations/${f}`)).join('\n');
const v2 = read('supabase/migrations/20261009000100_walkearn_v2.sql');

test('v2 privileged functions pin search_path and are not executable by PUBLIC', () => {
  for (const fn of ['claim_quest', 'nearby_quests', 'my_wallet', 'weekly_leaderboard', 'reissue_claim_code', 'set_campaign_status', 'merchant_dashboard']) {
    assert.match(v2, new RegExp(`function public\\.${fn}\\([\\s\\S]*?security definer set search_path = ''`, 'i'), `${fn} pins search_path`);
  }
  for (const sig of ['nearby_quests\\(double precision, double precision, integer\\)', 'weekly_leaderboard\\(\\)', 'my_wallet\\(\\)', 'reissue_claim_code\\(uuid\\)', 'set_campaign_status\\(uuid, text\\)']) {
    assert.match(v2, new RegExp(`revoke execute on function public\\.${sig} from public`, 'i'), `${sig} revoked from public`);
  }
  assert.match(v2, /revoke execute on function public\.my_wallet\(\) from public, anon/i, 'wallet is not anonymous');
});

test('claims enforce a daily cap, a walking-speed check, and per-player serialization', () => {
  assert.match(v2, /c_daily_cap constant integer := 8/);
  assert.match(v2, /c_max_walk_speed_mps constant double precision := 4\.0/);
  assert.match(v2, /from public\.profiles p where p\.id = v_user_id for update/i);
});

test('players can never read redemption codes back from the wallet', () => {
  const wallet = v2.slice(v2.indexOf('function public.my_wallet'), v2.indexOf('function public.weekly_leaderboard'));
  assert.doesNotMatch(wallet, /token_hash'/i, 'wallet does not select the token hash into its output');
  assert.match(wallet, /'has_code', c\.token_hash is not null/);
});

test('every Edge Function is registered with JWT verification', () => {
  const config = read('supabase/config.toml');
  for (const fn of ['claim-quest', 'redeem-reward', 'merchant-dashboard', 'create-campaign', 'reissue-code', 'set-campaign-status']) {
    assert.match(config, new RegExp(`\\[functions\\.${fn}\\]\\s+verify_jwt = true`), `${fn} verifies JWTs`);
    assert.ok(existsSync(new URL(`supabase/functions/${fn}/index.ts`, root)), `${fn} exists`);
  }
});

test('frontend renders merchant-supplied text safely (no innerHTML / dangerouslySetInnerHTML)', () => {
  const walk = dir => readdirSync(new URL(dir, root), { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(`${dir}${e.name}/`) : [`${dir}${e.name}`]);
  for (const file of walk('src/').filter(f => /\.(tsx?|jsx?)$/.test(f))) {
    assert.doesNotMatch(read(file), /innerHTML|dangerouslySetInnerHTML/, `${file} avoids raw HTML injection`);
  }
});

test('migrations apply in order and the latest claim_quest is the v2 definition', () => {
  assert.ok(migrations.lastIndexOf('function public.claim_quest') > migrations.indexOf('walkearn_v2') - 1);
  assert.match(v2, /p_accuracy_m > 50/);
  assert.match(v2, /st_dwithin/i);
});
