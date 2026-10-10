import { useEffect, useState } from 'react';
import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { ArrowRight, Bell, ChevronDown, Footprints, Gift, Globe2, House, LogIn, MapPin, Menu, Settings, Sparkles, Store, Target, TrendingUp, Zap } from 'lucide-react';
import { isSupabaseConfigured } from './lib/supabase';
import { levelFor } from './lib/geo';
import { useSession } from './lib/session';
import DiscoverPage from './pages/DiscoverPage';
import MapPage from './pages/MapPage';
import QuestsPage from './pages/QuestsPage';
import RewardsPage from './pages/RewardsPage';
import LeaderboardPage from './pages/LeaderboardPage';
import MerchantPage from './pages/MerchantPage';
import SetupPage from './pages/SetupPage';

const AREA_NAME = (import.meta.env.VITE_MAP_AREA_LABEL as string | undefined) || 'Pilot area';
const CRUMBS: Record<string, string> = { '/': 'Discover', '/map': 'Explore map', '/quests': 'My quests', '/rewards': 'Rewards', '/leaderboard': 'Leaderboard', '/merchant': 'Merchant portal', '/setup': 'Setup' };

export default function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { user, wallet, openAuth, signOut } = useSession();
  const { pathname } = useLocation();
  useEffect(() => { setMenuOpen(false); window.scrollTo(0, 0); }, [pathname]);
  const lvl = levelFor(wallet?.xp ?? 0);
  const ready = wallet?.claims.filter(c => c.has_code && c.status === 'claimed').length ?? 0;
  const name = wallet?.display_name || user?.email?.split('@')[0] || 'Guest explorer';

  return <div className="app-shell">
    <aside className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`}>
      <Link to="/" className="brand"><span className="brand-mark"><Footprints size={22}/></span><span>walkearn<span className="brand-period">.</span><small>A GEOQUEST EXPERIENCE</small></span></Link>
      <div className="nav-label">Play</div>
      <nav className="side-nav" aria-label="Play">
        <NavLink to="/" end><House size={18}/> Discover</NavLink>
        <NavLink to="/map"><Globe2 size={18}/> Explore map</NavLink>
        <NavLink to="/quests"><Target size={18}/> My quests</NavLink>
        <NavLink to="/rewards"><Gift size={18}/> Rewards {ready > 0 && <span className="nav-count">{ready}</span>}</NavLink>
      </nav>
      <div className="nav-label nav-label-spaced">Community</div>
      <nav className="side-nav" aria-label="Community">
        <NavLink to="/leaderboard"><TrendingUp size={18}/> Leaderboard</NavLink>
        <NavLink to="/merchant"><Store size={18}/> Merchant portal</NavLink>
      </nav>
      <div className="sidebar-bottom">
        {user && wallet ? <div className="level-card"><div className="level-top"><span className="level-icon"><Zap size={15}/></span><span>Your adventure</span><span className="level-number">Lv. {String(lvl.level).padStart(2, '0')}</span></div>
          <strong>{lvl.title}</strong><div className="progress-track"><span style={{ width: `${lvl.pct}%` }}/></div><div className="level-foot"><span>{lvl.into.toLocaleString()} / {lvl.next.toLocaleString()} XP</span><span>{lvl.pct}%</span></div></div>
          : <div className="level-card"><div className="level-top"><span className="level-icon"><Zap size={15}/></span><span>Your adventure</span></div><strong>Sign in to earn XP</strong><div className="level-foot"><span>Levels and streaks are saved to your account.</span></div></div>}
        <button className="profile-button" onClick={() => (user ? void signOut() : openAuth('signin'))} disabled={!isSupabaseConfigured && !user}>
          <span className="avatar">{name[0]?.toUpperCase() || 'G'}</span>
          <span className="profile-name"><strong>{name}</strong><small>{user ? 'Sign out' : isSupabaseConfigured ? 'Sign in or create account' : 'Preview mode'}</small></span>
          {user ? <LogIn size={17}/> : <Settings size={17}/>}
        </button>
      </div>
    </aside>
    {menuOpen && <button className="mobile-scrim" aria-label="Close menu" onClick={() => setMenuOpen(false)}/>}
    <main className="main-panel">
      <header className="topbar">
        <button className="mobile-menu icon-button" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle navigation" aria-expanded={menuOpen}><Menu size={21}/></button>
        <div className="breadcrumb"><span>WalkEarn</span><span className="crumb-slash">/</span><strong>{CRUMBS[pathname] ?? 'Discover'}</strong></div>
        <div className="topbar-actions">
          <div className="location-chip"><span className="location-dot"/><MapPin size={15}/><span>{AREA_NAME}</span><ChevronDown size={14}/></div>
          <button className="icon-button notification-button" aria-label="Notifications"><Bell size={18}/></button>
          <button className="top-avatar" onClick={() => (user ? undefined : openAuth('signin'))} aria-label={user ? 'Your account' : 'Sign in'}>{name[0]?.toUpperCase() || 'G'}</button>
        </div>
      </header>
      {!isSupabaseConfigured && <div className="setup-banner"><span><Settings size={16}/><strong>Preview mode</strong> Connect Supabase to turn on accounts, quest claims, and redemptions.</span><Link to="/setup">Setup guide <ArrowRight size={14}/></Link></div>}
      <Routes>
        <Route path="/" element={<DiscoverPage/>}/><Route path="/map" element={<MapPage/>}/><Route path="/quests" element={<QuestsPage/>}/>
        <Route path="/rewards" element={<RewardsPage/>}/><Route path="/leaderboard" element={<LeaderboardPage/>}/>
        <Route path="/merchant" element={<MerchantPage/>}/><Route path="/setup" element={<SetupPage/>}/><Route path="*" element={<DiscoverPage/>}/>
      </Routes>
      <footer className="footer"><span>WalkEarn 0.2.0 · a GeoQuest experience</span><span><span className="footer-dot"/> Walk safe. Play local.</span><span>Map © OpenStreetMap contributors <Sparkles size={12}/></span></footer>
    </main>
  </div>;
}
