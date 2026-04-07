'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import { doc, setDoc, collection, getDocs, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useToast } from '@/lib/toast';

const roles = [
  { id: 'comms', label: 'Viestintävastaava', desc: 'Vastaan organisaation viestinnästä' },
  { id: 'marketing', label: 'Markkinointipäällikkö', desc: 'Johdan markkinointitiimiä' },
  { id: 'social', label: 'Some-manageri', desc: 'Hallinnoin sosiaalisen median kanavia' },
  { id: 'director', label: 'Toiminnanjohtaja', desc: 'Johdan organisaatiota kokonaisuutena' },
  { id: 'producer', label: 'Tuottaja', desc: 'Vastaan tuotannosta ja projekteista' },
  { id: 'content', label: 'Sisällöntuottaja', desc: 'Luon sisältöjä ja materiaaleja' },
  { id: 'freelancer', label: 'Freelancer / konsultti', desc: 'Teen viestintää usealle asiakkaalle' },
  { id: 'other', label: 'Muu', desc: 'Jokin muu rooli' },
];

export default function OnboardingPage() {
  const { user, refreshOrgs, setActiveOrg, logout } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  // Steps: code → role → confirm
  const [step, setStep] = useState<'code' | 'role' | 'confirm'>('code');

  // Join data
  const [joinCode, setJoinCode] = useState('');
  const [joinError, setJoinError] = useState('');
  const [joinLoading, setJoinLoading] = useState(false);
  const [joinOrgName, setJoinOrgName] = useState('');
  const [joinOrgId, setJoinOrgId] = useState('');
  const [selectedRole, setSelectedRole] = useState('');
  const [displayName, setDisplayName] = useState(user?.displayName || '');

  const rightPanel: Record<string, { title: string; sub: string }> = {
    code: { title: 'Liity yhteisöösi', sub: 'Syötä organisaatiosi salasana aloittaaksesi. Sait sen yhteisösi ylläpitäjältä.' },
    role: { title: 'Kerro roolisi', sub: 'Roolisi auttaa tiimiäsi ymmärtämään vastuualueesi.' },
    confirm: { title: 'Kaikki valmista!', sub: 'Tervetuloa yhteisöösi. Voit aloittaa Momentumin käytön.' },
  };
  const panel = rightPanel[step];

  const lookupCode = async () => {
    if (!joinCode.trim()) return;
    setJoinLoading(true); setJoinError('');
    try {
      const orgsSnap = await getDocs(collection(db, 'organizations'));
      let found = false;
      for (const orgDoc of orgsSnap.docs) {
        const data = orgDoc.data();
        if (data.joinCode === joinCode.trim().toLowerCase()) {
          setJoinOrgName(data.name);
          setJoinOrgId(orgDoc.id);
          setStep('role');
          found = true;
          break;
        }
      }
      if (!found) setJoinError('Salasanaa ei löytynyt. Tarkista kirjoitusasu.');
    } catch (e) {
      setJoinError('Virhe haussa. Yritä uudelleen.');
    } finally {
      setJoinLoading(false);
    }
  };

  const handleJoin = async () => {
    if (!user || !joinOrgId || !selectedRole) return;
    setSaving(true);
    try {
      const roleLabel = roles.find(r => r.id === selectedRole)?.label || selectedRole;

      // Add as member
      await setDoc(doc(db, 'organizations', joinOrgId, 'members', user.uid), {
        role: 'member',
        joinedAt: new Date().toISOString(),
        displayName: displayName || user.displayName || '',
        email: user.email || '',
        photoURL: user.photoURL || '',
        userRole: roleLabel,
      });

      // Add to org team in data
      const orgDataSnap = await getDoc(doc(db, 'organizations', joinOrgId, 'data', 'org'));
      if (orgDataSnap.exists()) {
        const orgData = JSON.parse(orgDataSnap.data().v || '{}');
        const team = orgData.team || [];
        const name = displayName || user.displayName || 'Käyttäjä';
        if (!team.some((t: any) => t.name === name)) {
          team.push({ name, role: roleLabel, avatar: name[0] });
          await setDoc(doc(db, 'organizations', joinOrgId, 'data', 'org'), {
            v: JSON.stringify({ ...orgData, team }),
            ts: Date.now(), updatedBy: user.uid,
          });
        }
      }

      // Update userOrgs
      const existingDoc = await getDoc(doc(db, 'userOrgs', user.uid));
      const existingOrgs = existingDoc.exists() ? (existingDoc.data().orgs || []) : [];
      await setDoc(doc(db, 'userOrgs', user.uid), {
        orgs: [...existingOrgs.filter((o: any) => o.orgId !== joinOrgId), { orgId: joinOrgId, role: 'member', name: joinOrgName }],
      });

      setActiveOrg(joinOrgId);
      await refreshOrgs();
      toast('Tervetuloa yhteisöön ' + joinOrgName + '!', 'success');
      router.push(`/${joinOrgId}/dashboard`);
    } catch (e) {
      console.error('Join error:', e);
      toast('Virhe yhteisöön liittymisessä', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Left panel */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: 720, padding: '2rem 3rem' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', fontWeight: 500, letterSpacing: '.02em' }}>
              <img src="/brand/hetki-logo-white.png" alt="Hetki" style={{ height: 22, marginRight: '.6rem', verticalAlign: 'middle' }} />
              Momentum
            </h1>
            <p style={{ color: 'var(--t3)', fontSize: '.88rem', marginTop: '.25rem' }}>
              Liity yhteisöösi aloittaaksesi
            </p>
          </div>
          <button className="btn btn-ghost" onClick={logout} style={{ fontSize: '.78rem' }}>Kirjaudu ulos</button>
        </div>

        {/* Progress */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0', marginBottom: '3rem' }}>
          {[{ id: 'code', l: 'Salasana' }, { id: 'role', l: 'Roolisi' }, { id: 'confirm', l: 'Valmis' }].map((s, i) => {
            const steps = ['code', 'role', 'confirm'];
            const ci = steps.indexOf(step);
            const done = i < ci;
            const active = i === ci;
            return (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', flex: i < 2 ? 1 : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', whiteSpace: 'nowrap' }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%',
                    background: done ? 'var(--green)' : active ? 'var(--pri)' : 'var(--elev)',
                    border: `2px solid ${done ? 'var(--green)' : active ? 'var(--pri)' : 'var(--border)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '.7rem', fontWeight: 700, color: done || active ? '#fff' : 'var(--t3)',
                  }}>
                    {done ? '\u2713' : i + 1}
                  </div>
                  <span style={{ fontSize: '.82rem', fontWeight: active ? 700 : 500, color: active ? 'var(--t1)' : done ? 'var(--green)' : 'var(--t3)' }}>{s.l}</span>
                </div>
                {i < 2 && <div style={{ flex: 1, height: 2, margin: '0 1rem', background: done ? 'var(--green)' : 'var(--border)', borderRadius: 1 }} />}
              </div>
            );
          })}
        </div>

        {/* Content */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', maxWidth: 480 }}>

          {step === 'code' && (
            <div style={{ animation: 'fadeUp .5s' }}>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '.35rem' }}>Syötä yhteisön salasana</h2>
              <p style={{ color: 'var(--t3)', fontSize: '.85rem', marginBottom: '1.5rem' }}>
                Sait salasanan organisaatiosi yhteyshenkilöltä. Se yhdistää sinut oikeaan yhteisöön.
              </p>
              <input className="input" value={joinCode} onChange={e => { setJoinCode(e.target.value); setJoinError(''); }}
                placeholder="Syötä salasana" autoFocus
                style={{ fontSize: '1rem', padding: '.9rem 1.1rem', marginBottom: '.75rem' }}
                onKeyDown={e => { if (e.key === 'Enter') lookupCode(); }} />
              {joinError && <p style={{ color: 'var(--red)', fontSize: '.82rem', marginBottom: '.75rem' }}>{joinError}</p>}
              <button className="btn btn-primary" onClick={lookupCode} disabled={!joinCode.trim() || joinLoading}>
                {joinLoading ? 'Haetaan...' : 'Jatka'}
              </button>
            </div>
          )}

          {step === 'role' && (
            <div style={{ animation: 'fadeUp .5s' }}>
              <div style={{ background: 'rgba(45,212,160,.06)', border: '1px solid rgba(45,212,160,.2)', borderRadius: 'var(--rl)', padding: '1rem 1.25rem', marginBottom: '1.5rem' }}>
                <div style={{ fontSize: '.68rem', color: 'var(--green)', fontWeight: 600, textTransform: 'uppercase', marginBottom: '.25rem' }}>Yhteisö löytyi</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{joinOrgName}</div>
              </div>

              <div className="field" style={{ marginBottom: '1.25rem' }}>
                <label>Nimesi</label>
                <input className="input" value={displayName} onChange={e => setDisplayName(e.target.value)}
                  placeholder="Etunimi Sukunimi" style={{ fontSize: '1rem', padding: '.85rem 1rem' }} />
              </div>

              <h2 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '.35rem' }}>Mikä on roolisi yhteisössä?</h2>
              <p style={{ color: 'var(--t3)', fontSize: '.82rem', marginBottom: '1rem' }}>Tämä näkyy tiimissä muille jäsenille.</p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.5rem', marginBottom: '1.5rem' }}>
                {roles.map(r => (
                  <div key={r.id} onClick={() => setSelectedRole(r.id)} style={{
                    padding: '.85rem 1rem', borderRadius: 'var(--r)', cursor: 'pointer',
                    border: `1px solid ${selectedRole === r.id ? 'var(--pri)' : 'var(--border)'}`,
                    background: selectedRole === r.id ? 'rgba(5,107,159,.06)' : 'var(--elev)',
                    transition: 'all .15s',
                  }}>
                    <div style={{ fontSize: '.85rem', fontWeight: 600 }}>{r.label}</div>
                    <div style={{ fontSize: '.68rem', color: 'var(--t3)', marginTop: '.1rem' }}>{r.desc}</div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: '.5rem' }}>
                <button className="btn btn-ghost" onClick={() => setStep('code')}>Takaisin</button>
                <button className="btn btn-primary" onClick={() => setStep('confirm')} disabled={!selectedRole || !displayName.trim()}>Jatka</button>
              </div>
            </div>
          )}

          {step === 'confirm' && (
            <div style={{ animation: 'fadeUp .5s' }}>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '1rem' }}>Tarkista tietosi</h2>

              <div style={{ background: 'var(--elev)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '1.25rem', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem' }}>
                  <div className="ava" style={{ width: 42, height: 42, fontSize: '.9rem', background: 'var(--pri)' }}>
                    {user?.photoURL ? <img src={user.photoURL} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} /> : (displayName || 'K')[0]}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '.95rem' }}>{displayName}</div>
                    <div style={{ fontSize: '.78rem', color: 'var(--t3)' }}>{roles.find(r => r.id === selectedRole)?.label}</div>
                  </div>
                </div>
              </div>

              <div style={{ background: 'var(--elev)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '1.25rem', marginBottom: '1.5rem' }}>
                <div style={{ fontSize: '.68rem', color: 'var(--t3)', textTransform: 'uppercase', fontWeight: 600, marginBottom: '.35rem' }}>Yhteisö</div>
                <div style={{ fontSize: '1.05rem', fontWeight: 700 }}>{joinOrgName}</div>
              </div>

              <div className="tip-box">
                Sinut lisätään yhteisön tiimiin ja saat pääsyn kaikkiin työkaluihin. Voit muokata tietojasi myöhemmin Asetuksissa.
              </div>

              <div style={{ display: 'flex', gap: '.5rem', marginTop: '1.5rem' }}>
                <button className="btn btn-ghost" onClick={() => setStep('role')}>Takaisin</button>
                <button className="btn btn-primary btn-lg" onClick={handleJoin} disabled={saving}>
                  {saving ? 'Liitytään...' : 'Aloita käyttö'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right panel */}
      <div style={{
        width: 420, flexShrink: 0,
        background: 'linear-gradient(135deg, var(--pri-d) 0%, var(--hetki-pink) 50%, var(--hetki-yellow) 100%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '3rem', textAlign: 'center', position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'relative', zIndex: 1 }}>
          <h2 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#fff', marginBottom: '.75rem', lineHeight: 1.2 }}>{panel.title}</h2>
          <p style={{ fontSize: '.95rem', color: 'rgba(255,255,255,.85)', lineHeight: 1.6, maxWidth: 320 }}>{panel.sub}</p>
        </div>
        <div style={{ position: 'absolute', top: -60, right: -60, width: 200, height: 200, borderRadius: '50%', background: 'rgba(255,255,255,.06)' }} />
        <div style={{ position: 'absolute', bottom: -40, left: -40, width: 160, height: 160, borderRadius: '50%', background: 'rgba(255,255,255,.04)' }} />
      </div>
    </div>
  );
}
