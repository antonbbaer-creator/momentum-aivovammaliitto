'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import { collection, getDocs, doc, deleteDoc, updateDoc, query, setDoc, getDoc, where, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import AppShell from '@/components/AppShell';
import { useToast } from '@/lib/toast';
import { AVL_ORG, AVL_EVENTS, AVL_CHANNEL_STATS, LLFF_ORG, LLFF_EVENTS, LLFF_CHANNEL_STATS, JUHLATOIMIKUNTA_ORG, JUHLATOIMIKUNTA_EVENTS, JUHLATOIMIKUNTA_CHANNEL_STATS } from '@/lib/seed-data';
import { MODULE_REGISTRY, MODULE_ORDER, DEFAULT_MODULES, JUHLATOIMIKUNTA_MODULES, LUURI_MODULES, IHAA_MODULES, getDefaultModules } from '@/lib/modules';
import { getOrgTeams } from '@/lib/org-defaults';
import type { OrgTeam } from '@/lib/team-shared';
import { isSuperAdminEmail } from '@/lib/super-admins';

interface OrgMember {
  uid: string;
  displayName: string;
  email: string;
  photoURL: string;
  role: 'owner' | 'admin' | 'member';
  joinedAt: string;
  userRole?: string;
}

interface OrgData {
  id: string;
  name: string;
  shortName: string;
  slogan: string;
  createdAt: string;
  createdBy: string;
  plan: string;
  members: OrgMember[];
}

// Super admin emails: ks. lib/super-admins.ts

