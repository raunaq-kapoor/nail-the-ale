// One Gemini call for both Record and Ask: identify beers in the photo(s),
// match them against the log, and predict a verdict from the rated history.

import { VERDICTS } from "./verdicts.js";

export const MIN_RATED_FOR_PREDICTION = 3;
const HISTORY_LIMIT = 80;
const KNOWN_LIMIT = 200;
const NOTE_LIMIT = 120;

export const PROFILE_AXES = ["bitterness", "sweetness", "maltiness", "hoppiness", "fruitiness", "roastiness", "sourness"];
const AXIS_SHORT = { bitterness: "bitter", sweetness: "sweet", maltiness: "malty", hoppiness: "hoppy", fruitiness: "fruity", roastiness: "roasty", sourness: "sour" };

export const isRated = (b) => Number.isInteger(b.answers?.overall);

function answerText(value) {
  const s = Array.isArray(value) ? value.join(", ") : String(value ?? "").trim();
  return s.length > NOTE_LIMIT ? s.slice(0, NOTE_LIMIT) + "…" : s;
}

export function summarizeHistory(beers, questions) {
  const labels = Object.fromEntries(questions.map((q) => [q.id, q.label.replace(/[?:\s]+$/, "")]));
  const profileText = (p = {}) => PROFILE_AXES.map((a) => `${AXIS_SHORT[a]} ${p[a] ?? "?"}`).join(" ");
  return beers
    .filter(isRated)
    .sort((a, b) => (b.ratedAt ?? "").localeCompare(a.ratedAt ?? ""))
    .slice(0, HISTORY_LIMIT)
    .map((b) => {
      const { overall, ...rest } = b.answers;
      const answers = Object.entries(rest)
        .filter(([, v]) => answerText(v))
        .map(([id, v]) => `${labels[id] ?? id}: ${answerText(v)}`);
      const abv = b.abv == null ? "" : ` · ${b.abv}%`;
      const origin = [b.brewery, b.country].filter(Boolean).join(", ");
      return `- ${b.name} (${origin}) · ${b.style}${abv} · ${profileText(b.profile)} · Verdict: ${VERDICTS[overall].word}` +
        (answers.length ? " · " + answers.join(" · ") : "");
    })
    .join("\n");
}

function knownBeersText(beers) {
  return beers.slice(-KNOWN_LIMIT).map((b) => `${b.id} | ${b.name} | ${b.brewery}`).join("\n");
}

const typedText = (t) => [t.name, t.brewery && `by ${t.brewery}`, t.country && `from ${t.country}`, t.style, t.abv != null && `${t.abv}% ABV`].filter(Boolean).join(" · ");

export function buildPrompt({ beers, questions, photoCount = 0, typed = null, taste = null }) {
  const ratedCount = beers.filter(isRated).length;
  const verdictScale = Object.entries(VERDICTS).map(([n, v]) => `${n}=${v.word}`).join(", ");
  const parts = [
    `You are helping one person remember which beers they like.`,
    typed
      ? `Instead of a photo, they typed this beer: ${typedText(typed)}. Treat it as one identified beer (photoIndex 0). Fill in brewery, country, style, and abv from what you know if they are missing; for each give: name, brewery, country (where it is brewed, e.g. "Ireland"; null if unknown), style, abv (number or null), a flavor profile estimated from the style — integers 1–5 for ${PROFILE_AXES.join(", ")} — and 2–4 short descriptor words.`
      : `Attached: ${photoCount} photo(s) of beer cans, bottles, or packaging, taken in a store or at home. Identify every distinct beer visible. For each, give: name, brewery, country (where it is brewed, e.g. "Ireland"; null if unknown), style, abv (number, or null if not on the label and not known), a flavor profile estimated from the style and any label text — integers 1–5 for ${PROFILE_AXES.join(", ")} — and 2–4 short descriptor words. photoIndex is the 0-based index of the photo the beer appears in.`,
    `Beers already in the log (id | name | brewery). If a beer in the photo is the same product as one of these, set matchId to its id; otherwise null.\n${knownBeersText(beers) || "(none yet)"}`,
  ];
  if (ratedCount < MIN_RATED_FOR_PREDICTION) {
    parts.push(`Fewer than ${MIN_RATED_FOR_PREDICTION} beers have been rated so far, so set prediction to null for every beer.`);
  } else {
    if (taste?.summary) parts.push(`Their taste profile summary, written earlier from this history: ${taste.summary}`);
    parts.push(
      `The person's rated history, newest first. Verdict scale: ${verdictScale}.\n${summarizeHistory(beers, questions)}`,
      `For each beer in the photo, predict how this person would rate it: prediction = {verdict: 1–4 on the scale above, confidence: 0–1, reason: one short sentence that cites specific beers or patterns from the history}. Base it on style, flavor profile, ABV, and what they said stood out — not on general popularity.`,
    );
  }
  parts.push(`Reply with only JSON of this exact shape: {"beers": [{"name": "", "brewery": "", "country": "", "style": "", "abv": 5.0, "profile": {${PROFILE_AXES.map((a) => `"${a}": 3`).join(", ")}}, "descriptors": ["", ""], "photoIndex": 0, "matchId": null, "prediction": {"verdict": 3, "confidence": 0.7, "reason": ""}}]}. Use null for an unknown abv, an unmatched matchId, or a withheld prediction.`);
  return parts.join("\n\n");
}

