# Nail the Ale — implementation

Spec: docs/superpowers/specs/2026-09-20-nail-the-ale-design.md

- [x] 0. Scaffold repo, spec, todo
- [x] 1. image.js resize + store.js pure parts (utf8/base64, settings, cache) — `node --test`
- [x] 2. store.js GitHub I/O: loadAll/saveBeers/saveConfig/putPhoto/getPhoto, GET-then-PUT — tested against fake API; real-repo check at step 7
- [x] 3. ai.js: summarizeHistory/buildPrompt/RESPONSE_SCHEMA/analyzePhotos — `node --test`
- [x] 4. Shell + Settings, shared card, Record tab, Data tab + detail, Ask tab — Chrome mobile emulation
- [x] 5. Questions editor in Settings
- [x] 6. Thumbnails (putPhoto on save, show in Data/detail)
- [x] 7. PWA (manifest, icons, sw) + deploy (repos, Pages) — iPhone test pending user keys
- [x] 8. README setup docs

## Review

Built and deployed: https://raunaq-kapoor.github.io/nail-the-ale/ (app repo public, `nail-the-ale-data` private).

Verified:
- `node --test`: 25 tests (base64/settings/cache/ids, GitHub GET-then-PUT + upsert/delete/config/photos against a fake Contents API, prompt gating + history serialization + response normalization + Gemini request shape).
- Full UI flow in Chrome against `?mock=1`: Record → rate → Save all → Data; Ask → locked hint → predictions at 3 rated → Add to log → unrated pinned; detail edit/rate/save; two-tap delete; Settings + question editor → new question on cards.
- CORS preflight for the exact headers used passes on api.github.com and generativelanguage.googleapis.com from the Pages origin.
- Service worker registers and activates; first-run opens Settings.

Not yet verified (needs the user's keys and phone): real Gemini read of a real label, real write to the data repo, iOS camera + Add to Home Screen.

Bugs found and fixed during verification: Save-all button stayed disabled after success; overlay header shrink-wrapped inside the column flexbox.
