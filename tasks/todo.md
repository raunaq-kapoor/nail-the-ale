# Nail the Ale — implementation

Spec: docs/superpowers/specs/2026-09-20-nail-the-ale-design.md

- [x] 0. Scaffold repo, spec, todo
- [x] 1. image.js resize + store.js pure parts (utf8/base64, settings, cache) — `node --test`
- [x] 2. store.js GitHub I/O: loadAll/saveBeers/saveConfig/putPhoto/getPhoto, GET-then-PUT — tested against fake API; real-repo check at step 7
- [x] 3. ai.js: summarizeHistory/buildPrompt/RESPONSE_SCHEMA/analyzePhotos — `node --test`
- [x] 4. Shell + Settings, shared card, Record tab, Data tab + detail, Ask tab — Chrome mobile emulation
- [x] 5. Questions editor in Settings
- [x] 6. Thumbnails (putPhoto on save, show in Data/detail)
- [x] 7. PWA (manifest, icons, sw) + deploy (repos, Pages) + iPhone test
- [x] 8. README setup docs

## Review

Built and deployed: https://raunaq-kapoor.github.io/nail-the-ale/ (app repo public, `nail-the-ale-data` private).

Verified:
- `node --test`: 25 tests (base64/settings/cache/ids, GitHub GET-then-PUT + upsert/delete/config/photos against a fake Contents API, prompt gating + history serialization + response normalization + Gemini request shape).
- Full UI flow in Chrome against `?mock=1`: Record → rate → Save all → Data; Ask → locked hint → predictions at 3 rated → Add to log → unrated pinned; detail edit/rate/save; two-tap delete; Settings + question editor → new question on cards.
- CORS preflight for the exact headers used passes on api.github.com and generativelanguage.googleapis.com from the Pages origin.
- Service worker registers and activates; first-run opens Settings.

Verified on the real stack (2026-09-21): Gemini 3.6 Flash read a craft can and an 8-beer shelf through `analyzePhotos()` (matched a logged beer, predictions cited history); GitHub round-trip via `store.js` with the real token; on the iPhone from the home screen, the first real beer ("Ol' Dirty Pilly") was photographed, rated, and landed in `nail-the-ale-data` as commits with its thumbnail.

