import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, CircleHelp, Gem, LocateFixed, Navigation, Sparkles, Store, Target, X } from 'lucide-react';
import QuestMap from '../components/QuestMap';
import QuestCard from '../components/QuestCard';
import { DEFAULT_AREA_LABEL, DEFAULT_CENTER, useGeolocation } from '../lib/geo';
import { useNearbyQuests, useQuestClaim } from '../lib/hooks';
import { isSupabaseConfigured } from '../lib/api';
import { useSession } from '../lib/session';

const FILTERS = ['All quests', 'Explore', 'Collect', 'Local'] as const;

export default function DiscoverPage() {
  const nav = useNavigate();
  const { user, wallet, openAuth } = useSession();
  const { fix, status, locate } = useGeolocation();
  const center = fix ?? DEFAULT_CENTER;
  const { quests, loading, error, reload } = useNearbyQuests(center);
  const { claim, claimingId, notice, dismissNotice, dialog } = useQuestClaim(locate, reload);
  const [filter, setFilter] = useState<typeof FILTERS[number]>('All quests');
  const filtered = useMemo(() => quests.filter(q => filter === 'All quests' || q.category === filter), [quests, filter]);
  const stops = wallet?.today_stops ?? 0, goal = wallet?.daily_bonus_stops ?? 3, bonus = wallet?.daily_bonus_xp ?? 100;
  const pct = Math.min(100, Math.round((stops / goal) * 100));

  return <div className="page-content">
    <div className="page-intro"><div>
      <h1>Your neighborhood is the game board.</h1>
      <p>Walk to a quest, check in on the spot, and collect XP or a real reward from a local business.</p>
    </div>
      {wallet && wallet.streak_days > 0 && <div className="streak-pill"><span className="streak-flame">✳</span><span><strong>{wallet.streak_days} day streak</strong><small>Claim one today to keep it</small></span></div>}
    </div>

    <section className="hero-grid">
      <div className="map-hero">
        <div className="map-hero-top"><span className="live-tag"><i/> {isSupabaseConfigured ? 'Live map' : 'Preview map'}</span><Link to="/map" className="text-link">Open full map <ArrowRight size={14}/></Link></div>
        <QuestMap center={center} player={fix} quests={quests} interactive={false} className="quest-map-hero" onSelect={id => nav(`/map?quest=${id}`)}/>
        <div className="map-hero-bottom">
          <strong><Navigation size={14}/> {loading ? 'Looking for quests…' : `${quests.length} quest${quests.length === 1 ? '' : 's'} within 3 km`}</strong>
          <button className="outline-cta" onClick={() => void locate()} disabled={status === 'locating'}><LocateFixed size={14}/> {status === 'locating' ? 'Locating…' : fix ? 'Refresh' : 'Use my location'}</button>
        </div>
      </div>
      <div className="daily-card">
        <div className="daily-card-top"><span className="mini-icon"><Target size={17}/></span><span className="daily-label">Daily challenge</span><span className="daily-spark"><Sparkles size={15}/></span></div>
        <div className="daily-art"><div className="orb orb-one"/><div className="orb orb-two"/><div className="daily-gem"><Gem size={45} strokeWidth={1.3}/></div><div className="daily-ring ring-one"/><div className="daily-ring ring-two"/></div>
        <div className="daily-copy"><div className="daily-xp">+{bonus} XP <span>✦</span></div><h3>{goal} stops, one bonus.</h3><p>Claim {goal} quests in a day and the third pays a bonus. Resets at midnight UTC.</p></div>
        {user && wallet ? <div className="daily-progress"><div><span>Today</span><strong>{Math.min(stops, goal)} <small>/ {goal} stops</small></strong></div><div className="daily-progress-track"><span style={{ width: `${pct}%` }}/></div></div>
          : <button className="daily-cta" onClick={() => openAuth('signin')} disabled={!isSupabaseConfigured}>Sign in to track progress <ArrowRight size={16}/></button>}
      </div>
    </section>

    <section className="section-block">
      <div className="section-heading"><div><h2>Quests near {fix ? 'you' : DEFAULT_AREA_LABEL}<span className="heading-dot">.</span></h2></div><Link to="/quests" className="text-link">All quests <ArrowRight size={15}/></Link></div>
      {!isSupabaseConfigured && <div className="notice-banner"><CircleHelp size={16}/><span>Preview mode: these sample quests are illustrative and issue no XP or rewards.</span></div>}
      {status === 'denied' && <div className="notice-banner"><CircleHelp size={16}/><span>Location access is blocked. Enable it in your browser settings to claim quests.</span></div>}
      {error && <div className="notice-banner" role="alert"><CircleHelp size={16}/><span>{error}</span></div>}
      {notice && <div className="notice-banner" role="status"><CircleHelp size={16}/><span>{notice}</span><button onClick={dismissNotice} aria-label="Dismiss"><X size={15}/></button></div>}
      <div className="filter-row">{FILTERS.map(f => <button key={f} onClick={() => setFilter(f)} className={`filter-chip ${filter === f ? 'filter-active' : ''}`} aria-pressed={filter === f}>{f}</button>)}</div>
      {!loading && !filtered.length && !error ? <div className="empty-state"><div><Navigation size={24}/></div><h3>No quests here yet.</h3><p>Local businesses add quests as they join. Try another filter or open the map to look further out.</p></div>
        : <div className="quest-grid">{filtered.map((q, i) => <QuestCard key={q.id} quest={q} index={i} claiming={claimingId === q.id} onClaim={() => void claim(q)}/>)}</div>}
    </section>

    <section className="merchant-strip"><div className="merchant-strip-icon"><Store size={22}/></div>
      <div><span>Local businesses</span><h3>Bring walkers to your door.</h3><p>Launch a quest, cap your reward budget, and pay only for rewards redeemed in your shop.</p></div>
      <Link to="/merchant" className="outline-cta">For merchants <ArrowRight size={15}/></Link></section>
    {dialog}
  </div>;
}
