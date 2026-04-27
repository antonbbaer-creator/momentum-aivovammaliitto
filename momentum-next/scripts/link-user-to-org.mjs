#!/usr/bin/env node
// Liitä käyttäjä organisaatioon (CLI). Kutsuu samaa logiikkaa kuin
// /api/admin/link-user-to-org -route.
//
// Käyttö:
//   FIREBASE_ADMIN_KEY=<base64-tai-json> \
//     node scripts/link-user-to-org.mjs <email> <orgId> [memberMatchName] [role]
//
// Esim:
//   node scripts/link-user-to-org.mjs hanna.hovitie@kinolapinlahti.fi llff "Hanna Hovitie"

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const [, , email, orgId, memberMatchName, roleArg] = process.argv;
if (!email || !orgId) {
  console.error('Käyttö: node scripts/link-user-to-org.mjs <email> <orgId> [memberName] [role]');
  process.exit(1);
}

const raw = process.env.FIREBASE_ADMIN_KEY;
if (!raw) {
  console.error('FIREBASE_ADMIN_KEY puuttuu env-muuttujista');
  process.exit(1);
}
let json = raw.trim();
if (!json.startsWith('{')) {
  json = Buffer.from(json, 'base64').toString('utf-8');
}
const sa = JSON.parse(json);
if (getApps().length === 0) initializeApp({ credential: cert(sa) });
const db = getFirestore();

// Inline-toteutus (vältetään TS→.mjs-import). Sama logiikka kuin
// lib/admin/link-user-to-org.ts.

const norm = (s) => (s || '').toLowerCase().trim();

async function linkUserToOrg(email, orgId, memberMatchName, role = 'member') {
  const steps = [];
  const warnings = [];

  // 1. UID
  let uid = null, userData = null;
  const q = await db.collection('users').where('email', '==', email).limit(1).get();
  if (!q.empty) { uid = q.docs[0].id; userData = q.docs[0].data(); }
  else {
    const all = await db.collection('users').get();
    const target = norm(email);
    for (const d of all.docs) {
      if (norm(d.data().email) === target) { uid = d.id; userData = d.data(); break; }
    }
  }
  if (!uid) return { ok: false, error: 'Käyttäjää ei löydy users-collectionista', steps, warnings };
  steps.push(`uid: ${uid}`);

  // 2. Org
  const orgSnap = await db.doc(`organizations/${orgId}`).get();
  if (!orgSnap.exists) return { ok: false, error: `Organisaatiota "${orgId}" ei löydy`, steps, warnings };
  const orgName = orgSnap.data().name || orgId;

  // 3. userOrgs
  const userOrgsRef = db.doc(`userOrgs/${uid}`);
  const cur = (await userOrgsRef.get()).data() || { orgs: [], orgIds: [] };
  const orgs = Array.isArray(cur.orgs) ? cur.orgs.slice() : [];
  const orgIds = Array.isArray(cur.orgIds) ? cur.orgIds.slice() : [];
  if (orgIds.includes(orgId)) {
    steps.push(`userOrgs sisältää jo ${orgId}`);
  } else {
    orgs.push({ orgId, role, name: orgName });
    orgIds.push(orgId);
    await userOrgsRef.set({ orgs, orgIds }, { merge: true });
    steps.push(`+ userOrgs.orgs ja .orgIds (${orgId})`);
  }

  // 4. members/{uid}
  const memberRef = db.doc(`organizations/${orgId}/members/${uid}`);
  if ((await memberRef.get()).exists) {
    steps.push(`members/${uid} on jo`);
  } else {
    await memberRef.set({
      role, joinedAt: new Date().toISOString(),
      displayName: userData?.displayName || null,
      email: userData?.email || email,
      photoURL: userData?.photoURL || null,
    });
    steps.push(`+ organizations/${orgId}/members/${uid}`);
  }

  // 5. orgTeamMembers linkedUserEmails
  if (memberMatchName) {
    const ref = db.doc(`organizations/${orgId}/data/orgTeamMembers`);
    const snap = await ref.get();
    if (!snap.exists) {
      warnings.push('orgTeamMembers-dokumentti ei ole — ohitetaan linkitys');
    } else {
      let members;
      try { members = JSON.parse(snap.data().v); }
      catch { warnings.push('orgTeamMembers v ei ole validia JSONia'); members = []; }
      if (Array.isArray(members)) {
        const target = norm(memberMatchName);
        const targetFirst = target.split(' ')[0];
        let idx = members.findIndex(m => norm(m.name) === target);
        if (idx < 0) idx = members.findIndex(m => norm(m.name).split(' ')[0] === targetFirst);
        if (idx < 0) {
          warnings.push(`orgTeamMembersissä ei matchaavaa nimeä "${memberMatchName}". Olemassa: ${members.map(m => m.name).join(', ')}`);
        } else {
          const m = members[idx];
          const linked = Array.isArray(m.linkedUserEmails) ? m.linkedUserEmails.slice() : [];
          if (linked.map(norm).includes(norm(email))) {
            steps.push(`linkedUserEmails sisältää jo ${email}`);
          } else {
            linked.push(email);
            members[idx] = { ...m, linkedUserEmails: linked, email: m.email || email };
            await ref.set({ v: JSON.stringify(members), ts: Date.now(), updatedBy: 'script:link-user-to-org' });
            steps.push(`+ linkedUserEmails: "${m.name}" → ${email}`);
          }
        }
      }
    }
  }

  return { ok: true, uid, steps, warnings };
}

(async () => {
  console.log(`> Liitetään ${email} → ${orgId} ${memberMatchName ? `(member: ${memberMatchName})` : ''}`);
  const r = await linkUserToOrg(email, orgId, memberMatchName, roleArg || 'member');
  for (const s of r.steps) console.log('  ' + s);
  for (const w of r.warnings) console.log('  ! ' + w);
  if (!r.ok) {
    console.error('FAIL:', r.error);
    process.exit(2);
  }
  console.log('> Valmis. Pyydä käyttäjää lataamaan sivu uudelleen.');
  process.exit(0);
})().catch(e => { console.error('FAIL:', e); process.exit(3); });
