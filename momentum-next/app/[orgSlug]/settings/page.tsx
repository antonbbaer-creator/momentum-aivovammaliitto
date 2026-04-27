'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { useAuth } from '@/lib/auth';
import { useOrgData } from '@/lib/firestore';
import { collection, getDocs, doc, setDoc, deleteDoc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { MODULE_REGISTRY, MODULE_ORDER, DEFAULT_MODULES, getDefaultModules } from '@/lib/modules';
import { useToast } from '@/lib/toast';
import { connectDrive, disconnectDrive, useDriveStatus } from '@/lib/drive';
import NotificationsSettings from '@/components/NotificationsSettings';

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
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteText, setInviteText] = useState('');
  const [inviteSubject, setInviteSubject] = useState('');
  const [inviteCopied, setInviteCopied] = useState(false);
  const [editingOrg, setEditingOrg] = useState(false);
  const [orgName, setOrgName] = useState('');
  const [orgSlogan, setOrgSlogan] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [orgJoinCode, setOrgJoinCode] = useState('');
  const [codeCopied, setCodeCopied] = useState(false);
  const [textSize, setTextSizeState] = useState('sm');
  const [compactMode, setCompactModeState] = useState(false);
  const [theme, setThemeState] = useState<'light' | 'dark'>('light');
  const driveStatus = useDriveStatus();
  const [driveBusy, setDriveBusy] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joinError, setJoinError] = useState('');
  const [joining, setJoining] = useState(false);
  const { toast } = useToast();

  const isAdmin = activeOrgRole === 'owner' || activeOrgRole === 'admin';
  const SUPER_ADMINS = ['anton@hetkicompany.com', 'anton.baer@gmail.com', 'claude-test@hetkicompany.com'];
  const isSuperAdmin = !!user?.email && SUPER_ADMINS.includes(user.email);

  // Load personal preferences
  useEffect(() => {
    const savedSize = localStorage.getItem('momentum_textSize');
    if (savedSize && ['sm', 'md', 'lg'].includes(savedSize)) setTextSizeState(savedSize);
    const savedCompact = localStorage.getItem('momentum_compactMode');
    if (savedCompact === 'true') setCompactModeState(true);
    const savedTheme = localStorage.getItem('momentum_theme');
    const initial: 'light' | 'dark' = savedTheme === 'dark' ? 'dark' : 'light';
    setThemeState(initial);
    document.documentElement.dataset.theme = initial;
  }, []);

  const setTheme = (t: 'light' | 'dark') => {
    setThemeState(t);
    localStorage.setItem('momentum_theme', t);
    document.documentElement.dataset.theme = t;
  };

  const setTextSize = (key: string) => {
    setTextSizeState(key);
    localStorage.setItem('momentum_textSize', key);
    const scales: Record<string, number> = { sm: 1, md: 1.15, lg: 1.35 };
    document.documentElement.style.fontSize = `${(scales[key] || 1) * 16}px`;
  };

  const setCompactMode = (on: boolean) => {
    setCompactModeState(on);
    localStorage.setItem('momentum_compactMode', String(on));
    if (on) document.documentElement.classList.add('compact');
    else document.documentElement.classList.remove('compact');
  };

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

  // Liity toiseen yhteisoon salasanalla
  const joinAnotherOrg = async () => {
    if (!user || !joinCode.trim()) return;
    setJoining(true); setJoinError('');
    try {
      const code = joinCode.trim();
      const orgsSnap = await getDocs(collection(db, 'organizations'));
      let foundId = '', foundName = '';
      for (const d of orgsSnap.docs) {
        if (d.data().joinCode === code) { foundId = d.id; foundName = d.data().name || d.id; break; }
      }
      if (!foundId) { setJoinError('Salasanaa ei loytynyt.'); setJoining(false); return; }
      if (orgs.some(o => o.orgId === foundId)) {
        setJoinError('Olet jo taman yhteison jasen.'); setJoining(false); return;
      }

      // Lisaa member
      await setDoc(doc(db, 'organizations', foundId, 'members', user.uid), {
        role: 'member', joinedAt: new Date().toISOString(),
        displayName: user.displayName || '', email: user.email || '', photoURL: user.photoURL || '',
      }, { merge: true });

      // Paivita userOrgs
      const existingDoc = await getDoc(doc(db, 'userOrgs', user.uid));
      const existingOrgs = existingDoc.exists() ? (existingDoc.data().orgs || []) : [];
      const newOrgs = [...existingOrgs.filter((o: any) => o.orgId !== foundId), { orgId: foundId, role: 'member', name: foundName }];
      await setDoc(doc(db, 'userOrgs', user.uid), {
        orgs: newOrgs,
        orgIds: newOrgs.map((o: any) => o.orgId),
      });

      await refreshOrgs();
      setActiveOrg(foundId);
      toast('Liityit yhteisoon ' + foundName, 'success');
      setJoinCode('');
      router.push(`/${foundId}/dashboard`);
    } catch (e) {
      console.error('Join another error:', e);
      setJoinError('Virhe liittymisessa.');
    } finally {
      setJoining(false);
    }
  };

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

  const buildInviteText = () => {
    const orgName = org.name || activeOrg || 'Hetki-yhteisö';
    const inviter = user?.displayName || user?.email || '';
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://momentum.hetkicompany.com';
    const code = orgJoinCode || '(pyydä salasana ylläpitäjältä)';
    const roleLabel = inviteRole === 'admin' ? 'pääkäyttäjänä (admin)' : 'jäsenenä';
    const subject = `Kutsu yhteisöön ${orgName} — Hetki Momentum`;
    const body = `Hei!

${inviter ? inviter + ' on kutsunut' : 'Sinut on kutsuttu'} sinut liittymään yhteisöön "${orgName}" ${roleLabel} Hetki Momentum -työtilassa.

Momentum on tiimitila, jossa hoidetaan yhteistä toimintaa: tehtävät, aikataulut, kalenterit, viestintä ja muistiinpanot samassa paikassa.

Näin liityt:
1. Mene osoitteeseen ${baseUrl}
2. Kirjaudu sisään Googlella tai luo uusi tili sähköpostillasi
3. Syötä yhteisön salasana: ${code}

Tämä salasana on tarkoitettu vain sinulle ja luotetuille tiimiläisille — älä jaa sitä julkisesti.

Tervetuloa mukaan!${inviter ? '\n\n— ' + inviter : ''}`;
    return { subject, body };
  };

  const openInviteModal = () => {
    if (!inviteEmail.trim()) return;
    const { subject, body } = buildInviteText();
    setInviteSubject(subject);
    setInviteText(body);
    setInviteCopied(false);
    setInviteModalOpen(true);
  };

  const recordInvite = async () => {
    if (!activeOrg || !inviteEmail.trim() || !user) return;
    try {
      await setDoc(doc(collection(db, 'organizations', activeOrg, 'invitations')), {
        email: inviteEmail.trim().toLowerCase(), role: inviteRole,
        invitedBy: user.uid, invitedByName: user.displayName || '',
        createdAt: new Date().toISOString(), status: 'pending',
      });
    } catch (e) {
      console.error('Invite record error:', e);
    }
  };

  const sendInviteEmail = async () => {
    if (!inviteEmail.trim()) return;
    await recordInvite();
    const mailto = `mailto:${encodeURIComponent(inviteEmail.trim())}?subject=${encodeURIComponent(inviteSubject)}&body=${encodeURIComponent(inviteText)}`;
    window.location.href = mailto;
    toast(`Sähköpostiohjelma avattu: ${inviteEmail}`, 'success');
    setInviteModalOpen(false);
    setInviteEmail('');
  };

  const copyInviteText = async () => {
    try {
      await navigator.clipboard.writeText(inviteText);
      setInviteCopied(true);
      await recordInvite();
      setTimeout(() => setInviteCopied(false), 2000);
    } catch (e) {
      console.error('Copy error:', e);
      toast('Tekstin kopiointi epäonnistui', 'error');
    }
  };

  return (
    <AppShell title="Asetukset" subtitle={org.name || ''}>

      {/* ── Omat asetukset (kaikille) ── */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', marginBottom: '1.5rem' }}>
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '.88rem', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.02em' }}>Omat asetukset</h3>
          <p style={{ fontSize: '.72rem', color: 'var(--t3)', marginTop: '.15rem' }}>Nama asetukset tallentuvat selaimeesi ja koskevat vain sinua.</p>
        </div>
        <div style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

          {/* Tekstin koko */}
          <div>
            <div style={{ fontSize: '.82rem', fontWeight: 600, marginBottom: '.6rem' }}>Tekstin koko</div>
            <div style={{ display: 'flex', gap: '.5rem' }}>
              {[
                { key: 'sm', label: 'Pieni', desc: 'Oletus, mahtuu enemman' },
                { key: 'md', label: 'Keski', desc: 'Helpompi lukea' },
                { key: 'lg', label: 'Iso', desc: 'Saavutettava' },
              ].map(s => (
                <button key={s.key} onClick={() => setTextSize(s.key)} style={{
                  flex: 1, padding: '.85rem 1rem', borderRadius: 'var(--r)', cursor: 'pointer',
                  background: textSize === s.key ? 'rgba(5,107,159,.1)' : 'var(--elev)',
                  border: `1.5px solid ${textSize === s.key ? 'var(--pri)' : 'var(--border)'}`,
                  textAlign: 'center', transition: 'all .15s ease',
                }}>
                  <div style={{ fontSize: s.key === 'sm' ? '.78rem' : s.key === 'md' ? '.92rem' : '1.1rem', fontWeight: 700, color: textSize === s.key ? 'var(--pri-l)' : 'var(--t1)', marginBottom: '.2rem' }}>A</div>
                  <div style={{ fontSize: '.72rem', fontWeight: 600, color: textSize === s.key ? 'var(--pri-l)' : 'var(--t2)' }}>{s.label}</div>
                  <div style={{ fontSize: '.6rem', color: 'var(--t3)', marginTop: '.1rem' }}>{s.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Kompakti tila */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '.75rem 1rem', background: 'var(--elev)', border: '1px solid var(--border)', borderRadius: 'var(--r)' }}>
            <div>
              <div style={{ fontSize: '.82rem', fontWeight: 600 }}>Kompakti tila</div>
              <div style={{ fontSize: '.68rem', color: 'var(--t3)' }}>Pienentää välimatkat elementtien välillä</div>
            </div>
            <button onClick={() => setCompactMode(!compactMode)} style={{
              width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
              background: compactMode ? 'var(--pri)' : 'var(--border)',
              position: 'relative', transition: 'background .2s ease',
            }}>
              <div style={{
                width: 18, height: 18, borderRadius: '50%', background: '#fff',
                position: 'absolute', top: 3,
                left: compactMode ? 23 : 3,
                transition: 'left .2s ease',
              }} />
            </button>
          </div>

          {/* Google Drive -yhteys */}
          <div style={{ marginTop: '.85rem' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '.82rem', fontWeight: 600, marginBottom: '.2rem' }}>Google Drive</div>
                <div style={{ fontSize: '.7rem', color: 'var(--t3)', lineHeight: 1.5 }}>
                  {driveStatus.loading ? 'Tarkistetaan yhteyttä…' : driveStatus.connected
                    ? <>Yhdistetty {driveStatus.email ? <b style={{ color: 'var(--t2)' }}>{driveStatus.email}</b> : null}{driveStatus.expiresAt ? <> · token voimassa {new Date(driveStatus.expiresAt).toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' })} asti</> : null}</>
                    : 'Yhdistä Drive jotta voit tuoda ja viedä dokumentteja, kuvia ja kansioita Momentumiin.'}
                </div>
              </div>
              <button
                onClick={async () => {
                  setDriveBusy(true);
                  try {
                    if (driveStatus.connected) {
                      await disconnectDrive();
                      toast('Drive-yhteys katkaistu', 'info');
                    } else {
                      const tok = await connectDrive();
                      toast(`Drive yhdistetty${tok.email ? ` · ${tok.email}` : ''}`, 'success');
                    }
                  } catch (e: any) {
                    toast(e?.message || 'Drive-yhteys epäonnistui', 'error');
                  } finally {
                    setDriveBusy(false);
                  }
                }}
                disabled={driveBusy || driveStatus.loading}
                style={{
                  padding: '.55rem 1rem', cursor: driveBusy ? 'wait' : 'pointer',
                  background: driveStatus.connected ? 'var(--paper-l)' : 'var(--ink)',
                  color: driveStatus.connected ? 'var(--ink)' : 'var(--paper)',
                  border: `1px solid ${driveStatus.connected ? 'var(--rule)' : 'var(--ink)'}`,
                  fontFamily: 'var(--font-display)', fontSize: '.72rem', fontWeight: 500,
                  letterSpacing: '.06em', textTransform: 'uppercase', whiteSpace: 'nowrap',
                  opacity: driveBusy ? 0.5 : 1,
                }}
              >
                {driveBusy ? 'Hetki…' : driveStatus.connected ? 'Katkaise' : 'Yhdistä Drive'}
              </button>
            </div>
            {driveStatus.connected && driveStatus.expiresAt && driveStatus.expiresAt - Date.now() < 10 * 60 * 1000 && (
              <div style={{ fontSize: '.68rem', color: 'var(--yellow)', marginTop: '.4rem' }}>
                Token vanhenee pian — yhdistä uudelleen jatkaaksesi.
              </div>
            )}
          </div>

          {/* Ilmoitukset (web push) */}
          <NotificationsSettings />

          {/* Teema (vaalea / tumma) */}
          <div style={{ marginTop: '.85rem' }}>
            <div style={{ fontSize: '.82rem', fontWeight: 600, marginBottom: '.6rem' }}>Teema</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.4rem' }}>
              {([
                { key: 'light' as const, label: 'Vaalea', desc: 'Kerma-paperi' },
                { key: 'dark' as const, label: 'Tumma', desc: 'Inverttipaperi' },
              ]).map(t => (
                <button
                  key={t.key}
                  onClick={() => setTheme(t.key)}
                  style={{
                    padding: '.85rem', cursor: 'pointer',
                    background: theme === t.key ? 'var(--paper-d)' : 'var(--paper-l)',
                    border: `1px solid ${theme === t.key ? 'var(--ink)' : 'var(--rule)'}`,
                    color: 'var(--ink)', textAlign: 'left',
                    fontFamily: 'var(--font-display)',
                  }}
                >
                  <div style={{ fontSize: '.82rem', fontWeight: 500, letterSpacing: '.04em', textTransform: 'uppercase' }}>{t.label}</div>
                  <div style={{ fontSize: '.68rem', color: 'var(--ink2)', fontFamily: 'var(--font)', marginTop: '.2rem' }}>{t.desc}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

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

          {/* Liity toiseen yhteisoon */}
          <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
            <div style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--t2)', marginBottom: '.35rem' }}>Liity toiseen yhteisöön</div>
            <p style={{ fontSize: '.72rem', color: 'var(--t3)', marginBottom: '.6rem', lineHeight: 1.5 }}>
              Syötä toisen yhteisön salasana liittyäksesi sen jäseneksi. Voit kuulua useaan yhteisöön ja vaihtaa niiden välillä.
            </p>
            <div style={{ display: 'flex', gap: '.5rem' }}>
              <input
                className="input"
                placeholder="Yhteisön salasana"
                value={joinCode}
                onChange={e => { setJoinCode(e.target.value); setJoinError(''); }}
                onKeyDown={e => { if (e.key === 'Enter') joinAnotherOrg(); }}
                style={{ flex: 1, fontSize: '.85rem' }}
              />
              <button className="btn btn-primary btn-sm" onClick={joinAnotherOrg} disabled={!joinCode.trim() || joining}>
                {joining ? 'Liitytään…' : 'Liity'}
              </button>
            </div>
            {joinError && <p style={{ color: 'var(--red)', fontSize: '.75rem', marginTop: '.4rem' }}>{joinError}</p>}
          </div>
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
                  {isSuperAdmin && <button className="btn btn-ghost btn-sm" onClick={() => { if (window.confirm('Poistetaanko jäsen yhteisöstä?')) removeMember(m.uid); }} style={{ color: 'var(--red)' }}>Poista</button>}
                </>
              ) : (
                <span style={{ fontSize: '.72rem', padding: '.2rem .6rem', borderRadius: 9999, background: 'rgba(5,107,159,.1)', color: 'var(--pri-l)', fontWeight: 600 }}>{m.role}</span>
              )}
            </div>
          ))}
          {(isAdmin || isSuperAdmin) && (
            <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
              <div style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--t2)', marginBottom: '.35rem' }}>Kutsu uusi jäsen</div>
              <p style={{ fontSize: '.72rem', color: 'var(--t3)', marginBottom: '.6rem', lineHeight: 1.5 }}>
                Syötä sähköposti ja rooli — saat valmiin kutsuviestin yhteisön salasanalla. Voit lähettää sen sähköpostilla tai kopioida tekstin muuhun kanavaan.
              </p>
              <div style={{ display: 'flex', gap: '.5rem' }}>
                <input className="input" placeholder="Sähköposti" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} style={{ flex: 1 }} />
                <select className="input" value={inviteRole} onChange={e => setInviteRole(e.target.value as any)} style={{ width: 'auto' }}>
                  <option value="member">Jäsen</option><option value="admin">Admin</option>
                </select>
                <button className="btn btn-primary btn-sm" onClick={openInviteModal} disabled={!inviteEmail.trim()}>Kutsu</button>
              </div>
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

      {/* Invite modal */}
      {inviteModalOpen && (
        <div
          onClick={() => setInviteModalOpen(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 2000, padding: '1rem',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--card)', border: '1px solid var(--border)',
              borderRadius: 'var(--rl)', width: '100%', maxWidth: 620,
              maxHeight: '90vh', display: 'flex', flexDirection: 'column',
              boxShadow: '0 20px 60px rgba(0,0,0,.5)',
            }}
          >
            <div style={{ padding: '1.1rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '.95rem', fontWeight: 600 }}>Kutsu jäsen yhteisöön</h3>
                <p style={{ fontSize: '.72rem', color: 'var(--t3)', marginTop: '.15rem' }}>
                  Vastaanottaja: <strong style={{ color: 'var(--t1)' }}>{inviteEmail}</strong> · Rooli: {inviteRole === 'admin' ? 'Admin' : 'Jäsen'}
                </p>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setInviteModalOpen(false)} aria-label="Sulje">×</button>
            </div>

            <div style={{ padding: '1.25rem 1.5rem', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: '.9rem' }}>
              <div className="field">
                <label style={{ fontSize: '.75rem', fontWeight: 600, color: 'var(--t2)' }}>Otsikko</label>
                <input className="input" value={inviteSubject} onChange={e => setInviteSubject(e.target.value)} />
              </div>
              <div className="field">
                <label style={{ fontSize: '.75rem', fontWeight: 600, color: 'var(--t2)' }}>Kutsuviesti</label>
                <textarea
                  className="input"
                  value={inviteText}
                  onChange={e => setInviteText(e.target.value)}
                  rows={14}
                  style={{ fontFamily: 'inherit', lineHeight: 1.55, fontSize: '.84rem', resize: 'vertical', minHeight: 240 }}
                />
                <p style={{ fontSize: '.68rem', color: 'var(--t3)', marginTop: '.35rem', lineHeight: 1.5 }}>
                  Voit muokata viestiä vapaasti ennen lähetystä. Salasana on valmiiksi mukana — jaa vain luotetuille.
                </p>
              </div>
            </div>

            <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border)', display: 'flex', gap: '.5rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setInviteModalOpen(false)}>Peruuta</button>
              <button className="btn btn-secondary btn-sm" onClick={copyInviteText}>
                {inviteCopied ? 'Kopioitu!' : 'Kopioi teksti'}
              </button>
              <button className="btn btn-primary btn-sm" onClick={sendInviteEmail}>
                Lähetä sähköpostilla
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
