// Supabase Edge Function: google-reviews-sync
//
// Pulls the shop's own Google reviews into the `reviews` table so the site
// stays current without anyone copying and pasting.
//
// ── Why this does not use Google's own API ──────────────────────────────
// The only Google endpoint that returns reviews is the legacy v4
// mybusiness.googleapis.com/v4/accounts/*/locations/*/reviews. As of late
// 2026 that service cannot be enabled on a new Cloud project at all:
// `gcloud services enable mybusiness.googleapis.com` returns PERMISSION_DENIED
// ("not available to this consumer"), and developers who already hold Basic
// API Access report the endpoint answering 404 "Method not found" or 403
// SERVICE_DISABLED. Google's own developer forum thread on this (389462) was
// closed in October 2026 with no answer and no documented path to access.
// Building against it would mean shipping something that returns 404, so this
// reads the public listing through a Maps data provider instead.
//
// ── What it is and is not ───────────────────────────────────────────────
// Reviews are pulled for display on our own site, with the reviewer's name
// kept as attribution. Reviewer PHOTOS are deliberately not copied: those
// belong to the people who took them, not to the shop.
//
// These reviews must NOT be used for schema.org aggregateRating/review markup.
// Google's structured data guidelines don't allow marking up reviews sourced
// from Google itself, and a large majority of the rows this writes are from
// Google. Closing the Search Console "missing aggregateRating" item needs
// first-party reviews tied to a product, which is a separate job.
//
// ── Setup (one time) ────────────────────────────────────────────────────
//   supabase secrets set FIRECRAWL_API_KEY=...        # the shop's own key
//   supabase secrets set GOOGLE_FEATURE_ID=0x390cfdcd58e39257:0x28072fdc81d5352
//   supabase secrets set REVIEW_SYNC_KEY=...          # any long random string
// Call it with  x-sync-key: <REVIEW_SYNC_KEY>  so it cannot be triggered by
// anyone who happens to find the URL.

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SECRET_KEYS = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")!);
const SERVICE_ROLE_KEY = SECRET_KEYS["default"];
const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY") ?? "";
const FEATURE_ID = Deno.env.get("GOOGLE_FEATURE_ID") ?? "";
const SYNC_KEY = Deno.env.get("REVIEW_SYNC_KEY") ?? "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sync-key",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

/** Tidy a Google review for display: Maps returns <br> for line breaks. */
function clean(t: string): string {
  return t.replace(/<br\s*\/?>/gi, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
/** "satyam yadav" -> "Satyam Yadav". Google shows some names fully capitalised. */
function tidyName(n: string): string {
  const s = (n || "").trim();
  if (!s) return "Customer";
  if (s === s.toUpperCase() || s === s.toLowerCase()) {
    return s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
  }
  return s;
}
const norm = (n: string) => (n || "").toLowerCase().replace(/[^a-z0-9]/g, "");

async function fetchPage(cursor: string | null) {
  const body: Record<string, unknown> = {
    objective: "Sync the shop's own Google reviews onto its website",
    alexandria: {
      provider: "firecrawl-maps",
      capability: "businesses/reviews",
      options: { feature_id: FEATURE_ID, count: 60, sort: "newest", language: "en", ...(cursor ? { cursor } : {}) },
    },
  };
  const r = await fetch("https://api.firecrawl.dev/v2/scrape", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${FIRECRAWL_API_KEY}` },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Review provider returned ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const j = await r.json();
  const block = j?.data?.alexandria?.[0]?.data;
  if (!block) throw new Error("Review provider returned no data block");
  return block as { reviews: any[]; has_more: boolean; next_cursor: string | null };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!SYNC_KEY || req.headers.get("x-sync-key") !== SYNC_KEY) return json({ error: "Not authorised" }, 401);
  if (!FIRECRAWL_API_KEY || !FEATURE_ID) return json({ error: "Sync is not configured" }, 500);

  try {
    // 1. Read every review on the listing (60 per page).
    const all: any[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 10; page++) {
      const b = await fetchPage(cursor);
      all.push(...(b.reviews || []));
      if (!b.has_more || !b.next_cursor) break;
      cursor = b.next_cursor;
    }

    const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: existing, error: readErr } = await sb
      .from("reviews").select("id, who, google_review_id, text_content").eq("type", "text");
    if (readErr) return json({ error: "Could not read reviews: " + readErr.message }, 500);

    const byGoogleId = new Map<string, any>();
    const byName = new Map<string, any>();
    for (const row of existing || []) {
      if (row.google_review_id) byGoogleId.set(row.google_review_id, row);
      if (row.who) byName.set(norm(row.who), row);
    }

    // Keep new ids after the highest Rgoog<N> already used.
    let next = 0;
    for (const row of existing || []) {
      const m = /^Rgoog(\d+)$/.exec(row.id || "");
      if (m) next = Math.max(next, parseInt(m[1], 10));
    }
    let order = (existing || []).length + 1;

    const inserts: any[] = [];
    const linked: string[] = [];

    for (const rv of all) {
      const text = clean(rv.text || "");
      if (!text) continue;                      // star-only review: nothing to show
      const gid = rv.review_id as string;
      if (!gid) continue;
      if (byGoogleId.has(gid)) continue;        // already synced

      // First run: rows imported by hand have no Google id yet. Match them by
      // name and attach the id, so they are never inserted a second time.
      const hit = byName.get(norm(rv.author_name || ""));
      if (hit && !hit.google_review_id) {
        await sb.from("reviews").update({ google_review_id: gid }).eq("id", hit.id);
        byGoogleId.set(gid, hit);
        linked.push(hit.who);
        continue;
      }
      if (hit) continue;

      inserts.push({
        id: `Rgoog${++next}`,
        type: "text",
        stars: Math.round(rv.rating || 5),
        text_content: text,
        who: tidyName(rv.author_name),
        where_loc: "Google Review",
        google_review_id: gid,
        sort_order: order++,
      });
    }

    if (inserts.length) {
      const { error: insErr } = await sb.from("reviews").insert(inserts);
      if (insErr) return json({ error: "Could not insert: " + insErr.message }, 500);
    }

    // Keep the homepage's "N Google reviews" stat honest with the listing.
    const total = all.length;
    const { data: sc } = await sb.from("site_content").select("content").eq("id", 1).single();
    if (sc?.content && typeof sc.content.stats === "string") {
      const stats = sc.content.stats.replace(/\d+\s+Google reviews/, `${total} Google reviews`);
      if (stats !== sc.content.stats) {
        await sb.from("site_content").update({ content: { ...sc.content, stats }, updated_at: new Date().toISOString() }).eq("id", 1);
      }
    }

    return json({
      ok: true,
      seen_on_listing: total,
      added: inserts.length,
      linked_existing: linked.length,
      added_names: inserts.map((i) => i.who),
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
