'use client';

import { useState } from 'react';
import AppShell from '@/components/AppShell';
import { useOrgData } from '@/lib/firestore';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { doc, setDoc, collection } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useIsMobile } from '@/lib/use-mobile';
import { useParams } from 'next/navigation';
const Q_COLORS = ['#056b9f', '#185e5b', '#f1b434', '#e45c81'];

export default function StrategyPage() {
  const { user, activeOrg, canEdit } = useAuth();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const orgSlug = (useParams().orgSlug as string) || '';
  const [org, setOrg] = useOrgData<any>('org', {});
  const [editSection, setEditSection] = useState<string | null>(null);
  const [tempText, setTempText] = useState('');
  const [submitText, setSubmitText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const startEdit = (section: string, value: string) => { setEditSection(section); setTempText(value); };
  const saveText = (field: string) => { setOrg((prev: any) => ({ ...prev, [field]: tempText })); setEditSection(null); toast('Tallennettu', 'success'); };
  const saveNested = (parent: string, field: string) => { setOrg((prev: any) => ({ ...prev, [parent]: { ...prev[parent], [field]: tempText } })); setEditSection(null); toast('Tallennettu', 'success'); };

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
  const coreRoles = org.commsCoreRoles || org.contentPillars || [];
  const currentCtx = org.currentContext || {};
  const channels = org.channels || [];
  const auds = org.auds || [];

  // Editable text block
  const EditableBlock = ({ label, color, sectionKey, value, parentKey }: { label: string; color: string; sectionKey: string; value: string; parentKey?: string }) => (
    <div>
      <h3 style={{ fontSize: '.65rem', fontWeight: 600, color, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '.5rem' }}>{label}</h3>
      {editSection === sectionKey ? (
        <div>
          <textarea className="input textarea" value={tempText} onChange={e => setTempText(e.target.value)} style={{ minHeight: 80 }} />
          <div style={{ display: 'flex', gap: '.5rem', marginTop: '.5rem' }}>
            <button className="btn btn-primary btn-sm" onClick={() => parentKey ? saveNested(parentKey, sectionKey.split('.')[1] || sectionKey) : saveText(sectionKey)}>Tallenna</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setEditSection(null)}>Peruuta</button>
          </div>
        </div>
      ) : (
        <p style={{ color: value ? 'var(--t1)' : 'var(--t3)', fontSize: '.92rem', lineHeight: 1.8, cursor: canEdit ? 'pointer' : 'default' }}
          onClick={() => canEdit && startEdit(sectionKey, value || '')}>{value || 'Klikkaa lisataksesi...'}</p>
      )}
    </div>
  );

  return (
    <AppShell title="Strategia" subtitle={org.name || ''}>

      {/* ═══════════════════════════════════════════════════════════
          STRATEGIA
          ═══════════════════════════════════════════════════════════ */}
          {/* ── Missio ja visio hero ── */}
          <div style={{ background: 'linear-gradient(135deg, rgba(5,107,159,.06), rgba(24,94,91,.04))', border: '1px solid rgba(5,107,159,.12)', borderRadius: 'var(--rl)', padding: isMobile ? '1.5rem' : '2rem 2.5rem', marginBottom: '1.5rem' }}>
            {orgStrategy.strategicPeriod && <div style={{ fontSize: '.6rem', fontWeight: 700, color: 'var(--pri-l)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: '1rem', fontFamily: 'var(--font-display)' }}>Strategia {orgStrategy.strategicPeriod}</div>}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? '1.5rem' : '2.5rem' }}>
              <EditableBlock label="Missio" color="var(--pri-l)" sectionKey="orgStrategy.mission" value={orgStrategy.mission} parentKey="orgStrategy" />
              <EditableBlock label="Visio" color="var(--green)" sectionKey="orgStrategy.vision" value={orgStrategy.vision} parentKey="orgStrategy" />
            </div>
            {orgStrategy.values?.length > 0 && (
              <div style={{ display: 'flex', gap: '.5rem', marginTop: '1.25rem', flexWrap: 'wrap' }}>
                {orgStrategy.values.map((v: any, i: number) => (
                  <div key={i} style={{ padding: '.5rem 1rem', background: 'rgba(255,255,255,.04)', border: '1px solid var(--border)', borderRadius: 9999 }}>
                    <span style={{ fontSize: '.78rem', fontWeight: 700 }}>{v.name}</span>
                    <span style={{ fontSize: '.68rem', color: 'var(--t3)', marginLeft: '.4rem' }}>{v.desc}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Viestinnan missio ── */}
          {(org.commsMission || canEdit) && (
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '1.5rem', marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '.65rem', fontWeight: 600, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '.5rem' }}>Viestinnan missio</div>
              {editSection === 'commsMission' ? (
                <div>
                  <textarea className="input textarea" value={tempText} onChange={e => setTempText(e.target.value)} />
                  <div style={{ display: 'flex', gap: '.5rem', marginTop: '.5rem' }}>
                    <button className="btn btn-primary btn-sm" onClick={() => saveText('commsMission')}>Tallenna</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditSection(null)}>Peruuta</button>
                  </div>
                </div>
              ) : (
                <p style={{ fontSize: '.92rem', fontWeight: 500, color: 'var(--t1)', lineHeight: 1.8, cursor: canEdit ? 'pointer' : 'default' }} onClick={() => canEdit && startEdit('commsMission', org.commsMission || '')}>
                  {org.commsMission || 'Klikkaa maaritelläksesi viestinnan missio...'}
                </p>
              )}
            </div>
          )}

          {/* ── Perustehtavat ── */}
          {coreRoles.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '.72rem', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--t3)', marginBottom: '1rem' }}>{org.commsCoreRoles ? 'Viestinnan perustehtavat' : 'Sisaltopilarit'}</h2>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : `repeat(${Math.min(coreRoles.length, 4)}, 1fr)`, gap: '.75rem' }}>
                {coreRoles.map((cp: any, i: number) => (
                  <div key={i} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '1.25rem', position: 'relative', overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: cp.color || 'var(--pri)' }} />
                    <div style={{ fontSize: '.85rem', fontWeight: 700, marginBottom: '.4rem', marginTop: '.25rem' }}>{cp.name}</div>
                    <div style={{ fontSize: '.72rem', color: 'var(--t3)', lineHeight: 1.65 }}>{cp.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Kohderyhmat ── */}
          {auds.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '.72rem', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--t3)', marginBottom: '1rem' }}>Kohderyhmat</h2>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '.75rem' }}>
                {auds.map((a: any, i: number) => (
                  <div key={i} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '1.25rem' }}>
                    <div style={{ fontSize: '.88rem', fontWeight: 700, marginBottom: '.3rem' }}>{a.n}</div>
                    <div style={{ fontSize: '.75rem', color: 'var(--t2)', lineHeight: 1.6, marginBottom: '.4rem' }}>{a.d}</div>
                    {a.tone && (
                      <div style={{ fontSize: '.68rem', fontStyle: 'italic', color: 'var(--pri-l)', marginBottom: '.5rem' }}>Savy: {a.tone}</div>
                    )}
                    {a.c?.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.2rem' }}>
                        {a.c.map((ch: string, j: number) => {
                          const channel = channels.find((c: any) => c.name === ch);
                          return <span key={j} style={{ fontSize: '.55rem', padding: '.12rem .35rem', borderRadius: 9999, background: `${channel?.color || '#666'}15`, color: channel?.color || 'var(--t3)', fontWeight: 600 }}>{ch}</span>;
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Viestinnan arvot ── */}
          {org.vals?.length > 0 && (
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '1.25rem 1.5rem', marginBottom: '1.5rem' }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '.72rem', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--t3)', marginBottom: '.75rem' }}>Viestinnan arvot</h2>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem' }}>
                {org.vals.map((v: any, i: number) => {
                  const color = Q_COLORS[i % Q_COLORS.length];
                  return (
                    <div key={i} style={{ padding: '.5rem 1rem', background: `${color}10`, border: `1px solid ${color}25`, borderRadius: 9999 }}>
                      <span style={{ fontSize: '.82rem', fontWeight: 700, color }}>{v.t}</span>
                      {v.d && <span style={{ fontSize: '.65rem', color: 'var(--t3)', marginLeft: '.4rem' }}>{v.d}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Ydinviestit ── */}
          {org.keyMessages?.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '.72rem', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--t3)', marginBottom: '1rem' }}>Ydinviestit</h2>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '.5rem' }}>
                {org.keyMessages.map((m: any, i: number) => {
                  const role = coreRoles.find((r: any) => r.id === m.theme);
                  return (
                    <div key={i} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '1rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.25rem' }}>
                        <div style={{ fontSize: '.82rem', fontWeight: 700 }}>{m.title}</div>
                        {role && <span style={{ fontSize: '.5rem', padding: '.1rem .35rem', borderRadius: 4, background: `${role.color}15`, color: role.color, fontWeight: 700 }}>{role.name}</span>}
                      </div>
                      <div style={{ fontSize: '.72rem', color: 'var(--t3)', lineHeight: 1.6 }}>{m.desc}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Tilannekuva ja kehityshankkeet ── */}
          {(currentCtx.expansion || currentCtx.visualIdentity || org.developmentPlan2027) && (
            <div style={{ background: 'rgba(241,180,52,.04)', border: '1px solid rgba(241,180,52,.12)', borderRadius: 'var(--rl)', padding: '1.25rem 1.5rem', marginBottom: '1.5rem' }}>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '.72rem', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--yellow)', marginBottom: '.75rem' }}>Ajankohtaista ja kehityshankkeet</h2>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '.5rem' }}>
                {currentCtx.expansion && <div style={{ fontSize: '.78rem', color: 'var(--t2)', lineHeight: 1.6, padding: '.5rem .75rem', background: 'rgba(255,255,255,.02)', borderRadius: 'var(--r)' }}><strong style={{ color: 'var(--t1)' }}>Laajennus</strong><br />{currentCtx.expansion}</div>}
                {currentCtx.visualIdentity && <div style={{ fontSize: '.78rem', color: 'var(--t2)', lineHeight: 1.6, padding: '.5rem .75rem', background: 'rgba(255,255,255,.02)', borderRadius: 'var(--r)' }}><strong style={{ color: 'var(--t1)' }}>Visuaalinen ilme</strong><br />{currentCtx.visualIdentity}</div>}
                {currentCtx.websiteUpdate && <div style={{ fontSize: '.78rem', color: 'var(--t2)', lineHeight: 1.6, padding: '.5rem .75rem', background: 'rgba(255,255,255,.02)', borderRadius: 'var(--r)' }}><strong style={{ color: 'var(--t1)' }}>Verkkosivut</strong><br />{currentCtx.websiteUpdate}</div>}
                {currentCtx.steaCuts && <div style={{ fontSize: '.78rem', color: 'var(--t2)', lineHeight: 1.6, padding: '.5rem .75rem', background: 'rgba(255,255,255,.02)', borderRadius: 'var(--r)' }}><strong style={{ color: 'var(--t1)' }}>Rahoitus</strong><br />{currentCtx.steaCuts}</div>}
                {currentCtx.accessibility && <div style={{ fontSize: '.78rem', color: 'var(--t2)', lineHeight: 1.6, padding: '.5rem .75rem', background: 'rgba(255,255,255,.02)', borderRadius: 'var(--r)' }}><strong style={{ color: 'var(--t1)' }}>Saavutettavuus</strong><br />{currentCtx.accessibility}</div>}
                {currentCtx.elections2027 && <div style={{ fontSize: '.78rem', color: 'var(--t2)', lineHeight: 1.6, padding: '.5rem .75rem', background: 'rgba(255,255,255,.02)', borderRadius: 'var(--r)' }}><strong style={{ color: 'var(--t1)' }}>Vaikuttaminen</strong><br />{currentCtx.elections2027}</div>}
              </div>
              {/* Kehityskohteet 2027 */}
              {org.developmentPlan2027?.targets?.length > 0 && (
                <div style={{ marginTop: '1rem', borderTop: '1px solid rgba(241,180,52,.12)', paddingTop: '1rem' }}>
                  <div style={{ fontSize: '.65rem', fontWeight: 700, color: 'var(--yellow)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '.5rem' }}>Kehityskohteet 2027</div>
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: '.4rem' }}>
                    {org.developmentPlan2027.targets.map((t: any, i: number) => (
                      <div key={i} style={{ fontSize: '.72rem', color: 'var(--t2)', padding: '.5rem .75rem', background: 'rgba(255,255,255,.02)', borderRadius: 'var(--r)', lineHeight: 1.5 }}>
                        <span style={{ fontWeight: 700, color: 'var(--t1)' }}>{t.name}</span>
                        <span style={{ color: 'var(--t3)', marginLeft: '.35rem', fontSize: '.62rem' }}>{t.prep}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── AI-koulutus ── */}
          <div style={{ background: 'linear-gradient(135deg, rgba(5,107,159,.06), rgba(228,92,129,.04))', border: '1px solid rgba(5,107,159,.15)', borderRadius: 'var(--rl)', overflow: 'hidden' }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid rgba(5,107,159,.1)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem', marginBottom: '.25rem' }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--pri)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '.6rem', fontWeight: 700, fontFamily: 'var(--font-display)' }}>M</div>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '.88rem', fontWeight: 500 }}>Kouluta Momentum tuntemaan strategiasi</h3>
              </div>
              <p style={{ fontSize: '.78rem', color: 'var(--t2)', lineHeight: 1.6 }}>Laheta strategiasi Momentum-tiimille niin koulutamme AI-kumppanisi tuntemaan sen.</p>
            </div>
            <div style={{ padding: '1.25rem 1.5rem' }}>
              {submitted ? (
                <div style={{ textAlign: 'center', padding: '1rem' }}>
                  <div style={{ color: 'var(--green)', fontSize: '1.2rem', marginBottom: '.5rem' }}>{'✓'}</div>
                  <p style={{ fontSize: '.85rem', fontWeight: 600 }}>Lahetetty!</p>
                  <button className="btn btn-ghost btn-sm" onClick={() => setSubmitted(false)} style={{ marginTop: '.5rem' }}>Laheta uusi</button>
                </div>
              ) : (
                <>
                  <textarea className="input textarea-lg" value={submitText} onChange={e => setSubmitText(e.target.value)} placeholder="Liita strategia tahan..." style={{ minHeight: 120, marginBottom: '.75rem' }} />
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button className="btn btn-primary" onClick={handleStrategySubmit} disabled={submitting || !submitText.trim()}>{submitting ? 'Lahetetaan...' : 'Laheta'}</button>
                  </div>
                </>
              )}
            </div>
          </div>
    </AppShell>
  );
}
