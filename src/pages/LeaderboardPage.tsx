import { useEffect, useState } from 'react';
import { CircleHelp } from 'lucide-react';
import { fetchLeaderboard, isSupabaseConfigured } from '../lib/api';
import { useSession } from '../lib/session';
import type { LeaderRow } from '../lib/types';

export default function LeaderboardPage() {
  const { user } = useSession();
  const [rows, setRows] = useState<LeaderRow[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let live = true;
    fetchLeaderboard().then(r => { if (live) setRows(r); }).catch(e => { if (live) setError(e instanceof Error ? e.message : 'Could not load the leaderboard.'); });
    return () => { live = false; };
  }, [user?.id]);

  return <div className="page-content">
    <div className="page-intro"><div><h1>This week's explorers.</h1><p>XP from verified quests over the last 7 days. Play at your own pace and keep it safe.</p></div></div>
    {!isSupabaseConfigured && <div className="notice-banner"><CircleHelp size={16}/><span>The leaderboard fills in once Supabase is connected and players start claiming quests.</span></div>}
    {error && <div className="notice-banner" role="alert"><CircleHelp size={16}/><span>{error}</span></div>}
    <div className="leaderboard-panel">
      {rows === null && isSupabaseConfigured && !error && <p className="muted-note">Loading…</p>}
      {rows && !rows.length && <div className="empty-state"><h3>No one has claimed a quest this week.</h3><p>Claim one and take the top spot.</p></div>}
      {rows?.map(r => <div className={`leader-row ${r.is_you ? 'leader-you' : ''}`} key={r.rank}>
        <span className="leader-rank">{String(r.rank).padStart(2, '0')}</span>
        <span className={`leader-avatar leader-avatar-${(r.rank - 1) % 4}`}>{r.display_name.slice(0, 2).toUpperCase()}</span>
        <div className="leader-person"><strong>{r.display_name} {r.is_you && <span className="you-tag">You</span>}</strong></div>
        <strong className="leader-points">{r.xp.toLocaleString()} <small>XP</small></strong>
      </div>)}
    </div>
  </div>;
}
