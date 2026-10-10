import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import Dialog from './Dialog';
import { requireSupabase } from '../lib/supabase';

export default function AuthDialog({ initialMode, onClose }: { initialMode: 'signin' | 'signup'; onClose: () => void }) {
  const [mode, setMode] = useState(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMessage(null);
    try {
      const auth = requireSupabase().auth;
      if (mode === 'signup') {
        const { data, error } = await auth.signUp({ email, password, options: { data: { display_name: name.trim().slice(0, 40) } } });
        if (error) throw error;
        if (data.session) onClose(); else setMessage({ kind: 'info', text: 'Check your email to confirm your account, then sign in.' });
      } else {
        const { error } = await auth.signInWithPassword({ email, password });
        if (error) throw error;
        onClose();
      }
    } catch (err) { setMessage({ kind: 'error', text: err instanceof Error ? err.message : 'Something went wrong. Try again.' }); }
    finally { setBusy(false); }
  }

  return <Dialog title={mode === 'signup' ? 'Create your explorer account' : 'Sign in'} onClose={onClose}>
    <h2 className="dialog-title">{mode === 'signup' ? 'Create your account' : 'Welcome back'}</h2>
    <p className="dialog-copy">{mode === 'signup' ? 'Claim quests, keep your XP, and collect rewards from local businesses.' : 'Sign in to claim quests and open your reward wallet.'}</p>
    <form className="login-form" onSubmit={submit}>
      {mode === 'signup' && <label>Display name<input value={name} onChange={e => setName(e.target.value)} maxLength={40} placeholder="Shown on the leaderboard" autoComplete="nickname"/></label>}
      <label>Email address<input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" placeholder="you@example.com"/></label>
      <label>Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} placeholder="At least 6 characters"/></label>
      {message && <p className={`dialog-message dialog-${message.kind}`} role={message.kind === 'error' ? 'alert' : 'status'}>{message.text}</p>}
      <button className="primary-button" disabled={busy}>{busy ? 'Working…' : mode === 'signup' ? <>Create account <ArrowRight size={16}/></> : <>Sign in <ArrowRight size={16}/></>}</button>
    </form>
    <button type="button" className="text-link dialog-switch" onClick={() => { setMode(mode === 'signup' ? 'signin' : 'signup'); setMessage(null); }}>
      {mode === 'signup' ? 'Already have an account? Sign in' : 'New here? Create an account'}
    </button>
  </Dialog>;
}
