'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import { doc, setDoc, collection, query, where, getDocs, collectionGroup } from 'firebase/firestore';
import { db } from '@/lib/firebase';

// Generate a memorable join code like "momentum-aurinko-472"
function generateJoinCode(orgName: string): string {
  const words = ['aurinko','myrsky','aalto','vuori','lahde','polku','silta','tuuli','tuli','jarvi','metsa','taivas','kukka','kivi','sade','lehti','pilvi','virta'];
  const word = words[Math.floor(Math.random() * words.length)];
  const num = Math.floor(100 + Math.random() * 900);
  const prefix = orgName.trim().toLowerCase().replace(/[^a-zäöå0-9]/g, '').slice(0, 8);
  return `${prefix}-${word}-${num}`;
}

const roles = [
  { id: 'comms', label: 'Viestintävastaava', desc: 'Vastaan organisaation viestinnästä' },
  { id: 'marketing', label: 'Markkinointipäällikkö', desc: 'Johdan markkinointitiimiä' },
  { id: 'social', label: 'Some-manageri', desc: 'Hallinnoin sosiaalisen median kanavia' },
  { id: 'director', label: 'Toiminnanjohtaja', desc: 'Johdan organisaatiota kokonaisuutena' },
  { id: 'freelancer', label: 'Freelancer / konsultti', desc: 'Teen viestintää usealle asiakkaalle' },
  { id: 'other', label: 'Muu', desc: 'Jokin muu rooli' },
];

const teamSizes = ['1', '2-5', '6-15', '16-50', '50+'];

const defaultChannels = [
  { name: 'Facebook', color: '#1877F2', ic: 'FB' },
  { name: 'Instagram', color: '#E1306C', ic: 'IG' },
  { name: 'LinkedIn', color: '#0A66C2', ic: 'LI' },
  { name: 'TikTok', color: '#000000', ic: 'TT' },
  { name: 'YouTube', color: '#FF0000', ic: 'YT' },
  { name: 'Nettisivut', color: '#34d399', ic: 'WW' },
  { name: 'Uutiskirje', color: '#fb923c', ic: 'UK' },
];

// Section > substep mapping
const sections = [
  { id: 'you', label: 'Tietosi', icon: '\u25cb', steps: ['name', 'role', 'teamsize'] },
  { id: 'org', label: 'Organisaatio', icon: '\u25a1', steps: ['orgname', 'channels'] },
  { id: 'strategy', label: 'Strategia', icon: '\u2606', steps: ['goals', 'summary'] },
];

const rightPanelContent: Record<string, { title: string; subtitle: string }> = {
  name: { title: 'Tutustutaan!', subtitle: 'Kerro meille itsestäsi niin voimme räätälöidä kokemuksen sinulle.' },
  role: { title: 'Roolisi on tärkeä', subtitle: 'Roolisi auttaa meitä ymmärtämään miten työskentelet ja mitä tarvitset.' },
  teamsize: { title: 'Tiimisi koko', subtitle: 'Näin osaamme tarjota oikeat työkalut tiimillesi.' },
  orgname: { title: 'Kerro organisaatiostasi', subtitle: 'Momentum mukautuu organisaatiosi viestinnän tarpeisiin.' },
  channels: { title: 'Missä viestitte?', subtitle: 'Valitse kanavat joita organisaatiosi käyttää aktiivisesti.' },
  goals: { title: 'Mihin tähtäätte?', subtitle: 'Tavoitteet ohjaavat Momentumin strategiatyökaluja.' },
  summary: { title: 'Kaikki valmista!', subtitle: 'Tarkista tiedot ja aloita Momentumin käyttö.' },
};

