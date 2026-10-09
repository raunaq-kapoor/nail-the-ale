// One beer as a label-style card. Used by Record (rate now), Ask (prediction), and Detail (edit).

import { SCORES, SCORE_MIN, SCORE_MAX, scoreOf, predictedScore, isPositive } from "./scale.js";
import { PROFILE_AXES, MIN_RATED_FOR_PREDICTION } from "./ai.js";

const AXIS_LABEL = { bitterness: "bitter", sweetness: "sweet", maltiness: "malty", hoppiness: "hoppy", fruitiness: "fruity", roastiness: "roasty", sourness: "sour" };

const el = (tag, attrs = {}, children = []) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") n.className = v;
    else if (k === "text") n.textContent = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined && v !== false) n.setAttribute(k, v === true ? "" : v);
  }
  for (const c of [children].flat()) if (c) n.append(c);
  return n;
};

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "");

// A bottle cap stamped with the score — the badge in lists and notices.
export function capEl(score, { small = false, on = false } = {}) {
  return el("span", { class: `cap${small ? " sm" : ""}${on ? " on" : ""}`, text: String(score) });
}

// A photo if there is one, otherwise a bottle cap with the beer's initial.
export function thumbEl(src, name, cls) {
  if (src) return el("img", { class: cls, src, alt: "" });
  return el("span", { class: "thumb-cap", "aria-hidden": "true", text: (name ?? "?").trim().charAt(0).toUpperCase() || "?" });
}

// An input that is as wide as its text, so "Guinness · Ireland" reads as one line.
function fitted(input, placeholder) {
  const fit = () => { input.size = Math.max(2, (input.value || placeholder).length); };
  input.addEventListener("input", fit);
  fit();
  return input;
}

function identity(beer, editable) {
  const input = (cls, field, value, placeholder, extra = {}) =>
    el("input", { class: cls, "data-field": field, value: value ?? "", placeholder, readonly: !editable, ...extra });
  return el("div", { class: "card-identity" }, [
    input("f-name", "name", beer.name, "Beer name"),
    el("div", { class: "card-origin" }, [
      fitted(input("f-brewery", "brewery", beer.brewery, "Brewery"), "Brewery"),
      el("span", { class: "origin-dot", text: "·" }),
      fitted(input("f-country", "country", beer.country, "Country"), "Country"),
    ]),
    el("div", { class: "card-meta" }, [
      input("f-style", "style", beer.style, "Style"),
      el("span", { class: "abv" }, [
        el("input", { "data-field": "abv", value: beer.abv ?? "", placeholder: "?", inputmode: "decimal", readonly: !editable }),
        el("span", { text: "% ABV" }),
      ]),
    ]),
  ]);
}

function profile(p = {}) {
  return el("div", { class: "profile" }, PROFILE_AXES.map((a) =>
    el("div", { class: "axis" }, [
      el("div", { class: "axis-bar", style: `--v:${p[a] ?? 0}` }, el("i")),
      el("span", { text: AXIS_LABEL[a] }),
    ])));
}

function notice(kind, cap, title, body) {
  return el("div", { class: `notice ${kind}` }, [cap, el("div", {}, [el("b", { text: title }), body ? el("span", { text: body }) : null])]);
}

// What the card says above the questions, depending on mode and what we know.
function statusNotice(beer, { mode, matched, ratedCount }) {
  if (matched) {
    const v = scoreOf(matched.answers);
    if (v) return notice(isPositive(v) ? "good" : "bad", capEl(v), `You've had this — ${v}/${SCORE_MAX} on ${fmtDate(matched.ratedAt)}`, mode === "record" ? "Tick the box below to update your rating." : null);
    return notice("plain", el("span", { class: "cap sm", text: "·" }), "Already in your log, not rated yet", null);
  }
  if (mode !== "ask") return null;
  if (beer.prediction) {
    const { confidence, reason } = beer.prediction;
    const score = predictedScore(beer.prediction);
    return notice(isPositive(score) ? "good" : "bad", capEl(score), `Probably ${score}/${SCORE_MAX} · ${Math.round(confidence * 100)}% sure`, reason);
  }
  const left = Math.max(0, MIN_RATED_FOR_PREDICTION - ratedCount);
  return notice("plain", el("span", { class: "cap sm", text: "?" }), `Rate ${left} more beer${left === 1 ? "" : "s"} to unlock predictions`, `${ratedCount} of ${MIN_RATED_FOR_PREDICTION} rated`);
}

// The score: a wedge that gets deeper left to right (a bigger pour), with a bottle cap for the
// handle. A real range input sits invisibly on top, so keys, Home/End and VoiceOver just work.
// `current` is null for an unrated beer: the cap is dashed and nothing is filled until the first touch.
const WEDGE = "M0 26 L100 6 L100 32 L0 32 Z";
const svg = (cls, children) => {
  const root = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  root.setAttribute("class", cls);
  root.setAttribute("viewBox", "0 0 100 32");
  root.setAttribute("preserveAspectRatio", "none");
  root.setAttribute("aria-hidden", "true");
  root.innerHTML = children;
  return root;
};

