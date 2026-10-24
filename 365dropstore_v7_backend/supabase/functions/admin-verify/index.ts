// Supabase Edge Function: admin-verify
//
// Answers one question for the admin sign-in screen: is this the admin
// password? The browser used to compare against a copy of the password hash
// shipped in /admin/admin.js; that copy is gone, so the check lives here.
// Same hash and same brute-force limit as admin-settings: max 8 failed
// attempts per IP per 15 minutes, logged in admin_auth_failures.
// Read-only apart from logging failures. Returns { ok: true } or an error.
//
// Deployed to Supabase project fhiivshoikcnanbvdtxm on 2026-10-22 (v1).

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SECRET_KEYS = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")!);
const SERVICE_ROLE_KEY = SECRET_KEYS["default"];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sha256(s: string): Promise<string> {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const { password } = await req.json();
    if (!password || typeof password !== "string" || password.length > 200) {
      return json({ error: "Enter your password" }, 400);
    }

    const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || req.headers.get("x-real-ip")
      || "unknown";
    const fifteenMinAgo = new Date(Date.now() - 15 * 60000).toISOString();
    const { count: recentFailures } = await sb
      .from("admin_auth_failures")
      .select("*", { count: "exact", head: true })
      .eq("ip", clientIp)
      .gte("attempted_at", fifteenMinAgo);
    if ((recentFailures || 0) >= 8) {
      return json({ error: "Too many wrong attempts. Try again in 15 minutes." }, 429);
    }

    const { data: settings, error } = await sb
      .from("admin_settings").select("password_hash").eq("id", 1).single();
    if (error || !settings) return json({ error: "Could not verify credentials" }, 500);

    if (await sha256(password) !== settings.password_hash) {
      await sb.from("admin_auth_failures").insert({ ip: clientIp });
      return json({ error: "Wrong password" }, 401);
    }
    return json({ ok: true });
  } catch (e) {
    return json({ error: "Server error: " + (e as Error).message }, 500);
  }
});
