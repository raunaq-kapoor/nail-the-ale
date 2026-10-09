import { isRated } from "./ai.js";
import { scoreOf } from "./scale.js";

// Data tab search: every word in the query must appear in the beer's name, brewery, style, or descriptors.
export function filterBeers(beers, query) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return beers;
  return beers.filter((b) => {
    const hay = [b.name, b.brewery, b.country, b.style, ...(b.descriptors ?? [])].join(" ").toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

// Mood result: rated beers already in the log that belong to the recommended style
// family — one contains the other, or they end in the same word (Hazy IPA ~ Double IPA,
// never just "ale"). Best-rated first, at most three.
const lastWord = (s) => s.split(/\s+/).pop();
export function beersInStyle(beers, style) {
  const want = String(style ?? "").trim().toLowerCase();
  if (!want) return [];
  const match = (have) => have && (have.includes(want) || want.includes(have) || (lastWord(have) === lastWord(want) && !["ale", "beer"].includes(lastWord(want))));
  return beers
    .filter((b) => isRated(b) && match(String(b.style ?? "").trim().toLowerCase()))
    .sort((a, b) => scoreOf(b.answers) - scoreOf(a.answers))
    .slice(0, 3);
}