export const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    beers: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          brewery: { type: "STRING" },
          country: { type: "STRING", nullable: true },
          style: { type: "STRING" },
          abv: { type: "NUMBER", nullable: true },
          profile: {
            type: "OBJECT",
            properties: Object.fromEntries(PROFILE_AXES.map((a) => [a, { type: "INTEGER" }])),
            required: PROFILE_AXES,
          },
          descriptors: { type: "ARRAY", items: { type: "STRING" } },
          photoIndex: { type: "INTEGER" },
          matchId: { type: "STRING", nullable: true },
          prediction: {
            type: "OBJECT",
            nullable: true,
            properties: {
              verdict: { type: "INTEGER" },
              confidence: { type: "NUMBER" },
              reason: { type: "STRING" },
            },
            required: ["verdict", "confidence", "reason"],
          },
        },
        required: ["name", "brewery", "country", "style", "abv", "profile", "descriptors", "photoIndex", "matchId", "prediction"],
      },
    },
  },
  required: ["beers"],
};

const clamp15 = (n) => Math.min(5, Math.max(1, Math.round(Number(n) || 1)));

// The JSON value out of a Gemini answer: skips thinking parts, tolerates prose
// around the JSON, and says something useful when it isn't JSON at all.
export function jsonFromText(text, who, cutOff = false) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  try {
    if (start < 0 || end < start) throw new Error("no json");
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    if (cutOff) throw new Error(`${who}'s answer was cut off — try fewer beers in one photo`);
    throw new Error(`${who} answered in an unexpected format: "${text.slice(0, 80)}"`);
  }
}

export function answerJson(raw) {
  if (raw.promptFeedback?.blockReason) throw new Error(`Gemini blocked the request: ${raw.promptFeedback.blockReason}`);
  const cand = raw.candidates?.[0];
  const text = (cand?.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? "").join("").trim();
  if (!text) throw new Error("Gemini returned no answer");
  return jsonFromText(text, "Gemini", cand?.finishReason === "MAX_TOKENS");
}

// --- Mistral: the backup provider. OpenAI-style chat with data-URL images, JSON mode. ---

const hasMistral = (settings) => Boolean(settings.mistralKey && settings.mistralModel);

