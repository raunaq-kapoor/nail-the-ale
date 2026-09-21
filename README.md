# Nail the Ale

Personal beer memory for your phone. Photograph beers → the app reads the labels, logs what you had, asks how you liked it, and — once it has a few ratings — tells you from a photo whether you'll like a beer before you buy it.

Static PWA, no backend, $0:

- **Vision + predictions:** Gemini Flash (free tier), called straight from the phone. Optional backup: a free Mistral key (Experiment plan) takes over when every Google model says "high demand".
- **Storage:** a private GitHub repo (`beers.json`, `config.json`, `photos/`). Every save is a commit.
- **Hosting:** GitHub Pages.

Three tabs: **Record** (I had this), **Ask** (will I like this?) — both take a photo *or* a typed name (your own log matches instantly, Gemini suggests real beers as you type) — **Data** (everything logged, searchable, with a **Your taste** card you can build once you've rated 3 beers — it's saved as `taste.json` and fed back into Ask as a prior). ⚙︎ holds the two keys and the editable, reorderable rating questions.

## One-time setup

1. **Gemini key** — [Google AI Studio](https://aistudio.google.com/apikey) → Create API key. Then in [Google Cloud console → Credentials](https://console.cloud.google.com/apis/credentials) edit the key → *Application restrictions: Websites* → add `https://<your-github-user>.github.io/*`. The key only works from your app's domain after that.
2. **GitHub token** — [Fine-grained tokens](https://github.com/settings/personal-access-tokens/new) → *Repository access: Only select repositories → `nail-the-ale-data`* → *Permissions → Contents: Read and write* → longest expiration offered. Copy it.
3. **On your iPhone** — open `https://<your-github-user>.github.io/nail-the-ale/` in Safari → Share → **Add to Home Screen**. Open it from the icon (not a Safari tab — Safari can evict a tab-site's storage after a week; the home-screen app keeps it).
4. Tap ⚙︎, paste the key and token, set *Owner* to your GitHub user, **Test key** / **Test connection**, **Save settings**.
5. *(Optional, recommended)* [console.mistral.ai](https://console.mistral.ai) → Experiment plan (free, phone verification) → API keys → paste into ⚙︎ → **Test Mistral**. Google's free tier saturates at peak hours; this keeps scans working.

That's it. Your log lives in `nail-the-ale-data`; open `beers.json` there any time.

## Rating questions

The 👎 😐 👍 ❤️ verdict is always asked. Everything else is editable in ⚙︎ → *Rating questions* (pick-many chips, pick-one, or free text) or by editing `config.json` in the data repo. Adding or removing questions never breaks old records.

## Development

```
python3 -m http.server 8765          # then open http://127.0.0.1:8765/index.html
node --test                          # pure-function tests (prompt, parsing, store)
```

`index.html?mock=1` swaps GitHub and Gemini for in-memory fakes so the whole UI can be tried without keys (nothing persists across reloads in mock mode).

## Files

| File | Role |
|---|---|
| `app.js` | tabs, flows, Data list, detail, settings |
| `card.js` | the beer card used by Record / Ask / detail |
| `ai.js` | Gemini prompt, JSON schema, response normalisation |
| `store.js` | settings, GitHub Contents API (GET-then-PUT), cache, photos, taste |
| `search.js` | Data tab + type-ahead filter over your own log |
| `image.js` | on-device resize before upload |
| `sw.js`, `manifest.json`, `icons/` | PWA shell |

Design notes: `docs/superpowers/specs/2026-09-20-nail-the-ale-design.md`.