function scorePicker(current) {
  const range = el("input", { type: "range", min: SCORE_MIN, max: SCORE_MAX, step: 1, "aria-label": "Score" });
  const cap = el("span", { class: "score-cap", "aria-hidden": "true" });
  const word = el("span", { class: "score-word" });
  const box = el("div", { class: "score" }, [
    svg("score-track", `<path d="${WEDGE}"/>`),
    svg("score-fill", `<path d="${WEDGE}"/><path class="foam" d="M0 26 L100 6"/>`),
    range, cap,
    el("div", { class: "score-notches", "aria-hidden": "true" }, Array.from({ length: SCORE_MAX }, () => el("i"))),
    el("div", { class: "score-ends", "aria-hidden": "true" }, [el("span", { text: String(SCORE_MIN) }), el("span", { text: String(SCORE_MAX) })]),
  ]);
  const paint = (set) => {
    const v = Number(range.value);
    box.dataset.set = set ? "1" : "0";
    box.style.setProperty("--t", (v - SCORE_MIN) / (SCORE_MAX - SCORE_MIN));
    box.classList.toggle("high", set && v >= SCORE_MAX - 1);
    cap.textContent = set ? String(v) : "–";
    word.textContent = set ? SCORES[v].word : "Drag to score";
    range.setAttribute("aria-valuetext", set ? `${v}, ${SCORES[v].word}` : "not set");
  };
  range.value = current ?? 5;
  paint(current != null);
  range.addEventListener("input", () => paint(true));
  // a tap on the cap where it already sits changes nothing, so no input event: count the touch itself
  range.addEventListener("pointerup", () => paint(true));
  return el("div", { class: "q", "data-q": "overall" }, [el("span", { class: "q-label", text: "Score" }), box, word]);
}

const YEARS_BACK = 30;

// `fresh`: the beer hasn't been rated yet, so a year question defaults to this year.
function question(q, value, fresh) {
  const wrap = el("div", { class: "q", "data-q": q.id, "data-type": q.type }, el("span", { class: "q-label", text: q.label }));
  if (q.type === "text") {
    wrap.append(el("input", { type: "text", value: value ?? "", placeholder: "…" }));
  } else if (q.type === "year") {
    const now = new Date().getFullYear();
    const chosen = value ?? (fresh ? now : "");
    const sel = el("select", {}, [
      el("option", { value: "", text: "—" }),
      ...Array.from({ length: YEARS_BACK + 1 }, (_, i) => el("option", { value: String(now - i), text: String(now - i) })),
    ]);
    sel.value = String(chosen);
    wrap.append(sel);
  } else {
    const selected = new Set([value].flat().filter(Boolean));
    const chips = el("div", { class: "chips" }, (q.options ?? []).map((opt) =>
      el("button", { type: "button", class: `chip${selected.has(opt) ? " on" : ""}`, text: opt,
        onclick: (e) => {
          const me = e.currentTarget;
          if (q.type === "choice") for (const c of chips.children) if (c !== me) c.classList.remove("on");
          me.classList.toggle("on");
        } })));
    wrap.append(chips);
  }
  return wrap;
}

/**
 * @param beer   identity + profile (+ prediction, answers)
 * @param opts   { mode: "record"|"ask"|"detail", questions, thumb?, matched?, ratedCount }
 */
export function renderCard(beer, opts) {
  const { mode, questions, thumb, matched, ratedCount = 0 } = opts;
  const editable = mode !== "ask";
  const answers = beer.answers ?? {};
  const card = el("article", { class: "card", "data-id": beer.id ?? "" }, [
    el("div", { class: "card-head" }, [
      thumbEl(thumb, beer.name, "card-thumb"),
      identity(beer, editable),
    ]),
    beer.descriptors?.length ? el("div", { class: "descriptors", text: beer.descriptors.join(" · ") }) : null,
    profile(beer.profile),
    statusNotice(beer, { mode, matched, ratedCount }),
  ]);

  if (editable) {
    const score = scoreOf(answers);
    const fresh = score == null;
    card.append(scorePicker(score));
    for (const q of questions) card.append(question(q, answers[q.id], fresh));
  }

  if (mode === "record") {
    const box = el("input", { type: "checkbox", "data-field": "include", checked: !matched });
    card.append(el("div", { class: "card-footer" }, el("label", { class: "check" }, [box, el("span", { text: matched ? "Update this beer" : "Save this beer" })])));
    box.addEventListener("change", () => card.classList.toggle("dim", !box.checked));
    card.classList.toggle("dim", !box.checked);
  }
  if (mode === "ask" && !matched) {
    card.append(el("div", { class: "card-footer" }, el("button", { type: "button", class: "ghost", "data-action": "add-to-log", text: "Add to log" })));
  }
  return card;
}

// Read the editable state back out of a card.
export function readCard(card) {
  const field = (f) => card.querySelector(`[data-field="${f}"]`);
  const abvRaw = field("abv")?.value.trim();
  const answers = {};
  const score = card.querySelector('[data-q="overall"] .score');
  if (score?.dataset.set === "1") {
    answers.overall = Number(score.querySelector("input").value);
    answers.scale = 10;
  }
  for (const q of card.querySelectorAll("[data-q]:not([data-q='overall'])")) {
    const id = q.dataset.q;
    if (q.dataset.type === "text") {
      const v = q.querySelector("input").value.trim();
      if (v) answers[id] = v;
    } else if (q.dataset.type === "year") {
      const v = q.querySelector("select").value;
      if (v) answers[id] = Number(v);
    } else {
      const picked = [...q.querySelectorAll(".chip.on")].map((c) => c.textContent);
      if (picked.length) answers[id] = q.dataset.type === "choice" ? picked[0] : picked;
    }
  }
  return {
    name: field("name")?.value.trim() || "Unknown beer",
    brewery: field("brewery")?.value.trim() ?? "",
    country: field("country")?.value.trim() ?? "",
    style: field("style")?.value.trim() ?? "",
    abv: abvRaw === "" || abvRaw == null || Number.isNaN(Number(abvRaw)) ? null : Number(abvRaw),
    include: field("include") ? field("include").checked : true,
    answers,
  };
}
