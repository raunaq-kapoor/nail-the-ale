# Nail the Ale — personal beer memory PWA

## Context

You buy a few beers, drink them, and by the next store trip can't remember which ones you liked. You want a phone app where you photograph beers, the app extracts what they are (name, brewery, style, ABV, flavor profile), asks you a few rating questions after you drink them, and — once it has enough history — tells you from a photo whether you'll like a beer before you buy it.

Decisions made in brainstorming:
- **Standalone PWA**, not a Claude Artifact or Claude Project (you want ownership and no platform tie).
- **$0 and nothing that can pause**: Supabase free tier pauses after 7 idle days, so it's out. Chosen stack has no servers at all.
- **Rating questions are configurable** from the phone so you can iterate on the right set while drinking the first few.
- **Thumbnails** of label photos are kept so beers are recognizable in the list.

## Stack (all free, none of it sleeps)

```
iPhone home-screen PWA   — static HTML/JS on GitHub Pages (public repo `nail-the-ale`, contains no secrets)
   ├─ 📷 photo  ──► Gemini Flash API (free tier), called directly from the browser.
   │                 API key lives only in the phone's localStorage; restricted to the Pages domain in Google Cloud console.
   └─ 💾 data   ──► private GitHub repo `nail-the-ale-data` via GitHub Contents API.
                     beers.json · config.json · photos/<id>.jpg
                     Fine-grained PAT (Contents: read/write on that one repo) lives only in localStorage.
```

- Every save is a git commit → full history, free backup, you can read/edit the JSON in the repo from the Mac.
- No build step, no framework: 4 screens, one user, GitHub Pages serves ES modules directly. Nothing to rot.
- Reads are cached in localStorage so the log opens instantly/offline; scanning needs network anyway.

## The AI loop (zero ML, just reasoning over your history)

Both photo flows (Record and Ask) use the **same** Gemini call, JSON mode with a `responseSchema`. Input: 1–N photos (a 4-pack in one shot, or one per beer) + text:

1. Identify each distinct beer → `name, brewery, style, abv, profile {bitterness, sweetness, maltiness, hoppiness, fruitiness, roastiness, sourness} (1–5), descriptors[], photoIndex`.
2. Given the list of beers already in the log (`id, name, brewery`), return `matchId` if it's the same product → UI shows "already in your log: you gave it 👍".
3. Given the **rated history** (up to the last 80 rated beers, serialized as `name · style · abv · profile · Verdict: loved · What stood out: great aroma, refreshing · Note: …`), return `prediction {verdict 1–4, confidence 0–1, reason}` per beer. Prediction is `null` until ≥ 3 beers are rated; UI shows "rate 3 beers to unlock predictions (1/3)".

The prediction made at scan time is stored on the beer, so the log later shows "predicted 👍 → you said ❤️" — that's how you'll see the system getting good.

## Data model

No SQL — three things in the private repo, two things on the phone:

| Store | Where | Fields |
|---|---|---|
| **beers** (one row per beer) | `beers.json` in `nail-the-ale-data` | `id`, `name`, `brewery`, `style`, `abv`, `profile` {bitterness, sweetness, maltiness, hoppiness, fruitiness, roastiness, sourness: 1–5}, `descriptors[]`, `photo` (path or null), `prediction` {verdict 1–4, confidence, reason} or null, `answers` {`overall` 1–4 + one key per configured question}, `addedAt`, `ratedAt` |
| **questions** | `config.json`, same repo | array of {`id`, `label`, `type` chips/choice/text, `options[]`} — the fixed verdict question is not here |
| **photos** | `photos/<beer id>.jpg`, same repo | ~400px JPEG thumbnail, referenced by `beers.photo` |
| **settings** | phone localStorage only | Gemini key, model id, GitHub owner/repo/token |
| **cache** | phone localStorage only | last-known `beers.json` + `config.json` + fetched thumbnails |

Hundreds of beers ≈ a few hundred KB, under GitHub's 1 MB single-file API limit.

