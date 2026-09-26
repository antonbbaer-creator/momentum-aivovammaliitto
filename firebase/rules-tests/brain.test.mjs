// Aivojen org-eristys (ohjeen "RLS-testi"): toisen organisaation käyttäjä ei näe Hetken aivoja,
// lukija lukee muttei kirjoita, selain ei kirjoita koskaan (kirjoitukset vain palvelimen kautta),
// audit-loki vain omistajille ja agenttitokenit eivät näy kenellekään.
// Ajo: cd firebase/rules-tests && npm install && npm test

import { readFileSync } from 'node:fs';
import { test, before, after } from 'node:test';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, query, where } from 'firebase/firestore';

let env;
const ORG = 'hetki-company';
const OTHER = 'toinen-org';

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-momentum-brain',
    firestore: { rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8') },
  });
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    await setDoc(doc(db, `organizations/${ORG}`), { name: 'Hetki' });
    await setDoc(doc(db, `organizations/${OTHER}`), { name: 'Toinen' });
    await setDoc(doc(db, `organizations/${ORG}/members/omistaja`), { role: 'owner' });
    await setDoc(doc(db, `organizations/${ORG}/members/jasen`), { role: 'member' });
    await setDoc(doc(db, `organizations/${ORG}/members/lukija`), { role: 'visitor' });
    await setDoc(doc(db, `organizations/${OTHER}/members/ulkopuolinen`), { role: 'owner' });
    for (const c of ['brainSections', 'brainNotes', 'brainNoteNames', 'brainDecisions', 'brainProposals', 'brainGoals', 'brainMetricEntries', 'brainInbox', 'brainTemplates', 'brainViews', 'brainAuditLog']) {
      await setDoc(doc(db, `organizations/${ORG}/${c}/x`), { salainen: 'liiketoimintatietoa' });
    }
    await setDoc(doc(db, `organizations/${ORG}/brainNotes/x/revisions/1`), { bodyMd: 'vanha' });
    await setDoc(doc(db, 'brainAgentTokens/abc'), { orgId: ORG, scopes: ['read'] });
  });
});

after(async () => { await env?.cleanup(); });

const as = (uid) => env.authenticatedContext(uid, { email: `${uid}@esim.fi` }).firestore();
const READABLE = ['brainSections', 'brainNotes', 'brainNoteNames', 'brainDecisions', 'brainProposals', 'brainGoals', 'brainMetricEntries', 'brainInbox', 'brainTemplates', 'brainViews'];

test('toisen orgin käyttäjä ei lue eikä listaa Hetken aivoja', async () => {
  const db = as('ulkopuolinen');
  for (const c of [...READABLE, 'brainAuditLog']) {
    await assertFails(getDoc(doc(db, `organizations/${ORG}/${c}/x`)));
    await assertFails(getDocs(collection(db, `organizations/${ORG}/${c}`)));
  }
  await assertFails(getDoc(doc(db, `organizations/${ORG}/brainNotes/x/revisions/1`)));
});

test('kirjautumaton ei näe mitään', async () => {
  const db = env.unauthenticatedContext().firestore();
  for (const c of READABLE) await assertFails(getDoc(doc(db, `organizations/${ORG}/${c}/x`)));
});

test('jäsen ja lukija lukevat aivot ja versiot', async () => {
  for (const uid of ['jasen', 'lukija', 'omistaja']) {
    const db = as(uid);
    for (const c of READABLE) await assertSucceeds(getDoc(doc(db, `organizations/${ORG}/${c}/x`)));
    await assertSucceeds(getDocs(query(collection(db, `organizations/${ORG}/brainNotes`), where('linksOut', 'array-contains', 'x'))));
    await assertSucceeds(getDoc(doc(db, `organizations/${ORG}/brainNotes/x/revisions/1`)));
  }
});

test('selain ei kirjoita aivoihin, ei edes omistaja (vain palvelin versioineen)', async () => {
  for (const uid of ['omistaja', 'jasen', 'lukija', 'ulkopuolinen']) {
    const db = as(uid);
    for (const c of [...READABLE, 'brainAuditLog']) {
      await assertFails(setDoc(doc(db, `organizations/${ORG}/${c}/uusi`), { a: 1 }));
      await assertFails(updateDoc(doc(db, `organizations/${ORG}/${c}/x`), { a: 1 }));
      await assertFails(deleteDoc(doc(db, `organizations/${ORG}/${c}/x`)));
    }
    await assertFails(setDoc(doc(db, `organizations/${ORG}/brainNotes/x/revisions/2`), { bodyMd: 'väärennetty' }));
  }
});

test('audit-loki: omistaja lukee, jäsen ja lukija eivät', async () => {
  await assertSucceeds(getDoc(doc(as('omistaja'), `organizations/${ORG}/brainAuditLog/x`)));
  await assertFails(getDoc(doc(as('jasen'), `organizations/${ORG}/brainAuditLog/x`)));
  await assertFails(getDoc(doc(as('lukija'), `organizations/${ORG}/brainAuditLog/x`)));
});

test('agenttitokenit eivät näy kenellekään selaimessa', async () => {
  for (const uid of ['omistaja', 'ulkopuolinen']) {
    await assertFails(getDoc(doc(as(uid), 'brainAgentTokens/abc')));
    await assertFails(getDocs(collection(as(uid), 'brainAgentTokens')));
    await assertFails(setDoc(doc(as(uid), 'brainAgentTokens/uusi'), { orgId: ORG }));
  }
});
