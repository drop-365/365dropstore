// Netlify Edge Function: og-meta
//
// Intercepts /p/{product-id} URLs, fetches product from Supabase,
// and injects product-specific <title>, og:*, and twitter:* meta tags
// into the HTML response. This makes WhatsApp link previews show the
// actual product image and name instead of the generic site preview.
//
// Google also gets proper per-product titles and descriptions for indexing.
//
// FILE LOCATION: netlify/edge-functions/og-meta.ts (from repo root)

const SB_URL = "https://fhiivshoikcnanbvdtxm.supabase.co";
const SB_APIKEY = "sb_publishable_LPwVp36pEOfQIEchjefMfw_SmGNcxUt";

function escHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function inr(n) {
  return "₹" + Number(n).toLocaleString("en-IN");
}

export default async (request, context) => {
  const url = new URL(request.url);
  const productId = decodeURIComponent(
    url.pathname.replace(/^\/p\//, "").trim()
  );

  if (!productId) {
    return context.next();
  }

  // Fetch product from Supabase REST API (RLS allows public SELECT)
  let product = null;
  try {
    const res = await fetch(
      `${SB_URL}/rest/v1/products?id=eq.${encodeURIComponent(productId)}&select=id,name,category,price,offer_price,images,description`,
      {
        headers: {
          apikey: SB_APIKEY,
          Accept: "application/json",
        },
      }
    );
    if (res.ok) {
      const data = await res.json();
      if (data && data.length > 0) {
        product = data[0];
      }
    }
  } catch (e) {
    // If fetch fails, serve the page without OG injection
    console.error("Product fetch failed:", e);
  }

  // Get the original HTML response (index.html via the rewrite)
  const response = await context.next();
  const html = await response.text();

  // If product not found, serve the page as-is (JS will show "product not found")
  if (!product) {
    return new Response(html, response);
  }

  // Build product-specific meta tags
  const name = escHtml(product.name);
  const price = product.offer_price
    ? inr(product.offer_price)
    : inr(product.price);
  const originalPrice = product.offer_price ? ` (MRP ${inr(product.price)})` : "";
  const desc = escHtml(
    product.description
      ? product.description.substring(0, 160)
      : `${product.name} — ${product.category} from 365 Drop Store`
  );
  const image =
    product.images && product.images.length > 0
      ? product.images[0]
      : "https://pub-439f2b6b71214b70a749ab163b863494.r2.dev/products/1786291109378-f6627082.jpg";
  const productUrl = `https://365dropstore.com/p/${product.id}`;

  const title = `${product.name} — ${price}${originalPrice} | 365 Drop Store`;

  // Replace the generic meta tags with product-specific ones
  let modified = html;

  // Replace <title>
  modified = modified.replace(
    /<title>[^<]*<\/title>/,
    `<title>${title}</title>`
  );

  // Replace meta description
  modified = modified.replace(
    /<meta name="description"[^>]*\/>/,
    `<meta name="description" content="${desc}"/>`
  );

  // Replace OG tags
  modified = modified.replace(
    /<meta property="og:type"[^>]*\/>/,
    `<meta property="og:type" content="product"/>`
  );
  modified = modified.replace(
    /<meta property="og:title"[^>]*\/>/,
    `<meta property="og:title" content="${title}"/>`
  );
  modified = modified.replace(
    /<meta property="og:description"[^>]*\/>/,
    `<meta property="og:description" content="${desc}"/>`
  );
  modified = modified.replace(
    /<meta property="og:image"[^>]*\/>/,
    `<meta property="og:image" content="${escHtml(image)}"/>`
  );

  // Add og:url if not present, or replace
  if (modified.includes('og:url')) {
    modified = modified.replace(
      /<meta property="og:url"[^>]*\/>/,
      `<meta property="og:url" content="${productUrl}"/>`
    );
  } else {
    modified = modified.replace(
      /<meta property="og:image"[^>]*\/>/,
      `<meta property="og:image" content="${escHtml(image)}"/>\n<meta property="og:url" content="${productUrl}"/>`
    );
  }

  // Replace Twitter tags
  modified = modified.replace(
    /<meta name="twitter:title"[^>]*\/>/,
    `<meta name="twitter:title" content="${title}"/>`
  );
  modified = modified.replace(
    /<meta name="twitter:description"[^>]*\/>/,
    `<meta name="twitter:description" content="${desc}"/>`
  );
  modified = modified.replace(
    /<meta name="twitter:image"[^>]*\/>/,
    `<meta name="twitter:image" content="${escHtml(image)}"/>`
  );

  // Add structured data (JSON-LD) for Google rich results
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    image: [image],
    description: product.description || "",
    brand: { "@type": "Brand", name: "365 Drop Store" },
    offers: {
      "@type": "Offer",
      price: product.offer_price || product.price,
      priceCurrency: "INR",
      availability: "https://schema.org/InStock",
      url: productUrl,
    },
  };

  modified = modified.replace(
    "</head>",
    `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>\n</head>`
  );

  return new Response(modified, {
    status: response.status,
    headers: response.headers,
  });
};

export const config = { path: "/p/*" };