Example `beers.json`:
```json
{ "beers": [ {
  "id": "b_20260920_x7k2",
  "name": "Hazy Little Thing", "brewery": "Sierra Nevada", "style": "Hazy IPA", "abv": 6.7,
  "profile": {"bitterness":3,"sweetness":2,"maltiness":2,"hoppiness":5,"fruitiness":4,"roastiness":1,"sourness":1},
  "descriptors": ["juicy","citrus"],
  "photo": "photos/b_20260920_x7k2.jpg",
  "prediction": {"verdict":3,"confidence":0.7,"reason":"…"},
  "answers": {},
  "addedAt": "2026-09-20T18:00:00Z", "ratedAt": null
} ] }
```
- `answers.overall` is the fixed target: `1..4` = 👎 😐 👍 ❤️. Always asked, not editable in config.
- Every other answer is keyed by question id, value = option string, `string[]` for chips, or free text.
- A beer with `answers === {}` is "unrated" (recorded but not yet rated — shown at the top of Data with a "rate" badge).

`config.json` (editable in-app and in git):
```json
{ "questions": [
  {"id":"stood_out","label":"What stood out?","type":"chips","options":["too bitter","too sweet","too heavy","watery","great aroma","refreshing","complex","boring"]},
  {"id":"note","label":"Note","type":"text"}
] }
```
Types: `chips` (multi-select), `choice` (single), `text`. Adding/removing questions never breaks anything — old beers just have fewer answers, and the prompt serializes whatever is present.

## Screens — 3 bottom tabs + a ⚙️ in the header

Every tab's camera button is `<input type=file accept=image/* capture=environment multiple>` → opens the iOS camera directly; multiple photos allowed.

1. **📝 Record** — "I had this." Big camera button → Gemini → one card per beer with identity fields (editable, to fix misreads), profile mini-bars, and the **rating questions inline** (4 verdict buttons + configured questions). "Save all" writes every card; cards you didn't answer are saved unrated so you can rate them from Data later (e.g. a 4-pack you photograph on day one and drink over the week). Already-logged beers show "you had this on <date> — 👍" and default to *not* re-saving.
2. **🔮 Ask** — "Will I like this?" Big camera button → Gemini → one card per beer with identity, profile, and the **prediction badge + one-sentence reason** (or "already in your log: you gave it 👍"; or "rate 3 beers to unlock predictions (1/3)"). Nothing is saved unless you tap **"Add to log"** on a card — which records it unrated so you don't need to re-photograph at home.
3. **📊 Data** — every record, newest first: thumbnail, name, style, verdict, and a *predicted → actual* chip. Unrated beers pinned at the top with a "rate" badge. Tap a row → **Beer detail**: same editable fields + questions as a Record card, plus Delete.
4. **⚙️ Settings** (header button, not a tab) — Gemini key + model id (default `gemini-2.5-flash`, "Test" lists models), GitHub owner/repo/token ("Test" reads `beers.json`), and the **questions editor**: add / edit (label, type, options) / delete.

The Record card, Ask card, and Beer detail share one card component: identity + profile, optionally with questions, optionally with a prediction badge.

## Files (`~/nail-the-ale/`, new git repo)

```
index.html      shell: header (title + ⚙️), 3 tab panels, Beer detail + Settings as overlays
style.css       mobile-first, big tap targets, light/dark
app.js          tab switching, rendering, event handlers
card.js         renderBeerCard(beer, {questions?, prediction?}) shared by Record / Ask / Detail
ai.js           summarizeHistory(), buildPrompt(), RESPONSE_SCHEMA, analyzePhotos()  — pure parts exported for tests
store.js        settings (localStorage), GitHub Contents API load/save, utf8↔base64, localStorage cache
image.js        resize(file, maxPx) → {blob, base64}  (~1280px for Gemini, ~400px thumbnail)
sw.js           cache-first for the shell files
manifest.json + icons/   standalone display, apple-touch-icon
tests/*.test.js run with `node --test` (pure functions only)
README.md       setup: keys, repos, add-to-home-screen
tasks/todo.md, tasks/lessons.md
docs/superpowers/specs/2026-09-20-beerlog-design.md   (this design, committed)
```

Key implementation details:
- **GitHub writes are GET-then-PUT** (fresh `sha` every time) so editing `beers.json` on the Mac never causes a 409 on the phone. Mutations are per-beer upserts applied to the freshly loaded file.
- **utf8-safe base64** (`TextEncoder` → base64) — answers contain emoji.
- Photos < 1 MB are returned inline by the Contents API, so thumbnails are read via the API with the token (private repo) and shown as `data:` URLs; cached in localStorage by id.
- Gemini request: `POST …/v1beta/models/{model}:generateContent` with `x-goog-api-key` header, `contents[0].parts` = text + `inline_data` per image, `generationConfig.responseMimeType = application/json` + `responseSchema`. Parse `candidates[0].content.parts[0].text`.
- Verdict prediction/actual stored as numbers 1–4; emoji labels live in one constant in code.

