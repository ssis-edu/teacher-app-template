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

const OWNER = { email: 'owner@ssis.edu.vn' };
const ALICE = { email: 'alice@ssis.edu.vn' };
const BOB = { email: 'bob@ssis.edu.vn' };

const ITEM = '/databases/(default)/documents/items/I1';
// Alice created item I1.
const ALICE_ITEM = { createdBy: 'alice@ssis.edu.vn', title: 'draft' };

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

    // ---- regressions: everything the fix must NOT change ------------------
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
