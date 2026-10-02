# Queued goal: Beo AI Tools Android TWA

Status: queued for later; do not begin implementation until requested.
Saved: 2026-09-22.

The latest instruction is to save this goal for later. The original brief's
"tonight" target is not a current deadline. Publication timing depends on
verification, signing, Play Console requirements and Google review.

This is separate from the existing unfinished print-ordering goal. No Android
implementation, signing, deployment or store submission has been started.
During the audit, also verify current Google Play payment/billing requirements
for the existing digital credits flow before treating the wrapper as release-ready.

## Full supplied brief

You are working inside the existing Beo AI Tools codebase.

GOAL
Package the existing production web app at:

https://aitools.beoarts.com

as a production-ready Android app for Google Play using a Trusted Web Activity (TWA), while preserving the existing website/PWA and backend exactly as they currently work.

The Android app should be suitable for publishing on Google Play tonight after testing, signing, store configuration, and any mandatory Google Play review/testing requirements.

IMPORTANT
Do NOT rebuild the product as a native Android app.
Do NOT replace the existing frontend.
Do NOT rewrite the Supabase backend.
Do NOT remove or redesign existing features.
Do NOT break the existing web deployment.
Do NOT expose Supabase service-role keys, API secrets, private environment variables, or server-side credentials in Android/client code.
Do NOT move secret API calls from server functions to the browser.
Do NOT invent credentials.
Do NOT commit signing passwords or private keys to Git.
Do NOT make destructive changes without explaining them first.

The existing application already has its own structure and production functionality. Inspect the codebase before changing anything.

====================================================
APP IDENTITY
====================================================

App name:
Beo AI Tools

Preferred Play Store title:
Photo to Sketch - Beo AI

Android application/package ID:
com.beoarts.aitools

Production URL:
https://aitools.beoarts.com

Organization/domain:
beoarts.com

Developer/brand:
Beo Art Studio

Use the existing Beo branding, logo, icon assets, colors, and visual identity where available.

Do not fabricate a completely different visual identity.

====================================================
PHASE 1 — AUDIT THE EXISTING PWA
====================================================

Before writing code, inspect:

- package.json
- framework/build system
- routing
- public/static files
- manifest.json / manifest.webmanifest
- service worker
- PWA configuration
- icons
- favicon
- Supabase integration
- authentication
- upload flow
- image generation flow
- payment/credit system
- external links
- file downloads
- share functionality
- camera/photo picker support
- environment variables
- production URLs
- current SEO/AdSense integrations
- mobile responsive layout

Report what already exists and what needs to be added for Android/TWA compatibility.

Do not duplicate functionality that is already implemented correctly.

====================================================
PHASE 2 — MAKE THE WEB APP TWA/PWA READY
====================================================

Ensure the existing website has a valid Web App Manifest.

Use or update the existing manifest rather than creating conflicting manifests.

Required values should include approximately:

{
  "name": "Beo AI Tools",
  "short_name": "Beo AI",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "orientation": "portrait-primary",
  "background_color": use existing Beo app background color,
  "theme_color": use existing Beo brand theme color
}

Add proper icon entries using existing brand artwork.

Required Android/PWA icon sizes:

192x192
512x512

Also create/use maskable icons if suitable.

Do not stretch low-resolution assets.

Verify:

- HTTPS works
- start_url loads
- manifest loads publicly
- icons load publicly
- service worker registration works
- app works on mobile
- navigation does not unexpectedly escape the app
- refresh/deep links work
- authentication survives navigation
- upload/photo selection works
- generated images display correctly
- downloads work
- external links open appropriately
- offline behavior does not break online-only AI features

If AI generation requires internet, show the existing appropriate error state rather than pretending the generation works offline.

====================================================
PHASE 3 — CREATE THE ANDROID TWA PROJECT
====================================================

Create a separate Android wrapper directory such as:

/android-twa

Do not mix generated Android build files into the core frontend unnecessarily.

Use Google's Trusted Web Activity architecture.

Use Bubblewrap or the current supported equivalent tooling if appropriate.

Configure:

applicationId:
com.beoarts.aitools

host:
aitools.beoarts.com

launch URL:
https://aitools.beoarts.com/

App label:
Beo AI Tools

versionName:
1.0.0

versionCode:
1

minSdk:
choose a reasonable supported value

targetSdk:
use the current Google Play required target SDK supported by the installed Android tooling.

Do not guess blindly. Inspect installed Android/Gradle tooling and use compatible versions.

The Android build must produce an Android App Bundle:

.aab

because the Play Store release will use an App Bundle.

====================================================
PHASE 4 — DIGITAL ASSET LINKS
====================================================

Set up Trusted Web Activity verification.

Generate the required Digital Asset Links configuration for:

https://aitools.beoarts.com/.well-known/assetlinks.json

The file must reference:

package_name:
com.beoarts.aitools

and the SHA-256 certificate fingerprint of the signing certificate.

Because the release signing fingerprint may not be known yet:

1. Create the correct assetlinks.json structure.
2. Clearly mark where the final SHA-256 fingerprint must be inserted.
3. If we generate the signing keystore during setup, retrieve the SHA-256 fingerprint automatically.
4. Update assetlinks.json with the correct fingerprint.
5. Put the file in the correct web/public directory so that production deploy exposes:

https://aitools.beoarts.com/.well-known/assetlinks.json

After deployment, include a command/check for verifying that URL.

Do not hardcode a fake fingerprint.

====================================================
PHASE 5 — SIGNING
====================================================

Prepare the Android app for release signing.

IMPORTANT:

Never commit the keystore.
Never commit passwords.
Never put signing credentials into public frontend environment variables.

Add signing-related files to .gitignore.

If no release keystore exists, prepare the command/process to generate one.

