import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callSketchProvider, safetyBlocked } from '../_shared/sketch-provider.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
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

/*
 * Keep this model name synchronized with a model currently available
 * to your Gemini API key.
 */
const MODEL = "gemini-2.5-flash-image";

const stylePrompts: Record<string, string> = {
  pencil:
    "Transform this photo into a detailed graphite pencil sketch with realistic shading and fine linework on a clean white background. Preserve the person's identity, facial structure, pose, proportions, clothing, and important details. Do not add extra people or objects.",

  charcoal:
    "Transform this photo into a dramatic charcoal drawing with bold expressive strokes, deep shadows, realistic smudged texture, and strong tonal contrast. Preserve the person's identity, facial structure, pose, proportions, clothing, and important details. Black and white only.",

  pen:
    "Transform this photo into a detailed black ink pen illustration with fine linework, realistic cross-hatching, controlled shadows, and high contrast. Preserve the person's identity, facial structure, pose, proportions, clothing, and important details. Black and white only.",

  doodle:
    "Transform this photo into a minimal hand-drawn doodle with clean, simple outline art and a white background. Keep the main subject recognizable and preserve the pose and essential features. Cartoon-like but faithful to the original photo.",

  painting:
    "Transform this photo into a vibrant oil painting with rich colors, visible brushstrokes, natural lighting, and a refined painterly texture. Preserve the person's identity, facial structure, pose, proportions, clothing, and important details.",

  anime:
    "Transform this photo into a Japanese anime-style illustration with clean cel-shaded outlines, expressive but recognizable facial features, bold colors, and polished manga-inspired rendering. Preserve the person's identity, pose, proportions, clothing, and important details.",
};

function jsonResponse(body: unknown, status = 200): Response {
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
): Response {
  return jsonResponse(
    {
      error: message,
      code,
      retryable,
    },
    status,
  );
}

function getBearerToken(req: Request): string {
  const authorization = req.headers.get("Authorization") || "";

  if (!authorization) {
    return "";
  }

  return authorization.replace(/^Bearer\s+/i, "").trim();
}

function getClientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for") ||
    req.headers.get("x-real-ip") ||
    "unknown"
  )
    .split(",")[0]
    .trim();
}

function parseDataUrl(image: string): {
  mimeType: string;
  base64Data: string;
} {
  const trimmed = image.trim();

  /*
   * Supports:
   * data:image/jpeg;base64,xxxx
   * data:image/png;base64,xxxx
   * raw base64 strings
   */
  const dataUrlMatch = trimmed.match(
    /^data:([^;,]+)(?:;[^,]*)?,([\s\S]+)$/i,
  );

  if (dataUrlMatch) {
    return {
      mimeType: dataUrlMatch[1].toLowerCase(),
      base64Data: dataUrlMatch[2].replace(/\s/g, ""),
    };
  }

  return {
    mimeType: "image/jpeg",
    base64Data: trimmed.replace(/\s/g, ""),
  };
}

function providerFailure(status: number) {
  if (status === 401 || status === 403) {
    return {
      code: "AI_UNAVAILABLE",
      message:
        "Gemini rejected the API request. Please verify the Gemini API key, API access, and enabled billing/project configuration. Your trial or credit was restored.",
      httpStatus: 503,
      circuitSeconds: 3600,
    };
  }

  if (status === 429) {
    return {
      code: "AI_UNAVAILABLE",
      message:
        "Gemini is temporarily rate-limited or unavailable. Your trial or credit was restored.",
      httpStatus: 503,
      circuitSeconds: 900,
    };
  }

  if (status >= 500) {
    return {
      code: "PROVIDER_ERROR",
      message:
        "Gemini is temporarily experiencing an error. Your trial or credit was restored.",
      httpStatus: 502,
      circuitSeconds: 300,
    };
  }

  return {
    code: "PROVIDER_ERROR",
    message:
      "Gemini could not process this image. Your trial or credit was restored.",
    httpStatus: 502,
    circuitSeconds: 0,
  };
}

