// Yhteinen logiikka käyttäjän liittämiseen organisaatioon.
// Käyttävät: scripts/link-user-to-org.mjs (CLI) ja /api/admin/link-user-to-org (UI).

import type { Firestore } from 'firebase-admin/firestore';

const norm = (s?: string) => (s || '').toLowerCase().trim();

export type LinkRole = 'owner' | 'admin' | 'member' | 'visitor';

export interface LinkResult {
  ok: boolean;
  uid?: string;
  steps: string[];
  warnings: string[];
  error?: string;
}

export async function linkUserToOrg(
  db: Firestore,
  email: string,
  orgId: string,
  opts: { memberName?: string | null; role?: LinkRole } = {},
): Promise<LinkResult> {
  const role: LinkRole = opts.role || 'member';
  const memberName = opts.memberName || null;
  const steps: string[] = [];
  const warnings: string[] = [];

  // 1. Etsi UID
  let uid: string | null = null;
  let userData: Record<string, unknown> | null = null;
  const q = await db.collection('users').where('email', '==', email).limit(1).get();
  if (!q.empty) {
    uid = q.docs[0].id;
    userData = q.docs[0].data();
  } else {
    const all = await db.collection('users').get();
    const target = norm(email);
    for (const d of all.docs) {
      if (norm((d.data() as { email?: string }).email) === target) {
        uid = d.id;
        userData = d.data();
        break;
      }
    }
  }
  if (!uid) {
    return {
      ok: false,
      steps,
      warnings,
      error: 'Käyttäjää ei löydy users-collectionista. Pyydä häntä kirjautumaan ensin.',
    };
  }
  steps.push(`uid: ${uid}`);

  // 2. Org-doc
  const orgSnap = await db.doc(`organizations/${orgId}`).get();
  if (!orgSnap.exists) {
    return { ok: false, uid, steps, warnings, error: `Organisaatiota "${orgId}" ei löydy` };
  }
  const orgName = (orgSnap.data() as { name?: string }).name || orgId;

  // 3. userOrgs
  const userOrgsRef = db.doc(`userOrgs/${uid}`);
  const userOrgsSnap = await userOrgsRef.get();
  const cur = (userOrgsSnap.exists ? userOrgsSnap.data() : { orgs: [], orgIds: [] }) as {
    orgs?: Array<{ orgId: string; role: string; name: string }>;
    orgIds?: string[];
  };
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

  // 4. organizations/{orgId}/members/{uid}
  const memberRef = db.doc(`organizations/${orgId}/members/${uid}`);
  const memberSnap = await memberRef.get();
  if (memberSnap.exists) {
    steps.push(`members/${uid} on jo`);
  } else {
    await memberRef.set({
      role,
      joinedAt: new Date().toISOString(),
      displayName: (userData as { displayName?: string })?.displayName || null,
      email: (userData as { email?: string })?.email || email,
      photoURL: (userData as { photoURL?: string })?.photoURL || null,
    });
    steps.push(`+ organizations/${orgId}/members/${uid}`);
  }

  // 5. orgTeamMembers — linkedUserEmails
  if (memberName) {
    const orgMembersRef = db.doc(`organizations/${orgId}/data/orgTeamMembers`);
    const orgMembersSnap = await orgMembersRef.get();
    if (!orgMembersSnap.exists) {
      warnings.push('orgTeamMembers-dokumenttia ei ole, ohitetaan linkitys');
    } else {
      let members: Array<Record<string, unknown>>;
      try {
        members = JSON.parse((orgMembersSnap.data() as { v?: string }).v || '[]');
      } catch {
        warnings.push('orgTeamMembers v ei ole validia JSONia');
        members = [];
      }
      if (Array.isArray(members)) {
        const target = norm(memberName);
        const targetFirst = target.split(' ')[0];
        let idx = members.findIndex(m => norm(m.name as string) === target);
        if (idx < 0) idx = members.findIndex(m => norm(m.name as string).split(' ')[0] === targetFirst);
        if (idx < 0) {
          warnings.push(`orgTeamMembersissä ei matchaavaa nimeä "${memberName}". Olemassaolevat: ${members.map(m => m.name).join(', ')}`);
        } else {
          const m = members[idx];
          const linked = Array.isArray(m.linkedUserEmails) ? (m.linkedUserEmails as string[]).slice() : [];
          if (linked.map(norm).includes(norm(email))) {
            steps.push(`linkedUserEmails sisältää jo ${email}`);
          } else {
            linked.push(email);
            members[idx] = {
              ...m,
              linkedUserEmails: linked,
              email: m.email || email,
            };
            await orgMembersRef.set({
              v: JSON.stringify(members),
              ts: Date.now(),
              updatedBy: 'admin:link-user-to-org',
            });
            steps.push(`+ linkedUserEmails: "${m.name}" → ${email}`);
          }
        }
      }
    }
  }

  return { ok: true, uid, steps, warnings };
}
