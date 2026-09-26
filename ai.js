// One Gemini call for both Record and Ask: identify beers in the photo(s),
// match them against the log, and predict a verdict from the rated history.

import { VERDICTS } from "./verdicts.js";
import * as brain from "./brain/direct.js"; // later: pick by settings.get().brain

// Transport lives in brain/; re-exported so callers and tests keep one import.
export const { askJson, answerJson, jsonFromText, pingModel, pingMistral, listModels, lastModelUsed, RETRY, FALLBACK_MODELS } = brain;

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
  const fast = settings.searchModel;
  let json;
  if (fast && fast !== settings.model && !failedSearchModels.has(fast)) {
    try {
      json = await askJson(settings, { text: parts[0].text, schema: SUGGEST_SCHEMA, temperature: 0.1 }, { model: fast, signal, fallback: false, retry: false });
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

// --- backfill: country for beers recorded before the field existed (one text-only call) ---

const COUNTRIES_SCHEMA = {
  type: "OBJECT",
  properties: { countries: { type: "ARRAY", items: { type: "OBJECT", properties: { id: { type: "STRING" }, country: { type: "STRING", nullable: true } }, required: ["id", "country"] } } },
  required: ["countries"],
};

export async function countriesFor(beers, settings) {
  const missing = beers.filter((b) => !b.country);
  if (!missing.length) return {};
  const json = await askJson(settings, {
    text: `For each beer below give the country where it is brewed (e.g. "Ireland", "USA", "Germany"), or null if you don't know. One line per beer: id | name | brewery.\n${missing.map((b) => `${b.id} | ${b.name} | ${b.brewery}`).join("\n")}\n\nReply with only JSON: {"countries": [{"id": "", "country": ""}]}.`,
    schema: COUNTRIES_SCHEMA,
    temperature: 0.1,
  });
  const ids = new Set(missing.map((b) => b.id));
  const out = {};
  for (const c of json.countries ?? []) {
    const country = String(c.country ?? "").trim();
    if (ids.has(c.id) && country) out[c.id] = country;
  }
  return out;
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

// --- mood matcher: an adaptive multiple-choice quiz, one call per question ---

export const MOOD_MIN_QUESTIONS = 3;
export const MOOD_MAX_QUESTIONS = 5;
const MOOD_OPTIONS_LIMIT = 4;

export const MOOD_SCHEMA = {
  type: "OBJECT",
  properties: {
    done: { type: "BOOLEAN" },
    question: { type: "OBJECT", nullable: true, properties: {
      text: { type: "STRING" },
      options: { type: "ARRAY", items: { type: "STRING" } },
    }, required: ["text", "options"] },
    result: { type: "OBJECT", nullable: true, properties: {
      style: { type: "STRING" },
      abvMin: { type: "NUMBER" },
      abvMax: { type: "NUMBER" },
      notes: { type: "STRING" },
      pairing: { type: "STRING" },
    }, required: ["style", "abvMin", "abvMax", "notes", "pairing"] },
  },
  required: ["done"],
};

export function buildMoodPrompt({ history = [], taste = null }) {
  const parts = [
    `Someone wants a beer recommendation based on how they feel right now, not a specific beer they already have in mind. Ask short multiple-choice questions (one at a time) about their mood, energy, and what they're in the mood for, then recommend a beer style.`,
  ];
  if (taste?.summary) parts.push(`Their general taste profile, from past ratings: ${taste.summary}`);
  if (history.length) parts.push(`So far they've answered:\n` + history.map((h) => `${h.question}: ${h.answer}`).join("\n"));
  if (history.length < MOOD_MIN_QUESTIONS) {
    parts.push(`Ask another short question. Do not set done to true yet — at least ${MOOD_MIN_QUESTIONS} questions must be asked before a recommendation.`);
  } else if (history.length >= MOOD_MAX_QUESTIONS) {
    parts.push(`This is the final turn. Do not ask another question — set done to true and give your recommendation now.`);
  } else {
    parts.push(`Ask another short question if it would meaningfully sharpen the recommendation, otherwise set done to true and give your recommendation now.`);
  }
  parts.push(
    `A question has short text and ${MOOD_OPTIONS_LIMIT} tap-able options (2-4 words each). A recommendation has: style (a real, recognizable beer style), abvMin and abvMax (a realistic ABV% range for that style), notes (one short sentence on flavor/serving), pairing (one short food pairing).`,
    `Reply with only JSON of this shape: {"done": false, "question": {"text": "", "options": ["", "", "", ""]}, "result": null} or {"done": true, "question": null, "result": {"style": "", "abvMin": 5, "abvMax": 6, "notes": "", "pairing": ""}}.`,
  );
  return parts.join("\n\n");
}

export async function moodStep({ history = [], taste = null, settings }) {
  const json = await askJson(settings, { text: buildMoodPrompt({ history, taste }), schema: MOOD_SCHEMA, temperature: 0.4 });
  if (json.done) {
    const r = json.result ?? {};
    return { done: true, result: {
      style: String(r.style ?? "").trim(),
      abvMin: Number(r.abvMin) || 0,
      abvMax: Number(r.abvMax) || 0,
      notes: String(r.notes ?? "").trim(),
      pairing: String(r.pairing ?? "").trim(),
    } };
  }
  const q = json.question ?? {};
  return { done: false, question: {
    text: String(q.text ?? "").trim(),
    options: cleanStrings(q.options, MOOD_OPTIONS_LIMIT),
  } };
}

