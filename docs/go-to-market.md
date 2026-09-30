# Nail the Ale — go to market

Written 2026-09-30. Companion to `roadmap.md` (which covers the technical phases). Competitor prices below are from memory — verify before relying on them.

## Before it's on the market

1. **Prove demand first.** 5–10 people logging beers for 4 weeks. If they stop, don't build the hosted version.
2. **Accounts, so users don't need a GitHub token.** Login via Supabase or Firebase, plus a server-side Worker that holds one Gemini key (the maintainer's) and enforces per-user quotas. Estimated 2–4 days (see roadmap Phase B).
3. **Billing.** Stripe Checkout; free-scan limits enforced on the server.
4. **Legal basics.** Privacy policy, terms, account and data deletion. Alcohol content needs an age gate (legal drinking age). Disclose that photos are sent to Google for analysis.
5. **Name check.** Trademark search for "Nail the Ale"; get a domain.
6. **Reliability.** Google's free tier saturates at peak hours. In production, use the paid API (~$0.001 per scan).

## Pricing

- **Cost per user:** about $0.02–0.05 a month at 20 scans. Hosting is near zero, so margin is not the constraint.
- **Comparables:** Untappd is free with a paid tier of roughly $6/month; Vivino is free with optional premium. Nobody charges much for logging.
- **Recommendation:** free for about 15 scans a month; **$2.99/month or $19/year** for unlimited scans, taste profile and Mood.
- **What to sell:** the AI predictions ("which beer on this shelf will I like"). Logging stays free.
- **Don't add billing** until people outside the author's circle have used it for a month.

## Where to put it

- **Web app (PWA) on its own domain first.** Already on GitHub Pages; add Cloudflare Pages with a custom domain and a landing page that explains the product.
- **No App Store at first.** Stripe on the web avoids Apple's 15–30% cut and review. Add a Capacitor wrapper only if users want to find it there.
- **Get users from** beer subreddits, homebrew and craft-beer communities, Product Hunt, local taprooms. The rating-and-prediction story demos well as a short screen recording.
