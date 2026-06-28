import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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

function clean(value: unknown, maxLength: number) {
  return typeof value === "string"
    ? value.trim().slice(0, maxLength)
    : "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl =
      Deno.env.get("SUPABASE_URL") || "";
    const anonKey =
      Deno.env.get("SUPABASE_ANON_KEY") || "";
    const serviceRoleKey =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const body = await req.json().catch(() => ({}));
    const action = clean(body.action, 30);
    const serviceClient = createClient(
      supabaseUrl,
      serviceRoleKey,
    );

    // Public proposal links use an unguessable 48-character token.
    if (action.indexOf("proposal_") === 0) {
      return await handleProposalAction(
        serviceClient,
        action,
        body,
      );
    }

    const authHeader =
      req.headers.get("Authorization") || "";

    if (authHeader.indexOf("Bearer ") !== 0) {
      return errorResponse(
        "UNAUTHORIZED",
        "Unauthorized",
        401,
      );
    }

    const userClient = createClient(
      supabaseUrl,
      anonKey,
      {
        global: {
          headers: {
            Authorization: authHeader,
          },
        },
      },
    );
    const authResult =
      await userClient.auth.getUser();
    const user =
      authResult.data && authResult.data.user
        ? authResult.data.user
        : null;

    if (authResult.error || !user) {
      return errorResponse(
        "UNAUTHORIZED",
        "Unauthorized",
        401,
      );
    }

    if (action !== "register") {
      return errorResponse(
        "INVALID_ACTION",
        "Invalid action",
        400,
      );
    }

    const visitorId = clean(body.visitorId, 120);
    const referralCode = clean(
      body.referralCode,
      24,
    ).toUpperCase();
    const clientIp = (
      req.headers.get("x-forwarded-for") || "unknown"
    )
      .split(",")[0]
      .trim();

    const registered = await serviceClient.rpc(
      "register_pending_referral",
      {
        p_user_id: user.id,
        p_referral_code: referralCode,
        p_visitor_id: visitorId,
        p_ip: clientIp,
      },
    );

    if (registered.error) {
      console.error(
        "register_pending_referral:",
        registered.error,
      );

      return errorResponse(
        "REFERRAL_REGISTER_FAILED",
        "Failed to register referral.",
        500,
        true,
      );
    }

    return jsonResponse(
      registered.data || { registered: false },
    );
  } catch (error) {
    console.error("referral-credit:", error);

    return errorResponse(
      "SERVER_ERROR",
      "Service temporarily unavailable.",
      500,
      true,
    );
  }
});

async function handleProposalAction(
  serviceClient: any,
  action: string,
  body: any,
) {
  const token = clean(body.token, 64).toLowerCase();

  if (!/^[a-f0-9]{48}$/.test(token)) {
    return errorResponse(
      "NOT_FOUND",
      "Proposal not found.",
      404,
    );
  }

  const proposalResult = await serviceClient
    .from("proposals")
    .select("*")
    .eq("public_token", token)
    .single();
  const proposal = proposalResult.data;

  if (
    proposalResult.error ||
    !proposal ||
    proposal.status === "draft"
  ) {
    return errorResponse(
      "NOT_FOUND",
      "Proposal not found.",
      404,
    );
  }

  const projectResult = await serviceClient
    .from("projects")
    .select("*")
    .eq("id", proposal.project_id)
    .single();
  const project = projectResult.data;

  if (projectResult.error || !project) {
    return errorResponse(
      "NOT_FOUND",
      "Proposal not found.",
      404,
    );
  }

  if (action === "proposal_get") {
    const imagesResult = await serviceClient
      .from("project_generations")
      .select(
        "id,image_url,tool,sort_order,note",
      )
      .eq("project_id", project.id)
      .eq("selected", true)
      .order("sort_order");
    const feedbackResult = await serviceClient
      .from("proposal_feedback")
      .select(
        "id,author_name,message,action,created_at",
      )
      .eq("proposal_id", proposal.id)
      .order("created_at");
    const tierResult = await serviceClient.rpc(
      "active_workspace_tier",
      {
        p_user_id: project.user_id,
      },
    );

    delete project.user_id;
    delete proposal.public_token;

    return jsonResponse({
      project,
      proposal,
      images: imagesResult.data || [],
      feedback: feedbackResult.data || [],
      branding:
        tierResult.data === "studio"
          ? "custom"
          : "beo",
    });
  }

  const isResponseAction =
    action === "proposal_comment" ||
    action === "proposal_approve" ||
    action === "proposal_changes";

  if (isResponseAction) {
    const authorName = clean(body.authorName, 120);
    const message = clean(body.message, 2000);

    if (!authorName) {
      return errorResponse(
        "INVALID_NAME",
        "Please enter your name.",
        400,
      );
    }

    if (
      action !== "proposal_approve" &&
      !message
    ) {
      return errorResponse(
        "INVALID_MESSAGE",
        "Please add a note.",
        400,
      );
    }

    const responseType =
      action === "proposal_approve"
        ? "approved"
        : action === "proposal_changes"
        ? "changes_requested"
        : "comment";

    const feedbackInsert = await serviceClient
      .from("proposal_feedback")
      .insert({
        proposal_id: proposal.id,
        author_name: authorName,
        message:
          message ||
          authorName + " approved this proposal.",
        action: responseType,
      });

    if (feedbackInsert.error) {
      console.error(
        "proposal_feedback insert:",
        feedbackInsert.error,
      );

      return errorResponse(
        "SAVE_FAILED",
        "Could not save feedback.",
        500,
        true,
      );
    }

    if (responseType !== "comment") {
      const proposalUpdate: Record<
        string,
        unknown
      > = {
        status: responseType,
      };

      if (responseType === "approved") {
        proposalUpdate.approved_at =
          new Date().toISOString();
      }

      const updates = await Promise.all([
        serviceClient
          .from("proposals")
          .update(proposalUpdate)
          .eq("id", proposal.id),
        serviceClient
          .from("projects")
          .update({ status: responseType })
          .eq("id", project.id),
      ]);

      if (updates[0].error || updates[1].error) {
        console.error(
          "proposal status update:",
          updates[0].error || updates[1].error,
        );

        return errorResponse(
          "SAVE_FAILED",
          "Feedback was saved, but the proposal status could not be updated.",
          500,
          true,
        );
      }
    }

    return jsonResponse({
      saved: true,
      status: responseType,
    });
  }

  return errorResponse(
    "INVALID_ACTION",
    "Invalid action",
    400,
  );
}
