-- Physical prints use existing auth/profiles. Credit/subscription orders remain untouched.
CREATE TABLE public.print_products (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), slug text NOT NULL UNIQUE,
 name text NOT NULL, product_type text NOT NULL CHECK(product_type IN('print','framed','canvas')),
 active boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.print_product_variants (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id uuid NOT NULL REFERENCES public.print_products(id),
 name text NOT NULL, provider text NOT NULL CHECK(provider IN('GELATO','MANUAL_NIGERIA')),
 provider_product_uid text, active boolean NOT NULL DEFAULT false, approved_at timestamptz,
 provider_validated_at timestamptz, provider_details jsonb,
 width_mm numeric NOT NULL CHECK(width_mm>0 AND width_mm<=1500),
 height_mm numeric NOT NULL CHECK(height_mm>0 AND height_mm<=1500),
 frame_style text NOT NULL DEFAULT 'none' CHECK(frame_style IN('none','black','white','oak','walnut')),
 frame_mm numeric NOT NULL DEFAULT 15 CHECK(frame_mm BETWEEN 0 AND 100),
 border_mm numeric NOT NULL DEFAULT 0 CHECK(border_mm>=0),
 bleed_mm numeric NOT NULL DEFAULT 0 CHECK(bleed_mm BETWEEN 0 AND 20),
 min_ppi integer NOT NULL DEFAULT 150 CHECK(min_ppi BETWEEN 150 AND 600),
 currency text NOT NULL CHECK(currency IN('NGN','USD')),
 retail_product_price integer NOT NULL CHECK(retail_product_price>0),
 retail_shipping_price integer NOT NULL CHECK(retail_shipping_price>=0),
 minimum_margin integer NOT NULL CHECK(minimum_margin>=0),
 cost_buffer_bps integer NOT NULL DEFAULT 1000 CHECK(cost_buffer_bps BETWEEN 0 AND 10000),
 manual_product_cost integer CHECK(manual_product_cost>=0), manual_shipping jsonb NOT NULL DEFAULT '[]',
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(border_mm*2<least(width_mm,height_mm)),
 CHECK((provider='MANUAL_NIGERIA' AND currency='NGN' AND provider_product_uid IS NULL)
    OR (provider='GELATO' AND currency='USD' AND length(provider_product_uid)>0)),
 CHECK(NOT active OR (approved_at IS NOT NULL AND (provider='MANUAL_NIGERIA' OR provider_validated_at IS NOT NULL)))
);
-- Intentionally no SKUs, prices, or active products invented during deployment.
INSERT INTO public.print_products(slug,name,product_type) VALUES
 ('premium-print','Premium art print','print'),('black-frame','Black framed print','framed'),
 ('white-frame','White framed print','framed'),('oak-frame','Oak framed print','framed');

