import { isSupabaseConfigured, requireSupabase } from './supabase';
import type { ClaimResult, GeoFix, LeaderRow, NearbyQuestRow, Quest, Wallet } from './types';
import { formatDistance } from './geo';

/** Edge Functions return `{ error }` bodies on failure; surface that text instead of the generic non-2xx message. */
async function invoke<T>(name: string, body: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await requireSupabase().functions.invoke(name, { body });
  if (error) {
    let message = '';
    const ctx = (error as { context?: unknown }).context;
    if (ctx instanceof Response) {
      try { const parsed = await ctx.clone().json(); message = typeof parsed?.error === 'string' ? parsed.error : ''; } catch { /* body was not JSON */ }
    }
    throw new Error(message || error.message || 'Request failed.');
  }
  if (data && typeof data === 'object' && 'success' in data && (data as { success: boolean }).success === false) {
    throw new Error((data as { error?: string }).error || 'Request failed.');
  }
  return data as T;
}

export function toQuest(row: NearbyQuestRow): Quest {
  return {
    id: row.id, title: row.title, description: row.description, category: row.category, xp_reward: row.xp_reward,
    location_name: row.location_name, distance_label: formatDistance(row.distance_m), distance_m: row.distance_m,
    merchant_name: row.merchant_name ?? undefined, reward_label: row.reward_description ?? `${row.xp_reward} XP`,
    claimed: row.claimed, latitude: row.latitude, longitude: row.longitude, geofence_radius_m: row.geofence_radius_m, remaining: row.remaining,
  };
}

export async function fetchNearbyQuests(lat: number, lng: number, radiusM = 3000): Promise<Quest[]> {
  const { data, error } = await requireSupabase().rpc('nearby_quests', { p_latitude: lat, p_longitude: lng, p_radius_m: radiusM });
  if (error) throw new Error(error.message);
  return ((data ?? []) as NearbyQuestRow[]).map(toQuest);
}
export const claimQuest = (questId: string, fix: GeoFix) =>
  invoke<ClaimResult>('claim-quest', { quest_id: questId, latitude: fix.lat, longitude: fix.lng, accuracy_m: fix.accuracy });
export const reissueCode = (claimId: string) => invoke<{ redemption_code: string; expires_at: string }>('reissue-code', { claim_id: claimId });
export const setCampaignStatus = (campaignId: string, status: 'active' | 'paused' | 'ended') => invoke('set-campaign-status', { campaign_id: campaignId, status });
export const createCampaign = (body: Record<string, unknown>) => invoke('create-campaign', body);
export const redeemCode = (code: string) => invoke('redeem-reward', { code });
export const merchantDashboard = () => invoke<{
  merchant_name: string; can_manage: boolean; role: string; verified_redemptions: number;
  campaigns: import('./types').MerchantCampaign[]; locations: { id: string; name: string; address: string }[];
}>('merchant-dashboard');

export async function fetchWallet(): Promise<Wallet> {
  const { data, error } = await requireSupabase().rpc('my_wallet');
  if (error) throw new Error(error.message);
  return data as Wallet;
}
export async function fetchLeaderboard(): Promise<LeaderRow[]> {
  const { data, error } = await requireSupabase().rpc('weekly_leaderboard');
  if (error) throw new Error(error.message);
  return (data ?? []) as LeaderRow[];
}
export { isSupabaseConfigured };
