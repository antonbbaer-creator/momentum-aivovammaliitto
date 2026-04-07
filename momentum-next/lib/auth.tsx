'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db, googleProvider } from './firebase';

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
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        // Update user profile in Firestore
        await setDoc(doc(db, 'users', u.uid), {
          email: u.email,
          displayName: u.displayName,
          photoURL: u.photoURL,
          lastLoginAt: new Date().toISOString(),
        }, { merge: true });

        // Fetch user's orgs
        const userOrgs = await fetchOrgs(u.uid);
        setOrgs(userOrgs);

        // Restore active org from localStorage
        const stored = localStorage.getItem('momentum_activeOrg');
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
  }, []);

  const setActiveOrg = (orgId: string) => {
    setActiveOrgState(orgId);
    localStorage.setItem('momentum_activeOrg', orgId);
  };

  const loginWithGoogle = async () => {
    await signInWithPopup(auth, googleProvider);
  };

  const logout = async () => {
    await signOut(auth);
    localStorage.removeItem('momentum_activeOrg');
  };

  return (
    <AuthContext.Provider value={{
      user, loading, orgs, activeOrg, activeOrgRole, isVisitor, canEdit,
      setActiveOrg, loginWithGoogle, logout, refreshOrgs
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