async function reserveGeneration(
  req: Request,
  serviceClient: any,
  visitorId: string,
) {
  const token = getBearerToken(req);
  let userId: string | undefined;

  if (token) {
    const authStarted = Date.now();
    const authResult = await serviceClient.auth.getUser(token);
    console.log('Sketch authentication timing:', { elapsedMs: Date.now() - authStarted, failed: Boolean(authResult.error) });

    const user =
      authResult.data && authResult.data.user
        ? authResult.data.user
        : null;

    if (authResult.error || !user) {
      const unavailable = authResult.error?.status >= 500 || authResult.error?.name === 'AuthRetryableFetchError';
      return {
        response: errorResponse(
          unavailable ? "AUTH_UNAVAILABLE" : "INVALID_SESSION",
          unavailable ? "Sign-in verification is temporarily unavailable. Generation has not started; please try again shortly." : "Invalid session. Please sign in again.",
          unavailable ? 503 : 401,
          unavailable,
        ),
      };
    }

    userId = user.id;
  }

  const clientIp = getClientIp(req);

  const safeVisitorId =
    visitorId && visitorId !== "unknown"
      ? visitorId.slice(0, 120)
      : "unknown";

  const visitorKey =
    userId || safeVisitorId !== "unknown"
      ? userId
        ? null
        : safeVisitorId
      : `ip_${clientIp}`;

  const reservation = await serviceClient.rpc("reserve_generation", {
    p_user_id: userId || null,
    p_visitor_id: visitorKey,
    p_ip: clientIp,
    p_tool_name: TOOL,
  });

  if (reservation.error) {
    console.error("reserve_generation error:", {
      message: reservation.error.message,
      code: reservation.error.code,
      details: reservation.error.details,
      hint: reservation.error.hint,
    });

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
          ...(data?.retryAfterSeconds
            ? {
                retryAfterSeconds: data.retryAfterSeconds,
              }
            : {}),
        },
        known.status,
      ),
    };
  }

  return {
    attemptId: data.attemptId ? String(data.attemptId) : undefined,
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

  try {
    const result = await serviceClient.rpc("finalize_generation", {
      p_attempt_id: attemptId,
      p_succeeded: succeeded,
      p_failure_code: failureCode || null,
      p_circuit_seconds: circuitSeconds,
    });

    if (result.error) {
      console.error("finalize_generation error:", {
        message: result.error.message,
        code: result.error.code,
        details: result.error.details,
        hint: result.error.hint,
      });
    }
  } catch (error) {
    console.error("finalizeGeneration exception:", error);
  }
}

function extractGeneratedImage(result: any): {
  mimeType: string;
  base64Data: string;
} | null {
  const candidates = Array.isArray(result?.candidates)
    ? result.candidates
    : [];

  for (const candidate of candidates) {
    const parts = Array.isArray(candidate?.content?.parts)
      ? candidate.content.parts
      : [];

    for (const part of parts) {
      /*
       * Gemini responses may use camelCase or snake_case
       * depending on the API representation.
       */
      const inlineData = part?.inlineData || part?.inline_data;

      if (inlineData?.data) {
        return {
          mimeType:
            inlineData.mimeType ||
            inlineData.mime_type ||
            "image/png",
          base64Data: inlineData.data,
        };
      }
    }
  }

  return null;
}

