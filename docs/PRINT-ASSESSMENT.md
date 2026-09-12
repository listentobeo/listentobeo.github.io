# Photo-to-Sketch print assessment

Assessment and implementation date: 12 September 2026. This is a repository audit, not an inspection of production secrets, billing statements or deployed database state.

## Existing system

The site is a static GitHub Pages application. Photo-to-Sketch uses inline browser code, shared Supabase authentication, and the `generate-sketch` Edge Function. The browser compresses the input to a maximum width of 1024 pixels before generation. Gemini returns image data; the guest display applies a smaller branded preview. Digital download and generation code remain in place.

The existing save-generation helper uploads to the public `generations` bucket and records a generation row. It does not provide a private print master or return a saved generation ID to its caller. Input compression dimensions do not establish the generated image's dimensions. The new print path captures the original returned PNG/JPEG before guest preview processing, measures it, and saves a separate private master after sign-in. Old public gallery images are not silently declared print-ready originals.

Existing payments use Paystack for credit packs/subscriptions. The signed webhook and server transaction verification are reused; print references branch into separate print payment records and fulfillment jobs. Existing credit and subscription behavior is retained.

Existing migrations describe runtime generation reservations, payments and workspace features, but do not include a complete baseline for profiles, generations or storage. Production schema and existing RLS must be checked before migration. New print tables prohibit direct anonymous/authenticated access: authenticated Edge Function projections expose only the customer's orders and retail values. Administrator authority requires trusted `app_metadata.print_admin`, not user-editable metadata. No existing print admin UI was found.

## Generation failure and cost audit

The supplied 403 log explicitly reports `API_KEY_HTTP_REFERRER_BLOCKED`. A browser-restricted Google key is unsuitable for this server request with no HTTP referrer. Funding an account does not override that restriction. Configure a dedicated server-side key in the billed project, restrict it to the required API, and keep it in Supabase secrets. Do not add a forged Referer header or expose the key to the browser. The later configuration log only proves a key string exists; it does not prove a successful generation.

Also inspect the generation runtime enabled flag and `disabled_until`, which can keep generation unavailable after a provider failure. Verify a new request and its provider response before clearing the incident. These production settings were not changed here.

Reservations limit access and refund credits on failures, but failures do not count toward the existing guest successful/pending daily total. Repeated failure loops therefore need operational attention. The public `analyze-concept` endpoint also makes unmetered Gemini requests; it needs its own authentication/rate and spend controls in a separate generation-hardening change. Account credits are not a cloud spending cap. Review provider request counts, model usage, API-key/project ownership, retries, quotas and billing exports. No actual spend can be calculated from this repository. A successful upstream image lost during later processing can still incur charges. Preview changes introduced here make no AI calls.

Google billing reference: https://ai.google.dev/gemini-api/docs/billing

## Implemented architecture

1. Original sketch -> local 24-hour draft -> deterministic frame/room preview.
2. Authenticated original upload -> private `print-files` master -> pixel/physical-size validation -> lossless PNG layout.
3. Approved variant + destination -> provider quote or configured Nigerian shipping -> fixed retail price and minimum-margin checks -> expiring server quote.
4. Checkout -> Paystack server verification -> atomic paid order and unique job.
5. International worker -> reconcile existing provider reference -> refresh quote -> create only with verified live payment and live fulfillment enabled.
6. Nigeria -> paid `FULFILLMENT_REQUIRED` order -> staff production/dispatch/delivery controls. No Gelato or PictureFrames.ng API submission.
7. Customer order page, admin queue, tracking reconciliation, cancellation and independently verified refund completion.

The provider abstraction implements catalog search, variant validation, quotes, create/search/get/cancel and webhook reconciliation. Provider names, wholesale costs, API identifiers and internal notes are absent from customer projections. Full costs remain available to staff.

Four static photorealistic room backdrops now replace the original flat illustrations. The built-in image-generation tool created these assets once during development; runtime canvas rendering composites the unchanged artwork with approximate furniture-relative scale, white padding, frame bevels and soft wall shadows. Product view enlarges the same artwork for inspection. No Google calls, filters, cropping or generative redraw occur on frame, size or room changes. See `assets/images/print-rooms/README.md` for asset provenance and prompts.

Print quality uses actual pixels divided by the physical artwork area in inches. Each configured variant requires at least 150 PPI and can require more. No upscaling is performed. For reference, 1024 pixels span approximately 6.8 inches at 150 PPI, not a large wall print. Current server processing caps are 15 MB input, 8 megapixels decoded, and 12 megapixels exported; production Edge memory/CPU testing remains required. PNG output retains opaque source pixels exactly and composites transparency on white. Bleed/borders and provider acceptance must be validated for each approved SKU. Canvas is deliberately unavailable until a wrap-specific export layout and an approved SKU exist.

## Files and database

Existing changes: sketch result CTA, dashboard orders link, service-worker assets, Supabase function config, Paystack print-reference hook. New modules: `assets/js/print-*.mjs`, print stylesheet, `/print/`, `/print-orders/`, `/admin/print-orders/`, shared server print modules, `print-orders`, `print-worker`, `print-webhook`, and `20260912_print_orders.sql`.

The migration introduces products, variants, artwork masters, quotes, orders, unique jobs, audit events and persistent rate limits. Orders snapshot all accepted prices and delivery details. Row locking, unique payment references/transaction IDs and a submission uncertainty marker prevent blind duplicate fulfillment. Unknown provider POST outcomes require reconciliation, never an automatic second order. Private signed file links are temporary bearer links and must not be logged or shared publicly.

## Verified versus outstanding

Local PostgreSQL-compatible migration tests cover payment amounts/currency, duplicate checkout/payment, ownership, RLS privileges, Nigeria routing, locking, late payments after cancellation, and rate limits. Unit tests cover resolution, margins, provider request payloads, source pixel preservation and split shipment states. Deno checks pass for all four affected Edge Functions. Playwright fixtures verify responsive preview and resolution-disabled sizes at 1440, 390 and 320 pixels.

Not verified against live services: deployed migrations, real authenticated checkout, account-specific USD acceptance, webhook delivery, Gelato PNG/SKU preflight, real print quality, production memory limits, scheduled worker execution or physical fulfillment. No real provider order or payment was submitted. See `supabase/PRINT_DEPLOYMENT.md` for the staged launch gates.
