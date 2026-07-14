# SSIS teacher app template

Starter repository for a reviewed teacher web app deployed through the `ssis-edu` GitHub organization.

## How this works

1. DLS/IT creates a new repository from this template.
2. The teacher gets Write access to that repository only.
3. Changes go through pull requests.
4. CODEOWNERS routes review to DLS and IT.
5. After merge to `main`, GitHub Actions calls the shared Cloud Run deploy workflow.

## Platform apps are NOT PWAs. Don't copy one in.

**This template deliberately has no web manifest, no service worker, and no
`icon-192`/`icon-512`/`icon-maskable` PNGs. Leave it that way unless someone
asks for a PWA.**

This is a rule, not an oversight, and it exists because the opposite happened.
`ssis-names` was the platform's first app and it IS an installable PWA — a
deliberate, wanted thing (students install it on a phone). Every app built after
it copied its `index.html`, and the manifest + service worker came along for the
ride. By 2026-07-14 **five apps were PWAs that nobody had asked for**, and
`hs-trip-form` had a manifest declaring **no icons at all** — a PWA that could
never actually be installed. All five were stripped.

A service worker is not free. It caches the app shell and build assets, it
survives in a user's browser after you delete it from the repo, and a stale one
can pin people to an old version of your app. Don't ship one by accident.

**What every app SHOULD have:**

- `public/favicon-32.png` — the browser-tab icon
- `public/apple-touch-icon.png` — the icon iOS uses for a plain home-screen bookmark
- `public/icon-source.svg` + `scripts/generate-icons.mjs` — the SSIS gradient
  square with **this app's tile emoji** on it. The emoji MUST be the same
  character as the app's tile on the `apps.ssis.edu.vn` front door
  (`ssis-apps` → `public/index.html` → `LIVE_APPS[].icon`). A test in `ssis-apps`
  fails if the two drift apart — they are one decision.

**If an app genuinely needs to be installable,** say so up front and add the
manifest, the icons, and the service worker on purpose — with someone who knows
what a stale service worker does to a school on a Monday morning.

## Repository variable required

Set this in **Settings > Secrets and variables > Actions > Variables**:

- `CLOUD_RUN_SERVICE_NAME`: the Cloud Run service name for this app

Use the repository name unless IT gives you a shorter service name.

## Data rule

Do not commit student private information, exported gradebooks, API keys, service-account keys, or screenshots containing student records.
