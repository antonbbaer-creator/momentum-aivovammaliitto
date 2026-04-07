'use client';

import { useState } from 'react';
import AppShell from '@/components/AppShell';
import { useOrgData } from '@/lib/firestore';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { doc, setDoc, collection } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export default function StrategyPage() {
  const { user, activeOrg } = useAuth();
  const { toast } = useToast();
  const [org, setOrg] = useOrgData<any>('org', { name: '', goals: [], auds: [], vals: [], tone: [], strategyText: '' });
  const [submitText, setSubmitText] = useState('');
  const [submitFile, setSubmitFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleStrategySubmit = async () => {
    if (!submitText.trim() && !submitFile) return;
    setSubmitting(true);
    try {
      // Save submission to Firestore for Momentum team to review
      await setDoc(doc(collection(db, 'strategySubmissions')), {
        orgId: activeOrg,
        orgName: org.name || '',
        submittedBy: user?.uid,
        submitterName: user?.displayName || '',
        submitterEmail: user?.email || '',
        text: submitText.trim(),
        fileName: submitFile?.name || null,
        submittedAt: new Date().toISOString(),
        status: 'pending', // pending | reviewed | trained
      });
      // Also save the text to org's strategy if provided
      if (submitText.trim()) {
        setOrg((prev: any) => ({ ...prev, strategyText: submitText.trim() }));
      }
      setSubmitted(true);
      setSubmitText('');
      setSubmitFile(null);
      toast('Strategia lähetetty Momentum-tiimille!', 'success');
    } catch (e) {
      console.error('Submit error:', e);
      toast('Virhe lähetyksessä', 'error');
    } finally {
      setSubmitting(false);
    }
  };
  const [editSection, setEditSection] = useState<string | null>(null);
  const [tempText, setTempText] = useState('');
  const [newItem, setNewItem] = useState('');

  const startEdit = (section: string, value: string) => { setEditSection(section); setTempText(value); };
  const saveText = (field: string) => { setOrg((prev: any) => ({ ...prev, [field]: tempText })); setEditSection(null); };

  const addGoal = () => { if (!newItem.trim()) return; setOrg((prev: any) => ({ ...prev, goals: [...(prev.goals || []), { t: newItem.trim(), p: (prev.goals?.length || 0) + 1 }] })); setNewItem(''); };
  const removeGoal = (i: number) => setOrg((prev: any) => ({ ...prev, goals: prev.goals.filter((_: any, j: number) => j !== i) }));
  const addAud = () => { if (!newItem.trim()) return; setOrg((prev: any) => ({ ...prev, auds: [...(prev.auds || []), { n: newItem.trim() }] })); setNewItem(''); };
  const removeAud = (i: number) => setOrg((prev: any) => ({ ...prev, auds: prev.auds.filter((_: any, j: number) => j !== i) }));
  const addVal = () => { if (!newItem.trim()) return; setOrg((prev: any) => ({ ...prev, vals: [...(prev.vals || []), { t: newItem.trim() }] })); setNewItem(''); };
  const removeVal = (i: number) => setOrg((prev: any) => ({ ...prev, vals: prev.vals.filter((_: any, j: number) => j !== i) }));
  const addTone = () => { if (!newItem.trim()) return; setOrg((prev: any) => ({ ...prev, tone: [...(prev.tone || []), newItem.trim()] })); setNewItem(''); };
  const removeTone = (i: number) => setOrg((prev: any) => ({ ...prev, tone: prev.tone.filter((_: any, j: number) => j !== i) }));

  const Section = ({ title, items, field, nameKey, onAdd, onRemove }: { title: string; items: any[]; field: string; nameKey: string; onAdd: () => void; onRemove: (i: number) => void }) => (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', marginBottom: '1.25rem' }}>
      <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '.88rem', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.02em' }}>{title}</h3>
        <span style={{ fontSize: '.72rem', color: 'var(--t3)' }}>{items.length}</span>
      </div>
      <div style={{ padding: '1.25rem 1.5rem' }}>
        {items.map((item: any, i: number) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '.6rem .75rem', background: 'var(--elev)', border: '1px solid var(--border)', borderRadius: 'var(--r)', marginBottom: '.4rem' }}>
            <span style={{ fontSize: '.88rem' }}>{typeof item === 'string' ? item : item[nameKey]}</span>
            <button className="btn btn-ghost btn-sm" onClick={() => onRemove(i)} style={{ color: 'var(--t3)', fontSize: '.7rem' }}>{'\u00d7'}</button>
          </div>
        ))}
        <div style={{ display: 'flex', gap: '.5rem', marginTop: '.75rem' }}>
          <input className="input" placeholder={`Lisää ${title.toLowerCase()}...`} value={editSection === field ? newItem : ''} onFocus={() => setEditSection(field)} onChange={e => setNewItem(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') onAdd(); }} style={{ flex: 1 }} />
          <button className="btn btn-primary btn-sm" onClick={onAdd} disabled={!newItem.trim()}>+</button>
        </div>
      </div>
    </div>
  );

  return (
    <AppShell title="Strategia" subtitle={org.slogan || 'Viestinnän strategia'}>
      {/* Strategy text */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', marginBottom: '1.25rem' }}>
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '.88rem', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.02em' }}>Viestintästrategia</h3>
          {editSection !== 'strategyText' && <button className="btn btn-ghost btn-sm" onClick={() => startEdit('strategyText', org.strategyText || '')}>Muokkaa</button>}
        </div>
        <div style={{ padding: '1.25rem 1.5rem' }}>
          {editSection === 'strategyText' ? (
            <div>
              <textarea className="input textarea-lg" value={tempText} onChange={e => setTempText(e.target.value)} placeholder="Kuvaile organisaatiosi viestintästrategiaa..." />
              <div style={{ display: 'flex', gap: '.5rem', marginTop: '.75rem' }}>
                <button className="btn btn-primary btn-sm" onClick={() => saveText('strategyText')}>Tallenna</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setEditSection(null)}>Peruuta</button>
              </div>
            </div>
          ) : (
            <p style={{ color: org.strategyText ? 'var(--t2)' : 'var(--t3)', lineHeight: 1.7, fontSize: '.9rem' }}>
              {org.strategyText || 'Ei vielä strategiakuvausta. Klikkaa "Muokkaa" lisätäksesi.'}
            </p>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
        <Section title="Tavoitteet" items={org.goals || []} field="goals" nameKey="t" onAdd={addGoal} onRemove={removeGoal} />
        <Section title="Kohderyhmät" items={org.auds || []} field="auds" nameKey="n" onAdd={addAud} onRemove={removeAud} />
        <Section title="Brändiarvot" items={org.vals || []} field="vals" nameKey="t" onAdd={addVal} onRemove={removeVal} />
        <Section title="Sävyt" items={org.tone || []} field="tone" nameKey="" onAdd={addTone} onRemove={removeTone} />
      </div>

      {/* ═══ SUBMIT STRATEGY TO MOMENTUM TEAM ═══ */}
      <div style={{ marginTop: '2rem', background: 'linear-gradient(135deg, rgba(5,107,159,.06), rgba(228,92,129,.04))', border: '1px solid rgba(5,107,159,.15)', borderRadius: 'var(--rl)', overflow: 'hidden' }}>
        <div style={{ padding: '1.5rem 1.75rem', borderBottom: '1px solid rgba(5,107,159,.1)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem', marginBottom: '.35rem' }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--pri)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '.7rem', fontWeight: 700, fontFamily: 'var(--font-display)' }}>AI</div>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '.95rem', fontWeight: 500, letterSpacing: '.02em' }}>Kouluta AI tuntemaan strategiasi</h3>
          </div>
          <p style={{ fontSize: '.82rem', color: 'var(--t2)', lineHeight: 1.6 }}>
            Lähetä viestintästrategiasi Momentum-tiimille. Koulutamme tekoälyavustajasi tuntemaan organisaatiosi strategian, kohderyhmät, sävyn ja tavoitteet — niin AI osaa sparrata viestintääsi kontekstitietoisesti.
          </p>
        </div>
        <div style={{ padding: '1.5rem 1.75rem' }}>
          {submitted ? (
            <div style={{ textAlign: 'center', padding: '1.5rem' }}>
              <div style={{ fontSize: '1.5rem', marginBottom: '.75rem', color: 'var(--green)' }}>{'\u2713'}</div>
              <h4 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '.5rem' }}>Strategia lähetetty!</h4>
              <p style={{ fontSize: '.85rem', color: 'var(--t2)', lineHeight: 1.6 }}>
                Momentum-tiimi käsittelee strategiasi ja kouluttaa AI-avustajasi. Saat ilmoituksen kun AI on valmis.
              </p>
              <button className="btn btn-ghost" onClick={() => setSubmitted(false)} style={{ marginTop: '1rem' }}>Lähetä uusi versio</button>
            </div>
          ) : (
            <>
              <div className="field">
                <label>Viestintästrategia</label>
                <textarea className="input textarea-lg" value={submitText} onChange={e => setSubmitText(e.target.value)}
                  placeholder="Liitä tähän organisaatiosi viestintästrategia, brändiohjeistus, kohderyhmäkuvaukset tai muu materiaali jonka haluat AI:n tuntevan. Mitä tarkempi kuvaus, sitä paremmin AI osaa auttaa."
                  style={{ minHeight: 200 }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <p style={{ fontSize: '.72rem', color: 'var(--t3)', maxWidth: 360 }}>
                  Strategia tallennetaan myös yllä olevaan strategiakenttään ja on tiimisi nähtävillä.
                </p>
                <button className="btn btn-primary" onClick={handleStrategySubmit} disabled={submitting || (!submitText.trim())}>
                  {submitting ? 'Lähetetään...' : 'Lähetä Momentum-tiimille'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}
