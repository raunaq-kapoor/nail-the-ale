import { settings, loadAll, checkRepo, upsertBeers, deleteBeer, saveConfig, saveTaste, putPhoto, getPhoto, newBeerId } from "./store.js";
import { analyzePhotos, summarizeTaste, pingModel, listModels, isRated, MIN_RATED_FOR_PREDICTION } from "./ai.js";
import { filterBeers } from "./search.js";
import { resize } from "./image.js";
import { renderCard, readCard, capEl } from "./card.js";

export const APP_VERSION = "2026.09.20-1"; // stamped by dev/release.sh

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const state = {
  beers: [],
  config: { questions: [] },
  taste: null, // { summary, likes, avoids, ratedCount, generatedAt }
  scans: { record: null, ask: null }, // { photos: [{full, thumb, url}], results }
};

// --- boot ---

async function boot() {
  wireTabs();
  wireScans();
  wireDetail();
  wireSettings();
  wireData();
  for (const btn of $$('[data-action="open-settings"]')) btn.addEventListener("click", () => openSettings({ firstRun: true }));
  renderSetupState();
  if (configured()) await refresh();
}

// Before the keys are in, the tabs still show; the camera just points at ⚙︎.
function renderSetupState() {
  for (const n of $$(".setup-notice")) n.hidden = configured();
}

function configured() {
  const s = settings.get();
  return Boolean(s.geminiKey && s.ghOwner && s.ghRepo && s.ghToken);
}

async function refresh() {
  try {
    const { beers, config, taste, fromCache } = await loadAll();
    Object.assign(state, { beers, config, taste });
    pill(fromCache ? "offline · cached" : "");
  } catch (e) {
    toast(`Couldn't load your log: ${e.message}`);
  }
  renderData();
  renderUnlockHint();
}

// --- tabs ---

function wireTabs() {
  for (const btn of $$("[data-goto]")) btn.addEventListener("click", () => goto(btn.dataset.goto));
}

function goto(name) {
  for (const t of $$(".tab")) t.hidden = t.dataset.tab !== name;
  for (const b of $$("[data-goto]")) b.classList.toggle("active", b.dataset.goto === name);
  window.scrollTo(0, 0);
}

// --- scans: Record and Ask share everything up to the cards ---

function wireScans() {
  for (const input of $$("input[type=file][data-mode]")) {
    input.addEventListener("change", async () => {
      if (input.files.length) await startScan(input.dataset.mode, [...input.files]);
      input.value = "";
    });
  }
  $('[data-scan="record"] [data-action="save-all"]').addEventListener("click", saveAll);
  for (const btn of $$('[data-action="discard"]')) btn.addEventListener("click", () => resetScan(btn.closest(".scan").dataset.scan));
  $('[data-scan="ask"] .cards').addEventListener("click", (e) => {
    const btn = e.target.closest('[data-action="add-to-log"]');
    if (btn) addToLog(btn.closest(".card"), btn);
  });
}

function scanParts(mode) {
  const root = $(`.scan[data-scan="${mode}"]`);
  return { root, strip: $(".photo-strip", root), status: $(".scan-status", root), cards: $(".cards", root), actions: $(".scan-actions", root) };
}

function resetScan(mode) {
  const p = scanParts(mode);
  for (const ph of state.scans[mode]?.photos ?? []) URL.revokeObjectURL(ph.url);
  state.scans[mode] = null;
  p.root.hidden = true;
  p.strip.replaceChildren();
  p.cards.replaceChildren();
  p.actions.hidden = true;
}

