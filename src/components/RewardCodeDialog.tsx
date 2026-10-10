import { useState } from 'react';
import { Check, Copy, Store } from 'lucide-react';
import Dialog from './Dialog';

export default function RewardCodeDialog({ code, expiresAt, merchant, reward, bonusXp, onClose }:
  { code: string; expiresAt: string; merchant?: string | null; reward?: string | null; bonusXp?: number; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const expires = new Date(expiresAt).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });
  return <Dialog title="Your reward code" onClose={onClose}>
    <span className="dialog-icon"><Store size={22}/></span>
    <h2 className="dialog-title">{reward || 'Reward unlocked'}</h2>
    <p className="dialog-copy">{merchant ? `Show this code to the staff at ${merchant}.` : 'Show this code to the staff.'} It works once and expires {expires}.</p>
    <div className="code-display" aria-live="polite"><strong>{code}</strong>
      <button className="outline-cta" onClick={async () => { try { await navigator.clipboard.writeText(code); setCopied(true); } catch { setCopied(false); } }}>
        {copied ? <><Check size={15}/> Copied</> : <><Copy size={15}/> Copy</>}
      </button>
    </div>
    {!!bonusXp && <p className="dialog-message dialog-info">Daily challenge complete: +{bonusXp} bonus XP.</p>}
    <p className="muted-note">Lost it? Open Rewards to get a fresh code. Doing so cancels this one.</p>
    <button className="primary-button" onClick={onClose}>Done</button>
  </Dialog>;
}
