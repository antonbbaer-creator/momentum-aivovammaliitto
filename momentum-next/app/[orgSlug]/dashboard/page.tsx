'use client';

import React, { useState } from 'react';
import AppShell from '@/components/AppShell';
import { useOrgData } from '@/lib/firestore';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { useRouter, useParams } from 'next/navigation';
import {
  Grant,
  STATUS_DEFS,
  normalizeGrant,
  daysUntilDeadline,
} from '@/lib/grants-shared';
import {
  OrgTeamMember,
  resolveUserMember,
} from '@/lib/team-shared';
import { getGrantsKey, getOrgGrants, getOrgTeamMembers } from '@/lib/org-defaults';

import { workerFetch } from '@/lib/worker-fetch';

export default function DashboardPage() {
  const { user, orgs, activeOrg } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const params = useParams();
  const orgSlug = params.orgSlug as string;
  const [org] = useOrgData<any>('org', {});
  const [projects, setProjects] = useOrgData<any[]>('projects', []);
  const [teamMessages, setTeamMessages] = useOrgData<any[]>('teamMessages', []);
  const [rawGrants] = useOrgData<Grant[]>(getGrantsKey(orgSlug), getOrgGrants(orgSlug));
  const [orgMembers] = useOrgData<OrgTeamMember[]>('orgTeamMembers', getOrgTeamMembers(orgSlug));
  const grants = rawGrants.map(normalizeGrant);

  // Match currently-logged-in user to their OrgTeamMember record
  // Käyttää jaettua resolveUserMember-helperia joka tarkistaa:
  //   1. linkedUserEmails-array (tukee useita Firebase-tilejä per jäsen)
  //   2. email-kenttä
  //   3. displayName tarkka
  //   4. etunimi (fuzzy fallback)
  const myMember = resolveUserMember(orgMembers, user);

  // Grants assigned to me (exclude rejected AND past deadlines)
  const myGrants = myMember ? grants
    .filter(g => {
      if (g.responsibleId !== myMember.id) return false;
      if (g.status === 'rejected') return false;
      // Suodata menneet pois — jos deadline on annettu ja se on menneisyydessä, hyppää yli
      const days = daysUntilDeadline(g);
      if (days !== null && days < 0) return false;
      return true;
    })
    .sort((a, b) => {
      const da = daysUntilDeadline(a) ?? 999999;
      const db = daysUntilDeadline(b) ?? 999999;
      return da - db;
    }) : [];

  const [aiResponse, setAiResponse] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [completedTasks, setCompletedTasks] = useState<Set<string>>(new Set());

  const firstName = user?.displayName?.split(' ')[0] || 'käyttäjä';

  // My open project tasks — match by displayName OR first name (if nickname)
  const myTasks = projects.flatMap((p: any) =>
    (p.tasks || []).map((t: any, ti: number) => ({ ...t, projectName: p.t, projectId: p.id, taskIndex: ti }))
  ).filter((t: any) => {
    if (t.done) return false;
    if (!t.assignee) return false;
    if (t.assignee === user?.displayName) return true;
    // Jos teht\u00e4v\u00e4 on merkitty tiimil\u00e4isen nimell\u00e4 ja tiimil\u00e4inen on match
    if (myMember && t.assignee === myMember.name) return true;
    return false;
  });

  // Yhdistetty tehtävälista — sisältää sekä projektitehtävät että apurahat
  // yhdessä, lajiteltuna kiireellisyyden mukaan
  interface UnifiedItem {
    id: string;
    kind: 'task' | 'grant';
    title: string;
    subtitle: string;
    deadline?: string;
    deadlineText?: string;
    days: number | null;
    color: string;
    onClick: () => void;
    // Task-only fields
    taskRef?: { projectId: number; taskIndex: number };
  }

  const unifiedList: UnifiedItem[] = [
    ...myTasks.map((t: any): UnifiedItem => ({
      id: `task_${t.projectId}_${t.taskIndex}`,
      kind: 'task',
      title: t.text,
      subtitle: t.projectName,
      deadline: t.deadline,
      deadlineText: t.deadline,
      days: t.deadline ? Math.ceil((new Date(t.deadline).getTime() - Date.now()) / 86400000) : null,
      color: 'var(--pri)',
      onClick: () => router.push(`/${orgSlug}/projects`),
      taskRef: { projectId: t.projectId, taskIndex: t.taskIndex },
    })),
    ...myGrants.map((g): UnifiedItem => {
      const sd = STATUS_DEFS[g.status];
      return {
        id: `grant_${g.id}`,
        kind: 'grant',
        title: `${g.funder}: ${g.grantName}`,
        subtitle: `Apuraha · ${g.year} · ${sd.label}${g.amount > 0 ? ' · ' + (g.amount >= 1000 ? `${(g.amount / 1000).toFixed(g.amount % 1000 === 0 ? 0 : 1)}k €` : `${g.amount} €`) : ''}`,
        deadline: g.deadline,
        deadlineText: g.deadlineText,
        days: daysUntilDeadline(g),
        color: sd.color,
        onClick: () => router.push(`/${orgSlug}/budget`),
      };
    }),
  ].sort((a, b) => {
    // Sort by days (ascending), items without deadlines go to the end
    const da = a.days ?? 999999;
    const db = b.days ?? 999999;
    return da - db;
  });

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
      const isJuhla = orgSlug === 'juhlatoimikunta';
      const systemCtx = isJuhla
        ? 'Olet osaava ja inspiroiva juhlajarjestaja-AI. Autat Sirpan 70-vuotissyntymapaivajahlien suunnittelussa. Juhlat jarjestetaan lauantaina 25.4.2026 Tyttojen talolla Kalliossa (Hameentie 13 A, Helsinki). Tiimi: Sonja Baer (vetaja), Raisa Baer, Elina Savo, Anton Baer. Vastaa lyhyesti, lamminhenkisesti ja konkreettisesti suomeksi. Anna kaytannollisia ja luovia ideoita juhlien jarjestamiseen.'
        : `Olet ${org.name || 'organisaation'} viestinnän AI-kumppani. Vastaa lyhyesti ja konkreettisesti suomeksi. ${org.commsMission ? 'Viestinnän missio: ' + org.commsMission : ''} ${org.tone?.length ? 'Sävyt: ' + org.tone.join(', ') : ''}`;
      const res = await workerFetch('/api/chat', {
        method: 'POST',
        orgId: activeOrg || '',
        body: JSON.stringify({ messages: [{ role: 'user', content: prompt }], systemContext: systemCtx }),
      });
      if (res.ok) { const data = await res.json(); setAiResponse(data.response || ''); }
    } catch (e) { setAiResponse('Yhteysvirhe. Yritä uudelleen.'); }
    finally { setAiLoading(false); }
  };

  return (
    <AppShell title={`Hei, ${firstName}!`} subtitle={org.name || ''}>

      {/* Sinun tehtäväsi — yhdistetty lista: projektitehtävät + apurahat samassa */}
      <div className="dc dc-brand" style={{ marginBottom: '1.5rem' }}>
        <div className="dc-h">
          <div>
            <h3>Sinun tehtäväsi</h3>
            <p style={{ fontSize: '.72rem', color: 'var(--t3)', marginTop: '.15rem' }}>Mitä tänään työstetään?</p>
          </div>
          <span style={{ fontSize: '.75rem', color: unifiedList.length > 0 ? 'var(--pri-l)' : 'var(--t3)' }}>{unifiedList.length} {unifiedList.length === 1 ? 'kohde' : 'kohdetta'}</span>
        </div>
        <div className="dc-b" style={{ display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
          {unifiedList.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--t3)' }}>
              <p style={{ fontSize: '.88rem', marginBottom: '.5rem' }}>Ei avoimia tehtäviä sinulle.</p>
              <p style={{ fontSize: '.75rem' }}>
                Projektitehtäviä voi määritellä Projektit-sivulta, apurahoja Apurahat-sivulta.
              </p>
            </div>
          ) : (
            unifiedList.map((item) => {
              const isDone = item.taskRef ? completedTasks.has(`${item.taskRef.projectId}_${item.taskRef.taskIndex}`) : false;
              const days = item.days;
              const urgent = days !== null && days >= 0 && days <= 14;
              const warn = days !== null && days >= 0 && days <= 30;
              const dlColor = urgent ? 'var(--red)' : warn ? 'var(--yellow)' : 'var(--green)';
              const isGrant = item.kind === 'grant';
              return (
                <div key={item.id} style={{
                  display: 'flex', alignItems: 'center', gap: '.75rem',
                  padding: '.65rem .85rem',
                  background: isDone ? 'rgba(45,212,160,.06)' : 'var(--elev)',
                  border: `1px solid ${isDone ? 'rgba(45,212,160,.2)' : 'var(--border)'}`,
                  borderLeft: `3px solid ${isDone ? 'var(--green)' : item.color}`,
                  borderRadius: 'var(--r)',
                  opacity: isDone ? 0.5 : 1,
                  transition: 'all .3s ease',
                  textDecoration: isDone ? 'line-through' : 'none',
                }}>
                  {/* Checkbox ONLY for project tasks (grants käsitellään Apurahat-sivulla) */}
                  {item.kind === 'task' && item.taskRef && (
                    <input
                      type="checkbox"
                      checked={isDone}
                      onChange={() => !isDone && toggleTask(item.taskRef!.projectId, item.taskRef!.taskIndex)}
                      style={{ width: 18, height: 18, cursor: isDone ? 'default' : 'pointer', flexShrink: 0, accentColor: 'var(--green)' }}
                    />
                  )}
                  {item.kind === 'grant' && (
                    <div style={{
                      width: 22, height: 22, borderRadius: '50%',
                      background: item.color, color: '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '.58rem', fontWeight: 600, flexShrink: 0,
                    }}>€</div>
                  )}
                  <div style={{ flex: 1, cursor: 'pointer', minWidth: 0 }} onClick={item.onClick}>
                    <div style={{ fontSize: '.85rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.title}
                    </div>
                    <div style={{ fontSize: '.68rem', color: 'var(--t3)', marginTop: '.1rem' }}>
                      {item.subtitle}
                    </div>
                  </div>
                  {/* Deadline display */}
                  {isDone ? (
                    <button
                      onClick={e => { e.stopPropagation(); if (item.taskRef) undoTask(item.taskRef.projectId, item.taskRef.taskIndex); }}
                      style={{ fontSize: '.65rem', fontWeight: 600, color: 'var(--pri-l)', background: 'rgba(5,107,159,.1)', border: '1px solid rgba(5,107,159,.2)', borderRadius: 'var(--r)', padding: '.25rem .6rem', cursor: 'pointer', flexShrink: 0 }}
                    >
                      Palauta
                    </button>
                  ) : (
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      {isGrant && item.deadlineText && (
                        <div style={{ fontSize: '.65rem', fontWeight: 500, color: 'var(--t2)' }}>{item.deadlineText}</div>
                      )}
                      {days !== null && days >= 0 && (
                        <div style={{ fontSize: '.6rem', fontWeight: 600, color: dlColor, marginTop: isGrant ? '.1rem' : 0 }}>
                          {days === 0 ? 'TÄNÄÄN' : `${days} pv`}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Ei merkittyä team-member-rekordia — vihje käyttäjälle */}
      {!myMember && myGrants.length === 0 && orgMembers.length > 0 && (
        <div style={{ background: 'rgba(241,180,52,.04)', border: '1px solid rgba(241,180,52,.2)', borderRadius: 'var(--rl)', padding: '.85rem 1.25rem', marginBottom: '1.5rem' }}>
          <div style={{ fontSize: '.78rem', color: 'var(--t2)', lineHeight: 1.5 }}>
            <strong style={{ color: 'var(--yellow)' }}>Tietoa puuttuu:</strong> Käyttäjätiliäsi ({user?.displayName || user?.email}) ei ole linkitetty tiimiläistietoihin.
            Apurahat ja vastuut näkyvät täällä kun tiimissäsi on tiimiläinen jonka nimi tai sähköposti vastaa sinua.
            <button onClick={() => router.push(`/${orgSlug}/team`)} style={{ marginLeft: '.5rem', background: 'transparent', border: 'none', color: 'var(--pri-l)', cursor: 'pointer', fontWeight: 600 }}>Avaa Tiimi →</button>
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
      <div className="dc" style={{ marginBottom: '1.5rem' }}>
        <div className="dc-h">
          <h3>Sinun projektisi</h3>
        </div>
        <div className="dc-b">
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
                    <span style={{ fontSize: '.85rem', fontWeight: 500 }}>{p.t}</span>
                    {dlc && <span style={{ fontSize: '.65rem', color: dlc.color, fontWeight: 500 }}>{dlc.label}</span>}
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
      {(() => {
        const isJuhla = orgSlug === 'juhlatoimikunta';
        const statusPrompt = isJuhla
          ? 'Anna tilannekatsaus juhlien jarjestelyista. Mita pitaisi seuraavaksi hoitaa? Avoimia tehtavia: ' + myTasks.length + '.'
          : 'Anna tilannekatsaus ' + (org.name || 'organisaation') + ' viestinnästä juuri nyt. Mitä on meneillään? Aktiiviset projektit: ' + (projects.filter((p: any) => p.st === 'active' && !p.archived).map((p: any) => p.t).join(', ') || 'ei aktiivisia') + '. Avoimia tehtäviä: ' + myTasks.length + '.';
        const inspPrompt = isJuhla
          ? 'Anna yksi inspiroiva ja konkreettinen idea 70-vuotissyntymapaivajahlien jarjestamiseen. Keskity johonkin naihin teemoista: koristeluun, ohjelmaan, puheisiin, yllatyshetkiin, musiikkiin, valokuvaukseen, tai lamminhenkisiin yksityiskohtiin jotka tekevat juhlista ikimuistoiset. Anna tarkkoja ja helposti toteutettavia ehdotuksia.'
          : 'Kerro yksi todellinen, dokumentoitu esimerkki siitä miten kulttuurialan yhdistys tai järjestö on muuttanut maailmaa parempaan suuntaan. Keskity oikeisiin tapahtumiin: esim. elokuvafestivaalit jotka ovat nostaneet ihmisoikeuskysymyksiä, teatteriprojektit jotka ovat tuoneet syrjäytyneitä yhteisöjä yhteen, taidejärjestöt jotka ovat vaikuttaneet lainsäädäntöön, tai kulttuuritapahtumat jotka ovat edistäneet mielenterveyden destigmatisointia. Kerro mikä järjestö, mitä he tekivät, mikä oli konkreettinen vaikutus, ja mitä me voisimme oppia heiltä. Käytä vain todellisia, oikeita esimerkkejä — älä keksi.';
        return (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: aiResponse || aiLoading ? '1rem' : 0 }}>
            <div className="dc" onClick={() => askAI(statusPrompt)}
              style={{ cursor: 'pointer', borderLeft: '3px solid var(--hetki-blue)', transition: 'all .3s cubic-bezier(.16,1,.3,1)' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--pri-l)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.borderLeftColor = 'var(--hetki-blue)'; e.currentTarget.style.transform = 'translateY(0)'; }}>
              <div className="dc-b">
                <div style={{ width: 20, height: 20, marginBottom: '.5rem', color: 'var(--pri-l)' }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: '100%', height: '100%' }}><circle cx="12" cy="12" r="9"/><polygon points="16.24,7.76 14.12,14.12 7.76,16.24 9.88,9.88" fill="currentColor" opacity=".25"/></svg>
                </div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '.88rem', fontWeight: 500, letterSpacing: '.02em' }}>Tilannekatsaus</div>
                <div style={{ fontSize: '.72rem', color: 'var(--t3)', marginTop: '.2rem', lineHeight: 1.5 }}>{isJuhla ? 'Missa mennaan juhlien jarjestelyissa?' : 'Mitä viestinnässä tapahtuu juuri nyt?'}</div>
              </div>
            </div>
            <div className="dc" onClick={() => askAI(inspPrompt)}
              style={{ cursor: 'pointer', borderLeft: '3px solid var(--hetki-green)', transition: 'all .3s cubic-bezier(.16,1,.3,1)' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--green-l)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.borderLeftColor = 'var(--hetki-green)'; e.currentTarget.style.transform = 'translateY(0)'; }}>
              <div className="dc-b">
                <div style={{ width: 20, height: 20, marginBottom: '.5rem', color: 'var(--green-l)' }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: '100%', height: '100%' }}><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/></svg>
                </div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '.88rem', fontWeight: 500, letterSpacing: '.02em' }}>Inspiraatiota</div>
                <div style={{ fontSize: '.72rem', color: 'var(--t3)', marginTop: '.2rem', lineHeight: 1.5 }}>{isJuhla ? 'Ideoita ikimuistoisiin juhliin' : 'Kulttuurialan yhdistykset jotka muuttivat maailmaa'}</div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* AI Response */}
      {(aiLoading || aiResponse) && (
        <div style={{ background: 'linear-gradient(135deg, rgba(5,107,159,.06), rgba(24,94,91,.04))', border: '1px solid rgba(5,107,159,.15)', borderRadius: 'var(--rl)', padding: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.75rem' }}>
            <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--pri)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '.55rem', fontWeight: 500, fontFamily: 'var(--font-display)' }}>M</div>
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