async function startScan(mode, files) {
  if (!configured()) {
    toast("Add your keys in settings first");
    openSettings({ firstRun: true });
    return;
  }
  resetScan(mode);
  const p = scanParts(mode);
  p.root.hidden = false;
  p.status.textContent = "Preparing photos…";
  const photos = [];
  for (const f of files) {
    const full = await resize(f, 1280, 0.85);
    const thumb = await resize(f, 320, 0.7);
    const url = URL.createObjectURL(thumb.blob);
    photos.push({ full: full.base64, thumb: thumb.base64, url });
    const img = document.createElement("img");
    img.src = url;
    p.strip.append(img);
  }
  p.status.textContent = "Reading labels… (10–30 s)";
  try {
    const results = await analyzePhotos({
      images: photos.map((ph) => ({ base64: ph.full, mimeType: "image/jpeg" })),
      beers: state.beers,
      questions: state.config.questions,
      settings: settings.get(),
      taste: state.taste,
    });
    state.scans[mode] = { photos, results };
    if (!results.length) {
      p.status.textContent = "No beers found in that photo. Try a closer shot of the label.";
      return;
    }
    const n = results.length;
    p.status.textContent = mode === "record"
      ? `${n} beer${n === 1 ? "" : "s"} found. Rate what you've had, then save.`
      : `${n} beer${n === 1 ? "" : "s"} found.`;
    const ratedCount = state.beers.filter(isRated).length;
    for (const r of results) {
      const matched = r.matchId ? state.beers.find((b) => b.id === r.matchId) ?? null : null;
      const card = renderCard(matched ?? r, {
        mode, matched, ratedCount,
        questions: state.config.questions,
        thumb: (photos[r.photoIndex] ?? photos[0]).url,
      });
      card._source = { result: r, matched };
      p.cards.append(card);
    }
    p.actions.hidden = false;
  } catch (e) {
    p.status.textContent = `Couldn't read the photo: ${e.message}`;
  }
}

// --- building beer records ---

function newBeerFrom(result) {
  return {
    id: newBeerId(),
    name: result.name, brewery: result.brewery, style: result.style, abv: result.abv,
    profile: result.profile, descriptors: result.descriptors,
    photo: null,
    prediction: result.prediction,
    answers: {},
    addedAt: new Date().toISOString(),
    ratedAt: null,
  };
}

function withEdits(base, edits) {
  const rated = Number.isInteger(edits.answers.overall);
  return {
    ...base,
    name: edits.name, brewery: edits.brewery, style: edits.style, abv: edits.abv,
    answers: edits.answers,
    ratedAt: rated ? base.ratedAt ?? new Date().toISOString() : null,
  };
}

async function attachPhoto(beer, scan, result) {
  if (beer.photo) return beer;
  const ph = scan.photos[result.photoIndex] ?? scan.photos[0];
  return { ...beer, photo: await putPhoto(beer.id, ph.thumb) };
}

// --- Record: save all ticked cards ---

async function saveAll() {
  const scan = state.scans.record;
  const p = scanParts("record");
  const picked = $$(".card", p.cards)
    .map((card) => ({ card, edits: readCard(card) }))
    .filter(({ edits }) => edits.include);
  if (!picked.length) return toast("Nothing ticked to save");

  const btn = $('[data-action="save-all"]', p.actions);
  btn.disabled = true;
  try {
    const beers = [];
    for (const [i, { card, edits }] of picked.entries()) {
      p.status.textContent = `Saving ${i + 1} of ${picked.length}…`;
      const { result, matched } = card._source;
      beers.push(await attachPhoto(withEdits(matched ?? newBeerFrom(result), edits), scan, result));
    }
    state.beers = await upsertBeers(beers);
    toast(`Saved ${beers.length} beer${beers.length === 1 ? "" : "s"}`);
    resetScan("record");
    renderData();
    renderUnlockHint();
    goto("data");
  } catch (e) {
    p.status.textContent = `Couldn't save: ${e.message}`;
  } finally {
    btn.disabled = false;
  }
}

// --- Ask: add one card to the log, unrated ---

async function addToLog(card, btn) {
  const { result } = card._source;
  btn.disabled = true;
  btn.textContent = "Adding…";
  try {
    const beer = await attachPhoto(newBeerFrom(result), state.scans.ask, result);
    state.beers = await upsertBeers([beer]);
    btn.textContent = "Added ✓";
    renderData();
  } catch (e) {
    btn.disabled = false;
    btn.textContent = "Add to log";
    toast(`Couldn't add: ${e.message}`);
  }
}

// --- Data tab ---

const SEARCH_FROM = 5; // the box only earns its space once the list is long enough

function wireData() {
  $(".search").addEventListener("input", renderData);
  $('[data-action="build-taste"]').addEventListener("click", buildTaste);
}

