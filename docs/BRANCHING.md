# Branching and releases

| Branch | Purpose | Who updates it |
|---|---|---|
| `develop` | Integration branch. Every feature lands here first. | PRs from `feature/*`, `fix/*` |
| `main` | Stable, tested code that is ready to release. | PRs from `develop` (or `hotfix/*`) |
| `release/x.y` | What is running in production. Merging into it **deploys**. | PRs from `main` only |

```
feature/*  ->  develop  ->  main  ->  release/1.1  ->  production
   PR+CI        PR+CI       PR+CI      PR+CI, then merge deploys
```

## Everyday work
1. `git switch develop && git pull`, then `git switch -c feature/short-name`.
2. Push and open a PR into `develop`. CI runs the tests and a build.
3. When `develop` is in good shape, open a PR `develop` -> `main`.

## Releasing
1. Open a PR from `main` into `release/1.1` (CI checks the PR really comes from `main`).
2. Merge it once CI is green. The **Deploy to production** workflow then migrates the database,
   deploys the Worker and assets, and smoke-tests `https://playbonkroyale.com/api/health`.
3. A new minor version gets a new branch, for example `release/1.2` (branch it from `main`).

## Hotfixes
Branch `hotfix/*` from `main`, PR into `main`, then PR `main` -> `release/x.y` as usual. Port the fix back to `develop`.

## One-time setup (repository settings)
Secrets (Settings > Secrets and variables > Actions):
- `CLOUDFLARE_API_TOKEN`: a token created at dash.cloudflare.com > My Profile > API Tokens > "Edit Cloudflare Workers" template, plus D1 Edit permission.
- `CLOUDFLARE_ACCOUNT_ID`: `9fc4d7102b4c469b954733a4db4296e7`

Optional but recommended: Settings > Environments > `production` > Required reviewers (a human approves each deploy).
