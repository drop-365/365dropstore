import { getStore } from "@netlify/blobs";

// Protected write. Requires Authorization: Bearer <PUBLISH_TOKEN>.
// PUBLISH_TOKEN is set as a Netlify environment variable (never in HTML).
export default async (req) => {
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }
  const auth = req.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  const expected = process.env.PUBLISH_TOKEN || "";
  if (!expected || token !== expected) {
    return json({ error: "unauthorized" }, 401);
  }
  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_json" }, 400);
  }
  // basic shape guard - must be an object with at least products array
  if (!body || typeof body !== "object" || !Array.isArray(body.p)) {
    return json({ error: "invalid_payload" }, 422);
  }
  try {
    const store = getStore("dropstore");
    body._publishedAt = Date.now();
    await store.setJSON("state", body);
    return json({ ok: true, publishedAt: body._publishedAt });
  } catch (e) {
    return json({ error: "write_failed" }, 500);
  }
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export const config = { path: "/api/publish", method: "POST" };
