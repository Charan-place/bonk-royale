# Bonk Games: master plan

Two goals, in this order:
1. **Google login + saved progress** on Bonk Royale (replaces the Clerk idea).
2. **Bonk family**: one site, one account, several great games, all working on phone, tablet and desktop.

Each numbered step is one feature branch → PR into `develop` → `main` → `release/1.1`.
Do them in order. Each step ships on its own and leaves the site working.

---

## Part 1. Google login and saved progress

### What exists today
- Every visitor already gets an anonymous account: a random token in the browser, hashed in D1 (`users` table). XP, coins, level, inventory, streak, stats, name all save server-side against that token.
- Weak spot: clear the browser, switch device, or use a new phone and the token is gone, so the progress is gone. Login fixes exactly this.

### Approach: Google Identity Services, no Clerk, no extra vendor
- Browser shows Google's "Sign in with Google" button and gets a signed **ID token** (a JWT).
- Our Worker verifies it: RS256 signature against Google's public keys (JWKS, cached), plus `iss`, `aud` (our client id), `exp`, `email_verified`.
- The OAuth **client id is public** (fine in config). No client secret is needed for this flow. Nothing secret goes in code or the repo.
- After verifying, we keep using our own device token for gameplay. Google only proves who you are when linking or recovering. This keeps the hot path (matches, websockets) unchanged and fast.

