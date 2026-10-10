import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { isSupabaseConfigured, requireSupabase } from './supabase';
import { fetchWallet } from './api';
import type { Wallet } from './types';
import AuthDialog from '../components/AuthDialog';

type User = { id: string; email?: string } | null;
type Session = {
  user: User; loading: boolean; wallet: Wallet | null; walletError: string;
  refreshWallet: () => Promise<void>; openAuth: (mode?: 'signin' | 'signup') => void; signOut: () => Promise<void>;
};
const Ctx = createContext<Session | null>(null);
export const useSession = () => { const v = useContext(Ctx); if (!v) throw new Error('SessionProvider missing'); return v; };

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [walletError, setWalletError] = useState('');
  const [authMode, setAuthMode] = useState<'signin' | 'signup' | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const client = requireSupabase();
    const toUser = (s: { user?: { id: string; email?: string } | null } | null): User => (s?.user ? { id: s.user.id, email: s.user.email } : null);
    client.auth.getSession().then(({ data }) => { setUser(toUser(data.session)); setLoading(false); });
    const { data: listener } = client.auth.onAuthStateChange((_e, s) => setUser(toUser(s)));
    return () => listener.subscription.unsubscribe();
  }, []);

  const refreshWallet = useCallback(async () => {
    if (!isSupabaseConfigured || !user) { setWallet(null); return; }
    try { setWallet(await fetchWallet()); setWalletError(''); } catch (e) { setWalletError(e instanceof Error ? e.message : 'Could not load your wallet.'); }
  }, [user]);
  useEffect(() => { void refreshWallet(); }, [refreshWallet]);

  const signOut = useCallback(async () => { if (isSupabaseConfigured) await requireSupabase().auth.signOut(); setWallet(null); }, []);
  const openAuth = useCallback((mode: 'signin' | 'signup' = 'signin') => setAuthMode(mode), []);
  const value = useMemo(() => ({ user, loading, wallet, walletError, refreshWallet, openAuth, signOut }), [user, loading, wallet, walletError, refreshWallet, openAuth, signOut]);
  return <Ctx.Provider value={value}>{children}{authMode && <AuthDialog initialMode={authMode} onClose={() => setAuthMode(null)} />}</Ctx.Provider>;
}
