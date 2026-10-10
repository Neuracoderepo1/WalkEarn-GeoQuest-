import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, CircleHelp, Footprints, X } from 'lucide-react';
import QuestCard from '../components/QuestCard';
import { DEFAULT_CENTER, useGeolocation } from '../lib/geo';
import { useNearbyQuests, useQuestClaim } from '../lib/hooks';
import { isSupabaseConfigured } from '../lib/api';
import { useSession } from '../lib/session';

const TABS = ['Available', 'In progress', 'Completed'] as const;

export default function QuestsPage() {
  const { user, wallet, openAuth } = useSession();
  const { fix, locate } = useGeolocation();
  const { quests, loading, error, reload } = useNearbyQuests(fix ?? DEFAULT_CENTER);
  const { claim, claimingId, notice, dismissNotice, dialog } = useQuestClaim(locate, reload);
  const [tab, setTab] = useState<typeof TABS[number]>('Available');
  const available = quests.filter(q => !q.claimed);
  const inProgress = wallet?.claims.filter(c => c.has_code && c.status === 'claimed') ?? [];
  const completed = wallet?.claims.filter(c => !(c.has_code && c.status === 'claimed')) ?? [];
  const counts = { Available: available.length, 'In progress': inProgress.length, Completed: completed.length };

  return <div className="page-content">
    <div className="page-intro"><div><h1>Your quests.</h1><p>Pick one that fits your walk. Small stops add up.</p></div></div>
    {error && <div className="notice-banner" role="alert"><CircleHelp size={16}/><span>{error}</span></div>}
    {notice && <div className="notice-banner" role="status"><CircleHelp size={16}/><span>{notice}</span><button onClick={dismissNotice} aria-label="Dismiss"><X size={15}/></button></div>}
    <div className="stats-row">
      <div className="stat-card"><span className="stat-label">Quests completed</span><strong>{wallet?.quests_completed ?? '–'}</strong></div>
      <div className="stat-card"><span className="stat-label">Total XP</span><strong>{wallet ? wallet.xp.toLocaleString() : '–'}</strong></div>
      <div className="stat-card"><span className="stat-label">Day streak</span><strong>{wallet?.streak_days ?? '–'}</strong></div>
    </div>
    <div className="section-block">
      <div className="tabs-row" role="tablist">{TABS.map(t => <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`tab-button ${tab === t ? 'tab-active' : ''}`}>{t} <span className="tab-count">{counts[t]}</span></button>)}</div>
      {tab === 'Available' && (loading ? <p className="muted-note">Looking for quests…</p> : available.length
        ? <div className="quest-grid">{available.map((q, i) => <QuestCard key={q.id} quest={q} index={i} claiming={claimingId === q.id} onClaim={() => void claim(q)}/>)}</div>
        : <div className="empty-state"><div><Footprints size={25}/></div><h3>Nothing new nearby.</h3><p>You have claimed everything in range. Try the map to look further out.</p><Link to="/map" className="outline-cta">Open map <ArrowRight size={15}/></Link></div>)}
      {tab !== 'Available' && !user && <div className="empty-state"><div><Check size={25}/></div><h3>Sign in to track your progress.</h3><p>Your claimed quests appear here.</p><button className="primary-button" onClick={() => openAuth('signin')} disabled={!isSupabaseConfigured}>Sign in <ArrowRight size={16}/></button></div>}
      {tab === 'In progress' && user && (inProgress.length ? <ul className="wallet-list">{inProgress.map(c => <li key={c.claim_id} className="wallet-row"><div><strong>{c.title}</strong><small>Show your code at {c.merchant_name ?? c.location_name} before it expires</small></div><Link to="/rewards" className="outline-cta">Open wallet <ArrowRight size={15}/></Link></li>)}</ul>
        : <div className="empty-state"><div><Footprints size={25}/></div><h3>Nothing waiting to redeem.</h3><p>Claimed merchant rewards show up here until you redeem them.</p></div>)}
      {tab === 'Completed' && user && (completed.length ? <ul className="wallet-list">{completed.map(c => <li key={c.claim_id} className="wallet-row"><div><strong>{c.title}</strong><small>{c.location_name} · {new Date(c.claimed_at).toLocaleDateString()}</small></div><span className="leader-points">+{c.xp_awarded} <small>XP</small></span></li>)}</ul>
        : <div className="empty-state"><div><Check size={25}/></div><h3>Your first completed quest starts here.</h3><p>Finished quests are listed with the XP they earned.</p></div>)}
    </div>
    {dialog}
  </div>;
}
