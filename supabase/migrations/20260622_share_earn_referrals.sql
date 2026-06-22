-- Share & Earn referrals for Beo AI Tools
-- Target Supabase project: wphqcccliiwdvwdjgrmc

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS referral_code text,
  ADD COLUMN IF NOT EXISTS referred_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS referral_visitor_id text,
  ADD COLUMN IF NOT EXISTS referral_ip text;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_referral_code_unique
  ON public.profiles (referral_code)
  WHERE referral_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS profiles_referred_by_idx
  ON public.profiles (referred_by);

CREATE INDEX IF NOT EXISTS profiles_referral_visitor_id_idx
  ON public.profiles (referral_visitor_id);

CREATE OR REPLACE FUNCTION public.generate_referral_code()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_code text;
BEGIN
  LOOP
    v_code := upper(substr(replace(encode(gen_random_bytes(6), 'base64'), '/', ''), 1, 8));
    v_code := replace(replace(v_code, '+', ''), '=', '');
    IF length(v_code) >= 6 AND NOT EXISTS (
      SELECT 1 FROM public.profiles WHERE referral_code = v_code
    ) THEN
      RETURN v_code;
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_profile_referral_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.referral_code IS NULL OR NEW.referral_code = '' THEN
    NEW.referral_code := public.generate_referral_code();
  ELSE
    NEW.referral_code := upper(NEW.referral_code);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_profile_referral_code_on_insert ON public.profiles;
CREATE TRIGGER set_profile_referral_code_on_insert
  BEFORE INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_profile_referral_code();

DO $$
DECLARE
  v_profile record;
  v_code text;
BEGIN
  FOR v_profile IN SELECT id FROM public.profiles WHERE referral_code IS NULL LOOP
    LOOP
      v_code := public.generate_referral_code();
      BEGIN
        UPDATE public.profiles
        SET referral_code = v_code
        WHERE id = v_profile.id AND referral_code IS NULL;
        EXIT;
      EXCEPTION WHEN unique_violation THEN
        -- Try another short code on rare collision.
      END;
    END LOOP;
  END LOOP;
END;
$$;

CREATE TABLE IF NOT EXISTS public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  referred_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  referral_code text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
  credits_awarded integer NOT NULL DEFAULT 0,
  referred_visitor_id text,
  referred_ip text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (referred_id)
);

CREATE INDEX IF NOT EXISTS referrals_referrer_id_idx
  ON public.referrals (referrer_id);

CREATE INDEX IF NOT EXISTS referrals_referred_id_idx
  ON public.referrals (referred_id);

CREATE INDEX IF NOT EXISTS referrals_status_idx
  ON public.referrals (status);

