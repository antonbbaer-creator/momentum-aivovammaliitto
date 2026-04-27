// Cloud Function: lähetä push-notifikaatio kun käyttäjälle tulee uusi tehtävä
// tai sen status muuttuu. Triggeroituu users/{uid}/assignedTasks/{cid}-mirrorin
// muutoksesta — mirror on jo ylläpidetty syncAssignedTasks:ssa.

import * as admin from 'firebase-admin';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { AssignedTaskMirror, NotifPrefs } from '../types';
import { sendPushToUsers } from './lib/sendPush';

if (admin.apps.length === 0) admin.initializeApp();
const db = admin.firestore();

async function loadPrefs(uid: string): Promise<NotifPrefs> {
  const snap = await db.doc(`users/${uid}/meta/notifPrefs`).get();
  if (!snap.exists) return { enabled: false, chatMessages: 'all', tasks: true };
  return {
    enabled: false,
    chatMessages: 'all',
    tasks: true,
    ...(snap.data() as Partial<NotifPrefs>),
  };
}

function previewText(s: string | undefined): string {
  const t = (s || '').replace(/\s+/g, ' ').trim();
  if (t.length <= 140) return t;
  return t.slice(0, 137) + '…';
}

export const sendTaskNotification = onDocumentWritten(
  'users/{uid}/assignedTasks/{cid}',
  async (event) => {
    const uid = event.params.uid as string;
    const before = event.data?.before?.data() as AssignedTaskMirror | undefined;
    const after = event.data?.after?.data() as AssignedTaskMirror | undefined;

    // Vain create tai status-muutos kiinnostaa
    let kind: 'new' | 'status' | null = null;
    let title = '';
    let body = '';

    if (!before && after && !after.done && !after.deletedAt) {
      kind = 'new';
      title = 'Uusi tehtävä';
      body = previewText(after.text);
    } else if (before && after && before.status !== after.status && !after.done && !after.deletedAt) {
      kind = 'status';
      const map: Record<string, string> = {
        accepted: 'Tehtäväsi hyväksyttiin',
        rejected: 'Tehtäväsi hylättiin',
        pending: 'Tehtävän tila muuttui odottavaksi',
      };
      title = map[after.status] || 'Tehtäväsi tila päivittyi';
      body = previewText(after.text);
    }

    if (!kind || !after) return;

    const prefs = await loadPrefs(uid);
    if (!prefs.enabled || !prefs.tasks) return;

    const orgId = after.orgId;
    const link = `/${orgId}/tyonjako`;

    try {
      await sendPushToUsers([uid], {
        title,
        body,
        link,
        tag: `task:${after.compositeId}`,
        data: {
          kind: 'task',
          orgId,
          taskId: after.taskId,
          compositeId: after.compositeId,
          changeKind: kind,
        },
      });
    } catch (err) {
      console.error(`[sendTaskNotification] push failed uid=${uid} cid=${after.compositeId}`, err);
    }
  },
);
