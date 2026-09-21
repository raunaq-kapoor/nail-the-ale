import { test } from "node:test";
import assert from "node:assert/strict";
import { utf8ToBase64, base64ToUtf8 } from "../store.js";

test("base64 round-trips emoji and non-ASCII text", () => {
  const s = '{"overall":"❤️","note":"zażółć 🍺"}';
  assert.equal(base64ToUtf8(utf8ToBase64(s)), s);
});

test("base64ToUtf8 tolerates the newlines GitHub inserts", () => {
  const b64 = utf8ToBase64("hello world");
  const wrapped = b64.slice(0, 4) + "\n" + b64.slice(4) + "\n";
  assert.equal(base64ToUtf8(wrapped), "hello world");
});

// --- settings & cache live in localStorage; give node a minimal one ---
import { settings, cache, newBeerId } from "../store.js";

import { fakeLocalStorage, fakeGitHub } from "./helpers.js";

test("settings.get returns defaults when nothing is stored", () => {
  globalThis.localStorage = fakeLocalStorage();
  const s = settings.get();
  assert.equal(s.model, "gemini-3.6-flash");
  assert.equal(s.geminiKey, "");
});

test("settings.set merges into stored settings", () => {
  globalThis.localStorage = fakeLocalStorage();
  settings.set({ geminiKey: "k1" });
  settings.set({ ghOwner: "me" });
  const s = settings.get();
  assert.equal(s.geminiKey, "k1");
  assert.equal(s.ghOwner, "me");
  assert.equal(s.model, "gemini-3.6-flash");
});

test("cache round-trips JSON values and returns null for misses", () => {
  globalThis.localStorage = fakeLocalStorage();
  assert.equal(cache.get("beers"), null);
  cache.set("beers", { beers: [{ id: "b1", answers: { overall: 4 } }] });
  assert.deepEqual(cache.get("beers"), { beers: [{ id: "b1", answers: { overall: 4 } }] });
});

test("newBeerId is date-prefixed and unique", () => {
  const a = newBeerId(new Date("2026-09-20T10:00:00Z"));
  const b = newBeerId(new Date("2026-09-20T10:00:00Z"));
  assert.match(a, /^b_20260920_[a-z0-9]{4}$/);
  assert.notEqual(a, b);
});

// --- GitHub I/O against the fake Contents API ---
import { loadAll, upsertBeers, deleteBeer, saveConfig, putPhoto, getPhoto, DEFAULT_CONFIG } from "../store.js";

function freshRepo() {
  globalThis.localStorage = fakeLocalStorage();
  const gh = fakeGitHub();
  globalThis.fetch = gh.fetch;
  settings.set({ ghOwner: "me", ghRepo: "data", ghToken: "t" });
  return gh;
}
const beer = (id, name, extra = {}) => ({ id, name, answers: {}, ...extra });

test("loadAll on an empty repo returns no beers and the default questions", async () => {
  freshRepo();
  const { beers, config, fromCache } = await loadAll();
  assert.deepEqual(beers, []);
  assert.deepEqual(config, DEFAULT_CONFIG);
  assert.equal(fromCache, false);
});

test("upsertBeers adds new beers and replaces existing ones by id", async () => {
  freshRepo();
  await upsertBeers([beer("b1", "One")]);
  await upsertBeers([beer("b1", "One edited"), beer("b2", "Two")]);
  const { beers } = await loadAll();
  assert.deepEqual(beers.map((b) => b.name), ["One edited", "Two"]);
});

test("upsertBeers keeps changes made to beers.json outside the app (GET-then-PUT)", async () => {
  const gh = freshRepo();
  await upsertBeers([beer("b1", "One")]);
  // simulate an edit pushed from the Mac
  gh.files.set("beers.json", {
    content: utf8ToBase64(JSON.stringify({ beers: [beer("b1", "One"), beer("mac", "From Mac")] })),
    sha: "mac-sha",
  });
  await upsertBeers([beer("b2", "Two")]);
  const { beers } = await loadAll();
  assert.deepEqual(beers.map((b) => b.id), ["b1", "mac", "b2"]);
});

test("deleteBeer removes a beer by id", async () => {
  freshRepo();
  await upsertBeers([beer("b1", "One"), beer("b2", "Two")]);
  await deleteBeer("b1");
  const { beers } = await loadAll();
  assert.deepEqual(beers.map((b) => b.id), ["b2"]);
});

test("saveConfig persists the questions", async () => {
  freshRepo();
  const config = { questions: [{ id: "q1", label: "Food?", type: "text" }] };
  await saveConfig(config);
  assert.deepEqual((await loadAll()).config, config);
});

test("loadAll falls back to the cached copy when GitHub is unreachable", async () => {
  freshRepo();
  await upsertBeers([beer("b1", "One")]);
  await loadAll();
  globalThis.fetch = async () => { throw new TypeError("offline"); };
  const { beers, fromCache } = await loadAll();
  assert.deepEqual(beers.map((b) => b.id), ["b1"]);
  assert.equal(fromCache, true);
});

