// Test doubles for the two browser boundaries: localStorage and the GitHub Contents API.

export function fakeLocalStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

// Minimal GitHub Contents API: GET returns {content, sha} or 404;
// PUT requires the current sha for existing files (409 otherwise).
export function fakeGitHub() {
  const files = new Map();
  let n = 0;
  const fetch = async (url, init = {}) => {
    if (/\/user$/.test(url)) return Response.json({ login: "mock" });
    if (/\/repos\/[^/]+\/[^/]+$/.test(url)) return Response.json({ private: true, permissions: { push: true, pull: true } });
    const path = decodeURIComponent(url.match(/\/contents\/(.+)$/)[1]);
    const method = init.method ?? "GET";
    const f = files.get(path);
    if (method === "GET") {
      if (!f) return new Response("{}", { status: 404 });
      return Response.json({ content: f.content, sha: f.sha, encoding: "base64" });
    }
    if (method === "PUT") {
      const body = JSON.parse(init.body);
      if (f && body.sha !== f.sha) return new Response("{}", { status: 409 });
      if (!f && body.sha) return new Response("{}", { status: 422 });
      const sha = "sha" + ++n;
      files.set(path, { content: body.content, sha });
      return Response.json({ content: { sha } });
    }
    return new Response("{}", { status: 405 });
  };
  return { fetch, files };
}
