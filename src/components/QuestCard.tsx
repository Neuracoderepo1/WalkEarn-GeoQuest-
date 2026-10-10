import { ArrowRight, Check, Compass, Gem, Gift, MapPin, Store } from 'lucide-react';
import type { Quest } from '../lib/types';

export default function QuestCard({ quest, index, claiming, onClaim }: { quest: Quest; index: number; claiming: boolean; onClaim: () => void }) {
  const art = index % 3;
  return <article className="quest-card">
    <div className={`quest-card-art quest-art-${art}`}>
      <span className="quest-category">{quest.category}</span>
      <span className="quest-xp">✦ {quest.xp_reward} XP</span>
      <div className="quest-art-shape">{art === 0 ? <Compass size={48}/> : art === 1 ? <Gem size={48}/> : <Store size={48}/>}</div>
    </div>
    <div className="quest-card-body">
      <div className="quest-location"><MapPin size={13}/>{quest.location_name}<span>·</span>{quest.distance_label}</div>
      <h3>{quest.title}</h3>
      <p>{quest.description}</p>
      {quest.merchant_name && <div className="quest-reward"><Gift size={15}/><span>{quest.reward_label}</span><span className="reward-merchant">{quest.merchant_name}</span></div>}
      {quest.remaining != null && quest.remaining <= 10 && <small className="muted-note">{quest.remaining} left</small>}
      <button className={`quest-button ${quest.claimed ? 'quest-button-done' : ''}`} onClick={onClaim} disabled={claiming || quest.claimed}>
        {quest.claimed ? <><Check size={15}/> Claimed</> : claiming ? 'Checking location…' : <>Claim at this spot <ArrowRight size={15}/></>}
      </button>
    </div>
  </article>;
}
