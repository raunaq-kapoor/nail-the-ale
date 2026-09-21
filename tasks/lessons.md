# Lessons

(patterns from corrections go here)

## 2026-09-20 — PWA updates never reached the phone
Stale-while-revalidate on the app shell meant a resident iOS home-screen app could stay on an old version indefinitely (and mix new HTML with old JS). Rule: for a small always-online app, serve own files **network-first with a short timeout**, reload the page on `controllerchange`, stamp a visible version, and bump it on every deploy via a script — never rely on "it'll refresh next time".

## 2026-09-21 — QC pass after adding resilience
Adding a default-on fallback to a shared low-level call (`generate`) silently changed the meaning of a diagnostic built on it (`pingModel`): "Test key" reported a retired model as working. Rule: when a shared primitive gains automatic recovery, grep every caller and ask whether that caller *wants* recovery — diagnostics never do. Also: any CSS feature newer than ~2 years (light-dark()) gets an `@supports` floor.

## 2026-09-21 — a release went out with only a version bump
An edit script's assertion failed, but the release command on the next line still ran because a heredoc ends the command — `&&` after the heredoc doesn't chain to it. Rule: run edits and the release as separate steps and check `git diff --stat` before releasing.
