import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-paystack-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type CreditPackage = {
  amount: number;
  credits: number;
};

type WorkspacePackage = CreditPackage & {
  planEnv: string;
};

const PACKAGES: Record<string, CreditPackage> = {
  starter: { amount: 200000, credits: 5 },
  creator: { amount: 600000, credits: 20 },
  studio: { amount: 1200000, credits: 50 },
};

const WORKSPACES: Record<string, WorkspacePackage> = {
  creator: {
    amount: 600000,
    credits: 20,
    planEnv: "PAYSTACK_CREATOR_PLAN_CODE",
  },
  studio: {
    amount: 1500000,
    credits: 60,
    planEnv: "PAYSTACK_STUDIO_PLAN_CODE",
  },
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function errorResponse(
  code: string,
  message: string,
  status: number,
  retryable = false,
) {
  return jsonResponse(
    {
      error: message,
      code,
      retryable,
    },
    status,
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const serviceRoleKey =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const paystackSecret =
    Deno.env.get("PAYSTACK_SECRET_KEY") || "";

  if (!paystackSecret) {
    return errorResponse(
      "PAYMENT_UNAVAILABLE",
      "Payments are temporarily unavailable.",
      503,
      true,
    );
  }

  const serviceClient = createClient(
    supabaseUrl,
    serviceRoleKey,
  );
  const rawBody = await req.text();
  const signature =
    req.headers.get("x-paystack-signature") || "";

  try {
    if (signature) {
      return await handleWebhook(
        serviceClient,
        rawBody,
        signature,
        paystackSecret,
      );
    }

    const authHeader =
      req.headers.get("Authorization") || "";

    if (authHeader.indexOf("Bearer ") !== 0) {
      return errorResponse(
        "UNAUTHORIZED",
        "Please sign in to continue.",
        401,
      );
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    });
    const authResult = await userClient.auth.getUser();
    const user =
      authResult.data && authResult.data.user
        ? authResult.data.user
        : null;

    if (authResult.error || !user) {
      return errorResponse(
        "UNAUTHORIZED",
        "Please sign in to continue.",
        401,
      );
    }

    const body = JSON.parse(rawBody || "{}");
    const action = String(body.action || "");

    if (action === "initialize") {
      const packageId = String(body.packageId || "");
      const selectedPackage = PACKAGES[packageId];

      if (!selectedPackage) {
        return errorResponse(
          "INVALID_PACKAGE",
          "Invalid credit package.",
          400,
        );
      }

      await registerReferral(
        serviceClient,
        user.id,
        body,
        req,
      );

      const reference = "beo-" + crypto.randomUUID();
      const order = await serviceClient.rpc(
        "create_payment_order",
        {
          p_user_id: user.id,
          p_reference: reference,
          p_package_id: packageId,
          p_expected_amount: selectedPackage.amount,
          p_credits: selectedPackage.credits,
        },
      );

      if (order.error || order.data !== true) {
        console.error("create_payment_order:", order.error);

        return errorResponse(
          "ORDER_FAILED",
          "Could not create payment order.",
          500,
          true,
        );
      }

      return initializePaystack(
        serviceClient,
        paystackSecret,
        user.email || "",
        reference,
        selectedPackage.amount,
        {
          user_id: user.id,
          package_id: packageId,
          credits: selectedPackage.credits,
          order_type: "credit_pack",
        },
        "https://aitools.beoarts.com/dashboard/?payment_ref=" +
          encodeURIComponent(reference),
      );
    }

    if (action === "initialize_workspace") {
      const tier = String(body.tier || "");
      const billingMode =
        body.billingMode === "pass"
          ? "pass"
          : "recurring";
      const selectedWorkspace = WORKSPACES[tier];

      if (!selectedWorkspace) {
        return errorResponse(
          "INVALID_WORKSPACE",
          "Invalid workspace plan.",
          400,
        );
      }

      const planCode =
        billingMode === "recurring"
          ? Deno.env.get(selectedWorkspace.planEnv) || ""
          : "";

      if (
        billingMode === "recurring" &&
        !planCode
      ) {
        return errorResponse(
          "SUBSCRIPTION_UNAVAILABLE",
          "Monthly billing is not configured yet. Choose the 30-day pass.",
          503,
        );
      }

      await registerReferral(
        serviceClient,
        user.id,
        body,
        req,
      );

      const reference =
        "beo-workspace-" + crypto.randomUUID();
      const order = await serviceClient.rpc(
        "create_workspace_order",
        {
          p_user_id: user.id,
          p_reference: reference,
          p_tier: tier,
          p_billing_mode: billingMode,
          p_expected_amount: selectedWorkspace.amount,
          p_credits: selectedWorkspace.credits,
          p_duration_days: 30,
          p_plan_code: planCode || null,
        },
      );

      if (order.error || order.data !== true) {
        console.error("create_workspace_order:", order.error);

        return errorResponse(
          "ORDER_FAILED",
          "Could not create workspace order.",
          500,
          true,
        );
      }

      return initializePaystack(
        serviceClient,
        paystackSecret,
        user.email || "",
        reference,
        selectedWorkspace.amount,
        {
          user_id: user.id,
          workspace_tier: tier,
          billing_mode: billingMode,
          credits: selectedWorkspace.credits,
          order_type: "workspace",
        },
        "https://aitools.beoarts.com/dashboard/?payment_ref=" +
          encodeURIComponent(reference) +
          "&workspace=1",
        planCode,
      );
    }

    if (action === "verify") {
      const reference = String(body.reference || "");

      if (!/^[A-Za-z0-9.=_-]+$/.test(reference)) {
        return errorResponse(
          "INVALID_REFERENCE",
          "Invalid payment reference.",
          400,
        );
      }

      const order = await serviceClient
        .from("payment_orders")
        .select("user_id")
        .eq("reference", reference)
        .single();

      if (
        order.error ||
        !order.data ||
        order.data.user_id !== user.id
      ) {
        return errorResponse(
          "ORDER_NOT_FOUND",
          "Payment order was not found.",
          404,
        );
      }

      const verified = await verifyTransaction(
        reference,
        paystackSecret,
      );

      if (!verified.ok) {
        return errorResponse(
          "VERIFY_FAILED",
          "Payment has not been confirmed.",
          409,
          true,
        );
      }

      const fulfilled = await fulfillPayment(
        serviceClient,
        verified.data,
      );

      if (!fulfilled || fulfilled.fulfilled !== true) {
        return errorResponse(
          fulfilled && fulfilled.code
            ? fulfilled.code
            : "FULFILL_FAILED",
          "Payment could not be fulfilled.",
          409,
        );
      }

      return jsonResponse(fulfilled);
    }

    if (action === "manage_subscription") {
      const subscription = await serviceClient
        .from("subscriptions")
        .select(
          "provider_subscription_code,billing_mode",
        )
        .eq("user_id", user.id)
        .single();

      if (
        subscription.error ||
        !subscription.data ||
        subscription.data.billing_mode !== "recurring" ||
        !subscription.data.provider_subscription_code
      ) {
        return errorResponse(
          "SUBSCRIPTION_NOT_FOUND",
          "No monthly subscription was found.",
          404,
        );
      }

      const response = await fetch(
        "https://api.paystack.co/subscription/" +
          encodeURIComponent(
            subscription.data.provider_subscription_code,
          ) +
          "/manage/link",
        {
          headers: {
            Authorization:
              "Bearer " + paystackSecret,
          },
        },
      );
      const responseBody = await response
        .json()
        .catch(() => ({}));

      if (
        !response.ok ||
        responseBody.status !== true ||
        !responseBody.data ||
        !responseBody.data.link
      ) {
        return errorResponse(
          "MANAGE_LINK_FAILED",
          "Could not open subscription management.",
          502,
          true,
        );
      }

      return jsonResponse({
        url: responseBody.data.link,
      });
    }

    return errorResponse(
      "INVALID_ACTION",
      "Invalid payment action.",
      400,
    );
  } catch (error) {
    console.error("paystack-payment:", error);

    return errorResponse(
      "PAYMENT_ERROR",
      "Payment processing failed. Please try again.",
      500,
      true,
    );
  }
});

