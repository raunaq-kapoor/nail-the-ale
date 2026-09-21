# Lessons

(patterns from corrections go here)

## 2026-09-20 — PWA updates never reached the phone
Stale-while-revalidate on the app shell meant a resident iOS home-screen app could stay on an old version indefinitely (and mix new HTML with old JS). Rule: for a small always-online app, serve own files **network-first with a short timeout**, reload the page on `controllerchange`, stamp a visible version, and bump it on every deploy via a script — never rely on "it'll refresh next time".