async function callMistral(settings, { text, images = [], temperature = 0.2 }, signal) {
  const content = [
    ...images.map((img) => ({ type: "image_url", image_url: { url: `data:${img.mimeType};base64,${img.base64}` } })),
    { type: "text", text },
  ];
  let res;
  try {
    res = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${settings.mistralKey}` },
      body: JSON.stringify({ model: settings.mistralModel, messages: [{ role: "user", content }], response_format: { type: "json_object" }, temperature }),
      signal,
    });
  } catch (e) {
    if (e.name === "AbortError") throw e;
    const ne = new Error(`Couldn't reach Mistral (${e.message})`);
    ne.network = true;
    throw ne;
  }
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    const e = new Error(`Mistral ${res.status}: ${d.message ?? d.error?.message ?? d.detail?.[0]?.msg ?? res.statusText}`);
    e.status = res.status;
    throw e;
  }
  const j = await res.json();
  const c = j.choices?.[0]?.message?.content ?? "";
  const txt = (typeof c === "string" ? c : c.map((p) => p.text ?? "").join("")).trim();
  if (!txt) throw new Error("Mistral returned no answer");
  return jsonFromText(txt, "Mistral", j.choices?.[0]?.finish_reason === "length");
}

// Settings "Test": can the key list models, and is the chosen one there?
export async function pingMistral(settings) {
  const res = await fetch("https://api.mistral.ai/v1/models", { headers: { Authorization: `Bearer ${settings.mistralKey}` } });
  if (!res.ok) throw new Error(`Mistral ${res.status}`);
  const { data = [] } = await res.json();
  const models = data.map((m) => m.id);
  return { ok: models.includes(settings.mistralModel), models };
}

// One JSON question, whoever can answer it: Google (with its model chain), then Mistral if a key is set.
async function askJson(settings, req, { signal, model, fallback = true, retry = true } = {}) {
  const backup = fallback && hasMistral(settings);
  const parts = [
    ...(req.images ?? []).map((img) => ({ inline_data: { mime_type: img.mimeType, data: img.base64 } })),
    { text: req.text },
  ];
  try {
    const raw = await generate(settings, parts, { responseMimeType: "application/json", responseSchema: req.schema, temperature: req.temperature ?? 0.2 }, { signal, model, fallback, retry, short: backup });
    return answerJson(raw);
  } catch (e) {
    if (!(backup && (e.network || RETRYABLE.has(e.status) || MOVE_ON.has(e.status)))) throw e;
    try {
      const json = await callMistral(settings, req, signal);
      _lastModel = `mistral/${settings.mistralModel}`;
      return json;
    } catch (m) {
      if (m.name === "AbortError") throw m;
      throw new Error(`${e.message.replace(/ \(tried \d+ models\)$/, "")} · then ${m.message}`);
    }
  }
}

export function parseResponse(raw, ctx) {
  return normalizeBeers(answerJson(raw), ctx);
}

export function normalizeBeers({ beers = [] }, { knownIds, ratedCount }) {
  const canPredict = ratedCount >= MIN_RATED_FOR_PREDICTION;
  return beers.map((b) => ({
    name: String(b.name ?? "").trim() || "Unknown beer",
    brewery: String(b.brewery ?? "").trim(),
    country: String(b.country ?? "").trim(),
    style: String(b.style ?? "").trim(),
    abv: b.abv == null || Number.isNaN(Number(b.abv)) ? null : Number(b.abv),
    profile: Object.fromEntries(PROFILE_AXES.map((a) => [a, clamp15(b.profile?.[a])])),
    descriptors: Array.isArray(b.descriptors) ? b.descriptors.map(String).slice(0, 6) : [],
    photoIndex: Number.isInteger(b.photoIndex) ? b.photoIndex : 0,
    matchId: knownIds.has(b.matchId) ? b.matchId : null,
    prediction: canPredict && b.prediction && VERDICTS[b.prediction.verdict]
      ? {
          verdict: b.prediction.verdict,
          confidence: Math.min(1, Math.max(0, Number(b.prediction.confidence) || 0)),
          reason: String(b.prediction.reason ?? ""),
        }
      : null,
  }));
}

// --- calling Gemini, resiliently ---
// Google's free tier answers 503 "high demand" in bursts and retires model ids.
// So: retry busy answers with a short backoff, then fall back through sibling
// Flash models (separate capacity pools), and remember what worked this session.

export const RETRY = { delaysMs: [800, 2000], networkDelaysMs: [800] }; // attempts = delays + 1
export const FALLBACK_MODELS = ["gemini-3.5-flash", "gemini-3.7-flash", "gemini-3.8-flash", "gemini-3.6-flash"];
const RETRYABLE = new Set([503]);      // capacity blip: worth a second try on the same model
const MOVE_ON = new Set([404, 429]);   // retired, or this model's quota is spent: next model