export default function AdminPage() {
  const { user, loading, orgs: userOrgs } = useAuth();
  const router = useRouter();
  const [orgs, setOrgs] = useState<OrgData[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [selectedOrg, setSelectedOrg] = useState<string | null>(null);
  const [tab, setTab] = useState<'orgs' | 'users'>('orgs');

  // Module configs per org
  const [orgModules, setOrgModules] = useState<Record<string, Record<string, boolean>>>({});
  const [aiProfiles, setAiProfiles] = useState<Record<string, any>>({});

  // Invite form
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'member'>('member');
  const [inviteOrgId, setInviteOrgId] = useState('');

  // Liitä käyttäjä organisaatioon -lomake (super-admin)
  const [linkEmail, setLinkEmail] = useState('');
  const [linkOrgId, setLinkOrgId] = useState('');
  const [linkRole, setLinkRole] = useState<'owner' | 'admin' | 'member' | 'visitor'>('member');
  const [linkMemberName, setLinkMemberName] = useState('');
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkResult, setLinkResult] = useState<{ ok: boolean; steps?: string[]; warnings?: string[]; error?: string; hint?: string; detail?: string } | null>(null);

  // orgTeamMembers diagnostiikka — duplikaatti-id:t ja niiden korjaus
  const [diagBusy, setDiagBusy] = useState(false);
  const [diagResult, setDiagResult] = useState<{
    orgId?: string;
    duplicates?: Array<{ id: string; names: string[] }>;
    fixed?: Array<{ oldId: string; newId: string; name: string }>;
    error?: string;
  } | null>(null);

  const slugify = (s: string): string =>
    (s || '')
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 32) || 'member';

  const clearOrgTeamLeads = async (orgId: string) => {
    if (!user) return;
    setDiagBusy(true);
    setDiagResult(null);
    try {
      const ref = doc(db, 'organizations', orgId, 'data', 'orgTeams');
      const snap = await getDoc(ref);
      let teams: OrgTeam[];
      if (snap.exists()) {
        try {
          teams = JSON.parse((snap.data() as { v?: string }).v || '[]');
        } catch {
          setDiagResult({ orgId, error: 'orgTeams v ei ole validia JSONia' });
          return;
        }
      } else {
        // Käytä org-defaulttia, kirjoita Firestoreen ilman lead-arvoja
        teams = JSON.parse(JSON.stringify(getOrgTeams(orgId))) as OrgTeam[];
      }
      if (!Array.isArray(teams)) {
        setDiagResult({ orgId, error: 'orgTeams ei ole array' });
        return;
      }
      const cleared: string[] = [];
      teams = teams.map(t => {
        if (t.leadId) cleared.push(t.name || t.id);
        const { leadId: _drop, ...rest } = t as OrgTeam & { leadId?: string };
        return rest as OrgTeam;
      });
      await setDoc(ref, {
        v: JSON.stringify(teams),
        ts: Date.now(),
        updatedBy: user.uid,
      });
      setDiagResult({
        orgId,
        fixed: cleared.length === 0
          ? [{ oldId: '-', newId: '-', name: 'Ei lead-merkintöjä — kaikki jo selvät' }]
          : cleared.map(name => ({ oldId: 'leadId', newId: '∅', name })),
      });
      toast(cleared.length === 0 ? 'Ei lead-merkintöjä' : `Lead-merkinnät poistettu (${cleared.length} tiimiä)`, 'success');
    } catch (e) {
      console.error('clearOrgTeamLeads failed:', e);
      setDiagResult({ orgId, error: String(e) });
      toast(String(e), 'error');
    } finally {
      setDiagBusy(false);
    }
  };

  const checkAndFixOrgTeamMembers = async (orgId: string, autoFix: boolean) => {
    if (!user) return;
    setDiagBusy(true);
    setDiagResult(null);
    try {
      const tmRef = doc(db, 'organizations', orgId, 'data', 'orgTeamMembers');
      const tmSnap = await getDoc(tmRef);
      if (!tmSnap.exists()) {
        setDiagResult({ orgId, error: 'orgTeamMembers-dokumentti ei ole olemassa' });
        return;
      }
      let members: Array<Record<string, unknown>>;
      try {
        members = JSON.parse((tmSnap.data() as { v?: string }).v || '[]');
      } catch {
        setDiagResult({ orgId, error: 'orgTeamMembers v ei ole validia JSONia' });
        return;
      }
      if (!Array.isArray(members)) {
        setDiagResult({ orgId, error: 'orgTeamMembers ei ole array' });
        return;
      }

      // Etsi duplikaatti-id:t
      const byId: Record<string, Array<{ idx: number; m: Record<string, unknown> }>> = {};
      members.forEach((m, idx) => {
        const id = (m.id as string) || '';
        if (!byId[id]) byId[id] = [];
        byId[id].push({ idx, m });
      });
      const dupes = Object.entries(byId).filter(([, arr]) => arr.length > 1);

      if (dupes.length === 0) {
        setDiagResult({ orgId, duplicates: [] });
        toast('Ei duplikaatti-id:itä', 'success');
        return;
      }

      const duplicatesReport = dupes.map(([id, arr]) => ({
        id,
        names: arr.map(x => (x.m.name as string) || '(nimetön)'),
      }));

      if (!autoFix) {
        setDiagResult({ orgId, duplicates: duplicatesReport });
        return;
      }

      // Korjaa: säilytä ENSIMMÄINEN samalla id:llä, anna muille uniikki id nimen perusteella
      const usedIds = new Set(members.map(m => (m.id as string) || ''));
      const fixed: Array<{ oldId: string; newId: string; name: string }> = [];
      for (const [id, arr] of dupes) {
        // Ensimmäinen säilyttää id:n
        for (let i = 1; i < arr.length; i++) {
          const { idx, m } = arr[i];
          const base = slugify(m.name as string);
          let candidate = base;
          let n = 1;
          while (usedIds.has(candidate)) {
            n += 1;
            candidate = `${base}-${n}`;
          }
          usedIds.add(candidate);
          members[idx] = { ...m, id: candidate };
          fixed.push({ oldId: id, newId: candidate, name: (m.name as string) || '' });
        }
      }

      await setDoc(tmRef, {
        v: JSON.stringify(members),
        ts: Date.now(),
        updatedBy: user.uid,
      });

      setDiagResult({ orgId, duplicates: duplicatesReport, fixed });
      toast(`Korjattu ${fixed.length} duplikaattia`, 'success');
    } catch (e) {
      console.error('checkAndFix failed:', e);
      setDiagResult({ orgId, error: String(e) });
      toast(String(e), 'error');
    } finally {
      setDiagBusy(false);
    }
  };

  const submitLink = async () => {
    if (!user || !linkEmail.trim() || !linkOrgId) return;
    const norm = (s?: string) => (s || '').toLowerCase().trim();
    setLinkBusy(true);
    setLinkResult(null);
    const steps: string[] = [];
    const warnings: string[] = [];

    try {
      // 1. UID — etsi users-collectionista (super-adminilla on list-oikeus)
      const email = linkEmail.trim();
      const target = norm(email);
      const q = query(collection(db, 'users'), where('email', '==', email), limit(1));
      const qSnap = await getDocs(q);
      let uid: string | null = null;
      let userData: Record<string, unknown> | null = null;
      if (!qSnap.empty) {
        uid = qSnap.docs[0].id;
        userData = qSnap.docs[0].data();
      } else {
        // Fallback: case-insensitive scan paikallisesti ladatusta listasta
        const found = allUsers.find(u => norm(u.email) === target);
        if (found) { uid = found.uid; userData = found; }
      }
      if (!uid) {
        setLinkResult({
          ok: false,
          error: 'Käyttäjää ei löydy users-collectionista',
          hint: 'Käyttäjän pitää olla kirjautunut Momentumiin vähintään kerran (Google-tilillä tai sähköpostilla) jotta UID syntyy.',
        });
        toast('Käyttäjää ei löydy', 'error');
        return;
      }
      steps.push(`uid: ${uid}`);

      // 2. Org-doc nimen hakua varten
      const orgSnap = await getDoc(doc(db, 'organizations', linkOrgId));
      if (!orgSnap.exists()) {
        setLinkResult({ ok: false, error: `Organisaatiota "${linkOrgId}" ei löydy` });
        toast('Org ei löydy', 'error');
        return;
      }
      const orgName = (orgSnap.data() as { name?: string }).name || linkOrgId;

      // 3. userOrgs/{uid}
      const userOrgsRef = doc(db, 'userOrgs', uid);
      const userOrgsSnap = await getDoc(userOrgsRef);
      const cur = userOrgsSnap.exists()
        ? userOrgsSnap.data() as { orgs?: Array<{ orgId: string; role: string; name: string }>; orgIds?: string[] }
        : { orgs: [], orgIds: [] };
      const orgsArr = Array.isArray(cur.orgs) ? cur.orgs.slice() : [];
      const orgIds = Array.isArray(cur.orgIds) ? cur.orgIds.slice() : [];
      if (orgIds.includes(linkOrgId)) {
        steps.push(`userOrgs sisältää jo ${linkOrgId}`);
      } else {
        orgsArr.push({ orgId: linkOrgId, role: linkRole, name: orgName });
        orgIds.push(linkOrgId);
        await setDoc(userOrgsRef, { orgs: orgsArr, orgIds }, { merge: true });
        steps.push(`+ userOrgs.orgs ja .orgIds (${linkOrgId})`);
      }

      // 4. organizations/{orgId}/members/{uid}
      const memberRef = doc(db, 'organizations', linkOrgId, 'members', uid);
      const memberSnap = await getDoc(memberRef);
      if (memberSnap.exists()) {
        steps.push(`members/${uid} on jo`);
      } else {
        await setDoc(memberRef, {
          role: linkRole,
          joinedAt: new Date().toISOString(),
          displayName: (userData as { displayName?: string })?.displayName || null,
          email: (userData as { email?: string })?.email || email,
          photoURL: (userData as { photoURL?: string })?.photoURL || null,
        });
        steps.push(`+ organizations/${linkOrgId}/members/${uid}`);
      }

      // 5. orgTeamMembers — lisää linkedUserEmails
      if (linkMemberName.trim()) {
        const memberName = linkMemberName.trim();
        const tmRef = doc(db, 'organizations', linkOrgId, 'data', 'orgTeamMembers');
        const tmSnap = await getDoc(tmRef);
        if (!tmSnap.exists()) {
          warnings.push('orgTeamMembers-dokumentti ei ole vielä olemassa — ohitetaan linkitys');
        } else {
          let members: Array<Record<string, unknown>>;
          try {
            members = JSON.parse((tmSnap.data() as { v?: string }).v || '[]');
          } catch {
            warnings.push('orgTeamMembers v ei ole validia JSONia');
            members = [];
          }
          if (Array.isArray(members)) {
            const t = norm(memberName);
            const tFirst = t.split(' ')[0];
            let idx = members.findIndex(m => norm(m.name as string) === t);
            if (idx < 0) idx = members.findIndex(m => norm(m.name as string).split(' ')[0] === tFirst);
            if (idx < 0) {
              warnings.push(`orgTeamMembersissä ei matchaavaa nimeä "${memberName}". Olemassa: ${members.map(m => m.name).join(', ')}`);
            } else {
              const m = members[idx];
              const linked = Array.isArray(m.linkedUserEmails) ? (m.linkedUserEmails as string[]).slice() : [];
              if (linked.map(norm).includes(norm(email))) {
                steps.push(`linkedUserEmails sisältää jo ${email}`);
              } else {
                linked.push(email);
                members[idx] = { ...m, linkedUserEmails: linked, email: m.email || email };
                await setDoc(tmRef, {
                  v: JSON.stringify(members),
                  ts: Date.now(),
                  updatedBy: user.uid,
                });
                steps.push(`+ linkedUserEmails: "${m.name}" → ${email}`);
              }
            }
          }
        }
      }

      setLinkResult({ ok: true, steps, warnings });
      toast(`Liitetty ${email} → ${linkOrgId}`, 'success');
      setLinkEmail(''); setLinkMemberName('');
      // Lataa sivu uudelleen jotta käyttäjälistaus + jäsenet päivittyvät
      setTimeout(() => window.location.reload(), 1200);
    } catch (e) {
      console.error('submitLink failed:', e);
      setLinkResult({
        ok: false,
        error: 'Operaatio epäonnistui',
        detail: String(e),
        hint: 'Tarkista että olet super-admin (Firestore-säännöissä) ja että orgId on oikea.',
        steps,
        warnings,
      });
      toast(String(e), 'error');
    } finally {
      setLinkBusy(false);
    }
  };

  const { toast } = useToast();
  const [seeding, setSeeding] = useState(false);
  const isSuperAdmin = isSuperAdminEmail(user?.email);

  // Seed AVL + LLFF demo communities
  const seedCommunities = async () => {
    if (!user) return;
    setSeeding(true);
    try {
      for (const { orgData, events, channelStats, orgId, orgName, joinCode } of [
        { orgData: AVL_ORG, events: AVL_EVENTS, channelStats: AVL_CHANNEL_STATS, orgId: 'avl', orgName: 'Aivovammaliitto', joinCode: 'aivovammaliitto-hetki-2026' },
        { orgData: LLFF_ORG, events: LLFF_EVENTS, channelStats: LLFF_CHANNEL_STATS, orgId: 'llff', orgName: 'Lapinlahden Elokuvajuhlat', joinCode: 'LLFF2026' },
        { orgData: JUHLATOIMIKUNTA_ORG, events: JUHLATOIMIKUNTA_EVENTS, channelStats: JUHLATOIMIKUNTA_CHANNEL_STATS, orgId: 'juhlatoimikunta', orgName: 'Juhlatoimikunta', joinCode: 'juhlatoimikunta-sirpa-70v' },
      ]) {
        // Create org document
        await setDoc(doc(db, 'organizations', orgId), {
          name: orgName, shortName: orgData.s, slogan: orgData.slogan,
          joinCode, createdAt: new Date().toISOString(), createdBy: user.uid, plan: 'free',
        }, { merge: true });

        // joinCodes-lookup: kanoninen lähde, jonka avulla muut käyttäjät
        // voivat löytää orgin koodillaan ilman organizations-listausoikeutta.
        await setDoc(doc(db, 'joinCodes', joinCode.toLowerCase()), {
          orgId, orgName, joinCode, updatedAt: new Date().toISOString(),
        });

        // Add current user as owner
        await setDoc(doc(db, 'organizations', orgId, 'members', user.uid), {
          role: 'owner', joinedAt: new Date().toISOString(),
          displayName: user.displayName || '', email: user.email || '', photoURL: user.photoURL || '',
        }, { merge: true });

        // Write org data — org/events/channelStats kirjoitetaan vain jos docia ei ole.
        // Nama ovat isoja kustomoituja dokumentteja jotka eivat saa "reseedata" itseaan.
        const existingOrgSnap = await getDocs(collection(db, 'organizations', orgId, 'data'));
        const existingInit = new Map<string, string>();
        for (const d of existingOrgSnap.docs) existingInit.set(d.id, d.data().v || '');
        const writeIfMissing = async (key: string, value: unknown) => {
          const existing = existingInit.get(key);
          let shouldWrite = true;
          if (existing) {
            try {
              const parsed = JSON.parse(existing);
              if (parsed && (Array.isArray(parsed) ? parsed.length > 0 : Object.keys(parsed).length > 0)) shouldWrite = false;
            } catch { /* invalid — treat as empty */ }
          }
          if (shouldWrite) {
            await setDoc(doc(db, 'organizations', orgId, 'data', key), { v: JSON.stringify(value), ts: Date.now(), updatedBy: user.uid });
          }
        };
        await writeIfMissing('org', orgData);
        await writeIfMissing('events', events);
        await writeIfMissing('channelStats', channelStats);

        // Initialize empty collections — KRIITTINEN: vain jos docia ei ole tai se on tyhja.
        // Setdoc merge-optio ei suojaa kun docilla on vain v-kentta — tarkistetaan etukateen
        // jotta ei ylikirjoiteta tuotannon dataa (esim. LLFF-muistiinpanot).
        const seedSnap = await getDocs(collection(db, 'organizations', orgId, 'data'));
        const seedExisting = new Map<string, string>();
        for (const d of seedSnap.docs) seedExisting.set(d.id, d.data().v || '');
        for (const key of ['projects', 'publications', 'media_meta', 'media_uploaded', 'media_collections']) {
          const existing = seedExisting.get(key);
          let shouldSeed = true;
          if (existing) {
            try {
              const parsed = JSON.parse(existing);
              if (Array.isArray(parsed) && parsed.length > 0) shouldSeed = false;
              if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && Object.keys(parsed).length > 0) shouldSeed = false;
            } catch { /* treat invalid as empty */ }
          }
          if (shouldSeed) {
            await setDoc(doc(db, 'organizations', orgId, 'data', key), { v: JSON.stringify([]), ts: Date.now(), updatedBy: user.uid });
          }
        }

        // Seed org-specific modules
        if (orgId === 'juhlatoimikunta') {
          await setDoc(doc(db, 'organizations', orgId, 'data', 'modules'), { v: JSON.stringify(JUHLATOIMIKUNTA_MODULES), ts: Date.now(), updatedBy: user.uid });
        }
      }

      // Update user's org list
      const existingSnap = await getDocs(collection(db, 'userOrgs'));
      let existingOrgs: any[] = [];
      for (const d of existingSnap.docs) {
        if (d.id === user.uid) existingOrgs = d.data().orgs || [];
      }
      const newOrgs = [
        ...existingOrgs.filter((o: any) => o.orgId !== 'avl' && o.orgId !== 'llff' && o.orgId !== 'juhlatoimikunta'),
        { orgId: 'avl', role: 'owner', name: 'Aivovammaliitto' },
        { orgId: 'llff', role: 'owner', name: 'Lapinlahden Elokuvajuhlat' },
        { orgId: 'juhlatoimikunta', role: 'owner', name: 'Juhlatoimikunta' },
      ];
      await setDoc(doc(db, 'userOrgs', user.uid), { orgs: newOrgs });

      toast('AVL + LLFF + Juhlatoimikunta yhteisöt luotu!', 'success');
      window.location.reload();
    } catch (e) {
      console.error('Seed error:', e);
      toast('Virhe yhteisöjen luonnissa', 'error');
    } finally {
      setSeeding(false);
    }
  };

  // Fetch all organizations and their members
  useEffect(() => {
    if (!user || !isSuperAdmin) return;

    const fetchAll = async () => {
      setLoadingData(true);
      try {
        // Fetch all orgs
        const orgsSnap = await getDocs(collection(db, 'organizations'));
        const orgsList: OrgData[] = [];

        for (const orgDoc of orgsSnap.docs) {
          const orgData = orgDoc.data();
          // Fetch members for each org
          const membersSnap = await getDocs(collection(db, 'organizations', orgDoc.id, 'members'));
          const members: OrgMember[] = membersSnap.docs.map(m => ({
            uid: m.id,
            ...m.data(),
          })) as OrgMember[];

          orgsList.push({
            id: orgDoc.id,
            name: orgData.name || 'Nimetön',
            shortName: orgData.shortName || '',
            slogan: orgData.slogan || '',
            createdAt: orgData.createdAt || '',
            createdBy: orgData.createdBy || '',
            plan: orgData.plan || 'free',
            members,
          });
        }
        setOrgs(orgsList);

        // Fetch module configs per org
        const modulesMap: Record<string, Record<string, boolean>> = {};
        for (const orgDoc of orgsSnap.docs) {
          try {
            const modSnap = await getDocs(collection(db, 'organizations', orgDoc.id, 'data'));
            const modDoc = modSnap.docs.find(d => d.id === 'modules');
            if (modDoc) {
              modulesMap[orgDoc.id] = JSON.parse(modDoc.data().v || '{}');
            } else {
              modulesMap[orgDoc.id] = { ...getDefaultModules(orgDoc.id) };
            }
          } catch { modulesMap[orgDoc.id] = { ...getDefaultModules(orgDoc.id) }; }
        }
        setOrgModules(modulesMap);

        // Fetch AI profiles per org
        const profilesMap: Record<string, any> = {};
        for (const orgDoc of orgsSnap.docs) {
          try {
            const dataSnap = await getDocs(collection(db, 'organizations', orgDoc.id, 'data'));
            const profileDoc = dataSnap.docs.find(d => d.id === 'aiProfile');
            if (profileDoc) {
              profilesMap[orgDoc.id] = JSON.parse(profileDoc.data().v || '{}');
            }
          } catch {}
        }
        setAiProfiles(profilesMap);

        // Fetch all users
        const usersSnap = await getDocs(collection(db, 'users'));
        setAllUsers(usersSnap.docs.map(u => ({ uid: u.id, ...u.data() })));
      } catch (e) {
        console.error('Admin fetch error:', e);
      } finally {
        setLoadingData(false);
      }
    };

    fetchAll();
  }, [user, isSuperAdmin]);

  // Redirect if not super admin
  useEffect(() => {
    if (!loading && (!user || !isSuperAdmin)) {
      const org = userOrgs?.[0]?.orgId || 'avl';
      router.push(`/${org}/dashboard`);
    }
  }, [user, loading, isSuperAdmin, router]);

  if (loading || !isSuperAdmin) {
    return (
      <div className="onb">
        <div className="onb-wrap" style={{ textAlign: 'center' }}>
          <div className="typing"><span /><span /><span /></div>
        </div>
      </div>
    );
  }

  const removeMember = async (orgId: string, uid: string) => {
    if (!confirm('Haluatko varmasti poistaa tämän jäsenen?')) return;
    try {
      await deleteDoc(doc(db, 'organizations', orgId, 'members', uid));
      // Update userOrgs
      const userOrgsSnap = await getDocs(collection(db, 'userOrgs'));
      // Remove org from user's list
      for (const uoDoc of userOrgsSnap.docs) {
        if (uoDoc.id === uid) {
          const data = uoDoc.data();
          const updated = (data.orgs || []).filter((o: any) => o.orgId !== orgId);
          await setDoc(doc(db, 'userOrgs', uid), { orgs: updated });
        }
      }
      // Refresh
      setOrgs(prev => prev.map(o => o.id === orgId ? { ...o, members: o.members.filter(m => m.uid !== uid) } : o));
    } catch (e) {
      console.error('Remove member error:', e);
      alert('Virhe jäsenen poistamisessa');
    }
  };

  const changeRole = async (orgId: string, uid: string, newRole: 'owner' | 'admin' | 'member') => {
    try {
      // 1) Paivita members-subcollection
      await updateDoc(doc(db, 'organizations', orgId, 'members', uid), { role: newRole });

      // 2) Paivita myos userOrgs/{uid} — frontend lukee roolin taalta activeOrgRole-arvoon.
      // Ilman tata synkroinointia UI nakee vanhan roolin (esim. Moduulit piilossa).
      const userOrgsDoc = await getDocs(query(collection(db, 'userOrgs')));
      for (const d of userOrgsDoc.docs) {
        if (d.id !== uid) continue;
        const data = d.data();
        const existingOrgs: any[] = data.orgs || [];
        const updatedOrgs = existingOrgs.map(o => o.orgId === orgId ? { ...o, role: newRole } : o);
        await setDoc(doc(db, 'userOrgs', uid), { orgs: updatedOrgs, orgIds: updatedOrgs.map(o => o.orgId) }, { merge: true });
      }

      setOrgs(prev => prev.map(o => o.id === orgId ? {
        ...o, members: o.members.map(m => m.uid === uid ? { ...m, role: newRole } : m)
      } : o));
      toast('Rooli paivitetty — kayttaja nakee muutoksen seuraavan sisaankirjautumisen jalkeen', 'success');
    } catch (e) {
      console.error('Change role error:', e);
      toast('Roolin vaihto epaonnistui', 'error');
    }
  };

  const deleteOrg = async (orgId: string) => {
    // Varmennus tehdään DangerZone-komponentissa (nimen kirjoitus + kaksi nappia).
    try {
      // Delete members
      const membersSnap = await getDocs(collection(db, 'organizations', orgId, 'members'));
      for (const m of membersSnap.docs) await deleteDoc(m.ref);
      // Delete data
      const dataSnap = await getDocs(collection(db, 'organizations', orgId, 'data'));
      for (const d of dataSnap.docs) await deleteDoc(d.ref);
      // Delete org
      await deleteDoc(doc(db, 'organizations', orgId));
      setOrgs(prev => prev.filter(o => o.id !== orgId));
      setSelectedOrg(null);
      toast('Organisaatio poistettu', 'success');
    } catch (e) {
      console.error('Delete org error:', e);
      toast('Virhe organisaation poistamisessa', 'error');
    }
  };

  const inviteMember = async () => {
    if (!inviteEmail.trim() || !inviteOrgId) return;
    try {
      const invRef = doc(collection(db, 'organizations', inviteOrgId, 'invitations'));
      await setDoc(invRef, {
        email: inviteEmail.trim().toLowerCase(),
        role: inviteRole,
        invitedBy: user!.uid,
        invitedByName: user!.displayName || '',
        createdAt: new Date().toISOString(),
        status: 'pending',
      });
      setInviteEmail('');
      alert(`Kutsu lähetetty: ${inviteEmail} (${inviteRole})`);
    } catch (e) {
      console.error('Invite error:', e);
      alert('Virhe kutsun lähettämisessä');
    }
  };

  const deleteUser = async (uid: string, displayName?: string, email?: string) => {
    const label = (displayName || '').trim() || email || `uid ${uid.slice(0, 8)}…`;
    const detail = email && displayName ? `${displayName} (${email})` : label;
    const ok = confirm(`Haluatko varmasti poistaa käyttäjän?\n\n${detail}\n\nTämä poistaa käyttäjän kaikista organisaatioista, userOrgs-listalta ja users-kokoelmasta. Toimintoa ei voi peruuttaa.`);
    if (!ok) return;
    try {
      // Remove from all orgs
      for (const org of orgs) {
        if (org.members.some(m => m.uid === uid)) {
          await deleteDoc(doc(db, 'organizations', org.id, 'members', uid));
        }
      }
      // Delete userOrgs
      await deleteDoc(doc(db, 'userOrgs', uid));
      // Delete user doc
      await deleteDoc(doc(db, 'users', uid));
      setAllUsers(prev => prev.filter(u => u.uid !== uid));
      setOrgs(prev => prev.map(o => ({ ...o, members: o.members.filter(m => m.uid !== uid) })));
    } catch (e) {
      console.error('Delete user error:', e);
      alert('Virhe käyttäjän poistamisessa');
    }
  };


  const selectedOrgData = selectedOrg ? orgs.find(o => o.id === selectedOrg) : null;

  // Saman nimiset käyttäjät — eri uid:llä mutta samalla displayNamella.
  // Anton Baer pitäisi olla vain yksi uid (anton@hetkicompany.com).
  const duplicateGroups = useMemo(() => {
    const groups: Record<string, Array<{ orgId: string; orgName: string; member: OrgMember }>> = {};
    for (const org of orgs) {
      for (const m of org.members) {
        const norm = (m.displayName || '').trim().toLowerCase();
        if (!norm) continue;
        if (!groups[norm]) groups[norm] = [];
        groups[norm].push({ orgId: org.id, orgName: org.name, member: m });
      }
    }
    return Object.values(groups)
      .filter(list => new Set(list.map(x => x.member.uid)).size > 1)
      .map(list => ({ name: list[0].member.displayName, entries: list }));
  }, [orgs]);

  return (
    <AppShell title="Hallintapaneeli" subtitle="Käyttäjien ja organisaatioiden hallinta">
      {/* Varoitukset: duplikaatit ja nimettömät */}
      {duplicateGroups.length > 0 && (
        <div style={{
          background: 'rgba(245,158,11,.06)', border: '1px solid rgba(245,158,11,.3)',
          borderRadius: 'var(--rl)', padding: '1rem 1.25rem', marginBottom: '1rem',
        }}>
          <div style={{ fontSize: '.85rem', fontWeight: 700, color: '#d97706', marginBottom: '.5rem' }}>
            Saman nimisiä käyttäjiä ({duplicateGroups.length})
          </div>
          <div style={{ fontSize: '.72rem', color: 'var(--t2)', marginBottom: '.75rem' }}>
            Sama henkilö esiintyy useammalla Firebase-tilillä. Pidä jokaisesta vain yksi (esim. työsähköposti) ja poista muut.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.6rem' }}>
            {duplicateGroups.map(group => (
              <div key={group.name} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '.6rem .75rem' }}>
                <div style={{ fontSize: '.78rem', fontWeight: 700, marginBottom: '.4rem' }}>{group.name}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '.3rem' }}>
                  {group.entries.map((e, i) => (
                    <div key={`${e.orgId}-${e.member.uid}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: '.5rem', fontSize: '.72rem' }}>
                      <span style={{ flex: 1, fontFamily: 'var(--font-mono, monospace)', color: 'var(--t2)' }}>
                        {e.member.email || '(ei emailia)'} · {e.orgName} · {e.member.role}
                      </span>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => removeMember(e.orgId, e.member.uid)}
                        style={{ fontSize: '.65rem', color: 'var(--red)', padding: '.2rem .5rem' }}
                      >
                        Poista jäsenyys
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => deleteUser(e.member.uid, e.member.displayName, e.member.email)}
                        style={{ fontSize: '.65rem', color: 'var(--red)', padding: '.2rem .5rem' }}
                        title="Poista käyttäjä kaikista orgeista"
                      >
                        Poista käyttäjä
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="stats" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <div className="stat">
          <div className="stat-num">{orgs.length}</div>
          <div className="stat-lbl">Organisaatiot</div>
        </div>
        <div className="stat">
          <div className="stat-num">{allUsers.length}</div>
          <div className="stat-lbl">Käyttäjät</div>
        </div>
        <div className="stat">
          <div className="stat-num">{orgs.reduce((s, o) => s + o.members.length, 0)}</div>
          <div className="stat-lbl">Jäsenyydet</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '.35rem', marginBottom: '1.5rem', background: 'var(--elev)', borderRadius: 'var(--r)', padding: '3px', width: 'fit-content' }}>
        <button className={`cal-view-btn ${tab === 'orgs' ? 'act' : ''}`} onClick={() => { setTab('orgs'); setSelectedOrg(null); }}>
          Organisaatiot ({orgs.length})
        </button>
        <button className={`cal-view-btn ${tab === 'users' ? 'act' : ''}`} onClick={() => setTab('users')}>
          Käyttäjät ({allUsers.length})
        </button>
      </div>

      {loadingData ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--t3)' }}>
          <div className="typing"><span /><span /><span /></div>
          <p style={{ marginTop: '1rem', fontSize: '.85rem' }}>Ladataan tietoja...</p>
        </div>
      ) : (
        <>
          {/* ═══ ORGANIZATIONS TAB ═══ */}
          {tab === 'orgs' && !selectedOrg && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
              {orgs.map(org => (
                <div key={org.id} onClick={() => setSelectedOrg(org.id)} style={{
                  display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem 1.25rem',
                  background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)',
                  cursor: 'pointer', transition: 'border-color .15s',
                }} onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--pri)')} onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}>
                  <div style={{
                    width: 44, height: 44, borderRadius: 'var(--r)', background: 'var(--pri)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontSize: '1rem', fontWeight: 700, fontFamily: 'var(--font-display)', flexShrink: 0,
                  }}>{(org.shortName || org.name)[0]}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '.95rem', fontWeight: 700 }}>{org.name}</div>
                    <div style={{ fontSize: '.72rem', color: 'var(--t3)' }}>
                      {org.members.length} jäsentä {'·'} Luotu {org.createdAt ? new Date(org.createdAt).toLocaleDateString('fi-FI') : '-'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '-4px' }}>
                    {org.members.slice(0, 4).map((m, i) => (
                      <div key={m.uid} className="ava" style={{
                        width: 28, height: 28, fontSize: '.6rem', marginLeft: i > 0 ? '-6px' : 0,
                        border: '2px solid var(--card)', background: m.role === 'owner' ? 'var(--pri)' : 'var(--elev)',
                      }}>
                        {m.photoURL ? <img src={m.photoURL} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} /> : (m.displayName || '?')[0]}
                      </div>
                    ))}
                    {org.members.length > 4 && <span style={{ fontSize: '.65rem', color: 'var(--t3)', alignSelf: 'center', marginLeft: '.3rem' }}>+{org.members.length - 4}</span>}
                  </div>
                  <span style={{ color: 'var(--t3)', fontSize: '.9rem' }}>{'›'}</span>
                </div>
              ))}
              {orgs.length === 0 && (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--t3)' }}>
                  Ei organisaatioita vielä.
                </div>
              )}
            </div>
          )}

          {/* ═══ ORG DETAIL ═══ */}
          {tab === 'orgs' && selectedOrgData && (
            <div>
              <button className="btn btn-ghost" onClick={() => setSelectedOrg(null)} style={{ marginBottom: '1rem' }}>
                {'←'} Takaisin organisaatioihin
              </button>

              <div className="bcard" style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', marginBottom: '1.5rem' }}>
                <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)' }}>
                  <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 500 }}>{selectedOrgData.name}</h3>
                  <p style={{ fontSize: '.78rem', color: 'var(--t3)', marginTop: '.15rem' }}>
                    {selectedOrgData.shortName} {'·'} {selectedOrgData.plan} {'·'} ID: {selectedOrgData.id.slice(0, 8)}...
                  </p>
                </div>

                {/* Modules */}
                <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)' }}>
                  <h4 style={{ fontSize: '.82rem', fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: '1rem' }}>
                    Moduulit
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '.5rem' }}>
                    {MODULE_ORDER.map(modId => {
                      const mod = MODULE_REGISTRY[modId];
                      const orgDef = getDefaultModules(selectedOrgData.id);
                      const enabled = orgModules[selectedOrgData.id]?.[modId] ?? orgDef[modId] ?? false;
                      const isAlwaysOn = mod.alwaysOn;
                      return (
                        <div key={modId} onClick={async (e) => {
                          e.stopPropagation();
                          if (isAlwaysOn) return;
                          const currentModules = orgModules[selectedOrgData.id] || orgDef;
                          const updated = { ...currentModules, [modId]: !enabled };
                          setOrgModules(prev => ({ ...prev, [selectedOrgData.id]: updated }));
                          try {
                            await setDoc(doc(db, 'organizations', selectedOrgData.id, 'data', 'modules'), { v: JSON.stringify(updated), ts: Date.now(), updatedBy: user!.uid });
                            toast(`${mod.label} ${!enabled ? 'aktivoitu' : 'deaktivoitu'}`, 'success');
                          } catch (err) {
                            toast(`Tallennus epäonnistui: ${(err as Error).message}`, 'error');
                            setOrgModules(prev => ({ ...prev, [selectedOrgData.id]: { ...updated, [modId]: enabled } }));
                          }
                        }}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '.5rem', padding: '.6rem .75rem',
                            background: enabled ? 'rgba(5,107,159,.08)' : 'var(--elev)',
                            border: `1px solid ${enabled ? 'var(--pri)' : 'var(--border)'}`,
                            borderRadius: 'var(--r)', cursor: isAlwaysOn ? 'default' : 'pointer',
                            opacity: isAlwaysOn ? 0.6 : 1, transition: 'all .15s',
                          }}>
                          <span style={{ fontSize: '.9rem' }}>{mod.icon}</span>
                          <span style={{ fontSize: '.78rem', fontWeight: 600, flex: 1 }}>{mod.label}</span>
                          <div style={{
                            width: 32, height: 18, borderRadius: 9, padding: 2,
                            background: enabled ? 'var(--pri)' : 'var(--border)',
                            transition: 'background .2s', display: 'flex', alignItems: 'center',
                          }}>
                            <div style={{
                              width: 14, height: 14, borderRadius: '50%', background: '#fff',
                              transform: enabled ? 'translateX(14px)' : 'translateX(0)',
                              transition: 'transform .2s',
                            }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* AI Profile */}
                <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)' }}>
                  <h4 style={{ fontSize: '.82rem', fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: '.5rem' }}>
                    AI-profiili
                  </h4>
                  <p style={{ fontSize: '.72rem', color: 'var(--t3)', marginBottom: '1rem', lineHeight: 1.6 }}>
                    Määrittelee miten AI toimii tässä asiakkuudessa. Rooli, fokus, painopisteet ja konteksti.
                  </p>

                  <div className="field">
                    <label>AI:n rooli</label>
                    <select className="input" value={aiProfiles[selectedOrgData.id]?.role || 'comms'} onChange={async (e) => {
                      const updated = { ...(aiProfiles[selectedOrgData.id] || {}), role: e.target.value };
                      setAiProfiles(prev => ({ ...prev, [selectedOrgData.id]: updated }));
                      await setDoc(doc(db, 'organizations', selectedOrgData.id, 'data', 'aiProfile'), { v: JSON.stringify(updated), ts: Date.now(), updatedBy: user!.uid });
                      toast('AI-rooli päivitetty', 'success');
                    }}>
                      <option value="comms">Viestinnän strateginen kumppani</option>
                      <option value="marketing">Markkinoinnin avustaja</option>
                      <option value="project">Projektipäällikkö-avustaja</option>
                      <option value="production">Tuotannon hallinta-avustaja</option>
                      <option value="custom">Räätälöity rooli</option>
                    </select>
                  </div>

                  <div className="field">
                    <label>AI:n fokus ja painopisteet</label>
                    <textarea className="input textarea" value={aiProfiles[selectedOrgData.id]?.focus || ''} onChange={e => {
                      setAiProfiles(prev => ({ ...prev, [selectedOrgData.id]: { ...(prev[selectedOrgData.id] || {}), focus: e.target.value } }));
                    }} placeholder="Esim: Keskity viestinnän strategiseen suunnitteluun. Painota saavutettavuutta ja selkokielisyyttä. Tunne STEA-rahoituksen vaatimukset."
                      style={{ minHeight: 80 }} />
                  </div>

                  <div className="field">
                    <label>Organisaation konteksti AI:lle</label>
                    <textarea className="input textarea" value={aiProfiles[selectedOrgData.id]?.context || ''} onChange={e => {
                      setAiProfiles(prev => ({ ...prev, [selectedOrgData.id]: { ...(prev[selectedOrgData.id] || {}), context: e.target.value } }));
                    }} placeholder="Organisaation tausta, missio, erityispiirteet, kohderyhmät, toimintaympäristö..."
                      style={{ minHeight: 120 }} />
                  </div>

                  <div className="field">
                    <label>AI:n sävyohje</label>
                    <input className="input" value={aiProfiles[selectedOrgData.id]?.tone || ''} onChange={e => {
                      setAiProfiles(prev => ({ ...prev, [selectedOrgData.id]: { ...(prev[selectedOrgData.id] || {}), tone: e.target.value } }));
                    }} placeholder="Esim: Asiallinen, empaattinen, rohkaiseva, selkeä" />
                  </div>

                  <div className="field">
                    <label>Kielletyt aiheet / rajoitukset</label>
                    <input className="input" value={aiProfiles[selectedOrgData.id]?.restrictions || ''} onChange={e => {
                      setAiProfiles(prev => ({ ...prev, [selectedOrgData.id]: { ...(prev[selectedOrgData.id] || {}), restrictions: e.target.value } }));
                    }} placeholder="Esim: Älä anna lääketieteellisiä neuvoja, älä spekuloi rahoituksesta" />
                  </div>

                  <button className="btn btn-primary btn-sm" onClick={async () => {
                    const profile = aiProfiles[selectedOrgData.id] || {};
                    await setDoc(doc(db, 'organizations', selectedOrgData.id, 'data', 'aiProfile'), { v: JSON.stringify(profile), ts: Date.now(), updatedBy: user!.uid });
                    toast('AI-profiili tallennettu', 'success');
                  }}>Tallenna AI-profiili</button>
                </div>

                {/* Members */}
                <div style={{ padding: '1.25rem 1.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h4 style={{ fontSize: '.82rem', fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                      Jäsenet ({selectedOrgData.members.length})
                    </h4>
                  </div>

                  {selectedOrgData.members.map(m => (
                    <div key={m.uid} style={{
                      display: 'flex', alignItems: 'center', gap: '.75rem', padding: '.75rem',
                      background: 'var(--elev)', border: '1px solid var(--border)', borderRadius: 'var(--r)',
                      marginBottom: '.5rem',
                    }}>
                      <div className="ava" style={{ width: 38, height: 38, fontSize: '.8rem', background: 'var(--pri)', flexShrink: 0 }}>
                        {m.photoURL ? <img src={m.photoURL} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} /> : (m.displayName || '?')[0]}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '.85rem', fontWeight: 600 }}>{m.displayName || 'Nimetön'}</div>
                        <div style={{ fontSize: '.72rem', color: 'var(--t3)' }}>{m.email}</div>
                      </div>
                      <select
                        value={m.role}
                        onChange={e => changeRole(selectedOrgData.id, m.uid, e.target.value as any)}
                        className="input"
                        style={{ width: 'auto', fontSize: '.78rem', padding: '.3rem .5rem' }}
                      >
                        <option value="owner">Omistaja</option>
                        <option value="admin">Admin</option>
                        <option value="member">Jäsen</option>
                      </select>
                      <button className="btn btn-ghost btn-sm" onClick={() => removeMember(selectedOrgData.id, m.uid)}
                        style={{ color: 'var(--red)', fontSize: '.75rem' }}>
                        Poista
                      </button>
                    </div>
                  ))}

                  {/* Invite */}
                  <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border)', display: 'flex', gap: '.5rem', alignItems: 'center' }}>
                    <input className="input" placeholder="Sähköposti" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} style={{ flex: 1, fontSize: '.82rem' }} />
                    <select className="input" value={inviteRole} onChange={e => setInviteRole(e.target.value as any)} style={{ width: 'auto', fontSize: '.78rem' }}>
                      <option value="member">Jäsen</option>
                      <option value="admin">Admin</option>
                    </select>
                    <button className="btn btn-primary btn-sm" onClick={() => { setInviteOrgId(selectedOrgData.id); inviteMember(); }} disabled={!inviteEmail.trim()}>
                      Kutsu
                    </button>
                  </div>
                </div>
              </div>

              {/* Vaarallinen alue — organisaation poisto useamman varmennuksen takana */}
              {/* orgTeamMembers diagnostiikka */}
              <div style={{
                marginTop: '2rem', padding: '1rem 1.25rem',
                background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)',
              }}>
                <div style={{ fontSize: '.85rem', fontWeight: 600, marginBottom: '.4rem' }}>
                  Tiimijäsenten diagnostiikka
                </div>
                <div style={{ fontSize: '.72rem', color: 'var(--t3)', marginBottom: '.75rem' }}>
                  Tarkistaa onko orgTeamMembersissä duplikaatti-id:itä — jos on, useampi henkilö näkyy esim. tiimin Lead-merkinnällä. &quot;Korjaa&quot; antaa duplikaateille uniikit id:t nimen perusteella.
                </div>
                <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => checkAndFixOrgTeamMembers(selectedOrgData.id, false)}
                    disabled={diagBusy}
                  >
                    {diagBusy ? 'Tarkistetaan…' : 'Tarkista'}
                  </button>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => checkAndFixOrgTeamMembers(selectedOrgData.id, true)}
                    disabled={diagBusy}
                  >
                    {diagBusy ? 'Korjataan…' : 'Korjaa duplikaatit'}
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      if (confirm(`Poistetaanko Lead-merkinnät kaikilta tiimeiltä organisaatiossa "${selectedOrgData.name}"?`)) {
                        clearOrgTeamLeads(selectedOrgData.id);
                      }
                    }}
                    disabled={diagBusy}
                    style={{ marginLeft: 'auto' }}
                  >
                    {diagBusy ? 'Poistetaan…' : 'Poista Lead-merkinnät'}
                  </button>
                </div>
                {diagResult && diagResult.orgId === selectedOrgData.id && (
                  <div style={{
                    marginTop: '.75rem', padding: '.5rem .75rem', fontSize: '.72rem',
                    background: diagResult.error ? 'rgba(228,92,129,.08)'
                      : (diagResult.fixed && diagResult.fixed.length > 0) ? 'rgba(42,138,134,.08)'
                      : (diagResult.duplicates && diagResult.duplicates.length > 0) ? 'rgba(241,180,52,.08)'
                      : 'rgba(42,138,134,.08)',
                    border: `1px solid ${diagResult.error ? '#e45c81' : (diagResult.duplicates && diagResult.duplicates.length > 0 && (!diagResult.fixed || diagResult.fixed.length === 0)) ? '#f1b434' : '#2a8a86'}`,
                    borderRadius: 'var(--rs)',
                    fontFamily: 'var(--font-mono, monospace)',
                  }}>
                    {diagResult.error && <div><strong>Virhe:</strong> {diagResult.error}</div>}
                    {diagResult.duplicates && diagResult.duplicates.length === 0 && !diagResult.error && (
                      <div>Ei duplikaatti-id:itä — kaikki kunnossa</div>
                    )}
                    {diagResult.duplicates && diagResult.duplicates.length > 0 && (
                      <>
                        <div style={{ marginBottom: '.3rem' }}><strong>Duplikaatit:</strong></div>
                        {diagResult.duplicates.map((d, i) => (
                          <div key={i}>· id=&quot;{d.id}&quot; · {d.names.join(', ')}</div>
                        ))}
                      </>
                    )}
                    {diagResult.fixed && diagResult.fixed.length > 0 && (
                      <>
                        <div style={{ marginTop: '.4rem', marginBottom: '.3rem' }}><strong>Korjattu:</strong></div>
                        {diagResult.fixed.map((f, i) => (
                          <div key={i}>+ {f.name}: id &quot;{f.oldId}&quot; → &quot;{f.newId}&quot;</div>
                        ))}
                      </>
                    )}
                  </div>
                )}
              </div>

              <DangerZone org={selectedOrgData} onDelete={() => deleteOrg(selectedOrgData.id)} />
            </div>
          )}

          {/* ═══ USERS TAB ═══ */}
          {tab === 'users' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
              {/* Liitä käyttäjä organisaatioon -lomake */}
              <div style={{
                padding: '1rem 1.25rem', marginBottom: '.5rem',
                background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)',
              }}>
                <div style={{ fontSize: '.85rem', fontWeight: 600, marginBottom: '.5rem' }}>
                  Liitä käyttäjä organisaatioon
                </div>
                <div style={{ fontSize: '.72rem', color: 'var(--t3)', marginBottom: '.75rem' }}>
                  Käyttäjän pitää olla kirjautunut Momentumiin vähintään kerran (jotta UID syntyy users-collectioniin). Tämä lisää käyttäjän userOrgs-listaan, organisation members-subcollectioniin sekä linkittää orgTeamMembers-jäseneen jotta tehtävät tunnistuvat.
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1.8fr 1fr 1fr 1.5fr auto', gap: '.5rem', alignItems: 'center' }}>
                  <select
                    className="input"
                    value={linkEmail}
                    onChange={e => {
                      const val = e.target.value;
                      setLinkEmail(val);
                      // Esitäytä memberName valitun käyttäjän displayNamesta
                      const picked = allUsers.find(u => u.email === val);
                      if (picked && picked.displayName) {
                        setLinkMemberName(picked.displayName);
                      }
                    }}
                    style={{ fontSize: '.82rem' }}
                  >
                    <option value="">— valitse käyttäjä —</option>
                    {allUsers
                      .slice()
                      .sort((a, b) => (a.displayName || a.email || '').localeCompare(b.displayName || b.email || ''))
                      .map(u => {
                        const userOrgsCount = orgs.filter(o => o.members.some(m => m.uid === u.uid)).length;
                        const label = `${u.displayName || '(nimetön)'} · ${u.email || u.uid}${userOrgsCount === 0 ? ' · ei orgia' : ` · ${userOrgsCount} org`}`;
                        return (
                          <option key={u.uid} value={u.email || ''}>
                            {label}
                          </option>
                        );
                      })}
                  </select>
                  <select
                    className="input"
                    value={linkOrgId}
                    onChange={e => setLinkOrgId(e.target.value)}
                    style={{ fontSize: '.78rem' }}
                  >
                    <option value="">— org —</option>
                    {orgs.map(o => <option key={o.id} value={o.id}>{o.name} ({o.id})</option>)}
                  </select>
                  <select
                    className="input"
                    value={linkRole}
                    onChange={e => setLinkRole(e.target.value as 'owner' | 'admin' | 'member' | 'visitor')}
                    style={{ fontSize: '.78rem' }}
                  >
                    <option value="member">Jäsen</option>
                    <option value="admin">Admin</option>
                    <option value="owner">Owner</option>
                    <option value="visitor">Vierailija</option>
                  </select>
                  <input
                    className="input"
                    placeholder="orgTeamMembers-nimi"
                    value={linkMemberName}
                    onChange={e => setLinkMemberName(e.target.value)}
                    style={{ fontSize: '.82rem' }}
                    title="Esitäyttyy automaattisesti valitusta käyttäjästä. Voi muokata jos orgTeamMembersissä jäsenen nimi eroaa (esim. 'Hanna' vs 'Hanna Hovitie')."
                  />
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={submitLink}
                    disabled={!linkEmail.trim() || !linkOrgId || linkBusy}
                  >
                    {linkBusy ? 'Liitetään…' : 'Liitä'}
                  </button>
                </div>
                <div style={{ marginTop: '.5rem', fontSize: '.7rem', color: 'var(--t3)' }}>
                  {allUsers.length} rekisteröityä käyttäjää · käyttäjät joissa &quot;ei orgia&quot; ovat ensisijaisia liitettäviä
                </div>
                {linkResult && (
                  <div style={{
                    marginTop: '.75rem', padding: '.5rem .75rem', fontSize: '.72rem',
                    background: linkResult.ok ? 'rgba(42,138,134,.08)' : 'rgba(228,92,129,.08)',
                    border: `1px solid ${linkResult.ok ? '#2a8a86' : '#e45c81'}`,
                    borderRadius: 'var(--rs)',
                    fontFamily: 'var(--font-mono, monospace)',
                  }}>
                    {linkResult.error && <div><strong>Virhe:</strong> {linkResult.error}</div>}
                    {linkResult.hint && (
                      <div style={{ marginTop: '.4rem', fontFamily: 'inherit', fontStyle: 'italic' }}>
                        💡 {linkResult.hint}
                      </div>
                    )}
                    {linkResult.detail && (
                      <details style={{ marginTop: '.4rem' }}>
                        <summary style={{ cursor: 'pointer' }}>Tekninen virhe</summary>
                        <div style={{ marginTop: '.3rem', wordBreak: 'break-all' }}>{linkResult.detail}</div>
                      </details>
                    )}
                    {linkResult.steps?.map((s, i) => <div key={i}>· {s}</div>)}
                    {linkResult.warnings?.map((w, i) => <div key={i} style={{ color: '#e45c81' }}>! {w}</div>)}
                  </div>
                )}
              </div>

              {allUsers.map(u => {
                const userOrgs = orgs.filter(o => o.members.some(m => m.uid === u.uid));
                return (
                  <div key={u.uid} style={{
                    display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem 1.25rem',
                    background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)',
                  }}>
                    <div className="ava" style={{ width: 42, height: 42, fontSize: '.85rem', background: 'var(--pri)', flexShrink: 0 }}>
                      {u.photoURL ? <img src={u.photoURL} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} /> : (u.displayName || '?')[0]}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '.9rem', fontWeight: 600 }}>{u.displayName || 'Nimetön'}</div>
                      <div style={{ fontSize: '.72rem', color: 'var(--t3)' }}>{u.email}</div>
                      <div style={{ fontSize: '.65rem', color: 'var(--t3)', marginTop: '.15rem' }}>
                        Viimeksi: {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString('fi-FI') : '-'}
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '.2rem', alignItems: 'flex-end' }}>
                      {userOrgs.map(o => {
                        const membership = o.members.find(m => m.uid === u.uid);
                        return (
                          <span key={o.id} style={{
                            fontSize: '.68rem', padding: '.15rem .5rem', borderRadius: 9999, fontWeight: 600,
                            background: membership?.role === 'owner' ? 'rgba(5,107,159,.1)' : 'var(--elev)',
                            color: membership?.role === 'owner' ? 'var(--pri-l)' : 'var(--t2)',
                            border: '1px solid var(--border)',
                          }}>
                            {o.name} ({membership?.role})
                          </span>
                        );
                      })}
                      {userOrgs.length === 0 && (
                        <span style={{ fontSize: '.68rem', color: 'var(--t3)', fontStyle: 'italic' }}>Ei organisaatioita</span>
                      )}
                    </div>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        setLinkEmail(u.email || '');
                        setLinkMemberName(u.displayName || '');
                        setLinkResult(null);
                        // Vieritä lomakkeeseen
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      style={{ fontSize: '.72rem', flexShrink: 0 }}
                      title="Esitäytä yllä oleva lomake tämän käyttäjän tiedoilla"
                    >
                      Liitä orgiin
                    </button>
                    {u.email !== 'anton@hetkicompany.com' && (
                      <button className="btn btn-ghost btn-sm" onClick={() => deleteUser(u.uid, u.displayName, u.email)}
                        style={{ color: 'var(--red)', fontSize: '.72rem', flexShrink: 0 }}>
                        Poista
                      </button>
                    )}
                  </div>
                );
              })}
              {allUsers.length === 0 && (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--t3)' }}>
                  Ei käyttäjiä vielä.
                </div>
              )}
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}

// =============================================================================
// DANGER ZONE — organisaation poisto usean varmennuksen takana
// =============================================================================
function DangerZone({ org, onDelete }: { org: OrgData; onDelete: () => Promise<void> | void }) {
  const [expanded, setExpanded] = useState(false);
  const [armed, setArmed] = useState(false);
  const [typed, setTyped] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const nameMatches = typed.trim() === org.name;

  const doDelete = async () => {
    if (!nameMatches) return;
    setBusy(true);
    try { await onDelete(); } finally { setBusy(false); }
  };

  return (
    <div style={{
      marginTop: '3rem', padding: '1rem 1.25rem',
      background: 'rgba(239,68,68,.04)',
      border: '1px dashed rgba(239,68,68,.35)',
      borderRadius: 'var(--rl)',
    }}>
      <button
        onClick={() => { setExpanded(v => !v); if (expanded) { setArmed(false); setTyped(''); setConfirming(false); } }}
        style={{
          background: 'transparent', border: 'none', color: 'var(--t3)',
          cursor: 'pointer', fontSize: '.72rem', fontWeight: 700,
          textTransform: 'uppercase', letterSpacing: '.06em',
          display: 'inline-flex', alignItems: 'center', gap: '.4rem', padding: 0,
        }}
      >
        <span style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform .15s', display: 'inline-block' }}>▸</span>
        Vaarallinen alue
      </button>

      {expanded && (
        <div style={{ marginTop: '1rem', paddingTop: '.75rem', borderTop: '1px dashed rgba(239,68,68,.2)' }}>
          <div style={{ fontSize: '.82rem', color: 'var(--t2)', lineHeight: 1.5, marginBottom: '.75rem' }}>
            Organisaation <b>{org.name}</b> poisto tuhoaa <b>kaikki jäsenet, moduulit ja data-dokumentit</b>. Tätä toimintoa <b>ei voi perua</b>.
          </div>

          {!armed && (
            <button
              onClick={() => setArmed(true)}
              style={{
                fontSize: '.72rem', padding: '.35rem .7rem', borderRadius: 'var(--r)',
                background: 'transparent', color: 'var(--red)',
                border: '1px solid rgba(239,68,68,.35)', cursor: 'pointer', fontWeight: 600,
              }}
            >
              Aloita poistoprosessi
            </button>
          )}

          {armed && !confirming && (
            <div>
              <label style={{ display: 'block', fontSize: '.72rem', color: 'var(--t2)', marginBottom: '.35rem' }}>
                Kirjoita organisaation nimi vahvistaaksesi: <b style={{ color: 'var(--t1)' }}>{org.name}</b>
              </label>
              <input
                className="input"
                value={typed}
                onChange={e => setTyped(e.target.value)}
                placeholder={org.name}
                style={{ maxWidth: 360, marginBottom: '.5rem' }}
                autoFocus
              />
              <div style={{ display: 'flex', gap: '.4rem' }}>
                <button
                  onClick={() => { setArmed(false); setTyped(''); }}
                  className="btn btn-ghost btn-sm"
                  style={{ fontSize: '.72rem' }}
                >
                  Peruuta
                </button>
                <button
                  onClick={() => setConfirming(true)}
                  disabled={!nameMatches}
                  style={{
                    fontSize: '.72rem', padding: '.35rem .7rem', borderRadius: 'var(--r)',
                    background: nameMatches ? 'var(--red)' : 'var(--elev)',
                    color: nameMatches ? '#fff' : 'var(--t3)',
                    border: `1px solid ${nameMatches ? 'var(--red)' : 'var(--border)'}`,
                    cursor: nameMatches ? 'pointer' : 'not-allowed', fontWeight: 700,
                  }}
                >
                  Jatka
                </button>
              </div>
            </div>
          )}

          {armed && confirming && (
            <div style={{
              padding: '.85rem 1rem', background: 'rgba(239,68,68,.1)',
              border: '1px solid rgba(239,68,68,.4)', borderRadius: 'var(--r)',
            }}>
              <div style={{ fontSize: '.85rem', fontWeight: 700, color: 'var(--red)', marginBottom: '.35rem' }}>
                Oletko aivan varma?
              </div>
              <div style={{ fontSize: '.74rem', color: 'var(--t2)', marginBottom: '.6rem', lineHeight: 1.5 }}>
                Tämä poistaa <b>{org.name}</b>-organisaation pysyvästi. Kaikki moduulit, tehtävät, projektit, apurahat ja muut tiedot katoavat. <b>Tätä ei voi perua.</b>
              </div>
              <div style={{ display: 'flex', gap: '.4rem' }}>
                <button
                  onClick={() => setConfirming(false)}
                  className="btn btn-ghost btn-sm"
                  style={{ fontSize: '.72rem' }}
                  disabled={busy}
                >
                  Takaisin
                </button>
                <button
                  onClick={doDelete}
                  disabled={busy}
                  style={{
                    fontSize: '.72rem', padding: '.35rem .7rem', borderRadius: 'var(--r)',
                    background: 'var(--red)', color: '#fff',
                    border: '1px solid var(--red)', cursor: busy ? 'wait' : 'pointer', fontWeight: 700,
                  }}
                >
                  {busy ? 'Poistetaan...' : `Poista ${org.name} pysyvästi`}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
