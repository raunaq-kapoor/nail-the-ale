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
      return `- ${b.name} (${b.brewery}) · ${b.style}${abv} · ${profileText(b.profile)} · Verdict: ${VERDICTS[overall].word}` +
        (answers.length ? " · " + answers.join(" · ") : "");
    })
    .join("\n");
}

function knownBeersText(beers) {
  return beers.slice(-KNOWN_LIMIT).map((b) => `${b.id} | ${b.name} | ${b.brewery}`).join("\n");
}

const typedText = (t) => [t.name, t.brewery && `by ${t.brewery}`, t.style, t.abv != null && `${t.abv}% ABV`].filter(Boolean).join(" · ");

export function buildPrompt({ beers, questions, photoCount = 0, typed = null, taste = null }) {
  const ratedCount = beers.filter(isRated).length;
  const verdictScale = Object.entries(VERDICTS).map(([n, v]) => `${n}=${v.word}`).join(", ");
  const parts = [
    `You are helping one person remember which beers they like.`,
    typed
      ? `Instead of a photo, they typed this beer: ${typedText(typed)}. Treat it as one identified beer (photoIndex 0). Fill in brewery, style, and abv from what you know if they are missing; for each give: name, brewery, style, abv (number or null), a flavor profile estimated from the style — integers 1–5 for ${PROFILE_AXES.join(", ")} — and 2–4 short descriptor words.`
      : `Attached: ${photoCount} photo(s) of beer cans, bottles, or packaging, taken in a store or at home. Identify every distinct beer visible. For each, give: name, brewery, style, abv (number, or null if not on the label and not known), a flavor profile estimated from the style and any label text — integers 1–5 for ${PROFILE_AXES.join(", ")} — and 2–4 short descriptor words. photoIndex is the 0-based index of the photo the beer appears in.`,
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
  parts.push(`Reply with only JSON: {"beers": [...]}.`);
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
        required: ["name", "brewery", "style", "abv", "profile", "descriptors", "photoIndex", "matchId", "prediction"],
      },
    },
  },
  required: ["beers"],
};

const clamp15 = (n) => Math.min(5, Math.max(1, Math.round(Number(n) || 1)));

export function parseResponse(raw, { knownIds, ratedCount }) {
  if (raw.promptFeedback?.blockReason) throw new Error(`Gemini blocked the request: ${raw.promptFeedback.blockReason}`);
  const text = raw.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("");
  if (!text) throw new Error("Gemini returned no answer");
  const { beers = [] } = JSON.parse(text);
  const canPredict = ratedCount >= MIN_RATED_FOR_PREDICTION;
  return beers.map((b) => ({
    name: String(b.name ?? "").trim() || "Unknown beer",
    brewery: String(b.brewery ?? "").trim(),
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

async function generate(settings, parts, generationConfig, { model = settings.model, signal } = {}) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": settings.geminiKey },
    body: JSON.stringify({ contents: [{ parts }], generationConfig }),
    signal,
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(`Gemini ${res.status}: ${detail.error?.message ?? res.statusText}`);
  }
  return res.json();
}

export async function analyzePhotos({ images, beers, questions, settings, taste = null }) {
  const raw = await generate(settings, [
    ...images.map((img) => ({ inline_data: { mime_type: img.mimeType, data: img.base64 } })),
    { text: buildPrompt({ beers, questions, photoCount: images.length, taste }) },
  ], { responseMimeType: "application/json", responseSchema: RESPONSE_SCHEMA, temperature: 0.2 });
  return parseResponse(raw, {
    knownIds: new Set(beers.map((b) => b.id)),
    ratedCount: beers.filter(isRated).length,
  });
}

// Type-to-add: the typed beer goes through the same prompt and schema as a photo.
export async function analyzeTyped({ typed, beers, questions, settings, taste = null }) {
  const raw = await generate(settings, [{ text: buildPrompt({ beers, questions, typed, taste }) }],
    { responseMimeType: "application/json", responseSchema: RESPONSE_SCHEMA, temperature: 0.2 });
  return parseResponse(raw, {
    knownIds: new Set(beers.map((b) => b.id)),
    ratedCount: beers.filter(isRated).length,
  });
}

// --- type-ahead suggestions: a fast, cheap call on the search model ---

export const SUGGEST_SCHEMA = {
  type: "OBJECT",
  properties: {
    beers: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { name: { type: "STRING" }, brewery: { type: "STRING" }, style: { type: "STRING" }, abv: { type: "NUMBER", nullable: true } },
        required: ["name", "brewery", "style", "abv"],
      },
    },
  },
  required: ["beers"],
};

const SUGGEST_LIMIT = 6;

export async function suggestBeers({ query, settings, signal }) {
  const raw = await generate(settings, [{ text:
    `Someone is typing a beer name into a search box. So far they typed: "${query}". List up to ${SUGGEST_LIMIT} real, commercially sold beers that match — by beer name or brewery, most likely first. Give name, brewery, style, and abv (number or null). Reply with only JSON: {"beers": [...]}.` }],
    { responseMimeType: "application/json", responseSchema: SUGGEST_SCHEMA, temperature: 0.1 },
    { model: settings.searchModel || settings.model, signal });
  const text = raw.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("");
  if (!text) return [];
  const seen = new Set();
  return (JSON.parse(text).beers ?? [])
    .map((b) => ({
      name: String(b.name ?? "").trim(),
      brewery: String(b.brewery ?? "").trim(),
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
  const raw = await generate(settings, [{ text: buildTastePrompt({ beers, questions }) }],
    { responseMimeType: "application/json", responseSchema: TASTE_SCHEMA, temperature: 0.3 });
  const text = raw.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("");
  if (!text) throw new Error("Gemini returned no answer");
  const t = JSON.parse(text);
  return { summary: String(t.summary ?? "").trim(), likes: cleanStrings(t.likes, 6), avoids: cleanStrings(t.avoids, 5) };
}

// Settings "Test key": a real (tiny) generation with the chosen model, so a
// retired model id fails here with Google's message naming its replacement.
export async function pingModel(settings) {
  const raw = await generate(settings, [{ text: "Reply with the single word OK." }], { maxOutputTokens: 5 });
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
