// Yhteinen push-helper Cloud Functioneille. Kerää tokenit annetuille uid:ille,
// lähettää FCM:n kautta multicastina ja siivoaa vanhentuneet tokenit Firestoresta.

import * as admin from 'firebase-admin';

if (admin.apps.length === 0) admin.initializeApp();

const db = admin.firestore();
const messaging = admin.messaging();

export interface DeviceDoc {
  fcmToken: string;
  platform: 'web' | 'ios-pwa' | 'android-pwa' | 'desktop-pwa';
  userAgent?: string;
  createdAt?: number;
  lastSeenAt?: number;
}

export interface PushPayload {
  title: string;
  body: string;
  /** Linkki johon notifikaation klikkaus avaa selaimen. */
  link?: string;
  /** Tag jolla samaa keskustelua koskevat ilmoitukset koostetaan. */
  tag?: string;
  /** Lisätiedot data-payloadiin (kaikki arvot stringeiksi). */
  data?: Record<string, string>;
}

interface DeviceRef {
  uid: string;
  deviceId: string;
  token: string;
}

async function collectDevices(uids: string[]): Promise<DeviceRef[]> {
  if (uids.length === 0) return [];
  const out: DeviceRef[] = [];
  await Promise.all(
    uids.map(async (uid) => {
      try {
        const snap = await db.collection(`users/${uid}/devices`).get();
        for (const d of snap.docs) {
          const data = d.data() as DeviceDoc | undefined;
          if (data && data.fcmToken) out.push({ uid, deviceId: d.id, token: data.fcmToken });
        }
      } catch (e) {
        console.warn(`[sendPush] device fetch failed for ${uid}`, e);
      }
    }),
  );
  return out;
}

/**
 * Lähettää push-notifikaation kaikille annettujen uid:ien laitteille.
 * Palauttaa onnistuneiden lukumäärän.
 */
export async function sendPushToUsers(uids: string[], payload: PushPayload): Promise<number> {
  // Suodata duplikaatit
  const unique = Array.from(new Set(uids)).filter(Boolean);
  if (unique.length === 0) return 0;

  const devices = await collectDevices(unique);
  if (devices.length === 0) {
    console.log(`[sendPush] no devices for uids=${unique.join(',')}`);
    return 0;
  }

  const tokens = devices.map(d => d.token);
  const link = payload.link || '/';
  const data: Record<string, string> = { link, ...(payload.data || {}) };
  if (payload.tag) data.tag = payload.tag;

  // FCM:n sendEachForMulticast palauttaa per-token onnistumisen — käyttäen sitä
  // saamme tarkat virhekoodit, joiden perusteella siivoamme vanhentuneet tokenit.
  const res = await messaging.sendEachForMulticast({
    tokens,
    notification: { title: payload.title, body: payload.body },
    data,
    webpush: {
      fcmOptions: { link },
      notification: {
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        tag: payload.tag,
        renotify: !!payload.tag,
      },
    },
  });

  // Siivous: invalid-argument tai registration-token-not-registered → poista
  const removals: Promise<unknown>[] = [];
  res.responses.forEach((r, i) => {
    if (r.success) return;
    const code = r.error?.code || '';
    const remove =
      code === 'messaging/registration-token-not-registered' ||
      code === 'messaging/invalid-registration-token' ||
      code === 'messaging/invalid-argument';
    if (remove) {
      const dev = devices[i];
      console.log(`[sendPush] removing stale token uid=${dev.uid} device=${dev.deviceId} code=${code}`);
      removals.push(db.doc(`users/${dev.uid}/devices/${dev.deviceId}`).delete().catch(() => undefined));
    } else if (r.error) {
      console.warn('[sendPush] non-recoverable error', code, r.error.message);
    }
  });
  if (removals.length) await Promise.all(removals);

  console.log(`[sendPush] sent=${res.successCount} failed=${res.failureCount} of ${tokens.length}`);
  return res.successCount;
}
