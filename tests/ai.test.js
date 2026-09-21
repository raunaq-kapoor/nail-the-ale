import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeHistory, buildPrompt, parseResponse, analyzePhotos, pingModel, RESPONSE_SCHEMA, MIN_RATED_FOR_PREDICTION } from "../ai.js";
import { DEFAULT_CONFIG } from "../store.js";

const Q = DEFAULT_CONFIG.questions;
const rated = (id, name, overall, extra = {}, ratedAt = "2026-09-01T00:00:00Z") => ({
  id, name, brewery: "Brew Co", style: "IPA", abv: 6.5,
  profile: { bitterness: 4, sweetness: 2, maltiness: 2, hoppiness: 5, fruitiness: 3, roastiness: 1, sourness: 1 },
  answers: { overall, ...extra }, ratedAt, addedAt: ratedAt,
});
const unrated = (id, name) => ({ id, name, brewery: "Brew Co", style: "Lager", answers: {}, addedAt: "2026-09-02T00:00:00Z" });

test("summarizeHistory lists only rated beers with verdict words and question labels", () => {
  const s = summarizeHistory([rated("b1", "Hop Bomb", 4, { stood_out: ["great aroma", "refreshing"], note: "banger" }), unrated("b2", "Plain Lager")], Q);
  assert.match(s, /Hop Bomb/);
  assert.doesNotMatch(s, /Plain Lager/);
  assert.match(s, /Verdict: loved/);
  assert.match(s, /What stood out: great aroma, refreshing/);
  assert.match(s, /Note: banger/);
});

test("summarizeHistory falls back to the question id when a question was deleted from config", () => {
  const s = summarizeHistory([rated("b1", "X", 2, { food: "pizza" })], Q);
  assert.match(s, /food: pizza/);
});

test("summarizeHistory keeps the 80 most recently rated beers, newest first", () => {
  const beers = Array.from({ length: 100 }, (_, i) =>
    rated(`b${i}`, `Beer ${i}`, 3, {}, new Date(Date.UTC(2026, 0, 1 + i)).toISOString()));
  const s = summarizeHistory(beers, Q);
  assert.equal((s.match(/^- /gm) ?? []).length, 80);
  assert.ok(s.indexOf("Beer 99") < s.indexOf("Beer 98"));
  assert.doesNotMatch(s, /Beer 19\b/);
});

test("buildPrompt lists known beers by id for matching", () => {
  const p = buildPrompt({ beers: [unrated("b7", "Plain Lager")], questions: Q, photoCount: 1 });
  assert.match(p, /b7 \| Plain Lager \| Brew Co/);
});

test("buildPrompt asks for null predictions until enough beers are rated", () => {
  const two = [rated("b1", "A", 3), rated("b2", "B", 4)];
  assert.match(buildPrompt({ beers: two, questions: Q, photoCount: 1 }), /prediction.*null/i);
  const three = [...two, rated("b3", "C", 1)];
  const p = buildPrompt({ beers: three, questions: Q, photoCount: 1 });
  assert.match(p, /Verdict: loved/);
  assert.doesNotMatch(p, /set prediction to null/i);
});

test("buildPrompt stays well under the size cap with a large history", () => {
  const beers = Array.from({ length: 300 }, (_, i) => rated(`b${i}`, `Beer ${i}`, 3, { note: "x".repeat(500) }));
  assert.ok(buildPrompt({ beers, questions: Q, photoCount: 4 }).length < 64 * 1024);
});

test("parseResponse normalizes profile, matchId and prediction", () => {
  const raw = { candidates: [{ content: { parts: [{ text: JSON.stringify({ beers: [{
    name: "X", brewery: "Y", style: "Stout", abv: null,
    profile: { bitterness: 9, sweetness: 0, maltiness: 3.7, hoppiness: 2, fruitiness: 1, roastiness: 5, sourness: 1 },
    descriptors: ["roasty"], photoIndex: 0, matchId: "nope",
    prediction: { verdict: 3, confidence: 0.6, reason: "..." },
  }] }) }] } }] };
  const [b] = parseResponse(raw, { knownIds: new Set(["b1"]), ratedCount: 5 });
  assert.deepEqual(b.profile, { bitterness: 5, sweetness: 1, maltiness: 4, hoppiness: 2, fruitiness: 1, roastiness: 5, sourness: 1 });
  assert.equal(b.matchId, null);
  assert.equal(b.abv, null);
  assert.deepEqual(b.prediction, { verdict: 3, confidence: 0.6, reason: "..." });
});

