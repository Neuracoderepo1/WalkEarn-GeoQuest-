import { ShieldCheck } from 'lucide-react';

const STEPS = [
  ['Create a Supabase project', 'Copy the Project URL and the publishable (anon) key from the project API settings.'],
  ['Set environment variables', 'Copy .env.example to .env.local and fill VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY. Never put a service-role key in the browser. Optionally set VITE_MAP_CENTER_LAT, VITE_MAP_CENTER_LNG and VITE_MAP_AREA_LABEL for your pilot area.'],
  ['Apply both migrations', 'Link the project and run supabase db push. This applies the base schema and the WalkEarn v2 migration (discovery, wallet, leaderboard, anti-abuse limits, campaign controls).'],
  ['Deploy the Edge Functions', 'Deploy claim-quest, redeem-reward, merchant-dashboard, create-campaign, reissue-code and set-campaign-status. Set ALLOWED_ORIGIN to your exact site origin before launch.'],
  ['Link your first merchant', 'Use supabase/seed/provision_merchant.sql in the SQL editor with verified coordinates. Merchant roles are never granted from the browser.'],
  ['Test with real devices', 'Walk to a test location, claim, redeem, and try the failure cases: outside the area, duplicate claim, expired code, paused campaign.'],
];

export default function SetupPage() {
  return <div className="page-content">
    <div className="page-intro"><div><h1>Connect the engine.</h1><p>The interface runs on its own in preview mode. These steps switch on real accounts, location-checked claims, and redemptions.</p></div></div>
    <ol className="setup-steps">{STEPS.map(([t, d], i) => <li className="setup-step" key={t}><span>{i + 1}</span><div><h3>{t}</h3><p>{d}</p></div></li>)}</ol>
    <div className="security-callout"><ShieldCheck size={20}/><div><strong>Security boundary</strong><p>The browser is untrusted. Eligibility and redemption are decided in Postgres transactions behind authenticated functions, with row-level security on every table.</p></div></div>
  </div>;
}
