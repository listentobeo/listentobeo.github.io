# Sketch reliability fix — 22 September 2026

The reported refresh-token HTTP 504 occurred before the browser contacted the generation function. Generation previously awaited guest initialization, getUser, a profile lookup and getSession serially. App initialization and guest initialization also independently called getUser. The client ignored the getUser error and could incorrectly treat an auth outage as a guest session.

Changes:

- One bounded session lookup on Generate; no client-side profile or guest-check network dependency. Edge JWT validation and atomic credit/trial reservations remain authoritative.
- Reuse the initial session for header/referral setup; guest initialization reuses shared auth state and does not downgrade auth errors to guests.
- Authentication waits stop after 15 seconds with a pre-generation error. Browser image requests stop after 115 seconds with an honest unknown-outcome warning, not an automatic retry.
- Real preparation/sign-in/generation status text replaces timer-driven claims about AI progress. All error paths unlock the button.
- Downloaded and reviewed the deployed function before editing, preserving its MIME detection, input handling, prompts and diagnostic improvements that were absent from Git.
- Provider requests have an 80-second total deadline and at most one identical retry for IMAGE_OTHER, using the same credit reservation. Safety/refusal/recitation responses and ambiguous network failures do not retry. API key moved out of the URL into a request header.
- Backend authentication requests have a 10-second transport deadline. Upstream auth service errors are distinguished from invalid credentials.
- Worker cache version updated so existing installations receive the new helper; mobile capability meta warning fixed.

Verification: 46 automated tests pass, including refresh 504, hung authentication, successful generation without redundant checks, gateway HTML, request cancellation, IMAGE_OTHER retry, and safety non-retry. Deno type checking passes.

Deployed generate-sketch and sent one normal guest-path smoke request using the repository's public tool illustration and fixed QA visitor identifier. HTTP 200 returned a PNG data URL in 13,653 ms (2,581,738 characters). No personal account token was used or credit gate bypassed. Auth health also returned HTTP 200 in approximately 1.3 seconds. These checks demonstrate current service availability, not a guarantee against future upstream outages or image-specific refusals.
