import { test } from "node:test";
import assert from "node:assert/strict";
import { filterBeers } from "../search.js";

const beers = [
  { id: "1", name: "Hazy Little Thing", brewery: "Sierra Nevada", style: "Hazy IPA", descriptors: ["juicy", "citrus"] },
  { id: "2", name: "Guinness Draught", brewery: "Guinness", style: "Irish Dry Stout", descriptors: ["roasty"] },
  { id: "3", name: "Ol' Dirty Pilly", brewery: "Mascot Brewery", style: "Pilsner" },
];

test("filterBeers matches name, brewery, style and descriptors, case-insensitively", () => {
  assert.deepEqual(filterBeers(beers, "hazy").map((b) => b.id), ["1"]);
  assert.deepEqual(filterBeers(beers, "MASCOT").map((b) => b.id), ["3"]);
  assert.deepEqual(filterBeers(beers, "stout").map((b) => b.id), ["2"]);
  assert.deepEqual(filterBeers(beers, "citrus").map((b) => b.id), ["1"]);
});

test("filterBeers with an empty or whitespace query returns everything", () => {
  assert.equal(filterBeers(beers, "").length, 3);
  assert.equal(filterBeers(beers, "   ").length, 3);
});

test("filterBeers requires every word to match somewhere", () => {
  assert.deepEqual(filterBeers(beers, "sierra ipa").map((b) => b.id), ["1"]);
  assert.deepEqual(filterBeers(beers, "sierra stout"), []);
});
