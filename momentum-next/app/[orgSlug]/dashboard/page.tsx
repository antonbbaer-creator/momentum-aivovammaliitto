'use client';

import React, { useState } from 'react';
import AppShell from '@/components/AppShell';
import { useOrgData } from '@/lib/firestore';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { useRouter, useParams } from 'next/navigation';
import {
  Grant,
  LLFF_GRANTS_DEFAULT,
  STATUS_DEFS,
  normalizeGrant,
  daysUntilDeadline,
} from '@/lib/grants-shared';
import {
  OrgTeamMember,
  DEFAULT_LLFF_TEAM_MEMBERS,
} from '@/lib/team-shared';

const WORKER_URL = 'https://momentum-worker.anton-4f9.workers.dev';

export default function DashboardPage() {
  const { user, orgs, activeOrg } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const params = useParams();
  const orgSlug = params.orgSlug as string;
  const [org] = useOrgData<any>('org', {});
  const [projects, setProjects] = useOrgData<any[]>('projects', []);
  const [teamMessages, setTeamMessages] = useOrgData<any[]>('teamMessages', []);
  const [rawGrants] = useOrgData<Grant[]>('llff_grants', LLFF_GRANTS_DEFAULT);
  const [orgMembers] = useOrgData<OrgTeamMember[]>('orgTeamMembers', DEFAULT_LLFF_TEAM_MEMBERS);
  const grants = rawGrants.map(normalizeGrant);

  // Match currently-logged-in user to their OrgTeamMember record
  // Prio: email → displayName → first name
  const myMember = orgMembers.find(m => {
    if (user?.email && m.email && m.email.toLowerCase() === user.email.toLowerCase()) return true;
    if (user?.displayName && m.name === user.displayName) return true;
    return false;
  });

  // Grants assigned to me (exclude rejected)
  const myGrants = myMember ? grants
    .filter(g => g.responsibleId === myMember.id && g.status !== 'rejected')
    .sort((a, b) => {
      const da = daysUntilDeadline(a) ?? 999999;
      const db = daysUntilDeadline(b) ?? 999999;
      return da - db;
    }) : [];

  const [aiResponse, setAiResponse] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [completedTasks, setCompletedTasks] = useState<Set<string>>(new Set());

  const firstName = user?.displayName?.split(' ')[0] || 'käyttäjä';

  // My open tasks across all projects
  const myTasks = projects.flatMap((p: any) =>
    (p.tasks || []).map((t: any, ti: number) => ({ ...t, projectName: p.t, projectId: p.id, taskIndex: ti }))
  ).filter((t: any) => t.assignee === user?.displayName && !t.done);

  // My projects (where I have open tasks)
  const myProjectIds = [...new Set(myTasks.map(t => t.projectId))];
  const myProjects = projects.filter((p: any) => myProjectIds.includes(p.id));

  // Unassigned tasks across active projects
  const unassignedTasks = projects.filter((p: any) => !p.archived && p.st !== 'done').flatMap((p: any) =>
    (p.tasks || []).map((t: any, ti: number) => ({ ...t, projectName: p.t, projectId: p.id, taskIndex: ti }))
  ).filter((t: any) => !t.assignee && !t.done);

  const todayStr = new Date().toISOString().slice(0, 10);

  // Toggle task done from dashboard — fade out, then save after 5s (with undo)
  const undoTimers = React.useRef<Record<string, NodeJS.Timeout>>({});

  const toggleTask = (projectId: number, taskIndex: number) => {
    const key = `${projectId}_${taskIndex}`;
    setCompletedTasks(prev => new Set([...prev, key]));
    // Clear any existing timer for this task
    if (undoTimers.current[key]) clearTimeout(undoTimers.current[key]);
    // Set 5s timer to actually save
    undoTimers.current[key] = setTimeout(() => {
      setProjects(prev => prev.map(p => {
        if (p.id !== projectId) return p;
        const tasks = [...p.tasks];
        tasks[taskIndex] = { ...tasks[taskIndex], done: true };
        return { ...p, tasks };
      }));
      setCompletedTasks(prev => { const n = new Set(prev); n.delete(key); return n; });
      delete undoTimers.current[key];
    }, 5000);
  };

  const undoTask = (projectId: number, taskIndex: number) => {
    const key = `${projectId}_${taskIndex}`;
    if (undoTimers.current[key]) {
      clearTimeout(undoTimers.current[key]);
      delete undoTimers.current[key];
    }
    setCompletedTasks(prev => { const n = new Set(prev); n.delete(key); return n; });
  };

  const deadlineColor = (dl: string) => {
    if (!dl) return null;
    const diff = new Date(dl).getTime() - Date.now();
    const day = 86400000;
    if (diff < 0) return { color: 'var(--red)', label: 'Myöhässä' };
    if (diff < 7 * day) return { color: 'var(--red)', label: Math.ceil(diff / day) + ' pv' };
    if (diff < 30 * day) return { color: 'var(--yellow)', label: Math.ceil(diff / day) + ' pv' };
    return { color: 'var(--green)', label: Math.ceil(diff / day) + ' pv' };
  };

  // AI query
  const askAI = async (prompt: string) => {
    setAiLoading(true); setAiResponse('');
    try {
      const systemCtx = `Olet ${org.name || 'organisaation'} viestinnän AI-kumppani. Vastaa lyhyesti ja konkreettisesti suomeksi. ${org.commsMission ? 'Viestinnän missio: ' + org.commsMission : ''} ${org.tone?.length ? 'Sävyt: ' + org.tone.join(', ') : ''}`;
      const res = await fetch(WORKER_URL + '/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Momentum-Org': activeOrg || '' },
        body: JSON.stringify({ messages: [{ role: 'user', content: prompt }], systemContext: systemCtx }),
      });
      if (res.ok) { const data = await res.json(); setAiResponse(data.response || ''); }
    } catch (e) { setAiResponse('Yhteysvirhe. Yritä uudelleen.'); }
    finally { setAiLoading(false); }
  };

  return (
    <AppShell title={`Hei, ${firstName}!`} subtitle={org.name || ''}>

      {/* My tasks */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', marginBottom: '1.5rem' }}>
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '.88rem', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.02em' }}>Sinun tehtäväsi</h3>
            <p style={{ fontSize: '.72rem', color: 'var(--t3)', marginTop: '.15rem' }}>Mitä tänään työstetään?</p>
          </div>
          <span style={{ fontSize: '.75rem', color: myTasks.length > 0 ? 'var(--pri-l)' : 'var(--t3)' }}>{myTasks.length} avointa{myGrants.length > 0 && ` · ${myGrants.length} apurahaa`}</span>
        </div>
        <div style={{ padding: '1.25rem 1.5rem' }}>
          {myTasks.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--t3)' }}>
              <p style={{ fontSize: '.88rem', marginBottom: '.5rem' }}>Ei avoimia projektitehtäviä sinulle.</p>
              <p style={{ fontSize: '.75rem' }}>
                Tehtäviä voi määritellä Projektit-sivulta.
                {myGrants.length > 0 && ' Sinulla on kuitenkin vastuuapurahoja (katso alta).'}
              </p>
            </div>
          ) : (
            myTasks.map((task: any, i: number) => {
              const dlc = task.deadline ? deadlineColor(task.deadline) : null;
              const key = `${task.projectId}_${task.taskIndex}`;
              const isDone = completedTasks.has(key);
              return (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: '.75rem', padding: '.75rem',
                  background: isDone ? 'rgba(45,212,160,.06)' : 'var(--elev)',
                  border: `1px solid ${isDone ? 'rgba(45,212,160,.2)' : 'var(--border)'}`,
                  borderRadius: 'var(--r)', marginBottom: '.5rem',
                  opacity: isDone ? 0.5 : 1, transition: 'all .5s ease',
                  textDecoration: isDone ? 'line-through' : 'none',
                }}>
                  <input type="checkbox" checked={isDone} onChange={() => !isDone && toggleTask(task.projectId, task.taskIndex)}
                    style={{ width: 18, height: 18, cursor: isDone ? 'default' : 'pointer', flexShrink: 0, accentColor: 'var(--green)' }} />
                  <div style={{ width: 4, height: 32, borderRadius: 2, background: isDone ? 'var(--green)' : (dlc?.color || 'var(--pri)'), flexShrink: 0 }} />
                  <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => router.push(`/${orgSlug}/projects`)}>
                    <div style={{ fontSize: '.85rem', fontWeight: 600 }}>{task.text}</div>
                    <div style={{ fontSize: '.68rem', color: 'var(--t3)', marginTop: '.1rem' }}>{task.projectName}</div>
                  </div>
                  {isDone ? (
                    <button onClick={e => { e.stopPropagation(); undoTask(task.projectId, task.taskIndex); }}
                      style={{ fontSize: '.65rem', fontWeight: 600, color: 'var(--pri-l)', background: 'rgba(5,107,159,.1)', border: '1px solid rgba(5,107,159,.2)', borderRadius: 'var(--r)', padding: '.25rem .6rem', cursor: 'pointer', flexShrink: 0 }}>
                      Palauta
                    </button>
                  ) : (
                    dlc && <span style={{ fontSize: '.65rem', fontWeight: 600, color: dlc.color, flexShrink: 0 }}>{dlc.label}</span>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Vastuuapurahat — apurahat joissa vastuuhenkilöksi on merkitty minut */}
      {myMember && myGrants.length > 0 && (
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', marginBottom: '1.5rem' }}>
          <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '.88rem', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.02em' }}>Vastuuapurahat</h3>
              <p style={{ fontSize: '.72rem', color: 'var(--t3)', marginTop: '.15rem' }}>Apurahat joissa vastuuhenkilönä olet sinä ({myMember.name})</p>
            </div>
            <span style={{ fontSize: '.75rem', color: 'var(--pri-l)', fontWeight: 600 }}>{myGrants.length} {myGrants.length === 1 ? 'apuraha' : 'apurahaa'}</span>
          </div>
          <div style={{ padding: '.85rem 1rem', display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
            {myGrants.slice(0, 8).map(g => {
              const sd = STATUS_DEFS[g.status];
              const days = daysUntilDeadline(g);
              const urgent = days !== null && days >= 0 && days <= 14;
              const warn = days !== null && days >= 0 && days <= 30;
              const past = days !== null && days < 0;
              const dlColor = urgent ? 'var(--red)' : warn ? 'var(--yellow)' : 'var(--green)';
              return (
                <div key={g.id} onClick={() => router.push(`/${orgSlug}/budget`)} style={{
                  display: 'flex', alignItems: 'center', gap: '.75rem',
                  padding: '.65rem .85rem',
                  background: 'var(--elev)',
                  border: '1px solid var(--border)',
                  borderLeft: `3px solid ${sd.color}`,
                  borderRadius: 'var(--r)',
                  cursor: 'pointer',
                  opacity: past ? .55 : 1,
                }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%',
                    background: sd.color, color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '.7rem', fontWeight: 800, flexShrink: 0,
                  }}>{sd.icon}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '.85rem', fontWeight: 700, color: 'var(--t1)' }}>
                      {g.funder}
                    </div>
                    <div style={{ fontSize: '.68rem', color: 'var(--t3)', marginTop: '.1rem' }}>
                      {g.grantName} · {g.year} · {sd.label}
                      {g.amount > 0 && <> · {g.amount >= 1000 ? `${(g.amount / 1000).toFixed(g.amount % 1000 === 0 ? 0 : 1)}k €` : `${g.amount} €`}</>}
                    </div>
                  </div>
                  {g.deadlineText && (
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: '.7rem', fontWeight: 700, color: 'var(--t2)' }}>{g.deadlineText}</div>
                      {days !== null && days >= 0 && (
                        <div style={{ fontSize: '.6rem', fontWeight: 700, color: dlColor, marginTop: '.1rem' }}>
                          {days === 0 ? 'TÄNÄÄN' : `${days} pv jäljellä`}
                        </div>
                      )}
                      {days !== null && days < 0 && (
                        <div style={{ fontSize: '.6rem', fontWeight: 700, color: 'var(--t3)', marginTop: '.1rem' }}>
                          Mennyt
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {myGrants.length > 8 && (
              <div style={{ fontSize: '.7rem', color: 'var(--t3)', textAlign: 'center', padding: '.5rem' }}>
                + {myGrants.length - 8} muuta — <button onClick={() => router.push(`/${orgSlug}/budget`)} style={{ background: 'transparent', border: 'none', color: 'var(--pri-l)', fontWeight: 700, cursor: 'pointer', fontSize: '.7rem' }}>Avaa Apurahat →</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Ei merkittyä team-member-rekordia — vihje käyttäjälle */}
      {!myMember && myGrants.length === 0 && orgMembers.length > 0 && (
        <div style={{ background: 'rgba(241,180,52,.04)', border: '1px solid rgba(241,180,52,.2)', borderRadius: 'var(--rl)', padding: '.85rem 1.25rem', marginBottom: '1.5rem' }}>
          <div style={{ fontSize: '.78rem', color: 'var(--t2)', lineHeight: 1.5 }}>
            <strong style={{ color: 'var(--yellow)' }}>Tietoa puuttuu:</strong> Käyttäjätiliäsi ({user?.displayName || user?.email}) ei ole linkitetty tiimiläistietoihin.
            Apurahat ja vastuut näkyvät täällä kun tiimissäsi on tiimiläinen jonka nimi tai sähköposti vastaa sinua.
            <button onClick={() => router.push(`/${orgSlug}/team`)} style={{ marginLeft: '.5rem', background: 'transparent', border: 'none', color: 'var(--pri-l)', cursor: 'pointer', fontWeight: 700 }}>Avaa Tiimi →</button>
          </div>
        </div>
      )}

      {/* Requests to me */}
      {(() => {
        const myRequests = teamMessages.filter((m: any) => m.type === 'request' && m.to === user?.displayName && !m.done);
        if (myRequests.length === 0) return null;
        return (
          <div style={{ background: 'rgba(241,180,52,.04)', border: '1px solid rgba(241,180,52,.2)', borderRadius: 'var(--rl)', padding: '1.25rem 1.5rem', marginBottom: '1.5rem' }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '.82rem', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.02em', color: 'var(--yellow)', marginBottom: '.75rem' }}>
              {myRequests.length} {myRequests.length === 1 ? 'pyyntö' : 'pyyntöä'} sinulle
            </h3>
            {myRequests.map((msg: any) => (
              <div key={msg.id} style={{ display: 'flex', alignItems: 'center', gap: '.75rem', padding: '.65rem .75rem', background: 'rgba(241,180,52,.04)', borderRadius: 'var(--r)', marginBottom: '.35rem' }}>
                <div className="ava" style={{ width: 28, height: 28, fontSize: '.6rem', background: 'var(--yellow)', color: '#000', flexShrink: 0 }}>{msg.from[0]}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '.82rem', fontWeight: 600 }}>{msg.text}</div>
                  <div style={{ fontSize: '.65rem', color: 'var(--t3)', marginTop: '.1rem' }}>{msg.from} {'·'} {new Date(msg.timestamp).toLocaleDateString('fi-FI')}</div>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => setTeamMessages(prev => prev.map((m: any) => m.id === msg.id ? { ...m, done: true } : m))}
                  style={{ fontSize: '.68rem', color: 'var(--green)' }}>Tehty</button>
              </div>
            ))}
          </div>
        );
      })()}

      {/* My projects */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', marginBottom: '1.5rem' }}>
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '.88rem', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.02em' }}>Sinun projektisi</h3>
        </div>
        <div style={{ padding: '1.25rem 1.5rem' }}>
          {myProjects.length === 0 ? (
            <p style={{ color: 'var(--t3)', fontSize: '.82rem', textAlign: 'center', padding: '1rem' }}>Ei projekteja joissa sinulle on tehtäviä.</p>
          ) : (
            myProjects.slice(0, 5).map((p: any) => {
              const myOpen = (p.tasks || []).filter((t: any) => t.assignee === user?.displayName && !t.done).length;
              const dlc = p.deadline ? deadlineColor(p.deadline) : null;
              return (
                <div key={p.id} onClick={() => router.push(`/${orgSlug}/projects`)}
                  style={{ padding: '.6rem 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '.85rem', fontWeight: 600 }}>{p.t}</span>
                    {dlc && <span style={{ fontSize: '.65rem', color: dlc.color, fontWeight: 600 }}>{dlc.label}</span>}
                  </div>
                  <div style={{ fontSize: '.68rem', color: 'var(--t3)', marginTop: '.15rem' }}>{myOpen} avointa tehtävää sinulle</div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Unassigned tasks warning */}
      {unassignedTasks.length > 0 && (
        <div style={{ background: 'rgba(241,180,52,.04)', border: '1px solid rgba(241,180,52,.2)', borderRadius: 'var(--rl)', padding: '1.25rem 1.5rem', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.75rem' }}>
            <span style={{ color: 'var(--yellow)', fontSize: '1rem' }}>{'⚠'}</span>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '.82rem', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.02em', color: 'var(--yellow)' }}>
              {unassignedTasks.length} tehtävää ilman tekijää
            </h3>
          </div>
          {unassignedTasks.slice(0, 6).map((task: any, i: number) => {
            const dlc = task.deadline ? deadlineColor(task.deadline) : null;
            return (
              <div key={i} onClick={() => router.push(`/${orgSlug}/projects`)}
                style={{ display: 'flex', alignItems: 'center', gap: '.75rem', padding: '.5rem .75rem', background: 'rgba(241,180,52,.04)', borderRadius: 'var(--r)', marginBottom: '.35rem', cursor: 'pointer' }}>
                <div style={{ width: 4, height: 24, borderRadius: 2, background: dlc?.color || 'var(--yellow)', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: '.82rem', fontWeight: 600 }}>{task.text}</span>
                  <span style={{ fontSize: '.68rem', color: 'var(--t3)', marginLeft: '.5rem' }}>{task.projectName}</span>
                </div>
                {dlc ? (
                  <span style={{ fontSize: '.65rem', fontWeight: 600, color: dlc.color, flexShrink: 0 }}>{dlc.label}</span>
                ) : (
                  <span style={{ fontSize: '.65rem', color: 'var(--t3)', flexShrink: 0 }}>Ei deadlinea</span>
                )}
              </div>
            );
          })}
          {unassignedTasks.length > 6 && <div style={{ fontSize: '.72rem', color: 'var(--t3)', marginTop: '.5rem' }}>+ {unassignedTasks.length - 6} muuta tehtävää</div>}
        </div>
      )}

      {/* AI Actions — bottom of page */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: aiResponse || aiLoading ? '1rem' : 0 }}>
        <div onClick={() => { const ap = projects.filter(p => p.st === 'active' && !p.archived).map(p => p.t).join(', ') || 'ei aktiivisia'; askAI('Anna tilannekatsaus ' + (org.name || 'organisaation') + ' viestinnästä juuri nyt. Mitä on meneillään? Aktiiviset projektit: ' + ap + '. Avoimia tehtäviä: ' + myTasks.length + '.'); }}
          style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '1.25rem', cursor: 'pointer', transition: 'border-color .15s' }}>
          <div style={{ fontSize: '1.1rem', marginBottom: '.35rem' }}>{'◈'}</div>
          <div style={{ fontSize: '.88rem', fontWeight: 700 }}>Tilannekatsaus</div>
          <div style={{ fontSize: '.72rem', color: 'var(--t3)', marginTop: '.15rem' }}>Mitä viestinnässä tapahtuu juuri nyt?</div>
        </div>
        <div onClick={() => askAI('Etsi yksi inspiroiva esimerkki maailmaa muuttavasta järjestöviestinnästä. Kerro mikä järjestö, mikä kampanja, miksi se toimi ja mitä voimme oppia siitä. Anna konkreettinen idea miten voisimme soveltaa vastaavaa.')}
          style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '1.25rem', cursor: 'pointer', transition: 'border-color .15s' }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--green)')} onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}>
          <div style={{ fontSize: '1.1rem', marginBottom: '.35rem' }}>{'☆'}</div>
          <div style={{ fontSize: '.88rem', fontWeight: 700 }}>Inspiraatiota</div>
          <div style={{ fontSize: '.72rem', color: 'var(--t3)', marginTop: '.15rem' }}>Maailmaa muuttavaa viestintää</div>
        </div>
      </div>

      {/* AI Response */}
      {(aiLoading || aiResponse) && (
        <div style={{ background: 'linear-gradient(135deg, rgba(5,107,159,.06), rgba(24,94,91,.04))', border: '1px solid rgba(5,107,159,.15)', borderRadius: 'var(--rl)', padding: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.75rem' }}>
            <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--pri)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '.55rem', fontWeight: 700, fontFamily: 'var(--font-display)' }}>M</div>
            <span style={{ fontSize: '.78rem', fontWeight: 600, color: 'var(--pri-l)' }}>Momentum</span>
            {aiResponse && <button className="btn btn-ghost btn-sm" onClick={() => setAiResponse('')} style={{ marginLeft: 'auto', fontSize: '.65rem' }}>Sulje</button>}
          </div>
          {aiLoading ? (
            <div className="typing"><span /><span /><span /></div>
          ) : (
            <p style={{ fontSize: '.88rem', color: 'var(--t2)', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>{aiResponse}</p>
          )}
        </div>
      )}
    </AppShell>
  );
}
