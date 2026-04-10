'use client';

import { useState } from 'react';
import AppShell from '@/components/AppShell';
import { useOrgData } from '@/lib/firestore';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { doc, setDoc, collection } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export default function StrategyPage() {
  const { user, activeOrg, canEdit } = useAuth();
  const { toast } = useToast();
  const [org, setOrg] = useOrgData<any>('org', {});
  const [teamData] = useOrgData<any[]>('teamMembers', []);
  const [tab, setTab] = useState<'strategy' | 'plan'>('strategy');
  const [editSection, setEditSection] = useState<string | null>(null);
  const [tempText, setTempText] = useState('');
  const [newItem, setNewItem] = useState('');
  const [submitText, setSubmitText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const startEdit = (section: string, value: string) => { setEditSection(section); setTempText(value); };
  const saveText = (field: string) => { setOrg((prev: any) => ({ ...prev, [field]: tempText })); setEditSection(null); toast('Tallennettu', 'success'); };
  const saveNested = (parent: string, field: string) => { setOrg((prev: any) => ({ ...prev, [parent]: { ...prev[parent], [field]: tempText } })); setEditSection(null); toast('Tallennettu', 'success'); };
  const addToList = (field: string, item: any) => { setOrg((prev: any) => ({ ...prev, [field]: [...(prev[field] || []), item] })); setNewItem(''); };
  const removeFromList = (field: string, i: number) => { setOrg((prev: any) => ({ ...prev, [field]: prev[field].filter((_: any, j: number) => j !== i) })); };

  const handleStrategySubmit = async () => {
    if (!submitText.trim()) return;
    setSubmitting(true);
    try {
      await setDoc(doc(collection(db, 'strategySubmissions')), {
        orgId: activeOrg, orgName: org.name || '', submittedBy: user?.uid,
        submitterName: user?.displayName || '', submitterEmail: user?.email || '',
        text: submitText.trim(), submittedAt: new Date().toISOString(), status: 'pending',
      });
      setOrg((prev: any) => ({ ...prev, strategyText: submitText.trim() }));
      setSubmitted(true); setSubmitText('');
      toast('Strategia lähetetty Momentum-tiimille!', 'success');
    } catch (e) { toast('Virhe lähetyksessä', 'error'); }
    finally { setSubmitting(false); }
  };

  const orgStrategy = org.orgStrategy || {};
  const contentPillars = org.contentPillars || [];
  const currentCtx = org.currentContext || {};
  const channels = org.channels || [];

  // Editable text block helper
  const EditableBlock = ({ label, color, sectionKey, value, parentKey }: { label: string; color: string; sectionKey: string; value: string; parentKey?: string }) => (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '1.5rem' }}>
      <h3 style={{ fontSize: '.72rem', fontWeight: 600, color, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: '.75rem' }}>{label}</h3>
      {editSection === sectionKey ? (
        <div>
          <textarea className="input textarea" value={tempText} onChange={e => setTempText(e.target.value)} style={{ minHeight: 80 }} />
          <div style={{ display: 'flex', gap: '.5rem', marginTop: '.5rem' }}>
            <button className="btn btn-primary btn-sm" onClick={() => parentKey ? saveNested(parentKey, sectionKey.split('.')[1] || sectionKey) : saveText(sectionKey)}>Tallenna</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setEditSection(null)}>Peruuta</button>
          </div>
        </div>
      ) : (
        <p style={{ color: value ? 'var(--t2)' : 'var(--t3)', fontSize: '.88rem', lineHeight: 1.7, cursor: canEdit ? 'pointer' : 'default' }}
          onClick={() => canEdit && startEdit(sectionKey, value || '')}>{value || 'Klikkaa lisätäksesi...'}</p>
      )}
    </div>
  );

  return (
    <AppShell title="Strategia" subtitle={org.name || ''}>

      {/* Tab switcher */}
      <div style={{ display: 'flex', background: 'var(--elev)', borderRadius: 'var(--r)', padding: '3px', marginBottom: '1.5rem', width: 'fit-content' }}>
        <button className={`cal-view-btn ${tab === 'strategy' ? 'act' : ''}`} onClick={() => setTab('strategy')}>Strategia</button>
        <button className={`cal-view-btn ${tab === 'plan' ? 'act' : ''}`} onClick={() => setTab('plan')}>Viestintäsuunnitelma</button>
      </div>

      {/* ═══════════════════════════════════════════════════════════
          TAB 1: STRATEGIA
          ═══════════════════════════════════════════════════════════ */}
      {tab === 'strategy' && (
        <>
          {/* Organisaation strategia */}
          <div style={{ marginBottom: '2rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '1rem' }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--pri)' }} />
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '.72rem', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--t3)' }}>Organisaation strategia {orgStrategy.strategicPeriod || ''}</h2>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <EditableBlock label="Missio" color="var(--pri-l)" sectionKey="orgStrategy.mission" value={orgStrategy.mission} parentKey="orgStrategy" />
              <EditableBlock label="Visio" color="var(--pri-l)" sectionKey="orgStrategy.vision" value={orgStrategy.vision} parentKey="orgStrategy" />
            </div>
            {orgStrategy.values?.length > 0 && (
              <div style={{ display: 'flex', gap: '.75rem', marginTop: '1rem', flexWrap: 'wrap' }}>
                {orgStrategy.values.map((v: any, i: number) => (
                  <div key={i} style={{ flex: '1 1 200px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '1rem 1.25rem' }}>
                    <div style={{ fontSize: '.88rem', fontWeight: 700 }}>{v.name}</div>
                    <div style={{ fontSize: '.75rem', color: 'var(--t3)', marginTop: '.2rem' }}>{v.desc}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Viestinnän missio */}
          <div style={{ marginBottom: '2rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '1rem' }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)' }} />
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '.72rem', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--t3)' }}>Viestinnän strategia</h2>
            </div>
            <div style={{ background: 'linear-gradient(135deg, rgba(5,107,159,.06), rgba(24,94,91,.04))', border: '1px solid rgba(5,107,159,.15)', borderRadius: 'var(--rl)', padding: '1.5rem', marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '.72rem', fontWeight: 600, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: '.5rem' }}>Viestinnän missio</h3>
              {editSection === 'commsMission' ? (
                <div>
                  <textarea className="input textarea" value={tempText} onChange={e => setTempText(e.target.value)} />
                  <div style={{ display: 'flex', gap: '.5rem', marginTop: '.5rem' }}>
                    <button className="btn btn-primary btn-sm" onClick={() => saveText('commsMission')}>Tallenna</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditSection(null)}>Peruuta</button>
                  </div>
                </div>
              ) : (
                <p style={{ fontSize: '.95rem', fontWeight: 500, color: 'var(--t1)', lineHeight: 1.7, cursor: canEdit ? 'pointer' : 'default' }} onClick={() => canEdit && startEdit('commsMission', org.commsMission || '')}>
                  {org.commsMission || 'Klikkaa määritelläksesi viestinnän missio...'}
                </p>
              )}
            </div>

            {/* Sisältöpilarit */}
            {contentPillars.length > 0 && (
              <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', marginBottom: '1.25rem' }}>
                <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)' }}>
                  <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '.88rem', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.02em' }}>Sisältöpilarit</h3>
                </div>
                <div style={{ padding: '1.25rem 1.5rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '.75rem' }}>
                  {contentPillars.map((cp: any, i: number) => (
                    <div key={i} style={{ padding: '1.25rem', borderRadius: 'var(--r)', background: 'var(--elev)', borderLeft: `4px solid ${cp.color || 'var(--pri)'}` }}>
                      <div style={{ fontSize: '.88rem', fontWeight: 700, marginBottom: '.35rem' }}>{cp.name}</div>
                      <div style={{ fontSize: '.75rem', color: 'var(--t3)', lineHeight: 1.6 }}>{cp.desc}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Kohderyhmät ja tavoitteet */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.25rem' }}>
              {/* Kohderyhmät */}
              <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)' }}>
                <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
                  <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '.88rem', fontWeight: 500, textTransform: 'uppercase' }}>Kohderyhmät</h3>
                  <span style={{ fontSize: '.72rem', color: 'var(--t3)' }}>{(org.auds || []).length}</span>
                </div>
                <div style={{ padding: '1.25rem 1.5rem' }}>
                  {(org.auds || []).map((a: any, i: number) => (
                    <div key={i} style={{ padding: '.6rem .75rem', background: 'var(--elev)', border: '1px solid var(--border)', borderRadius: 'var(--r)', marginBottom: '.4rem' }}>
                      <div style={{ fontSize: '.85rem', fontWeight: 600 }}>{a.n}</div>
                      {a.d && <div style={{ fontSize: '.72rem', color: 'var(--t3)', marginTop: '.15rem' }}>{a.d}</div>}
                      {a.c?.length > 0 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.2rem', marginTop: '.3rem' }}>
                        {a.c.map((ch: string, j: number) => { const channel = channels.find((c: any) => c.name === ch); return <span key={j} style={{ fontSize: '.55rem', padding: '.1rem .35rem', borderRadius: 9999, background: `${channel?.color || '#666'}18`, color: channel?.color || 'var(--t3)', fontWeight: 600 }}>{ch}</span>; })}
                      </div>}
                    </div>
                  ))}
                </div>
              </div>

              {/* Sävyt + arvot */}
              <div>
                <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '1.25rem 1.5rem', marginBottom: '1.25rem' }}>
                  <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '.88rem', fontWeight: 500, textTransform: 'uppercase', marginBottom: '.75rem' }}>Viestinnän sävyt</h3>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.4rem' }}>
                    {(org.tone || []).map((t: string, i: number) => (
                      <span key={i} style={{ fontSize: '.78rem', padding: '.35rem .75rem', borderRadius: 9999, background: 'var(--elev)', border: '1px solid var(--border)', fontWeight: 600 }}>{t}</span>
                    ))}
                  </div>
                </div>
                <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '1.25rem 1.5rem' }}>
                  <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '.88rem', fontWeight: 500, textTransform: 'uppercase', marginBottom: '.75rem' }}>Viestinnän arvot</h3>
                  {(org.vals || []).map((v: any, i: number) => (
                    <div key={i} style={{ padding: '.4rem 0', borderBottom: '1px solid var(--border)' }}>
                      <span style={{ fontSize: '.85rem', fontWeight: 600 }}>{v.t}</span>
                      {v.d && <span style={{ fontSize: '.72rem', color: 'var(--t3)', marginLeft: '.5rem' }}>{v.d}</span>}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Ydinviestit */}
            {org.keyMessages?.length > 0 && (
              <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', marginBottom: '1.25rem' }}>
                <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)' }}>
                  <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '.88rem', fontWeight: 500, textTransform: 'uppercase' }}>Ydinviestit</h3>
                </div>
                <div style={{ padding: '1.25rem 1.5rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem' }}>
                  {org.keyMessages.map((m: any, i: number) => (
                    <div key={i} style={{ padding: '1rem', background: 'var(--elev)', border: '1px solid var(--border)', borderRadius: 'var(--r)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '.35rem' }}>
                        <div style={{ fontSize: '.85rem', fontWeight: 700 }}>{m.title}</div>
                        <span style={{ fontSize: '.55rem', padding: '.1rem .4rem', borderRadius: 4, background: 'rgba(5,107,159,.1)', color: 'var(--pri-l)', fontWeight: 600 }}>{m.theme}</span>
                      </div>
                      <div style={{ fontSize: '.75rem', color: 'var(--t3)', lineHeight: 1.6 }}>{m.desc}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tilannekuva */}
            {(currentCtx.expansion || currentCtx.steaCuts || currentCtx.nameChange) && (
              <div style={{ background: 'rgba(241,180,52,.04)', border: '1px solid rgba(241,180,52,.15)', borderRadius: 'var(--rl)', padding: '1.25rem 1.5rem', marginBottom: '1.25rem' }}>
                <h3 style={{ fontSize: '.72rem', fontWeight: 600, color: 'var(--yellow)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: '.75rem' }}>Ajankohtaista 2026</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
                  {currentCtx.expansion && <div style={{ fontSize: '.82rem', color: 'var(--t2)', lineHeight: 1.6 }}><strong>Laajennus:</strong> {currentCtx.expansion}</div>}
                  {currentCtx.nameChange && <div style={{ fontSize: '.82rem', color: 'var(--t2)', lineHeight: 1.6 }}><strong>Nimenmuutos:</strong> {currentCtx.nameChange}</div>}
                  {currentCtx.steaCuts && <div style={{ fontSize: '.82rem', color: 'var(--t2)', lineHeight: 1.6 }}><strong>Rahoitus:</strong> {currentCtx.steaCuts}</div>}
                  {currentCtx.accessibility && <div style={{ fontSize: '.82rem', color: 'var(--t2)', lineHeight: 1.6 }}><strong>Saavutettavuus:</strong> {currentCtx.accessibility}</div>}
                  {currentCtx.elections2027 && <div style={{ fontSize: '.82rem', color: 'var(--t2)', lineHeight: 1.6 }}><strong>Vaikuttaminen:</strong> {currentCtx.elections2027}</div>}
                </div>
              </div>
            )}

            {/* AI-koulutus */}
            <div style={{ background: 'linear-gradient(135deg, rgba(5,107,159,.06), rgba(228,92,129,.04))', border: '1px solid rgba(5,107,159,.15)', borderRadius: 'var(--rl)', overflow: 'hidden' }}>
              <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid rgba(5,107,159,.1)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem', marginBottom: '.25rem' }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--pri)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '.6rem', fontWeight: 700, fontFamily: 'var(--font-display)' }}>M</div>
                  <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '.88rem', fontWeight: 500 }}>Kouluta Momentum tuntemaan strategiasi</h3>
                </div>
                <p style={{ fontSize: '.78rem', color: 'var(--t2)', lineHeight: 1.6 }}>Lähetä strategiasi Momentum-tiimille niin koulutamme AI-kumppanisi tuntemaan sen.</p>
              </div>
              <div style={{ padding: '1.25rem 1.5rem' }}>
                {submitted ? (
                  <div style={{ textAlign: 'center', padding: '1rem' }}>
                    <div style={{ color: 'var(--green)', fontSize: '1.2rem', marginBottom: '.5rem' }}>{'✓'}</div>
                    <p style={{ fontSize: '.85rem', fontWeight: 600 }}>Lähetetty!</p>
                    <button className="btn btn-ghost btn-sm" onClick={() => setSubmitted(false)} style={{ marginTop: '.5rem' }}>Lähetä uusi</button>
                  </div>
                ) : (
                  <>
                    <textarea className="input textarea-lg" value={submitText} onChange={e => setSubmitText(e.target.value)} placeholder="Liitä strategia tähän..." style={{ minHeight: 120, marginBottom: '.75rem' }} />
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button className="btn btn-primary" onClick={handleStrategySubmit} disabled={submitting || !submitText.trim()}>{submitting ? 'Lähetetään...' : 'Lähetä'}</button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════
          TAB 2: VIESTINTÄSUUNNITELMA
          ═══════════════════════════════════════════════════════════ */}
      {tab === 'plan' && (
        <>
          {/* Viestintäsuunnitelma teksti */}
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', marginBottom: '1.5rem' }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '.88rem', fontWeight: 500, textTransform: 'uppercase' }}>Viestintäsuunnitelma</h3>
              {editSection !== 'strategyText' && canEdit && <button className="btn btn-ghost btn-sm" onClick={() => startEdit('strategyText', org.strategyText || '')}>Muokkaa</button>}
            </div>
            <div style={{ padding: '1.25rem 1.5rem' }}>
              {editSection === 'strategyText' ? (
                <div>
                  <textarea className="input textarea-lg" value={tempText} onChange={e => setTempText(e.target.value)} style={{ minHeight: 200 }} />
                  <div style={{ display: 'flex', gap: '.5rem', marginTop: '.75rem' }}>
                    <button className="btn btn-primary btn-sm" onClick={() => saveText('strategyText')}>Tallenna</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditSection(null)}>Peruuta</button>
                  </div>
                </div>
              ) : (
                <p style={{ color: org.strategyText ? 'var(--t2)' : 'var(--t3)', lineHeight: 1.8, fontSize: '.88rem', whiteSpace: 'pre-wrap' }}>
                  {org.strategyText || 'Lisää viestintäsuunnitelma klikkaamalla "Muokkaa".'}
                </p>
              )}
            </div>
          </div>

          {/* Kanavakohtainen suunnitelma — kuka vastaa ja mistä */}
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', marginBottom: '1.5rem' }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '.88rem', fontWeight: 500, textTransform: 'uppercase' }}>Kanavat ja vastuut</h3>
              <p style={{ fontSize: '.72rem', color: 'var(--t3)', marginTop: '.15rem' }}>Kuka vastaa mistäkin kanavasta ja mitä siellä julkaistaan</p>
            </div>
            <div style={{ padding: '1.25rem 1.5rem' }}>
              {channels.map((ch: any, i: number) => {
                // Find team members responsible for this channel
                const responsible = teamData.filter(m => (m.channels || []).includes(ch.name));
                // Find matching goal
                const goal = (org.goals || []).find((g: any) => g.t?.toLowerCase().includes(ch.name.toLowerCase()));
                return (
                  <div key={i} style={{ padding: '1rem', background: 'var(--elev)', border: '1px solid var(--border)', borderRadius: 'var(--r)', marginBottom: '.75rem', borderLeft: `4px solid ${ch.color}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '.5rem' }}>
                      <div>
                        <div style={{ fontSize: '.95rem', fontWeight: 700 }}>{ch.name}</div>
                        {goal?.m && <span style={{ fontSize: '.65rem', padding: '.15rem .4rem', borderRadius: 4, background: 'rgba(5,107,159,.1)', color: 'var(--pri-l)', fontWeight: 600 }}>{goal.m}</span>}
                      </div>
                      <span style={{ width: 28, height: 28, borderRadius: 'var(--r)', background: `${ch.color}20`, color: ch.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.65rem', fontWeight: 700, fontFamily: 'var(--font-display)' }}>{ch.ic}</span>
                    </div>
                    {goal?.d && <div style={{ fontSize: '.78rem', color: 'var(--t2)', lineHeight: 1.6, marginBottom: '.5rem' }}>{goal.d}</div>}
                    {responsible.length > 0 && (
                      <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
                        {responsible.map((m: any) => (
                          <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '.35rem', fontSize: '.72rem', padding: '.2rem .5rem', background: 'var(--card)', borderRadius: 9999, border: '1px solid var(--border)' }}>
                            <div className="ava" style={{ width: 18, height: 18, fontSize: '.5rem' }}>{m.avatar}</div>
                            <span style={{ fontWeight: 600 }}>{m.name}</span>
                            <span style={{ color: 'var(--t3)' }}>{m.role}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {responsible.length === 0 && <div style={{ fontSize: '.72rem', color: 'var(--t3)', fontStyle: 'italic' }}>Ei vastuuhenkilöä määritelty</div>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Tavoitteet yksityiskohtaisesti */}
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', marginBottom: '1.5rem' }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '.88rem', fontWeight: 500, textTransform: 'uppercase' }}>Tavoitteet ja mittarit</h3>
              <span style={{ fontSize: '.72rem', color: 'var(--t3)' }}>{(org.goals || []).length}</span>
            </div>
            <div style={{ padding: '1.25rem 1.5rem' }}>
              {(org.goals || []).map((g: any, i: number) => (
                <div key={i} style={{ padding: '1rem', background: 'var(--elev)', border: '1px solid var(--border)', borderRadius: 'var(--r)', marginBottom: '.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '.5rem', marginBottom: '.35rem' }}>
                    {g.m && <span style={{ fontSize: '.65rem', padding: '.15rem .5rem', borderRadius: 4, background: 'rgba(5,107,159,.1)', color: 'var(--pri-l)', fontWeight: 700, whiteSpace: 'nowrap' }}>{g.m}</span>}
                    <div style={{ fontSize: '.88rem', fontWeight: 700 }}>{g.t}</div>
                  </div>
                  {g.d && <div style={{ fontSize: '.78rem', color: 'var(--t2)', lineHeight: 1.6 }}>{g.d}</div>}
                </div>
              ))}
              {canEdit && (
                <div style={{ display: 'flex', gap: '.5rem', marginTop: '.75rem' }}>
                  <input className="input" placeholder="Lisää tavoite..." value={editSection === 'goals' ? newItem : ''} onFocus={() => setEditSection('goals')} onChange={e => setNewItem(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && newItem.trim()) addToList('goals', { t: newItem.trim(), p: (org.goals?.length || 0) + 1 }); }} style={{ flex: 1 }} />
                  <button className="btn btn-primary btn-sm" onClick={() => { if (newItem.trim()) addToList('goals', { t: newItem.trim(), p: (org.goals?.length || 0) + 1 }); }} disabled={!newItem.trim()}>+</button>
                </div>
              )}
            </div>
          </div>

          {/* Kampanjat */}
          {org.campaigns?.length > 0 && (
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)' }}>
              <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '.88rem', fontWeight: 500, textTransform: 'uppercase' }}>Vuosittaiset kampanjat</h3>
              </div>
              <div style={{ padding: '1.25rem 1.5rem' }}>
                {org.campaigns.map((c: any, i: number) => (
                  <div key={i} style={{ display: 'flex', gap: '1rem', padding: '.75rem', background: 'var(--elev)', border: '1px solid var(--border)', borderRadius: 'var(--r)', marginBottom: '.5rem' }}>
                    {c.month && <div style={{ width: 44, height: 44, borderRadius: 'var(--r)', background: 'rgba(5,107,159,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.7rem', fontWeight: 700, color: 'var(--pri-l)', flexShrink: 0, fontFamily: 'var(--font-display)' }}>
                      {['', 'Tam', 'Hel', 'Maa', 'Huh', 'Tou', 'Kes', 'Hei', 'Elo', 'Syy', 'Lok', 'Mar', 'Jou'][c.month] || ''}
                    </div>}
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '.88rem', fontWeight: 600 }}>{c.name}</div>
                      <div style={{ fontSize: '.72rem', color: 'var(--t3)', lineHeight: 1.5, marginTop: '.15rem' }}>{c.desc}</div>
                      {c.channels?.length > 0 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.2rem', marginTop: '.35rem' }}>
                        {c.channels.map((ch: string, j: number) => <span key={j} style={{ fontSize: '.55rem', padding: '.1rem .35rem', borderRadius: 4, background: 'var(--bg)', color: 'var(--t3)', fontWeight: 600 }}>{ch}</span>)}
                      </div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}
