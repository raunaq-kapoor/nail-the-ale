import { test } from "node:test";
import assert from "node:assert/strict";
import { SCORES, SCORE_MIN, SCORE_MAX, POSITIVE_AT, scoreOf, predictedScore, migrateAnswers, isPositive } from "../scale.js";

test("the scale is 1–10 with a word for every point", () => {
  assert.equal(SCORE_MIN, 1);
  assert.equal(SCORE_MAX, 10);
  for (let n = SCORE_MIN; n <= SCORE_MAX; n++) assert.ok(SCORES[n].word, `word for ${n}`);
  assert.equal(SCORES[1].word, "drain pour");
  assert.equal(SCORES[10].word, "perfect pint");
});

test("scoreOf reads new rows as-is and clamps strays", () => {
  assert.equal(scoreOf({ overall: 8, scale: 10 }), 8);
  assert.equal(scoreOf({ overall: 4, scale: 10 }), 4, "a 4 on the new scale is not a loved legacy beer");
  assert.equal(scoreOf({ overall: 15, scale: 10 }), 10);
  assert.equal(scoreOf({ overall: 0, scale: 10 }), 1);
});

test("scoreOf maps legacy 1–4 rows: 3 / 5 / 7 / 9", () => {
  assert.deepEqual([1, 2, 3, 4].map((n) => scoreOf({ overall: n })), [3, 5, 7, 9]);
});

test("scoreOf is null for unrated or junk rows", () => {
  for (const a of [undefined, null, {}, { overall: null }, { overall: "4" }, { overall: 7 }, { overall: 2.5 }, { scale: 10 }]) {
    assert.equal(scoreOf(a), null, JSON.stringify(a));
  }
});

test("predictedScore follows the same marker rule", () => {
  assert.equal(predictedScore({ verdict: 4 }), 9);
  assert.equal(predictedScore({ verdict: 4, scale: 10 }), 4);
  assert.equal(predictedScore(null), null);
});

test("migrateAnswers converts a legacy row, keeps the original, and is idempotent", () => {
  const once = migrateAnswers({ overall: 3, note: "ok" });
  assert.deepEqual(once, { overall: 7, scale: 10, legacyOverall: 3, note: "ok" });
  assert.deepEqual(migrateAnswers(once), once);
});

test("migrateAnswers leaves new, unrated, and empty rows alone", () => {
  const fresh = { overall: 8, scale: 10 };
  assert.equal(migrateAnswers(fresh), fresh);
  assert.deepEqual(migrateAnswers({}), {});
  assert.deepEqual(migrateAnswers({ note: "x" }), { note: "x" });
});

test("isPositive flips at POSITIVE_AT", () => {
  assert.equal(POSITIVE_AT, 6);
  assert.equal(isPositive(5), false);
  assert.equal(isPositive(6), true);
});
