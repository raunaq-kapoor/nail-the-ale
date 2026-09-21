// One beer as a label-style card. Used by Record (rate now), Ask (prediction), and Detail (edit).

import { VERDICTS } from "./verdicts.js";
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

export function capEl(verdict, { small = false, on = false } = {}) {
  return el("span", { class: `cap${small ? " sm" : ""}${on ? " on" : ""}`, text: VERDICTS[verdict].emoji });
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
    const v = matched.answers?.overall;
    if (v) return notice(v >= 3 ? "good" : "bad", capEl(v), `You've had this — ${VERDICTS[v].word} on ${fmtDate(matched.ratedAt)}`, mode === "record" ? "Tick the box below to update your rating." : null);
    return notice("plain", el("span", { class: "cap sm", text: "·" }), "Already in your log, not rated yet", null);
  }
  if (mode !== "ask") return null;
  if (beer.prediction) {
    const { verdict, confidence, reason } = beer.prediction;
    return notice(verdict >= 3 ? "good" : "bad", capEl(verdict), `Probably ${VERDICTS[verdict].word} · ${Math.round(confidence * 100)}% sure`, reason);
  }
  const left = Math.max(0, MIN_RATED_FOR_PREDICTION - ratedCount);
  return notice("plain", el("span", { class: "cap sm", text: "?" }), `Rate ${left} more beer${left === 1 ? "" : "s"} to unlock predictions`, `${ratedCount} of ${MIN_RATED_FOR_PREDICTION} rated`);
}

function verdictPicker(current) {
  const row = el("div", { class: "verdict" }, Object.entries(VERDICTS).map(([n, v]) =>
    el("button", { type: "button", class: `cap${Number(n) === current ? " on" : ""}`, "data-verdict": n, "aria-label": v.word, text: v.emoji,
      onclick: (e) => { for (const c of row.children) c.classList.toggle("on", c === e.currentTarget && !c.classList.contains("on")); } })));
  return el("div", { class: "q", "data-q": "overall" }, [el("span", { class: "q-label", text: "Verdict" }), row]);
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
    const fresh = !Number.isInteger(answers.overall);
    card.append(verdictPicker(answers.overall));
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
  const on = card.querySelector('[data-q="overall"] .cap.on');
  if (on) answers.overall = Number(on.dataset.verdict);
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
