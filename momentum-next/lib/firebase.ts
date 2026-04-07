import { initializeApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider, browserSessionPersistence, setPersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyB6MGUyOveOl1zaV_1c0TdBVldZM09Sm8E",
  authDomain: "momentum-69262.firebaseapp.com",
  projectId: "momentum-69262",
  storageBucket: "momentum-69262.firebasestorage.app",
  messagingSenderId: "465706849550",
  appId: "1:465706849550:web:9103dc22e7088e53c5335f",
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const auth = getAuth(app);
setPersistence(auth, browserSessionPersistence);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
