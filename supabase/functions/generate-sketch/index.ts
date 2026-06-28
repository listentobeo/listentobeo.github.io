import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type ErrorDefinition = {
  status: number;
  message: string;
  retryable: boolean;
};

const gateErrors: Record<string, ErrorDefinition> = {
  AI_UNAVAILABLE: {
    status: 503,
    message:
      "AI generation is temporarily unavailable. Your trial or credit was not used.",
    retryable: true,
  },
  DAILY_FREE_LIMIT: {
    status: 429,
    message:
      "Today's free preview limit has been reached. Create an account for one clean generation or try again tomorrow.",
    retryable: true,
  },
  TRIAL_USED: {
    status: 403,
    message:
      "Your free preview has been used. Create an account for one clean generation.",
    retryable: false,
  },
  NO_CREDITS: {
    status: 402,
    message: "No credits remaining. Please choose a credit pack.",
    retryable: false,
  },
  PROFILE_NOT_FOUND: {
    status: 500,
    message: "Your account profile is not ready. Please try again.",
    retryable: true,
  },
};

const TOOL = "photo-to-sketch";
const MODEL = "gemini-2.5-flash-image";

const stylePrompts: Record<string, string> = {
  pencil:
    "Transform this photo into a detailed graphite pencil sketch with realistic shading and fine linework on a white background. Keep the person's likeness.",
  charcoal:
    "Transform this photo into a dramatic charcoal drawing with bold expressive strokes, deep shadows, and smudged texture. Black and white only.",
  pen:
    "Transform this photo into an ink pen illustration with detailed cross-hatching and fine linework. High contrast black and white.",
  doodle:
    "Transform this photo into a minimal hand-drawn doodle with clean simple outline art on a white background. Cartoon style.",
  painting:
    "Transform this photo into a vibrant oil painting with rich colors, thick visible brushstrokes, and an impressionist painterly texture.",
  anime:
    "Transform this photo into a Japanese anime-style illustration with clean cel-shaded outlines, flat bold colors, and manga art style.",
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

async function reserveGeneration(
  req: Request,
  serviceClient: any,
  visitorId: string,
) {
  const authHeader = req.headers.get("Authorization") || "";
  let userId: string | undefined;

  if (authHeader) {
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const authResult = await serviceClient.auth.getUser(token);
    const user =
      authResult.data && authResult.data.user
        ? authResult.data.user
        : null;

    if (authResult.error || !user) {
      return {
        response: errorResponse(
          "INVALID_SESSION",
          "Invalid session. Please sign in again.",
          401,
        ),
      };
    }

    userId = user.id;
  }

  const clientIp = (req.headers.get("x-forwarded-for") || "unknown")
    .split(",")[0]
    .trim();
  const visitorKey =
    visitorId && visitorId !== "unknown"
      ? visitorId.slice(0, 120)
      : "ip_" + clientIp;

  const reservation = await serviceClient.rpc("reserve_generation", {
    p_user_id: userId || null,
    p_visitor_id: userId ? null : visitorKey,
    p_ip: clientIp,
    p_tool_name: TOOL,
  });

  if (reservation.error) {
    console.error("reserve_generation error:", reservation.error);

    return {
      response: errorResponse(
        "GATE_ERROR",
        "Could not reserve generation access.",
        500,
        true,
      ),
    };
  }

  const data = reservation.data;

  if (!data || data.allowed !== true) {
    const code =
      data && data.code ? String(data.code) : "GATE_ERROR";
    const known = gateErrors[code] || {
      status: 500,
      message: "Could not start generation.",
      retryable: true,
    };

    return {
      response: jsonResponse(
        {
          error: known.message,
          code,
          retryable: known.retryable,
          retryAfterSeconds:
            data && data.retryAfterSeconds
              ? data.retryAfterSeconds
              : undefined,
        },
        known.status,
      ),
    };
  }

  return {
    attemptId: String(data.attemptId),
  };
}

async function finalizeGeneration(
  serviceClient: any,
  attemptId: string | undefined,
  succeeded: boolean,
  failureCode?: string,
  circuitSeconds = 0,
) {
  if (!attemptId) {
    return;
  }

  const result = await serviceClient.rpc("finalize_generation", {
    p_attempt_id: attemptId,
    p_succeeded: succeeded,
    p_failure_code: failureCode || null,
    p_circuit_seconds: circuitSeconds,
  });

  if (result.error) {
    console.error("finalize_generation error:", result.error);
  }
}

function providerFailure(status: number) {
  if (status === 429) {
    return {
      code: "AI_UNAVAILABLE",
      message:
        "AI capacity is temporarily unavailable. Your trial or credit was restored.",
      httpStatus: 503,
      circuitSeconds: 900,
    };
  }

  if (status === 401 || status === 403) {
    return {
      code: "AI_UNAVAILABLE",
      message:
        "AI generation is temporarily unavailable. Your trial or credit was restored.",
      httpStatus: 503,
      circuitSeconds: 3600,
    };
  }

  return {
    code: "PROVIDER_ERROR",
    message:
      "AI generation failed. Your trial or credit was restored.",
    httpStatus: 502,
    circuitSeconds: status >= 500 ? 300 : 0,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const geminiApiKey = Deno.env.get("GEMINI_API_KEY") || "";
  const serviceClient = createClient(
    supabaseUrl,
    serviceRoleKey,
  );

  let attemptId: string | undefined;

  try {
    const body = await req.json();
    const image =
      typeof body.image === "string" ? body.image : "";
    const style =
      typeof body.style === "string" ? body.style : "pencil";
    const customPrompt =
      typeof body.prompt === "string"
        ? body.prompt.slice(0, 800)
        : "";
    const visitorId =
      typeof body.visitorId === "string"
        ? body.visitorId
        : "unknown";

    if (!image) {
      return errorResponse(
        "INVALID_IMAGE",
        "No image provided.",
        400,
      );
    }

    if (image.length > 12 * 1024 * 1024) {
      return errorResponse(
        "IMAGE_TOO_LARGE",
        "Image is too large.",
        400,
      );
    }

    // Do not reserve a trial or credit when Gemini is not configured.
    if (!geminiApiKey) {
      return errorResponse(
        "AI_UNAVAILABLE",
        "AI generation is temporarily unavailable. Your trial or credit was not used.",
        503,
        true,
      );
    }

    const access = await reserveGeneration(
      req,
      serviceClient,
      visitorId,
    );

    if (access.response) {
      return access.response;
    }

    attemptId = access.attemptId;

    const base64Image =
      image.indexOf(",") >= 0
        ? image.split(",")[1]
        : image;
    const stylePrompt =
      stylePrompts[style] || stylePrompts.pencil;
    const finalPrompt = customPrompt
      ? stylePrompt +
        " Additional instructions: " +
        customPrompt
      : stylePrompt;

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/" +
        MODEL +
        ":generateContent?key=" +
        geminiApiKey,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  inline_data: {
                    mime_type: "image/jpeg",
                    data: base64Image,
                  },
                },
                {
                  text: finalPrompt,
                },
              ],
            },
          ],
          generationConfig: {
            responseModalities: ["IMAGE", "TEXT"],
          },
        }),
      },
    );

    if (!response.ok) {
      const failure = providerFailure(response.status);
      const errorText = await response.text();

      console.error(
        "Gemini error:",
        response.status,
        errorText,
      );

      await finalizeGeneration(
        serviceClient,
        attemptId,
        false,
        failure.code,
        failure.circuitSeconds,
      );
      attemptId = undefined;

      return errorResponse(
        failure.code,
        failure.message,
        failure.httpStatus,
        true,
      );
    }

    const result = await response.json();
    const candidate =
      result && result.candidates
        ? result.candidates[0]
        : null;

    if (
      candidate &&
      candidate.finishReason === "SAFETY"
    ) {
      await finalizeGeneration(
        serviceClient,
        attemptId,
        false,
        "SAFETY_BLOCKED",
      );
      attemptId = undefined;

      return errorResponse(
        "SAFETY_BLOCKED",
        "The AI declined this image. Your trial or credit was restored.",
        422,
      );
    }

    const parts =
      candidate &&
      candidate.content &&
      candidate.content.parts
        ? candidate.content.parts
        : [];
    const imagePart = parts.find(
      (part: any) =>
        part &&
        part.inlineData &&
        part.inlineData.data,
    );

    if (!imagePart) {
      await finalizeGeneration(
        serviceClient,
        attemptId,
        false,
        "NO_IMAGE",
      );
      attemptId = undefined;

      return errorResponse(
        "PROVIDER_ERROR",
        "AI returned no image. Your trial or credit was restored.",
        502,
        true,
      );
    }

    await finalizeGeneration(
      serviceClient,
      attemptId,
      true,
    );
    attemptId = undefined;

    const mimeType =
      imagePart.inlineData.mimeType || "image/png";

    return jsonResponse({
      result:
        "data:" +
        mimeType +
        ";base64," +
        imagePart.inlineData.data,
    });
  } catch (error) {
    console.error("generate-sketch error:", error);

    await finalizeGeneration(
      serviceClient,
      attemptId,
      false,
      "SERVER_ERROR",
    );

    return errorResponse(
      "SERVER_ERROR",
      "Server error. Your trial or credit was restored.",
      500,
      true,
    );
  }
});
