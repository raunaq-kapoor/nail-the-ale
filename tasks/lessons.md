# Lessons

(patterns from corrections go here)

## 2026-09-20 — PWA updates never reached the phone
Stale-while-revalidate on the app shell meant a resident iOS home-screen app could stay on an old version indefinitely (and mix new HTML with old JS). Rule: for a small always-online app, serve own files **network-first with a short timeout**, reload the page on `controllerchange`, stamp a visible version, and bump it on every deploy via a script — never rely on "it'll refresh next time".

## 2026-09-21 — QC pass after adding resilience
Adding a default-on fallback to a shared low-level call (`generate`) silently changed the meaning of a diagnostic built on it (`pingModel`): "Test key" reported a retired model as working. Rule: when a shared primitive gains automatic recovery, grep every caller and ask whether that caller *wants* recovery — diagnostics never do. Also: any CSS feature newer than ~2 years (light-dark()) gets an `@supports` floor.

## 2026-09-21 — a release went out with only a version bump
An edit script's assertion failed, but the release command on the next line still ran because a heredoc ends the command — `&&` after the heredoc doesn't chain to it. Rule: run edits and the release as separate steps and check `git diff --stat` before releasing.

## 2026-09-21 — features and decisions were only in commit messages
The user asked whether small features and decisions were being recorded; they weren't, beyond git. Rule: `docs/CHANGELOG.md` is appended by the release script (automatic); `docs/decisions.md` gets a row whenever a release embodies a choice with a "why" — write it in the same turn as the code, not later.

## 2026-10-17 — my repro hid the bug: I seeded the very field that caused it
A blank Data tab after reinstall: I reproduced locally with a fake `geminiKey` in the seed, so it rendered fine and I blamed Test connection. The screenshot showed the Gemini field empty; `configured()` required it, so nothing ever loaded. Rule: before seeding a repro, read every gate the code path checks (`configured()` and friends) and seed only what the user actually has — a repro that supplies a value the user lacks proves nothing. Also: a gate should require only what its feature needs (reading the repo ≠ calling the model).