test("parseResponse drops predictions when history is too small, keeps valid matchId", () => {
  const raw = { candidates: [{ content: { parts: [{ text: JSON.stringify({ beers: [{
    name: "X", brewery: "Y", style: "Stout", abv: 5, profile: {}, descriptors: [], photoIndex: 0,
    matchId: "b1", prediction: { verdict: 4, confidence: 0.9, reason: "" },
  }] }) }] } }] };
  const [b] = parseResponse(raw, { knownIds: new Set(["b1"]), ratedCount: MIN_RATED_FOR_PREDICTION - 1 });
  assert.equal(b.matchId, "b1");
  assert.equal(b.prediction, null);
});

test("parseResponse explains a blocked or empty answer", () => {
  assert.throws(() => parseResponse({ candidates: [] }, { knownIds: new Set(), ratedCount: 0 }), /no answer/i);
  assert.throws(() => parseResponse({ promptFeedback: { blockReason: "SAFETY" } }, { knownIds: new Set(), ratedCount: 0 }), /SAFETY/);
});

test("analyzePhotos sends every image inline with the prompt and JSON schema", async () => {
  let captured;
  globalThis.fetch = async (url, init) => {
    captured = { url, body: JSON.parse(init.body), headers: init.headers };
    return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ beers: [] }) }] } }] });
  };
  const result = await analyzePhotos({
    images: [{ base64: "AAA", mimeType: "image/jpeg" }, { base64: "BBB", mimeType: "image/jpeg" }],
    beers: [], questions: Q, settings: { geminiKey: "KEY", model: "gemini-test" },
  });
  assert.deepEqual(result, []);
  assert.match(captured.url, /models\/gemini-test:generateContent/);
  assert.equal(captured.headers["x-goog-api-key"], "KEY");
  const parts = captured.body.contents[0].parts;
  assert.equal(parts.filter((p) => p.inline_data).length, 2);
  assert.equal(parts[0].inline_data.data, "AAA");
  assert.ok(parts.at(-1).text.includes("2 photo"));
  assert.equal(captured.body.generationConfig.responseMimeType, "application/json");
  assert.ok(captured.body.generationConfig.responseSchema.properties.beers);
});

test("pingModel makes a tiny text-only generation call with the chosen model", async () => {
  let captured;
  globalThis.fetch = async (url, init) => {
    captured = { url, body: JSON.parse(init.body), headers: init.headers };
    return Response.json({ candidates: [{ content: { parts: [{ text: "OK" }] } }] });
  };
  const text = await pingModel({ geminiKey: "KEY", model: "gemini-test" });
  assert.equal(text, "OK");
  assert.match(captured.url, /models\/gemini-test:generateContent/);
  assert.equal(captured.headers["x-goog-api-key"], "KEY");
  assert.equal(captured.body.contents[0].parts.length, 1);
  assert.ok(!captured.body.contents[0].parts[0].inline_data);
});

test("pingModel surfaces Google's error message (which names the replacement model)", async () => {
  globalThis.fetch = async () => Response.json({ error: { message: "This model is no longer available. Use models/gemini-9-flash" } }, { status: 404 });
  await assert.rejects(pingModel({ geminiKey: "KEY", model: "old" }), /Gemini 404: .*gemini-9-flash/);
});

// --- taste profile ---
import { buildTastePrompt, summarizeTaste, TASTE_SCHEMA } from "../ai.js";

test("buildTastePrompt includes the rated history and asks for the JSON shape", () => {
  const p = buildTastePrompt({ beers: [rated("b1", "Hop Bomb", 4, { stood_out: ["great aroma"] })], questions: Q });
  assert.match(p, /Hop Bomb/);
  assert.match(p, /Verdict: loved/);
  assert.match(p, /"summary"/);
  assert.match(p, /"likes"/);
  assert.match(p, /"avoids"/);
});

