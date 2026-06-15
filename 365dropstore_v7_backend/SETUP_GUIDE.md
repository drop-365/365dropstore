# 365 Drop Store v7 — Live Publish Setup

You now have a real backend. Admin edits can go live for everyone with one click — no more ZIP-and-redrag for every product. This is a **one-time setup**; after it, publishing is instant.

---

## What changed

- `public/index.html` — your store (v7: product deep-link fix + denim-weave hero + live-sync layer)
- `netlify/functions/` — four serverless functions:
  - `store-get.mjs` → `GET /api/store` (public: storefront reads live data here)
  - `publish.mjs` → `POST /api/publish` (protected: "Publish to Live" button)
  - `upload.mjs` → `POST /api/upload` (protected: image upload to Blobs)
  - `img-get.mjs` → `GET /api/img/:key` (public: serves images)
- `netlify.toml`, `package.json` — project config

**Important:** functions CANNOT be deployed by dragging a ZIP onto netlify.com/drop. You must connect a project. Two ways below — pick one.

---

## ONE-TIME SETUP

### Step 1 — Set your publish token (both paths need this)

This is the secret that lets ONLY you publish. Pick a long random string (e.g. mash your keyboard, 30+ chars).

In Netlify: your site → **Site configuration → Environment variables → Add a variable**
- Key: `PUBLISH_TOKEN`
- Value: `<your-long-random-secret>`
- Scopes: all

Save. You'll type this token once in the admin panel the first time you publish; it's then stored in your browser.

### Step 2 — Deploy the project (choose ONE)

#### Path A — Netlify CLI (no GitHub, deploy from your laptop)
1. Install Node.js (nodejs.org) if you don't have it.
2. In a terminal:
   ```
   npm install -g netlify-cli
   cd <this-unzipped-folder>
   npm install
   netlify login
   netlify link        # link to your existing 365dropstore site
   netlify deploy --prod
   ```
3. Done. Your existing domain now runs the functions too.

#### Path B — GitHub (auto-deploys on every push)
1. Create a new GitHub repo, push this folder's contents to it.
2. In Netlify: your site → **Site configuration → Build & deploy → link repository** → pick the repo.
3. Build settings: publish directory `public`, functions directory `netlify/functions` (the `netlify.toml` already sets these — just confirm).
4. Deploy. Every `git push` now redeploys automatically.

Either way, `PUBLISH_TOKEN` from Step 1 must be set in Netlify before publishing works.

---

## DAILY WORKFLOW (after setup)

1. Open your admin panel: `365dropstore.com/#admin-c7eb812ee6b3ec33f16b4fc1`
2. Add/edit products, reviews, palette, etc. — same as before.
3. **Settings tab → 👁 Preview Draft** — opens your draft in a new tab. Only you see it. Public site unchanged.
4. Happy with it? **Settings tab → 🚀 Publish to Live.**
   - First time: it asks for your `PUBLISH_TOKEN`. Paste it. Stored locally after.
   - You'll see "✅ Published! Live for everyone now."
5. Every visitor's next page load shows the new content (within ~30–60s due to CDN cache).

That's it. No ZIP, no redeploy for content. You only re-deploy (Step 2) if you change the HTML/functions code itself.

---

## How it stays safe

- The admin hash + password gate the *UI* (as before).
- The `PUBLISH_TOKEN` gates the actual *write*. Even someone who finds your admin URL can't publish without the token, which lives only in Netlify env vars and your browser — never in the page source.
- `/api/store` and `/api/img/*` are public read-only. `/api/publish` and `/api/upload` reject anything without the right token (401).

---

## Notes & limits

- **Images:** uploaded to Netlify Blobs as real files, served via `/api/img/<key>`, hard-cached forever (keys are unique). No more bloating the HTML with base64.
- **Offline / local file:** if you open `index.html` as a local file (not on the deployed site), the live-sync silently does nothing and it falls back to localStorage — so nothing breaks during testing.
- **The old "Download ZIP" button still exists** as a backup/export. You don't need it for normal publishing anymore, but it's there if you ever want a full static snapshot.
- **Free-tier billing:** Netlify's free plan is credit-based and pauses the site if you blow the monthly cap. Since publishing is now a function call (not a deploy), you'll use FAR fewer credits than the old redeploy-per-change loop. Keep an eye on the usage dashboard if traffic grows.

---
*v7 · live-publish backend + denim selvedge hero · June 2026*
