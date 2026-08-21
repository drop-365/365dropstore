// Netlify Edge Function: sitemap
//
// Generates a dynamic sitemap.xml from products in Supabase.
// Google Search Console needs this to discover product pages.
//
// FILE LOCATION: netlify/edge-functions/sitemap.ts (from repo root)

const SB_URL = "https://fhiivshoikcnanbvdtxm.supabase.co";
const SB_APIKEY = "sb_publishable_LPwVp36pEOfQIEchjefMfw_SmGNcxUt";

export default async (request, context) => {
  let products = [];
  try {
    const res = await fetch(
      `${SB_URL}/rest/v1/products?select=id,updated_at&order=updated_at.desc`,
      {
        headers: {
          apikey: SB_APIKEY,
          Accept: "application/json",
        },
      }
    );
    if (res.ok) {
      products = await res.json();
    }
  } catch (e) {
    console.error("Sitemap product fetch failed:", e);
  }

  const today = new Date().toISOString().split("T")[0];

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://365dropstore.com/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>`;

  for (const p of products) {
    const lastmod = p.updated_at
      ? new Date(p.updated_at).toISOString().split("T")[0]
      : today;
    xml += `
  <url>
    <loc>https://365dropstore.com/p/${p.id}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`;
  }

  xml += `
</urlset>`;

  return new Response(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml",
      "Cache-Control": "public, max-age=3600",
    },
  });
};

export const config = { path: "/sitemap.xml" };