async function handleWebhook(
  serviceClient: any,
  rawBody: string,
  signature: string,
  paystackSecret: string,
) {
  const signatureValid = await validSignature(
    rawBody,
    signature,
    paystackSecret,
  );

  if (!signatureValid) {
    return errorResponse(
      "INVALID_SIGNATURE",
      "Invalid webhook signature.",
      401,
    );
  }

  const event = JSON.parse(rawBody || "{}");
  const data = event.data || {};
  const eventName = String(event.event || "");

  if (
    eventName === "charge.success" &&
    data.reference
  ) {
    const verified = await verifyTransaction(
      String(data.reference),
      paystackSecret,
    );

    if (!verified.ok) {
      return errorResponse(
        "VERIFY_FAILED",
        "Could not verify payment.",
        502,
        true,
      );
    }

    let fulfilled = await fulfillPayment(
      serviceClient,
      verified.data,
    );

    if (
      fulfilled &&
      fulfilled.code === "ORDER_NOT_FOUND"
    ) {
      fulfilled = await fulfillRenewal(
        serviceClient,
        verified.data,
      );
    }

    if (!fulfilled || fulfilled.fulfilled !== true) {
      return errorResponse(
        fulfilled && fulfilled.code
          ? fulfilled.code
          : "FULFILL_FAILED",
        "Could not fulfill payment.",
        409,
      );
    }

    return jsonResponse({
      received: true,
      fulfilled: true,
    });
  }

  if (eventName === "subscription.create") {
    const customer = customerCode(data);
    const plan = planCode(data);

    if (customer && plan) {
      const update = await serviceClient
        .from("subscriptions")
        .update({
          provider_subscription_code:
            subscriptionCode(data) || null,
          status: "active",
          cancel_at_period_end: false,
        })
        .eq("provider_customer_code", customer)
        .eq("provider_plan_code", plan);

      if (update.error) {
        console.error(
          "subscription.create update:",
          update.error,
        );
      }
    }
  }

  if (
    eventName === "subscription.disable" &&
    subscriptionCode(data)
  ) {
    const update = await serviceClient
      .from("subscriptions")
      .update({
        cancel_at_period_end: true,
      })
      .eq(
        "provider_subscription_code",
        subscriptionCode(data),
      );

    if (update.error) {
      console.error(
        "subscription.disable update:",
        update.error,
      );
    }
  }

  if (
    eventName === "invoice.payment_failed" &&
    subscriptionCode(data)
  ) {
    const update = await serviceClient
      .from("subscriptions")
      .update({
        status: "past_due",
      })
      .eq(
        "provider_subscription_code",
        subscriptionCode(data),
      );

    if (update.error) {
      console.error(
        "invoice.payment_failed update:",
        update.error,
      );
    }
  }

  return jsonResponse({ received: true });
}

