import { getStore } from "@netlify/blobs";

// Public image serving. GET /api/img/<key> -> raw image bytes.
// Hard-cached: image keys are unique (UUID), so they never change.
export default async (req, context) => {
  const key = context.params.key;
  if (!key) return new Response("Not found", { status: 404 });
  try {
    const images = getStore("dropstore-img");
    const blob = await images.getWithMetadata(key, { type: "arrayBuffer" });
    if (!blob || !blob.data) return new Response("Not found", { status: 404 });
    const ct =
      (blob.metadata && blob.metadata.contentType) || "image/jpeg";
    return new Response(blob.data, {
      status: 200,
      headers: {
        "content-type": ct,
        "cache-control": "public, max-age=31536000, immutable",
      },
    });
  } catch (e) {
    return new Response("Error", { status: 500 });
  }
};

export const config = { path: "/api/img/:key" };
