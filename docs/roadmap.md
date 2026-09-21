# Nail the Ale — roadmap

Where the app is, what it would take to grow it, and the decisions already made. Written 2026-09-21.

## Where it is

A static PWA with no backend. Each user brings their own GitHub repo (the database), Gemini key (vision + predictions), and optional Mistral key (backup when Google is saturated). Cost to run: $0. Cost per user: $0.

```
phone / laptop browser
  ├─ brain/direct.js   → Gemini, Mistral   (user's keys, called from the browser)
  └─ storage/github.js → private repo      (user's token; beers.json, config.json, taste.json, photos/)
```

Everything above those two files — cards, prompts, predictions, taste profile, search, tabs — is independent of *where* data lives and *who* calls the model. That seam is the whole plan below.

## Phase A — small beta (now): 5–10 people who can make a GitHub token

- Users follow **Get started** in the app (three steps with links, tests, checkmarks) or `docs/INVITE.md`.
- Nothing is shared between users; nothing costs the maintainer anything.
- Good for: technical friends. Not for: the general public (a GitHub token is a developer's chore).
- Watch for: do they still log beers after a month? That answers whether to do Phase B at all.

## Phase B — hosted: anyone with an email

Replace the two seam files, keep the rest.

| Concern | Today | Hosted |
|---|---|---|
| Login | none (token = identity) | Supabase Auth or Firebase Auth (magic link / Google / Apple) |
| Data | `storage/github.js` | `storage/supabase.js` — `beers` table with `user_id`, same record shape; or Firestore |
| Photos | repo `photos/` | Supabase Storage bucket (or Firebase Storage) |
| Model calls | `brain/direct.js` with the user's key | `brain/proxy.js` → a Cloudflare Worker / Edge Function holding **one** key (the maintainer's), per-user quota |
| Settings | per device | per account |

- New code: the Worker (~150 lines: auth check, quota, forward to Gemini), `storage/supabase.js`, `brain/proxy.js`, a login screen. Estimated 2–4 days.
- Running cost: Gemini Flash ≈ $0.001 per photo scan. 1,000 users × 20 scans/month ≈ $20–40/month. Supabase free tier pauses after 7 idle days — with real users it won't idle; move to the $25 plan when it matters.
- Keep `storage/github.js` and `brain/direct.js` as the "self-hosted" option — it's a feature for the people already using it.

## Phase C — paid

- **Web first, no App Store.** Same PWA; Stripe Checkout for a subscription (~$2–3/month) or one-time price. No 30% cut, no review, ships in days. iOS users add it to the home screen exactly as now.
- **App Store only if discovery demands it.** Wrap the same code with Capacitor. Then: in-app purchase (15–30%), alcohol age rating, privacy policy with export/delete.
- Don't rewrite native. Don't add billing before anyone besides the author has used it for a month.

## Decisions already made (and why)

- **Standalone, not a platform-hosted artifact** — ownership of code and data; no vendor that can sleep.
- **GitHub as the database** — free, never pauses, every save is a commit, trivially exportable. Supabase's free tier pauses; Firebase Storage needs a card.
- **Keys per device, never synced** — a browser-only app has nowhere safe to put them. Option on the table: AI keys in the private data repo (`settings.json`), GitHub token stays per device. Fine for one person; not for a service.
- **Gemini primary, Mistral backup** — Google's free tier saturates at peak hours (all Flash models 503 at once, measured 2026-09-21); Mistral's Experiment plan is free and browser-callable.
- **Predictions are prompting, not ML** — the rated history (≤80 beers) plus the taste summary is sent with every scan. Works from 3 ratings; no training pipeline to build or host.
- **No build step** — GitHub Pages serves ES modules directly; nothing to rot.

## What to measure in the beta

Weekly active users after 4 weeks; scans per user per week; how often the fallback provider answered; the *predicted → actual* hit rate in Data (the app already records both).
