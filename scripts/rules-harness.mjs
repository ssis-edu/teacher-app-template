#!/usr/bin/env node
//
// rules-harness.mjs — counterfactual Firestore-rules testing against the real
// Firebase Security Rules test API.
//
// WHY THIS EXISTS
//
// Firestore security rules are the only real enforcement boundary in these
// apps, and they are the layer where green unit tests have said nothing. Every
// rules bug the estate has found was found the same way: by running the rules
// against Google's own `:test` evaluator AND running the same cases against the
// PREVIOUS ruleset. That second half is the point — it proves a deny is caused
// by THIS change and not by some rule that was already there, and it proves the
// change did not also break something that used to work.
//
//   - hs-trip-form shipped `allow delete: if isOwner()`, so an organizer could
//     never remove a student. Invisible for two days because its only caller
//     was also broken. A counterfactual would have gone red the moment the rule
//     was written.
//   - the advisory-hub fail-open tightening was PROVEN surgical because the old
//     ruleset failed exactly three cases and was identical on all seven others.
//
// This generalises the one-off `test-rules-createdby.mjs` (hs-trip-form) into a
// reusable engine so every app can carry the same discipline, and so it runs in
// CI instead of living as curl calls in someone's head.
//
// USAGE
//   node scripts/rules-harness.mjs <suite.mjs>
//
// A suite is an ES module exporting:
//   {
//     project: 'ssis-apps',              // the GCP project whose :test API to call
//     rulesFile: 'firestore.rules',      // the rules under test, repo-relative
//     previousRulesFile: 'firestore.previous.rules',  // optional; enables the counterfactual
//     cases: [ ... ]                     // see below
//   }
//
// Each case:
//   {
//     label: 'organizer removes a student from own trip',
//     newExpect: 'ALLOW',                // decision expected under rulesFile
//     oldExpect: 'DENY',                 // decision expected under previousRulesFile
//                                        //   (omit if there is no previous file;
//                                        //    a case where new != old IS the counterfactual)
//     auth: { email: 'org@ssis.edu.vn' } | null,   // null = unauthenticated
//     method: 'get' | 'list' | 'create' | 'update' | 'delete',
//     path: '/databases/(default)/documents/trips/T1',
//     resource: { ...existingDocData },  // the stored doc (for update/delete/get)
//     data: { ...incomingDocData },      // the incoming write (for create/update)
//     roleDoc: { role: 'organizer' },    // mocked result of get(roles/{email})
//     time: '2026-07-20T00:00:00Z',      // optional; defaults to a fixed instant
//   }
//
// AUTH
//   In CI: google-github-actions/auth exports an access token; this reads
//   GOOGLE_OAUTH_ACCESS_TOKEN (or RULES_TEST_TOKEN) from the environment.
//   Locally: falls back to `gcloud auth print-access-token`.
//   The `:test` method reads NOTHING and writes NOTHING — it evaluates supplied
//   source against a supplied request. The caller needs only
//   `firebaserules.rulesets.test` on the project.
//
// EXIT CODES
//   0  every case matched its expectation under every ruleset provided
//   1  at least one case did not match (a real finding, or a stale expectation)
//   2  the harness could not run (no token, compile error, API/transport error)
//      — never silently green. A broken query is not a passing test.

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { resolve, dirname } from 'node:path';

const FIXED_TIME = '2026-07-20T00:00:00Z';

function die(msg) {
  console.error(`rules-harness: ${msg}`);
  process.exit(2);
}

function getToken() {
  const fromEnv = process.env.GOOGLE_OAUTH_ACCESS_TOKEN || process.env.RULES_TEST_TOKEN;
  if (fromEnv && fromEnv.trim()) return fromEnv.trim();
  try {
    return execFileSync('gcloud', ['auth', 'print-access-token'], { encoding: 'utf8' }).trim();
  } catch {
    die('no access token. Set GOOGLE_OAUTH_ACCESS_TOKEN (CI) or run `gcloud auth login` (local).');
  }
}

// Only ever get()/exists() the acting user's own roles/{email} doc, so one
// any-arg mock returning that user's role doc is correct within a single case.
// A case with no roleDoc mocks the doc as absent.
function functionMocks(roleDoc) {
  if (roleDoc == null) {
    return [
      { function: 'exists', args: [{ anyValue: {} }], result: { value: false } },
      { function: 'get', args: [{ anyValue: {} }], result: { value: null } },
    ];
  }
  return [
    { function: 'exists', args: [{ anyValue: {} }], result: { value: true } },
    { function: 'get', args: [{ anyValue: {} }], result: { value: { data: roleDoc } } },
  ];
}

function buildTestCase(c, expectKey) {
  const expectation = c[expectKey];
  if (expectation !== 'ALLOW' && expectation !== 'DENY') {
    die(`case "${c.label}" has no valid ${expectKey} (must be 'ALLOW' or 'DENY')`);
  }
  const request = {
    method: c.method,
    path: c.path,
    time: c.time || FIXED_TIME,
    auth: c.auth ? { uid: c.auth.email, token: { email: c.auth.email, email_verified: true, ...c.auth.token } } : null,
  };
  if (c.data) request.resource = { data: c.data };
  const tc = { expectation, request, functionMocks: functionMocks(c.roleDoc) };
  if (c.resource) tc.resource = { data: c.resource };
  return tc;
}

