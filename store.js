// Settings (localStorage), GitHub Contents API I/O, and the local cache.

// --- encoding: GitHub's Contents API speaks base64; answers contain emoji ---

export function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function base64ToUtf8(b64) {
  const bin = atob(b64.replace(/\s/g, ""));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

// --- settings: the two keys and where the data repo is; phone-local only ---

const SETTINGS_KEY = "nta.settings";
const DEFAULT_SETTINGS = {
  geminiKey: "",
  model: "gemini-3.6-flash",
  searchModel: "gemini-3.5-flash-lite", // fast one for type-ahead suggestions
  ghOwner: "",
  ghRepo: "nail-the-ale-data",
  ghToken: "",
};

export const settings = {
  get() {
    return { ...DEFAULT_SETTINGS, ...(cache.get(SETTINGS_KEY) ?? {}) };
  },
  set(patch) {
    cache.set(SETTINGS_KEY, { ...settings.get(), ...patch });
  },
};

// --- cache: last-known repo files so the app opens instantly / offline ---

export const cache = {
  get(key) {
    const raw = localStorage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  },
  set(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  },
};

// --- ids ---

export function newBeerId(now = new Date()) {
  const ymd = now.toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.random().toString(36).slice(2, 6).padEnd(4, "0");
  return `b_${ymd}_${rand}`;
}

// --- GitHub Contents API: the data repo is the database ---

export const DEFAULT_CONFIG = {
  questions: [
    {
      id: "stood_out",
      label: "What stood out?",
      type: "chips",
      options: ["too bitter", "too sweet", "too heavy", "watery", "great aroma", "refreshing", "complex", "boring"],
    },
    { id: "note", label: "Note", type: "text" },
  ],
};

const BEERS_KEY = "nta.beers";
const CONFIG_KEY = "nta.config";
const TASTE_KEY = "nta.taste";

function ghUrl(path) {
  const { ghOwner, ghRepo } = settings.get();
  return `https://api.github.com/repos/${ghOwner}/${ghRepo}/contents/${path}`;
}

function ghHeaders() {
  return {
    Authorization: `Bearer ${settings.get().ghToken}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

// {base64, sha} or null when the file doesn't exist. no-store: GitHub marks
// responses cacheable for 60s, which would hand us a stale sha after a write.
async function ghRead(path) {
  const res = await fetch(ghUrl(path), { headers: ghHeaders(), cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub ${res.status} reading ${path}`);
  const { content, sha } = await res.json();
  return { base64: content, sha };
}

// Always GET first so the PUT carries the current sha — edits made outside
// the app (e.g. from the Mac) never cause a conflict.
async function ghWrite(path, base64, message) {
  const existing = await ghRead(path);
  const body = { message, content: base64, ...(existing && { sha: existing.sha }) };
  const res = await fetch(ghUrl(path), {
    method: "PUT",
    headers: { ...ghHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`GitHub ${res.status} writing ${path}`);
}

// "Test connection": GitHub answers 404 for a private repo the token can't see,
// so a plain file read can't tell "empty" from "no access". The repo endpoint
// can, and it reports the token's real permissions.
export async function checkRepo() {
  const { ghOwner, ghRepo } = settings.get();
  const res = await fetch(`https://api.github.com/repos/${ghOwner}/${ghRepo}`, { headers: ghHeaders(), cache: "no-store" });
  if (res.status === 401) throw new Error("GitHub token was rejected (401) — paste it again");
  if (res.status === 404) throw new Error(`Token can't see ${ghOwner}/${ghRepo} — check the owner/repo and that the token's repository access includes it`);
  if (!res.ok) throw new Error(`GitHub ${res.status}`);
  const { permissions = {} } = await res.json();
  return { canWrite: Boolean(permissions.push) };
}

const readJson = async (path) => {
  const f = await ghRead(path);
  return f ? JSON.parse(base64ToUtf8(f.base64)) : null;
};
const writeJson = (path, value, message) =>
  ghWrite(path, utf8ToBase64(JSON.stringify(value, null, 2)), message);

export async function loadAll() {
  try {
    const [beersDoc, config, taste] = await Promise.all([readJson("beers.json"), readJson("config.json"), readJson("taste.json")]);
    const beers = beersDoc?.beers ?? [];
    cache.set(BEERS_KEY, beers);
    cache.set(CONFIG_KEY, config ?? DEFAULT_CONFIG);
    cache.set(TASTE_KEY, taste);
    return { beers, config: config ?? DEFAULT_CONFIG, taste, fromCache: false };
  } catch (e) {
    const beers = cache.get(BEERS_KEY);
    if (beers === null) throw e;
    return { beers, config: cache.get(CONFIG_KEY) ?? DEFAULT_CONFIG, taste: cache.get(TASTE_KEY), fromCache: true };
  }
}

export async function saveTaste(taste) {
  await writeJson("taste.json", taste, "Update taste profile");
  cache.set(TASTE_KEY, taste);
}

async function writeBeers(beers, message) {
  await writeJson("beers.json", { beers }, message);
  cache.set(BEERS_KEY, beers);
  return beers;
}

export async function upsertBeers(changed) {
  const beers = (await readJson("beers.json"))?.beers ?? [];
  for (const b of changed) {
    const i = beers.findIndex((x) => x.id === b.id);
    if (i >= 0) beers[i] = b;
    else beers.push(b);
  }
  return writeBeers(beers, `Save ${changed.map((b) => b.name).join(", ")}`);
}

export async function deleteBeer(id) {
  const beers = ((await readJson("beers.json"))?.beers ?? []).filter((b) => b.id !== id);
  return writeBeers(beers, `Delete ${id}`);
}

export async function saveConfig(config) {
  await writeJson("config.json", config, "Update questions");
  cache.set(CONFIG_KEY, config);
}

// Thumbnails: memory first, then localStorage best-effort (quota is small on iOS).
const photoMemo = new Map();

export async function putPhoto(id, base64) {
  const path = `photos/${id}.jpg`;
  await ghWrite(path, base64, `Photo ${id}`);
  photoMemo.set(path, base64);
  return path;
}

export async function getPhoto(path) {
  const key = "nta.photo." + path;
  let b64 = photoMemo.get(path) ?? cache.get(key);
  if (!b64) {
    const f = await ghRead(path);
    if (!f) return null;
    b64 = f.base64.replace(/\s/g, "");
    photoMemo.set(path, b64);
    try { cache.set(key, b64); } catch { /* quota full: memory only */ }
  }
  return "data:image/jpeg;base64," + b64;
}
