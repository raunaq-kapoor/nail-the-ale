// The storage contract. Any implementation under storage/ provides these and the
// rest of the app never knows which one is active.
//
//   whoAmI(token)          → login string          onboarding: fills the owner from the token
//   checkRepo()            → { canWrite }          can this device write? (Settings "Test connection")
//   loadAll()              → { beers, config, taste, fromCache }
//                            beers: Beer[]  config: { questions }  taste: Taste | null
//                            fromCache: true when the store was unreachable and a cached copy was used
//   upsertBeers(beers[])   → Beer[]  (the full list after the write; insert by id, replace by id)
//   deleteBeer(id)         → Beer[]
//   saveConfig(config)     → void
//   saveTaste(taste)       → void
//   putPhoto(id, base64)   → path   (a durable pointer stored on the beer as `photo`)
//   getPhoto(path)         → data-URL string | null
//
// Beer = { id, name, brewery, country, style, abv, profile, descriptors, photo, prediction, answers, addedAt, ratedAt }
// Writes must be safe against edits made elsewhere (GitHub: GET-then-PUT with a fresh sha).
// Errors are thrown; the UI turns them into status text.
export {};
