// Supabase Edge Function: google-reviews-sync
//
// Pulls the shop's own Google reviews into the `reviews` table so the site
// stays current without anyone copying and pasting.
//
// Why not Google's own API: the only endpoint that returns reviews is the
// legacy v4 mybusiness.googleapis.com. As of late 2026 that service cannot be
// enabled on a new Cloud project at all (PERMISSION_DENIED on enable; 404
// "Method not found" even for developers holding Basic API Access). Google's
// forum thread 389462 was closed in Oct 2026 with no answer. So this reads the
// public listing through a Maps data provider instead.
//
// Reviewer PHOTOS are deliberately not copied: they belong to the reviewers.
// These reviews must NOT be used for schema.org aggregateRating markup —
// Google doesn't allow marking up reviews sourced from Google.
//
// Auth: the shared secret lives in app_config (RLS on, no policies, so service
// role only) rather than an env secret, because changing an env secret means
// hand-copying a random string into the dashboard, and that is not work a shop
// owner should have to do. The nightly pg_cron job reads the key and calls this
// function without the value ever leaving the database.

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SECRET_KEYS = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")!);
const SERVICE_ROLE_KEY = SECRET_KEYS["default"];
const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY") ?? "";
const FEATURE_ID = Deno.env.get("GOOGLE_FEATURE_ID") ?? "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sync-key",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

function clean(t: string): string {
  return t.replace(/<br\s*\/?>/gi, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
function tidyName(n: string): string {
  const s = (n || "").trim();
  if (!s) return "Customer";
  if (s === s.toUpperCase() || s === s.toLowerCase()) {
    return s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
  }
  return s;
}
const norm = (n: string) => (n || "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** Constant-time-ish compare so a wrong key can't be narrowed down by timing. */
function sameSecret(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function fetchPage(cursor: string | null) {
  // NOTE: no "objective" key here. That belongs to the MCP wrapper around this
  // API, not the HTTP API itself; sending it makes the endpoint reject the
  // whole request with BAD_REQUEST / unrecognized_keys.
  const body = {
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

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // GET = setup check. Reports only WHETHER each piece is present, never a
  // value or any part of one.
  if (req.method === "GET") {
    const { data: k } = await sb.from("app_config").select("value").eq("key", "review_sync_key").maybeSingle();
    return json({
      configured: {
        FIRECRAWL_API_KEY: FIRECRAWL_API_KEY.length > 0,
        GOOGLE_FEATURE_ID: FEATURE_ID.length > 0,
        sync_key_in_database: !!(k?.value),
      },
      feature_id_looks_right: /^0x[0-9a-f]+:0x[0-9a-f]+$/i.test(FEATURE_ID),
      ready: FIRECRAWL_API_KEY.length > 0 && FEATURE_ID.length > 0 && !!(k?.value),
    });
  }

  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const { data: keyRow } = await sb.from("app_config").select("value").eq("key", "review_sync_key").maybeSingle();
  const expected = keyRow?.value || "";
  if (!expected) return json({ error: "Sync key is not set" }, 500);
  if (!sameSecret(req.headers.get("x-sync-key") || "", expected)) return json({ error: "Not authorised" }, 401);
  if (!FIRECRAWL_API_KEY || !FEATURE_ID) return json({ error: "Sync is not configured" }, 500);

  try {
    const all: any[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 10; page++) {
      const b = await fetchPage(cursor);
      all.push(...(b.reviews || []));
      if (!b.has_more || !b.next_cursor) break;
      cursor = b.next_cursor;
    }

    const { data: existing, error: readErr } = await sb
      .from("reviews").select("id, who, google_review_id").eq("type", "text");
    if (readErr) return json({ error: "Could not read reviews: " + readErr.message }, 500);

    // Reviews the owner has chosen not to show. Without this the sync would put
    // a removed review straight back the next night, because it reads the live
    // listing and the review is still on it.
    const { data: blocked } = await sb.from("review_blocklist").select("google_review_id");
    const blockedIds = new Set((blocked || []).map((b: any) => b.google_review_id));

    const byGoogleId = new Map<string, any>();
    const byName = new Map<string, any>();
    for (const row of existing || []) {
      if (row.google_review_id) byGoogleId.set(row.google_review_id, row);
      if (row.who) byName.set(norm(row.who), row);
    }

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
      if (blockedIds.has(gid)) continue;        // owner chose not to show this one
      if (byGoogleId.has(gid)) continue;        // already synced

      // First run only: rows imported by hand carry no Google id yet. Match on
      // name and attach the id so they are never inserted a second time. This
      // is best-effort — a reviewer displayed as "SHOURYA 08" will not match a
      // row typed in as "Shourya" — which is exactly why every row gets the id
      // attached here, so later runs compare ids and never names.
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
      skipped_blocklisted: blockedIds.size,
      added_names: inserts.map((i) => i.who),
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
