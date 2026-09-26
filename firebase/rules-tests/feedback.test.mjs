// Firestore-sääntöjen testit: Palaute-kokoelman org-raja.
// Ajo (vaatii Javan): cd firebase/rules-tests && npm install && npm test
// CI ajaa nämä jokaisella pushilla (.github/workflows/momentum-ci.yml).

import { readFileSync } from 'node:fs';
import { test, before, after } from 'node:test';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { collection, query, where, getDocs, limit, doc, setDoc } from 'firebase/firestore';

let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-momentum',
    firestore: { rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8') },
  });
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'organizations/org-a'), { name: 'A' });
    await setDoc(doc(db, 'organizations/org-b'), { name: 'B' });
    await setDoc(doc(db, 'organizations/org-a/members/alice'), { role: 'member' });
    await setDoc(doc(db, 'organizations/org-b/members/bob'), { role: 'member' });
    await setDoc(doc(db, 'momentumFeedback/fa'), { orgId: 'org-a', userUid: 'alice', userEmail: 'alice@a.fi', text: 'A', submittedAt: '2026-09-01', status: 'open' });
    await setDoc(doc(db, 'momentumFeedback/fb'), { orgId: 'org-b', userUid: 'bob', userEmail: 'bob@b.fi', text: 'B', submittedAt: '2026-09-01', status: 'open' });
  });
});

after(async () => { await env?.cleanup(); });

const fb = ctx => collection(ctx.firestore(), 'momentumFeedback');

test('jäsen listaa oman orginsa palautteet (Palaute-sivun kysely)', async () => {
  const alice = env.authenticatedContext('alice', { email: 'alice@a.fi' });
  await assertSucceeds(getDocs(query(fb(alice), where('orgId', '==', 'org-a'))));
});

test('jäsen ei listaa toisen orgin palautteita', async () => {
  const alice = env.authenticatedContext('alice', { email: 'alice@a.fi' });
  await assertFails(getDocs(query(fb(alice), where('orgId', '==', 'org-b'))));
});

test('kysely ilman orgId-ehtoa hylätään, myös limitillä', async () => {
  const alice = env.authenticatedContext('alice', { email: 'alice@a.fi' });
  await assertFails(getDocs(query(fb(alice), limit(200))));
  await assertFails(getDocs(fb(alice)));
});

test('kirjautumaton ei listaa mitään', async () => {
  const anon = env.unauthenticatedContext();
  await assertFails(getDocs(query(fb(anon), where('orgId', '==', 'org-a'))));
});
