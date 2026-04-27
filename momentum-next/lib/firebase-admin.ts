// Firebase Admin -alustus server-puolelle (OAuth-callbackit, route handlerit).
// Vaadittavat env-muuttujat:
//   FIREBASE_ADMIN_KEY = base64- TAI plain-JSON service account
// TAI:
//   GOOGLE_APPLICATION_CREDENTIALS = polku service-account-tiedostoon

import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

let app: App | null = null;

function init(): App {
  if (app) return app;
  if (getApps().length > 0) {
    app = getApps()[0]!;
    return app;
  }

  const raw = process.env.FIREBASE_ADMIN_KEY;
  if (raw) {
    let json = raw.trim();
    if (!json.startsWith('{')) {
      // base64-pakattu
      try {
        json = Buffer.from(json, 'base64').toString('utf-8');
      } catch (e) {
        throw new Error('FIREBASE_ADMIN_KEY ei ole validia base64- tai JSON-muotoa');
      }
    }
    const sa = JSON.parse(json);
    app = initializeApp({ credential: cert(sa) });
    return app;
  }

  // Fallback: Application Default Credentials (esim. emulaattori, GCP)
  app = initializeApp();
  return app;
}

export function adminDb(): Firestore {
  return getFirestore(init());
}
