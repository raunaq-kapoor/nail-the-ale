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
  model: "gemini-2.5-flash",
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