async function initializePaystack(
  serviceClient: any,
  paystackSecret: string,
  email: string,
  reference: string,
  amount: number,
  metadata: Record<string, unknown>,
  callbackUrl: string,
  planCode = "",
) {
  const payload: Record<string, unknown> = {
    email,
    amount,
    currency: "NGN",
    reference,
    callback_url: callbackUrl,
    metadata,
  };

  if (planCode) {
    payload.plan = planCode;
  }

  const response = await fetch(
    "https://api.paystack.co/transaction/initialize",
    {
      method: "POST",
      headers: {
        Authorization: "Bearer " + paystackSecret,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );
  const responseBody = await response
    .json()
    .catch(() => ({}));

  if (
    !response.ok ||
    responseBody.status !== true ||
    !responseBody.data
  ) {
    await serviceClient
      .from("payment_orders")
      .update({ status: "failed" })
      .eq("reference", reference);

    console.error(
      "Paystack initialize:",
      responseBody,
    );

    return errorResponse(
      "PAYMENT_INIT_FAILED",
      "Could not start payment.",
      502,
      true,
    );
  }

  return jsonResponse({
    accessCode: responseBody.data.access_code,
    reference: responseBody.data.reference,
  });
}

async function registerReferral(
  serviceClient: any,
  userId: string,
  body: any,
  req: Request,
) {
  const referralCode =
    typeof body.referralCode === "string"
      ? body.referralCode.trim().toUpperCase()
      : "";
  const visitorId =
    typeof body.visitorId === "string"
      ? body.visitorId.slice(0, 120)
      : "";

  if (!referralCode && !visitorId) {
    return;
  }

  const clientIp = (
    req.headers.get("x-forwarded-for") || "unknown"
  )
    .split(",")[0]
    .trim();

  const result = await serviceClient.rpc(
    "register_pending_referral",
    {
      p_user_id: userId,
      p_referral_code: referralCode,
      p_visitor_id: visitorId,
      p_ip: clientIp,
    },
  );

  if (result.error) {
    console.error(
      "register_pending_referral:",
      result.error,
    );
  }
}

async function verifyTransaction(
  reference: string,
  paystackSecret: string,
) {
  const response = await fetch(
    "https://api.paystack.co/transaction/verify/" +
      encodeURIComponent(reference),
    {
      headers: {
        Authorization: "Bearer " + paystackSecret,
      },
    },
  );
  const body = await response.json().catch(() => ({}));

  if (
    !response.ok ||
    body.status !== true ||
    !body.data ||
    body.data.status !== "success"
  ) {
    return {
      ok: false,
      error: body,
    };
  }

  return {
    ok: true,
    data: body.data,
  };
}

async function fulfillPayment(
  serviceClient: any,
  data: any,
) {
  const result = await serviceClient.rpc(
    "fulfill_payment",
    {
      p_reference: String(data.reference || ""),
      p_provider_transaction_id: String(
        data.id || "",
      ),
      p_paid_amount: Number(data.amount || 0),
      p_currency: String(data.currency || ""),
      p_channel: String(data.channel || ""),
      p_paid_at: data.paid_at || null,
      p_customer_code:
        customerCode(data) || null,
      p_subscription_code:
        subscriptionCode(data) || null,
      p_plan_code: planCode(data) || null,
    },
  );

  if (result.error) {
    console.error("fulfill_payment:", result.error);

    return {
      fulfilled: false,
      code: "FULFILL_FAILED",
    };
  }

  return result.data;
}

async function fulfillRenewal(
  serviceClient: any,
  data: any,
) {
  const result = await serviceClient.rpc(
    "fulfill_subscription_renewal",
    {
      p_customer_code: customerCode(data),
      p_subscription_code: subscriptionCode(data),
      p_plan_code: planCode(data),
      p_reference: String(data.reference || ""),
      p_paid_amount: Number(data.amount || 0),
      p_currency: String(data.currency || ""),
      p_paid_at: data.paid_at || null,
    },
  );

  if (result.error) {
    console.error(
      "fulfill_subscription_renewal:",
      result.error,
    );

    return {
      fulfilled: false,
      code: "FULFILL_FAILED",
    };
  }

  return result.data;
}

function customerCode(data: any) {
  return String(
    data &&
      data.customer &&
      (data.customer.customer_code ||
        data.customer.code) ||
      "",
  );
}

function planCode(data: any) {
  return String(
    data &&
      data.plan &&
      (data.plan.plan_code || data.plan.code) ||
      "",
  );
}

function subscriptionCode(data: any) {
  return String(
    data &&
      data.subscription &&
      (data.subscription.subscription_code ||
        data.subscription.code) ||
      data &&
      data.subscription_code ||
      "",
  );
}

async function validSignature(
  rawBody: string,
  signature: string,
  paystackSecret: string,
) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(paystackSecret),
    {
      name: "HMAC",
      hash: "SHA-512",
    },
    false,
    ["sign"],
  );
  const signed = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(rawBody),
  );
  const expected = Array.from(
    new Uint8Array(signed),
  )
    .map((value) =>
      value.toString(16).padStart(2, "0")
    )
    .join("");

  if (expected.length !== signature.length) {
    return false;
  }

  let mismatch = 0;

  for (
    let index = 0;
    index < expected.length;
    index++
  ) {
    mismatch |=
      expected.charCodeAt(index) ^
      signature.charCodeAt(index);
  }

  return mismatch === 0;
}
