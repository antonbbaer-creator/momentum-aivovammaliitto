'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, onAuthStateChanged, signInWithPopup, signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db, googleProvider, persistenceReady } from './firebase';

export type OrgRole = 'owner' | 'admin' | 'member' | 'visitor';

export interface UserOrg {
  orgId: string;
  role: OrgRole;
  name: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  orgs: UserOrg[];
  activeOrg: string | null;
  activeOrgRole: OrgRole | null;
  isVisitor: boolean;
  canEdit: boolean;
  setActiveOrg: (orgId: string) => void;
  loginWithGoogle: () => Promise<void>;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshOrgs: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  orgs: [],
  activeOrg: null,
  activeOrgRole: null,
  isVisitor: false,
  canEdit: true,
  setActiveOrg: () => {},
  loginWithGoogle: async () => {},
  loginWithEmail: async () => {},
  signUpWithEmail: async () => {},
  logout: async () => {},
  refreshOrgs: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [orgs, setOrgs] = useState<UserOrg[]>([]);
  const [activeOrg, setActiveOrgState] = useState<string | null>(null);

  const activeOrgRole = orgs.find(o => o.orgId === activeOrg)?.role ?? null;
  const isVisitor = activeOrgRole === 'visitor';
  const canEdit = activeOrgRole !== null && activeOrgRole !== 'visitor';

  const fetchOrgs = async (uid: string) => {
    const snap = await getDoc(doc(db, 'userOrgs', uid));
    if (snap.exists()) {
      const data = snap.data();
      return (data.orgs || []) as UserOrg[];
    }
    return [];
  };

  const refreshOrgs = async () => {
    if (!user) return;
    const userOrgs = await fetchOrgs(user.uid);
    setOrgs(userOrgs);
  };

  useEffect(() => {
    // Wait for session persistence to be set, THEN listen to auth state
    persistenceReady.then(() => {
      const unsub = onAuthStateChanged(auth, async (u) => {
        setUser(u);
        if (u) {
          await setDoc(doc(db, 'users', u.uid), {
            email: u.email,
            displayName: u.displayName,
            photoURL: u.photoURL,
            lastLoginAt: new Date().toISOString(),
          }, { merge: true });

          const userOrgs = await fetchOrgs(u.uid);
          setOrgs(userOrgs);

          const stored = typeof window !== 'undefined' ? localStorage.getItem('momentum_activeOrg') : null;
          if (stored && userOrgs.some(o => o.orgId === stored)) {
            setActiveOrgState(stored);
          } else if (userOrgs.length > 0) {
            setActiveOrgState(userOrgs[0].orgId);
            localStorage.setItem('momentum_activeOrg', userOrgs[0].orgId);
          }
        } else {
          setOrgs([]);
          setActiveOrgState(null);
        }
        setLoading(false);
      });
      return () => unsub();
    });
  }, []);

  const setActiveOrg = (orgId: string) => {
    setActiveOrgState(orgId);
    localStorage.setItem('momentum_activeOrg', orgId);
  };

  const loginWithGoogle = async () => {
    await signInWithPopup(auth, googleProvider);
  };

  const loginWithEmail = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  };

  const signUpWithEmail = async (email: string, password: string, name: string) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: name });
  };

  const logout = async () => {
    await signOut(auth);
    localStorage.removeItem('momentum_activeOrg');
  };

  return (
    <AuthContext.Provider value={{
      user, loading, orgs, activeOrg, activeOrgRole, isVisitor, canEdit,
      setActiveOrg, loginWithGoogle, loginWithEmail, signUpWithEmail, logout, refreshOrgs
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