test("buildPrompt includes a saved taste summary as a prior when given", () => {
  const beers = [rated("b1", "A", 3), rated("b2", "B", 4), rated("b3", "C", 1)];
  const taste = { summary: "Loves hoppy, hates roasty.", likes: ["hoppy"], avoids: ["roasty"] };
  assert.match(buildPrompt({ beers, questions: Q, photoCount: 1, taste }), /Loves hoppy, hates roasty/);
  assert.doesNotMatch(buildPrompt({ beers, questions: Q, photoCount: 1 }), /taste profile summary/i);
});

test("summarizeTaste calls Gemini text-only with the taste schema and normalizes the result", async () => {
  let captured;
  globalThis.fetch = async (url, init) => {
    captured = JSON.parse(init.body);
    return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ summary: " S ", likes: ["hoppy", 5, ""], avoids: ["roasty"] }) }] } }] });
  };
  const out = await summarizeTaste({ beers: [rated("b1", "A", 4)], questions: Q, settings: { geminiKey: "K", model: "m" } });
  assert.deepEqual(out, { summary: "S", likes: ["hoppy", "5"], avoids: ["roasty"] });
  assert.equal(captured.contents[0].parts.length, 1);
  assert.deepEqual(captured.generationConfig.responseSchema, TASTE_SCHEMA);
});

test("analyzePhotos passes the saved taste summary into the prompt", async () => {
  let captured;
  globalThis.fetch = async (url, init) => {
    captured = JSON.parse(init.body);
    return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ beers: [] }) }] } }] });
  };
  const beers = [rated("b1", "A", 3), rated("b2", "B", 4), rated("b3", "C", 1)];
  await analyzePhotos({ images: [{ base64: "A", mimeType: "image/jpeg" }], beers, questions: Q, settings: { geminiKey: "K", model: "m" }, taste: { summary: "Hop head." } });
  assert.match(captured.contents[0].parts.at(-1).text, /Hop head\./);
});

// --- type-to-add ---
import { suggestBeers, analyzeTyped, SUGGEST_SCHEMA } from "../ai.js";

test("suggestBeers asks the search model for a short JSON list and normalizes it", async () => {
  let captured;
  globalThis.fetch = async (url, init) => {
    captured = { url, body: JSON.parse(init.body), signal: init.signal };
    return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ beers: [
      { name: " Guinness Draught ", brewery: "Guinness", style: "Stout", abv: 4.2 },
      { name: "Guinness Draught", brewery: "Guinness", style: "Stout", abv: 4.2 },
      { name: "Guinness 0.0", brewery: "Guinness", style: "Stout", abv: "n/a" },
    ] }) }] } }] });
  };
  const ctl = new AbortController();
  const out = await suggestBeers({ query: "guin", settings: { geminiKey: "K", model: "big", searchModel: "lite" }, signal: ctl.signal });
  assert.match(captured.url, /models\/lite:generateContent/);
  assert.equal(captured.signal, ctl.signal);
  assert.match(captured.body.contents[0].parts[0].text, /guin/);
  assert.deepEqual(captured.body.generationConfig.responseSchema, SUGGEST_SCHEMA);
  assert.deepEqual(out, [
    { name: "Guinness Draught", brewery: "Guinness", country: "", style: "Stout", abv: 4.2 },
    { name: "Guinness 0.0", brewery: "Guinness", country: "", style: "Stout", abv: null },
  ]);
});

test("suggestBeers falls back to the main model when no search model is set", async () => {
  let url;
  globalThis.fetch = async (u) => { url = u; return Response.json({ candidates: [{ content: { parts: [{ text: '{"beers":[]}' }] } }] }); };
  await suggestBeers({ query: "abc", settings: { geminiKey: "K", model: "big" } });
  assert.match(url, /models\/big:generateContent/);
});