function renderData() {
  const list = $(".beer-list");
  const rated = state.beers.filter(isRated).length;
  const unrated = state.beers.length - rated;
  const search = $(".search");
  search.hidden = state.beers.length < SEARCH_FROM;
  const shown = filterBeers(state.beers, search.hidden ? "" : search.value);
  $(".data-summary").textContent = state.beers.length
    ? shown.length !== state.beers.length
      ? `${shown.length} of ${state.beers.length} match`
      : `${rated} rated${unrated ? ` · ${unrated} to rate` : ""}`
    : "";
  $("#tab-data .empty").hidden = state.beers.length > 0;

  const sorted = [...shown].sort((a, b) =>
    (isRated(a) - isRated(b)) || (b.addedAt ?? "").localeCompare(a.addedAt ?? ""));
  list.replaceChildren(...sorted.map(rowFor));
  renderTaste();
}

// --- taste profile card ---

function renderTaste() {
  const card = $(".taste");
  const btn = $('[data-action="build-taste"]', card);
  const rated = state.beers.filter(isRated).length;
  const t = state.taste;
  const left = MIN_RATED_FOR_PREDICTION - rated;
  card.hidden = state.beers.length === 0;
  $(".taste-summary", card).textContent = t?.summary ?? "";
  $(".taste-chips", card).replaceChildren(
    ...(t?.likes ?? []).map((x) => chipEl("like", x)),
    ...(t?.avoids ?? []).map((x) => chipEl("avoid", x)),
  );
  if (left > 0) {
    btn.hidden = true;
    $(".taste-meta", card).textContent = `Rate ${left} more beer${left === 1 ? "" : "s"} to build your taste profile · ${rated} of ${MIN_RATED_FOR_PREDICTION}`;
    return;
  }
  btn.hidden = false;
  const fresh = t ? rated - (t.ratedCount ?? 0) : 0;
  btn.textContent = !t ? "Build taste profile" : fresh > 0 ? `Update · ${fresh} new rating${fresh === 1 ? "" : "s"}` : "Update";
  $(".taste-meta", card).textContent = t
    ? `From ${t.ratedCount} rating${t.ratedCount === 1 ? "" : "s"} · ${new Date(t.generatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
    : `One look at your ${rated} ratings. Takes a few seconds.`;
}

function chipEl(kind, text) {
  const c = document.createElement("span");
  c.className = `tchip ${kind}`;
  c.textContent = (kind === "like" ? "+ " : "− ") + text;
  return c;
}

async function buildTaste() {
  const btn = $('[data-action="build-taste"]');
  const meta = $(".taste-meta");
  btn.disabled = true;
  meta.textContent = "Thinking…";
  try {
    const t = await summarizeTaste({ beers: state.beers, questions: state.config.questions, settings: settings.get() });
    const taste = { ...t, ratedCount: state.beers.filter(isRated).length, generatedAt: new Date().toISOString() };
    await saveTaste(taste);
    state.taste = taste;
    toast("Taste profile saved");
  } catch (e) {
    toast(`Couldn't build it: ${e.message}`);
  } finally {
    btn.disabled = false;
    renderTaste();
  }
}

function rowFor(beer) {
  const li = document.createElement("li");
  li.className = `row${isRated(beer) ? "" : " unrated"}`;
  const img = document.createElement("img");
  img.className = "row-thumb";
  img.alt = "";
  if (beer.photo) getPhoto(beer.photo).then((url) => { if (url) img.src = url; }).catch(() => {});
  const main = document.createElement("div");
  main.className = "row-main";
  main.innerHTML = `<div class="row-name"></div><div class="row-sub"></div>`;
  $(".row-name", main).textContent = beer.name;
  $(".row-sub", main).textContent = [beer.style, beer.brewery].filter(Boolean).join(" · ");
  const end = document.createElement("div");
  end.className = "row-end";
  if (!isRated(beer)) {
    end.innerHTML = `<span class="badge">Rate</span>`;
  } else {
    if (beer.prediction) end.append(capEl(beer.prediction.verdict, { small: true }), "→");
    end.append(capEl(beer.answers.overall, { small: true, on: true }));
  }
  li.append(img, main, end);
  li.addEventListener("click", () => openDetail(beer));
  return li;
}

