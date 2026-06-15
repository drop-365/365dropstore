export default async (req, context) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const auth = req.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  const expected = process.env.PUBLISH_TOKEN || "";
  if (!expected || token !== expected) return json({ error: "unauthorized" }, 401);
  let body;
  try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400); }
  if (!body || typeof body !== "object" || !Array.isArray(body.p)) return json({ error: "invalid_payload" }, 422);
  try {
    const { getStore } = await import("@netlify/blobs");
    const store = getStore("dropstore");
    body._publishedAt = Date.now();
    await store.set("state", JSON.stringify(body), { metadata: { contentType: "application/json" } });
    return json({ ok: true, publishedAt: body._publishedAt });
  } catch (e) {
    console.log("BLOB ERROR:", e.message, e.stack);
    return json({ error: "write_failed", detail: String(e.message) }, 500);
  }
};
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });
}
export const config = { path: "/api/publish", method: "POST" };
