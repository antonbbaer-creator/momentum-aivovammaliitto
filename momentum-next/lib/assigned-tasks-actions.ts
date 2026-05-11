// Cross-org-kirjoittajia tehtaville joita käyttäjä on saanut muista orgeista.
// PersonalHomeSection lukee `useAssignedTasks`-hookin kautta — talta tehdaan
// vastaavat hyvaksy/hylkaa-kirjoittajat jotka osaavat kohdistaa oikeaan
// Firestore-dokumenttiin orgId + sourceType + sourceId perusteella.

import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { acceptAssignment, rejectAssignment, type Assignable } from './assignments-shared';
import { getGrantsKey } from './org-defaults';
import type { AssignedTaskMirror } from './personal-shared';

interface DocShape {
  v?: string;
  ts?: number;
  updatedBy?: string;
}

const readOrgData = async <T,>(orgId: string, key: string, fallback: T): Promise<T> => {
  const ref = doc(db, 'organizations', orgId, 'data', key);
  const snap = await getDoc(ref);
  const data = snap.data() as DocShape | undefined;
  if (!data?.v) return fallback;
  try { return JSON.parse(data.v) as T; } catch { return fallback; }
};

const writeOrgData = async (orgId: string, key: string, value: unknown, uid?: string) => {
  const ref = doc(db, 'organizations', orgId, 'data', key);
  await setDoc(ref, { v: JSON.stringify(value), ts: Date.now(), updatedBy: uid });
};

// Sourcetype-kohtainen Firestore-key.
const keyFor = (mirror: AssignedTaskMirror): string | null => {
  switch (mirror.sourceType) {
    case 'task':         return 'tasks';
    case 'projectTask':  return 'projects';
    case 'grantSubtask': return getGrantsKey(mirror.orgId);
    case 'noteAction':   return null; // ei oikea assignable; kasitellaan erikseen
  }
};

type Patcher = <T extends Assignable>(t: T) => T;

// Yksittaisen tehtavan paivitys oikeasta source-dokumentista.
async function patchAssignable(
  mirror: AssignedTaskMirror,
  patcher: Patcher,
  uid?: string,
): Promise<boolean> {
  const key = keyFor(mirror);
  if (!key) return false;

  if (mirror.sourceType === 'task') {
    const arr = await readOrgData<any[]>(mirror.orgId, key, []);
    const next = arr.map((t: any) => t.id === mirror.taskId ? patcher(t) : t);
    await writeOrgData(mirror.orgId, key, next, uid);
    return true;
  }

  if (mirror.sourceType === 'projectTask') {
    const arr = await readOrgData<any[]>(mirror.orgId, key, []);
    const next = arr.map((p: any) => {
      // sourceId voi olla numero tai string Firestoressa — verrataan loosesti.
      // eslint-disable-next-line eqeqeq
      if (p.id != mirror.sourceId) return p;
      return { ...p, tasks: (p.tasks || []).map((t: any) => t.id === mirror.taskId ? patcher(t) : t) };
    });
    await writeOrgData(mirror.orgId, key, next, uid);
    return true;
  }

  if (mirror.sourceType === 'grantSubtask') {
    const arr = await readOrgData<any[]>(mirror.orgId, key, []);
    const next = arr.map((g: any) => {
      if (g.id !== mirror.sourceId) return g;
      return { ...g, subtasks: (g.subtasks || []).map((s: any) => s.id === mirror.taskId ? patcher(s) : s) };
    });
    await writeOrgData(mirror.orgId, key, next, uid);
    return true;
  }

  return false;
}

export const acceptAssignedTask = (mirror: AssignedTaskMirror, uid?: string) =>
  patchAssignable(mirror, acceptAssignment, uid);

export const rejectAssignedTask = (mirror: AssignedTaskMirror, reason: string, byName: string, uid?: string) =>
  patchAssignable(mirror, (t) => rejectAssignment(t, reason, byName), uid);
