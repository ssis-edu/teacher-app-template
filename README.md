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

## If your app uses the Google Picker: request `drive.readonly`, not `drive.file`

**A Google Picker MUST be given a `drive.readonly` OAuth token. `drive.file`
alone will look like it works for you and fail for everyone else.**

This is a rule, not a preference, and it exists because the opposite happened.
The Picker is an iframe from `docs.google.com` that has to LIST the user's Drive
to show them files. It can do that via the OAuth **token** you pass to
`setOAuthToken()`, or via `docs.google.com`'s **third-party cookie**. Browsers
now block third-party cookies by default (Chrome, Safari, Firefox), so a Picker
holding only a `drive.file` token — which can't list the user's Drive — falls
back to the cookie, gets nothing, and dies with a **401** that the Picker
mislabels **"The API developer key is invalid."** The key is fine; the token
couldn't browse.

`drive.readonly` lets the Picker browse using the token itself, so it works with
third-party cookies OFF and there is nothing for a teacher to change. Note that
`drive.file` also *appears* to work for anyone whose browser still allows
third-party cookies — which is exactly why this bug ships looking fine and then
breaks on the first clean profile (proven on `hs-trip-form`, 2026-07-15; the
working reference is `hs-trip-form` `src/auth.ts` and `ssis-tools`' Docs Tab
Builder).

`drive.readonly` is a broad "see all your Drive files" consent. If you need the
consent narrower, don't use the Picker at all — take a pasted Google Sheets/Doc
link instead (no iframe, no third-party cookie, only a read scope).

## Repository variable required

Set this in **Settings > Secrets and variables > Actions > Variables**:

- `CLOUD_RUN_SERVICE_NAME`: the Cloud Run service name for this app

Use the repository name unless IT gives you a shorter service name.

## Testing your Firestore rules

If your app uses Firestore, its security rules are the only thing actually
stopping one signed-in user from reading or writing another's data. Unit tests
on your app code do not test them — every rules bug this platform has had passed
its unit tests. Test the rules directly, against Google's own evaluator, and
always run the same cases against the rules you are replacing.

`scripts/rules-harness.mjs` does this. It ships with a worked example under
`examples/rules-test/` — a role-gated ruleset, its buggy predecessor, and a
suite that proves the fix. CI runs it on every pull request.

```
node scripts/rules-harness.mjs examples/rules-test/suite.mjs
```

To test your own rules: copy `examples/rules-test/` to `scripts/rules-tests/`,
point `suite.mjs` at your `firestore.rules` (and the version it replaces), and
write cases for your model. CI picks up `scripts/rules-tests/suite.mjs`
automatically. The one rule to keep: include at least one case where the
decision differs between the old rules and the new — that flip is the only thing
that proves your change did what you meant and nothing else. The harness fails
if you supply an old ruleset but no case distinguishes it.

The harness needs a Google token. CI mints one keylessly via WIF; locally it
falls back to your `gcloud` login. It reads nothing and writes nothing — the
`:test` API evaluates supplied rules against a supplied request — so the CI
identity needs only `roles/firebaserules.viewer` on the rules project.

## Repository variable required

Set this in **Settings > Secrets and variables > Actions > Variables**:

- `CLOUD_RUN_SERVICE_NAME`: the Cloud Run service name for this app

Use the repository name unless IT gives you a shorter service name.

## Data rule

Do not commit student private information, exported gradebooks, API keys, service-account keys, or screenshots containing student records.
