# Bonk Royale

Flick-sumo party brawler for all ages. Drag back, let go, bonk rivals off a crumbling candy island.
3D (Three.js), multiplayer on Cloudflare (Workers + Durable Objects + D1), friends, parties, 1v1 duels, invite links.

## What's inside
| Part | Where |
|---|---|
| Game rules and physics (shared by server and browser) | `shared/sim.js` |
| Cosmetics, capsules, levels, rewards (pure rules) | `shared/cosmetics.js`, `shared/progress.js` |
| Browser game (3D scene, UI, input, audio) | `client/` (built by Vite into `dist/`) |
| Worker entry + API (accounts, friends, invites) | `src/worker.js`, `src/api.js` |
| Match room, party lobby, presence hub, rate limiter | `src/match.js`, `src/party.js`, `src/hub.js` |
| Database schema | `migrations/0001_init.sql` |

Players are anonymous: a random key on their device plus a friend code (`BONK-XXXXX`). There is no free-text name and no chat, so nothing needs moderating and children cannot enter personal data. Every reward, capsule roll and unlock is computed on the server.

## Run locally
```bash
npm install
npm run db:local        # create the local D1 database
npm run build           # build the client into dist/
npm run dev             # http://localhost:8787
npm test                # simulation tests (fast)
BASE=http://localhost:8787 node tests/integration.mjs   # full backend check against the running dev server
```

## Releases
Production deploys happen from GitHub: open a PR from `main` into `release/1.1`, merge it, and the workflow ships it. See [docs/BRANCHING.md](docs/BRANCHING.md).

## Deploy by hand (about 10 minutes)
1. **Log in to Cloudflare** (opens a browser): `npx wrangler login`
2. **Create the database** and paste the printed `database_id` into `wrangler.jsonc` under `d1_databases`:
   `npx wrangler d1 create bonk-db`
3. **Create the tables in production:** `npm run db:remote`
4. **Deploy:** `npm run deploy` (builds, then publishes to `https://bonk-royale.<your-subdomain>.workers.dev`)
5. **Test it:** open the workers.dev URL on two devices. Play, add each other with codes, invite, start a duel.
6. **Attach your domain** (after you buy it in Cloudflare): Dashboard > Workers & Pages > `bonk-royale` > Settings > Domains & Routes > Add > Custom domain.
   Then add the hostnames to `ALLOWED_HOSTS` in `wrangler.jsonc` (for example `playbonkroyale.com,www.playbonkroyale.com,*.workers.dev`) and run `npm run deploy` again. Without this step, game WebSockets from the new domain are refused (that's the origin check working).
7. **Email for the legal pages:** the pages use `hello@playbonkroyale.com`. Replace it in `public/*.html` with your real address (Cloudflare Email Routing forwards a domain address to your Gmail for free).
8. Update `public/sitemap` / canonical URLs if you add them, and replace the placeholder name everywhere if you rename the game.

## Cost notes
Durable Objects are billed by active time. A match room only runs while a match is active, and an idle player holds one small socket. The free plan covers early traffic; at real scale use the Workers Paid plan ($5/month). Cloudflare shows usage under Workers & Pages > Observability.

## Ads and revenue
Ads stay off until `client/src/config.js` has your ids (empty = no ads, no broken boxes). Preview the layout at `/?ads=preview`.
1. Apply for **AdSense for Games / H5 Games Ads** with your domain (needs the privacy page, which is included).
2. Put the publisher id and slot ids in `client/src/config.js`, set `h5Ads: true`, add your line to `public/ads.txt`, rebuild and deploy.
3. Layout: 160x600 rails left and right on desktop (never over the game), a 320x50 banner on phones outside matches, an interstitial every 3rd match (90s cooldown), and an opt-in "watch an ad for +30 coins" button (max 5/day).
4. **Children:** this game is for mixed audiences including kids. In AdSense, enable the child-directed / under-age-of-consent treatment for the site (non-personalised ads) and turn on Google's consent message (Privacy & messaging). This is a policy choice only you can make for your account; the safest setting is non-personalised ads everywhere.
5. Also list the game on Poki, CrazyGames and GameDistribution for distribution (they handle ads and take a revenue share).

## Security notes
- Tokens are random 256-bit values, stored hashed in D1, and sent in the `Sec-WebSocket-Protocol` header and `Authorization` header, never in URLs.
- WebSockets are origin-checked, rate limited, and size limited. Private match rooms only accept the players the party put on the list.
- Friend requests need acceptance. "Players you met" can only be added if you actually played them.
- No secrets live in the client or the repo. Ad ids are public by design.

## Known limits / next steps
- Public matchmaking is first-fit (rooms fill in order). Parties play private matches with bots filling empty seats; mixing parties into public rooms is a future step.
- No account recovery yet (clearing browser data loses the account). Adding optional Google/Apple sign-in is the natural next step.
- Capsules and coins are earned only. There is no real-money shop (by design, until you decide on kids-and-payments policy).
