// Brain implementation: the browser calls the model providers directly with the
// user's own keys. Gemini first (retry on busy, walk sibling Flash models), then
// Mistral if a key is set. Implements the contract in ./interface.js.
//
// A hosted version (brain/proxy.js) would implement the same `askJson` by calling a
// small server that holds one key and meters per-user usage.

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
export async function askJson(settings, req, { signal, model, fallback = true, retry = true } = {}) {
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
