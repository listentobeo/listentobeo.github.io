-- Creator workspace, proposals and workspace billing. Existing balances are unchanged.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at:=now();RETURN NEW;END;$$;
CREATE TABLE IF NOT EXISTS public.subscriptions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
 tier text NOT NULL CHECK(tier IN('creator','studio')),billing_mode text NOT NULL DEFAULT 'recurring' CHECK(billing_mode IN('recurring','pass')),
 provider text NOT NULL DEFAULT 'paystack',provider_subscription_code text UNIQUE,provider_customer_code text,provider_plan_code text,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','active','past_due','cancelled','expired')),
 current_period_start timestamptz,current_period_end timestamptz,cancel_at_period_end boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS subscriptions_customer_idx ON public.subscriptions(provider_customer_code);
CREATE TABLE IF NOT EXISTS public.subscription_credit_grants(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,provider_reference text NOT NULL UNIQUE,
 credits integer NOT NULL CHECK(credits>0),granted_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.payment_orders ADD COLUMN IF NOT EXISTS order_type text NOT NULL DEFAULT 'credit_pack',
 ADD COLUMN IF NOT EXISTS workspace_tier text,ADD COLUMN IF NOT EXISTS billing_mode text,ADD COLUMN IF NOT EXISTS duration_days integer,
 ADD COLUMN IF NOT EXISTS provider_customer_code text,ADD COLUMN IF NOT EXISTS provider_subscription_code text,ADD COLUMN IF NOT EXISTS provider_plan_code text;
CREATE TABLE IF NOT EXISTS public.projects(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 title text NOT NULL CHECK(char_length(title) BETWEEN 1 AND 120),client_name text CHECK(client_name IS NULL OR char_length(client_name)<=120),
 project_type text NOT NULL DEFAULT 'mural' CHECK(project_type IN('mural','commission','interior','other')),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','shared','changes_requested','approved','archived')),
 location text CHECK(location IS NULL OR char_length(location)<=180),dimensions_text text CHECK(dimensions_text IS NULL OR char_length(dimensions_text)<=180),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS projects_user_idx ON public.projects(user_id,updated_at DESC);
CREATE TABLE IF NOT EXISTS public.project_generations(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
 generation_id uuid NOT NULL,image_url text NOT NULL,tool text,sort_order integer NOT NULL DEFAULT 0,selected boolean NOT NULL DEFAULT true,
 note text CHECK(note IS NULL OR char_length(note)<=500),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(project_id,generation_id));
CREATE TABLE IF NOT EXISTS public.proposals(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),project_id uuid NOT NULL UNIQUE REFERENCES public.projects(id) ON DELETE CASCADE,
 public_token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24),'hex'),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','shared','changes_requested','approved')),
 summary text CHECK(summary IS NULL OR char_length(summary)<=3000),scope text CHECK(scope IS NULL OR char_length(scope)<=5000),
 timeline text CHECK(timeline IS NULL OR char_length(timeline)<=1000),price_text text CHECK(price_text IS NULL OR char_length(price_text)<=500),
 revision_terms text CHECK(revision_terms IS NULL OR char_length(revision_terms)<=1500),notes text CHECK(notes IS NULL OR char_length(notes)<=3000),
 contact_name text CHECK(contact_name IS NULL OR char_length(contact_name)<=120),contact_email text CHECK(contact_email IS NULL OR char_length(contact_email)<=180),
 accent_color text NOT NULL DEFAULT '#d4a017',logo_url text,shared_at timestamptz,approved_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS public.proposal_feedback(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
 author_name text NOT NULL CHECK(char_length(author_name) BETWEEN 1 AND 120),message text NOT NULL CHECK(char_length(message) BETWEEN 1 AND 2000),
 action text NOT NULL DEFAULT 'comment' CHECK(action IN('comment','changes_requested','approved')),created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS proposal_feedback_proposal_idx ON public.proposal_feedback(proposal_id,created_at);
DROP TRIGGER IF EXISTS subscriptions_set_updated_at ON public.subscriptions;
CREATE TRIGGER subscriptions_set_updated_at BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS projects_set_updated_at ON public.projects;
CREATE TRIGGER projects_set_updated_at BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS proposals_set_updated_at ON public.proposals;
CREATE TRIGGER proposals_set_updated_at BEFORE UPDATE ON public.proposals FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;ALTER TABLE public.subscription_credit_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;ALTER TABLE public.project_generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposals ENABLE ROW LEVEL SECURITY;ALTER TABLE public.proposal_feedback ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.active_workspace_tier(p_user_id uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT COALESCE((SELECT tier FROM public.subscriptions WHERE user_id=p_user_id AND ((status='active' AND current_period_end>now()) OR (status='past_due' AND current_period_end+interval '3 days'>now())) LIMIT 1),'free');$$;
CREATE OR REPLACE FUNCTION public.can_create_client_project(p_user_id uuid) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE tier text;used integer;allowed integer;BEGIN tier:=public.active_workspace_tier(p_user_id);allowed:=CASE tier WHEN 'studio' THEN 100000 WHEN 'creator' THEN 10 ELSE 1 END;
 SELECT count(*) INTO used FROM public.projects WHERE user_id=p_user_id AND status<>'archived';RETURN used<allowed;END;$$;
DROP POLICY IF EXISTS subscriptions_select_own ON public.subscriptions;CREATE POLICY subscriptions_select_own ON public.subscriptions FOR SELECT TO authenticated USING(user_id=auth.uid());
DROP POLICY IF EXISTS subscription_grants_select_own ON public.subscription_credit_grants;CREATE POLICY subscription_grants_select_own ON public.subscription_credit_grants FOR SELECT TO authenticated USING(user_id=auth.uid());
DROP POLICY IF EXISTS projects_select_own ON public.projects;CREATE POLICY projects_select_own ON public.projects FOR SELECT TO authenticated USING(user_id=auth.uid());
DROP POLICY IF EXISTS projects_insert_own ON public.projects;CREATE POLICY projects_insert_own ON public.projects FOR INSERT TO authenticated WITH CHECK(user_id=auth.uid() AND public.can_create_client_project(auth.uid()));
DROP POLICY IF EXISTS projects_update_own ON public.projects;CREATE POLICY projects_update_own ON public.projects FOR UPDATE TO authenticated USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());
DROP POLICY IF EXISTS projects_delete_own ON public.projects;CREATE POLICY projects_delete_own ON public.projects FOR DELETE TO authenticated USING(user_id=auth.uid());
DROP POLICY IF EXISTS project_generations_owner_all ON public.project_generations;CREATE POLICY project_generations_owner_all ON public.project_generations FOR ALL TO authenticated
 USING(EXISTS(SELECT 1 FROM public.projects p WHERE p.id=project_id AND p.user_id=auth.uid())) WITH CHECK(EXISTS(SELECT 1 FROM public.projects p WHERE p.id=project_id AND p.user_id=auth.uid()));
DROP POLICY IF EXISTS proposals_owner_all ON public.proposals;CREATE POLICY proposals_owner_all ON public.proposals FOR ALL TO authenticated
 USING(EXISTS(SELECT 1 FROM public.projects p WHERE p.id=project_id AND p.user_id=auth.uid())) WITH CHECK(EXISTS(SELECT 1 FROM public.projects p WHERE p.id=project_id AND p.user_id=auth.uid()));
DROP POLICY IF EXISTS proposal_feedback_owner_select ON public.proposal_feedback;CREATE POLICY proposal_feedback_owner_select ON public.proposal_feedback FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM public.proposals pr JOIN public.projects p ON p.id=pr.project_id WHERE pr.id=proposal_id AND p.user_id=auth.uid()));
CREATE OR REPLACE FUNCTION public.complete_first_purchase_referral(p_user_id uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE ref public.referrals%ROWTYPE;earned integer;BEGIN SELECT * INTO ref FROM public.referrals WHERE referred_id=p_user_id AND status='pending' FOR UPDATE;
 IF NOT FOUND THEN RETURN false;END IF;SELECT coalesce(sum(credits_awarded),0) INTO earned FROM public.referrals WHERE referrer_id=ref.referrer_id AND status='completed';
 IF earned>=50 THEN RETURN false;END IF;UPDATE public.profiles SET credits=coalesce(credits,0)+1 WHERE id IN(ref.referrer_id,ref.referred_id);
 UPDATE public.referrals SET status='completed',credits_awarded=1,referred_credits_awarded=1,completed_at=now(),updated_at=now() WHERE id=ref.id;RETURN true;END;$$;
CREATE OR REPLACE FUNCTION public.create_workspace_order(p_user_id uuid,p_reference text,p_tier text,p_billing_mode text,p_expected_amount integer,p_credits integer,p_duration_days integer,p_plan_code text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$BEGIN IF p_tier NOT IN('creator','studio') OR p_billing_mode NOT IN('recurring','pass') THEN RETURN false;END IF;
 INSERT INTO public.payment_orders(reference,user_id,package_id,expected_amount,credits,order_type,workspace_tier,billing_mode,duration_days,provider_plan_code)
 VALUES(p_reference,p_user_id,'workspace_'||p_tier,p_expected_amount,p_credits,'workspace',p_tier,p_billing_mode,p_duration_days,p_plan_code);RETURN true;
EXCEPTION WHEN unique_violation THEN RETURN false;END;$$;
CREATE OR REPLACE FUNCTION public.fulfill_payment(p_reference text,p_provider_transaction_id text,p_paid_amount integer,p_currency text,p_channel text,
 p_paid_at timestamptz DEFAULT NULL,p_customer_code text DEFAULT NULL,p_subscription_code text DEFAULT NULL,p_plan_code text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE ord public.payment_orders%ROWTYPE;balance integer;referral_awarded boolean:=false;sub_id uuid;period_end timestamptz;
BEGIN SELECT * INTO ord FROM public.payment_orders WHERE reference=p_reference FOR UPDATE;IF NOT FOUND THEN RETURN jsonb_build_object('fulfilled',false,'code','ORDER_NOT_FOUND');END IF;
 IF ord.status='paid' THEN SELECT credits INTO balance FROM public.profiles WHERE id=ord.user_id;RETURN jsonb_build_object('fulfilled',true,'idempotent',true,'creditsAdded',ord.credits,'balance',balance,'orderType',ord.order_type);END IF;
 IF p_paid_amount<>ord.expected_amount OR upper(p_currency)<>'NGN' THEN UPDATE public.payment_orders SET status='failed' WHERE id=ord.id;RETURN jsonb_build_object('fulfilled',false,'code','PAYMENT_MISMATCH');END IF;
 UPDATE public.profiles SET credits=coalesce(credits,0)+ord.credits WHERE id=ord.user_id;
 IF ord.order_type='workspace' THEN period_end:=now()+make_interval(days=>coalesce(ord.duration_days,30));
  INSERT INTO public.subscriptions(user_id,tier,billing_mode,provider_customer_code,provider_subscription_code,provider_plan_code,status,current_period_start,current_period_end)
  VALUES(ord.user_id,ord.workspace_tier,ord.billing_mode,p_customer_code,p_subscription_code,coalesce(p_plan_code,ord.provider_plan_code),'active',now(),period_end)
  ON CONFLICT(user_id) DO UPDATE SET tier=EXCLUDED.tier,billing_mode=EXCLUDED.billing_mode,provider_customer_code=coalesce(EXCLUDED.provider_customer_code,public.subscriptions.provider_customer_code),
  provider_subscription_code=coalesce(EXCLUDED.provider_subscription_code,public.subscriptions.provider_subscription_code),provider_plan_code=coalesce(EXCLUDED.provider_plan_code,public.subscriptions.provider_plan_code),
  status='active',current_period_start=now(),current_period_end=period_end,cancel_at_period_end=false RETURNING id INTO sub_id;
  INSERT INTO public.subscription_credit_grants(user_id,subscription_id,provider_reference,credits) VALUES(ord.user_id,sub_id,p_reference,ord.credits) ON CONFLICT(provider_reference) DO NOTHING;END IF;
 referral_awarded:=public.complete_first_purchase_referral(ord.user_id);UPDATE public.payment_orders SET status='paid',provider_transaction_id=p_provider_transaction_id,provider_channel=p_channel,
 provider_customer_code=p_customer_code,provider_subscription_code=p_subscription_code,provider_plan_code=coalesce(p_plan_code,provider_plan_code),paid_at=coalesce(p_paid_at,now()),fulfilled_at=now() WHERE id=ord.id;
 SELECT credits INTO balance FROM public.profiles WHERE id=ord.user_id;RETURN jsonb_build_object('fulfilled',true,'idempotent',false,'creditsAdded',ord.credits,'balance',balance,
 'referralAwarded',referral_awarded,'orderType',ord.order_type,'workspaceTier',ord.workspace_tier,'periodEnd',period_end);END;$$;
CREATE OR REPLACE FUNCTION public.fulfill_subscription_renewal(p_customer_code text,p_subscription_code text,p_plan_code text,p_reference text,p_paid_amount integer,p_currency text,p_paid_at timestamptz DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE sub public.subscriptions%ROWTYPE;expected integer;monthly_credits integer;balance integer;inserted_count integer;
BEGIN SELECT * INTO sub FROM public.subscriptions WHERE billing_mode='recurring' AND ((coalesce(p_subscription_code,'')<>'' AND provider_subscription_code=p_subscription_code) OR
 (provider_customer_code=p_customer_code AND provider_plan_code=p_plan_code)) FOR UPDATE;IF NOT FOUND THEN RETURN jsonb_build_object('fulfilled',false,'code','SUBSCRIPTION_NOT_FOUND');END IF;
 expected:=CASE sub.tier WHEN 'studio' THEN 1500000 ELSE 600000 END;monthly_credits:=CASE sub.tier WHEN 'studio' THEN 60 ELSE 20 END;
 IF p_paid_amount<>expected OR upper(p_currency)<>'NGN' THEN RETURN jsonb_build_object('fulfilled',false,'code','PAYMENT_MISMATCH');END IF;
 INSERT INTO public.subscription_credit_grants(user_id,subscription_id,provider_reference,credits) VALUES(sub.user_id,sub.id,p_reference,monthly_credits) ON CONFLICT(provider_reference) DO NOTHING;
 GET DIAGNOSTICS inserted_count=ROW_COUNT;IF inserted_count=0 THEN SELECT credits INTO balance FROM public.profiles WHERE id=sub.user_id;RETURN jsonb_build_object('fulfilled',true,'idempotent',true,'balance',balance);END IF;
 UPDATE public.profiles SET credits=coalesce(credits,0)+monthly_credits WHERE id=sub.user_id;UPDATE public.subscriptions SET status='active',provider_subscription_code=coalesce(nullif(p_subscription_code,''),provider_subscription_code),
 current_period_start=coalesce(p_paid_at,now()),current_period_end=greatest(coalesce(current_period_end,now()),now())+interval '30 days' WHERE id=sub.id;
 SELECT credits INTO balance FROM public.profiles WHERE id=sub.user_id;RETURN jsonb_build_object('fulfilled',true,'idempotent',false,'creditsAdded',monthly_credits,'balance',balance);END;$$;
REVOKE ALL ON FUNCTION public.create_workspace_order(uuid,text,text,text,integer,integer,integer,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.fulfill_payment(text,text,integer,text,text,timestamptz,text,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.fulfill_subscription_renewal(text,text,text,text,integer,text,timestamptz) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.complete_first_purchase_referral(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_workspace_order(uuid,text,text,text,integer,integer,integer,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fulfill_payment(text,text,integer,text,text,timestamptz,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fulfill_subscription_renewal(text,text,text,text,integer,text,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_first_purchase_referral(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.active_workspace_tier(uuid) TO authenticated;GRANT EXECUTE ON FUNCTION public.can_create_client_project(uuid) TO authenticated;
