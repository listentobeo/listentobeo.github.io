# Print pricing setup — 13 September 2026

## Current live state

### Subsequent launch request

The owner subsequently requested enabling checkout/fulfillment and pushing the implementation. All twelve verified variants and their premium-print product are now active. `PRINT_CHECKOUT_ENABLED=true` and `PRINT_LIVE_FULFILLMENT_ENABLED=true`. The authenticated worker is scheduled every minute through Supabase Cron/pg_net, with its existing credential stored in Vault (never in Git).

**Payment blocker:** a live-key USD checkout initialization probe returned `Currency not supported by merchant`. No charge or order was made. `PRINT_USD_PAYMENTS_ENABLED=false` is intentionally retained; the public catalog reports customer checkout disabled and explains the USD restriction, while permitting previews and live quotes. Paystack must enable USD for this account, or the owner must approve another payment integration/currency strategy. Do not pretend enabling a flag grants merchant currency support.

The inactive JSON variant templates and the following quote-stage checkpoint are historical verification artifacts; live activation was a separate explicit owner-authorized action. 20 × 30 cm remains unconfigured. Webhook delivery and an actual paid physical order have not been verified.

### Earlier quote-stage checkpoint

The shipping migration and updated `print-orders` / `print-worker` functions were deployed to project `wphqcccliiwdvwdjgrmc`. Twelve inactive variants are saved: portrait and landscape for six exact metric sizes. Checkout, USD payments and live fulfillment remain disabled; no orders were created.

| Approved size | Artwork USD | SKU verification |
| --- | ---: | --- |
| 13 × 18 cm | 14.99 | Verified, both orientations |
| 20 × 25 cm | 19.99 | Verified, both orientations |
| 20 × 30 cm | 24.99 | Pending: no exact match found; not configured |
| 30 × 40 cm | 34.99 | Verified, both orientations |
| 30 × 45 cm | 39.99 | Verified, both orientations |
| 40 × 50 cm | 49.99 | Verified, both orientations |
| 50 × 70 cm | 69.99 | Verified, both orientations |

Exact UIDs and configuration are in `print-approved-variants.json`. Every listed UID was read from Gelato's Premium Matte Paper Poster UI, then verified through the authenticated individual-product API, including printable status, activation and exact width/height in mm. SKUs were not constructed from a naming pattern. Frames were not added at unframed artwork prices.

The poster catalog's full format list and the fine-art/fine-art-framed-poster format lists did not contain exact 20 × 30 cm. A4 is 21 × 29.7 cm, not an approved substitute. Keep this size unresolved until Gelato supplies an exact compatible UID or the owner explicitly approves a different size.

## Pricing rules

- All amounts are integer currency subunits: $14.99 = 1499.
- Gelato variants require `shipping_price_mode: "live_buffer"`.
- `shipping_buffer_bps: 1000` means 10%. Customer delivery = live shipping-method cost × 1.10, rounded **up** to the nearest cent. This field is configurable per variant in the admin JSON editor.
- `retail_shipping_price: 0` on the variant is an unused legacy placeholder, not free shipping or a global delivery fee. Actual shipping is calculated separately for every returned method and exact recipient address.
- Artwork prices remain as approved. Unsafe options are blocked, not silently repriced.
- `minimum_margin: 700` is enforced for USD, including a server-side $7 floor and a database constraint.
- The existing `cost_buffer_bps: 1000` is a separate conservative reserve on combined provider product + delivery costs. The margin check retains that reserve. It is not a second shipping surcharge. Gross margin is before payment fees and other taxes/expenses.
- A provider re-quote before fulfillment rechecks margin against the **already charged** artwork/delivery/total. It never raises or lowers a paid order's customer total.
- Customer responses expose artwork, delivery, total and estimated delivery window. Wholesale costs and provider identifiers remain in administrator/server-only data.

## Live quote evidence

`print-live-quote-verification.json` records 168 successful quote responses: 6 sizes × 2 orientations × 14 cities. In total, 632 shipping methods were returned. Full method details, including private cost/margin diagnostics, are recorded in server-side `print_events` under `QUOTE_VERIFIED`, not in customer responses or the public report.

Cities: New York, Los Angeles; London, Manchester; Toronto, Vancouver; Berlin, Munich; Paris, Lyon; Amsterdam, Rotterdam; Sydney, Melbourne. Quote-only fixtures in `tests/fixtures/print-launch-addresses.json` use public-location addresses with synthetic contact details. **Never submit orders to these fixtures.**

- 156 size/orientation/city checks have margin-safe delivery methods.
- 12 checks are correctly blocked: both 13 × 18 cm orientations in Toronto, Vancouver, Paris, Lyon, Amsterdam and Rotterdam. These fail the retained margin/cost-reserve rule at $14.99. Larger tested sizes passed in these cities.
- One 50 × 70 cm landscape Los Angeles request timed out; its retry succeeded.
- These are dated observations, not shipping rates to cache or hardcode. Customer quotes are fetched live and expire after 15 minutes.
- Quote API success with Gelato's documented sample PNG is **not** verification of a production print file, delivered print, webhook, scheduled worker or payment transaction.

## Safe rechecking and remaining launch work

Local Playwright UI verification used mocked delivery responses (not a payment): artwork $14.99 + standard delivery $5.39 = $20.38; selecting express changed total to $24.01; estimated dates were displayed; editing the city hid the stale quote; checkout remained disabled. The mock routes were removed afterwards. This UI check is separate from the 168 real provider quote checks above.

The admin-only `admin_get_variant`, `admin_provider_catalog` and `admin_test_quote` actions provide exact-product inspection and quote-only tests of inactive configured variants. The local admin UI adds a quote-verification form accepting `{ "variantId": "...", "address": { ... } }`. It cannot place an order. Use real customer addresses only with appropriate consent and never reuse the test fixture for fulfillment.

The migration `20260914_print_live_shipping.sql` was applied via Supabase's authenticated database query CLI, not a blanket `db push`. Do not blindly reapply it or unrelated historical migrations. Reconcile the project's migration history before future bulk pushes.

Keep the launch gates off. Resolve 20 × 30 cm, review blocked small-print destinations, verify production-file compatibility, and separately verify worker scheduling, webhook delivery and live USD payment support before launch. Frontend changes are local until the website's normal Git deployment is performed.
