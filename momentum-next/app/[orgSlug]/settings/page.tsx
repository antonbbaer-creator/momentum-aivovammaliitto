'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { useAuth } from '@/lib/auth';
import { useOrgData } from '@/lib/firestore';
import { collection, getDocs, doc, setDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { MODULE_REGISTRY, MODULE_ORDER, DEFAULT_MODULES, getDefaultModules } from '@/lib/modules';

interface Member { uid: string; displayName: string; email: string; photoURL: string; role: string; joinedAt: string; }

export default function SettingsPage() {
  const { user, orgs, activeOrg, activeOrgRole, setActiveOrg, logout, refreshOrgs } = useAuth();
  const router = useRouter();
  const [org, setOrg] = useOrgData<any>('org', { name: '', s: '', slogan: '', channels: [], team: [], goals: [], auds: [], vals: [], tone: [] });
  const orgSlug = activeOrg || '';
  const orgDefaults = getDefaultModules(orgSlug);
  const [modules, setModules] = useOrgData<Record<string, boolean>>('modules', orgDefaults);
  const [members, setMembers] = useState<Member[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'member'>('member');
  const [editingOrg, setEditingOrg] = useState(false);
  const [orgName, setOrgName] = useState('');
  const [orgSlogan, setOrgSlogan] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [orgJoinCode, setOrgJoinCode] = useState('');
  const [codeCopied, setCodeCopied] = useState(false);

  const isAdmin = activeOrgRole === 'owner' || activeOrgRole === 'admin';

  // Fetch join code from org doc
  useEffect(() => {
    if (!activeOrg) return;
    import('firebase/firestore').then(({ getDoc }) => {
      getDoc(doc(db, 'organizations', activeOrg)).then(snap => {
        if (snap.exists()) setOrgJoinCode(snap.data().joinCode || '');
      });
    });
  }, [activeOrg]);

  useEffect(() => { setOrgName(org.name || ''); setOrgSlogan(org.slogan || ''); }, [org.name, org.slogan]);

  useEffect(() => {
    if (!activeOrg) return;
    getDocs(collection(db, 'organizations', activeOrg, 'members')).then(snap => {
      setMembers(snap.docs.map(d => ({ uid: d.id, ...d.data() })) as Member[]);
    });
  }, [activeOrg]);

  const saveOrgInfo = () => {
    setOrg((prev: any) => ({ ...prev, name: orgName.trim(), slogan: orgSlogan.trim() }));
    setEditingOrg(false);
  };

  const removeMember = async (uid: string) => {
    if (!activeOrg || !confirm) return;
    await deleteDoc(doc(db, 'organizations', activeOrg, 'members', uid));
    setMembers(prev => prev.filter(m => m.uid !== uid));
  };

  const changeRole = async (uid: string, newRole: string) => {
    if (!activeOrg) return;
    await updateDoc(doc(db, 'organizations', activeOrg, 'members', uid), { role: newRole });
    setMembers(prev => prev.map(m => m.uid === uid ? { ...m, role: newRole } : m));
  };

  const sendInvite = async () => {
    if (!activeOrg || !inviteEmail.trim()) return;
    await setDoc(doc(collection(db, 'organizations', activeOrg, 'invitations')), {
      email: inviteEmail.trim().toLowerCase(), role: inviteRole,
      invitedBy: user!.uid, invitedByName: user!.displayName || '',
      createdAt: new Date().toISOString(), status: 'pending',
    });
    setInviteEmail('');
    alert(`Kutsu lähetetty: ${inviteEmail}`);
  };

  return (
    <AppShell title="Asetukset" subtitle="Organisaation hallinta">
      {/* Org switcher */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', marginBottom: '1.5rem' }}>
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '.88rem', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.02em' }}>Yhteisöt</h3>
        </div>
        <div style={{ padding: '1.25rem 1.5rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
            {orgs.map(o => (
              <div key={o.orgId} onClick={() => router.push(`/${o.orgId}/settings`)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '.75rem', padding: '.85rem 1rem',
                  background: o.orgId === activeOrg ? 'rgba(5,107,159,.08)' : 'var(--elev)',
                  border: `1px solid ${o.orgId === activeOrg ? 'var(--pri)' : 'var(--border)'}`,
                  borderRadius: 'var(--r)', cursor: 'pointer', transition: 'all .15s',
                }}
                onMouseEnter={e => { if (o.orgId !== activeOrg) (e.currentTarget as any).style.borderColor = 'var(--border-l)'; }}
                onMouseLeave={e => { if (o.orgId !== activeOrg) (e.currentTarget as any).style.borderColor = 'var(--border)'; }}>
                <div style={{
                  width: 38, height: 38, borderRadius: 'var(--r)', flexShrink: 0,
                  background: o.orgId === activeOrg ? 'var(--pri)' : 'var(--elev)',
                  border: `1px solid ${o.orgId === activeOrg ? 'var(--pri)' : 'var(--border)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: o.orgId === activeOrg ? '#fff' : 'var(--t2)',
                  fontSize: '.85rem', fontWeight: 700, fontFamily: 'var(--font-display)',
                }}>{o.name[0]}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '.88rem', fontWeight: 600 }}>{o.name}</div>
                  <div style={{ fontSize: '.68rem', color: 'var(--t3)' }}>{o.role === 'owner' ? 'Omistaja' : o.role === 'admin' ? 'Admin' : o.role === 'visitor' ? 'Vierailija' : 'Jäsen'}</div>
                </div>
                {o.orgId === activeOrg && (
                  <span style={{ fontSize: '.68rem', padding: '.2rem .55rem', borderRadius: 9999, background: 'rgba(5,107,159,.15)', color: 'var(--pri-l)', fontWeight: 700 }}>Aktiivinen</span>
                )}
              </div>
            ))}
          </div>
          {orgs.length === 0 && (
            <p style={{ color: 'var(--t3)', fontSize: '.85rem', textAlign: 'center', padding: '1rem' }}>Ei yhteisöjä. Luo uusi tai liity salasanalla.</p>
          )}
        </div>
      </div>

      {/* Org info */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', marginBottom: '1.5rem' }}>
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '.88rem', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.02em' }}>Organisaation tiedot</h3>
          {!editingOrg && isAdmin && <button className="btn btn-ghost btn-sm" onClick={() => setEditingOrg(true)}>Muokkaa</button>}
        </div>
        <div style={{ padding: '1.5rem' }}>
          {editingOrg ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="field"><label>Nimi</label><input className="input" value={orgName} onChange={e => setOrgName(e.target.value)} /></div>
              <div className="field"><label>Slogan</label><input className="input" value={orgSlogan} onChange={e => setOrgSlogan(e.target.value)} /></div>
              <div style={{ display: 'flex', gap: '.5rem' }}>
                <button className="btn btn-primary btn-sm" onClick={saveOrgInfo}>Tallenna</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setEditingOrg(false)}>Peruuta</button>
              </div>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{org.name || 'Ei nimeä'}</div>
              {org.slogan && <div style={{ fontSize: '.85rem', color: 'var(--t2)', marginTop: '.25rem' }}>{org.slogan}</div>}
              <div style={{ marginTop: '.75rem', display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
                {(org.channels || []).map((ch: any) => (
                  <span key={ch.name} style={{ padding: '.2rem .55rem', borderRadius: 9999, fontSize: '.72rem', fontWeight: 600, background: `${ch.color}18`, color: ch.color }}>{ch.name}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Join Code */}
      {orgJoinCode && (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', marginBottom: '1.5rem' }}>
          <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)' }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '.88rem', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.02em' }}>Yhteisön salasana</h3>
          </div>
          <div style={{ padding: '1.5rem' }}>
            <p style={{ fontSize: '.85rem', color: 'var(--t2)', marginBottom: '1rem', lineHeight: 1.6 }}>
              Jaa tämä salasana ihmisille jotka haluat kutsua yhteisöösi. He voivat liittyä tiimijäsenenä tai vierailijana.
            </p>
            <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
              <code style={{ flex: 1, padding: '.75rem 1rem', background: 'var(--elev)', border: '1px solid var(--border)', borderRadius: 'var(--r)', fontSize: '1rem', fontWeight: 700, fontFamily: 'var(--font-display)', letterSpacing: '.02em', color: 'var(--pri-l)' }}>
                {orgJoinCode}
              </code>
              <button className="btn btn-primary btn-sm" onClick={() => { navigator.clipboard.writeText(orgJoinCode); setCodeCopied(true); setTimeout(() => setCodeCopied(false), 2000); }}>
                {codeCopied ? 'Kopioitu!' : 'Kopioi'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Team */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', marginBottom: '1.5rem' }}>
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '.88rem', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.02em' }}>Tiimi ({members.length})</h3>
        </div>
        <div style={{ padding: '1.5rem' }}>
          {members.map(m => (
            <div key={m.uid} style={{ display: 'flex', alignItems: 'center', gap: '.75rem', padding: '.75rem', background: 'var(--elev)', border: '1px solid var(--border)', borderRadius: 'var(--r)', marginBottom: '.5rem' }}>
              <div className="ava" style={{ width: 38, height: 38, fontSize: '.8rem', background: 'var(--pri)', flexShrink: 0 }}>
                {m.photoURL ? <img src={m.photoURL} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} /> : (m.displayName || '?')[0]}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '.85rem', fontWeight: 600 }}>{m.displayName}</div>
                <div style={{ fontSize: '.72rem', color: 'var(--t3)' }}>{m.email}</div>
              </div>
              {isAdmin && m.uid !== user?.uid ? (
                <>
                  <select className="input" value={m.role} onChange={e => changeRole(m.uid, e.target.value)} style={{ width: 'auto', fontSize: '.78rem', padding: '.3rem .5rem' }}>
                    <option value="owner">Omistaja</option><option value="admin">Admin</option><option value="member">Jäsen</option>
                  </select>
                  <button className="btn btn-ghost btn-sm" onClick={() => { if (window.confirm('Poistetaanko?')) removeMember(m.uid); }} style={{ color: 'var(--red)' }}>Poista</button>
                </>
              ) : (
                <span style={{ fontSize: '.72rem', padding: '.2rem .6rem', borderRadius: 9999, background: 'rgba(5,107,159,.1)', color: 'var(--pri-l)', fontWeight: 600 }}>{m.role}</span>
              )}
            </div>
          ))}
          {isAdmin && (
            <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border)', display: 'flex', gap: '.5rem' }}>
              <input className="input" placeholder="Sähköposti" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} style={{ flex: 1 }} />
              <select className="input" value={inviteRole} onChange={e => setInviteRole(e.target.value as any)} style={{ width: 'auto' }}>
                <option value="member">Jäsen</option><option value="admin">Admin</option>
              </select>
              <button className="btn btn-primary btn-sm" onClick={sendInvite} disabled={!inviteEmail.trim()}>Kutsu</button>
            </div>
          )}
        </div>
      </div>

      {/* Modules toggle — admin only */}
      {isAdmin && (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', marginBottom: '1.5rem' }}>
          <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)' }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '.88rem', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.02em' }}>Moduulit</h3>
            <p style={{ fontSize: '.72rem', color: 'var(--t3)', marginTop: '.25rem' }}>Valitse mitkä tyokalut ovat kaytossa tassa tyotilassa.</p>
          </div>
          <div style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
            {MODULE_ORDER.map(id => {
              const mod = MODULE_REGISTRY[id];
              if (!mod) return null;
              const enabled = modules[id] ?? orgDefaults[id] ?? false;
              return (
                <label key={id} style={{
                  display: 'flex', alignItems: 'center', gap: '.75rem',
                  padding: '.65rem .85rem', background: 'var(--elev)',
                  border: '1px solid var(--border)', borderRadius: 'var(--r)',
                  cursor: mod.alwaysOn ? 'default' : 'pointer',
                  opacity: mod.alwaysOn ? 0.6 : 1,
                }}>
                  <input
                    type="checkbox"
                    checked={enabled || mod.alwaysOn}
                    disabled={mod.alwaysOn}
                    onChange={() => {
                      if (mod.alwaysOn) return;
                      setModules(prev => ({ ...prev, [id]: !enabled }));
                    }}
                    style={{ width: 18, height: 18, accentColor: 'var(--pri)' }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '.85rem', fontWeight: 600 }}>{mod.label}</div>
                    {mod.alwaysOn && <div style={{ fontSize: '.65rem', color: 'var(--t3)' }}>Aina paalla</div>}
                  </div>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* Account */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)' }}>
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '.88rem', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.02em' }}>Tili</h3>
        </div>
        <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
          <div style={{ fontSize: '.85rem', color: 'var(--t2)' }}>Kirjautuneena: {user?.email}</div>
          <button className="btn btn-secondary" onClick={logout}>Kirjaudu ulos</button>
        </div>
      </div>
    </AppShell>
  );
}
