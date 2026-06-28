# Beo AI Tools deployment order

The frontend expects the stop-loss and creator-workspace migrations and Edge Functions to be deployed together.

## 1. Database

Apply these migrations in order:

1. 20260622_share_earn_referrals.sql
2. 20260627_stop_loss_conversion.sql
3. 20260628_creator_workspace.sql

The last migration preserves all existing balances and one-time package prices. Free users can create one active client project. Creator users can create 10; Studio users are unlimited.

## 2. Edge Functions

Deploy generate-sketch, mural-visualizer, referral-credit, and paystack-payment.

They use verify_jwt = false because bearer tokens are validated inside each function and the payment endpoint also accepts signed Paystack webhooks.

## 3. Secrets

Keep the existing Supabase and Gemini secrets, then set:

- PAYSTACK_SECRET_KEY
- PAYSTACK_CREATOR_PLAN_CODE
- PAYSTACK_STUDIO_PLAN_CODE
- REFERRAL_REFERRER_BONUS=1
- REFERRAL_REFERRED_BONUS=1
- REFERRAL_MAX_REFERRER_CREDITS=50

Create Paystack monthly plans for exactly NGN 6,000 and NGN 15,000 before setting the plan codes. The 30-day pass does not require a plan code.

## 4. Paystack webhook

Use https://wphqcccliiwdvwdjgrmc.supabase.co/functions/v1/paystack-payment

The function handles charge.success, subscription.create, subscription.disable, and invoice.payment_failed. Keep signature validation enabled by using the same Paystack secret configured in Supabase.

## 5. Safe launch

1. Leave app_runtime_settings.generation_enabled off until a small Gemini validation balance is loaded.
2. Test a credit-pack payment, Creator pass, Creator subscription, renewal webhook, duplicate webhook, and failed invoice.
3. Confirm request 26 is blocked when guest_daily_limit is 25.
4. Confirm a failed Gemini request refunds a member once or restores a guest retry.
5. Enable generation and deploy the frontend only after test-mode payment checks pass.
