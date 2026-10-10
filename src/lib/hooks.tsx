import { useCallback, useEffect, useState } from 'react';
import { claimQuest, fetchNearbyQuests, isSupabaseConfigured } from './api';
import { previewQuests } from './preview';
import { useSession } from './session';
import RewardCodeDialog from '../components/RewardCodeDialog';
import type { ClaimResult, GeoFix, Quest } from './types';

export function useNearbyQuests(center: { lat: number; lng: number }, radiusM = 3000) {
  const { user } = useSession();
  const [quests, setQuests] = useState<Quest[]>(isSupabaseConfigured ? [] : previewQuests);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);
  const lat = Math.round(center.lat * 1000) / 1000, lng = Math.round(center.lng * 1000) / 1000;
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let live = true; setLoading(true);
    fetchNearbyQuests(lat, lng, radiusM)
      .then(rows => { if (live) { setQuests(rows); setError(''); } })
      .catch(e => { if (live) { setQuests([]); setError(e instanceof Error ? e.message : 'Could not load quests.'); } })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [lat, lng, radiusM, tick, user?.id]);
  return { quests, loading, error, reload: useCallback(() => setTick(t => t + 1), []) };
}

type Outcome = { result: ClaimResult; quest: Quest };

/** One place that knows how to claim: sign-in gate, fresh GPS fix, server call, code reveal, wallet refresh. */
export function useQuestClaim(locate: () => Promise<GeoFix | null>, onDone?: () => void) {
  const { user, openAuth, refreshWallet } = useSession();
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const claim = useCallback(async (quest: Quest) => {
    setNotice('');
    if (!isSupabaseConfigured) { setNotice('Preview quests do not issue XP or rewards. Connect Supabase to play for real (see the setup guide).'); return; }
    if (!user) { openAuth('signin'); setNotice('Sign in to claim quests.'); return; }
    setClaimingId(quest.id);
    try {
      const fix = await locate();
      if (!fix) { setNotice('We need your location to verify you are at the quest. Allow location access in your browser and try again.'); return; }
      const result = await claimQuest(quest.id, fix);
      if (result.redemption_code) setOutcome({ result, quest });
      else setNotice(`Quest verified. +${result.xp_awarded} XP${result.bonus_xp ? ` (includes ${result.bonus_xp} daily bonus)` : ''}.`);
      await refreshWallet(); onDone?.();
    } catch (e) { setNotice(e instanceof Error ? e.message : 'Unable to claim this quest.'); }
    finally { setClaimingId(null); }
  }, [user, openAuth, locate, refreshWallet, onDone]);

  const dialog = outcome?.result.redemption_code
    ? <RewardCodeDialog code={outcome.result.redemption_code} expiresAt={outcome.result.expires_at} merchant={outcome.quest.merchant_name}
        reward={outcome.quest.reward_label} bonusXp={outcome.result.bonus_xp} onClose={() => setOutcome(null)} />
    : null;
  return { claim, claimingId, notice, dismissNotice: () => setNotice(''), dialog };
}