CREATE TABLE public.print_artworks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.profiles(id),
 generation_id uuid, source_path text NOT NULL UNIQUE, sha256 text NOT NULL,
 pixel_width integer NOT NULL CHECK(pixel_width>0), pixel_height integer NOT NULL CHECK(pixel_height>0),
 mime_type text NOT NULL CHECK(mime_type IN('image/png','image/jpeg')),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id,sha256)
);
CREATE TABLE public.print_quotes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.profiles(id),
 artwork_id uuid NOT NULL REFERENCES public.print_artworks(id), variant_id uuid NOT NULL REFERENCES public.print_product_variants(id),
 provider text NOT NULL CHECK(provider IN('GELATO','MANUAL_NIGERIA')), currency text NOT NULL,
 country text NOT NULL, shipping_address jsonb NOT NULL, product_snapshot jsonb NOT NULL,
 print_file_path text NOT NULL, options jsonb NOT NULL, expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK((country='NG' AND provider='MANUAL_NIGERIA') OR (country<>'NG' AND provider='GELATO'))
);
CREATE TABLE public.print_orders (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.profiles(id),
 quote_id uuid NOT NULL UNIQUE REFERENCES public.print_quotes(id), artwork_id uuid NOT NULL REFERENCES public.print_artworks(id),
 provider text NOT NULL CHECK(provider IN('GELATO','MANUAL_NIGERIA')), country text NOT NULL,
 currency text NOT NULL CHECK(currency IN('NGN','USD')), product_snapshot jsonb NOT NULL,
 shipping_address jsonb NOT NULL, shipping_snapshot jsonb NOT NULL, print_file_path text NOT NULL,
 provider_product_cost integer NOT NULL, provider_shipping_cost integer NOT NULL, provider_total_cost integer NOT NULL,
 retail_product_price integer NOT NULL, retail_shipping_price integer NOT NULL, customer_total integer NOT NULL CHECK(customer_total>0),
 gross_margin integer NOT NULL, payment_reference text NOT NULL UNIQUE,
 payment_status text NOT NULL DEFAULT 'AWAITING_PAYMENT' CHECK(payment_status IN('AWAITING_PAYMENT','PAID','REFUND_PENDING','REFUNDED')),
 payment_transaction_id text UNIQUE, payment_domain text, paid_at timestamptz, amount_paid integer,
 checkout_url text, refund_id text, refund_error text,
 fulfillment_status text NOT NULL DEFAULT 'DRAFT' CHECK(fulfillment_status IN
 ('DRAFT','FULFILLMENT_PENDING','FULFILLMENT_REQUIRED','PROCESSING','SHIPPED','DELIVERED','FULFILLMENT_FAILED','CANCELLED','REFUNDED')),
 provider_order_id text UNIQUE, provider_order_ids jsonb NOT NULL DEFAULT '[]',
 submission_started_at timestamptz, submission_uncertain boolean NOT NULL DEFAULT false,
 fulfillment_error text, fulfillment_notes text NOT NULL DEFAULT '', tracking jsonb NOT NULL DEFAULT '[]',
 operation_token uuid, operation_started_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK((country='NG' AND provider='MANUAL_NIGERIA' AND provider_order_id IS NULL) OR (country<>'NG' AND provider='GELATO')),
 CHECK(customer_total=retail_product_price+retail_shipping_price),
 CHECK(provider_total_cost=provider_product_cost+provider_shipping_cost),
 CHECK(gross_margin=customer_total-provider_total_cost)
);
CREATE INDEX print_orders_owner_idx ON public.print_orders(user_id,created_at DESC);
CREATE TABLE public.print_jobs (
 order_id uuid PRIMARY KEY REFERENCES public.print_orders(id), status text NOT NULL DEFAULT 'pending'
 CHECK(status IN('pending','running','failed','done')), attempts integer NOT NULL DEFAULT 0,
 error text, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.print_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid REFERENCES public.print_orders(id),
 source text NOT NULL, event_key text UNIQUE, event_type text NOT NULL, actor_id uuid,
 details jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.print_rate_limits (key text PRIMARY KEY, window_start timestamptz NOT NULL, hits integer NOT NULL);
DO $$DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['print_products','print_product_variants','print_artworks','print_quotes','print_orders','print_jobs','print_events','print_rate_limits'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM anon,authenticated',t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
 END LOOP;
END$$;
-- All reads use server projections so wholesale costs never reach customer clients.
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 VALUES('print-files','print-files',false,52428800,ARRAY['image/png','image/jpeg'])
 ON CONFLICT(id) DO NOTHING;

CREATE FUNCTION public.print_rate_limit(p_key text,p_limit integer,p_seconds integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n integer;BEGIN
 INSERT INTO print_rate_limits(key,window_start,hits) VALUES(p_key,now(),1)
 ON CONFLICT(key) DO UPDATE SET
 hits=CASE WHEN print_rate_limits.window_start<now()-make_interval(secs=>p_seconds) THEN 1 ELSE print_rate_limits.hits+1 END,
 window_start=CASE WHEN print_rate_limits.window_start<now()-make_interval(secs=>p_seconds) THEN now() ELSE print_rate_limits.window_start END
 RETURNING hits INTO n; RETURN n<=p_limit;
END$$;

CREATE FUNCTION public.print_checkout(p_quote_id uuid,p_user_id uuid,p_shipping_id text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE q print_quotes%ROWTYPE; opt jsonb; oid uuid;BEGIN
 SELECT * INTO q FROM print_quotes WHERE id=p_quote_id AND user_id=p_user_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Quote not found';END IF;
 SELECT id INTO oid FROM print_orders WHERE quote_id=q.id;
 IF FOUND THEN RETURN oid;END IF;
 IF q.expires_at<=now() THEN RAISE EXCEPTION 'Quote expired';END IF;
 IF NOT EXISTS(SELECT 1 FROM print_product_variants v JOIN print_products p ON p.id=v.product_id WHERE v.id=q.variant_id AND v.active AND p.active) THEN RAISE EXCEPTION 'Product unavailable';END IF;
 SELECT value INTO opt FROM jsonb_array_elements(q.options) WHERE value->>'id'=p_shipping_id;
 IF opt IS NULL THEN RAISE EXCEPTION 'Shipping option unavailable';END IF;
 INSERT INTO print_orders(user_id,quote_id,artwork_id,provider,country,currency,product_snapshot,shipping_address,shipping_snapshot,
 print_file_path,provider_product_cost,provider_shipping_cost,provider_total_cost,retail_product_price,retail_shipping_price,customer_total,gross_margin,payment_reference)
 VALUES(q.user_id,q.id,q.artwork_id,q.provider,q.country,q.currency,q.product_snapshot,q.shipping_address,opt,q.print_file_path,
 (opt->>'provider_product_cost')::integer,(opt->>'provider_shipping_cost')::integer,(opt->>'provider_total_cost')::integer,
 (opt->>'retail_product_price')::integer,(opt->>'retail_shipping_price')::integer,(opt->>'customer_total')::integer,
 (opt->>'gross_margin')::integer,'print-'||gen_random_uuid()) RETURNING id INTO oid;
 RETURN oid;
END$$;

CREATE FUNCTION public.print_accept_payment(p_reference text,p_transaction_id text,p_amount integer,p_currency text,p_domain text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o print_orders%ROWTYPE;BEGIN
 SELECT * INTO o FROM print_orders WHERE payment_reference=p_reference FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Print order not found';END IF;
 IF p_amount<>o.customer_total OR p_currency<>o.currency THEN RAISE EXCEPTION 'Payment mismatch';END IF;
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

CREATE FUNCTION public.print_lock_order(p_order_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE token uuid:=gen_random_uuid();BEGIN
 UPDATE print_orders SET operation_token=token,operation_started_at=now()
 WHERE id=p_order_id AND (operation_token IS NULL OR operation_started_at<now()-interval '5 minutes');
 IF NOT FOUND THEN RETURN NULL;END IF;RETURN token;
END$$;

CREATE FUNCTION public.print_refund_processed(p_reference text,p_amount integer,p_currency text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o print_orders%ROWTYPE;BEGIN
 SELECT * INTO o FROM print_orders WHERE payment_reference=p_reference FOR UPDATE;
 IF NOT FOUND THEN RETURN false;END IF;
 IF o.payment_status NOT IN('REFUND_PENDING','REFUNDED') OR p_amount<>o.customer_total OR p_currency<>o.currency THEN RAISE EXCEPTION 'Refund mismatch';END IF;
 UPDATE print_orders SET payment_status='REFUNDED',fulfillment_status='REFUNDED',updated_at=now() WHERE id=o.id;
 INSERT INTO print_events(order_id,source,event_key,event_type) VALUES(o.id,'paystack','refund:'||p_reference,'REFUND_PROCESSED') ON CONFLICT DO NOTHING;
 RETURN true;
END$$;
REVOKE ALL ON FUNCTION public.print_rate_limit(text,integer,integer),public.print_checkout(uuid,uuid,text),
 public.print_accept_payment(text,text,integer,text,text),public.print_lock_order(uuid),public.print_refund_processed(text,integer,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.print_rate_limit(text,integer,integer),public.print_checkout(uuid,uuid,text),
 public.print_accept_payment(text,text,integer,text,text),public.print_lock_order(uuid),public.print_refund_processed(text,integer,text) TO service_role;