export default function OnboardingPage() {
  const { user, refreshOrgs, setActiveOrg, logout } = useAuth();
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  // Path: 'choose' | 'create' | 'join'
  const [path, setPath] = useState<'choose' | 'create' | 'join'>('choose');

  // Join community state
  const [joinCode, setJoinCode] = useState('');
  const [joinError, setJoinError] = useState('');
  const [joinLoading, setJoinLoading] = useState(false);
  const [joinOrgName, setJoinOrgName] = useState('');
  const [joinOrgId, setJoinOrgId] = useState('');
  const [joinAs, setJoinAs] = useState<'member' | 'visitor'>('member');
  const [joinUserRole, setJoinUserRole] = useState('');
  const [joinStep, setJoinStep] = useState<'code' | 'role' | 'confirm'>('code');

  // Current position (for create flow)
  const [sectionIdx, setSectionIdx] = useState(0);
  const [stepIdx, setStepIdx] = useState(0);
  const currentSection = sections[sectionIdx];
  const currentStep = currentSection.steps[stepIdx];
  const panel = rightPanelContent[currentStep] || { title: '', subtitle: '' };

  // Data
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [selectedRole, setSelectedRole] = useState('');
  const [teamSize, setTeamSize] = useState('');
  const [orgName, setOrgName] = useState('');
  const [shortName, setShortName] = useState('');
  const [slogan, setSlogan] = useState('');
  const [selectedChannels, setSelectedChannels] = useState<typeof defaultChannels>([]);
  const [goals, setGoals] = useState<string[]>(['']);

  // ── JOIN COMMUNITY LOGIC ──
  const lookupJoinCode = async () => {
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
          setJoinStep('role');
          found = true;
          break;
        }
      }
      if (!found) setJoinError('Sanasanaa ei löytynyt. Tarkista kirjoitusasu.');
    } catch (e) {
      setJoinError('Virhe haussa. Yritä uudelleen.');
    } finally {
      setJoinLoading(false);
    }
  };

  const handleJoin = async () => {
    if (!user || !joinOrgId) return;
    setSaving(true);
    try {
      // Add as member or visitor
      await setDoc(doc(db, 'organizations', joinOrgId, 'members', user.uid), {
        role: joinAs,
        joinedAt: new Date().toISOString(),
        displayName: user.displayName || displayName || '',
        email: user.email || '',
        photoURL: user.photoURL || '',
        userRole: joinAs === 'member' ? joinUserRole : 'vierailija',
      });
      // Update userOrgs
      const userOrgsSnap = await getDocs(collection(db, 'userOrgs'));
      // Merge with existing orgs
      const existingDoc = await import('firebase/firestore').then(m => m.getDoc(doc(db, 'userOrgs', user.uid)));
      const existingOrgs = existingDoc.exists() ? (existingDoc.data().orgs || []) : [];
      await setDoc(doc(db, 'userOrgs', user.uid), {
        orgs: [...existingOrgs.filter((o: any) => o.orgId !== joinOrgId), { orgId: joinOrgId, role: joinAs, name: joinOrgName }],
      });
      // If member, also add to org data team
      if (joinAs === 'member') {
        const orgDataSnap = await import('firebase/firestore').then(m => m.getDoc(doc(db, 'organizations', joinOrgId, 'data', 'org')));
        if (orgDataSnap.exists()) {
          const orgData = JSON.parse(orgDataSnap.data().v || '{}');
          const team = orgData.team || [];
          if (!team.some((t: any) => t.name === (user.displayName || displayName))) {
            team.push({ name: user.displayName || displayName || 'Käyttäjä', role: roles.find(r => r.id === joinUserRole)?.label || joinUserRole, avatar: (user.displayName || 'K')[0] });
            await setDoc(doc(db, 'organizations', joinOrgId, 'data', 'org'), { v: JSON.stringify({ ...orgData, team }), ts: Date.now(), updatedBy: user.uid });
          }
        }
      }
      setActiveOrg(joinOrgId);
      await refreshOrgs();
      router.push('/dashboard');
    } catch (e) {
      console.error('Join error:', e);
      alert('Virhe yhteisöön liittymisessä.');
    } finally {
      setSaving(false);
    }
  };

  const toggleChannel = (ch: typeof defaultChannels[0]) => {
    setSelectedChannels(prev =>
      prev.some(c => c.name === ch.name) ? prev.filter(c => c.name !== ch.name) : [...prev, ch]
    );
  };

  // Navigation
  const totalSteps = sections.reduce((s, sec) => s + sec.steps.length, 0);
  const completedSteps = sections.slice(0, sectionIdx).reduce((s, sec) => s + sec.steps.length, 0) + stepIdx;

  const canNext = () => {
    if (currentStep === 'name') return displayName.trim().length > 0;
    if (currentStep === 'role') return selectedRole !== '';
    if (currentStep === 'teamsize') return teamSize !== '';
    if (currentStep === 'orgname') return orgName.trim().length > 0;
    return true;
  };

  const goNext = () => {
    if (stepIdx < currentSection.steps.length - 1) {
      setStepIdx(stepIdx + 1);
    } else if (sectionIdx < sections.length - 1) {
      setSectionIdx(sectionIdx + 1);
      setStepIdx(0);
    }
  };

  const goBack = () => {
    if (stepIdx > 0) {
      setStepIdx(stepIdx - 1);
    } else if (sectionIdx > 0) {
      const prevSection = sections[sectionIdx - 1];
      setSectionIdx(sectionIdx - 1);
      setStepIdx(prevSection.steps.length - 1);
    }
  };

  const isFirst = sectionIdx === 0 && stepIdx === 0;
  const isLast = currentStep === 'summary';

  const handleFinish = async () => {
    if (!user || !orgName.trim()) return;
    setSaving(true);
    try {
      const orgRef = doc(collection(db, 'organizations'));
      const orgId = orgRef.id;

      const orgJoinCode = generateJoinCode(orgName);
      await setDoc(orgRef, {
        name: orgName.trim(),
        shortName: shortName.trim() || orgName.trim().slice(0, 3).toUpperCase(),
        slogan: slogan.trim(),
        joinCode: orgJoinCode,
        createdAt: new Date().toISOString(),
        createdBy: user.uid,
        plan: 'free',
      });

      await setDoc(doc(db, 'organizations', orgId, 'members', user.uid), {
        role: 'owner',
        joinedAt: new Date().toISOString(),
        displayName: displayName || user.displayName || '',
        email: user.email || '',
        photoURL: user.photoURL || '',
        userRole: selectedRole,
      });

      const orgData = {
        name: orgName.trim(),
        s: shortName.trim() || orgName.trim().slice(0, 3).toUpperCase(),
        slogan: slogan.trim(),
        channels: selectedChannels,
        goals: goals.filter(g => g.trim()).map((g, i) => ({ t: g, p: i + 1 })),
        auds: [], vals: [], tone: [],
        team: [{ name: displayName || user.displayName || 'Käyttäjä', role: roles.find(r => r.id === selectedRole)?.label || 'Omistaja', avatar: (displayName || 'K')[0] }],
        teamSize,
      };

      await setDoc(doc(db, 'organizations', orgId, 'data', 'org'), { v: JSON.stringify(orgData), ts: Date.now(), updatedBy: user.uid });
      for (const key of ['projects', 'events', 'publications', 'channelStats', 'media_meta', 'media_uploaded', 'media_collections']) {
        await setDoc(doc(db, 'organizations', orgId, 'data', key), { v: JSON.stringify([]), ts: Date.now(), updatedBy: user.uid });
      }

      await setDoc(doc(db, 'userOrgs', user.uid), { orgs: [{ orgId, role: 'owner', name: orgName.trim() }] }, { merge: true });

      setActiveOrg(orgId);
      await refreshOrgs();
      router.push('/dashboard');
    } catch (e) {
      console.error('Onboarding error:', e);
      alert('Virhe organisaation luonnissa. Yritä uudelleen.');
    } finally {
      setSaving(false);
    }
  };

  // ══════ CHOOSE PATH SCREEN ══════
  if (path === 'choose') {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: 720, padding: '2rem 3rem', justifyContent: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
            <div>
              <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', fontWeight: 500 }}>
                Tervetuloa, {user?.displayName?.split(' ')[0] || 'k\u00e4ytt\u00e4j\u00e4'}!
              </h1>
              <p style={{ color: 'var(--t3)', fontSize: '.88rem', marginTop: '.25rem' }}>Miten haluat aloittaa?</p>
            </div>
            <button className="btn btn-ghost" onClick={logout} style={{ fontSize: '.78rem' }}>Kirjaudu ulos</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: 480 }}>
            <div onClick={() => setPath('create')} style={{
              padding: '1.5rem', borderRadius: 'var(--rl)', cursor: 'pointer',
              border: '1px solid var(--border)', background: 'var(--card)', transition: 'all .2s',
            }} onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--pri)')} onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '.35rem' }}>Luo uusi yhteis\u00f6</h3>
              <p style={{ color: 'var(--t2)', fontSize: '.85rem', lineHeight: 1.6 }}>
                Perusta oma organisaatio ja kutsu tiimisi mukaan. Sinusta tulee yhteis\u00f6n omistaja.
              </p>
            </div>
            <div onClick={() => setPath('join')} style={{
              padding: '1.5rem', borderRadius: 'var(--rl)', cursor: 'pointer',
              border: '1px solid var(--border)', background: 'var(--card)', transition: 'all .2s',
            }} onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--green)')} onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '.35rem' }}>Liity yhteisöön</h3>
              <p style={{ color: 'var(--t2)', fontSize: '.85rem', lineHeight: 1.6 }}>
                Sinulla on sanasana? Liity olemassa olevaan organisaatioon tiimij\u00e4senen\u00e4 tai vierailijana.
              </p>
            </div>
          </div>
        </div>
        <div style={{ width: 420, flexShrink: 0, background: 'linear-gradient(135deg, var(--pri-d) 0%, var(--hetki-pink) 50%, var(--hetki-yellow) 100%)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '3rem', textAlign: 'center' }}>
          <h2 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#fff', marginBottom: '.75rem' }}>Tervetuloa Momentumiin</h2>
          <p style={{ fontSize: '.95rem', color: 'rgba(255,255,255,.85)', lineHeight: 1.6, maxWidth: 320 }}>Viestinn\u00e4n suunnittelu- ja strategiaty\u00f6kalu organisaatioille.</p>
        </div>
      </div>
    );
  }

  // ══════ JOIN COMMUNITY SCREEN ══════
  if (path === 'join') {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: 720, padding: '2rem 3rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
            <div>
              <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', fontWeight: 500 }}>Liity yhteisöön</h1>
              <p style={{ color: 'var(--t3)', fontSize: '.88rem', marginTop: '.25rem' }}>Syötä yhteisön sanasana</p>
            </div>
            <button className="btn btn-ghost" onClick={() => setPath('choose')} style={{ fontSize: '.78rem' }}>{'\u2190'} Takaisin</button>
          </div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', maxWidth: 480 }}>
            {joinStep === 'code' && (
              <div style={{ animation: 'fadeUp .5s' }}>
                <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '.35rem' }}>Syötä sanasana</h2>
                <p style={{ color: 'var(--t3)', fontSize: '.85rem', marginBottom: '1.5rem' }}>
                  Sait sanasanan yhteisön jäseneltä tai ylläpitäjältä. Se näyttää tältä: <code style={{ background: 'var(--elev)', padding: '.15rem .4rem', borderRadius: 4, fontSize: '.82rem' }}>nimi-sana-123</code>
                </p>
                <input className="input" value={joinCode} onChange={e => { setJoinCode(e.target.value); setJoinError(''); }} placeholder="Esim. aivovamm-aurinko-472" autoFocus style={{ fontSize: '1rem', padding: '.9rem 1.1rem', marginBottom: '.75rem' }} onKeyDown={e => { if (e.key === 'Enter') lookupJoinCode(); }} />
                {joinError && <p style={{ color: 'var(--red)', fontSize: '.82rem', marginBottom: '.75rem' }}>{joinError}</p>}
                <button className="btn btn-primary" onClick={lookupJoinCode} disabled={!joinCode.trim() || joinLoading}>
                  {joinLoading ? 'Haetaan...' : 'Etsi yhteisö'}
                </button>
              </div>
            )}

            {joinStep === 'role' && (
              <div style={{ animation: 'fadeUp .5s' }}>
                <div style={{ background: 'rgba(45,212,160,.06)', border: '1px solid rgba(45,212,160,.2)', borderRadius: 'var(--rl)', padding: '1.25rem', marginBottom: '1.5rem' }}>
                  <div style={{ fontSize: '.72rem', color: 'var(--green)', fontWeight: 600, textTransform: 'uppercase', marginBottom: '.35rem' }}>Yhteisö löytyi</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{joinOrgName}</div>
                </div>

                <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '.35rem' }}>Miten haluat liittyä?</h2>
                <p style={{ color: 'var(--t3)', fontSize: '.85rem', marginBottom: '1.5rem' }}>Valitse roolisi yhteisössä.</p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '.75rem', marginBottom: '1.5rem' }}>
                  <div onClick={() => setJoinAs('member')} style={{
                    padding: '1.25rem', borderRadius: 'var(--rl)', cursor: 'pointer',
                    border: `1px solid ${joinAs === 'member' ? 'var(--pri)' : 'var(--border)'}`,
                    background: joinAs === 'member' ? 'rgba(5,107,159,.06)' : 'var(--elev)',
                  }}>
                    <div style={{ fontSize: '.95rem', fontWeight: 700 }}>Tiimijäsen</div>
                    <div style={{ fontSize: '.78rem', color: 'var(--t3)', marginTop: '.2rem' }}>Lisätään tiimiin, voit muokata ja luoda sisältöä</div>
                  </div>
                  <div onClick={() => setJoinAs('visitor')} style={{
                    padding: '1.25rem', borderRadius: 'var(--rl)', cursor: 'pointer',
                    border: `1px solid ${joinAs === 'visitor' ? 'var(--green)' : 'var(--border)'}`,
                    background: joinAs === 'visitor' ? 'rgba(45,212,160,.06)' : 'var(--elev)',
                  }}>
                    <div style={{ fontSize: '.95rem', fontWeight: 700 }}>Vierailija</div>
                    <div style={{ fontSize: '.78rem', color: 'var(--t3)', marginTop: '.2rem' }}>Katselutila — näet kaiken mutta et voi muokata</div>
                  </div>
                </div>

                {joinAs === 'member' && (
                  <div style={{ marginBottom: '1.5rem' }}>
                    <h3 style={{ fontSize: '.95rem', fontWeight: 700, marginBottom: '.5rem' }}>Mikä on roolisi?</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.5rem' }}>
                      {roles.map(r => (
                        <div key={r.id} onClick={() => setJoinUserRole(r.id)} style={{
                          padding: '.8rem', borderRadius: 'var(--r)', cursor: 'pointer', fontSize: '.82rem', fontWeight: 600,
                          border: `1px solid ${joinUserRole === r.id ? 'var(--pri)' : 'var(--border)'}`,
                          background: joinUserRole === r.id ? 'rgba(5,107,159,.06)' : 'var(--elev)',
                        }}>{r.label}</div>
                      ))}
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', gap: '.5rem' }}>
                  <button className="btn btn-ghost" onClick={() => setJoinStep('code')}>Takaisin</button>
                  <button className="btn btn-primary" onClick={handleJoin} disabled={saving || (joinAs === 'member' && !joinUserRole)}>
                    {saving ? 'Liitytään...' : `Liity ${joinAs === 'visitor' ? 'vierailijana' : 'tiimijäsenenä'}`}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        <div style={{ width: 420, flexShrink: 0, background: 'linear-gradient(135deg, var(--hetki-green) 0%, var(--pri-d) 100%)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '3rem', textAlign: 'center' }}>
          <h2 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#fff', marginBottom: '.75rem' }}>
            {joinStep === 'code' ? 'Liity yhteisöön' : 'Valitse roolisi'}
          </h2>
          <p style={{ fontSize: '.95rem', color: 'rgba(255,255,255,.85)', lineHeight: 1.6, maxWidth: 320 }}>
            {joinStep === 'code' ? 'Sanasana yhdistää sinut oikeaan yhteisöön turvallisesti.' : 'Roolisi vaikuttaa siihen mitä voit tehdä yhteisössä.'}
          </p>
        </div>
      </div>
    );
  }

  // ══════ CREATE COMMUNITY FLOW ══════
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>
      {/* ═══ LEFT PANEL ═══ */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: 720, padding: '2rem 3rem' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', fontWeight: 500, letterSpacing: '.02em' }}>
              Tervetuloa, {user?.displayName?.split(' ')[0] || 'käyttäjä'}!
            </h1>
            <p style={{ color: 'var(--t3)', fontSize: '.88rem', marginTop: '.25rem' }}>
              Tarvitsemme muutaman tiedon ennen kuin aloitat
            </p>
          </div>
          <button className="btn btn-ghost" onClick={logout} style={{ fontSize: '.78rem' }}>Kirjaudu ulos</button>
        </div>

        {/* Progress stepper */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0', marginBottom: '3rem' }}>
          {sections.map((sec, i) => {
            const done = i < sectionIdx;
            const active = i === sectionIdx;
            return (
              <div key={sec.id} style={{ display: 'flex', alignItems: 'center', flex: i < sections.length - 1 ? 1 : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', whiteSpace: 'nowrap' }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%',
                    background: done ? 'var(--green)' : active ? 'var(--pri)' : 'var(--elev)',
                    border: `2px solid ${done ? 'var(--green)' : active ? 'var(--pri)' : 'var(--border)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '.7rem', fontWeight: 700, color: done || active ? '#fff' : 'var(--t3)',
                    transition: 'all .3s',
                  }}>
                    {done ? '\u2713' : sec.icon}
                  </div>
                  <span style={{
                    fontSize: '.82rem', fontWeight: active ? 700 : 500,
                    color: active ? 'var(--t1)' : done ? 'var(--green)' : 'var(--t3)',
                  }}>{sec.label}</span>
                </div>
                {i < sections.length - 1 && (
                  <div style={{
                    flex: 1, height: 2, margin: '0 1rem',
                    background: done ? 'var(--green)' : active && stepIdx > 0 ? `linear-gradient(90deg, var(--pri) ${(stepIdx / currentSection.steps.length) * 100}%, var(--border) ${(stepIdx / currentSection.steps.length) * 100}%)` : 'var(--border)',
                    borderRadius: 1, transition: 'all .3s',
                  }} />
                )}
              </div>
            );
          })}
        </div>

        {/* ═══ STEP CONTENT ═══ */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', maxWidth: 480 }}>

          {currentStep === 'name' && (
            <div style={{ animation: 'fadeUp .5s' }}>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '.35rem' }}>Mikä on nimesi?</h2>
              <p style={{ color: 'var(--t3)', fontSize: '.85rem', marginBottom: '1.5rem' }}>Tällä nimellä sinut nähdään tiimissä ja julkaisuissa.</p>
              <input className="input" value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Etunimi Sukunimi" autoFocus style={{ fontSize: '1rem', padding: '.9rem 1.1rem' }} />
            </div>
          )}

          {currentStep === 'role' && (
            <div style={{ animation: 'fadeUp .5s' }}>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '.35rem' }}>Mikä kuvaa sinua parhaiten?</h2>
              <p style={{ color: 'var(--t3)', fontSize: '.85rem', marginBottom: '1.5rem' }}>Auta meitä ymmärtämään miten työskentelet.</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.6rem' }}>
                {roles.map(r => (
                  <div key={r.id} onClick={() => setSelectedRole(r.id)} style={{
                    padding: '1rem 1.1rem', borderRadius: 'var(--rl)', cursor: 'pointer',
                    border: `1px solid ${selectedRole === r.id ? 'var(--pri)' : 'var(--border)'}`,
                    background: selectedRole === r.id ? 'rgba(5,107,159,.06)' : 'var(--elev)',
                    transition: 'all .2s',
                  }}>
                    <div style={{ fontSize: '.88rem', fontWeight: 600 }}>{r.label}</div>
                    <div style={{ fontSize: '.72rem', color: 'var(--t3)', marginTop: '.15rem' }}>{r.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {currentStep === 'teamsize' && (
            <div style={{ animation: 'fadeUp .5s' }}>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '.35rem' }}>Kuinka suuri tiimisi on?</h2>
              <p style={{ color: 'var(--t3)', fontSize: '.85rem', marginBottom: '1.5rem' }}>Viestintätiimisi koko auttaa meitä tarjoamaan oikeat työkalut.</p>
              <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap' }}>
                {teamSizes.map(s => (
                  <div key={s} onClick={() => setTeamSize(s)} style={{
                    padding: '.8rem 1.5rem', borderRadius: 'var(--rl)', cursor: 'pointer',
                    border: `1px solid ${teamSize === s ? 'var(--pri)' : 'var(--border)'}`,
                    background: teamSize === s ? 'rgba(5,107,159,.06)' : 'var(--elev)',
                    fontSize: '.95rem', fontWeight: 600, transition: 'all .2s',
                  }}>{s} {s === '1' ? 'henkilö' : 'henkilöä'}</div>
                ))}
              </div>
            </div>
          )}

          {currentStep === 'orgname' && (
            <div style={{ animation: 'fadeUp .5s' }}>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '.35rem' }}>Organisaatiosi tiedot</h2>
              <p style={{ color: 'var(--t3)', fontSize: '.85rem', marginBottom: '1.5rem' }}>Momentum mukautuu organisaatiosi tarpeisiin.</p>
              <div className="field">
                <label>Organisaation nimi *</label>
                <input className="input" placeholder="Esim. Aivovammaliitto" value={orgName} onChange={e => setOrgName(e.target.value)} autoFocus style={{ fontSize: '1rem', padding: '.9rem 1.1rem' }} />
              </div>
              <div className="field">
                <label>Lyhenne</label>
                <input className="input" placeholder="Esim. AVL" value={shortName} onChange={e => setShortName(e.target.value)} />
              </div>
              <div className="field">
                <label>Slogan tai kuvaus (vapaaehtoinen)</label>
                <input className="input" placeholder="Esim. Viestintää vaikuttavasti" value={slogan} onChange={e => setSlogan(e.target.value)} />
              </div>
            </div>
          )}

          {currentStep === 'channels' && (
            <div style={{ animation: 'fadeUp .5s' }}>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '.35rem' }}>Viestintäkanavat</h2>
              <p style={{ color: 'var(--t3)', fontSize: '.85rem', marginBottom: '1.5rem' }}>Valitse kanavat joita organisaatiosi käyttää.</p>
              <div className="ch-grid">
                {defaultChannels.map(ch => (
                  <div key={ch.name} className={`ch-card ${selectedChannels.some(c => c.name === ch.name) ? 'on' : ''}`} onClick={() => toggleChannel(ch)}>
                    <span className="ch-icon" style={{ color: ch.color }}>{ch.ic}</span>
                    <div className="ch-info"><h4>{ch.name}</h4></div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {currentStep === 'goals' && (
            <div style={{ animation: 'fadeUp .5s' }}>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '.35rem' }}>Viestinnän tavoitteet</h2>
              <p style={{ color: 'var(--t3)', fontSize: '.85rem', marginBottom: '1.5rem' }}>Mitä viestinnällä halutaan saavuttaa? Voit lisätä myöhemmin.</p>
              {goals.map((g, i) => (
                <div key={i} style={{ display: 'flex', gap: '.5rem', marginBottom: '.6rem' }}>
                  <input className="input" placeholder={`Tavoite ${i + 1}, esim. "Kasvattaa tunnettuutta"`} value={g} onChange={e => { const n = [...goals]; n[i] = e.target.value; setGoals(n); }} />
                  {i === goals.length - 1 && goals.length < 5 && (
                    <button className="btn btn-ghost" onClick={() => setGoals([...goals, ''])} style={{ fontSize: '1.1rem' }}>+</button>
                  )}
                </div>
              ))}
              <p className="skip" onClick={goNext} style={{ marginTop: '.75rem' }}>Ohita tämä vaihe</p>
            </div>
          )}

          {currentStep === 'summary' && (
            <div style={{ animation: 'fadeUp .5s' }}>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '1rem' }}>Tarkista ja aloita</h2>

              <div style={{ background: 'var(--elev)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '1.25rem', marginBottom: '1rem' }}>
                <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{orgName}</div>
                {slogan && <div style={{ color: 'var(--t3)', fontSize: '.82rem', marginTop: '.2rem' }}>{slogan}</div>}
                <div style={{ marginTop: '.75rem', display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
                  {selectedChannels.map(ch => (
                    <span key={ch.name} style={{ padding: '.2rem .55rem', borderRadius: 9999, fontSize: '.72rem', fontWeight: 600, background: `${ch.color}18`, color: ch.color }}>{ch.name}</span>
                  ))}
                </div>
              </div>

              <div style={{ background: 'var(--elev)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '1.25rem', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem' }}>
                  <div className="ava" style={{ width: 36, height: 36, fontSize: '.8rem', background: 'var(--pri)' }}>{(displayName || 'K')[0]}</div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '.88rem' }}>{displayName}</div>
                    <div style={{ fontSize: '.72rem', color: 'var(--t3)' }}>{roles.find(r => r.id === selectedRole)?.label} / Tiimi: {teamSize}</div>
                  </div>
                </div>
              </div>

              {goals.filter(g => g.trim()).length > 0 && (
                <div style={{ background: 'var(--elev)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '1.25rem' }}>
                  <div style={{ fontSize: '.72rem', fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', marginBottom: '.5rem' }}>Tavoitteet</div>
                  {goals.filter(g => g.trim()).map((g, i) => (
                    <div key={i} style={{ fontSize: '.85rem', color: 'var(--t2)', padding: '.2rem 0' }}>- {g}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer nav */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '1.5rem', borderTop: '1px solid var(--border)' }}>
          {!isFirst ? (
            <button className="btn btn-ghost" onClick={goBack}>Takaisin</button>
          ) : <div />}
          {isLast ? (
            <button className="btn btn-primary btn-lg" onClick={handleFinish} disabled={saving}>
              {saving ? 'Luodaan...' : 'Aloita käyttö'}
            </button>
          ) : (
            <button className="btn btn-primary" onClick={goNext} disabled={!canNext()}>Seuraava</button>
          )}
        </div>
      </div>

      {/* ═══ RIGHT PANEL — gradient + context ═══ */}
      <div style={{
        width: 420, flexShrink: 0,
        background: 'linear-gradient(135deg, var(--pri-d) 0%, var(--hetki-pink) 50%, var(--hetki-yellow) 100%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '3rem', textAlign: 'center', position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'relative', zIndex: 1 }}>
          <h2 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#fff', marginBottom: '.75rem', lineHeight: 1.2 }}>
            {panel.title}
          </h2>
          <p style={{ fontSize: '.95rem', color: 'rgba(255,255,255,.85)', lineHeight: 1.6, maxWidth: 320 }}>
            {panel.subtitle}
          </p>
        </div>
        {/* Subtle decorative circles */}
        <div style={{ position: 'absolute', top: -60, right: -60, width: 200, height: 200, borderRadius: '50%', background: 'rgba(255,255,255,.06)' }} />
        <div style={{ position: 'absolute', bottom: -40, left: -40, width: 160, height: 160, borderRadius: '50%', background: 'rgba(255,255,255,.04)' }} />
      </div>
    </div>
  );
}
