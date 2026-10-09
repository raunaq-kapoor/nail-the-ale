// The fixed rating target: a 1–10 score. New rows carry `answers.scale = 10`; older rows hold
// the retired 1–4 verdict in `overall` with no marker, and are mapped on read (a raw 3 is
// ambiguous across the two scales, so the marker is what tells them apart).
export const SCORE_MIN = 1;
export const SCORE_MAX = 10;
export const POSITIVE_AT = 6;

export const SCORES = {
  1: { word: "drain pour" },
  2: { word: "wouldn't finish" },
  3: { word: "not for me" },
  4: { word: "fine" },
  5: { word: "drinkable" },
  6: { word: "good" },
  7: { word: "very good" },
  8: { word: "excellent" },
  9: { word: "seek it out" },
  10: { word: "perfect pint" },
};

// retired 👎 😐 👍 ❤️ → score
const LEGACY = { 1: 3, 2: 5, 3: 7, 4: 9 };

const clamp = (n) => Math.min(SCORE_MAX, Math.max(SCORE_MIN, n));
const isStep = (n) => Number.isInteger(n);

// A value on either scale → 1–10, or null when there isn't one.
function toScore(value, scale) {
  if (!isStep(value)) return null;
  if (scale === 10) return clamp(value);
  return LEGACY[value] ?? null;
}

export const scoreOf = (answers) => toScore(answers?.overall, answers?.scale);
export const predictedScore = (prediction) => toScore(prediction?.verdict, prediction?.scale);
export const isPositive = (score) => score >= POSITIVE_AT;

// Legacy answers → new-scale answers, keeping the original 1–4 as `legacyOverall`. Idempotent.
export function migrateAnswers(answers) {
  if (answers?.scale === 10 || !(answers?.overall in LEGACY) || !isStep(answers.overall)) return answers;
  const { overall, ...rest } = answers;
  return { overall: LEGACY[overall], scale: 10, legacyOverall: overall, ...rest };
}
