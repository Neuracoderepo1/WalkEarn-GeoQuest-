import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowRight, Check, CircleHelp, Gift, LocateFixed, MapPin, ShieldCheck, X } from 'lucide-react';
import QuestMap from '../components/QuestMap';
import { DEFAULT_AREA_LABEL, DEFAULT_CENTER, distanceBetween, formatDistance, useGeolocation } from '../lib/geo';
import { useNearbyQuests, useQuestClaim } from '../lib/hooks';
import { isSupabaseConfigured } from '../lib/api';

export default function MapPage() {
  const { fix, status, locate } = useGeolocation();
  const center = fix ?? DEFAULT_CENTER;
  const { quests, loading, error, reload } = useNearbyQuests(center, 4000);
  const { claim, claimingId, notice, dismissNotice, dialog } = useQuestClaim(locate, reload);
  const [params, setParams] = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(params.get('quest'));
  const selected = quests.find(q => q.id === selectedId) ?? null;
  const liveDistance = useMemo(() => selected && fix && selected.latitude != null && selected.longitude != null
    ? formatDistance(distanceBetween(fix, { lat: selected.latitude, lng: selected.longitude })) : selected?.distance_label, [selected, fix]);
  const choose = (id: string) => { setSelectedId(id); setParams(id ? { quest: id } : {}, { replace: true }); };

  return <div className="page-content">
    <div className="page-intro"><div>
      <h1>Explore on foot.</h1>
      <p>{fix ? 'Quests around your current location.' : `Showing quests around ${DEFAULT_AREA_LABEL}. Share your location to see what is near you.`}</p>
    </div></div>
    {!isSupabaseConfigured && <div className="notice-banner"><CircleHelp size={16}/><span>Preview map: these sample quests are illustrative and issue no rewards.</span></div>}
    {status === 'denied' && <div className="notice-banner"><CircleHelp size={16}/><span>Location access is blocked. Enable it in your browser settings to claim quests.</span></div>}
    {error && <div className="notice-banner" role="alert"><CircleHelp size={16}/><span>{error}</span></div>}
    {notice && <div className="notice-banner" role="status"><CircleHelp size={16}/><span>{notice}</span><button onClick={dismissNotice} aria-label="Dismiss"><X size={15}/></button></div>}
    <div className="map-stage">
      <QuestMap center={center} player={fix} quests={quests} selectedId={selectedId} onSelect={choose} className="quest-map-large"/>
      <button className="locate-button outline-cta" onClick={() => void locate()} disabled={status === 'locating'}><LocateFixed size={15}/> {status === 'locating' ? 'Locating…' : fix ? 'Update my location' : 'Use my location'}</button>
      <div className="map-key" aria-hidden="true"><span><i className="key-dot key-quest"/>Quest</span><span><i className="key-dot key-merchant"/>Merchant reward</span><span><i className="key-dot key-you"/>You</span></div>
    </div>
    {selected && <section className="selected-panel" aria-live="polite">
      <div><span className="daily-label">{selected.category}{selected.merchant_name ? ` · ${selected.merchant_name}` : ''}</span><h2>{selected.title}</h2><p>{selected.description}</p>
        <div className="selected-meta"><span><MapPin size={14}/> {selected.location_name} · {liveDistance}</span>{selected.merchant_name && <span><Gift size={14}/> {selected.reward_label}</span>}<span>✦ {selected.xp_reward} XP</span></div></div>
      <button className="primary-button" onClick={() => void claim(selected)} disabled={selected.claimed || claimingId === selected.id}>
        {selected.claimed ? <><Check size={16}/> Claimed</> : claimingId === selected.id ? 'Checking location…' : <>Claim at this spot <ArrowRight size={16}/></>}
      </button>
    </section>}
    <section className="section-block">
      <div className="section-heading"><div><h2>{loading ? 'Looking for quests…' : `${quests.length} quest${quests.length === 1 ? '' : 's'} nearby`}</h2></div></div>
      {!loading && !quests.length && !error && <div className="empty-state"><div><MapPin size={24}/></div><h3>No quests in this area yet.</h3><p>Local businesses add quests as they join. Check back soon, or invite your favorite spot.</p></div>}
      <ul className="nearby-list">{quests.map(q => <li key={q.id}><button className={`nearby-row ${q.id === selectedId ? 'nearby-active' : ''}`} onClick={() => choose(q.id)} aria-pressed={q.id === selectedId}>
        <span className="nearby-main"><strong>{q.title}</strong><small>{q.merchant_name ?? q.location_name}</small></span><span className="nearby-side">{q.claimed ? 'Claimed' : q.distance_label}</span></button></li>)}</ul>
    </section>
    <div className="safety-note"><ShieldCheck size={19}/><div><strong>Play safe, explore smart.</strong><p>Stay on public walkways, obey local signs, and never enter roads or private property to claim a reward. Quests never ask you to hurry.</p></div></div>
    {dialog}
  </div>;
}
