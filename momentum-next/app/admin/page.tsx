'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import { collection, getDocs, doc, deleteDoc, updateDoc, query, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import AppShell from '@/components/AppShell';
import { useToast } from '@/lib/toast';
import { AVL_ORG, AVL_EVENTS, AVL_CHANNEL_STATS, LLFF_ORG, LLFF_EVENTS, LLFF_CHANNEL_STATS, JUHLATOIMIKUNTA_ORG, JUHLATOIMIKUNTA_EVENTS, JUHLATOIMIKUNTA_CHANNEL_STATS } from '@/lib/seed-data';
import { MODULE_REGISTRY, MODULE_ORDER, DEFAULT_MODULES, JUHLATOIMIKUNTA_MODULES } from '@/lib/modules';

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

// Super admin emails — only these can access /admin
const SUPER_ADMINS = ['anton@hetkicompany.com', 'anton.baer@gmail.com'];

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

  const { toast } = useToast();
  const [seeding, setSeeding] = useState(false);
  const isSuperAdmin = user?.email && SUPER_ADMINS.includes(user.email);

  // Seed AVL + LLFF demo communities
  const seedCommunities = async () => {
    if (!user) return;
    setSeeding(true);
    try {
      for (const { orgData, events, channelStats, orgId, orgName, joinCode } of [
        { orgData: AVL_ORG, events: AVL_EVENTS, channelStats: AVL_CHANNEL_STATS, orgId: 'avl', orgName: 'Aivovammaliitto', joinCode: 'aivovammaliitto-hetki-2026' },
        { orgData: LLFF_ORG, events: LLFF_EVENTS, channelStats: LLFF_CHANNEL_STATS, orgId: 'llff', orgName: 'Lapinlahden Elokuvajuhlat', joinCode: 'llff-elokuva-2026' },
        { orgData: JUHLATOIMIKUNTA_ORG, events: JUHLATOIMIKUNTA_EVENTS, channelStats: JUHLATOIMIKUNTA_CHANNEL_STATS, orgId: 'juhlatoimikunta', orgName: 'Juhlatoimikunta', joinCode: 'juhlatoimikunta-sirpa-70v' },
      ]) {
        // Create org document
        await setDoc(doc(db, 'organizations', orgId), {
          name: orgName, shortName: orgData.s, slogan: orgData.slogan,
          joinCode, createdAt: new Date().toISOString(), createdBy: user.uid, plan: 'free',
        }, { merge: true });

        // Add current user as owner
        await setDoc(doc(db, 'organizations', orgId, 'members', user.uid), {
          role: 'owner', joinedAt: new Date().toISOString(),
          displayName: user.displayName || '', email: user.email || '', photoURL: user.photoURL || '',
        }, { merge: true });

        // Write org data
        await setDoc(doc(db, 'organizations', orgId, 'data', 'org'), { v: JSON.stringify(orgData), ts: Date.now(), updatedBy: user.uid });
        await setDoc(doc(db, 'organizations', orgId, 'data', 'events'), { v: JSON.stringify(events), ts: Date.now(), updatedBy: user.uid });
        await setDoc(doc(db, 'organizations', orgId, 'data', 'channelStats'), { v: JSON.stringify(channelStats), ts: Date.now(), updatedBy: user.uid });

        // Initialize empty collections
        for (const key of ['projects', 'publications', 'media_meta', 'media_uploaded', 'media_collections']) {
          await setDoc(doc(db, 'organizations', orgId, 'data', key), { v: JSON.stringify([]), ts: Date.now(), updatedBy: user.uid }, { merge: true });
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
              modulesMap[orgDoc.id] = { ...DEFAULT_MODULES };
            }
          } catch { modulesMap[orgDoc.id] = { ...DEFAULT_MODULES }; }
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
      await updateDoc(doc(db, 'organizations', orgId, 'members', uid), { role: newRole });
      setOrgs(prev => prev.map(o => o.id === orgId ? {
        ...o, members: o.members.map(m => m.uid === uid ? { ...m, role: newRole } : m)
      } : o));
    } catch (e) {
      console.error('Change role error:', e);
    }
  };

  const deleteOrg = async (orgId: string) => {
    if (!confirm('Haluatko varmasti poistaa tämän organisaation ja kaikki sen tiedot? Tätä ei voi perua.')) return;
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
    } catch (e) {
      console.error('Delete org error:', e);
      alert('Virhe organisaation poistamisessa');
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

  const deleteUser = async (uid: string) => {
    if (!confirm('Haluatko poistaa tämän käyttäjän kaikista organisaatioista?')) return;
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

  // Create juhlatoimikunta only
  const createJuhlatoimikunta = async () => {
    if (!user) return;
    setSeeding(true);
    try {
      const orgId = 'juhlatoimikunta';
      // Create org document
      await setDoc(doc(db, 'organizations', orgId), {
        name: 'Juhlatoimikunta', shortName: 'JTK', slogan: JUHLATOIMIKUNTA_ORG.slogan,
        joinCode: 'juhlatoimikunta-sirpa-70v', createdAt: new Date().toISOString(), createdBy: user.uid, plan: 'free',
      }, { merge: true });
      // Add current user as owner
      await setDoc(doc(db, 'organizations', orgId, 'members', user.uid), {
        role: 'owner', joinedAt: new Date().toISOString(),
        displayName: user.displayName || '', email: user.email || '', photoURL: user.photoURL || '',
      }, { merge: true });
      // Write org data
      await setDoc(doc(db, 'organizations', orgId, 'data', 'org'), { v: JSON.stringify(JUHLATOIMIKUNTA_ORG), ts: Date.now(), updatedBy: user.uid });
      await setDoc(doc(db, 'organizations', orgId, 'data', 'events'), { v: JSON.stringify([]), ts: Date.now(), updatedBy: user.uid });
      await setDoc(doc(db, 'organizations', orgId, 'data', 'channelStats'), { v: JSON.stringify([]), ts: Date.now(), updatedBy: user.uid });
      // Seed modules
      await setDoc(doc(db, 'organizations', orgId, 'data', 'modules'), { v: JSON.stringify(JUHLATOIMIKUNTA_MODULES), ts: Date.now(), updatedBy: user.uid });
      // Initialize empty collections
      for (const key of ['projects', 'publications', 'media_meta', 'media_uploaded', 'media_collections']) {
        await setDoc(doc(db, 'organizations', orgId, 'data', key), { v: JSON.stringify([]), ts: Date.now(), updatedBy: user.uid }, { merge: true });
      }
      // Add to user's org list
      const userOrgsSnap = await getDocs(query(collection(db, 'userOrgs')));
      let existingOrgs: any[] = [];
      for (const d of userOrgsSnap.docs) {
        if (d.id === user.uid) existingOrgs = d.data().orgs || [];
      }
      if (!existingOrgs.some((o: any) => o.orgId === orgId)) {
        const newOrgs = [...existingOrgs, { orgId, role: 'owner', name: 'Juhlatoimikunta' }];
        await setDoc(doc(db, 'userOrgs', user.uid), { orgs: newOrgs, orgIds: newOrgs.map((o: any) => o.orgId) });
      }
      toast('Juhlatoimikunta luotu!', 'success');
      window.location.reload();
    } catch (e) {
      console.error('Create juhlatoimikunta error:', e);
      toast('Virhe luonnissa', 'error');
    } finally {
      setSeeding(false);
    }
  };

  const selectedOrgData = selectedOrg ? orgs.find(o => o.id === selectedOrg) : null;
  const hasJuhlatoimikunta = orgs.some(o => o.id === 'juhlatoimikunta');

  return (
    <AppShell title="Hallintapaneeli" subtitle="Käyttäjien ja organisaatioiden hallinta">
      {/* Create Juhlatoimikunta if missing */}
      {!hasJuhlatoimikunta && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(155,124,246,.08), rgba(228,92,129,.06))',
          border: '1px solid rgba(155,124,246,.25)', borderRadius: 'var(--rl)',
          padding: '1.25rem 1.5rem', marginBottom: '1.5rem',
          display: 'flex', alignItems: 'center', gap: '1rem',
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '.92rem', fontWeight: 700 }}>Juhlatoimikunta puuttuu</div>
            <div style={{ fontSize: '.75rem', color: 'var(--t2)', marginTop: '.2rem' }}>Sirpan 70v juhlat 25.4.2026, Tyttojen talo. Luo tyotila Firestoreen.</div>
          </div>
          <button className="btn btn-primary" onClick={createJuhlatoimikunta} disabled={seeding}>
            {seeding ? 'Luodaan...' : 'Luo Juhlatoimikunta'}
          </button>
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
                <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 500 }}>{selectedOrgData.name}</h3>
                    <p style={{ fontSize: '.78rem', color: 'var(--t3)', marginTop: '.15rem' }}>
                      {selectedOrgData.shortName} {'·'} {selectedOrgData.plan} {'·'} ID: {selectedOrgData.id.slice(0, 8)}...
                    </p>
                  </div>
                  <button className="btn btn-sm" onClick={() => deleteOrg(selectedOrgData.id)}
                    style={{ color: 'var(--red)', border: '1px solid rgba(239,68,68,.3)', background: 'rgba(239,68,68,.05)' }}>
                    Poista organisaatio
                  </button>
                </div>

                {/* Modules */}
                <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)' }}>
                  <h4 style={{ fontSize: '.82rem', fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: '1rem' }}>
                    Moduulit
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '.5rem' }}>
                    {MODULE_ORDER.map(modId => {
                      const mod = MODULE_REGISTRY[modId];
                      const enabled = orgModules[selectedOrgData.id]?.[modId] ?? DEFAULT_MODULES[modId] ?? false;
                      const isAlwaysOn = mod.alwaysOn;
                      return (
                        <div key={modId} onClick={async () => {
                          if (isAlwaysOn) return;
                          const updated = { ...(orgModules[selectedOrgData.id] || DEFAULT_MODULES), [modId]: !enabled };
                          setOrgModules(prev => ({ ...prev, [selectedOrgData.id]: updated }));
                          await setDoc(doc(db, 'organizations', selectedOrgData.id, 'data', 'modules'), { v: JSON.stringify(updated), ts: Date.now(), updatedBy: user!.uid });
                          toast(`${mod.label} ${!enabled ? 'aktivoitu' : 'deaktivoitu'}`, 'success');
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
            </div>
          )}

          {/* ═══ USERS TAB ═══ */}
          {tab === 'users' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
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
                    {u.email && !SUPER_ADMINS.includes(u.email) && (
                      <button className="btn btn-ghost btn-sm" onClick={() => deleteUser(u.uid)}
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