function renderUnlockHint() {
  const hint = $("#tab-ask .unlock-hint");
  const rated = state.beers.filter(isRated).length;
  const left = MIN_RATED_FOR_PREDICTION - rated;
  hint.hidden = left <= 0;
  hint.textContent = `Rate ${left} more beer${left === 1 ? "" : "s"} to unlock predictions · ${rated} of ${MIN_RATED_FOR_PREDICTION} rated`;
}

// --- Beer detail overlay ---

function wireDetail() {
  $('[data-action="close-detail"]').addEventListener("click", closeDetail);
  $('[data-action="save-detail"]').addEventListener("click", saveDetail);
  $('[data-action="delete-detail"]').addEventListener("click", deleteDetail);
}

async function openDetail(beer) {
  const ov = $("#detail");
  const cards = $(".cards", ov);
  cards.replaceChildren();
  const del = $('[data-action="delete-detail"]');
  del.textContent = "Delete this beer";
  del.dataset.armed = "";
  ov.hidden = false;
  const thumb = beer.photo ? await getPhoto(beer.photo).catch(() => null) : null;
  const card = renderCard(beer, { mode: "detail", questions: state.config.questions, thumb });
  card._beer = beer;
  cards.append(card);
}

function closeDetail() {
  $("#detail").hidden = true;
}

async function saveDetail() {
  const card = $("#detail .card");
  if (!card) return;
  const btn = $('[data-action="save-detail"]');
  btn.disabled = true;
  try {
    state.beers = await upsertBeers([withEdits(card._beer, readCard(card))]);
    toast("Saved");
    closeDetail();
    renderData();
    renderUnlockHint();
  } catch (e) {
    toast(`Couldn't save: ${e.message}`);
  } finally {
    btn.disabled = false;
  }
}

// Two taps to delete — no browser confirm() dialogs.
async function deleteDetail() {
  const card = $("#detail .card");
  const btn = $('[data-action="delete-detail"]');
  if (!card) return;
  if (!btn.dataset.armed) {
    btn.dataset.armed = "1";
    btn.textContent = "Tap again to delete";
    return;
  }
  btn.disabled = true;
  try {
    state.beers = await deleteBeer(card._beer.id);
    toast("Deleted");
    closeDetail();
    renderData();
    renderUnlockHint();
  } catch (e) {
    toast(`Couldn't delete: ${e.message}`);
  } finally {
    btn.disabled = false;
  }
}

// --- Settings overlay ---

function wireSettings() {
  $("#open-settings").addEventListener("click", () => openSettings({ firstRun: false }));
  $('[data-action="close-settings"]').addEventListener("click", () => { $("#settings").hidden = true; });
  $('[data-action="test-gemini"]').addEventListener("click", testGemini);
  $('[data-action="test-github"]').addEventListener("click", testGitHub);
  $('[data-action="save-settings"]').addEventListener("click", saveSettings);
  $('[data-action="add-question"]').addEventListener("click", () => {
    const list = $(".question-list");
    list.append(questionEditor({ id: "q_" + Math.random().toString(36).slice(2, 6), label: "", type: "chips", options: [] }));
    list.lastElementChild.querySelector("input").focus();
  });
}

function openSettings({ firstRun }) {
  const ov = $("#settings");
  const s = settings.get();
  for (const input of $$("input[name]", ov)) input.value = s[input.name] ?? "";
  $(".settings-intro", ov).hidden = !firstRun;
  for (const r of $$(".test-result", ov)) { r.textContent = ""; r.className = "test-result"; }
  $(".question-list").replaceChildren(...state.config.questions.map(questionEditor));
  $(".version", ov).textContent = `Nail the Ale ${APP_VERSION}`;
  ov.hidden = false;
}

function readSettingsForm() {
  return Object.fromEntries($$("#settings input[name]").map((i) => [i.name, i.value.trim()]));
}

function showResult(which, ok, text) {
  const r = $(`.test-result[data-for="${which}"]`);
  r.textContent = text;
  r.className = `test-result ${ok ? "ok" : "err"}`;
}

