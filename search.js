// Data tab search: every word in the query must appear in the beer's name, brewery, style, or descriptors.
export function filterBeers(beers, query) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return beers;
  return beers.filter((b) => {
    const hay = [b.name, b.brewery, b.style, ...(b.descriptors ?? [])].join(" ").toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}
