-- Keep payment/fulfillment environment gates disabled during catalog verification.
begin;
alter table public.print_product_variants
  add column if not exists shipping_price_mode text not null default 'fixed',
  add column if not exists shipping_buffer_bps integer not null default 1000;
alter table public.print_product_variants
  add constraint print_shipping_mode_check check (shipping_price_mode in ('fixed', 'live_buffer')),
  add constraint print_shipping_buffer_check check (shipping_buffer_bps between 0 and 10000);
-- International shipping is always a live quote. Legacy fixed shipping is retained
-- only for the separately managed Nigerian fulfillment route.
update public.print_product_variants set shipping_price_mode = 'live_buffer',
  minimum_margin = greatest(minimum_margin, 700) where provider = 'GELATO';
alter table public.print_product_variants
  add constraint print_gelato_live_shipping_check check
    (provider <> 'GELATO' or (shipping_price_mode = 'live_buffer' and minimum_margin >= 700));
commit;
