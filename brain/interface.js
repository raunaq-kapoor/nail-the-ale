// The brain contract. Any implementation under brain/ provides these; ai.js owns the
// prompts, schemas and normalization and never knows which transport is active.
//
//   askJson(settings, { text, images?, schema, temperature? }, { signal?, model?, fallback?, retry? })
//     → the parsed JSON object the model replied with. Throws an Error carrying .status (HTTP)
//       or .network (never reached the provider). fallback:false / retry:false pin one attempt
//       on one model (the fast type-ahead try; Settings tests).
//   lastModelUsed()        → "gemini-3.6-flash" | "mistral/<model>" | null  (the "was busy — used X" toast)
//   pingModel(settings)    → "OK"            (exactly settings.model, no fallback)
//   pingMistral(settings)  → { ok, models }
//   listModels(settings)   → string[]        (hint text when the main model fails)
//   RETRY, FALLBACK_MODELS → tunables; tests set RETRY.delaysMs = [0, 0]
export {};
