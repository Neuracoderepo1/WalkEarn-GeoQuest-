import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CircleHelp, Footprints, QrCode, Store, WalletCards, X } from 'lucide-react';
import RewardCodeDialog from '../components/RewardCodeDialog';
import { isSupabaseConfigured, reissueCode } from '../lib/api';
import { useSession } from '../lib/session';
import type { WalletClaim } from '../lib/types';

const STATUS_LABEL: Record<WalletClaim['status'], string> = { claimed: 'Ready to redeem', redeemed: 'Redeemed', expired: 'Expired', revoked: 'Cancelled' };

export default function RewardsPage() {
  const { user, wallet, walletError, refreshWallet, openAuth } = useSession();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [shown, setShown] = useState<{ claim: WalletClaim; code: string; expires: string } | null>(null);
  const ready = wallet?.claims.filter(c => c.has_code && c.status === 'claimed') ?? [];
  const history = wallet?.claims.filter(c => !(c.has_code && c.status === 'claimed')) ?? [];

  async function show(claim: WalletClaim) {
    setBusyId(claim.claim_id); setNotice('');
    try { const r = await reissueCode(claim.claim_id); setShown({ claim, code: r.redemption_code, expires: r.expires_at }); await refreshWallet(); }
    catch (e) { setNotice(e instanceof Error ? e.message : 'Could not get a code.'); }
    finally { setBusyId(null); }
  }

  return <div className="page-content">
    <div className="page-intro"><div><h1>Your rewards.</h1><p>Rewards are issued after your location is verified and redeemed in person with the business.</p></div></div>
    {!isSupabaseConfigured && <div className="notice-banner"><CircleHelp size={16}/><span>Connect Supabase to see real rewards. Nothing here is issued in preview mode.</span></div>}
    {notice && <div className="notice-banner" role="alert"><CircleHelp size={16}/><span>{notice}</span><button onClick={() => setNotice('')} aria-label="Dismiss"><X size={15}/></button></div>}
    {walletError && <div className="notice-banner" role="alert"><CircleHelp size={16}/><span>{walletError}</span></div>}

    {!user ? <div className="empty-state"><div><WalletCards size={25}/></div><h3>Sign in to open your wallet.</h3><p>Your claimed rewards and XP live here.</p>
        <button className="primary-button" onClick={() => openAuth('signin')} disabled={!isSupabaseConfigured}>Sign in <ArrowRight size={16}/></button></div>
      : !wallet ? <p className="muted-note">Loading your wallet…</p>
      : <>
        <div className="stats-row">
          <div className="stat-card"><span className="stat-label">Ready to redeem</span><strong>{ready.length}</strong></div>
          <div className="stat-card"><span className="stat-label">Redeemed</span><strong>{wallet.rewards_redeemed}</strong></div>
          <div className="stat-card"><span className="stat-label">Total XP</span><strong>{wallet.xp.toLocaleString()}</strong></div>
        </div>
        <section className="section-block"><div className="section-heading"><div><h2>Ready to redeem</h2></div></div>
          {ready.length ? <ul className="wallet-list">{ready.map(c => <li key={c.claim_id} className="wallet-row">
            <div><strong>{c.reward_description ?? c.title}</strong><small>{c.merchant_name ?? c.location_name} · expires {new Date(c.expires_at).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}</small></div>
            <button className="primary-button" onClick={() => void show(c)} disabled={busyId === c.claim_id}>{busyId === c.claim_id ? 'Getting code…' : 'Show code'}</button></li>)}</ul>
            : <div className="empty-state"><div><Footprints size={25}/></div><h3>No rewards waiting.</h3><p>Claim a merchant quest and its code appears here.</p><Link to="/map" className="outline-cta">Find a quest <ArrowRight size={15}/></Link></div>}
          {!!ready.length && <p className="muted-note">Showing a code makes a new one and cancels the previous code.</p>}
        </section>
        {!!history.length && <section className="section-block"><div className="section-heading"><div><h2>History</h2></div></div>
          <ul className="wallet-list">{history.map(c => <li key={c.claim_id} className="wallet-row"><div><strong>{c.title}</strong><small>{c.merchant_name ?? c.location_name} · {new Date(c.claimed_at).toLocaleDateString()}</small></div>
            <span className={`status-pill status-${c.status === 'redeemed' ? 'active' : c.status === 'claimed' ? 'paused' : 'ended'}`}>{c.has_code ? STATUS_LABEL[c.status] : `+${c.xp_awarded} XP`}</span></li>)}</ul></section>}
      </>}

    <section className="section-block"><div className="section-heading"><div><h2>How rewards work</h2></div></div>
      <div className="steps-grid">
        <div className="step-card"><div className="step-top"><span className="step-icon"><Footprints/></span></div><h3>Walk to the spot</h3><p>Quests unlock when you are physically at the location.</p></div>
        <div className="step-card"><div className="step-top"><span className="step-icon"><QrCode/></span></div><h3>Get your code</h3><p>The server checks your location and issues a one-time code.</p></div>
        <div className="step-card"><div className="step-top"><span className="step-icon"><Store/></span></div><h3>Redeem in person</h3><p>Staff confirm the code. It cannot be used twice.</p></div>
      </div></section>
    {shown && <RewardCodeDialog code={shown.code} expiresAt={shown.expires} merchant={shown.claim.merchant_name} reward={shown.claim.reward_description} onClose={() => setShown(null)} />}
  </div>;
}
