# Physical print deployment and operations

This feature is fail-closed. No business prices or provider SKUs are seeded, and all four starter products are inactive. Deploying code alone does not enable ordering.

## Official API references checked

- Gelato catalogs: https://dashboard.gelato.com/docs/products/catalog/list/
- Gelato quotes: https://dashboard.gelato.com/docs/orders/v4/quote/
- Gelato API documentation: https://dashboard.gelato.com/docs/
- Gelato webhooks: https://dashboard.gelato.com/docs/webhooks/
- Paystack verification/API: https://paystack.com/docs/api/
- Paystack webhook authentication: https://paystack.com/docs/payments/webhooks/
- Paystack refunds: https://paystack.com/docs/api/refund/

The adapter uses `X-API-KEY` with `product.gelatoapis.com/v3/catalogs`, catalog `products:search`, and `/v3/products/{uid}`. Quotes use `order.gelatoapis.com/v4/orders:quote`; create/get/search/cancel use v4 orders endpoints. Quote shipping methods supply delivery estimates and wholesale prices. A destination must pass both product-country validation and a fresh quote. A catalog entry alone does not prove availability or print-file compatibility.

The inspected docs did not establish a separate sandbox hostname, a create-order idempotency header, or an HMAC webhook signature. None is invented. Local tests use provider fixtures. Obtain account-specific testing guidance from Gelato before a production preflight. The webhook uses a long random URL token and independently rereads the order through the authenticated API, rather than trusting incoming statuses. Treat the token as a secret; avoid query-string logging.

## Deployment order

Live diagnostic on 13 September 2026: the public `print-orders` catalog endpoint returned HTTP 404 (`Requested function was not found`). A saved Gelato key does not deploy the function or its database schema.

After checking/applying the print migration, authenticate the Supabase CLI locally (`npx.cmd supabase login`), then deploy these four functions from the repository:

```powershell
npx.cmd supabase functions deploy print-orders --project-ref wphqcccliiwdvwdjgrmc
npx.cmd supabase functions deploy print-worker --project-ref wphqcccliiwdvwdjgrmc
npx.cmd supabase functions deploy print-webhook --project-ref wphqcccliiwdvwdjgrmc
npx.cmd supabase functions deploy paystack-payment --project-ref wphqcccliiwdvwdjgrmc
```

Do not deploy the payment hook before its print migration is installed. After deployment, sign in as the approved print administrator, open Approved product configuration, and click **Check setup & Gelato connection**. This reads server secret-presence flags and calls the documented catalog-list API; it never returns a key or creates an order. It does not replace checkout/webhook/worker testing. Use the returned catalog UIDs to inspect actual products, then explicitly approve SKUs and business prices. Keep live fulfillment disabled during setup.

1. Back up and inspect the actual Supabase schema. The repository lacks the complete original profiles/generations baseline. Apply `migrations/20260912_print_orders.sql` first in a nonproduction project; do not run it twice manually. Confirm all new tables and RPCs reject anon/authenticated direct access, and the `print-files` bucket is private with no broad storage policies.
2. Deploy `print-orders`, `print-worker`, `print-webhook` and the changed `paystack-payment` together using the checked-in function configuration. The print functions have gateway JWT verification disabled because they verify user JWTs or dedicated webhook/worker credentials internally. Do not remove those internal checks.
3. Set server secrets via Supabase's secure secret interface, never frontend code: `GELATO_API_KEY`, `PAYSTACK_SECRET_KEY`, random independent `PRINT_WORKER_SECRET` and `GELATO_WEBHOOK_TOKEN`. Supabase supplies its URL and service-role key in the Edge environment. Initially set `PRINT_CHECKOUT_ENABLED=false`, `PRINT_LIVE_FULFILLMENT_ENABLED=false`, `PRINT_USD_PAYMENTS_ENABLED=false`.
4. Grant one deliberately chosen staff account `print_admin: true` in trusted auth app metadata using an administrator/service-role operation. Preserve all its other app metadata. Sign in again to refresh its token. Never grant this role through user metadata or expose the service-role key.
5. Configure the signed Paystack webhook at the existing `paystack-payment` endpoint. Print payment references are prefixed `print-`. Register Gelato's callback as `https://<project>.supabase.co/functions/v1/print-webhook?token=<secret>` for order status and tracking events.
6. Schedule an authenticated POST to `/functions/v1/print-worker` once per minute with header `x-print-worker-secret`. Use Supabase Cron/pg_net with the secret retrieved from Vault, or your existing trusted scheduler. Do not put the secret in a public repository. Alert on failed jobs and old pending/running jobs. Each invocation handles at most three jobs; monitor queue age and scale deliberately.
7. Deploy the static pages/modules and verify service-worker refresh, old sketch generation/download, sign-in return path, and print order pages. Do not enable live fulfillment until all launch gates below pass.