test("analyzeTyped runs the typed beer through the photo prompt and schema, text-only", async () => {
  let captured;
  globalThis.fetch = async (url, init) => {
    captured = JSON.parse(init.body);
    return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ beers: [{
      name: "Guinness Draught", brewery: "Guinness", style: "Irish Dry Stout", abv: 4.2,
      profile: { bitterness: 3, sweetness: 1, maltiness: 4, hoppiness: 1, fruitiness: 1, roastiness: 5, sourness: 1 },
      descriptors: ["roasty"], photoIndex: 0, matchId: null, prediction: null }] }) }] } }] });
  };
  const beers = [rated("b1", "A", 3), rated("b2", "B", 4), rated("b3", "C", 1)];
  const [b] = await analyzeTyped({ typed: { name: "Guinness Draught", brewery: "Guinness", style: "Stout", abv: 4.2 }, beers, questions: Q, settings: { geminiKey: "K", model: "m" } });
  assert.equal(captured.contents[0].parts.length, 1);
  const text = captured.contents[0].parts[0].text;
  assert.match(text, /typed.*Guinness Draught/i);
  assert.doesNotMatch(text, /Attached: \d+ photo/);
  assert.match(text, /Verdict: loved/);
  assert.deepEqual(captured.generationConfig.responseSchema, RESPONSE_SCHEMA);
  assert.equal(b.style, "Irish Dry Stout");
});

test("suggestBeers falls back to the main model when the search model fails, then sticks with it", async () => {
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(url.match(/models\/([^:]+):/)[1]);
    if (url.includes("/lite:")) return Response.json({ error: { message: "high demand" } }, { status: 503 });
    return Response.json({ candidates: [{ content: { parts: [{ text: '{"beers":[{"name":"X","brewery":"Y","style":"Z","abv":5}]}' }] } }] });
  };
  const settings = { geminiKey: "K", model: "big", searchModel: "lite" };
  const out = await suggestBeers({ query: "abc", settings });
  assert.equal(out.length, 1);
  assert.deepEqual(calls, ["lite", "big"]);
  await suggestBeers({ query: "abcd", settings });
  assert.deepEqual(calls, ["lite", "big", "big"], "second search skips the model that just failed");
});

test("suggestBeers does not fall back on a cancelled request", async () => {
  const calls = [];
  globalThis.fetch = async (url, init) => { calls.push(url); const e = new Error("aborted"); e.name = "AbortError"; throw e; };
  const ctl = new AbortController();
  await assert.rejects(suggestBeers({ query: "abc", settings: { geminiKey: "K", model: "big", searchModel: "lite2" }, signal: ctl.signal }), { name: "AbortError" });
  assert.equal(calls.length, 1);
});

// --- resilience: retry on 503/429, then fall back to sibling models ---
import { RETRY, FALLBACK_MODELS, lastModelUsed } from "../ai.js";

const ok = (beers = []) => Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ beers }) }] } }] });
const busy = () => Response.json({ error: { message: "high demand" } }, { status: 503 });
const modelOf = (url) => url.match(/models\/([^:]+):/)[1];

test("a 503 is retried and succeeds on the same model", async () => {
  RETRY.delaysMs = [0, 0];
  const calls = [];
  globalThis.fetch = async (url) => { calls.push(modelOf(url)); return calls.length < 3 ? busy() : ok([]); };
  await analyzePhotos({ images: [{ base64: "A", mimeType: "image/jpeg" }], beers: [], questions: Q, settings: { geminiKey: "K", model: "main" } });
  assert.deepEqual(calls, ["main", "main", "main"]);
  assert.equal(lastModelUsed(), "main");
});

test("after retries are exhausted the next fallback model is tried, and is remembered", async () => {
  RETRY.delaysMs = [0, 0];
  const calls = [];
  globalThis.fetch = async (url) => { const m = modelOf(url); calls.push(m); return m === "main" ? busy() : ok([]); };
  await analyzePhotos({ images: [{ base64: "A", mimeType: "image/jpeg" }], beers: [], questions: Q, settings: { geminiKey: "K", model: "main" } });
  assert.deepEqual(calls, ["main", "main", "main", FALLBACK_MODELS[0]]);
  assert.equal(lastModelUsed(), FALLBACK_MODELS[0]);
});

