'use client';

import { useEffect } from 'react';
import { doc, setDoc, deleteDoc, serverTimestamp, getDoc, updateDoc } from 'firebase/firestore';
import { getToken, onMessage, deleteToken } from 'firebase/messaging';
import { auth, db, getMessagingIfSupported } from './firebase';

// VAPID public key Firebase Console -> Project settings -> Cloud Messaging -> Web Push certs
// Julkinen avain, voidaan kovakoodata bundleen — silti pidetaan env-muuttujassa jotta on
// helppo vaihtaa ilman koodimuutoksia.
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_FCM_VAPID_KEY || '';

const DEVICE_ID_KEY = 'momentum_device_id';

export interface DeviceDoc {
  fcmToken: string;
  platform: 'web' | 'ios-pwa' | 'android-pwa' | 'desktop-pwa';
  userAgent: string;
  createdAt: number;
  lastSeenAt: number;
}

function detectPlatform(): DeviceDoc['platform'] {
  if (typeof window === 'undefined') return 'web';
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches
    || (window.navigator as { standalone?: boolean }).standalone === true;
  const ua = window.navigator.userAgent;
  if (!standalone) return 'web';
  if (/iPhone|iPad|iPod/.test(ua)) return 'ios-pwa';
  if (/Android/.test(ua)) return 'android-pwa';
  return 'desktop-pwa';
}

function getOrCreateDeviceId(): string {
  if (typeof window === 'undefined') return '';
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = (crypto.randomUUID?.() || `dev_${Date.now()}_${Math.random().toString(36).slice(2)}`);
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return `dev_${Date.now()}`;
  }
}

const deviceDocRef = (uid: string, deviceId: string) =>
  doc(db, 'users', uid, 'devices', deviceId);

const userMetaDocRef = (uid: string) => doc(db, 'users', uid, 'meta', 'profile');

/** Permission state. 'unsupported' = selain ei tue Notification APIa lainkaan. */
export type NotifPermission = 'default' | 'granted' | 'denied' | 'unsupported';

export function currentPermission(): NotifPermission {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission as NotifPermission;
}

/** Pyytaa selaimen permissionin. Palauttaa lopullisen tilan. */
export async function requestNotificationPermission(): Promise<NotifPermission> {
  if (currentPermission() === 'unsupported') return 'unsupported';
  // Merkitse Firestoreen etta on kysytty riippumatta vastauksesta jotta UI ei
  // vaivaa kayttajaa uudelleen samassa istunnossa.
  const user = auth.currentUser;
  if (user) {
    try {
      await setDoc(userMetaDocRef(user.uid), { pushAsked: true }, { merge: true });
    } catch { /* ignore — Firestoreen ei haittaa epaonnistua */ }
  }
  const result = await Notification.requestPermission();
  return result as NotifPermission;
}

/** Rekisteroi tama laite vastaanottamaan FCM-pusheja. Vaatii etta
 *  permission on jo `granted` (kutsu requestNotificationPermission ensin). */
export async function registerDeviceToken(): Promise<string | null> {
  if (currentPermission() !== 'granted') return null;
  if (!VAPID_PUBLIC_KEY) {
    console.warn('[notifications] NEXT_PUBLIC_FCM_VAPID_KEY puuttuu — push-tokenia ei voi hakea');
    return null;
  }
  const messaging = await getMessagingIfSupported();
  if (!messaging) return null;

  const user = auth.currentUser;
  if (!user) return null;

  // Service worker rekisterointi (firebase-messaging-sw.js public-kansiossa)
  let registration: ServiceWorkerRegistration | undefined;
  if ('serviceWorker' in navigator) {
    try {
      registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    } catch (e) {
      console.warn('[notifications] SW-rekisterointi epaonnistui', e);
      return null;
    }
  }

  const token = await getToken(messaging, {
    vapidKey: VAPID_PUBLIC_KEY,
    serviceWorkerRegistration: registration,
  });
  if (!token) return null;

  const deviceId = getOrCreateDeviceId();
  const now = Date.now();
  const docData: DeviceDoc = {
    fcmToken: token,
    platform: detectPlatform(),
    userAgent: navigator.userAgent,
    createdAt: now,
    lastSeenAt: now,
  };
  // merge: jos deviceId:lle on jo dokumentti, paivita lastSeenAt + token (tokeni voi rotatoitua)
  await setDoc(deviceDocRef(user.uid, deviceId), docData, { merge: true });
  return token;
}

/** Paivita laitteen lastSeenAt — kutsutaan kun sovellus avataan. */
export async function touchDeviceLastSeen(): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  const deviceId = getOrCreateDeviceId();
  if (!deviceId) return;
  try {
    const ref = deviceDocRef(user.uid, deviceId);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, { lastSeenAt: Date.now() });
    }
  } catch { /* ignore */ }
}

/** Poista nykyisen laitteen FCM-token (logoutissa tai 'Poista laite' -napissa). */
export async function unregisterDeviceToken(): Promise<void> {
  const messaging = await getMessagingIfSupported();
  if (messaging) {
    try { await deleteToken(messaging); } catch { /* ignore */ }
  }
  const user = auth.currentUser;
  if (!user) return;
  const deviceId = getOrCreateDeviceId();
  if (!deviceId) return;
  try {
    await deleteDoc(deviceDocRef(user.uid, deviceId));
  } catch { /* ignore */ }
}

/** Poista mika tahansa rekisteroity laite uid:n alta (settings UIsta). */
export async function deleteRegisteredDevice(uid: string, deviceId: string): Promise<void> {
  await deleteDoc(deviceDocRef(uid, deviceId));
}

/** React-hook: kuuntele foreground-viestit (sovellus auki). */
export function useForegroundNotifications(
  handler: (payload: { title?: string; body?: string; data?: Record<string, string> }) => void,
) {
  useEffect(() => {
    let unsub: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      const messaging = await getMessagingIfSupported();
      if (cancelled || !messaging) return;
      unsub = onMessage(messaging, (payload) => {
        handler({
          title: payload.notification?.title,
          body: payload.notification?.body,
          data: payload.data as Record<string, string> | undefined,
        });
      });
    })();
    return () => {
      cancelled = true;
      try { unsub?.(); } catch { /* ignore */ }
    };
  }, [handler]);
}
// serverTimestamp imported for future use (esim. paivityksiin Firestore-ajalla)
void serverTimestamp;
