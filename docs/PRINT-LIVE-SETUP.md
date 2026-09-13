# Live setup checkpoint — 13 September 2026

This is the earlier connection-only checkpoint. The later approved pricing and quote configuration is documented in [PRINT-PRICING-VERIFICATION.md](PRINT-PRICING-VERIFICATION.md).

Verified through the logged-in Playwright browser and the Beo admin UI:

- Print administrator access is working.
- `admin_setup_check` successfully called Gelato's catalog-list API.
- Gelato and Paystack keys, worker secret and webhook token are present (values not accessed).
- Checkout, USD payments and live fulfillment flags are all false.
- Zero configured variants; all four starter products are inactive.
- Secret presence is not verification of webhook delivery, cron execution or supported Paystack currencies.

## Candidate, not approved or activated

Gelato product page: Premium Matte Paper Poster, 200 gsm / 80 lb, uncoated, matte, paper thickness 0.26 mm. Selected catalog size is labeled 13x18 cm / 5x7 inches. Use exact metric dimensions, not a rounded inch conversion.

- Portrait UID: `flat_130x180-mm-5r_200-gsm-80lb-uncoated_4-0_ver` — 130 by 180 mm.
- Landscape UID: `flat_130x180-mm-5r_200-gsm-80lb-uncoated_4-0_hor` — 180 by 130 mm.
- Source: https://dashboard.gelato.com/catalogue/categories/bestsellers/products/premium-uncoated-paper-posters;productUid=flat_130x180-mm-5r_200-gsm-80lb-uncoated_4-0_ver
- Beo premium-print product ID: `031b8c10-56ec-4da8-905b-bb148a7358c1`.

UIDs were read from the product page after changing orientation. Individual API variant validation, file specification/preflight and destination quotes remain pending. Catalog search results may contain nullable `isPrintable` fields; search responses must not be treated as definitive individual-product preflight.

No retail price, shipping charge or margin was invented. Product-page EUR figures included a temporary promotion and excluded VAT, and are not configured USD quotes. The displayed Gelato destination was Nigeria; it was not used to submit a quote/order and does not alter Beo's Nigeria-manual routing.

No variants, store products, templates, orders, webhooks or payment settings were saved/activated during this checkpoint. A product editor opened while browsing and was exited without saving or adding to an order.

Next: obtain approval of starter product and retail/shipping prices, confirm USD payment capability, validate exact product API data and print file specifications, then configure approved variants. Nigeria requires independent approved local costs and shipping coverage. Verify worker scheduling and webhook delivery before enabling live fulfillment.
