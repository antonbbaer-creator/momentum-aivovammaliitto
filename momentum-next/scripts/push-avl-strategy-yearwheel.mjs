// Päivittää AVL:n yearwheel- ja commsPlan-dokumentit Firestoreen
// uusilla strategian ja vuosikellon oletusarvoilla (lib/avl-defaults.ts).
// Käyttää firebase-admin SDK:ta (ohittaa Firestore-säännöt).
//
// Käyttö:
//   FIREBASE_ADMIN_KEY=<base64-tai-json> \
//     node scripts/push-avl-strategy-yearwheel.mjs [--dry-run]
//
// FIREBASE_ADMIN_KEY voi olla joko:
//   - service account -JSON (alkaa '{')
//   - base64-koodattu JSON

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const dryRun = process.argv.includes('--dry-run');

const raw = process.env.FIREBASE_ADMIN_KEY;
if (!raw) {
  console.error('FIREBASE_ADMIN_KEY puuttuu env-muuttujista.');
  console.error('Aseta esim:');
  console.error('  export FIREBASE_ADMIN_KEY="$(cat /path/to/service-account.json)"');
  process.exit(1);
}
let json = raw.trim();
if (!json.startsWith('{')) {
  json = Buffer.from(json, 'base64').toString('utf-8');
}
const sa = JSON.parse(json);

if (!getApps().length) {
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

const { DEFAULT_AVL_YEARWHEEL, DEFAULT_AVL_COMMS_PLAN } = await import('../lib/avl-defaults.ts');

const ORG = 'avl';
const writes = [
  { key: 'yearwheel', label: `Vuosikello (${DEFAULT_AVL_YEARWHEEL.length} vaihetta)`, value: DEFAULT_AVL_YEARWHEEL },
  { key: 'commsPlan', label: 'Viestintäsuunnitelma 2026 (strategia 2026–2030)', value: { ...DEFAULT_AVL_COMMS_PLAN, updatedAt: Date.now() } },
];

console.log(`AVL Firestore-päivitys${dryRun ? ' [DRY RUN]' : ''}`);
console.log('Org:', ORG);
console.log('Project:', sa.project_id);
console.log('');

for (const { key, label, value } of writes) {
  const ref = db.collection('organizations').doc(ORG).collection('data').doc(key);
  const existing = await ref.get();
  const exists = existing.exists;
  console.log(`• ${key}: ${exists ? 'ylikirjoitetaan' : 'luodaan uusi'} — ${label}`);

  if (!dryRun) {
    await ref.set({
      v: JSON.stringify(value),
      ts: Date.now(),
      updatedBy: 'push-avl-strategy-yearwheel',
    });
    console.log(`  ✓ kirjoitettu organizations/${ORG}/data/${key}`);
  }
}

console.log('');
console.log(dryRun
  ? 'Dry run valmis — mitään ei kirjoitettu. Aja ilman --dry-run lippua kun olet valmis.'
  : 'Valmis. Lataa Momentum uudelleen nähdäksesi muutokset.');

process.exit(0);
