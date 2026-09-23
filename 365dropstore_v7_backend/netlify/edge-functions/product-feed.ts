// Netlify Edge Function: product-feed
//
// WHY THIS EXISTS: Instagram/Facebook's "Add products" search when tagging
// a Reel does NOT crawl arbitrary product page URLs and read their Open
// Graph or Schema.org markup -- that's a common misconception. It searches
// a CATALOG connected in Meta Commerce Manager, populated either by a
// native platform integration (Shopify/WooCommerce auto-sync) or by a
// product feed file Meta is pointed at. 365 Drop Store is a custom stack,
// so there's no automatic bridge -- this file IS that bridge.
//
// Format: RSS 2.0 with the Google/Meta shopping "g:" namespace -- the
// universal format accepted by both Meta Commerce Manager and Google
// Merchant Center. This is Meta's own public, documented feed spec, not a
// guess at undocumented behaviour.
//
// Once this deploys, the ADMIN-SIDE step (not code, done in Meta Commerce
// Manager) is: Catalog > Add Items > Data Feed > paste this file's URL
// (https://365dropstore.com/feed.xml) > set it to auto-refresh daily.
// After Meta ingests it once, products should start appearing in the
// "Add products" search when tagging Reels/Posts.

const SUPABASE_URL = "https://fhiivshoikcnanbvdtxm.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_LPwVp36pEOfQIEchjefMfw_SmGNcxUt";
const SITE_URL = "https://365dropstore.com";

function xmlEscape(s: string): string {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Meta's commerce catalog treats clothing as "apparel": gender, age_group and
// color are expected on every apparel item. Items missing them can load fine
// yet be marked ineligible for Instagram product tagging ("Add products").
const COLOR_WORDS: Array<[RegExp, string]> = [
  [/jet\s*black|black|obsidian|charcoal|onyx/i, "Black"],
  [/indigo/i, "Indigo"],
  [/navy/i, "Navy"],
  [/\bic[ey]\b|\bicy\b|\bsky\b|light\s*blue|powder/i, "Light Blue"],
  [/blue|denim|atlantic|whisker/i, "Blue"],
  [/olive|green/i, "Green"],
  [/grey|gray|\bash\b|smoke|concrete|stone|sunbleach|sunbleed/i, "Grey"],
  [/white|cream|ecru|off-?white/i, "White"],
  [/khaki|beige|sand|\btan\b/i, "Beige"],
  [/brown|coffee|mocha|rust/i, "Brown"],
  [/tint/i, "Tinted"],
];
function colorOf(p: Record<string, unknown>): string {
  const listed = Array.isArray(p.colors) ? (p.colors as unknown[]).map(String).filter(Boolean) : [];
  if (listed.length) return listed.slice(0, 3).join("/").slice(0, 100);
  const name = String(p.name || "");
  for (const [re, c] of COLOR_WORDS) if (re.test(name)) return c;
  return "Denim";
}
// Google taxonomy ids Meta accepts: 204 = Clothing > Pants (jeans), 212 = Shirts & Tops
function taxonomyOf(category: unknown): string {
  const c = String(category || "").toLowerCase();
  if (c.includes("t-shirt") || c.includes("tshirt") || c.includes("shirt")) return "212";
  if (c.includes("jean") || c.includes("pant") || c.includes("trouser")) return "204";
  return "1604";
}

function cdata(s: string): string {
  // CDATA is safer than escaping for free-text fields (titles/descriptions
  // can contain quotes, ampersands, etc. from admin-entered copy) -- avoids
  // double-escaping edge cases entirely.
  return `<![CDATA[${String(s || "").replace(/\]\]>/g, "]]]]><![CDATA[>")}]]>`;
}

export default async (): Promise<Response> => {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/products?select=id,name,description,price,offer_price,category,fit,sizes,oosizes,images,colors`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
    );
    if (!res.ok) {
      return new Response("Feed temporarily unavailable", { status: 502 });
    }
    const products: Array<Record<string, unknown>> = await res.json();

    const items = products.map((p) => {
      const id = String(p.id);
      const name = String(p.name || "");
      const desc = String(p.description || name);
      const mrp = Number(p.price || 0);
      const offer = Number(p.offer_price || 0);
      const price = offer > 0 ? offer : mrp;            // what the customer pays (matches og:price on the page)
      const onSale = offer > 0 && mrp > offer;          // show the strike-through MRP on Instagram
      const link = `${SITE_URL}/p/${id}`;
      const images = Array.isArray(p.images) ? (p.images as string[]) : [];
      const mainImage = images[0] || "";
      const extraImages = images.slice(1, 11); // Meta allows up to 10 additional images
      const sizes = Array.isArray(p.sizes) ? (p.sizes as string[]) : [];
      const oosizes = Array.isArray(p.oosizes) ? (p.oosizes as string[]) : [];
      const inStock = sizes.some((s) => !oosizes.includes(s));

      if (!mainImage || price <= 0) return ""; // Meta rejects items missing required fields -- skip rather than submit a broken entry

      return `
    <item>
      <g:id>${xmlEscape(id)}</g:id>
      <title>${cdata(name)}</title>
      <description>${cdata(desc)}</description>
      <link>${xmlEscape(link)}</link>
      <g:image_link>${xmlEscape(mainImage)}</g:image_link>
      ${extraImages.map((img) => `<g:additional_image_link>${xmlEscape(img)}</g:additional_image_link>`).join("\n      ")}
      <g:availability>${inStock ? "in stock" : "out of stock"}</g:availability>
      <g:price>${(onSale ? mrp : price).toFixed(2)} INR</g:price>
      ${onSale ? `<g:sale_price>${price.toFixed(2)} INR</g:sale_price>` : ""}
      <g:gender>male</g:gender>
      <g:age_group>adult</g:age_group>
      <g:color>${xmlEscape(colorOf(p))}</g:color>
      <g:brand>365 Drop Store</g:brand>
      <g:condition>new</g:condition>
      <g:product_type>${xmlEscape(`${p.category || "Apparel"} > ${p.fit || ""}`)}</g:product_type>
      <g:google_product_category>${taxonomyOf(p.category)}</g:google_product_category>
    </item>`;
    }).filter(Boolean).join("\n");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
<channel>
  <title>365 Drop Store — Product Feed</title>
  <link>${SITE_URL}</link>
  <description>Live product catalog for Meta Commerce Manager and Google Merchant Center.</description>${items}
</channel>
</rss>`;

    return new Response(xml, {
      status: 200,
      headers: {
        "content-type": "application/xml; charset=utf-8",
        "cache-control": "public, max-age=900", // feed crawlers re-fetch periodically; an hour is plenty fresh without hammering Supabase
      },
    });
  } catch (e) {
    return new Response("Feed generation error: " + String(e), { status: 500 });
  }
};

export const config = { path: "/feed.xml" };