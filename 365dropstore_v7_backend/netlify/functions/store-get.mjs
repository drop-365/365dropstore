import { getStore } from "@netlify/blobs";

// Public, read-only. Returns the currently-published store state.
// Storefront calls this on load. No auth.
export default async (req) => {
  try {
    const store = getStore("dropstore");
    const data = await store.get("state", { type: "json" });
    return new Response(JSON.stringify(data || null), {
      status: 200,
      headers: {
        "content-type": "application/json",
        // short cache so updates appear within a minute, but CDN still helps under load
        "cache-control": "public, max-age=30, stale-while-revalidate=60",
        "access-control-allow-origin": "*",
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: "read_failed" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
};

export const config = { path: "/api/store" };
