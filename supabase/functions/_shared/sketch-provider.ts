export function safetyBlocked(result: any): boolean {
  const blocked = new Set(['SAFETY','IMAGE_SAFETY','BLOCKLIST','PROHIBITED_CONTENT','IMAGE_PROHIBITED_CONTENT','SPII','IMAGE_RECITATION','RECITATION']);
  return Boolean(result?.promptFeedback?.blockReason) || (result?.candidates || []).some((c: any) =>
    blocked.has(c.finishReason) || c.safetyRatings?.some((s: any) => s.blocked));
}
function hasImage(result: any): boolean {
  return (result?.candidates || []).some((c: any) => c.content?.parts?.some((p: any) => (p.inlineData || p.inline_data)?.data));
}
export async function callSketchProvider(model: string, key: string, payload: any,
  transport: typeof fetch = fetch, timeoutMs = 80000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    for (let attempt = 1; attempt <= 2; attempt++) {
      const response = await transport('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify(payload), signal: controller.signal,
      });
      if (!response.ok) return { response, result: null };
      const result = await response.json();
      console.log('Sketch provider timing:', { attempt, elapsedMs: Date.now() - started, finishReason: result.candidates?.[0]?.finishReason });
      // One retry within the same credit reservation and overall deadline.
      // Never retry safety/refusal/recitation blocks or ambiguous network errors.
      if (attempt === 1 && !hasImage(result) && !safetyBlocked(result) &&
          result.candidates?.[0]?.finishReason === 'IMAGE_OTHER' && Date.now() - started < timeoutMs - 10000) continue;
      return { response, result };
    }
    throw new Error('Provider attempts exhausted.');
  } finally { clearTimeout(timer); }
}