### Data model (migration `0003_google.sql`)
- `users.google_sub TEXT UNIQUE` (Google's stable account id; the real key, never the email)
- `users.email TEXT` (only for support and account recovery; shown to nobody)
- `users.linked_at INTEGER`, `users.last_seen INTEGER`
- `users.prefs TEXT` (JSON: difficulty, sound, controls hint seen, etc.)
- `users.deleted_at` not needed: delete is a real delete (see privacy)

### Account rules (the part that must be exactly right)
| Situation | Result |
|---|---|
| Guest signs in, Google account is new | Link it to the current guest row. All progress carries over. |
| Signs in, Google account already has a row, this device is a fresh guest (almost no progress) | Switch to the Google row, throw away the empty guest. |
| Signs in, Google account has a row AND this device has real guest progress | Ask: "Keep your saved account or this device's progress?" Never merge silently, never lose either side. Default pick = whichever has higher level. |
| New phone, signs in | Gets the saved account back: level, coins, items, streak, name, friends, settings. |
| Sign out | Back to a fresh guest on this device; the account stays safe on the server. |

### Steps
- [x] **1.1 Backend**: migration 0003, `/api/auth/google` (verify token, link/switch per rules), `/api/auth/signout`, JWKS verify in `src/auth.js` using WebCrypto (no new dependency), rate limit it, unit tests with a fake signed token.
- [x] **1.2 Client**: "Save my progress" button (Google), signed-in badge with avatar initial and name, sign out, conflict dialog, progress sheet text updated ("Saved to your account"). Guest play stays fully allowed.
- [x] **1.3 Nudges**: after first win / level 3 / first unlock, show a soft "Save your progress" card. Never blocks play.
- [x] **1.4 Preferences synced**: difficulty, name, sound, tutorial-seen restored on any device.
- [x] **1.5 Privacy**: update `privacy.html` (what we store: Google id, email, game data; why), add "Delete my account and data" button (hard delete across all tables), and a data-export link.
- [ ] **1.6 Verify on prod**: sign in on laptop, play, sign in on phone, same account, same level.

### Child safety (decision needed, my default in bold)
- Login is **optional**; the game is fully playable as a guest.
- **Ask "Are you 13 or older?" before showing Google sign-in**; under 13 sees "Ask a grown-up to save your progress" and stays a guest. This matters for COPPA/GDPR-K and for AdSense.
- Public names stay filtered; no chat; Google name/photo never shown in game, only the game name.

### You must do (I cannot)
- Google Cloud Console → new project → OAuth consent screen (app name, `playbonkroyale.com`, privacy and terms URLs) → create an **OAuth client id (Web)** with authorized origins `https://playbonkroyale.com` and `http://localhost:5173`. Send me the client id (it is public, safe to paste).
- Publish the consent screen to "In production" so any Google user can sign in, not only test users.

---

## Part 2. Bonk family of games

### Principles
- **One site, one account, one level.** Same login, same coins, same creature skins everywhere. Progress in any game feeds a single "Bonk Level".
- **Short sessions (30s to 3min), instant restart, one more try.** Fits kids to 40, fits ads.
- **Every game works with one thumb on a phone and with mouse/keyboard on desktop.** No game ships that fails either.
- Games must be genuinely fun and look like the same family: same creatures, same bright art, same sounds.
- Check novelty before building each one (you rejected copies before). Mechanic can be known; theme, feel and twist must be ours.

### Shape of the code (step 2.1, the foundation)
```
client/src/platform/   account, store, ads, ui kit, audio, input, quality settings, leaderboard client
client/src/games/<slug>/   one folder per game, lazy-loaded (own JS chunk)
shared/                sim code reused by client + server (anti-cheat)
src/                   one Worker; Durable Objects only for multiplayer games
```
Game contract: every game exports `{ id, title, mount(el, ctx), pause(), resume(), resize(), destroy() }`.
`ctx` gives: profile, `award({xp, coins})`, `submitScore(score, proof)`, `ads`, `input`, `quality`, `sfx`.
A new game then costs only its own gameplay, not login/ads/UI again.

### Hub (what players see)
- Home = **Bonk Games** shelf: game cards with live "playing now / your best / daily challenge" and a big continue button for the last game.
- Routes: `/` hub, `/play/<slug>` each game (real URLs for SEO and sharing). Royale moves to `/play/royale` with `/` redirect behaviour kept for existing links.
- Each game page gets its own title, description, schema and sitemap entry.
- Brand: keep `playbonkroyale.com` for now; consider a family domain (e.g. a "Bonk Games" name) once 3 games are live. Decision later.

### Candidate games (ranked; build in this order)
| # | Game | Pitch | Players | Why it fits | Reuses |
|---|---|---|---|---|---|
| 1 | **Bonk Golf** | Flick your creature to the goal through bumpers, ice, portals. 3 stars per course, daily course, ghost of friends' best run. | solo + async | Same flick input kids already learned; 100 levels = long retention | flick input, physics sim, cosmetics |
| 2 | **Bonk Merge** | Drop creatures, matching ones merge into bigger ones, reach the legendary Bonk. | solo | Widest audience (all ages), perfect for ads and short sessions, very sticky | cosmetics, coins |
| 3 | **Hot Potato Bonk** | Arena party: a bomb jumps between creatures by bonking, holder explodes when timer ends. | 2 to 8 online + bots | Social, party invites already built | Royale sim, rooms, bots, party/friends |
| 4 | **Bonk Rush** | One-thumb endless dash across ice platforms, dodge and collect, ghost rivals. | solo | Instant to learn, daily leaderboards | cosmetics, platform |
| 5 | **Daily Bonk** | One quick puzzle a day, shareable result card. | solo | Daily habit, free viral spreading | account, streak |

Each gets a one-page design brief before code (controls on phone/tablet/desktop, session length, reward loop, level design, monetisation spots). I propose the brief; you approve.

### Shared systems (built once in the foundation)
- [ ] **Bonk Level + wallet**: one XP/coin pool across games, with a per-game bonus; level-ups unlock creature skins that appear in every game.
- [ ] **Daily quests and streak**: "Play 2 different games today" pushes people across the family. Streak is family-wide.
- [ ] **Leaderboards**: daily/weekly/all-time per game and friends-only. `scores` table, one `/api/score` endpoint.
- [ ] **Anti-cheat**: solo games submit a replay (inputs), the Worker re-simulates with the shared deterministic sim and rejects impossible scores. Plausibility caps as a cheap first layer.
- [ ] **Cross-promo**: end-of-run card "Next up: …" and "You might like" on the hub; badges for trying every game.
- [ ] **Share cards**: score/stars as an image + link (SEO and word of mouth).
- [ ] **Ads policy**: side rails on desktop, a small banner on phone, optional **rewarded** "watch to double coins", interstitial only between runs and capped. Never during play. Non-personalised ads for under-13s.
- [ ] **Audio and haptics** consistent across games, mute remembered.

### Works everywhere (non-negotiable checklist per game)
- Layout: fluid down to 320px wide up to 4K; portrait and landscape; safe-area insets (notch); no page scroll during play; touch targets ≥ 44px.
- Input abstraction: touch, mouse, keyboard, and gamepad (bonus) all map to the same actions; auto-detected like Royale's controls.
- Performance: quality tiers auto-picked (low/medium/high), 60fps target, 30fps fallback, first load budget ≤ ~1.5 MB per game, lazy-load assets, pause when tab hidden.
- **PWA**: installable "Add to Home Screen", offline for solo games, app icon and splash.
- Accessibility: reduced motion, colour-safe palette, big text option, keyboard-only playable.
- Test matrix before each release: iPhone Safari, Android Chrome, iPad, Chrome/Safari/Firefox desktop, a low-end Android in throttled mode.

### Milestones
- [x] **2.1 Foundation refactor**: split platform vs game, move Royale into `games/royale` with zero behaviour change, hub page, routes, per-game SEO, tests still green.
- [x] **2.2 Shared systems v1**: unified level/wallet, leaderboard endpoint + table, score proof verification, daily quest + family streak.
- [x] **2.3 Game 1: Bonk Golf** (design brief → vertical slice with 10 courses → polish → 40+ courses → daily course → ship).
- [x] **2.4 Game 2: Bonk Merge**.
- [x] **2.5 Game 3: Hot Potato Bonk** (multiplayer, on the existing party/room code).
- [x] **2.6 PWA + install prompt + offline** for solo games.
- [x] **2.7 Game 4 and 5** (Bonk Rush, Daily Bonk) based on what players actually play.
- [ ] **2.8 Growth loop**: share cards, sitemap per game, Search Console, friends-invite across games.

---

## Housekeeping (small, do alongside)
- [ ] Fix GitHub Actions so merging into `release/1.1` deploys automatically (enable Actions, add `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` secrets, approve `production` environment). Until then deploys are manual: `npx wrangler d1 migrations apply bonk-db --remote` then `npx wrangler deploy`.
- [ ] Submit `sitemap.xml` to Google Search Console and Bing Webmaster Tools.
- [ ] Email Routing for `hello@playbonkroyale.com`.
- [ ] AdSense application (needs privacy + about pages, already live; decide kids/non-personalised setting).
- [ ] Report-a-name button (names are filtered but not reportable yet).

## Decisions I need from you
1. Age gate before Google sign-in: yes (recommended) or no?
2. Game order above OK? (Golf → Merge → Hot Potato) or swap?
3. Keep the `playbonkroyale.com` domain for the family for now, and rename later?
4. Google OAuth client id (after you create it, see Part 1).

## Status (built, waiting for you)
- Built and tested locally: Google sign-in backend + UI, hub at `/games/`, Golf (40 courses), Merge, Hot Potato (vs bots), Rush, Daily, scores/leaderboards/quest API, PWA.
- **Google sign-in stays hidden until `GOOGLE_CLIENT_ID` is set in `wrangler.jsonc`** (needs the OAuth client id from you, 1.6 verify on prod).
- Hot Potato is vs bots; online multiplayer for it is a later step. 2.8 growth loop (share cards, Search Console) is still open.
- Deploy needs migrations 0003 and 0004: `npx wrangler d1 migrations apply bonk-db --remote` then `npx wrangler deploy`.

## Next action (old)
Say "go" and I start **1.1 Backend** (Google token verification, migration 0003, tests) on a new branch. You create the Google OAuth client in parallel; I only need its id for 1.2.
