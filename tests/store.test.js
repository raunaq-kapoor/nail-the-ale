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

function fakeLocalStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

test("settings.get returns defaults when nothing is stored", () => {
  globalThis.localStorage = fakeLocalStorage();
  const s = settings.get();
  assert.equal(s.model, "gemini-2.5-flash");
  assert.equal(s.geminiKey, "");
});

test("settings.set merges into stored settings", () => {
  globalThis.localStorage = fakeLocalStorage();
  settings.set({ geminiKey: "k1" });
  settings.set({ ghOwner: "me" });
  const s = settings.get();
  assert.equal(s.geminiKey, "k1");
  assert.equal(s.ghOwner, "me");
  assert.equal(s.model, "gemini-2.5-flash");
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