let _lastModel = null;
let _preferredFallback = null; // a fallback that worked: try it first next time
export const lastModelUsed = () => _lastModel;

const sleep = (ms, signal) => new Promise((resolve, reject) => {
  const t = setTimeout(resolve, ms);
  signal?.addEventListener("abort", () => { clearTimeout(t); const e = new Error("aborted"); e.name = "AbortError"; reject(e); }, { once: true });
});

async function callOnce(settings, model, parts, generationConfig, signal) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": settings.geminiKey },
      body: JSON.stringify({ contents: [{ parts }], generationConfig }),
      signal,
    });
  } catch (e) {
    if (e.name === "AbortError") throw e;
    // Safari says "Load failed" for any request that never completed: dropped
    // connection, blocked host, upload cut off. Not a Google answer at all.
    const ne = new Error(`Couldn't reach Google (${e.message}) — check the connection and try again`);
    ne.network = true;
    throw ne;
  }
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    const e = new Error(`Gemini ${res.status}: ${detail.error?.message ?? res.statusText}`);
    e.status = res.status;
    throw e;
  }
  return res.json();
}

async function withRetry(settings, model, parts, generationConfig, signal, delays) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await callOnce(settings, model, parts, generationConfig, signal);
    } catch (e) {
      const schedule = e.network ? (delays.length ? RETRY.networkDelaysMs : []) : RETRYABLE.has(e.status) ? delays : [];
      if (attempt >= schedule.length) throw e;
      await sleep(schedule[attempt], signal);
    }
  }
}

// fallback: walk the sibling models when busy/retired. retry: back off on busy before moving on.
// short: another provider is waiting behind Google, so give Google two models and one retry each.
async function generate(settings, parts, generationConfig, { model = settings.model, signal, fallback = true, retry = true, short = false } = {}) {
  const full = [...new Set([model, _preferredFallback, ...FALLBACK_MODELS].filter(Boolean))];
  const chain = !fallback ? [model] : short ? full.slice(0, 2) : full;
  const delays = !retry ? [] : short ? RETRY.delaysMs.slice(0, 1) : RETRY.delaysMs;
  let lastError;
  for (const m of chain) {
    try {
      const raw = await withRetry(settings, m, parts, generationConfig, signal, delays);
      _lastModel = m;
      if (m !== model) _preferredFallback = m;
      return raw;
    } catch (e) {
      lastError = e;
      if (!(e.network || RETRYABLE.has(e.status) || MOVE_ON.has(e.status))) throw e; // a real error: don't paper over it
    }
  }
  if (lastError.network && chain.length > 1) lastError.message += ` (tried ${chain.length} models)`;
  throw lastError;
}

const beerCtx = (beers) => ({ knownIds: new Set(beers.map((b) => b.id)), ratedCount: beers.filter(isRated).length });

export async function analyzePhotos({ images, beers, questions, settings, taste = null }) {
  const json = await askJson(settings, { text: buildPrompt({ beers, questions, photoCount: images.length, taste }), images, schema: RESPONSE_SCHEMA });
  return normalizeBeers(json, beerCtx(beers));
}

// Type-to-add: the typed beer goes through the same prompt and schema as a photo.
export async function analyzeTyped({ typed, beers, questions, settings, taste = null }) {
  const json = await askJson(settings, { text: buildPrompt({ beers, questions, typed, taste }), schema: RESPONSE_SCHEMA });
  return normalizeBeers(json, beerCtx(beers));
}

// --- type-ahead suggestions: a fast, cheap call on the search model ---

export const SUGGEST_SCHEMA = {
  type: "OBJECT",
  properties: {
    beers: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { name: { type: "STRING" }, brewery: { type: "STRING" }, country: { type: "STRING", nullable: true }, style: { type: "STRING" }, abv: { type: "NUMBER", nullable: true } },
        required: ["name", "brewery", "country", "style", "abv"],
      },
    },
  },
  required: ["beers"],
};