## Implementation steps (TDD where there are pure functions; each step verified before the next)

0. **Scaffold** — `~/nail-the-ale` git init, README stub, spec file, `tasks/todo.md` mirroring these steps. Commit.
1. **`image.js` + `store.js` pure parts** — resize (manual check in browser), utf8/base64 round-trip, settings get/set, cache. Tests: base64 round-trip with emoji. → `node --test` green.
2. **`store.js` GitHub I/O** — `loadAll()` (beers + config, falls back to cache), `saveBeers()`, `saveConfig()`, `putPhoto()`, `getPhoto()`; GET-then-PUT. → verified in-browser against the real `nail-the-ale-data` repo.
3. **`ai.js`** — `summarizeHistory()`, `buildPrompt()`, `RESPONSE_SCHEMA`, `analyzePhotos()`. Tests: history serialization includes configured question labels, prediction gated at <3 rated, prompt under size cap. → `node --test` green.
4. **Shell + Settings** first (tabs, header, keys can be entered), then the shared **card**, then **Record** tab, **Data** tab + Beer detail, **Ask** tab. → drive locally in Chrome mobile emulation with `python3 -m http.server`.
5. **Questions editor** in Settings; cards re-render from config. → add a question, record a beer, confirm it lands in `beers.json` and in the next Ask prompt.
6. **Thumbnails** — resize to ~400px, `putPhoto()` on save, show in Data and detail. → check `photos/` in the data repo and list rendering.
7. **PWA + deploy** — manifest, icons, service worker; `gh repo create nail-the-ale --public`, `nail-the-ale-data --private`, enable Pages. → open on iPhone, Add to Home Screen, camera opens, full Record → Data → Ask loop with a real beer.
8. **README** — setup steps for keys (with referrer restriction), token scope, home-screen install.

## One-time setup you do (I'll walk you through it at step 7)

- Google AI Studio → create API key → in Google Cloud console restrict it to HTTP referrer `https://<you>.github.io/*`.
- GitHub → fine-grained personal access token → repository access: `nail-the-ale-data` only → Contents: Read and write → longest/no expiration.
- Paste both into the app's Settings on the phone once.

## Verification (end-to-end)

- `node --test` passes.
- Local, in Chrome mobile emulation with your keys entered in the UI (they never pass through me): **Record** a beer photo → cards with correct identity + profile → answer verdict + chips → Save → `nail-the-ale-data` shows a new commit with the answers → it appears in **Data** with predicted→actual → **Ask** with the same photo → "already in your log: 👍" → Ask with a different beer after 3 ratings → prediction badge with a reason → "Add to log" → appears unrated at the top of Data → rate it from detail.
- On iPhone from the home screen: camera opens from both tabs' buttons, the same loop works, and the app opens instantly offline showing the cached Data tab.

## Phase 2 — deferred until there's data, each a small follow-up

Trigger: when you've rated ~10 beers, or whenever you ask for one.

- **Taste profile** screen ("you like hoppy, avoid roasty") — one Gemini call over the rated history. Meaningless before ~10 ratings. ~1 hour.
- **Text search** in Data — when the list is long enough that scrolling annoys. ~30 min.
- **Reorder questions** in the editor — cosmetic. ~30 min.
- Multi-device conflict handling beyond GET-then-PUT — only if you start using a second device.

## Known edges (and what's done about them)

- Model id `gemini-2.5-flash` may be superseded → it's a setting with a Test button.
- Fine-grained GitHub tokens may cap at 1-year expiry → one re-paste a year; data is never at risk.
- Safari can evict a *tab* site's localStorage after 7 idle days → use the home-screen icon (persistent storage); worst case is re-pasting the two keys.
- Gemini may fill in ABV from memory when the label doesn't show it → every field is editable on every card.
- Integration risks (GitHub I/O, Gemini with a real photo) are steps 2–3, before any UI, so they surface in the first hour.