Suggested filename:

beo-ai-tools-release.keystore

Prefer allowing the developer to enter passwords interactively or through local environment variables.

Provide instructions for:

- generating the keystore
- storing it safely
- getting the SHA-256 certificate fingerprint
- building a signed AAB
- preserving the key for future updates

Make it extremely clear that losing the signing credentials can create serious release/update problems.

====================================================
PHASE 6 — ANDROID APP BEHAVIOR
====================================================

The Android app should feel like the existing web application, not like a random browser tab.

Configure:

- no browser address bar when TWA verification succeeds
- proper status/navigation bar integration
- app icon
- splash screen
- back button behavior
- deep links
- portrait orientation where appropriate
- photo/file upload
- Android file picker
- downloads
- sharing
- camera access if used by the existing application
- network connectivity handling
- external links

External sites such as payment providers, legal documents, WhatsApp, email, social networks, or third-party destinations may open externally when appropriate.

Keep aitools.beoarts.com internal navigation inside the application.

Do not request unnecessary Android permissions.

Only add permissions that are genuinely required by current functionality.

====================================================
PHASE 7 — ADS / MONETIZATION SAFETY
====================================================

The existing web application may already contain AdSense.

DO NOT make major AdSense changes as part of this packaging job.

DO NOT automatically add native AdMob banners over the TWA.

DO NOT duplicate ads between AdSense and AdMob.

DO NOT create ad placements that interfere with:
- upload controls
- generated images
- buttons
- navigation
- credits
- payment flows

The first objective is Play Store publication.

Create a file:

android-twa/MONETIZATION_NOTES.md

Explain how native AdMob could be evaluated separately later without violating Google advertising or Play policies.

Do not implement AdMob unless there is already an explicit native monetization implementation in the project.

====================================================
PHASE 8 — PRIVACY AND PLAY STORE READINESS
====================================================

Audit what user data the app actually handles.

Examples may include:

- uploaded images
- generated images
- email/account data
- authentication identifiers
- usage information
- payment-related information
- credits/account balance
- analytics
- advertising identifiers/cookies

DO NOT invent data collection.

Inspect the actual source code.

Create:

android-twa/PLAY_STORE_CHECKLIST.md

Include sections for:

1. App information
2. App category
3. Privacy policy
4. Data Safety
5. Ads declaration
6. App access
7. Content rating
8. Target audience
9. Store listing
10. Screenshots
11. Feature graphic
12. App icon
13. Contact information
14. Internal testing
15. Closed testing if Google requires it for this developer account
16. Production release
17. Signing / Play App Signing

For Data Safety, summarize only what the code actually does.

Do not claim data is encrypted, deleted, shared, or retained unless confirmed by the implementation.

====================================================
PHASE 9 — STORE LISTING DRAFT
====================================================

Create:

android-twa/STORE_LISTING.md

Draft a Play Store listing focused primarily on the Photo to Sketch functionality.

Positioning:

Photo to Sketch - Beo AI

Core message:

Turn photos into pencil sketches, drawings and artwork using Beo AI Tools.

Mention other existing tools only if they actually exist in the application.

Do not invent features.

Include:

- App name
- Short description
- Full description
- Suggested category
- Suggested search keywords naturally incorporated into copy
- Screenshot plan
- Feature graphic concept
- App icon requirements
- Support URL
- Privacy policy URL
- Website URL

Keep the language natural and avoid keyword stuffing.

Potential search concepts include:

photo to sketch
photo to drawing
pencil sketch
pencil drawing
AI sketch
portrait sketch
picture to drawing

But only use them naturally.

====================================================
PHASE 10 — BUILD COMMANDS
====================================================

Make the Android project reproducible.

Create:

android-twa/README.md

It must contain exact commands for:

1. installing prerequisites
2. building the web application
3. installing/configuring Bubblewrap if used
4. creating/updating the TWA
5. generating the signing key
6. retrieving SHA-256 fingerprint
7. configuring assetlinks.json
8. building debug APK
9. installing debug build on Android
10. testing TWA verification
11. building signed release AAB
12. finding the final .aab file
13. uploading it to Google Play Console

Do not give vague instructions such as "build the app."

Give actual commands appropriate to this repository.

====================================================
PHASE 11 — QUALITY CHECK
====================================================

Before declaring the work finished:

Run available:

- npm install / existing package manager equivalent
- lint
- typecheck
- tests
- production web build
- Android Gradle build
- TWA build

Fix errors caused by your changes.

Do not silence legitimate errors by disabling type checking or linting globally.

Check for:

- exposed secrets
- broken URLs
- missing assets
- duplicate manifests
- invalid JSON
- invalid Android resources
- Gradle failures
- assetlinks errors
- malformed package IDs
- accidental HTTP URLs
- broken auth redirects
- upload failures
- mobile layout issues

====================================================
PHASE 12 — FINAL OUTPUT
====================================================

At completion, provide a concise report containing:

1. What you changed
2. Files created
3. Files modified
4. Anything requiring manual action from me
5. Exact command to run the app locally
6. Exact command to build the Android debug version
7. Exact command to build the release AAB
8. Exact path of the resulting .aab
9. SHA-256 fingerprint if generated
10. assetlinks.json URL
11. Any deployment step required before TWA verification works
12. Any Google Play Console steps that cannot be automated
13. Any blockers that still prevent submission

IMPORTANT FINAL RULE:

Do not stop after creating documentation.

Actually implement the Android/TWA packaging and run the builds as far as the local environment allows.

When something requires a credential, certificate password, Play Console action, or production deployment that you cannot perform, stop only at that specific boundary and tell me exactly what I need to do.

Do not rewrite the production application just to make Android packaging easier.

Preserve the working Beo AI Tools application.

