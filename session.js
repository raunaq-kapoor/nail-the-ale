// Which credentials and services this device uses. Phone-local by design:
// keys never leave the device. `storage` and `brain` name the active implementations
// (see storage/ and brain/); today there is one of each.

const SETTINGS_KEY = "nta.settings";
const DEFAULT_SETTINGS = {
  geminiKey: "",
  model: "gemini-3.6-flash",
  searchModel: "gemini-3.5-flash-lite", // fast one for type-ahead suggestions
  mistralKey: "",                        // optional backup when Google's free tier is saturated
  mistralModel: "pixtral-large-latest",
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

// Enough to reach the data repo and the model.
export function configured() {
  const s = settings.get();
  return Boolean(s.geminiKey && s.ghOwner && s.ghRepo && s.ghToken);
}