CREATE INDEX IF NOT EXISTS referrals_referred_visitor_id_idx
  ON public.referrals (referred_visitor_id);

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'referrals'
      AND policyname = 'Users can view own referrals'
  ) THEN
    CREATE POLICY "Users can view own referrals"
      ON public.referrals
      FOR SELECT
      TO authenticated
      USING (auth.uid() = referrer_id OR auth.uid() = referred_id);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.register_referral_device(
  p_user_id uuid,
  p_visitor_id text,
  p_ip text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET
    referral_visitor_id = COALESCE(NULLIF(p_visitor_id, ''), referral_visitor_id),
    referral_ip = COALESCE(NULLIF(p_ip, ''), referral_ip)
  WHERE id = p_user_id;

  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_referral(
  p_referred_id uuid,
  p_referral_code text,
  p_visitor_id text,
  p_ip text,
  p_referrer_bonus integer DEFAULT 1,
  p_referred_bonus integer DEFAULT 1,
  p_max_referrer_credits integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_referrer public.profiles%ROWTYPE;
  v_referred public.profiles%ROWTYPE;
  v_existing public.referrals%ROWTYPE;
  v_earned integer;
BEGIN
  IF p_referral_code IS NULL OR p_referral_code = '' THEN
    RETURN jsonb_build_object('awarded', false, 'reason', 'missing_code');
  END IF;

  SELECT * INTO v_referred
  FROM public.profiles
  WHERE id = p_referred_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('awarded', false, 'reason', 'referred_profile_not_found');
  END IF;

  SELECT * INTO v_referrer
  FROM public.profiles
  WHERE referral_code = upper(p_referral_code)
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('awarded', false, 'reason', 'invalid_code');
  END IF;

  IF v_referrer.id = p_referred_id THEN
    RETURN jsonb_build_object('awarded', false, 'reason', 'self_referral');
  END IF;

  IF v_referred.referred_by IS NOT NULL AND v_referred.referred_by <> v_referrer.id THEN
    RETURN jsonb_build_object('awarded', false, 'reason', 'already_referred');
  END IF;

  IF p_visitor_id IS NOT NULL
    AND p_visitor_id <> ''
    AND v_referrer.referral_visitor_id IS NOT NULL
    AND v_referrer.referral_visitor_id = p_visitor_id THEN
    RETURN jsonb_build_object('awarded', false, 'reason', 'same_fingerprint');
  END IF;

  IF p_ip IS NOT NULL
    AND p_ip <> ''
    AND p_ip <> 'unknown'
    AND v_referrer.referral_ip IS NOT NULL
    AND v_referrer.referral_ip = p_ip THEN
    RETURN jsonb_build_object('awarded', false, 'reason', 'same_ip');
  END IF;

  IF p_visitor_id IS NOT NULL
    AND p_visitor_id <> ''
    AND EXISTS (
      SELECT 1
      FROM public.referrals
      WHERE referred_visitor_id = p_visitor_id
        AND status = 'completed'
        AND referred_id <> p_referred_id
    ) THEN
    RETURN jsonb_build_object('awarded', false, 'reason', 'fingerprint_already_credited');
  END IF;

  SELECT COALESCE(SUM(credits_awarded), 0) INTO v_earned
  FROM public.referrals
  WHERE referrer_id = v_referrer.id
    AND status = 'completed';

  IF v_earned + p_referrer_bonus > p_max_referrer_credits THEN
    RETURN jsonb_build_object('awarded', false, 'reason', 'referrer_cap_reached');
  END IF;

  SELECT * INTO v_existing
  FROM public.referrals
  WHERE referred_id = p_referred_id
  FOR UPDATE;

  IF FOUND AND v_existing.status = 'completed' THEN
    RETURN jsonb_build_object('awarded', false, 'reason', 'already_completed');
  END IF;

  IF FOUND AND v_existing.referrer_id <> v_referrer.id THEN
    RETURN jsonb_build_object('awarded', false, 'reason', 'already_referred');
  END IF;

  IF FOUND THEN
    UPDATE public.referrals
    SET
      status = 'completed',
      credits_awarded = p_referrer_bonus,
      referral_code = upper(p_referral_code),
      referred_visitor_id = NULLIF(p_visitor_id, ''),
      referred_ip = NULLIF(p_ip, ''),
      completed_at = now()
    WHERE id = v_existing.id;
  ELSE
    INSERT INTO public.referrals (
      referrer_id,
      referred_id,
      referral_code,
      status,
      credits_awarded,
      referred_visitor_id,
      referred_ip,
      completed_at
    )
    VALUES (
      v_referrer.id,
      p_referred_id,
      upper(p_referral_code),
      'completed',
      p_referrer_bonus,
      NULLIF(p_visitor_id, ''),
      NULLIF(p_ip, ''),
      now()
    );
  END IF;

  UPDATE public.profiles
  SET credits = COALESCE(credits, 0) + p_referrer_bonus
  WHERE id = v_referrer.id;

  UPDATE public.profiles
  SET
    credits = COALESCE(credits, 0) + p_referred_bonus,
    referred_by = v_referrer.id,
    referral_visitor_id = COALESCE(NULLIF(p_visitor_id, ''), referral_visitor_id),
    referral_ip = COALESCE(NULLIF(p_ip, ''), referral_ip)
  WHERE id = p_referred_id;

  IF to_regclass('public.transactions') IS NOT NULL THEN
    BEGIN
      EXECUTE 'INSERT INTO public.transactions (user_id, type, amount, description) VALUES ($1, $2, $3, $4)'
      USING v_referrer.id, 'credit', p_referrer_bonus, 'Referral bonus';

      EXECUTE 'INSERT INTO public.transactions (user_id, type, amount, description) VALUES ($1, $2, $3, $4)'
      USING p_referred_id, 'credit', p_referred_bonus, 'Referral signup bonus';
    EXCEPTION WHEN undefined_column OR datatype_mismatch THEN
      -- Credits are already awarded above. Transaction logging is best-effort
      -- because older Beo AI Tools databases may not have the same history shape.
    END;
  END IF;

  RETURN jsonb_build_object(
    'awarded', true,
    'referrerId', v_referrer.id,
    'referredId', p_referred_id,
    'referrerCreditsAwarded', p_referrer_bonus,
    'referredCreditsAwarded', p_referred_bonus
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_referral_device(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_referral(uuid, text, text, text, integer, integer, integer) TO service_role;
