const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MODEL = "gemini-2.5-flash";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function stripDataUrl(value: string) {
  return value.includes(",") ? value.split(",")[1] : value;
}

const responseSchema = {
  type: "OBJECT",
  properties: {
    title: { type: "STRING" },
    summary: { type: "STRING" },
    detectedTarget: {
      type: "STRING",
      enum: ["mural", "object_design", "illustration", "photo_art", "packaging"],
    },
    recommendedRoute: { type: "STRING", enum: ["mural", "photo", "art"] },
    composition: { type: "STRING" },
    mood: { type: "STRING" },
    visualStyle: { type: "STRING" },
    palette: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          hex: { type: "STRING" },
          role: { type: "STRING" },
        },
        required: ["name", "hex", "role"],
      },
    },
    motifs: { type: "ARRAY", items: { type: "STRING" } },
    techniques: { type: "ARRAY", items: { type: "STRING" } },
    retain: { type: "ARRAY", items: { type: "STRING" } },
    transform: { type: "ARRAY", items: { type: "STRING" } },
    avoid: { type: "ARRAY", items: { type: "STRING" } },
    directions: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          title: { type: "STRING" },
          concept: { type: "STRING" },
          bestFor: { type: "STRING" },
          prompt: { type: "STRING" },
        },
        required: ["title", "concept", "bestFor", "prompt"],
      },
    },
    productionBrief: {
      type: "OBJECT",
      properties: {
        objective: { type: "STRING" },
        surface: { type: "STRING" },
        materials: { type: "ARRAY", items: { type: "STRING" } },
        considerations: { type: "ARRAY", items: { type: "STRING" } },
      },
      required: ["objective", "surface", "materials", "considerations"],
    },
  },
  required: [
    "title", "summary", "detectedTarget", "recommendedRoute", "composition",
    "mood", "visualStyle", "palette", "motifs", "techniques", "retain",
    "transform", "avoid", "directions", "productionBrief",
  ],
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  try {
    const body = await req.json();
    const image = typeof body.image === "string" ? body.image : "";
    const note = typeof body.note === "string" ? body.note.slice(0, 900) : "";
    const target = typeof body.target === "string" ? body.target.slice(0, 40) : "auto";
    const apiKey = Deno.env.get("GEMINI_API_KEY") || "";

    if (!image) return jsonResponse({ error: "Add an inspiration image first." }, 400);
    if (image.length > 14 * 1024 * 1024) return jsonResponse({ error: "The image is too large." }, 400);
    if (!apiKey) return jsonResponse({ error: "Concept analysis is temporarily unavailable." }, 503);

    const instruction = `You are Beo Concept Lab, a senior creative director helping artists turn visual inspiration into original work.

Analyse the supplied reference image. The user may be inspired by it, but must not reproduce it as an exact replica. Extract abstract visual principles such as palette, rhythm, composition, mood, material language and motif families. Explicitly identify distinctive elements, logos, characters, signatures, exact layouts or recognisable details that should be avoided or transformed.

User note: ${note || "No note was supplied. Infer what is visually compelling and propose useful directions."}
Requested target: ${target}

Create exactly three genuinely different original directions. Each direction must be production-aware and include a detailed image-generation prompt. Do not name or imitate a living artist. Do not claim copyright clearance. Use clear professional language that a muralist, illustrator, surface designer or client can understand.

Routing rules: mural work routes to "mural"; photo-to-sketch or photo stylisation routes to "photo"; object painting, bottles, packaging, storyboards, mystical art and new illustrations route to "art". Return valid JSON matching the schema.`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            role: "user",
            parts: [
              { inline_data: { mime_type: "image/jpeg", data: stripDataUrl(image) } },
              { text: instruction },
            ],
          }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema,
            temperature: 0.75,
          },
        }),
      },
    );

    if (!response.ok) {
      console.error("Gemini concept analysis error:", response.status, await response.text());
      return jsonResponse({ error: "The AI could not analyse this reference. Please try again." }, 502);
    }

    const result = await response.json();
    const text = result?.candidates?.[0]?.content?.parts?.find((part: any) => part?.text)?.text;
    if (!text) return jsonResponse({ error: "The AI returned no concept analysis." }, 502);

    let analysis;
    try {
      analysis = JSON.parse(text.replace(/^```json\s*/i, "").replace(/```\s*$/i, ""));
    } catch (error) {
      console.error("Concept JSON parse error:", error, text);
      return jsonResponse({ error: "The concept response could not be read. Please try again." }, 502);
    }

    if (!Array.isArray(analysis.directions) || analysis.directions.length < 3) {
      return jsonResponse({ error: "The AI returned an incomplete concept. Please try again." }, 502);
    }

    analysis.directions = analysis.directions.slice(0, 3);
    analysis.palette = Array.isArray(analysis.palette) ? analysis.palette.slice(0, 6) : [];
    return jsonResponse({ analysis });
  } catch (error) {
    console.error("analyze-concept error:", error);
    return jsonResponse({ error: "Concept analysis failed. Please try again." }, 500);
  }
});