async function runSuite(token, project, source, cases, expectKey) {
  const body = {
    source: { files: [{ name: 'firestore.rules', content: source }] },
    testSuite: { testCases: cases.map((c) => buildTestCase(c, expectKey)) },
  };
  let res, json;
  try {
    res = await fetch(`https://firebaserules.googleapis.com/v1/projects/${project}:test`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Goog-User-Project': project },
      body: JSON.stringify(body),
    });
    json = await res.json();
  } catch (e) {
    die(`transport error calling the :test API — ${e.message}`);
  }
  if (!res.ok) {
    if (res.status === 403) {
      die(`403 from the :test API. The identity lacks firebaserules.rulesets.test on "${project}". `
        + `In CI, grant the deploy SA (or a dedicated rules-test SA) roles/firebaserules.viewer.`);
    }
    die(`:test API returned ${res.status}: ${JSON.stringify(json)}`);
  }
  const errors = (json.issues || []).filter((i) => i.severity === 'ERROR');
  if (errors.length) {
    console.error('rules-harness: the rules did not compile:');
    for (const e of errors) console.error(`  ${e.description} (${JSON.stringify(e.sourcePosition)})`);
    process.exit(2);
  }
  return json.testResults || [];
}

// ---- load the suite ---------------------------------------------------------

const suitePath = process.argv[2];
if (!suitePath) die('usage: node scripts/rules-harness.mjs <suite.mjs>');

const suiteAbs = resolve(process.cwd(), suitePath);
const suiteDir = dirname(suiteAbs);
let suite;
try {
  suite = await import(pathToFileURL(suiteAbs).href);
} catch (e) {
  die(`could not import suite "${suitePath}": ${e.message}`);
}
const { project, rulesFile, previousRulesFile, cases } = suite.default || suite;

if (!project) die('suite must export `project`');
if (!rulesFile) die('suite must export `rulesFile`');
if (!Array.isArray(cases) || cases.length === 0) die('suite must export a non-empty `cases` array');

const readRules = (f) => {
  try {
    return readFileSync(resolve(suiteDir, f), 'utf8');
  } catch {
    // also try repo-root-relative, since rules usually sit at the repo root
    try { return readFileSync(resolve(process.cwd(), f), 'utf8'); }
    catch { die(`could not read rules file "${f}"`); }
  }
};

const newSource = readRules(rulesFile);
const oldSource = previousRulesFile ? readRules(previousRulesFile) : null;

// ---- run --------------------------------------------------------------------

const token = getToken();
const newResults = await runSuite(token, project, newSource, cases, 'newExpect');
const oldResults = oldSource ? await runSuite(token, project, oldSource, cases, 'oldExpect') : null;

let failed = 0;
let counterfactuals = 0;
const W = Math.min(56, Math.max(...cases.map((c) => c.label.length)));

console.log(`rules-harness — project ${project} — ${rulesFile}${oldSource ? ` vs ${previousRulesFile}` : ' (no counterfactual)'}\n`);
console.log(`${'CASE'.padEnd(W)}  NEW        ${oldSource ? 'OLD' : ''}`);

cases.forEach((c, i) => {
  const nOK = newResults[i]?.state === 'SUCCESS';
  let line = `${c.label.padEnd(W)}  ${c.newExpect}:${nOK ? 'ok ' : 'FAIL'}`;
  let caseFailed = !nOK;

  if (oldSource) {
    if (c.oldExpect == null) die(`case "${c.label}" needs oldExpect when previousRulesFile is set`);
    const oOK = oldResults[i]?.state === 'SUCCESS';
    caseFailed = caseFailed || !oOK;
    const flip = c.newExpect !== c.oldExpect;
    if (flip) counterfactuals++;
    line += `   ${c.oldExpect}:${oOK ? 'ok ' : 'FAIL'}${flip ? '   <- counterfactual' : ''}`;
  }
  if (caseFailed) failed++;
  console.log(line);
});

console.log('');
if (failed === 0) {
  console.log(`PASS — ${cases.length}/${cases.length} cases matched`
    + (oldSource ? `, ${counterfactuals} of them counterfactually (new != old).` : '.'));
  if (oldSource && counterfactuals === 0) {
    console.error('\nrules-harness: a previous ruleset was supplied but NO case distinguishes them.');
    console.error('This proves nothing about the change. Add at least one case where newExpect != oldExpect.');
    process.exit(1);
  }
} else {
  console.log(`FAIL — ${failed}/${cases.length} cases did not match their expectation.`);
  console.log('Either the rules regressed, or an expectation is stale. Read each FAIL above.');
}
process.exit(failed === 0 ? 0 : 1);
