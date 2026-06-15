export default async (req) => {
  try {
    const { getStore } = await import("@netlify/blobs");
    const store = getStore("dropstore");
    const raw = await store.get("state");
    const data = raw ? JSON.parse(raw) : null;
    return new Response(JSON.stringify(data || null), {
      status: 200,
      headers: { "content-type": "application/json", "cache-control": "public, max-age=30, stale-while-revalidate=60", "access-control-allow-origin": "*" },
    });
  } catch (e) {
    console.log("STORE ERROR:", e.message);
    return new Response(JSON.stringify({ error: "read_failed", detail: String(e.message) }), { status: 500, headers: { "content-type": "application/json" } });
  }
};
export const config = { path: "/api/store" };
