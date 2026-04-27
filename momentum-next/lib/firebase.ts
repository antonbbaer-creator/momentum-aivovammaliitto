import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, browserLocalPersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getMessaging, isSupported, type Messaging } from 'firebase/messaging';

export const firebaseConfig = {
  apiKey: "AIzaSyB6MGUyOveOl1zaV_1c0TdBVldZM09Sm8E",
  authDomain: "momentum-69262.firebaseapp.com",
  projectId: "momentum-69262",
  storageBucket: "momentum-69262.firebasestorage.app",
  messagingSenderId: "465706849550",
  appId: "1:465706849550:web:9103dc22e7088e53c5335f",
};

const app: FirebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const auth = getAuth(app);
// Local persistence: sessio säilyy selaimen sulkemisen yli (localStorage).
// Käyttäjän pitää nimenomaisesti kirjautua ulos sulkeakseen session.
auth.settings.appVerificationDisabledForTesting = false;
export const persistenceReady = auth.setPersistence(browserLocalPersistence);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();

// Firebase Cloud Messaging — vain selaimessa, vain tuetuilla alustoilla.
// `isSupported()` palauttaa false esim. jos ServiceWorker tai Notification puuttuu.
let _messaging: Messaging | null = null;
let _messagingPromise: Promise<Messaging | null> | null = null;
export function getMessagingIfSupported(): Promise<Messaging | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (_messaging) return Promise.resolve(_messaging);
  if (_messagingPromise) return _messagingPromise;
  _messagingPromise = isSupported().then((ok) => {
    if (!ok) return null;
    _messaging = getMessaging(app);
    return _messaging;
  }).catch(() => null);
  return _messagingPromise;
}
