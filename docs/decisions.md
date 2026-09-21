# Decision log

Every choice that shaped the app, big and small, with the reason — so nobody has to re-derive it. Newest at the bottom. Big architectural ones are also summarised in `roadmap.md`.

| # | Date | Decision | Why |
|---|---|---|---|
| 1 | 2026-09-20 | Standalone PWA, not a Claude Artifact / Claude Project | Ownership of code and data; no platform tie; a clear path to multi-user. |
| 2 | 2026-09-20 | No backend; GitHub private repo *is* the database | $0, never pauses (Supabase free tier pauses after 7 idle days), every save is a commit, trivially exportable. |
| 3 | 2026-09-20 | Gemini Flash called directly from the browser with the user's key | Only free vision API with strict JSON-schema output; CORS verified from the Pages origin. |
| 4 | 2026-09-20 | Keys live in the phone's localStorage, never synced | A browser-only app has nowhere safe to keep them. Cost: one paste per device. |
| 5 | 2026-09-20 | Predictions are prompting, not ML | The rated history (≤80 beers) rides along with every scan; works from 3 ratings; nothing to train or host. |
| 6 | 2026-09-20 | Fixed 4-level verdict (👎😐👍❤️) + configurable extra questions | One stable target for predictions; everything else editable from the phone so the question set can be iterated in use. |
| 7 | 2026-09-20 | No build step, no framework | 4 screens, one user; GitHub Pages serves ES modules; nothing to rot. |
| 8 | 2026-09-20 | Writes are GET-then-PUT (fresh sha every time) | Editing `beers.json` on the Mac must never cause a conflict on the phone. |
| 9 | 2026-09-20 | Three tabs: Record / Ask / Data; one shared beer card | Two photo-driven jobs and one ledger; the card is the same component with different affordances. |
| 10 | 2026-09-20 | Predictions hidden on Record cards | Showing a prediction right before you rate would bias the rating. Stored silently for predicted → actual. |
| 11 | 2026-09-20 | Prediction gate at 3 rated beers | Below that the model would be guessing; the UI counts up to it. |
| 12 | 2026-09-20 | Bottle caps as the verdict control; label-style cards; pilsner/stout palette | One signature element; everything else quiet. |
| 13 | 2026-09-20 | Service worker: network-first with 2.5 s timeout, reload on `controllerchange`, version stamp in ⚙︎ | Stale-while-revalidate left the resident iOS app on old versions indefinitely. See lessons. |
| 14 | 2026-09-21 | Default model `gemini-3.6-flash`; model id is a setting with a real "Test key" | 2.5-flash was retired for new keys on first real use; ids change, so they must be editable and tested by a real generation. |
| 15 | 2026-09-21 | "Test connection" checks the repo's permissions, not a file read | GitHub answers 404 for a private repo the token can't see — indistinguishable from "empty". |
| 16 | 2026-09-21 | App opens on Record with a setup notice, never forces Settings | Landing on a form was the wrong first impression. |
| 17 | 2026-09-21 | Taste profile: one call, saved to `taste.json`, fed back into Ask as a prior | Cheap; persists across opens; the model gets a distilled view alongside raw history. |
| 18 | 2026-09-21 | Type-to-add search: own log instantly, Gemini suggestions after 500 ms debounce (3+ chars); selection runs the photo pipeline | No free beer-product API exists; the model *is* the search. The fast model gets exactly one try, then the main model. |
| 19 | 2026-09-21 | `light-dark()` tokens with a plain-light floor under `@supports` | One source of truth for both themes; older iOS (< 17.5) must not render unstyled. |
| 20 | 2026-09-21 | Retry 503 with backoff; walk sibling Flash models; 429 moves on immediately; network failures also hop | Google's free tier saturates per model at peak; 429 is per-model quota; Safari reports an early server close as "Load failed". |
| 21 | 2026-09-21 | Tolerant answer parsing: skip thinking parts, extract the JSON, name cut-offs | Gemini 3.x can return thought parts; a cryptic parse error helps nobody. |
| 22 | 2026-09-21 | Photo upload at 1024 px / q0.8, with a 640 px retry on network failure | Plenty for a label; keeps uploads small on weak links. |
| 23 | 2026-09-21 | "Last error" line in ⚙︎ with elapsed time, bytes sent, online state | The phone has no console; this line is how bugs get reported. It's what proved the 83-second all-models-busy failure. |
| 24 | 2026-09-21 | "When did you first have it?" is a **Year** dropdown, not a date | Nobody remembers the day; year is the useful signal. Defaults to this year; keeps the stored year on re-rating. |
| 25 | 2026-09-21 | Country of origin is a first-class field, backfilled once for older beers | Wanted alongside style and ABV; one text call fills the gaps quietly on open. |
| 26 | 2026-09-21 | Mistral as automatic backup (photos, lookups, taste); Google gets a short chain when a backup exists | Measured: all five Flash models 503 at once at 12:27 PM. Mistral's Experiment plan is free and browser-callable. |
| 27 | 2026-09-21 | Re-read the repo when the app returns to the foreground (≥20 s apart) | Beers, questions, taste are shared through the repo across devices; the phone only read at launch. |
| 28 | 2026-09-21 | Seams: `storage/` and `brain/` behind documented contracts; `session.js` | Hosting later (login + DB + photo storage + proxied key) becomes a two-file swap. No behaviour change. |
| 29 | 2026-09-21 | Beta = bring-your-own repo + key with a guided Get-started; hosted and paid are Phases B/C | Validate weekly use before adding accounts, billing, or a server. See `roadmap.md`. |

## Open questions

- AI keys in the private data repo (`settings.json`) so only the GitHub token is per-device — fine for one person, not for a service. Not done; revisit if second-device friction matters.
- Which questions actually help prediction — look at predicted → actual in Data after ~20 ratings.
