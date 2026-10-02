-- Preserve provider/base pricing; payment snapshots are a separate currency.
begin;
alter table public.print_orders
 add column payment_currency text,
 add column payment_total integer,
 add column payment_snapshot jsonb;
-- Existing checkout links and payments retain their original currency/amount.
update public.print_orders set payment_currency=currency,payment_total=customer_total;
alter table public.print_orders
 alter column payment_currency set not null,
 alter column payment_total set not null,
 add constraint print_payment_currency_check check(payment_currency in ('USD','NGN')),
 add constraint print_payment_total_check check(payment_total>0);
create function public.print_payment_snapshot_guard()
returns trigger language plpgsql set search_path=public as $$
declare p jsonb;
begin
 if TG_OP='UPDATE' then
  if NEW.payment_currency is distinct from OLD.payment_currency or
     NEW.payment_total is distinct from OLD.payment_total or
     NEW.payment_snapshot is distinct from OLD.payment_snapshot then
   raise exception 'Payment snapshot is immutable';
  end if;
  return NEW;
 end if;
 p := NEW.shipping_snapshot->'payment';
 if p is not null then
  if p->>'currency' is distinct from 'NGN' or
     p->>'base_currency' is distinct from NEW.currency or
     (p->>'base_total')::integer is distinct from NEW.customer_total or
     (p->>'customer_total')::integer is distinct from
       ((p->>'retail_product_price')::integer+(p->>'retail_shipping_price')::integer) or
     coalesce((p->>'rate')::numeric,0)<=0 or
     (p->>'retail_product_price')::numeric is distinct from ceil(NEW.retail_product_price*(p->>'rate')::numeric) or
     (p->>'retail_shipping_price')::numeric is distinct from ceil(NEW.retail_shipping_price*(p->>'rate')::numeric)
  then raise exception 'Invalid payment snapshot';end if;
  NEW.payment_currency := p->>'currency';
  NEW.payment_total := (p->>'customer_total')::integer;
  NEW.payment_snapshot := p;
 else
  NEW.payment_currency := NEW.currency;NEW.payment_total := NEW.customer_total;
 end if;
 return NEW;
end$$;
create trigger print_payment_snapshot_guard before insert or update on public.print_orders
 for each row execute function public.print_payment_snapshot_guard();
revoke all on function public.print_payment_snapshot_guard() from public,anon,authenticated;
CREATE OR REPLACE FUNCTION public.print_accept_payment(p_reference text,p_transaction_id text,p_amount integer,p_currency text,p_domain text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o print_orders%ROWTYPE;BEGIN
 SELECT * INTO o FROM print_orders WHERE payment_reference=p_reference FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Print order not found';END IF;
 IF p_amount IS DISTINCT FROM o.payment_total OR p_currency IS DISTINCT FROM o.payment_currency THEN RAISE EXCEPTION 'Payment mismatch';END IF;
 IF o.payment_status<>'AWAITING_PAYMENT' THEN
  IF o.payment_transaction_id<>p_transaction_id THEN RAISE EXCEPTION 'Transaction mismatch';END IF;
  RETURN o.id;
 END IF;
 UPDATE print_orders SET payment_status='PAID',amount_paid=p_amount,payment_transaction_id=p_transaction_id,payment_domain=p_domain,paid_at=now(),
 fulfillment_status=CASE WHEN o.fulfillment_status='CANCELLED' THEN 'CANCELLED' WHEN provider='MANUAL_NIGERIA' THEN 'FULFILLMENT_REQUIRED' ELSE 'FULFILLMENT_PENDING' END,
 updated_at=now() WHERE id=o.id;
 IF o.provider='GELATO' AND o.fulfillment_status<>'CANCELLED' THEN INSERT INTO print_jobs(order_id) VALUES(o.id) ON CONFLICT DO NOTHING;END IF;
 INSERT INTO print_events(order_id,source,event_key,event_type) VALUES(o.id,'paystack','paid:'||p_reference,'PAYMENT_VERIFIED') ON CONFLICT DO NOTHING;
 RETURN o.id;
END$$;


CREATE OR REPLACE FUNCTION public.print_refund_processed(p_reference text,p_amount integer,p_currency text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o print_orders%ROWTYPE;BEGIN
 SELECT * INTO o FROM print_orders WHERE payment_reference=p_reference FOR UPDATE;
 IF NOT FOUND THEN RETURN false;END IF;
 IF o.payment_status NOT IN('REFUND_PENDING','REFUNDED') OR p_amount IS DISTINCT FROM o.payment_total OR p_currency IS DISTINCT FROM o.payment_currency THEN RAISE EXCEPTION 'Refund mismatch';END IF;
 UPDATE print_orders SET payment_status='REFUNDED',fulfillment_status='REFUNDED',updated_at=now() WHERE id=o.id;
 INSERT INTO print_events(order_id,source,event_key,event_type) VALUES(o.id,'paystack','refund:'||p_reference,'REFUND_PROCESSED') ON CONFLICT DO NOTHING;
 RETURN true;
END$$;

commit;

