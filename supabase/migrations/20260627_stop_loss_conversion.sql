-- Stop-loss controls, verified payments, and purchase-qualified referrals.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS public.app_runtime_settings (
  setting_key text PRIMARY KEY,
  generation_enabled boolean NOT NULL DEFAULT false,
  guest_daily_limit integer NOT NULL DEFAULT 25 CHECK (guest_daily_limit >= 0),
  disabled_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.app_runtime_settings (setting_key,generation_enabled,guest_daily_limit)
VALUES ('global',false,25)
ON CONFLICT (setting_key) DO UPDATE SET guest_daily_limit=EXCLUDED.guest_daily_limit;
CREATE TABLE IF NOT EXISTS public.generation_daily_usage (
  usage_date date PRIMARY KEY,
  guest_reserved integer NOT NULL DEFAULT 0 CHECK (guest_reserved>=0),
  guest_succeeded integer NOT NULL DEFAULT 0 CHECK (guest_succeeded>=0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.guest_retry_entitlements (
  visitor_id text PRIMARY KEY,
  remaining integer NOT NULL DEFAULT 1 CHECK (remaining IN (0,1)),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.generation_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  visitor_id text, client_ip text, tool_name text NOT NULL,
  access_type text NOT NULL CHECK (access_type IN ('guest','member')),
  guest_claim_source text CHECK (guest_claim_source IS NULL OR guest_claim_source IN ('fresh','retry')),
  status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved','succeeded','failed')),
  credit_reserved boolean NOT NULL DEFAULT false,
  failure_code text, created_at timestamptz NOT NULL DEFAULT now(), finalized_at timestamptz
);
CREATE INDEX IF NOT EXISTS generation_attempts_user_idx ON public.generation_attempts(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS generation_attempts_visitor_idx ON public.generation_attempts(visitor_id,created_at DESC);
CREATE INDEX IF NOT EXISTS generation_attempts_status_idx ON public.generation_attempts(status,created_at);
CREATE TABLE IF NOT EXISTS public.payment_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  package_id text NOT NULL CHECK (package_id IN ('starter','creator','studio')),
  expected_amount integer NOT NULL CHECK (expected_amount>0),
  credits integer NOT NULL CHECK (credits>0),
  currency text NOT NULL DEFAULT 'NGN' CHECK (currency='NGN'),
  status text NOT NULL DEFAULT 'initialized' CHECK (status IN ('initialized','paid','failed')),
  provider_transaction_id text, provider_channel text,
  created_at timestamptz NOT NULL DEFAULT now(), paid_at timestamptz, fulfilled_at timestamptz
);
CREATE INDEX IF NOT EXISTS payment_orders_user_idx ON public.payment_orders(user_id,created_at DESC);
ALTER TABLE public.app_runtime_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generation_daily_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guest_retry_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generation_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referrals ADD COLUMN IF NOT EXISTS referred_credits_awarded integer NOT NULL DEFAULT 0;
ALTER TABLE public.profiles ALTER COLUMN credits SET DEFAULT 1;
CREATE OR REPLACE FUNCTION public.enforce_new_profile_credit_policy()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.credits IS NULL OR NEW.credits=2 THEN NEW.credits:=1; END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS zz_enforce_new_profile_credit_policy ON public.profiles;
CREATE TRIGGER zz_enforce_new_profile_credit_policy BEFORE INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.enforce_new_profile_credit_policy();

CREATE OR REPLACE FUNCTION public.reserve_generation(
 p_user_id uuid,p_visitor_id text,p_ip text,p_tool_name text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
 s public.app_runtime_settings%ROWTYPE; attempt uuid; balance integer;
 retry_count integer; claimed boolean; claim_source text;
BEGIN
 SELECT * INTO s FROM public.app_runtime_settings WHERE setting_key='global';
 IF NOT FOUND OR NOT s.generation_enabled THEN
  RETURN jsonb_build_object('allowed',false,'code','AI_UNAVAILABLE');
 END IF;
 IF s.disabled_until IS NOT NULL AND s.disabled_until>now() THEN
  RETURN jsonb_build_object('allowed',false,'code','AI_UNAVAILABLE',
   'retryAfterSeconds',greatest(1,floor(extract(epoch FROM (s.disabled_until-now())))::integer));
 END IF;
 IF p_user_id IS NOT NULL THEN
  SELECT credits INTO balance FROM public.profiles WHERE id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('allowed',false,'code','PROFILE_NOT_FOUND'); END IF;
  IF coalesce(balance,0)<1 THEN RETURN jsonb_build_object('allowed',false,'code','NO_CREDITS'); END IF;
  UPDATE public.profiles SET credits=credits-1 WHERE id=p_user_id;
  INSERT INTO public.generation_attempts(user_id,tool_name,access_type,credit_reserved)
  VALUES(p_user_id,p_tool_name,'member',true) RETURNING id INTO attempt;
  RETURN jsonb_build_object('allowed',true,'attemptId',attempt,'accessType','member');
 END IF;
 IF p_visitor_id IS NULL OR btrim(p_visitor_id)='' THEN
  RETURN jsonb_build_object('allowed',false,'code','TRIAL_USED');
 END IF;
 INSERT INTO public.generation_daily_usage(usage_date) VALUES(current_date)
 ON CONFLICT(usage_date) DO NOTHING;
 PERFORM 1 FROM public.generation_daily_usage WHERE usage_date=current_date FOR UPDATE;
 IF (SELECT guest_reserved+guest_succeeded FROM public.generation_daily_usage
     WHERE usage_date=current_date)>=s.guest_daily_limit THEN
  RETURN jsonb_build_object('allowed',false,'code','DAILY_FREE_LIMIT');
 END IF;
 SELECT remaining INTO retry_count FROM public.guest_retry_entitlements
 WHERE visitor_id=p_visitor_id FOR UPDATE;
 IF FOUND AND retry_count>0 THEN
  UPDATE public.guest_retry_entitlements SET remaining=0,updated_at=now()
  WHERE visitor_id=p_visitor_id; claim_source:='retry';
 ELSE
  SELECT public.claim_guest_trial(p_visitor_id,coalesce(nullif(p_ip,''),'unknown')) INTO claimed;
  IF NOT coalesce(claimed,false) THEN RETURN jsonb_build_object('allowed',false,'code','TRIAL_USED'); END IF;
  claim_source:='fresh';
 END IF;
 UPDATE public.generation_daily_usage SET guest_reserved=guest_reserved+1,updated_at=now()
 WHERE usage_date=current_date;
 INSERT INTO public.generation_attempts(visitor_id,client_ip,tool_name,access_type,guest_claim_source)
 VALUES(p_visitor_id,nullif(p_ip,''),p_tool_name,'guest',claim_source) RETURNING id INTO attempt;
 RETURN jsonb_build_object('allowed',true,'attemptId',attempt,'accessType','guest');
END; $$;

CREATE OR REPLACE FUNCTION public.finalize_generation(
 p_attempt_id uuid,p_succeeded boolean,p_failure_code text DEFAULT NULL,p_circuit_seconds integer DEFAULT 0
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.generation_attempts%ROWTYPE;
BEGIN
 SELECT * INTO a FROM public.generation_attempts WHERE id=p_attempt_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('finalized',false,'code','ATTEMPT_NOT_FOUND'); END IF;
 IF a.status<>'reserved' THEN
  RETURN jsonb_build_object('finalized',true,'idempotent',true,'status',a.status);
 END IF;
 UPDATE public.generation_attempts SET
  status=CASE WHEN p_succeeded THEN 'succeeded' ELSE 'failed' END,
  failure_code=CASE WHEN p_succeeded THEN NULL ELSE p_failure_code END,finalized_at=now()
 WHERE id=p_attempt_id;
 IF a.access_type='guest' THEN
  INSERT INTO public.generation_daily_usage(usage_date) VALUES(a.created_at::date)
  ON CONFLICT(usage_date) DO NOTHING;
  UPDATE public.generation_daily_usage SET guest_reserved=greatest(guest_reserved-1,0),
   guest_succeeded=guest_succeeded+CASE WHEN p_succeeded THEN 1 ELSE 0 END,updated_at=now()
  WHERE usage_date=a.created_at::date;
  IF NOT p_succeeded AND a.visitor_id IS NOT NULL THEN
   INSERT INTO public.guest_retry_entitlements(visitor_id,remaining,updated_at)
   VALUES(a.visitor_id,1,now()) ON CONFLICT(visitor_id) DO UPDATE SET remaining=1,updated_at=now();
  END IF;
 ELSIF a.credit_reserved AND a.user_id IS NOT NULL THEN
  IF p_succeeded THEN
   UPDATE public.profiles SET generations_used=coalesce(generations_used,0)+1 WHERE id=a.user_id;
  ELSE
   UPDATE public.profiles SET credits=coalesce(credits,0)+1 WHERE id=a.user_id;
  END IF;
 END IF;
 IF NOT p_succeeded AND coalesce(p_circuit_seconds,0)>0 THEN
  UPDATE public.app_runtime_settings SET
   disabled_until=greatest(coalesce(disabled_until,now()),now()+make_interval(secs=>p_circuit_seconds)),
   updated_at=now() WHERE setting_key='global';
 END IF;
 RETURN jsonb_build_object('finalized',true,'idempotent',false,
  'status',CASE WHEN p_succeeded THEN 'succeeded' ELSE 'failed' END);
END; $$;

CREATE OR REPLACE FUNCTION public.register_pending_referral(
 p_user_id uuid,p_referral_code text,p_visitor_id text,p_ip text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE referrer public.profiles%ROWTYPE; referred public.profiles%ROWTYPE;
 existing public.referrals%ROWTYPE;
BEGIN
 SELECT * INTO referred FROM public.profiles WHERE id=p_user_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('registered',false,'reason','profile_not_found'); END IF;
 UPDATE public.profiles SET
  referral_visitor_id=coalesce(nullif(p_visitor_id,''),referral_visitor_id),
  referral_ip=coalesce(nullif(p_ip,''),referral_ip) WHERE id=p_user_id;
 IF p_referral_code IS NULL OR btrim(p_referral_code)='' THEN
  RETURN jsonb_build_object('registered',true,'pending',false);
 END IF;
 SELECT * INTO referrer FROM public.profiles
 WHERE referral_code=upper(btrim(p_referral_code)) FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('registered',false,'reason','invalid_code'); END IF;
 IF referrer.id=p_user_id THEN RETURN jsonb_build_object('registered',false,'reason','self_referral'); END IF;
 IF referred.referred_by IS NOT NULL AND referred.referred_by<>referrer.id THEN
  RETURN jsonb_build_object('registered',false,'reason','already_referred'); END IF;
 IF nullif(p_visitor_id,'') IS NOT NULL AND referrer.referral_visitor_id=p_visitor_id THEN
  RETURN jsonb_build_object('registered',false,'reason','same_fingerprint'); END IF;
 IF nullif(p_ip,'') IS NOT NULL AND p_ip<>'unknown' AND referrer.referral_ip=p_ip THEN
  RETURN jsonb_build_object('registered',false,'reason','same_ip'); END IF;
 IF nullif(p_visitor_id,'') IS NOT NULL AND EXISTS(
  SELECT 1 FROM public.referrals WHERE referred_visitor_id=p_visitor_id
  AND status='completed' AND referred_id<>p_user_id
 ) THEN RETURN jsonb_build_object('registered',false,'reason','fingerprint_already_credited'); END IF;
 SELECT * INTO existing FROM public.referrals WHERE referred_id=p_user_id FOR UPDATE;
 IF FOUND THEN
  IF existing.referrer_id<>referrer.id THEN
   RETURN jsonb_build_object('registered',false,'reason','already_referred'); END IF;
  RETURN jsonb_build_object('registered',true,'pending',existing.status='pending','status',existing.status);
 END IF;
 INSERT INTO public.referrals(referrer_id,referred_id,referral_code,status,referred_visitor_id,referred_ip)
 VALUES(referrer.id,p_user_id,upper(btrim(p_referral_code)),'pending',nullif(p_visitor_id,''),nullif(p_ip,''));
 UPDATE public.profiles SET referred_by=referrer.id WHERE id=p_user_id;
 RETURN jsonb_build_object('registered',true,'pending',true);
END; $$;

CREATE OR REPLACE FUNCTION public.create_payment_order(
 p_user_id uuid,p_reference text,p_package_id text,p_expected_amount integer,p_credits integer
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 INSERT INTO public.payment_orders(reference,user_id,package_id,expected_amount,credits)
 VALUES(p_reference,p_user_id,p_package_id,p_expected_amount,p_credits);
 RETURN true;
EXCEPTION WHEN unique_violation THEN RETURN false;
END; $$;

CREATE OR REPLACE FUNCTION public.fulfill_payment(
 p_reference text,p_provider_transaction_id text,p_paid_amount integer,p_currency text,
 p_channel text,p_paid_at timestamptz
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE ord public.payment_orders%ROWTYPE; ref public.referrals%ROWTYPE;
 earned integer; balance integer; referral_awarded boolean:=false;
BEGIN
 SELECT * INTO ord FROM public.payment_orders WHERE reference=p_reference FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('fulfilled',false,'code','ORDER_NOT_FOUND'); END IF;
 IF ord.status='paid' THEN
  SELECT credits INTO balance FROM public.profiles WHERE id=ord.user_id;
  RETURN jsonb_build_object('fulfilled',true,'idempotent',true,'creditsAdded',ord.credits,'balance',balance);
 END IF;
 IF p_paid_amount<>ord.expected_amount OR upper(coalesce(p_currency,''))<>ord.currency THEN
  UPDATE public.payment_orders SET status='failed' WHERE id=ord.id;
  RETURN jsonb_build_object('fulfilled',false,'code','PAYMENT_MISMATCH');
 END IF;
 UPDATE public.profiles SET credits=coalesce(credits,0)+ord.credits WHERE id=ord.user_id;
 SELECT * INTO ref FROM public.referrals WHERE referred_id=ord.user_id FOR UPDATE;
 IF FOUND AND ref.status='pending' THEN
  SELECT coalesce(sum(credits_awarded),0) INTO earned FROM public.referrals
  WHERE referrer_id=ref.referrer_id AND status='completed';
  IF earned+1<=50 THEN
   UPDATE public.profiles SET credits=coalesce(credits,0)+1 WHERE id=ref.referrer_id;
   UPDATE public.profiles SET credits=coalesce(credits,0)+1 WHERE id=ref.referred_id;
   UPDATE public.referrals SET status='completed',credits_awarded=1,referred_credits_awarded=1,
    completed_at=now() WHERE id=ref.id;
   referral_awarded:=true;
  ELSE
   UPDATE public.referrals SET status='completed',completed_at=now() WHERE id=ref.id;
  END IF;
 END IF;
 UPDATE public.payment_orders SET status='paid',provider_transaction_id=p_provider_transaction_id,
  provider_channel=p_channel,paid_at=coalesce(p_paid_at,now()),fulfilled_at=now() WHERE id=ord.id;
 SELECT credits INTO balance FROM public.profiles WHERE id=ord.user_id;
 RETURN jsonb_build_object('fulfilled',true,'idempotent',false,'creditsAdded',ord.credits,
  'referralAwarded',referral_awarded,'balance',balance);
END; $$;

REVOKE ALL ON FUNCTION public.reserve_generation(uuid,text,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.finalize_generation(uuid,boolean,text,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.register_pending_referral(uuid,text,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.create_payment_order(uuid,text,text,integer,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.fulfill_payment(text,text,integer,text,text,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_generation(uuid,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_generation(uuid,boolean,text,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.register_pending_referral(uuid,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_payment_order(uuid,text,text,integer,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.fulfill_payment(text,text,integer,text,text,timestamptz) TO service_role;
