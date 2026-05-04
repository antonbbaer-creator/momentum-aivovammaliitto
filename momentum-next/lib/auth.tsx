'use client';

import { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';
import { User, onAuthStateChanged, signInWithPopup, signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db, googleProvider, persistenceReady } from './firebase';
import { isOrgEnabled } from './enabled-orgs';
import { isSuperAdminEmail } from './super-admins';

// Super-admin email -> auto-provision -lista. Synkattu firestore.rules:n
// isSuperAdmin()-funktion kanssa. Nämä käyttäjät saavat kirjautuessaan
// automaattisesti omistajaroolin tähän listaan kuuluvissa orgeissa, jos eivät
// vielä ole jäseniä — ei tarvita admin-paneelin nappia.
const SUPER_ADMIN_AUTO_PROVISION_ORGS: { orgId: string; name: string }[] = [
  { orgId: 'hetki-company', name: 'Hetki Company' },
];

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

  const fetchOrgs = async (uid: string): Promise<UserOrg[]> => {
    const snap = await getDoc(doc(db, 'userOrgs', uid));
    if (!snap.exists()) return [];
    const data = snap.data();
    const allOrgs = (data.orgs || []) as UserOrg[];

    // Tarkista rinnakkain etta org-doc on olemassa Firestoressa.
    // Jos admin on poistanut orgin /admin-paneelista, /userOrgs-dokumenttiin
    // jaa zombie-viittaus joka tekisi sivupalkin epajohdonmukaiseksi.
    const checks = await Promise.all(allOrgs.map(async (o) => {
      try {
        const orgSnap = await getDoc(doc(db, 'organizations', o.orgId));
        return { o, exists: orgSnap.exists() };
      } catch {
        // Permission tai verkkovirhe — ei poisteta varmuuden vuoksi
        return { o, exists: true };
      }
    }));
    const existing = checks.filter(c => c.exists).map(c => c.o);
    const removed = checks.filter(c => !c.exists).map(c => c.o.orgId);

    // Paivita userOrgs jos zombie-viittauksia loytyi tai orgIds ei sync
    const desiredIds = existing.map(o => o.orgId);
    const storedIds = (data.orgIds || []) as string[];
    const idsOutOfSync = JSON.stringify([...desiredIds].sort()) !== JSON.stringify([...storedIds].sort());
    if (removed.length > 0 || idsOutOfSync) {
      try {
        await setDoc(doc(db, 'userOrgs', uid), { orgs: existing, orgIds: desiredIds }, { merge: true });
        if (removed.length > 0) {
          console.log('[auth] poistettu zombie-orgit userOrgsista:', removed);
        }
      } catch (e) {
        console.warn('[auth] userOrgs-prune epaonnistui', e);
      }
    }

    // Suodata viela enabled-listalla — disabloitu data sailyy Firestoressa
    return existing.filter(o => isOrgEnabled(o.orgId));
  };

  const refreshOrgs = async () => {
    if (!user) return;
    const userOrgs = await fetchOrgs(user.uid);
    setOrgs(userOrgs);
  };

  useEffect(() => {
    persistenceReady.then(() => {
      const unsub = onAuthStateChanged(auth, async (u) => {
        if (u) {
          // Fetch everything BEFORE updating state — single render
          await setDoc(doc(db, 'users', u.uid), {
            email: u.email,
            displayName: u.displayName,
            photoURL: u.photoURL,
            lastLoginAt: new Date().toISOString(),
          }, { merge: true });

          // Super-admin auto-provision: jos kayttaja on super-admin, ja
          // SUPER_ADMIN_AUTO_PROVISION_ORGS-listassa on org jota ei viela
          // loydy hanen userOrgs-listalta, luodaan org-doc + member + linkitys.
          if (isSuperAdminEmail(u.email)) {
            try {
              const userOrgsSnap = await getDoc(doc(db, 'userOrgs', u.uid));
              const cur = userOrgsSnap.exists() ? userOrgsSnap.data() : {};
              const curOrgs = (cur.orgs || []) as UserOrg[];
              const curIds = new Set(curOrgs.map(o => o.orgId));
              let nextOrgs = curOrgs;
              for (const target of SUPER_ADMIN_AUTO_PROVISION_ORGS) {
                if (curIds.has(target.orgId)) continue;
                // Luo org-dokumentti jos ei ole
                const orgDocRef = doc(db, 'organizations', target.orgId);
                const orgSnap = await getDoc(orgDocRef);
                if (!orgSnap.exists()) {
                  await setDoc(orgDocRef, {
                    name: target.name,
                    createdAt: new Date().toISOString(),
                    createdBy: u.uid,
                    plan: 'free',
                  }, { merge: true });
                }
                // Linkita kayttaja jaseneksi
                await setDoc(doc(db, 'organizations', target.orgId, 'members', u.uid), {
                  role: 'owner',
                  joinedAt: new Date().toISOString(),
                  displayName: u.displayName || '',
                  email: u.email || '',
                  photoURL: u.photoURL || '',
                }, { merge: true });
                nextOrgs = [...nextOrgs, { orgId: target.orgId, role: 'owner', name: target.name }];
              }
              if (nextOrgs !== curOrgs) {
                await setDoc(doc(db, 'userOrgs', u.uid), {
                  orgs: nextOrgs,
                  orgIds: nextOrgs.map(o => o.orgId),
                }, { merge: true });
              }
            } catch (err) {
              console.warn('[auth] super-admin auto-provision epaonnistui', err);
            }
          }

          const userOrgs = await fetchOrgs(u.uid);

          const stored = typeof window !== 'undefined' ? localStorage.getItem('momentum_activeOrg') : null;
          let orgToSet: string | null = null;
          if (stored && userOrgs.some(o => o.orgId === stored)) {
            orgToSet = stored;
          } else if (userOrgs.length > 0) {
            orgToSet = userOrgs[0].orgId;
            localStorage.setItem('momentum_activeOrg', userOrgs[0].orgId);
          }

          // Set ALL state at once so no intermediate render with user but no orgs
          setUser(u);
          setOrgs(userOrgs);
          setActiveOrgState(orgToSet);
        } else {
          setUser(null);
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
