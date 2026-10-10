export type Quest = {
  id: string; title: string; description: string; category: 'Explore' | 'Collect' | 'Local';
  xp_reward: number; distance_label: string; location_name: string; merchant_name?: string;
  reward_label?: string; claimed?: boolean; latitude?: number; longitude?: number;
  geofence_radius_m?: number; distance_m?: number; remaining?: number | null;
};
export type MerchantCampaign = {
  id: string; title: string; status: 'active' | 'paused' | 'ended'; reward_description: string;
  redemption_limit: number; redemption_count: number; fee_per_redemption: number; claim_count?: number;
};
export type NearbyQuestRow = {
  id: string; title: string; description: string; category: Quest['category']; xp_reward: number;
  location_name: string; geofence_radius_m: number; latitude: number; longitude: number; distance_m: number;
  merchant_name: string | null; reward_description: string | null; remaining: number | null; claimed: boolean;
};
export type WalletClaim = {
  claim_id: string; quest_id: string; title: string; location_name: string; merchant_name: string | null;
  reward_description: string | null; status: 'claimed' | 'redeemed' | 'expired' | 'revoked'; has_code: boolean;
  xp_awarded: number; claimed_at: string; expires_at: string; redeemed_at: string | null;
};
export type Wallet = {
  display_name: string; xp: number; streak_days: number; quests_completed: number; rewards_redeemed: number;
  today_stops: number; daily_bonus_stops: number; daily_bonus_xp: number; claims: WalletClaim[];
};
export type LeaderRow = { rank: number; display_name: string; xp: number; is_you: boolean };
export type ClaimResult = { success: boolean; claim_id: string; xp_awarded: number; bonus_xp: number; redemption_code: string | null; expires_at: string };
export type GeoFix = { lat: number; lng: number; accuracy: number };
