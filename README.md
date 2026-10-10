# WalkEarn: a GeoQuest experience

Walk to a local quest, check in on the spot, and redeem a real reward from a neighborhood business.
WalkEarn is a walking-first, merchant-funded location game. This repository holds the React/Vite app, the Supabase schema, and the Edge Functions.

**Business thesis the pilot must prove:** merchants keep paying for walkers because claims turn into *verified in-store redemptions*. The billable event is a redemption, never a claim.

> **Status:** Preview mode runs without a backend and issues nothing. Live play needs a Supabase project (steps below). Nothing here has been deployed, and no production security review has been done.

## What's in v0.2

- **Live map** (Leaflet + OpenStreetMap) with quest markers, geofence rings, and your position. Location is requested only when you tap *Use my location*.
- **Claim flow**: sign-in dialog, fresh GPS fix, server-side geofence check, one-time reward code with copy and expiry.
- **Reward wallet**: ready-to-redeem list, history, and *Show code*, which rotates the code if a player loses it.
- **Daily challenge**: the third claim of a UTC day pays a bonus (+100 XP), enforced in the database.
- **Live leaderboard** (7-day XP, display names only) and real level, XP, and streak.
- **Merchant portal**: launch, pause, resume, and end campaigns; claims vs. redemptions and redemption rate; role-gated (staff can redeem, owners and managers can manage).
- **Anti-abuse**: 8 claims per player per day, a walking-speed plausibility check between claims, GPS accuracy limit, per-player serialization, one claim per quest.
- Not included, by design: driver mode, AR, Unity, cashable tokens, public SDK.

## Run locally

Node.js 20+.

```bash
npm install
cp .env.example .env.local   # fill VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm run dev
```

Optional pilot settings in `.env.local`: `VITE_MAP_CENTER_LAT`, `VITE_MAP_CENTER_LNG`, `VITE_MAP_AREA_LABEL`, `VITE_MAP_TILE_URL`.

> **Map tiles:** the default is the public OpenStreetMap tile server, which is fine for a small pilot but has a usage policy. Before wider launch, point `VITE_MAP_TILE_URL` at a commercial or self-hosted tile provider.

## Supabase setup

1. Create a Supabase project, install the CLI, then `supabase link --project-ref YOUR_REF`.
2. `supabase db push` applies both migrations (base schema, then `20261009000100_walkearn_v2.sql`).
3. Deploy the functions:
   ```bash
   for f in claim-quest redeem-reward merchant-dashboard create-campaign reissue-code set-campaign-status; do supabase functions deploy $f; done
   ```
4. Set Auth Site URL and redirect URLs. Set `ALLOWED_ORIGIN` to your exact site origin (the default `*` is for development only).
5. Link your first merchant with `supabase/seed/provision_merchant.sql` (verified coordinates only). Merchant roles are never granted from the browser.

## Tests

```bash
npm test          # contract tests: grants, RLS, search_path, function registration, no HTML injection
npm run build     # type-check and production build
DATABASE_URL=postgresql://... npm run test:db   # behavioural SQL tests (needs Postgres 15+ with PostGIS)
```

`test:db` runs both migrations against a throwaway database and checks: geofence and accuracy rejection, duplicate claims, the daily cap, the speed check, the daily bonus, single-use redemption and campaign caps, code rotation, role gating, pause/end behaviour, and that players cannot edit XP. CI runs it against a PostGIS service container. The harness stubs Supabase's `auth` schema, so use a disposable database, never a real project.

## Security model

- The browser is untrusted. Claims and redemptions are decided in Postgres transactions behind authenticated Edge Functions.
- Privileged functions pin `search_path`, check `auth.uid()`, and are not executable by `PUBLIC`. Only discovery (`nearby_quests`) and the leaderboard are open to anonymous users.
- RLS is enabled on every table. Players can update only their `display_name`.
- Redemption codes are shown once and stored as SHA-256 hashes. The wallet never returns a code.
- GPS can be spoofed. The limits above raise the cost of abuse; they are not proof of presence or of a purchase. Add device attestation (Play Integrity, App Attest), rate limiting, and alerting before real money or large prizes are involved.

## Known limits and next steps

- Redemption codes are 10 hex characters. Add rate limiting on `redeem-reward` before launch.
- Daily bonus and streak use UTC days.
- The map shows quests within a fixed radius; there is no routing or geocoding yet.
- Needed before a public pilot: legal review (location privacy, minors, prize rules), terms and privacy policy, an independent security review, and an end-to-end test on real devices.
- Next product work: team events and seasons for retention, QR scan at the register instead of typed codes, sales-lift reporting.