test("loadAll rethrows when unreachable and nothing is cached", async () => {
  freshRepo();
  globalThis.fetch = async () => { throw new TypeError("offline"); };
  await assert.rejects(loadAll(), /offline/);
});

test("putPhoto stores a jpeg under photos/ and getPhoto returns a data URL", async () => {
  const gh = freshRepo();
  const path = await putPhoto("b1", "/9j/AAAA");
  assert.equal(path, "photos/b1.jpg");
  assert.ok(gh.files.has("photos/b1.jpg"));
  assert.equal(await getPhoto(path), "data:image/jpeg;base64,/9j/AAAA");
});

test("getPhoto returns null for a missing photo", async () => {
  freshRepo();
  assert.equal(await getPhoto("photos/nope.jpg"), null);
});

// --- checkRepo: the real "Test connection" ---
import { checkRepo } from "../store.js";

function repoFetch(status, body) {
  return async (url) => /\/repos\/[^/]+\/[^/]+$/.test(url) ? new Response(JSON.stringify(body), { status }) : new Response("{}", { status: 404 });
}

test("checkRepo reports write access from the repo's permissions", async () => {
  globalThis.localStorage = fakeLocalStorage();
  settings.set({ ghOwner: "me", ghRepo: "data", ghToken: "t" });
  globalThis.fetch = repoFetch(200, { private: true, permissions: { push: true, pull: true } });
  assert.deepEqual(await checkRepo(), { canWrite: true });
  globalThis.fetch = repoFetch(200, { private: true, permissions: { push: false, pull: true } });
  assert.deepEqual(await checkRepo(), { canWrite: false });
});

test("checkRepo explains a 404 as no access rather than a missing file", async () => {
  globalThis.localStorage = fakeLocalStorage();
  settings.set({ ghOwner: "me", ghRepo: "data", ghToken: "t" });
  globalThis.fetch = repoFetch(404, {});
  await assert.rejects(checkRepo(), /can't see me\/data/);
});

test("checkRepo explains a bad token", async () => {
  globalThis.localStorage = fakeLocalStorage();
  settings.set({ ghOwner: "me", ghRepo: "data", ghToken: "t" });
  globalThis.fetch = repoFetch(401, {});
  await assert.rejects(checkRepo(), /token was rejected/i);
});

// --- taste.json ---
import { saveTaste } from "../store.js";

test("loadAll returns taste null when taste.json is missing, and the saved taste afterwards", async () => {
  freshRepo();
  assert.equal((await loadAll()).taste, null);
  const taste = { summary: "Hoppy person", likes: ["hoppy"], avoids: [], ratedCount: 3, generatedAt: "2026-09-21T00:00:00Z" };
  await saveTaste(taste);
  assert.deepEqual((await loadAll()).taste, taste);
});

test("loadAll's cache fallback includes taste", async () => {
  freshRepo();
  await saveTaste({ summary: "x", likes: [], avoids: [], ratedCount: 3, generatedAt: "t" });
  await loadAll();
  globalThis.fetch = async () => { throw new TypeError("offline"); };
  assert.equal((await loadAll()).taste.summary, "x");
});

test("settings default the search model to a Flash-Lite id", () => {
  globalThis.localStorage = fakeLocalStorage();
  assert.equal(settings.get().searchModel, "gemini-3.5-flash-lite");
});

test("default questions include a first-had year question", () => {
  const q = DEFAULT_CONFIG.questions.find((q) => q.type === "year");
  assert.ok(q, "no year question in defaults");
  assert.equal(q.id, "first_had");
});

test("default 'What stood out?' chips include cheap", () => {
  const q = DEFAULT_CONFIG.questions.find((q) => q.id === "stood_out");
  assert.ok(q.options.includes("cheap"));
});

test("settings carry an optional Mistral backup with a sensible default model", () => {
  globalThis.localStorage = fakeLocalStorage();
  assert.equal(settings.get().mistralKey, "");
  assert.equal(settings.get().mistralModel, "pixtral-large-latest");
});

// --- onboarding: the owner comes from the token ---
import { whoAmI } from "../store.js";

test("whoAmI returns the GitHub login for a token", async () => {
  let headers;
  globalThis.fetch = async (url, init) => { headers = init.headers; return /\/user$/.test(url) ? Response.json({ login: "raunaq-kapoor" }) : new Response("{}", { status: 404 }); };
  assert.equal(await whoAmI("tok"), "raunaq-kapoor");
  assert.equal(headers.Authorization, "Bearer tok");
});

test("whoAmI explains a rejected token", async () => {
  globalThis.fetch = async () => new Response("{}", { status: 401 });
  await assert.rejects(whoAmI("bad"), /rejected/i);
});
