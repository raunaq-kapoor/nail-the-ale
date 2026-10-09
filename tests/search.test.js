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

import { beersInStyle } from "../search.js";

const logged = [
  { id: "a", name: "Hazy Little Thing", style: "Hazy IPA", answers: { overall: 3 } },
  { id: "b", name: "Pliny", style: "Double IPA", answers: { overall: 4 } },
  { id: "c", name: "Unrated IPA", style: "West Coast IPA" },
  { id: "d", name: "Guinness", style: "Irish Dry Stout", answers: { overall: 3 } },
  { id: "e", name: "Old Speckled", style: "English Pale Ale", answers: { overall: 2 } },
  { id: "f", name: "No style", answers: { overall: 4 } },
];

test("beersInStyle finds rated beers of the same style family, best-rated first", () => {
  assert.deepEqual(beersInStyle(logged, "Hazy IPA").map((b) => b.id), ["b", "a"]);
  assert.deepEqual(beersInStyle(logged, "stout").map((b) => b.id), ["d"]);
});

test("beersInStyle matches by containment, ignores unrated beers, and never matches on 'ale' alone", () => {
  assert.deepEqual(beersInStyle(logged, "Pale Ale").map((b) => b.id), ["e"]);
  assert.deepEqual(beersInStyle(logged, "Brown Ale"), []);
  assert.deepEqual(beersInStyle(logged, ""), []);
});

test("beersInStyle returns at most three", () => {
  const many = Array.from({ length: 5 }, (_, i) => ({ id: String(i), style: "Pilsner", answers: { overall: 3 } }));
  assert.equal(beersInStyle(many, "Pilsner").length, 3);
});

test("beersInStyle ranks legacy 1–4 rows and new 1–10 rows on one scale", () => {
  const mixed = [
    { id: "old", style: "Pilsner", answers: { overall: 4 } },              // loved → 9
    { id: "new8", style: "Pilsner", answers: { overall: 8, scale: 10 } },
    { id: "new10", style: "Pilsner", answers: { overall: 10, scale: 10 } },
    { id: "new4", style: "Pilsner", answers: { overall: 4, scale: 10 } },  // a 4/10, not a legacy "loved"
  ];
  assert.deepEqual(beersInStyle(mixed, "Pilsner").map((b) => b.id), ["new10", "old", "new8"]);
});
