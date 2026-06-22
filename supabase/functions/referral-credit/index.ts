import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const REFERRER_BONUS = Number(Deno.env.get("REFERRAL_REFERRER_BONUS") || "1");
const REFERRED_BONUS = Number(Deno.env.get("REFERRAL_REFERRED_BONUS") || "1");
const MAX_REFERRER_CREDITS = Number(Deno.env.get("REFERRAL_MAX_REFERRER_CREDITS") || "50");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader || authHeader.indexOf("Bearer ") !== 0) {
      return json({ error: "Unauthorized" }, 401);
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return json({ error: "Unauthorized" }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");
    const visitorId = typeof body.visitorId === "string" ? body.visitorId.slice(0, 120) : "";
    const referralCode = typeof body.referralCode === "string" ? body.referralCode.trim().toUpperCase() : "";
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    if (action === "register") {
      const { data, error } = await serviceClient.rpc("register_referral_device", {
        p_user_id: user.id,
        p_visitor_id: visitorId,
        p_ip: clientIp,
      });

      if (error) {
        console.error("register_referral_device error:", error);
        return json({ error: "Failed to register referral device" }, 500);
      }

      return json({ registered: data === true });
    }

    if (action === "complete") {
      if (!referralCode || !/^[A-Z0-9_-]{4,24}$/.test(referralCode)) {
        return json({ awarded: false, reason: "missing_code" });
      }

      const { data, error } = await serviceClient.rpc("complete_referral", {
        p_referred_id: user.id,
        p_referral_code: referralCode,
        p_visitor_id: visitorId,
        p_ip: clientIp,
        p_referrer_bonus: REFERRER_BONUS,
        p_referred_bonus: REFERRED_BONUS,
        p_max_referrer_credits: MAX_REFERRER_CREDITS,
      });

      if (error) {
        console.error("complete_referral error:", error);
        return json({ error: "Failed to complete referral" }, 500);
      }

      return json(data || { awarded: false, reason: "no_result" });
    }

    return json({ error: "Invalid action" }, 400);
  } catch (error) {
    console.error("referral-credit error:", error);
    return json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
