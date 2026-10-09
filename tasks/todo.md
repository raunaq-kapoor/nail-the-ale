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

## Follow-up (same day): answered questions stay visible

User feedback: each new question replaced the last, so there was no way to see what you'd already answered. Fixed: answered questions now stay on screen as a running list (question label + the one picked answer, filled in and non-interactive), with the live question always the last thing on the page. Reuses the existing `.q`/`.chips`/`.chip` styling exactly — no new CSS.

- [x] `app.js`: `renderMood` renders `state.mood.history` as settled rows before the current question/loading/error/result; click delegation scoped to `.q.active .chip` so a past answer can't be re-tapped
- [x] Verify in Chrome (mock): transcript builds up correctly through to the result; Start over clears it

# Phase 6 — beta readiness, Mood polish, go-to-market notes

Plan written 2026-09-30; waiting for confirmation before executing.

## A. Beta readiness (walk it as a stranger)
- [x] 1. Fresh-profile run of `index.html` (no localStorage, no mock): Get started → each Test button with empty/wrong input → note every confusing or dead-end message
- [x] 2. Fix what the run finds in `app.js`/`index.html` (copy and error states only — no new flows)
- [x] 3. Re-read `docs/INVITE.md` against the real screens; correct drift (token permissions wording, step names)
- [x] 4. Add "Send feedback" instructions to INVITE (what to send: Last error line + what they were doing) and a 4-week check-in note tied to the roadmap's beta metrics → verify: a friend-shaped read-through finds no step that assumes prior knowledge

## B. Mood polish
- [ ] 1. Phone check of Mood tab on iPhone (you) — list any layout/tap issues
- [x] 2. Result card: show "You've had this style" from the user's own rated log (pure local lookup, no extra model call) → `node --test` for the matcher
- [x] 3. Result card: pass liked/avoided descriptors (not just the summary) into `buildMoodPrompt` so the pick respects avoids → `node --test` on prompt contents
- [ ] 4. Verify in Chrome mock, release, add changelog/decision row, update project memory

## C. Go-to-market (docs only, no code)
- [ ] 1. `docs/go-to-market.md`: launch checklist, pricing, distribution — summarized inline in chat

# 10-point rating scale (first draft — SUPERSEDED by "10-point score slider" below)

Decision so far: replace the 4-level verdict (👎😐👍❤️) with a 1–10 rating everywhere. New beers and AI predictions use 1–10 only. Existing beers are auto-converted once with a fixed mapping and flagged as estimated; the old value is kept in the data until the user says to delete it. Design for the picker/badges: **pending from user**.

## Data model
- `answers.rating` — integer 1–10 (the new rating). `isRated` checks this.
- `answers.overall` — old 1–4, left untouched on migrated beers, never written for new beers, never sent to the AI. Deleted only in the final cleanup step.
- `beer.ratingEstimated: true` — set by migration; cleared when the user picks a score themselves.
- `prediction.verdict` — keeps its key, now 1–10 (old stored predictions are mapped with the same table during migration).
- Proposed mapping (**needs your OK**): 👎1→2, 😐2→5, 👍3→7, ❤️4→9.

