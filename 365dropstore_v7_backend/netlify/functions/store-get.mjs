export default async (req) => {
  try {
    const { getStore } = await import("@netlify/blobs");
    const store = getStore("dropstore");
    const data = await store.get("state", { type: "json" });
    return new Response(JSON.stringify(data || null), {
      status: 200,
      headers: { "content-type": "application/json", "cache-control": "public, max-age=30, stale-while-revalidate=60", "access-control-allow-origin": "*" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: "read_failed", detail: e.message }), { status: 500, headers: { "content-type": "application/json" } });
  }
};
export const config = { path: "/api/store" };
