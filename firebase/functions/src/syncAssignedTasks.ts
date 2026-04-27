// Cloud Function: synkronoi org-tehtävät käyttäjäkohtaiseen mirror-kokoelmaan.
//
// Trigger: kun /organizations/{orgId}/data/{key} muuttuu, parsii uuden v-JSON:in
// ja päivittää users/{uid}/assignedTasks/{compositeId} jokaiselle nimetylle tekijälle.
// Mirror-dokumentti poistetaan kun tehtävä on done, deletedAt tai assignee tyhjä.
//
// Huom: yksinkertaisuuden vuoksi koko mirrorin recompute orgille tehdään diffin sijaan.

import * as admin from 'firebase-admin';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import {
  AssignedTaskMirror,
  Grant,
  OrgTeamMember,
  Project,
  Task,
  effectiveStatus,
  getAssignees,
} from './types';

if (admin.apps.length === 0) admin.initializeApp();
const db = admin.firestore();

// Tunnistetaan tehtäväavaimet — tasks, projects, ja grant-tyyppiset (alkavat 'grants' tai 'apurahat').
const isTaskKey = (key: string) =>
  key === 'tasks' ||
  key === 'projects' ||
  key.startsWith('grants') ||
  key.startsWith('apurahat');

interface NameToUid {
  [normalizedName: string]: string;
}

const norm = (s: string) => s.toLowerCase().trim();
const firstName = (s: string) => s.split(/\s+/)[0] || s;

/** Resolvoi nimi → uid org-jäsenistön ja users-kollektion email-mappauksen kautta. */
async function buildNameToUid(orgId: string): Promise<NameToUid> {
  const map: NameToUid = {};

  // Lue orgTeamMembers
  const membersSnap = await db.doc(`organizations/${orgId}/data/orgTeamMembers`).get();
  if (!membersSnap.exists) return map;

  let members: OrgTeamMember[] = [];
  try {
    const v = membersSnap.data()?.v;
    members = v ? (JSON.parse(v) as OrgTeamMember[]) : [];
  } catch {
    return map;
  }

  // Kokoa mahdolliset emailit
  const emailSet = new Set<string>();
  for (const m of members) {
    if (m.email) emailSet.add(norm(m.email));
    for (const e of m.linkedUserEmails || []) emailSet.add(norm(e));
  }
  if (emailSet.size === 0) return map;

  // Hae uid kullekin emailille users-kokoelmasta (yksi query per email — pieni n)
  const emailToUid: Record<string, string> = {};
  await Promise.all(
    Array.from(emailSet).map(async (email) => {
      const q = await db
        .collection('users')
        .where('email', '==', email)
        .limit(1)
        .get();
      if (!q.empty) emailToUid[email] = q.docs[0].id;
    }),
  );

  // Mappaa member.name → uid
  for (const m of members) {
    if (!m.name) continue;
    const candidates: string[] = [];
    if (m.email) candidates.push(norm(m.email));
    for (const e of m.linkedUserEmails || []) candidates.push(norm(e));
    let uid: string | undefined;
    for (const c of candidates) {
      if (emailToUid[c]) {
        uid = emailToUid[c];
        break;
      }
    }
    if (uid) {
      map[norm(m.name)] = uid;
      map[norm(firstName(m.name))] = uid;
    }
  }

  return map;
}

interface TaskRef {
  task: Task;
  sourceType: AssignedTaskMirror['sourceType'];
  sourceId?: string;
}

/** Kerää orgin kaikki tehtävät tasks/projects/grants/apurahat-avaimista. */
async function collectOrgTasks(orgId: string): Promise<TaskRef[]> {
  const out: TaskRef[] = [];
  const dataSnap = await db.collection(`organizations/${orgId}/data`).get();
  for (const doc of dataSnap.docs) {
    const key = doc.id;
    if (!isTaskKey(key)) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(doc.data().v);
    } catch {
      continue;
    }
    if (!Array.isArray(parsed)) continue;

    if (key === 'tasks') {
      for (const t of parsed as Task[]) out.push({ task: t, sourceType: 'task' });
    } else if (key === 'projects') {
      for (const p of parsed as Project[]) {
        if (p.deletedAt || p.archived) continue;
        for (const t of p.tasks || []) out.push({ task: t, sourceType: 'projectTask', sourceId: p.id });
      }
    } else {
      // grants tai apurahat
      for (const g of parsed as Grant[]) {
        if (g.deletedAt) continue;
        for (const s of g.subtasks || []) out.push({ task: s, sourceType: 'grantSubtask', sourceId: g.id });
      }
    }
  }
  return out;
}

