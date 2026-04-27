// Backfill-skripti: ajetaan kerran kun syncAssignedTasks-funktio deployataan.
// Iteroi kaikkien organisaatioiden yli ja kutsuu recomputeOrgMirror.
//
// Käyttö (paikallisesti, GOOGLE_APPLICATION_CREDENTIALS asetettu):
//   npm run build && node lib/scripts/backfillAssignedTasks.js
//
// Tai emulaattorissa:
//   firebase emulators:start --only firestore,functions
//   FIRESTORE_EMULATOR_HOST=localhost:8080 node lib/scripts/backfillAssignedTasks.js

import * as admin from 'firebase-admin';
import { recomputeOrgMirror } from '../syncAssignedTasks';

if (admin.apps.length === 0) admin.initializeApp();

async function main() {
  const orgs = await admin.firestore().collection('organizations').listDocuments();
  console.log(`Found ${orgs.length} organizations`);
  for (const orgRef of orgs) {
    console.log(`Recomputing mirror for ${orgRef.id}...`);
    try {
      await recomputeOrgMirror(orgRef.id);
      console.log(`  done`);
    } catch (e) {
      console.error(`  FAILED for ${orgRef.id}:`, e);
    }
  }
  console.log('Backfill complete');
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
