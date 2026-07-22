// Example rules-harness suite. Run by CI on every PR so the mechanism is always
// exercised (a guard that never runs cannot go red). Copy this directory into
// your own app, point it at your firestore.rules, and write cases for your own
// model.
//
//   node scripts/rules-harness.mjs examples/rules-test/suite.mjs
//
// The pattern to keep: run the SAME cases against your new rules and the rules
// they replace. A case where newExpect differs from oldExpect is a
// counterfactual — it is what proves the change is real and surgical. The
// harness fails if a previous file is given but no case distinguishes them.
//
// THE OTHER PATTERN TO KEEP: a suite made only of people who are supposed to
// have access proves nothing about who is kept out. Until 2026-07-22 every
// identity below was @ssis.edu.vn, so twelve green cases said nothing about the
// fact that attacker@gmail.com could read and write the whole `items`
// collection. Whatever your app's audience is, put someone OUTSIDE it in the
// suite and prove the deny.

const OWNER = { email: 'owner@ssis.edu.vn' };
const ALICE = { email: 'alice@ssis.edu.vn' };
const BOB = { email: 'bob@ssis.edu.vn' };

// Outside the audience. ssis-apps' Firebase Auth has `blockingFunctions: {}`,
// so this is not a hypothetical identity — any Google account can sign in and
// present a token with email_verified true.
const OUTSIDER = { email: 'attacker@gmail.com' };
// Domains that LOOK right and are not. These prove the `$` anchor in isSsis()
// is doing its job and that the pattern is not a substring match.
const LOOKALIKE_SUFFIX = { email: 'attacker@ssis.edu.vn.evil.com' };
const LOOKALIKE_PREFIX = { email: 'attacker@notssis.edu.vn' };
// The same staff member as ALICE, presenting the address as Google registered
// it. Google does not normalise case in the token; role docs and createdBy are
// stored lowercased. She must get in, and must reach her own role doc.
const ALICE_MIXED = { email: 'Alice@SSIS.edu.vn' };

const ITEM = '/databases/(default)/documents/items/I1';
// Alice created item I1.
const ALICE_ITEM = { createdBy: 'alice@ssis.edu.vn', title: 'draft' };
// An item the outsider planted, so the read/update/delete cases below ask the
// most generous possible question: may they touch even their OWN doc? No.
const OUTSIDER_ITEM = { createdBy: 'attacker@gmail.com', title: 'planted' };