test("a 404 (retired model) skips straight to the next model without retrying", async () => {
  RETRY.delaysMs = [0, 0];
  const calls = [];
  globalThis.fetch = async (url) => { const m = modelOf(url); calls.push(m); return m === "old" ? Response.json({ error: { message: "no longer available" } }, { status: 404 }) : ok([]); };
  await analyzePhotos({ images: [{ base64: "A", mimeType: "image/jpeg" }], beers: [], questions: Q, settings: { geminiKey: "K", model: "old" } });
  assert.deepEqual(calls, ["old", FALLBACK_MODELS[0]]);
});

test("a 400 (bad request) is not retried or failed over", async () => {
  RETRY.delaysMs = [0, 0];
  let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({ error: { message: "invalid" } }, { status: 400 }); };
  await assert.rejects(analyzePhotos({ images: [{ base64: "A", mimeType: "image/jpeg" }], beers: [], questions: Q, settings: { geminiKey: "K", model: "main" } }), /Gemini 400/);
  assert.equal(calls, 1);
});

test("when every model is busy the error names the last one tried", async () => {
  RETRY.delaysMs = [0, 0];
  globalThis.fetch = async () => busy();
  await assert.rejects(analyzePhotos({ images: [{ base64: "A", mimeType: "image/jpeg" }], beers: [], questions: Q, settings: { geminiKey: "K", model: "main" } }), /Gemini 503/);
});

test("summarizeHistory includes a year answer under its question label", () => {
  const qs = [...Q, { id: "first_had", label: "When did you first have it?", type: "year" }];
  const s = summarizeHistory([rated("b1", "Hop Bomb", 4, { first_had: 2026 })], qs);
  assert.match(s, /When did you first have it: 2026/);
});

test("pingModel tests exactly the model it is given — no sibling fallback", async () => {
  RETRY.delaysMs = [0, 0];
  const calls = [];
  globalThis.fetch = async (url) => { const m = modelOf(url); calls.push(m); return m === "retired" ? Response.json({ error: { message: "gone" } }, { status: 404 }) : ok([]); };
  await assert.rejects(pingModel({ geminiKey: "K", model: "retired" }), /Gemini 404/);
  assert.deepEqual(calls, ["retired"]);
});

test("pingModel still retries a busy answer on the same model", async () => {
  RETRY.delaysMs = [0, 0];
  let n = 0;
  globalThis.fetch = async () => (++n < 2 ? busy() : Response.json({ candidates: [{ content: { parts: [{ text: "OK" }] } }] }));
  assert.equal(await pingModel({ geminiKey: "K", model: "m" }), "OK");
  assert.equal(n, 2);
});

// --- robustness of reading Gemini's answer ---
test("parseResponse ignores thinking parts and text around the JSON", () => {
  const raw = { candidates: [{ content: { parts: [
    { text: "Let me look at the label…", thought: true },
    { text: "Here you go:\n" + JSON.stringify({ beers: [{ name: "Guinness Draught", brewery: "Guinness", style: "Stout", abv: 4.2, profile: {}, descriptors: [], photoIndex: 0, matchId: null, prediction: null }] }) + "\nDone." },
  ] } }] };
  const [b] = parseResponse(raw, { knownIds: new Set(), ratedCount: 0 });
  assert.equal(b.name, "Guinness Draught");
});

test("parseResponse explains an answer that is not JSON, including a cut-off one", () => {
  const cut = { candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: '{"beers": [{"name": "Guin' }] } }] };
  assert.throws(() => parseResponse(cut, { knownIds: new Set(), ratedCount: 0 }), /cut off/i);
  const junk = { candidates: [{ content: { parts: [{ text: "I cannot see any beer." }] } }] };
  assert.throws(() => parseResponse(junk, { knownIds: new Set(), ratedCount: 0 }), /unexpected format/i);
});

test("a 429 moves to the next model at once instead of retrying the same one", async () => {
  RETRY.delaysMs = [0, 0];
  const calls = [];
  globalThis.fetch = async (url) => { const m = modelOf(url); calls.push(m); return m === "main" ? Response.json({ error: { message: "quota" } }, { status: 429 }) : ok([]); };
  await analyzePhotos({ images: [{ base64: "A", mimeType: "image/jpeg" }], beers: [], questions: Q, settings: { geminiKey: "K", model: "main" } });
  assert.deepEqual(calls, ["main", FALLBACK_MODELS[0]]);
});

