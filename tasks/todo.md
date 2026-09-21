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

- [ ] 1. `ai.js`: `buildTastePrompt` + `TASTE_SCHEMA` + `summarizeTaste()`; `buildPrompt` includes the saved taste summary as a prior — `node --test`
- [ ] 2. `store.js`: `loadAll` reads `taste.json` (null if missing); `saveTaste()` — `node --test`
- [ ] 3. Data tab: "Your taste" card on top — gated at 3 ratings, Build/Update button, shows summary + likes/avoids chips, "N new ratings since" nudge
- [ ] 4. `search.js`: `filterBeers(beers, q)` over name/brewery/style/descriptors — `node --test`; search box above the Data list
- [ ] 5. Questions editor: ▲/▼ reorder (editor already reads DOM order)
- [ ] 6. Mock: canned taste response; verify all three in Chrome; push; phone check
