import { useCallback, useEffect, useState } from 'react';
import { Activity, ArrowRight, BadgeCheck, CircleHelp, QrCode, ShieldCheck, ShoppingBag, Store, Target, WalletCards, X } from 'lucide-react';
import { createCampaign, isSupabaseConfigured, merchantDashboard, redeemCode, setCampaignStatus } from '../lib/api';
import { useSession } from '../lib/session';
import type { MerchantCampaign } from '../lib/types';

type Dash = Awaited<ReturnType<typeof merchantDashboard>>;
const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)}%` : '–');

export default function MerchantPage() {
  const { user, loading, openAuth, signOut } = useSession();
  const [dash, setDash] = useState<Dash | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState(''); const [reward, setReward] = useState('');
  const [limit, setLimit] = useState('50'); const [fee, setFee] = useState('2');
  const [locationId, setLocationId] = useState(''); const [code, setCode] = useState('');

  const load = useCallback(async () => {
    try { const d = await merchantDashboard(); setDash(d); setLocationId(old => old || d.locations[0]?.id || ''); setMessage(''); }
    catch (e) { setDash(null); setMessage(e instanceof Error ? e.message : 'Unable to load the merchant dashboard.'); }
  }, []);
  useEffect(() => { if (user && isSupabaseConfigured) void load(); else setDash(null); }, [user, load]);

  async function run(fn: () => Promise<unknown>, done: string) {
    setBusy(true); setMessage('');
    try { await fn(); setMessage(done); await load(); } catch (e) { setMessage(e instanceof Error ? e.message : 'Something went wrong.'); } finally { setBusy(false); }
  }
  const launch = (e: React.FormEvent) => { e.preventDefault(); void run(async () => { await createCampaign({ title, reward_description: reward, redemption_limit: Number(limit), fee_per_redemption: Number(fee), location_id: locationId }); setTitle(''); setReward(''); }, 'Campaign launched. Its walking quest is now live.'); };
  const redeem = (e: React.FormEvent) => { e.preventDefault(); void run(async () => { await redeemCode(code); setCode(''); }, 'Reward redeemed. This code cannot be used again.'); };
  const claims = dash?.campaigns.reduce((a, c) => a + (c.claim_count ?? 0), 0) ?? 0;
  const redemptions = dash?.campaigns.reduce((a, c) => a + c.redemption_count, 0) ?? 0;
  const fees = dash?.campaigns.reduce((a, c) => a + c.redemption_count * c.fee_per_redemption, 0) ?? 0;

  return <div className="page-content">
    <div className="page-intro"><div><h1>Foot traffic you can measure.</h1><p>Launch a local quest, cap your reward budget, and see which claims turn into verified redemptions in your shop.</p></div></div>
    {message && <div className="notice-banner" role="status"><CircleHelp size={16}/><span>{message}</span><button onClick={() => setMessage('')} aria-label="Dismiss"><X size={15}/></button></div>}

    {!user ? <div className="merchant-login-grid">
      <div className="merchant-login-card"><h3>Sign in to your workspace.</h3><p>Use the account your operator linked to your business. Accounts are linked by WalkEarn staff, not from this page.</p>
        <button className="primary-button" onClick={() => openAuth('signin')} disabled={!isSupabaseConfigured || loading}>Sign in <ArrowRight size={16}/></button>
        {!isSupabaseConfigured && <small className="muted-note">Connect Supabase first (see the setup guide).</small>}</div>
      <div className="merchant-benefits">
        <div className="benefit-row"><span className="benefit-icon"><Target/></span><div><strong>Campaigns with guardrails</strong><p>Set a redemption cap and a fee before anything goes live.</p></div></div>
        <div className="benefit-row"><span className="benefit-icon"><QrCode/></span><div><strong>Single-use codes</strong><p>Every code is checked on the server and works once.</p></div></div>
        <div className="benefit-row"><span className="benefit-icon"><Activity/></span><div><strong>Claims versus redemptions</strong><p>See how many walkers claim your reward and how many redeem it.</p></div></div>
      </div></div>
    : !dash ? <div className="empty-state"><div><Store size={24}/></div><h3>No merchant workspace yet.</h3><p>This account is not linked to a business. Ask your WalkEarn operator to link it, then refresh.</p>
        <div className="empty-actions"><button className="outline-cta" onClick={() => void load()}>Refresh</button><button className="outline-cta" onClick={() => void signOut()}>Sign out</button></div></div>
    : <div className="merchant-dashboard">
      <div className="dashboard-heading"><div><span className="daily-label">{dash.role}</span><h2>{dash.merchant_name}</h2></div><button className="outline-cta" onClick={() => void signOut()}>Sign out</button></div>
      <div className="merchant-tools-grid">
        {dash.can_manage ? <form className="merchant-login-card" onSubmit={launch}><h3>Launch a local quest.</h3><p>A campaign creates one active walking quest at the location you choose.</p>
          <div className="login-form">
            <label>Campaign title<input value={title} onChange={e => setTitle(e.target.value)} required minLength={3} maxLength={100} placeholder="Coffee break quest"/></label>
            <label>Reward<input value={reward} onChange={e => setReward(e.target.value)} required minLength={3} maxLength={240} placeholder="Free size upgrade with any drink"/></label>
            <label>Location<select value={locationId} onChange={e => setLocationId(e.target.value)} required><option value="">Choose a location</option>{dash.locations.map(l => <option key={l.id} value={l.id}>{l.name} · {l.address}</option>)}</select></label>
            <div className="form-two-cols"><label>Redemption cap<input type="number" min="1" max="100000" value={limit} onChange={e => setLimit(e.target.value)} required/></label>
              <label>Fee per redemption (USD)<input type="number" min="0" step="0.01" value={fee} onChange={e => setFee(e.target.value)} required/></label></div>
            <button className="primary-button" disabled={busy || !dash.locations.length}>{busy ? 'Working…' : <>Launch campaign <ArrowRight size={16}/></>}</button>
            {!dash.locations.length && <small className="muted-note">No active location is set up. Ask your operator to add one.</small>}
          </div></form>
          : <div className="merchant-login-card"><h3>View-only access.</h3><p>Your role can redeem codes. Owners and managers launch and pause campaigns.</p></div>}
        <form className="merchant-login-card" onSubmit={redeem}><h3>Verify a reward.</h3><p>Enter the walker's one-time code. The server checks the business, expiry, campaign cap, and reuse.</p>
          <div className="login-form"><label>Redemption code<input value={code} onChange={e => setCode(e.target.value.toUpperCase())} required minLength={8} maxLength={32} autoComplete="off" placeholder="9A2B7C11DE"/></label>
            <button className="primary-button" disabled={busy}>{busy ? 'Verifying…' : <>Verify and redeem <BadgeCheck size={16}/></>}</button></div></form>
      </div>
      <div className="stats-row">
        <div className="stat-card"><span className="stat-icon"><Activity size={17}/></span><span className="stat-label">Claims</span><strong>{claims}</strong></div>
        <div className="stat-card"><span className="stat-icon"><BadgeCheck size={17}/></span><span className="stat-label">Verified redemptions</span><strong>{redemptions}</strong></div>
        <div className="stat-card"><span className="stat-icon"><Target size={17}/></span><span className="stat-label">Redemption rate</span><strong>{pct(redemptions, claims)}</strong></div>
        <div className="stat-card"><span className="stat-icon"><WalletCards size={17}/></span><span className="stat-label">Estimated fees</span><strong>{fees.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })}</strong></div>
      </div>
      <div className="campaign-table">
        <div className="campaign-table-head cols-4"><span>Campaign</span><span>Claims</span><span>Redeemed</span><span>Status</span></div>
        {dash.campaigns.length ? dash.campaigns.map((c: MerchantCampaign) => <div className="campaign-row cols-4" key={c.id}>
          <div><strong>{c.title}</strong><small>{c.reward_description}</small></div>
          <span>{c.claim_count ?? 0}</span><span>{c.redemption_count} / {c.redemption_limit} <small>({pct(c.redemption_count, c.claim_count ?? 0)})</small></span>
          <div className="row-controls"><span className={`status-pill status-${c.status}`}>{c.status}</span>
            {dash.can_manage && c.status === 'active' && <button className="text-link" disabled={busy} onClick={() => void run(() => setCampaignStatus(c.id, 'paused'), 'Campaign paused. Its quest is hidden from walkers.')}>Pause</button>}
            {dash.can_manage && c.status === 'paused' && <button className="text-link" disabled={busy} onClick={() => void run(() => setCampaignStatus(c.id, 'active'), 'Campaign resumed.')}>Resume</button>}
            {dash.can_manage && c.status !== 'ended' && <button className="text-link" disabled={busy} onClick={() => { if (confirm('End this campaign? This cannot be undone.')) void run(() => setCampaignStatus(c.id, 'ended'), 'Campaign ended.'); }}>End</button>}</div>
        </div>) : <div className="empty-state"><div><ShoppingBag size={24}/></div><h3>No campaigns yet.</h3><p>Launch your first quest above and walkers nearby will see it.</p></div>}
      </div>
      <div className="merchant-disclaimer"><ShieldCheck size={16}/><span>WalkEarn reports verified code redemptions. A location check alone is not proof of a purchase, and estimated fees are not invoices.</span></div>
    </div>}
  </div>;
}