export default {
  project: 'ssis-apps',
  rulesFile: 'firestore.rules',
  previousRulesFile: 'firestore.previous.rules',
  cases: [
    // ---- the counterfactual: the one line that changed --------------------
    {
      label: 'creator deletes own item',
      newExpect: 'ALLOW', oldExpect: 'DENY', //  <- the fix
      auth: ALICE, roleDoc: null, method: 'delete', path: ITEM, resource: ALICE_ITEM,
    },
    {
      label: 'owner deletes any item',
      newExpect: 'ALLOW', oldExpect: 'ALLOW',
      auth: OWNER, roleDoc: { role: 'owner' }, method: 'delete', path: ITEM, resource: ALICE_ITEM,
    },
    {
      label: 'other user cannot delete a foreign item',
      newExpect: 'DENY', oldExpect: 'DENY',
      auth: BOB, roleDoc: null, method: 'delete', path: ITEM, resource: ALICE_ITEM,
    },
    {
      label: 'unauthenticated cannot delete',
      newExpect: 'DENY', oldExpect: 'DENY',
      auth: null, roleDoc: null, method: 'delete', path: ITEM, resource: ALICE_ITEM,
    },

    // ---- the domain gate: an identity from outside the school -------------
    // Every ALLOW in the old column below was reachable in production by anyone
    // with a Google account. Each flip is attributable to isSsis() alone: the
    // only clause that changed for these identities.
    {
      label: 'non-SSIS cannot create an item',
      newExpect: 'DENY', oldExpect: 'ALLOW', //  <- the fix
      auth: OUTSIDER, roleDoc: null, method: 'create',
      path: '/databases/(default)/documents/items/X1', data: OUTSIDER_ITEM,
    },
    {
      label: 'non-SSIS cannot read the item it planted',
      newExpect: 'DENY', oldExpect: 'ALLOW', //  <- the fix
      auth: OUTSIDER, roleDoc: null, method: 'get', path: ITEM, resource: OUTSIDER_ITEM,
    },
    {
      label: 'non-SSIS cannot update the item it planted',
      newExpect: 'DENY', oldExpect: 'ALLOW', //  <- the fix
      auth: OUTSIDER, roleDoc: null, method: 'update', path: ITEM,
      resource: OUTSIDER_ITEM, data: { createdBy: 'attacker@gmail.com', title: 'edited' },
    },
    {
      // NOT a counterfactual, and kept precisely because it is not. The old
      // file denied this only through its OWN delete bug (isOwner() alone), not
      // through any domain check. Fixing the delete without adding isSsis()
      // would have opened it. Two bugs cancelling is not a gate.
      label: 'non-SSIS cannot delete the item it planted',
      newExpect: 'DENY', oldExpect: 'DENY',
      auth: OUTSIDER, roleDoc: null, method: 'delete', path: ITEM, resource: OUTSIDER_ITEM,
    },
    {
      label: 'non-SSIS cannot read its own role doc',
      newExpect: 'DENY', oldExpect: 'ALLOW', //  <- the fix
      auth: OUTSIDER, roleDoc: null, method: 'get',
      path: '/databases/(default)/documents/roles/attacker@gmail.com', resource: { role: 'owner' },
    },
    {
      label: 'lookalike domain ssis.edu.vn.evil.com cannot create',
      newExpect: 'DENY', oldExpect: 'ALLOW', //  <- the fix
      auth: LOOKALIKE_SUFFIX, roleDoc: null, method: 'create',
      path: '/databases/(default)/documents/items/X2',
      data: { createdBy: 'attacker@ssis.edu.vn.evil.com', title: 'planted' },
    },
    {
      label: 'lookalike domain notssis.edu.vn cannot create',
      newExpect: 'DENY', oldExpect: 'ALLOW', //  <- the fix
      auth: LOOKALIKE_PREFIX, roleDoc: null, method: 'create',
      path: '/databases/(default)/documents/items/X3',
      data: { createdBy: 'attacker@notssis.edu.vn', title: 'planted' },
    },

    // ---- .lower(): the gate must not lock out the people it is for --------
    // A domain check without .lower() denies `Alice@SSIS.edu.vn` her own data.
    // These flip the other way — DENY under the old rules, ALLOW under the new
    // — so they prove the normalisation, not just the gate.
    //
    // Caveat worth knowing before you copy this: the harness mocks exists()/get()
    // on ANY argument, so these cases prove the case-insensitivity of the
    // COMPARISONS, not that role() looks the doc up at the lowercased path. Read
    // that one off the rules text (role() uses myEmail()), not off a green line.
    {
      label: 'mixed-case SSIS user reads own item',
      newExpect: 'ALLOW', oldExpect: 'DENY', //  <- the fix
      auth: ALICE_MIXED, roleDoc: null, method: 'get', path: ITEM, resource: ALICE_ITEM,
    },
    {
      label: 'mixed-case SSIS user reads own lowercased role doc',
      newExpect: 'ALLOW', oldExpect: 'DENY', //  <- the fix
      auth: ALICE_MIXED, roleDoc: null, method: 'get',
      path: '/databases/(default)/documents/roles/alice@ssis.edu.vn', resource: { role: 'teacher' },
    },
    {
      label: 'mixed-case SSIS user creates own item',
      newExpect: 'ALLOW', oldExpect: 'DENY', //  <- the fix
      auth: ALICE_MIXED, roleDoc: null, method: 'create',
      path: '/databases/(default)/documents/items/I9', data: ALICE_ITEM,
    },

    // ---- regressions: everything the fix must NOT change ------------------
    {
      // An @ssis.edu.vn address that Google has NOT verified. Denied by both
      // files (signedIn() checks email_verified, and isSsis() is built on it),
      // so no flip — it is here to keep that clause exercised while isSsis()
      // is being edited around it.
      label: 'unverified SSIS address cannot read',
      newExpect: 'DENY', oldExpect: 'DENY',
      auth: { email: 'alice@ssis.edu.vn', token: { email_verified: false } },
      roleDoc: null, method: 'get', path: ITEM, resource: ALICE_ITEM,
    },
    {
      label: 'creator reads own item',
      newExpect: 'ALLOW', oldExpect: 'ALLOW',
      auth: ALICE, roleDoc: null, method: 'get', path: ITEM, resource: ALICE_ITEM,
    },
    {
      label: 'other user cannot read a foreign item',
      newExpect: 'DENY', oldExpect: 'DENY',
      auth: BOB, roleDoc: null, method: 'get', path: ITEM, resource: ALICE_ITEM,
    },
    {
      label: 'creator updates own item, createdBy unchanged',
      newExpect: 'ALLOW', oldExpect: 'ALLOW',
      auth: ALICE, roleDoc: null, method: 'update', path: ITEM,
      resource: ALICE_ITEM, data: { createdBy: 'alice@ssis.edu.vn', title: 'final' },
    },
    {
      label: 'creator cannot reassign createdBy on own item',
      newExpect: 'DENY', oldExpect: 'DENY',
      auth: ALICE, roleDoc: null, method: 'update', path: ITEM,
      resource: ALICE_ITEM, data: { createdBy: 'bob@ssis.edu.vn', title: 'stolen' },
    },
    {
      label: 'signed-in user creates own item',
      newExpect: 'ALLOW', oldExpect: 'ALLOW',
      auth: BOB, roleDoc: null, method: 'create',
      path: '/databases/(default)/documents/items/I2', data: { createdBy: 'bob@ssis.edu.vn', title: 'new' },
    },
    {
      label: 'user cannot create an item owned by someone else',
      newExpect: 'DENY', oldExpect: 'DENY',
      auth: BOB, roleDoc: null, method: 'create',
      path: '/databases/(default)/documents/items/I3', data: { createdBy: 'alice@ssis.edu.vn', title: 'forged' },
    },
    {
      label: 'owner can write a role doc',
      newExpect: 'ALLOW', oldExpect: 'ALLOW',
      auth: OWNER, roleDoc: { role: 'owner' }, method: 'update',
      path: '/databases/(default)/documents/roles/new@ssis.edu.vn', resource: { role: 'teacher' }, data: { role: 'owner' },
    },
    {
      label: 'non-owner cannot write a role doc',
      newExpect: 'DENY', oldExpect: 'DENY',
      auth: ALICE, roleDoc: null, method: 'update',
      path: '/databases/(default)/documents/roles/alice@ssis.edu.vn', resource: { role: 'teacher' }, data: { role: 'owner' },
    },
  ],
};