## Product approval

Use `/admin/print-orders/` to read the seeded product IDs, search a known provider catalog, and deliberately configure variants with the JSON editor. Catalog search is a staff discovery aid, not bulk publication. Supply actual approved values; there is no production-ready example SKU or price.

Required variant fields: `product_id`, `name`, `provider` (`GELATO` or `MANUAL_NIGERIA`), `width_mm`, `height_mm`, `frame_style`, `frame_mm`, `border_mm`, `bleed_mm`, `min_ppi`, `currency`, `retail_product_price`, `retail_shipping_price`, `minimum_margin`, `cost_buffer_bps`, and `active`. Gelato additionally requires the exact `provider_product_uid`. Check the explicit approval box to activate. The server validates printable provider details but staff must confirm the SKU's dimensions, paper, frame, export specification and destination compatibility. Canvas remains disabled.

All price/cost fields are integer currency subunits, not floating major units. International variants currently use USD, Nigerian variants NGN. Retail artwork and shipping are your configured selling prices; provider quotes supply hidden costs. No FX rate is guessed. Gross margin is retail total minus provider costs; the configured buffer is an additional safety check, not a promise covering every tax or surcharge. Account for payment fees, taxes and operational overhead in your approved margin. USD checkout must remain disabled unless Paystack explicitly supports USD collection on your account.

Nigeria additionally needs `manual_product_cost` and `manual_shipping`, an array of approved objects containing `id`, `name`, `cost`, `min_days`, `max_days`, and optionally exact-match `states`. An empty states list covers every state; use that only when the shipping price genuinely applies nationwide. No placeholder shipping amounts are supplied. Staff place the production job manually through PictureFrames.ng after verified payment; the customer sees only Beo.

## Staged launch gates

- Run `npm.cmd ci`, `npm.cmd test`, and `npx.cmd --yes deno check --config supabase/functions/deno.json supabase/functions/print-orders/index.ts supabase/functions/print-worker/index.ts supabase/functions/print-webhook/index.ts supabase/functions/paystack-payment/index.ts`.
- Test authenticated ownership isolation with two real staging users; a regular user must not access admin actions or another user's master/order.
- Approve test catalog variants and confirm generated PNG dimensions, padding, physical print area and original resolution against provider file requirements. Test production Edge memory/CPU with realistic maximum images. An accepted quote is not print-file preflight approval.
- Use Paystack test credentials for checkout/webhook/duplicate delivery/refund tests. Confirm exact amount/currency checks and one durable job. Test payments can never create Gelato physical orders. Nigerian test orders enter a manual queue: do not mistake test payment domain for a live paid production job.
- Test unknown provider response, repeated webhook, worker interruption, failed/refreshed quote and margin rejection using fixtures or an explicitly approved provider test facility. Confirm no blind resubmission.
- Configure worker, alerting and webhook delivery; reconcile dashboard status and split-shipment tracking.
- Obtain business approval for products, retail prices, supported delivery destinations, shipping policy, taxes/customs, refunds, privacy/data retention and production sample quality.
- Only then switch to live Paystack credentials, enable USD if supported, and enable checkout/live fulfillment. Any first real paid order or physical sample requires explicit operator approval; none has been placed by this implementation.

## Recovery and operations

The admin page shows provider costs/margins, verification state, fulfillment errors, notes, audit history and temporary source/export links. Nigeria staff progress paid live jobs from required to processing, shipped, delivered and enter tracking manually. Do not fulfill a `payment_domain=test` record.

International retries first search the provider by our order reference. Once submission began, a timeout is uncertain, not proof of failure. Sync/search the provider dashboard. Only use the explicit 'confirm not submitted' operation after confirming absence, entering the order ID and recording the reason. Provider cancellation can be rejected after printing; do not promise a refund before resolving fulfillment.

Cancellation and refund are separate. Refund requests first persist a pending state. A timeout is not a completed or failed refund. Sync the stored refund ID, or reconcile the provider dashboard and supply its verified numeric refund ID. The server checks transaction, amount and currency. Only a processed provider refund marks the order refunded. Do not blindly repeat a refund with an unknown outcome.

Keep fulfillment jobs and payment audit history for the approved retention period. Define an operator-owned cleanup policy for abandoned private masters, expired quote exports and stale rate-limit rows; none are automatically deleted in this migration. Expired local drafts are removed on their next read. Ensure storage cleanup never deletes files for active paid orders. Customer addresses, notes and signed URLs must not enter analytics or public logs.

## Rollback

Disable checkout and live fulfillment first. Do not delete paid orders, jobs, events or private files. Keep webhook verification and customer tracking running for existing orders; reconcile any in-flight submissions. Static CTA can be hidden while the original sketch/download tool continues operating. Never reverse the schema by dropping financial records.
