import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeHistory, buildPrompt, parseResponse, analyzePhotos, pingModel, MIN_RATED_FOR_PREDICTION } from "../ai.js";
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
