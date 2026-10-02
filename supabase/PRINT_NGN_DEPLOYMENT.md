# Naira checkout rollout

International print variants, Gelato quotes and the minimum $7 gross margin remain
in USD internally. Customer quote line items and Paystack charges are now NGN.
Digital-credit payments are not changed.

## Exchange rate

The server uses https://open.er-api.com/v6/latest/USD (ExchangeRate-API's daily
reference rate, not a real-time executable bank rate). No customer data is sent.
The source requires attribution; the quote screen includes it. Each running
function instance caches valid data for one hour. Responses older than 36 hours,
invalid values, HTTP failures and conversion overflow block new quotes. There is
no guessed fallback rate or hidden FX markup. Amounts round up to whole kobo per
line item. A quote locks the rate and total for 15 minutes; an order retains that
snapshot permanently for verification and refunds. The cardholder's bank may
apply a different exchange rate and additional fees.

Payment currency/total are separate immutable order columns. Existing orders
retain their original payment amounts and currencies. New checkout requests must
confirm the displayed NGN total; pre-update quotes require a fresh quote.
The fulfillment worker rechecks USD costs and current FX before submission,
holding orders if the configured risk buffer or $7 margin would be breached.
It never increases a paid customer's charge. This is gross margin before fees;
bank spreads, payment fees and settlement timing still require business review.

## Production sequence

1. Confirm Paystack has approved international card acceptance for the merchant.
   NGN checkout initialization alone does not establish that a foreign card works.
2. Back up the database; apply ONLY
   `supabase/migrations/20260922_print_ngn_payments.sql` through Supabase SQL Editor
   or your approved migration process. It adds/backfills payment columns and
   replaces payment/refund validation atomically. Do not replay older migrations.
3. Authenticate locally if needed, then deploy from the repository root:

```powershell
npx.cmd supabase login
npx.cmd supabase functions deploy print-orders --project-ref wphqcccliiwdvwdjgrmc
npx.cmd supabase functions deploy print-worker --project-ref wphqcccliiwdvwdjgrmc
npx.cmd supabase functions deploy print-webhook --project-ref wphqcccliiwdvwdjgrmc
npx.cmd supabase functions deploy paystack-payment --project-ref wphqcccliiwdvwdjgrmc
```

4. Deploy the static frontend (print page, shop/orders modules, service worker).
   `PRINT_CHECKOUT_ENABLED` still controls checkout. `PRINT_USD_PAYMENTS_ENABLED`
   is no longer required or consulted by this checkout. Do not enable USD payment.
   Do not change fulfillment gates or product approvals to bypass validation.
5. Verify catalog, authenticated quotes, NGN line-item sum and confirmation button.
   Use a staging/test payment to verify duplicate callbacks, wrong amount/currency
   rejection, refund matching and no physical fulfillment from test payments.
   Any paid live order or physical production needs explicit approval.

```powershell
node --test tests/*.test.mjs
npx.cmd --yes deno check --config supabase/functions/deno.json supabase/functions/print-orders/index.ts supabase/functions/print-worker/index.ts supabase/functions/print-webhook/index.ts supabase/functions/paystack-payment/index.ts
```

Nigeria still requires approved manual products and delivery prices. This change
does not invent those products or unblock unavailable destinations.

References:
- https://support.paystack.com/en/articles/2130690
- https://paystack.com/docs/api/transaction/
- https://paystack.com/docs/payments/verify-payments/
- https://www.exchangerate-api.com/docs/free