const compositeId = (orgId: string, sourceType: string, sourceId: string | undefined, taskId: string) =>
  `${orgId}__${sourceType}__${sourceId || 'root'}__${taskId}`;

/**
 * Recompute koko mirror tälle orgille. Kirjoita kaikki avoimet tehtävät uid:lle,
 * poista sellaiset jotka eivät enää kuulu mirrorille (perustuu compositeId-prefixiin).
 */
export async function recomputeOrgMirror(orgId: string): Promise<void> {
  const [orgDoc, nameToUid, taskRefs] = await Promise.all([
    db.doc(`organizations/${orgId}`).get(),
    buildNameToUid(orgId),
    collectOrgTasks(orgId),
  ]);
  const orgName = (orgDoc.data()?.name as string | undefined) || orgId;

  // Halutut mirror-dokumentit (uid → compositeId → mirror)
  const desired: Record<string, Record<string, AssignedTaskMirror>> = {};

  for (const ref of taskRefs) {
    const t = ref.task;
    if (!t || !t.id || t.deletedAt || t.done) continue;
    const status = effectiveStatus(t);
    const assignees = getAssignees(t);
    if (assignees.length === 0) continue;

    for (const name of assignees) {
      const uid = nameToUid[norm(name)] || nameToUid[norm(firstName(name))];
      if (!uid) continue;
      const cid = compositeId(orgId, ref.sourceType, ref.sourceId, t.id);
      if (!desired[uid]) desired[uid] = {};
      desired[uid][cid] = {
        compositeId: cid,
        orgId,
        orgName,
        sourceType: ref.sourceType,
        sourceId: ref.sourceId,
        taskId: t.id,
        text: t.text,
        deadline: t.deadline,
        status,
        done: !!t.done,
        deletedAt: t.deletedAt,
        assignedBy: t.assignedBy,
        updatedAt: Date.now(),
      };
    }
  }

  // Hae nykyiset mirror-dokumentit kaikilta käyttäjiltä joilla saattaa olla osumia
  // (kaikki uid:t joilla on tämän orgin etuliitteellä alkava mirror — käytä collectionGroup).
  const stale = await db
    .collectionGroup('assignedTasks')
    .where('orgId', '==', orgId)
    .get();

  // Ryhmittele staleit uid:n mukaan path-segmentistä
  const existingByUid: Record<string, Set<string>> = {};
  for (const doc of stale.docs) {
    const segments = doc.ref.path.split('/');
    // path: users/{uid}/assignedTasks/{compositeId}
    const uid = segments[1];
    if (!existingByUid[uid]) existingByUid[uid] = new Set();
    existingByUid[uid].add(doc.id);
  }

  // Yhdistä uid-joukko (uudet + olemassaolevat)
  const allUids = new Set<string>([...Object.keys(desired), ...Object.keys(existingByUid)]);

  // Batch operaatiot
  const writer = db.bulkWriter();
  for (const uid of allUids) {
    const want = desired[uid] || {};
    const have = existingByUid[uid] || new Set<string>();

    // Kirjoita / päivitä halutut
    for (const [cid, mirror] of Object.entries(want)) {
      writer.set(db.doc(`users/${uid}/assignedTasks/${cid}`), mirror);
    }

    // Poista vanhentuneet (have \ want), mutta vain nämä jotka kuuluvat tälle orgille
    for (const cid of have) {
      if (!cid.startsWith(`${orgId}__`)) continue;
      if (!want[cid]) {
        writer.delete(db.doc(`users/${uid}/assignedTasks/${cid}`));
      }
    }
  }
  await writer.close();
}

export const syncAssignedTasks = onDocumentWritten(
  'organizations/{orgId}/data/{key}',
  async (event) => {
    const orgId = event.params.orgId as string;
    const key = event.params.key as string;
    if (!isTaskKey(key) && key !== 'orgTeamMembers') return;

    try {
      await recomputeOrgMirror(orgId);
    } catch (err) {
      console.error(`syncAssignedTasks failed for ${orgId}/${key}:`, err);
      throw err;
    }
  },
);
