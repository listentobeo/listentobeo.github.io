// Browser session data selects the request route only. The Edge Function still
// validates the JWT and atomically enforces credits / guest trial eligibility.
export function withDeadline(promise, milliseconds, message) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), milliseconds);
  })]).finally(() => clearTimeout(timer));
}
export async function getGenerationSession(client, milliseconds = 15000) {
  const result = await withDeadline(client.auth.getSession(), milliseconds,
    'Sign-in is taking too long. Your generation has not started. Please reload and try again.');
  if (result.error) throw new Error('Could not refresh your sign-in. Your generation has not started. Please try again or sign in again.');
  return result.data?.session || null;
}
export async function requestSketch(url, options, milliseconds = 115000, transport = fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), milliseconds);
  try {
    const response = await transport(url, { ...options, signal: controller.signal });
    const result = await response.json().catch(() => {
      throw new Error(response.status === 504 ? 'The generation service timed out. Please try again shortly.' : 'The generation service returned an unreadable response. Please try again.');
    });
    return { response, result };
  } catch (error) {
    if (controller.signal.aborted) throw new Error('The generation request timed out. Its final status is unknown; check your saved designs and credits before trying again.');
    throw error;
  } finally { clearTimeout(timer); }
}
