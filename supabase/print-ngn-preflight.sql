-- Read-only release check; run in the target project's SQL Editor.
select current_database() as database, now() as checked_at;
select column_name, data_type from information_schema.columns
where table_schema='public' and table_name='print_orders'
  and column_name in ('payment_currency','payment_total','payment_snapshot');
select count(*) as total_orders,
  count(*) filter(where payment_status='PAID') as paid_orders
from public.print_orders;
select proname, pg_get_functiondef(oid) as definition from pg_proc
where pronamespace='public'::regnamespace
  and proname in ('print_accept_payment','print_refund_processed');