Found on the real stack and fixed: `gemini-2.5-flash` retired for new keys (default → 3.6, Test key now does a real generation); a token without repo access looks like an empty repo (Test connection now checks the repo's permissions); first run forced the Settings overlay (now a notice on the tabs).

Bugs found and fixed during verification: Save-all button stayed disabled after success; overlay header shrink-wrapped inside the column flexbox.

# Phase 2

Shipped 2026-09-21. Verified against the mock in Chrome: taste card gates at 3 ratings, builds and persists (`taste.json`), chips render; search filters name/brewery/style/descriptors and shows "N of M match"; ▲▼ reorder persists on Save. 39 tests green.

- [x] 1. `ai.js`: `buildTastePrompt` + `TASTE_SCHEMA` + `summarizeTaste()`; `buildPrompt` includes the saved taste summary as a prior — `node --test`
- [x] 2. `store.js`: `loadAll` reads `taste.json` (null if missing); `saveTaste()` — `node --test`
- [x] 3. Data tab: "Your taste" card on top — gated at 3 ratings, Build/Update button, shows summary + likes/avoids chips, "N new ratings since" nudge
- [x] 4. `search.js`: `filterBeers(beers, q)` over name/brewery/style/descriptors — `node --test`; search box above the Data list
- [x] 5. Questions editor: ▲/▼ reorder (editor already reads DOM order)
- [x] 6. Mock: canned taste response; verify all three in Chrome; push; phone check

# Phase 3 — type-to-add search + UI polish

Shipped 2026-09-21. Verified in Chrome (light + forced dark): suggestions after 500 ms, own-log rows instantly, typed pick → same card → save with cap placeholder, own-log pick on Ask → "You've had this". 43 tests green.

- [x] 1. `ai.js`: `suggestBeers()` (Flash-Lite, `SUGGEST_SCHEMA`, abortable), `analyzeTyped()` reusing the photo prompt/schema with a typed description — `node --test`
- [x] 2. `store.js`: `searchModel` setting default — `node --test`
- [x] 3. Search box under both camera tiles: own-log rows instantly, Gemini suggestions after 500 ms debounce (3+ chars), stale calls aborted; select → same card pipeline as a photo
- [x] 4. No-photo placeholder: cap with initial (cards + Data rows); Settings: Search model field; mock: canned suggestions/typed
- [x] 5. UI polish: `light-dark()` tokens + dark audit, label-style camera tiles, empty state, card rise motion, wordmark cap
- [x] 6. Verify light + dark in Chrome; release; phone check

# Phase 4 — ready for a small beta; seams for auth + database + photo storage

Shipped 2026-09-21. `storage/` and `brain/` behind documented contracts (no behaviour change, 76 tests green); guided three-step Get started with deep links and owner autofill; `docs/roadmap.md` and `docs/INVITE.md`.

- [x] 1. `docs/roadmap.md`: phases (BYO beta → hosted → paid), costs, decisions, what changes where
- [x] 2. Storage seam: `storage/interface.js` (documented contract) + `storage/github.js` (today's code moved); `store.js` keeps settings/cache and re-exports — tests unchanged and green
- [x] 3. Brain seam: `brain/direct.js` holds the Gemini/Mistral transport (generate/callMistral/askJson); `ai.js` keeps prompts, schemas, normalization and calls the transport — tests unchanged and green
- [x] 4. `session.js`: settings + which storage/brain are active (today: github + direct); `configured()` lives here
- [x] 5. Get started flow: replaces the setup notice — 3 steps with deep links + tests + checkmarks; `docs/INVITE.md` one-pager; README "Invite a friend"
- [x] 6. Verify in Chrome (mock + first-run), release

# Phase 5 — Mood tab ("what's my mood")

Shipped 2026-09-26. Verified against the mock in Chrome: opening the tab → 3-4 tap-to-answer questions → result card (style, ABV range, notes, pairing) → Start over resets cleanly; Ask/Record unaffected. 83 tests green.

- [x] 1. `ai.js`: `MOOD_SCHEMA`, `buildMoodPrompt` (embeds the 3-5 question cap in the prompt text itself, includes the saved taste summary as a prior), `moodStep()` — `node --test`
- [x] 2. `index.html`: 4th tab + tabbar icon; `style.css`: reuse `.chips/.chip/.taste/.primary/.ghost`, minimal additions
- [x] 3. `app.js`: `wireMood()`/`renderMood()` — tap-to-answer chips (reusing the `.q`/`.chips`/`.chip` pattern from the rating-question UI, but submitting on tap instead of collecting), loading/error states via the existing `failed()`/`toast()` pattern, result card, Start over
- [x] 4. `dev/mock.js`: canned 3-question quiz ending in a Hazy IPA result, so `?mock=1` exercises the whole flow
- [x] 5. Verify in Chrome (mock), release

## Follow-up (same day): opening question is free

User feedback: a "Let's go" button before the quiz was an unnecessary extra tap, and the opening question never actually depends on anything the app knows yet, so it doesn't need a model call. Fixed: `defaults.js` now holds `MOOD_FIRST_QUESTION`, a fixed opening question shown the instant the tab is opened; the first model call happens only after that's answered. 84 tests green.

- [x] 1. `defaults.js`/`store.js`: `MOOD_FIRST_QUESTION` — `node --test`
- [x] 2. `app.js`: `state.mood` starts pre-populated with it; drop the start screen/button; "Try again" on error now retries the same step instead of restarting the whole quiz
- [x] 3. `dev/mock.js`: drop the now-unreachable first canned question
- [x] 4. Verify in Chrome (mock), release
