// Quick script to seed AVL org data to Firestore without auth
// Uses Firebase client SDK with anonymous-like direct write

import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyB6MGUyOveOl1zaV_1c0TdBVldZM09Sm8E",
  authDomain: "momentum-69262.firebaseapp.com",
  projectId: "momentum-69262",
  storageBucket: "momentum-69262.firebasestorage.app",
  messagingSenderId: "465706849550",
  appId: "1:465706849550:web:9103dc22e7088e53c5335f",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Import seed data and modules
const { AVL_ORG, AVL_EVENTS, AVL_CHANNEL_STATS } = await import('../lib/seed-data.ts');
const { getDefaultModules } = await import('../lib/modules.ts');

const AVL_MODULES = getDefaultModules('avl');

console.log('Seeding AVL org data...');
console.log('Fields:', Object.keys(AVL_ORG).join(', '));
console.log('Modules:', Object.entries(AVL_MODULES).filter(([,v]) => v).map(([k]) => k).join(', '));

try {
  await setDoc(doc(db, 'organizations', 'avl', 'data', 'org'), {
    v: JSON.stringify(AVL_ORG),
    ts: Date.now(),
    updatedBy: 'seed-script',
  });
  console.log('AVL org data written.');

  await setDoc(doc(db, 'organizations', 'avl', 'data', 'events'), {
    v: JSON.stringify(AVL_EVENTS),
    ts: Date.now(),
    updatedBy: 'seed-script',
  });
  console.log('AVL events written.');

  await setDoc(doc(db, 'organizations', 'avl', 'data', 'channelStats'), {
    v: JSON.stringify(AVL_CHANNEL_STATS),
    ts: Date.now(),
    updatedBy: 'seed-script',
  });
  console.log('AVL channel stats written.');

  await setDoc(doc(db, 'organizations', 'avl', 'data', 'modules'), {
    v: JSON.stringify(AVL_MODULES),
    ts: Date.now(),
    updatedBy: 'seed-script',
  });
  console.log('AVL modules written.');

  console.log('Done! Reload the page to see changes.');
} catch (e) {
  console.error('Error:', e.message);
}

process.exit(0);
