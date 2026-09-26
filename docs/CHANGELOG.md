# Changelog

Every release, newest first. Versions are the stamp shown at the bottom of ⚙︎. Entries are appended automatically by `dev/release.sh`; edit freely to add detail.

## `2026.09.26-1` — 2026-09-26
- Add Mood tab: adaptive quiz suggests a beer style + ABV range for how you feel right now

## `2026.09.21-15` — 2026-09-21
- Get started: three numbered steps with deep links, owner filled from the token; invite one-pager; roadmap

## (pre-release) — 2026-09-21
- Seams: storage/ (github) and brain/ (direct) behind documented contracts; session.js; no behaviour change

## (pre-release) — 2026-09-21
- Roadmap: BYO beta → hosted → paid; decisions on record

## `2026.09.21-14` — 2026-09-21
- Re-read the repo when the app returns to the foreground; README note on second devices

## `2026.09.21-13` — 2026-09-21
- (version bump only — the intended change shipped in -14)

## `2026.09.21-12` — 2026-09-21
- Backfill country for beers recorded before the field; brewery · country as one content-sized line on the card

## `2026.09.21-11` — 2026-09-21
- Mistral as automatic backup provider for photos, lookups and taste when Google's free tier is saturated; short Google chain when a backup exists

## `2026.09.21-10` — 2026-09-21
- Country of origin field (read, editable, shown, searchable, in the prompt); 'cheap' chip; choose-from-photos alongside the camera

## `2026.09.21-9` — 2026-09-21
- If the photo upload fails at the network level, retry once with a much smaller image

## `2026.09.21-8` — 2026-09-21
- Network failures hop through models; Last error records elapsed time, upload size, online state

## `2026.09.21-7` — 2026-09-21
- Retry network-level failures (Safari 'Load failed') before giving up; smaller photo upload; connection-specific message

## `2026.09.21-6` — 2026-09-21
- Tolerant answer parsing (thinking parts, prose, cut-off), 429 moves to next model, last-error line in Settings, honest copy when Google is at capacity

## `2026.09.21-5` — 2026-09-21
- QC: Test key isolates each model and treats a busy search model as a note; type-ahead explains missing keys; light-dark() fallback for older iOS

## `2026.09.21-4` — 2026-09-21
- Year question type; 'When did you first have it?' seeded, prefilled with the current year

## `2026.09.21-3` — 2026-09-21
- Retry busy Gemini answers with backoff, fall back through sibling Flash models, say which model answered

## `2026.09.21-2` — 2026-09-21
- Search falls back to the main model when the fast model is unavailable

## `2026.09.21-1` — 2026-09-21
- Type-to-add search (own log + Gemini suggestions → same card pipeline); UI polish: light-dark tokens, label tiles, cap placeholders, empty state, motion

## `2026.09.20-1` — 2026-09-20
- Network-first service worker, auto-reload on update, version stamp in Settings, release script

## (pre-release) — 2026-09-20
- Tab icons: pint glass, bottle-cap question, tally marks as inline SVG; camera glyph to match

## (pre-release) — 2026-09-20
- Phase 2: taste profile card (saved to taste.json, used as Ask prior), Data search, question reorder

## (pre-release) — 2026-09-20
- Open on Record; setup notice instead of forcing Settings before keys are in

## (pre-release) — 2026-09-20
- Test connection checks the repo's real permissions (404 means no access, not empty)

## (pre-release) — 2026-09-20
- Set timing expectation on the scan status line

## (pre-release) — 2026-09-20
- Default to gemini-3.6-flash (2.5 retired for new keys); Test key does a real generation

## (pre-release) — 2026-09-20
- Step 7-8: PWA manifest, icons, service worker, README

## (pre-release) — 2026-09-20
- Steps 4-6: three-tab UI, shared beer card, questions editor, thumbnails; dev mock

## (pre-release) — 2026-09-20
- Step 3: Gemini prompt, schema, response normalization, request wrapper (tested)

## (pre-release) — 2026-09-20
- Step 2: GitHub Contents API store with GET-then-PUT, cache fallback, photos

## (pre-release) — 2026-09-20
- Step 1: base64, settings, cache, ids (tested) and image resize