async function testGemini() {
  const form = readSettingsForm();
  showResult("gemini", true, "Checking…");
  try {
    await pingModel({ geminiKey: form.geminiKey, model: form.model });
    showResult("gemini", true, `Works · ${form.model} answered`);
  } catch (e) {
    let hint = "";
    try {
      const flash = (await listModels({ geminiKey: form.geminiKey })).filter((m) => /flash/.test(m) && !/(image|tts|live|audio|omni)/.test(m));
      if (flash.length) hint = ` Models this key can see: ${flash.slice(-6).join(", ")}.`;
    } catch { /* key itself is bad; the first error says so */ }
    showResult("gemini", false, `Didn't work: ${e.message}${hint}`);
  }
}

async function testGitHub() {
  settings.set(readSettingsForm());
  showResult("github", true, "Checking…");
  try {
    const { canWrite } = await checkRepo();
    if (!canWrite) throw new Error("Token can see the repo but can't write — set Contents to Read and write");
    const { beers } = await loadAll();
    showResult("github", true, `Connected · write access OK · ${beers.length} beer${beers.length === 1 ? "" : "s"} in the log`);
  } catch (e) {
    showResult("github", false, `Didn't work: ${e.message}`);
  }
}

async function saveSettings() {
  settings.set(readSettingsForm());
  const questions = readQuestions();
  const changed = JSON.stringify(questions) !== JSON.stringify(state.config.questions);
  $("#settings").hidden = true;
  renderSetupState();
  if (changed) {
    try {
      await saveConfig({ ...state.config, questions });
      state.config = { ...state.config, questions };
      toast("Questions saved");
    } catch (e) {
      toast(`Couldn't save questions: ${e.message}`);
    }
  }
  if (configured()) await refresh();
}

// --- questions editor ---

const TYPES = { chips: "Pick many", choice: "Pick one", text: "Free text" };

function questionEditor(q) {
  const li = document.createElement("li");
  li.className = "qe";
  li.dataset.id = q.id;
  li.innerHTML = `
    <div class="qe-row">
      <label>Question <input type="text" name="label" placeholder="e.g. What stood out?"></label>
      <label>Type <select name="type">${Object.entries(TYPES).map(([v, t]) => `<option value="${v}">${t}</option>`).join("")}</select></label>
    </div>
    <label class="qe-options">Options, comma-separated <input type="text" name="options" placeholder="too bitter, too sweet, just right"></label>
    <div class="qe-actions">
      <button type="button" class="ghost" data-action="move-up" aria-label="Move up">▲</button>
      <button type="button" class="ghost" data-action="move-down" aria-label="Move down">▼</button>
      <button type="button" class="danger" data-action="remove-question">Remove</button>
    </div>`;
  $('[name="label"]', li).value = q.label ?? "";
  $('[name="type"]', li).value = q.type ?? "chips";
  $('[name="options"]', li).value = (q.options ?? []).join(", ");
  const syncOptions = () => { $(".qe-options", li).hidden = $('[name="type"]', li).value === "text"; };
  $('[name="type"]', li).addEventListener("change", syncOptions);
  syncOptions();
  $('[data-action="remove-question"]', li).addEventListener("click", () => li.remove());
  $('[data-action="move-up"]', li).addEventListener("click", () => li.previousElementSibling?.before(li));
  $('[data-action="move-down"]', li).addEventListener("click", () => li.nextElementSibling?.after(li));
  return li;
}

function readQuestions() {
  return $$(".question-list .qe")
    .map((li) => {
      const type = $('[name="type"]', li).value;
      const q = { id: li.dataset.id, label: $('[name="label"]', li).value.trim(), type };
      if (type !== "text") q.options = $('[name="options"]', li).value.split(",").map((s) => s.trim()).filter(Boolean);
      return q;
    })
    .filter((q) => q.label);
}

// --- small UI helpers ---

function pill(text) {
  const p = $("#status-pill");
  p.textContent = text;
  p.hidden = !text;
}

let toastTimer;
function toast(text) {
  const t = $("#toast");
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2800);
}

if (new URLSearchParams(location.search).has("mock")) {
  await import("./dev/mock.js");
} else if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
  // A new version took over: load it once, right now.
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading) return;
    reloading = true;
    location.reload();
  });
}
boot();