Deno.serve(async (req: Request) => {
  /*
   * Handle CORS before processing anything else.
   */
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  if (req.method !== "POST") {
    return errorResponse(
      "METHOD_NOT_ALLOWED",
      "Method not allowed.",
      405,
    );
  }

  /*
   * These values are supplied by Supabase's runtime environment.
   *
   * GEMINI_API_KEY must be created in:
   * Supabase Dashboard â†’ Edge Functions â†’ Secrets
   *
   * The actual secret is NOT placed in this source code.
   */
  const supabaseUrl =
    Deno.env.get("SUPABASE_URL")?.trim() || "";

  const serviceRoleKey =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() || "";

  const geminiApiKey =
    Deno.env.get("GEMINI_API_KEY")?.trim() || "";

  /*
   * Safe diagnostics. These do not print the secret itself.
   */
  console.log("generate-sketch configuration:", {
    hasSupabaseUrl: Boolean(supabaseUrl),
    hasServiceRoleKey: Boolean(serviceRoleKey),
    hasGeminiApiKey: Boolean(geminiApiKey),
    geminiApiKeyLength: geminiApiKey.length,
    model: MODEL,
  });

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Missing Supabase runtime environment variables.");

    return errorResponse(
      "SERVER_CONFIGURATION_ERROR",
      "Service configuration is incomplete.",
      500,
      true,
    );
  }

  if (!geminiApiKey) {
    console.error(
      "GEMINI_API_KEY is not available in the deployed Edge Function runtime.",
    );

    return errorResponse(
      "AI_UNAVAILABLE",
      "AI generation is temporarily unavailable. Your trial or credit was not used.",
      503,
      true,
    );
  }

  const serviceClient = createClient(
    supabaseUrl,
    serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      global: {
        fetch: (input: RequestInfo | URL, init?: RequestInit) => {
          const url = input instanceof Request ? input.url : String(input);
          if (!url.includes('/auth/v1/')) return fetch(input, init);
          const deadline = AbortSignal.timeout(10000);
          return fetch(input, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, deadline]) : deadline });
        },
      },
    },
  );

  let attemptId: string | undefined;

  try {
    let body: any;

    try {
      body = await req.json();
    } catch (error) {
      console.error("Invalid JSON request body:", error);

      return errorResponse(
        "INVALID_REQUEST",
        "Invalid request body.",
        400,
      );
    }

    const image =
      typeof body?.image === "string"
        ? body.image.trim()
        : "";

    const style =
      typeof body?.style === "string"
        ? body.style.trim().toLowerCase()
        : "pencil";

    const customPrompt =
      typeof body?.prompt === "string"
        ? body.prompt.trim().slice(0, 800)
        : "";

    const visitorId =
      typeof body?.visitorId === "string"
        ? body.visitorId.slice(0, 120)
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

    const { mimeType, base64Data } = parseDataUrl(image);

    const supportedMimeTypes = new Set([
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
      "image/heic",
      "image/heif",
    ]);

    if (!supportedMimeTypes.has(mimeType)) {
      return errorResponse(
        "UNSUPPORTED_IMAGE_TYPE",
        "Please upload a JPEG, PNG, WebP, HEIC, or HEIF image.",
        400,
      );
    }

    if (!base64Data) {
      return errorResponse(
        "INVALID_IMAGE",
        "Invalid image data.",
        400,
      );
    }

    /*
     * Reserve the user's trial or credit before generation.
     */
    const access = await reserveGeneration(
      req,
      serviceClient,
      visitorId,
    );

    if (access.response) {
      return access.response;
    }

    attemptId = access.attemptId;

    const stylePrompt =
      stylePrompts[style] || stylePrompts.pencil;

    const finalPrompt = customPrompt
      ? `${stylePrompt} Additional instructions: ${customPrompt}`
      : stylePrompt;

    console.log("Calling Gemini:", {
      model: MODEL,
      style,
      mimeType,
      imageBase64Length: base64Data.length,
      hasCustomPrompt: Boolean(customPrompt),
    });

    const { response, result } = await callSketchProvider(MODEL, geminiApiKey, {
        contents: [
          {
            role: "user",
            parts: [
              {
                inline_data: {
                  mime_type: mimeType,
                  data: base64Data,
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
    });

    if (!response.ok) {
      const errorText = await response.text();
      const failure = providerFailure(response.status);

      console.error("Gemini provider error:", {
        status: response.status,
        statusText: response.statusText,
        body: errorText.slice(0, 4000),
      });

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

    const firstCandidate = result?.candidates?.[0];

    /*
     * Gemini may finish with a safety block.
     */
    if (
      safetyBlocked(result)
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
        false,
      );
    }

    const generatedImage = extractGeneratedImage(result);

    if (!generatedImage) {
      console.error("Gemini returned no generated image:", {
        finishReason: firstCandidate?.finishReason || null,
        promptFeedback: result?.promptFeedback || null,
        candidatesCount: Array.isArray(result?.candidates)
          ? result.candidates.length
          : 0,
        responseKeys: result && typeof result === "object"
          ? Object.keys(result)
          : [],
      });

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

    return jsonResponse({
      result:
        `data:${generatedImage.mimeType};base64,${generatedImage.base64Data}`,
    });
  } catch (error) {
    const timedOut = error instanceof Error && ['AbortError','TimeoutError'].includes(error.name);
    console.error("generate-sketch failed:", { name: error instanceof Error ? error.name : 'UnknownError', timedOut });

    await finalizeGeneration(
      serviceClient,
      attemptId,
      false,
      timedOut ? "PROVIDER_TIMEOUT" : "SERVER_ERROR",
    );

    return errorResponse(
      timedOut ? "PROVIDER_TIMEOUT" : "SERVER_ERROR",
      timedOut ? "The image provider took too long. Please try again shortly." : "Generation could not be completed. Please try again shortly.",
      timedOut ? 504 : 500,
      true,
    );
  }
});