## Scope — every place that changes
- [ ] 1. `verdicts.js` → `rating.js` (delete old file, drop it from `sw.js` SHELL): scale bounds, labels for the picker, `LEGACY_MAP`, `migrateBeer(beer)` (pure, idempotent), `tone(rating)` for good/bad/plain. — `node --test`
- [ ] 2. `ai.js`: `isRated` → `answers.rating`; `summarizeHistory` prints `Rating: 8/10` (`~7/10, estimated` when flagged) and excludes `rating`+`overall` from the answers list; `buildPrompt`/`buildTastePrompt` scale text → "1=hated … 10=perfect"; `RESPONSE_SCHEMA` and the example JSON → `verdict: 1–10`; `normalizeBeers` validates 1–10 integer. — `node --test`
- [ ] 3. `card.js`: `verdictPicker` → 10-button picker (layout per your design); `readCard` reads `answers.rating`; `capEl` shows a number; `statusNotice` ("You've had this — 8/10", "Probably 7/10 · 70% sure") uses `tone()`; estimated shown as `~7`.
- [ ] 4. `app.js`: `withEdits` (rated check on `rating`; clear `ratingEstimated` only if the score changed); log rows (l.256, l.507) use number badge; predicted→actual (l.506); Mood "You've had" (l.592) shows number instead of emoji.
- [ ] 5. `search.js`: `beersInStyle` sorts by `answers.rating`.
- [ ] 6. Migration: on `loadAll` in `app.js`, run `migrateBeer` over beers; if any changed, one `upsertBeers` call (single commit), then a one-time toast "Converted N beers to the 10-point scale (estimated)". Idempotent, safe to run from two devices, old `overall` preserved so it's reversible.
- [ ] 7. `style.css`: 10 caps don't fit 58px in one row — restyle `.verdict` / `.cap` (two rows of 5, or a smaller single row); `.cap.sm` number badge; estimated style.
- [ ] 8. Copy: `index.html` l.203 and `README.md` l.31 (mention of 👎😐👍❤️); `dev/mock.js` predictions (verdict 4→9, 2→4) and mock beers.
- [ ] 9. Tests: update `ai.test.js` (rated helper, summarize, parseResponse) and `search.test.js` to `rating`; add `rating.test.js` for mapping, idempotence, estimated flag, beers without a rating.
- [ ] 10. Docs: `docs/decisions.md` new row superseding #6; roadmap untouched. CHANGELOG is automatic via `dev/release.sh`.
- [ ] 11. Verify: `node --test`; Chrome `index.html?mock=1` with an old-format fixture log (migration toast, ~badges, rate new beer, edit an estimated one, Ask predictions show /10); then release via `dev/release.sh`; phone check.
- [ ] 12. **Later, only when you say so:** cleanup release that deletes `answers.overall` (and `ratingEstimated` where you've confirmed) from the data repo.

## Not in scope
- A "refine your estimates" queue (you chose plain auto-convert).
- Half-point scores; changing the 3-rating prediction threshold; the storage/brain seams.

## Open questions
1. Mapping 2/5/7/9 OK?
2. Good/bad colouring of notices: ≥7 good, ≤4 bad, 5–6 neutral?
3. Should the AI prompt flag estimated scores as rough (my default: yes, one short note)?

---

# 10-point score slider (replaces the 1–4 verdict)

Brief: a 10-point slider for rating a beer, wired in as *the* rating target, styled to match the app.
Overturns decisions #6 (fixed 4-level verdict) and #12 (bottle caps as the verdict control).

## Design plan

**Subject**: a score typed in one-handed, on a phone, right after finishing the glass. The control must
read at arm's length and be draggable with a thumb — and it is now the app's one signature element,
since the four bottle caps were.

**Concept — "the pour".** The track is a wedge: it grows *taller* left to right, so the filled part
encodes the score twice (longer and deeper), like a bigger pour. The thumb is a bottle cap, stamped
with the numeral — decision #12's motif survives as the handle instead of being thrown away. Foam
appears on the fill at the top of the scale.

**Color** — existing tokens, one addition:
| token | role |
|---|---|
| `--amber` | the beer: the filled part of the wedge |
| `--ink` | wedge outline, cap border |
| `--surface-2` | unfilled wedge |
| `--foam` *(new)* | `light-dark(#FFFDF5, #EFE3C6)` — the head on the fill |
| `--hop` / `--rust` | unchanged; drive the good/bad notice at the new ≥6 boundary |

**Type**: `--display` (Barlow Condensed) for the numeral in the cap and the end labels — the wordmark's
face, nowhere else in the card. Anchor word in `--body`, sentence case. `.q-label` stays uppercase to
match every other question in the card.

**Layout**: full card width, left-aligned, label above, anchor word below.

```
SCORE
                                        ______----‾‾‾‾|
                     ______----‾‾‾▓▓▓▓▓▓▓▓▓▓▓▓( 7 )   |
   ______----‾‾‾▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ ‾‾‾    |
  |________________________________________________|
   ·  ·  ·  ·  ·  ·  ·  ·  ·  ·
   1                                              10
   very good
```

**Anchor words**, in the app's existing one-or-two-word voice, from beer vernacular rather than
star-rating filler: 1 drain pour · 2 wouldn't finish · 3 not for me · 4 fine · 5 drinkable ·
6 good · 7 very good · 8 excellent · 9 seek it out · 10 perfect pint.

**Principles**: a real `<input type=range>` under the drawing, so arrow keys, Home/End and VoiceOver
work for free (`aria-valuetext` = the anchor word); motion only in response to a drag, and gated on
`prefers-reduced-motion`; in a list the score collapses to the same circular cap carrying a numeral,
so Data still scans.

**Reviewed against the brief**: the generic answer here is a rounded grey track, a round thumb and a
1–10 tick row, or ten tappable dots — rejected both; the wedge and the cap-as-handle are specific to
this app and this subject. The palette *does* sit near the warm-cream-plus-clay look that reads as a
generated default, but it is the app's established, subject-derived palette and the brief says match
it, so it stays. `--foam` is the only new token.

## Steps

- [x] 1. `git mv verdicts.js scale.js` → `SCORES` (1–10 word + positive flag), `SCORE_MIN/MAX`,
      `POSITIVE_AT = 6`, `scoreOf(answers)` and `migrateOverall()` (1–4 → 3/5/7/9).
      → verify: new `tests/scale.test.js` covers the mapping, the marker, and out-of-range clamping.
- [x] 2. Migration. Old rows store `overall` 1–4 and a raw `3` is ambiguous across the two scales, so
      new writes carry `answers.scale = 10`; anything with `overall` and no `scale` is mapped on read
      and persisted on that beer's next save. No bulk rewrite of `beers.json` — a write can fail offline.
      → verify: test that a legacy row reads as 7, a new row round-trips, and migration is idempotent.
- [x] 3. `card.js`: `scorePicker()` replaces `verdictPicker()`; `capEl()` renders the numeral badge;
      `statusNotice` thresholds `>= 3` → `>= POSITIVE_AT`; `readCard` reads the range value + marker.
      → verify: `node --test` green, then the real card in Chrome.
- [x] 4. `style.css`: `.score` block (wedge, fill, foam, cap thumb, notches), `.cap` keeps its shape as
      the numeral badge, `.verdict` removed. `@supports` floor for anything newer than ~2 years, per lessons.
      → verify: light + dark, 320px-wide viewport, visible keyboard focus, reduced-motion.
- [x] 5. `ai.js`: scale string, `prediction.verdict` 1–4 → 1–10 in prompt + schema + example + clamp,
      history line `Verdict: loved` → `Score: 7/10 (very good)`, taste prompt.
      → verify: update `tests/ai.test.js`; `node --test` green.
- [x] 6. `app.js` (5 call sites) + `index.html` settings copy (`👎 😐 👍 ❤️ verdict` → the 1–10 score).
      → verify: grep for `VERDICTS|verdict|>= 3` returns nothing stale.
- [x] 7. Docs in the same turn as the code, per lessons: `docs/decisions.md` row (why 10 points, why the
      `scale` marker, why the cap became the handle, superseding #6/#12) and the spec's data-shape lines.
- [x] 8. Full check: `node --test`, then Chrome against `?mock=1` — rate on the slider → save → Data row
      shows the numeral → detail reloads the same score → a legacy 1–4 beer shows its mapped score.
      → verify: `git diff --stat` reviewed before any release, and release run as its own step (lessons).

Not doing unless you say so: running `dev/release.sh` (deploy), and touching the configurable extra
questions — only the fixed rating target changes.

## Review (2026-10-09)

Built, not released. `node --test`: 100 pass (new `tests/scale.test.js`; ai/search tests moved to the 1–10 scale, incl. legacy rows). Verified in Chrome against `?mock=1` with a seeded legacy log: legacy 👎😐👍❤️ show as 3/5/7/9 in Data; unrated slider is dashed with nothing filled; drag → fill, cap numeral and anchor word update; save writes `{overall, scale: 10}`; saving a legacy beer keeps the original as `legacyOverall`; untouched legacy rows are not rewritten; Ask notice reads "Probably 10/10"; dark mode checked. Not checked: a real phone, 320px width, VoiceOver. Changed from the plan: `legacyOverall` added (keeps the old rating until cleanup); mapping/threshold as designed (3/5/7/9, good at ≥6). Next: your OK to run `dev/release.sh`, then phone check; no cleanup release: `legacyOverall` stays in the data permanently (decided 2026-10-09).
