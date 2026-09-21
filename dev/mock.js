// Dev only: `index.html?mock=1` swaps GitHub and Gemini for in-memory fakes so the
// whole UI can be exercised without keys. Never loaded in normal use.

import { fakeGitHub } from "../tests/helpers.js";
import { settings, utf8ToBase64 } from "../store.js";

settings.set({ geminiKey: "mock", model: "mock-flash", searchModel: "mock-lite", mistralKey: "mock", mistralModel: "mock-pixtral", ghOwner: "mock", ghRepo: "mock-data", ghToken: "mock" });
// localStorage.setItem("nta.mockGeminiDown", "1") makes every Google model answer 503, to exercise the Mistral path.
const geminiDown = () => localStorage.getItem("nta.mockGeminiDown") === "1";

const gh = fakeGitHub();
// sessionStorage "nta.mockSeed" = JSON array of beers → pre-populates the fake repo (for testing on-open behaviour).
const seed = sessionStorage.getItem("nta.mockSeed");
if (seed) gh.files.set("beers.json", { content: utf8ToBase64(JSON.stringify({ beers: JSON.parse(seed) })), sha: "seed" });
let scans = 0;

const geminiBeers = () => {
  const n = ++scans;
  return [
    { name: `Hazy Little Thing ${n}`, brewery: "Sierra Nevada", country: "USA", style: "Hazy IPA", abv: 6.7,
      profile: { bitterness: 3, sweetness: 2, maltiness: 2, hoppiness: 5, fruitiness: 4, roastiness: 1, sourness: 1 },
      descriptors: ["juicy", "citrus", "soft"], photoIndex: 0, matchId: null,
      prediction: { verdict: 4, confidence: 0.8, reason: "You loved two other hazy IPAs with big aroma." } },
    { name: `Guinness Draught ${n}`, brewery: "Guinness", country: "Ireland", style: "Irish Dry Stout", abv: 4.2,
      profile: { bitterness: 3, sweetness: 1, maltiness: 4, hoppiness: 1, fruitiness: 1, roastiness: 5, sourness: 1 },
      descriptors: ["roasty", "creamy", "coffee"], photoIndex: 0, matchId: null,
      prediction: { verdict: 2, confidence: 0.6, reason: "You said stouts were 'too heavy'." } },
  ];
};

const realFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = async (url, init) => {
  const u = String(url);
  if (u.startsWith("https://api.github.com/")) return gh.fetch(u, init);
  if (u.includes("api.mistral.ai/v1/models")) return Response.json({ data: [{ id: "mock-pixtral" }, { id: "pixtral-large-latest" }] });
  if (u.includes("api.mistral.ai/v1/chat/completions")) {
    await new Promise((r) => setTimeout(r, 500));
    const text = JSON.parse(init.body).messages[0].content.find((p) => p.type === "text").text;
    const payload = /"summary"/.test(text)
      ? { summary: "Mistral says: hoppy and fruity is your lane.", likes: ["hoppy"], avoids: ["roasty"] }
      : { beers: [{ ...geminiBeers()[0], name: "Mistral-read Beer", descriptors: ["via mistral"] }] };
    return Response.json({ choices: [{ message: { role: "assistant", content: JSON.stringify(payload) }, finish_reason: "stop" }] });
  }
  if (u.includes("generativelanguage.googleapis.com")) {
    if (u.includes("/models?")) return Response.json({ models: [{ name: "models/mock-flash" }, { name: "models/gemini-3.6-flash" }] });
    if (u.includes("/models/mock-lite:") || (geminiDown() && u.includes(":generateContent"))) return Response.json({ error: { message: "high demand" } }, { status: 503 });
    await new Promise((r) => setTimeout(r, 600));
    const body = JSON.parse(init.body);
    const schema = body.generationConfig?.responseSchema?.properties ?? {};
    const text = body.contents[0].parts.find((p) => p.text)?.text ?? "";
    let payload;
    if (schema.countries) {
      const ids = [...text.matchAll(/^(b_[\w]+) \|/gm)].map((m) => m[1]);
      payload = { countries: ids.map((id) => ({ id, country: "Belgium" })) };
    } else if (schema.summary) {
      payload = { summary: "You go for hop-forward, fruity beers and bounce off anything roasty or heavy. Lagers bore you.", likes: ["hoppy", "citrusy", "under 7%"], avoids: ["roasty", "heavy", "plain lager"] };
    } else if (schema.beers && !schema.beers.items.properties.profile) {
      const q = (text.match(/typed: "([^"]*)"/) ?? [])[1] ?? "";
      payload = { beers: [
        { name: `${q} Pale Ale`, brewery: "Mock Brewing", country: "USA", style: "Pale Ale", abv: 5.4 },
        { name: `${q} Stout`, brewery: "Mock Brewing", country: "Ireland", style: "Stout", abv: 6.1 },
        { name: `${q} Lager`, brewery: "Other Mock Co", country: "Germany", style: "Lager", abv: 4.8 },
      ] };
    } else if (/they typed this beer: (.+?)\./.test(text)) {
      const typedName = text.match(/they typed this beer: ([^·.]+)/)[1].trim();
      payload = { beers: [{ ...geminiBeers()[0], name: typedName, brewery: "Mock Brewing", style: "Pale Ale", abv: 5.4 }] };
    } else {
      payload = { beers: geminiBeers() };
    }
    return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }] });
  }
  return realFetch(url, init);
};
