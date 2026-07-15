import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const MODEL = "gemini-2.5-flash-image";
const TOOL = "art-concept-generator";

const gateErrors: Record<string, { status: number; message: string; retryable: boolean }> = {
  AI_UNAVAILABLE: { status: 503, message: "AI generation is temporarily unavailable. Your trial or credit was not used.", retryable: true },
  DAILY_FREE_LIMIT: { status: 429, message: "Today's free preview limit has been reached. Create an account or try again tomorrow.", retryable: true },
  TRIAL_USED: { status: 403, message: "Your free preview has been used. Create an account for one clean generation.", retryable: false },
  NO_CREDITS: { status: 402, message: "No credits remaining. Please choose a credit pack.", retryable: false },
  PROFILE_NOT_FOUND: { status: 500, message: "Your account profile is not ready. Please try again.", retryable: true },
};

const modePrompts: Record<string, string> = {
  mystical: "Create a breathtaking mystical fine-art image with a strong focal point, dreamlike symbolism, atmospheric depth, sophisticated color harmony, luminous detail, and gallery-quality composition. Avoid generic fantasy clichés.",
  storyboard: "Create a professional cinematic storyboard sheet that communicates a visual story through four clearly separated sequential frames. Maintain consistent characters, world, palette and visual language across every frame. No captions or written text.",
  surface: "Create an original production-ready surface art concept suitable for hand painting on an object such as a bottle, vessel, furniture piece or product. Show a coherent wraparound motif system with a clear focal area and practical negative space.",
  world: "Create an extraordinary concept-art scene for an original world, combining environmental storytelling, memorable silhouettes, scale, atmosphere and visually coherent cultural details.",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
function errorResponse(code: string, message: string, status: number, retryable = false) {
  return jsonResponse({ error: message, code, retryable }, status);
}
function stripDataUrl(value: string) { return value.includes(",") ? value.split(",")[1] : value; }

async function reserveGeneration(req: Request, service: any, visitorId: string) {
  const authHeader = req.headers.get("Authorization") || "";
  let userId: string | undefined;
  if (authHeader) {
    const auth = await service.auth.getUser(authHeader.replace(/^Bearer\s+/i, ""));
    if (auth.error || !auth.data?.user) return { response: errorResponse("INVALID_SESSION", "Invalid session. Please sign in again.", 401) };
    userId = auth.data.user.id;
  }
  const clientIp = (req.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim();
  const visitorKey = visitorId && visitorId !== "unknown" ? visitorId.slice(0, 120) : `ip_${clientIp}`;
  const reservation = await service.rpc("reserve_generation", {
    p_user_id: userId || null,
    p_visitor_id: userId ? null : visitorKey,
    p_ip: clientIp,
    p_tool_name: TOOL,
  });
  if (reservation.error) {
    console.error("reserve_generation error:", reservation.error);
    return { response: errorResponse("GATE_ERROR", "Could not reserve generation access.", 500, true) };
  }
  const data = reservation.data;
  if (!data?.allowed) {
    const code = String(data?.code || "GATE_ERROR");
    const known = gateErrors[code] || { status: 500, message: "Could not start generation.", retryable: true };
    return { response: jsonResponse({ error: known.message, code, retryable: known.retryable, retryAfterSeconds: data?.retryAfterSeconds }, known.status) };
  }
  return { attemptId: String(data.attemptId) };
}

async function finalize(service: any, attemptId: string | undefined, succeeded: boolean, failureCode?: string, circuitSeconds = 0) {
  if (!attemptId) return;
  const result = await service.rpc("finalize_generation", {
    p_attempt_id: attemptId,
    p_succeeded: succeeded,
    p_failure_code: failureCode || null,
    p_circuit_seconds: circuitSeconds,
  });
  if (result.error) console.error("finalize_generation error:", result.error);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const service = createClient(Deno.env.get("SUPABASE_URL") || "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "");
  const apiKey = Deno.env.get("GEMINI_API_KEY") || "";
  let attemptId: string | undefined;
  try {
    const body = await req.json();
    const prompt = typeof body.prompt === "string" ? body.prompt.slice(0, 1800).trim() : "";
    const image = typeof body.image === "string" ? body.image : "";
    const mode = typeof body.mode === "string" && modePrompts[body.mode] ? body.mode : "mystical";
    const ratio = ["1:1", "4:5", "16:9"].includes(body.ratio) ? body.ratio : "1:1";
    const visitorId = typeof body.visitorId === "string" ? body.visitorId : "unknown";
    if (!prompt) return errorResponse("INVALID_PROMPT", "Describe the concept you want to create.", 400);
    if (image.length > 12 * 1024 * 1024) return errorResponse("IMAGE_TOO_LARGE", "The reference image is too large.", 400);
    if (!apiKey) return errorResponse("AI_UNAVAILABLE", "AI generation is temporarily unavailable. Your trial or credit was not used.", 503, true);

    const access = await reserveGeneration(req, service, visitorId);
    if (access.response) return access.response;
    attemptId = access.attemptId;

    const originality = image
      ? "Use the supplied image only as creative context. Extract broad qualities such as palette, atmosphere, rhythm or material feeling, then produce a substantially original composition. Do not replicate exact layout, characters, logos, signatures, text or distinctive protected elements."
      : "Create a fully original visual concept.";
    const instruction = `${modePrompts[mode]} ${originality} Output aspect ratio: ${ratio}. User creative brief: ${prompt}. No watermark, logo, frame, caption, signature or explanatory text inside the artwork. Deliver one polished final image.`;
    const parts: any[] = [];
    if (image) parts.push({ inline_data: { mime_type: "image/jpeg", data: stripDataUrl(image) } });
    parts.push({ text: instruction });

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ role: "user", parts }], generationConfig: { responseModalities: ["IMAGE", "TEXT"] } }),
    });
    if (!response.ok) {
      const failure = response.status === 429
        ? { code: "AI_UNAVAILABLE", status: 503, circuit: 900 }
        : { code: "PROVIDER_ERROR", status: 502, circuit: response.status >= 500 ? 300 : 0 };
      console.error("Gemini concept art error:", response.status, await response.text());
      await finalize(service, attemptId, false, failure.code, failure.circuit); attemptId = undefined;
      return errorResponse(failure.code, "AI generation failed. Your trial or credit was restored.", failure.status, true);
    }
    const result = await response.json();
    const candidate = result?.candidates?.[0];
    if (candidate?.finishReason === "SAFETY") {
      await finalize(service, attemptId, false, "SAFETY_BLOCKED"); attemptId = undefined;
      return errorResponse("SAFETY_BLOCKED", "The AI declined this request. Your trial or credit was restored.", 422);
    }
    const imagePart = candidate?.content?.parts?.find((part: any) => part?.inlineData?.data);
    if (!imagePart) {
      await finalize(service, attemptId, false, "NO_IMAGE"); attemptId = undefined;
      return errorResponse("PROVIDER_ERROR", "AI returned no artwork. Your trial or credit was restored.", 502, true);
    }
    await finalize(service, attemptId, true); attemptId = undefined;
    const mime = imagePart.inlineData.mimeType || "image/png";
    return jsonResponse({ result: `data:${mime};base64,${imagePart.inlineData.data}` });
  } catch (error) {
    console.error("generate-concept-art error:", error);
    await finalize(service, attemptId, false, "SERVER_ERROR");
    return errorResponse("SERVER_ERROR", "Server error. Your trial or credit was restored.", 500, true);
  }
});