// --- network-level failures (Safari: TypeError "Load failed") ---
// Safari reports "Load failed" when a server closes on a big upload early (a 403/429/503 sent
// mid-upload looks identical to a dropped connection), so a network failure gets one retry per
// model and then moves on — another model may answer — before it is called a connection problem.
test("a network failure is retried once per model, then every model is tried, then it is reported as a connection problem", async () => {
  RETRY.delaysMs = [0, 0];
  RETRY.networkDelaysMs = [0];
  const calls = [];
  globalThis.fetch = async (url) => { calls.push(modelOf(url)); throw new TypeError("Load failed"); };
  await assert.rejects(
    analyzePhotos({ images: [{ base64: "A", mimeType: "image/jpeg" }], beers: [], questions: Q, settings: { geminiKey: "K", model: "main" } }),
    (e) => e.network === true && /reach Google/.test(e.message) && /Load failed/.test(e.message) && /tried 5 models/.test(e.message),
  );
  assert.deepEqual(calls, ["main", "main", ...FALLBACK_MODELS.flatMap((m) => [m, m])]);
});

test("a network failure on one model that another model survives still succeeds", async () => {
  RETRY.delaysMs = [0, 0];
  RETRY.networkDelaysMs = [0];
  const calls = [];
  globalThis.fetch = async (url) => { const m = modelOf(url); calls.push(m); if (m === "main") throw new TypeError("Load failed"); return ok([]); };
  await analyzePhotos({ images: [{ base64: "A", mimeType: "image/jpeg" }], beers: [], questions: Q, settings: { geminiKey: "K", model: "main" } });
  assert.deepEqual(calls, ["main", "main", FALLBACK_MODELS[0]]);
});

test("a network blip that recovers on retry succeeds", async () => {
  RETRY.delaysMs = [0, 0];
  RETRY.networkDelaysMs = [0];
  let n = 0;
  globalThis.fetch = async () => { if (++n === 1) throw new TypeError("Load failed"); return ok([]); };
  await analyzePhotos({ images: [{ base64: "A", mimeType: "image/jpeg" }], beers: [], questions: Q, settings: { geminiKey: "K", model: "main" } });
  assert.equal(n, 2);
});

// --- country of origin ---
test("the photo prompt and schema ask for country", () => {
  assert.match(buildPrompt({ beers: [], questions: Q, photoCount: 1 }), /country/i);
  assert.equal(RESPONSE_SCHEMA.properties.beers.items.properties.country.type, "STRING");
  assert.ok(RESPONSE_SCHEMA.properties.beers.items.required.includes("country"));
  assert.equal(SUGGEST_SCHEMA.properties.beers.items.properties.country.type, "STRING");
});

test("parseResponse keeps country and blanks it when missing", () => {
  const mk = (country) => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ beers: [{ name: "X", brewery: "Y", style: "Stout", abv: 4, country, profile: {}, descriptors: [], photoIndex: 0, matchId: null, prediction: null }] }) }] } }] });
  assert.equal(parseResponse(mk(" Ireland "), { knownIds: new Set(), ratedCount: 0 })[0].country, "Ireland");
  assert.equal(parseResponse(mk(null), { knownIds: new Set(), ratedCount: 0 })[0].country, "");
});

test("suggestBeers passes country through", async () => {
  globalThis.fetch = async () => Response.json({ candidates: [{ content: { parts: [{ text: '{"beers":[{"name":"Guinness Draught","brewery":"Guinness","style":"Stout","abv":4.2,"country":"Ireland"}]}' }] } }] });
  const [b] = await suggestBeers({ query: "guin", settings: { geminiKey: "K", model: "m" } });
  assert.equal(b.country, "Ireland");
});

test("summarizeHistory and the typed description include country", () => {
  const beer = { ...rated("b1", "Guinness Draught", 2), brewery: "Guinness", style: "Irish Dry Stout", country: "Ireland" };
  assert.match(summarizeHistory([beer], Q), /Guinness Draught \(Guinness, Ireland\)/);
  const p = buildPrompt({ beers: [], questions: Q, typed: { name: "Guinness Draught", brewery: "Guinness", style: "Stout", abv: 4.2, country: "Ireland" } });
  assert.match(p, /Ireland/);
});
