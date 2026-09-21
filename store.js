// The one place the app asks for data. Re-exports the shared pieces and delegates
// storage calls to the active implementation (see storage/interface.js). Swapping
// GitHub for a hosted database means adding a file under storage/ and changing
// `active` — nothing above this line changes.

import * as github from "./storage/github.js";

export { settings, cache, configured } from "./session.js";
export { utf8ToBase64, base64ToUtf8 } from "./encoding.js";
export { DEFAULT_CONFIG, newBeerId } from "./defaults.js";

const active = github; // later: pick by settings.get().storage

export const checkRepo = (...a) => active.checkRepo(...a);
export const loadAll = (...a) => active.loadAll(...a);
export const upsertBeers = (...a) => active.upsertBeers(...a);
export const deleteBeer = (...a) => active.deleteBeer(...a);
export const saveConfig = (...a) => active.saveConfig(...a);
export const saveTaste = (...a) => active.saveTaste(...a);
export const putPhoto = (...a) => active.putPhoto(...a);
export const getPhoto = (...a) => active.getPhoto(...a);