const SUGGEST_LIMIT = 6;
const failedSearchModels = new Set(); // a search model that errored is skipped for the rest of the session

export async function suggestBeers({ query, settings, signal }) {
  const parts = [{ text:
    `Someone is typing a beer name into a search box. So far they typed: "${query}". List up to ${SUGGEST_LIMIT} real, commercially sold beers that match — by beer name or brewery, most likely first. Give name, brewery, country (where it is brewed), style, and abv (number or null). Reply with only JSON: {"beers": [...]}.` }];
  const config = { responseMimeType: "application/json", responseSchema: SUGGEST_SCHEMA, temperature: 0.1 };
  const fast = settings.searchModel;
  let json;
  if (fast && fast !== settings.model && !failedSearchModels.has(fast)) {
    try {
      json = answerJson(await generate(settings, parts, config, { model: fast, signal, fallback: false, retry: false }));
    } catch (e) {
      if (e.name === "AbortError") throw e;
      failedSearchModels.add(fast); // e.g. 503 "high demand": use the main model from here on
    }
  }
  if (!json) json = await askJson(settings, { text: parts[0].text, schema: SUGGEST_SCHEMA, temperature: 0.1 }, { model: settings.model, signal });
  const seen = new Set();
  return (json.beers ?? [])
    .map((b) => ({
      name: String(b.name ?? "").trim(),
      brewery: String(b.brewery ?? "").trim(),
      country: String(b.country ?? "").trim(),
      style: String(b.style ?? "").trim(),
      abv: b.abv == null || Number.isNaN(Number(b.abv)) ? null : Number(b.abv),
    }))
    .filter((b) => b.name && !seen.has(b.name.toLowerCase() + "|" + b.brewery.toLowerCase()) && seen.add(b.name.toLowerCase() + "|" + b.brewery.toLowerCase()))
    .slice(0, SUGGEST_LIMIT);
}

// --- taste profile: one call over the rated history ---

export const TASTE_SCHEMA = {
  type: "OBJECT",
  properties: {
    summary: { type: "STRING" },
    likes: { type: "ARRAY", items: { type: "STRING" } },
    avoids: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: ["summary", "likes", "avoids"],
};

export function buildTastePrompt({ beers, questions }) {
  const verdictScale = Object.entries(VERDICTS).map(([n, v]) => `${n}=${v.word}`).join(", ");
  return [
    `Below is one person's rated beer history, newest first. Verdict scale: ${verdictScale}. Flavor axes are 1–5.`,
    summarizeHistory(beers, questions),
    `Describe their taste so it helps them choose in a store. Be concrete and cite patterns in the data (styles, hoppiness, roast, ABV, what they said stood out), not generalities. If the history is small, say what is tentative.`,
    `Reply with only JSON: {"summary": 2–3 sentences addressed to them as "you", "likes": 3–6 short traits (e.g. "hoppy", "citrusy", "under 6%"), "avoids": 2–5 short traits}.`,
  ].join("\n\n");
}

const cleanStrings = (arr, max) => (Array.isArray(arr) ? arr.map((x) => String(x).trim()).filter(Boolean).slice(0, max) : []);

export async function summarizeTaste({ beers, questions, settings }) {
  const t = await askJson(settings, { text: buildTastePrompt({ beers, questions }), schema: TASTE_SCHEMA, temperature: 0.3 });
  return { summary: String(t.summary ?? "").trim(), likes: cleanStrings(t.likes, 6), avoids: cleanStrings(t.avoids, 5) };
}

// Settings "Test key": a real (tiny) generation with the chosen model, so a
// retired model id fails here with Google's message naming its replacement.
export async function pingModel(settings) {
  const raw = await generate(settings, [{ text: "Reply with the single word OK." }], { maxOutputTokens: 5 }, { fallback: false });
  return raw.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim() ?? "";
}

// Model ids the key can see, for the hint when the chosen one fails.
export async function listModels(settings) {
  const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=50", {
    headers: { "x-goog-api-key": settings.geminiKey },
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}`);
  const { models = [] } = await res.json();
  return models.map((m) => m.name.replace(/^models\//, ""));
}
