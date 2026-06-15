export default async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const auth = req.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!process.env.PUBLISH_TOKEN || token !== process.env.PUBLISH_TOKEN) return json({ error: "unauthorized" }, 401);
  const ct = req.headers.get("content-type") || "";
  if (!ct.startsWith("image/")) return json({ error: "not_an_image" }, 415);
  try {
    const bytes = await req.arrayBuffer();
    if (bytes.byteLength > 5 * 1024 * 1024) return json({ error: "too_large" }, 413);
    const { getStore } = await import("@netlify/blobs");
    const images = getStore("dropstore-img");
    const ext = ct.split("/")[1] || "jpg";
    const key = crypto.randomUUID() + "." + ext;
    await images.set(key, bytes, { metadata: { contentType: ct } });
    return json({ ok: true, key, url: "/api/img/" + key });
  } catch (e) {
    return json({ error: "upload_failed", detail: e.message }, 500);
  }
};
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });
}
export const config = { path: "/api/upload", method: "POST" };
