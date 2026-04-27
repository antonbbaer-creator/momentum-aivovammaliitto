// Firebase Admin -alustus server-puolelle (OAuth-callbackit, route handlerit).
// Tukee kahta tilaa:
//   1) Tuotanto / täysi pääsy: FIREBASE_ADMIN_KEY = base64-/JSON service account
//      → kaikki Firestore-kirjoitukset ja ID-tokenin verifiointi toimii
//   2) Fallback (ilman service accountia): alustaa pelkällä projektitunnuksella
//      → ID-tokenin verifiointi toimii (julkiset avaimet riittävät), mutta
//        kirjoitus Firestoreen vaatii client-puolen tunnukset (sääntöjen rajoissa)

import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

const FALLBACK_PROJECT_ID = 'momentum-69262';

let app: App | null = null;
let initMode: 'service-account' | 'project-only' | null = null;

function init(): App {
  if (app) return app;
  if (getApps().length > 0) {
    app = getApps()[0]!;
    // Päättele mode olemassaolevasta appista
    initMode = process.env.FIREBASE_ADMIN_KEY ? 'service-account' : 'project-only';
    return app;
  }

  const raw = process.env.FIREBASE_ADMIN_KEY;
  if (raw) {
    let json = raw.trim();
    if (!json.startsWith('{')) {
      try {
        json = Buffer.from(json, 'base64').toString('utf-8');
      } catch {
        throw new Error('FIREBASE_ADMIN_KEY ei ole validia base64- tai JSON-muotoa');
      }
    }
    const sa = JSON.parse(json);
    app = initializeApp({ credential: cert(sa) });
    initMode = 'service-account';
    return app;
  }

  // Fallback: alusta pelkällä projectId:llä jotta ID-tokenin verifiointi toimii.
  // Firestore-kirjoitukset eivät onnistu ilman credentialsia (paitsi GCPssä
  // Application Default Credentialsilla).
  console.warn(
    '[firebase-admin] FIREBASE_ADMIN_KEY puuttuu — käytetään project-only-alustusta. ' +
    'Token-verifiointi toimii, mutta Firestore-kirjoitukset epäonnistuvat. ' +
    'Aseta FIREBASE_ADMIN_KEY .env.local -tiedostoon.',
  );
  app = initializeApp({ projectId: FALLBACK_PROJECT_ID });
  initMode = 'project-only';
  return app;
}

export function adminDb(): Firestore {
  return getFirestore(init());
}

export function adminMode(): 'service-account' | 'project-only' | null {
  init();
  return initMode;
}
