# Google reviews sync — setup

Deployed to the Supabase project as `google-reviews-sync`.
It reads the shop's Google listing and writes new reviews into `reviews`.

## Why not Google's own API

The only Google endpoint that returns reviews is the legacy v4
`mybusiness.googleapis.com/.../reviews`. As of late 2026 that service cannot
be enabled on a new Cloud project: enabling it returns PERMISSION_DENIED
("not available to this consumer"), and developers who already hold Basic API
Access report 404 "Method not found" / 403 SERVICE_DISABLED on the endpoint.
Google's own forum thread (discuss.google.dev 389462, eight affected
developers) was closed in Oct 2026 with no answer. So this reads the public
listing through a Maps data provider instead.

## Three secrets to set

    supabase secrets set FIRECRAWL_API_KEY=<your Firecrawl key>
    supabase secrets set GOOGLE_FEATURE_ID=0x390cfdcd58e39257:0x28072fdc81d5352
    supabase secrets set REVIEW_SYNC_KEY=<any long random string>

GOOGLE_FEATURE_ID is 365dropstore's Maps id, already looked up and verified
(the listing it points at reports 67 reviews at 5.0).

Never paste these keys into a chat or commit them.

## Running it

POST to /functions/v1/google-reviews-sync with the project's publishable key
as both `apikey` and `Authorization: Bearer`, plus header `x-sync-key` set to
REVIEW_SYNC_KEY.

It returns how many reviews the listing has, how many were added, and who they
were from. Without the right x-sync-key it answers 401, so knowing the URL is
not enough to trigger it.

To run it nightly, schedule it with pg_cron + pg_net in the SQL editor.

## What it deliberately does not do

- It does not copy reviewer photos. Those belong to the people who took them,
  not to the shop.
- These reviews must not be used for schema.org aggregateRating/review markup.
  Google's structured data guidelines don't allow marking up reviews sourced
  from Google, and nearly all of these are. Closing the Search Console
  "missing aggregateRating" item needs first-party reviews tied to a product.

## Duplicate safety

`reviews.google_review_id` holds Google's own stable id for the review, with a
unique index. On its first run the sync attaches that id to rows imported by
hand (matching on reviewer name), so nothing is inserted twice.
