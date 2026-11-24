# Google reviews sync

Live. Runs nightly at 21:30 UTC (03:00 IST) via the pg_cron job
`google-reviews-nightly`. Nothing to do to keep it running.

## Why not Google's own API

The only Google endpoint that returns reviews is the legacy v4
`mybusiness.googleapis.com/.../reviews`. As of late 2026 that service cannot
be enabled on a new Cloud project: enabling returns PERMISSION_DENIED
("not available to this consumer"), and developers who already hold Basic API
Access report 404 "Method not found" / 403 SERVICE_DISABLED. Google's own
forum thread (discuss.google.dev 389462, eight affected developers) was closed
in Oct 2026 with no answer. So this reads the public listing through a Maps
data provider instead. That is a dependency Google neither controls nor
blesses: it works, and it could break. If it ever does, reviews can still be
pasted in by hand as before - nothing else depends on it.

## Where the settings live

`app_config` (RLS on, no policies, so service role only):

| key | what it is |
|---|---|
| `review_sync_key` | shared secret the function checks; generated in Postgres, never displayed |
| `google_reviews_sync_url` | the function's URL |
| `supabase_publishable_key` | the site's public key, stored so the cron job can build the call |

`FIRECRAWL_API_KEY` and `GOOGLE_FEATURE_ID` are edge-function env secrets
(dashboard -> Edge Functions -> Secrets). The feature id is the shop's Maps id,
`0x390cfdcd58e39257:0x28072fdc81d5352`.

The sync key is deliberately NOT an env secret. Changing one means hand-copying
a random string into the dashboard, which is error-prone and not a shop
owner's job. Keeping it in a table means it can be rotated with one SQL
statement and read by the cron job without ever being displayed.

## Checking on it

Health check, safe to call, reveals no values:

    GET /functions/v1/google-reviews-sync      ->  { ready: true, ... }

Run it by hand from the SQL editor, so the key stays in the database:

    select net.http_post(
      url     := (select value from app_config where key='google_reviews_sync_url'),
      headers := jsonb_build_object(
                   'Content-Type','application/json',
                   'apikey',        (select value from app_config where key='supabase_publishable_key'),
                   'Authorization', 'Bearer ' || (select value from app_config where key='supabase_publishable_key'),
                   'x-sync-key',    (select value from app_config where key='review_sync_key')),
      body    := '{}'::jsonb) as request_id;

Then, a few seconds later, read `net._http_response` for the id it returned.

A healthy run looks like:

    {"ok":true,"seen_on_listing":67,"added":0,"linked_existing":0,
     "skipped_blocklisted":2,"added_names":[]}

`added: 0` on a repeat run is correct - it means nothing was duplicated.

## Hiding a review

Removing the row is not enough: the sync reads the live listing, so a removed
review returns the next night. Add its `google_review_id` to the
`review_blocklist` table instead, then remove the row. The sync consults that
list and skips those ids forever. To show it again, remove the blocklist entry
and the next sync brings it back.

Currently held back, both awaiting the owner's decision:
- **Dheeraj Jadhav** - contains mild profanity. Real review, but it is
  storefront copy on a premium denim site.
- **Arman Armankhan** - character-for-character identical to Armaan Mohd's
  review, from a second account. Showing the same sentence twice reads as
  padding, so only one of the two is shown.

## Two things it deliberately does not do

- **It does not copy reviewer photos.** They belong to the people who took
  them, not to the shop, whatever the API makes available.
- **These reviews must not be used for schema.org aggregateRating/review
  markup.** 58 of the 65 on the site come from Google, and Google's structured
  data guidelines don't allow marking up reviews sourced from Google. Closing
  the Search Console "missing aggregateRating" item needs first-party reviews
  tied to a product - a separate job.
