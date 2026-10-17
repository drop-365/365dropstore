// Netlify Edge Function: fit-landing
//
// Serves /wide-leg-jeans and /straight-jeans as real landing
// pages for search: swaps in a fit-specific <title>, description, canonical
// and <h1> on top of index.html. The JS app then pre-filters the shop
// (see applyFitLanding() in public/index.html).
//
// FILE LOCATION: netlify/edge-functions/fit-landing.ts (from repo root)

const PAGES: Record<string, { h1: string; title: string; desc: string }> = {
  "/wide-leg-jeans": {
    h1: "Wide-Leg Jeans for Men",
    title: "Wide-Leg Jeans for Men · From ₹999 | 365 Drop Store",
    desc: "Wide-leg jeans for men, made in Delhi. Heavy washes, limited drops, free shipping across India and COD available.",
  },
  "/straight-jeans": {
    h1: "Straight Fit Jeans for Men",
    title: "Straight Fit Jeans for Men · From ₹999 | 365 Drop Store",
    desc: "Straight fit jeans for men, made in Delhi. Limited drops, free shipping across India and COD available.",
  },
};

export default async (request: Request, context: { next: () => Promise<Response> }) => {
  const path = new URL(request.url).pathname.replace(/\/+$/, "");
  const page = PAGES[path];
  const response = await context.next();
  if (!page) return response;

  const url = `https://365dropstore.com${path}`;
  let html = await response.text();
  html = html
    .replace(/<title>[^<]*<\/title>/, `<title>${page.title}</title>`)
    .replace(/<meta name="description"[^>]*\/>/, `<meta name="description" content="${page.desc}"/>`)
    .replace(/<link rel="canonical"[^>]*\/>/, `<link rel="canonical" href="${url}"/>`)
    .replace(/<meta property="og:title"[^>]*\/>/, `<meta property="og:title" content="${page.title}"/>`)
    .replace(/<meta property="og:description"[^>]*\/>/, `<meta property="og:description" content="${page.desc}"/>`)
    .replace(/<meta property="og:url"[^>]*\/>/, `<meta property="og:url" content="${url}"/>`)
    .replace(
      /<h1 class="hh1 rvh hd3" id="hero-h1">[\s\S]*?<\/h1>/,
      `<h1 class="hh1 rvh hd3" id="hero-h1"><span class="hero-gradient">${page.h1.split(" for ")[0]}</span><span>for Men</span></h1>`
    );

  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.set("content-type", "text/html; charset=utf-8");
  return new Response(html, { status: 200, headers });
};

export const config = { path: ["/wide-leg-jeans", "/straight-jeans"] };
