'use client';

import React, { useState, useMemo, useEffect } from 'react';
import AppShell from '@/components/AppShell';
import { useOrgData } from '@/lib/firestore';
import { useAuth } from '@/lib/auth';
import { useRouter, useParams } from 'next/navigation';
import { useIsMobile } from '@/lib/use-mobile';
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
import { includesAssignee, effectiveStatus } from '@/lib/assignments-shared';
import { getGrantsKey, getOrgGrants, getOrgTeamMembers } from '@/lib/org-defaults';
import MarkdownText from '@/components/MarkdownText';
import { mergeAiProfile } from '@/lib/ihaa-defaults';
import { workerFetch } from '@/lib/worker-fetch';
import type { Meeting } from '@/lib/meetings-shared';
import { YearPhase, parseLocalDate, normalizePhase } from '@/lib/yearwheel-shared';
import QuickLinksSection from '@/components/sections/QuickLinksSection';

const TONES = ['blue', 'green', 'yellow', 'pink', 'black'] as const;
type Tone = typeof TONES[number];

function toneFor(idLike: number | string | undefined, fallbackIdx = 0): Tone {
  const s = String(idLike ?? fallbackIdx);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return TONES[h % TONES.length];
}

function fmtFi(n: number): string {
  return n.toLocaleString('fi-FI');
}

export default function DashboardPage() {
  const { user, activeOrg } = useAuth();
  const router = useRouter();
  const params = useParams();
  const orgSlug = params.orgSlug as string;
  const [org] = useOrgData<any>('org', {});
  const [aiProfileRaw] = useOrgData<any>('aiProfile', {});
  const aiProfile = (mergeAiProfile(orgSlug, aiProfileRaw) || {}) as Record<string, any>;
  const [projects, setProjects] = useOrgData<any[]>('projects', []);
  const [standaloneTasks, setStandaloneTasks] = useOrgData<any[]>('tasks', []);
  const [teamMessages, setTeamMessages] = useOrgData<any[]>('teamMessages', []);
  const [rawGrants] = useOrgData<Grant[]>(getGrantsKey(orgSlug), getOrgGrants(orgSlug));
  const [orgMembers] = useOrgData<OrgTeamMember[]>('orgTeamMembers', getOrgTeamMembers(orgSlug));
  const [meetings] = useOrgData<Meeting[]>('meetings', []);
  const [yearPhasesRaw] = useOrgData<YearPhase[]>('yearPhases', []);
  const yearPhases = useMemo(() => (yearPhasesRaw || [])
    .filter(p => !p.deletedAt)
    .map(normalizePhase), [yearPhasesRaw]);
  const grants = useMemo(() => rawGrants.map(normalizeGrant), [rawGrants]);

  const myMember = useMemo(() => resolveUserMember(orgMembers, user), [orgMembers, user]);

  const myGrants = useMemo(() => myMember ? grants
    .filter(g => {
      if (g.responsibleId !== myMember.id) return false;
      if (g.status === 'rejected') return false;
      const days = daysUntilDeadline(g);
      if (days !== null && days < 0) return false;
      return true;
    })
    .sort((a, b) => {
      const da = daysUntilDeadline(a) ?? 999999;
      const db = daysUntilDeadline(b) ?? 999999;
      return da - db;
    }) : [], [grants, myMember]);

  const isMobile = useIsMobile();
  const [aiResponse, setAiResponse] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [completedTasks, setCompletedTasks] = useState<Set<string>>(new Set());

  // Quick-add ja tehtävien muokkaus
  const [quickAddText, setQuickAddText] = useState('');
  const [quickAddDeadline, setQuickAddDeadline] = useState('');
  type EditingTask =
    | { kind: 'standalone'; id: string }
    | { kind: 'project'; projectId: number; taskIndex: number };
  const [editingTask, setEditingTask] = useState<EditingTask | null>(null);

  const addQuickTask = () => {
    const text = quickAddText.trim();
    if (!text) return;
    const myName = myMember?.name || user?.displayName || '';
    const newTask = {
      id: `tsk_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      text,
      assignee: myName || undefined,
      deadline: quickAddDeadline || undefined,
      done: false,
      createdAt: Date.now(),
      from: 'Itse',
    };
    setStandaloneTasks([...(standaloneTasks || []), newTask]);
    setQuickAddText('');
    setQuickAddDeadline('');
  };

  const updateStandaloneTask = (id: string, updates: Record<string, any>) => {
    setStandaloneTasks((standaloneTasks || []).map((t: any) => t.id === id ? { ...t, ...updates } : t));
  };

  const deleteStandaloneTask = (id: string) => {
    setStandaloneTasks((standaloneTasks || []).map((t: any) => t.id === id ? { ...t, deletedAt: Date.now() } : t));
  };

  const updateProjectTask = (projectId: number, taskIndex: number, updates: Record<string, any>) => {
    setProjects(prev => prev.map((p: any) => {
      if (p.id !== projectId) return p;
      const tasks = [...(p.tasks || [])];
      if (!tasks[taskIndex]) return p;
      tasks[taskIndex] = { ...tasks[taskIndex], ...updates };
      return { ...p, tasks };
    }));
  };

  const deleteProjectTask = (projectId: number, taskIndex: number) => {
    setProjects(prev => prev.map((p: any) => {
      if (p.id !== projectId) return p;
      const tasks = [...(p.tasks || [])];
      tasks.splice(taskIndex, 1);
      return { ...p, tasks };
    }));
  };

  // Siirrä tehtävä standalone -> projekti
  const moveStandaloneToProject = (standaloneId: string, targetProjectId: number) => {
    const t = (standaloneTasks || []).find((x: any) => x.id === standaloneId);
    if (!t) return;
    setProjects(prev => prev.map((p: any) => {
      if (p.id !== targetProjectId) return p;
      const tasks = [...(p.tasks || []), {
        text: t.text,
        assignee: t.assignee,
        assignees: t.assignees,
        deadline: t.deadline,
        done: !!t.done,
        priority: t.priority || 'normal',
        note: t.note,
      }];
      return { ...p, tasks };
    }));
    setStandaloneTasks((standaloneTasks || []).filter((x: any) => x.id !== standaloneId));
  };

  // Siirrä tehtävä projekti -> standalone
  const moveProjectTaskToStandalone = (projectId: number, taskIndex: number) => {
    const p = projects.find((pp: any) => pp.id === projectId);
    if (!p) return;
    const t = (p.tasks || [])[taskIndex];
    if (!t) return;
    const myName = myMember?.name || user?.displayName || '';
    const newTask = {
      id: `tsk_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      text: t.text,
      assignee: t.assignee || myName,
      assignees: t.assignees,
      deadline: t.deadline,
      done: !!t.done,
      priority: t.priority || 'normal',
      note: t.note,
      createdAt: Date.now(),
      from: 'Itse',
    };
    setStandaloneTasks([...(standaloneTasks || []), newTask]);
    deleteProjectTask(projectId, taskIndex);
  };

  const firstName = user?.displayName?.split(' ')[0] || 'käyttäjä';

  // Typewriter-efekti tervehdykselle
  const greetingFull = `Hei, ${firstName}.`;
  const [typed, setTyped] = useState('');
  const [typingDone, setTypingDone] = useState(false);
  useEffect(() => {
    setTyped('');
    setTypingDone(false);
    let i = 0;
    const tick = () => {
      i++;
      setTyped(greetingFull.slice(0, i));
      if (i >= greetingFull.length) {
        setTypingDone(true);
        return;
      }
      // Pikkupaussi pilkun ja välilyönnin kohdalla
      const ch = greetingFull[i - 1];
      const delay = ch === ',' ? 220 : ch === ' ' ? 90 : 65 + Math.random() * 60;
      timer = setTimeout(tick, delay);
    };
    let timer = setTimeout(tick, 220);
    return () => clearTimeout(timer);
  }, [greetingFull]);

  const myTasks = useMemo(() => {
    const myName = myMember?.name || user?.displayName || '';
    if (!myName) return [];
    const fromProjects = projects.flatMap((p: any) =>
      (p.tasks || []).map((t: any, ti: number) => ({
        ...t,
        projectName: p.t, projectId: p.id, taskIndex: ti, projectTone: p.tone,
      }))
    );
    const fromStandalone = (standaloneTasks || [])
      .filter((t: any) => !t.deletedAt)
      .map((t: any) => ({ ...t, projectName: 'Tehtävät', projectId: null, taskIndex: -1, projectTone: undefined }));
    return [...fromProjects, ...fromStandalone].filter((t: any) => {
      if (t.done) return false;
      if (effectiveStatus(t) === 'rejected') return false;
      return includesAssignee(t, myName);
    });
  }, [projects, standaloneTasks, myMember, user?.displayName]);

  // Project tone map for color-coding
  const projectToneMap = useMemo(() => {
    const m = new Map<number | string, Tone>();
    projects.forEach((p: any, i: number) => {
      const explicit = (p.tone && TONES.includes(p.tone)) ? p.tone as Tone : null;
      m.set(p.id, explicit || toneFor(p.id, i));
    });
    return m;
  }, [projects]);

  interface UnifiedItem {
    id: string;
    kind: 'task' | 'grant';
    title: string;
    subtitle: string;
    projectShort: string;
    tone: Tone;
    deadline?: string;
    deadlineText?: string;
    days: number | null;
    onClick: () => void;
    taskRef?: { projectId: number; taskIndex: number };
    standaloneId?: string;
    kindLabel: string;
  }

  const unifiedList: UnifiedItem[] = useMemo(() => [
    ...myTasks.map((t: any): UnifiedItem => {
      const days = t.deadline ? Math.ceil((new Date(t.deadline).getTime() - Date.now()) / 86400000) : null;
      const tone = projectToneMap.get(t.projectId) || 'blue';
      const isStandalone = t.projectId === null;
      return {
        id: isStandalone ? `task_standalone_${t.id}` : `task_${t.projectId}_${t.taskIndex}`,
        kind: 'task',
        title: t.text,
        subtitle: t.from === 'Itse' ? 'Itse asetettu' : (t.assignedBy ? `Lähettäjä · ${t.assignedBy}` : t.projectName),
        projectShort: (t.projectName || '').toUpperCase().slice(0, 16),
        tone,
        deadline: t.deadline,
        deadlineText: t.deadline ? new Date(t.deadline).toLocaleDateString('fi-FI', { day: 'numeric', month: 'numeric' }) + '.' : '',
        days,
        onClick: () => {
          if (isStandalone) {
            setEditingTask({ kind: 'standalone', id: t.id });
          } else {
            setEditingTask({ kind: 'project', projectId: t.projectId, taskIndex: t.taskIndex });
          }
        },
        taskRef: isStandalone ? undefined : { projectId: t.projectId, taskIndex: t.taskIndex },
        standaloneId: isStandalone ? t.id : undefined,
        kindLabel: 'Tehtävä',
      };
    }),
    ...myGrants.map((g): UnifiedItem => {
      const sd = STATUS_DEFS[g.status];
      const days = daysUntilDeadline(g);
      return {
        id: `grant_${g.id}`,
        kind: 'grant',
        title: `${g.funder}: ${g.grantName}`,
        subtitle: `Apuraha · ${g.year} · ${sd.label}`,
        projectShort: 'APURAHAT',
        tone: 'green',
        deadline: g.deadline,
        deadlineText: g.deadlineText || (g.deadline ? new Date(g.deadline).toLocaleDateString('fi-FI', { day: 'numeric', month: 'numeric' }) + '.' : ''),
        days,
        onClick: () => router.push(`/${orgSlug}/budget`),
        kindLabel: 'Apuraha',
      };
    }),
  ].sort((a, b) => {
    const da = a.days ?? 999999;
    const db = b.days ?? 999999;
    return da - db;
  }), [myTasks, myGrants, router, orgSlug, projectToneMap]);

  const urgentTasks = unifiedList.filter(t => t.days !== null && t.days <= 7);
  const laterTasks = unifiedList.filter(t => t.days === null || t.days > 7);

  const myProjects = useMemo(() => {
    const ids = new Set(myTasks.map((t: any) => t.projectId));
    return projects.filter((p: any) => ids.has(p.id) && !p.archived);
  }, [myTasks, projects]);

  const undoTimers = React.useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const toggleTask = (projectId: number, taskIndex: number) => {
    const key = `${projectId}_${taskIndex}`;
    setCompletedTasks(prev => new Set([...prev, key]));
    if (undoTimers.current[key]) clearTimeout(undoTimers.current[key]);
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

  // Festival countdown — only if org has festivalStartDate
  const festivalStart: Date | null = useMemo(() => {
    const v = (org as any)?.festivalStartDate;
    if (!v) return null;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }, [org]);
  const daysToFestival = festivalStart
    ? Math.max(0, Math.ceil((festivalStart.getTime() - Date.now()) / 86400000))
    : null;

  // Today's agenda from meetings
  const todayMeetings = useMemo(() => {
    if (!meetings || meetings.length === 0) return [];
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const todayStr = `${yyyy}-${mm}-${dd}`;
    return meetings
      .filter(m => !m.deletedAt && m.status !== 'cancelled' && m.date === todayStr)
      .sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''))
      .slice(0, 6);
  }, [meetings]);

  // Waiting (delegated requests where I am the requester)
  const waitingItems = useMemo(() => {
    if (!user?.displayName) return [];
    const myName = user.displayName;
    return (teamMessages || [])
      .filter((m: any) => m.type === 'request' && !m.done && m.from === myName && m.to)
      .slice(0, 6)
      .map((m: any, i: number) => ({
        id: m.id || `w_${i}`,
        title: m.text,
        who: m.to,
        ageDays: m.timestamp ? Math.max(0, Math.floor((Date.now() - m.timestamp) / 86400000)) : null,
        tone: 'blue' as Tone,
      }));
  }, [teamMessages, user?.displayName]);

  // Activity (last 5 team messages, excluding open requests)
  const activityItems = useMemo(() => {
    return (teamMessages || [])
      .filter((m: any) => m.type !== 'request' || m.done)
      .sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0))
      .slice(0, 5)
      .map((m: any, i: number) => ({
        id: m.id || `a_${i}`,
        who: m.from || 'Tiimiläinen',
        verb: m.type === 'request' ? 'merkitsi tehdyksi pyynnön' : 'kirjoitti',
        what: m.text || '',
        t: m.timestamp ? new Date(m.timestamp).toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' }) : '',
        tone: 'blue' as Tone,
      }));
  }, [teamMessages]);

  // Year wheel — käyttää oikeaa yearPhases-dataa Firestoresta. Jos tyhjä, koko sektio piilotetaan.
  const yearPhasesView = useMemo(() => {
    if (yearPhases.length === 0) return [];
    const yr = new Date().getFullYear();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return yearPhases
      .map(p => {
        const sd = p.startDate ? parseLocalDate(p.startDate) : new Date(yr, p.startMonth - 1, 1);
        const ed = p.endDate ? parseLocalDate(p.endDate) : new Date(yr, p.endMonth, 0);
        const total = ed.getTime() - sd.getTime();
        const elapsed = today.getTime() - sd.getTime();
        const status: 'done' | 'cur' | 'todo' = today > ed ? 'done' : (today >= sd ? 'cur' : 'todo');
        const pct = status === 'done' ? 100 : status === 'cur' ? Math.max(0, Math.min(100, Math.round(elapsed / total * 100))) : 0;
        // Map category color → tone keyword
        const catTone: Record<string, Tone> = { planning: 'blue', production: 'yellow', execution: 'pink', reflection: 'green' };
        const tone = catTone[p.category] || 'blue';
        const monthsLabel = (() => {
          const start = sd.toLocaleDateString('fi-FI', { month: 'short' });
          const end = ed.toLocaleDateString('fi-FI', { month: 'short' });
          return `${start.toUpperCase()}–${end.toUpperCase()}`.replace(/\./g, '');
        })();
        return { id: p.id, name: p.name, monthsLabel, tone, status, pct, sd };
      })
      .sort((a, b) => a.sd.getTime() - b.sd.getTime());
  }, [yearPhases]);
  const currentPhaseIdx = yearPhasesView.findIndex(p => p.status === 'cur');

  // Grants summary — myönnetty + haetut tämän vuoden, ja upcoming = vielä
  // avoinna olevat (status=planning, deadline tulevaisuudessa tai jatkuva).
  const grantsSummary = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const isThisYear = (g: Grant) => {
      if (!g.deadline) return true; // jatkuva / vuosittainen
      return new Date(g.deadline).getFullYear() === currentYear;
    };
    const awarded = grants
      .filter(g => g.status === 'confirmed' && isThisYear(g))
      .reduce((s, g) => s + (g.amount || 0), 0);
    const applied = grants
      .filter(g => g.status === 'applied' && isThisYear(g))
      .reduce((s, g) => s + (g.amount || 0), 0);
    const todayIso = new Date().toISOString().slice(0, 10);
    const upcoming = grants
      .filter(g => g.status === 'planning' && (!g.deadline || g.deadline >= todayIso))
      .sort((a, b) => (daysUntilDeadline(a) ?? 999999) - (daysUntilDeadline(b) ?? 999999))
      .slice(0, 3);
    return { awarded, applied, upcoming };
  }, [grants]);

  const askAI = async (prompt: string) => {
    setAiLoading(true); setAiResponse('');
    try {
      const isJuhla = orgSlug === 'juhlatoimikunta';
      const systemCtx = isJuhla
        ? 'Olet osaava ja inspiroiva juhlajärjestäjä-AI. Vastaa lyhyesti, lämminhenkisesti ja konkreettisesti suomeksi.'
        : `Olet ${org.name || 'organisaation'} viestinnän AI-kumppani. Vastaa lyhyesti ja konkreettisesti suomeksi. ${org.commsMission ? 'Viestinnän missio: ' + org.commsMission : ''} ${org.tone?.length ? 'Sävyt: ' + org.tone.join(', ') : ''}`;
      const res = await workerFetch('/api/chat', {
        method: 'POST',
        orgId: activeOrg || '',
        body: JSON.stringify({ messages: [{ role: 'user', content: prompt }], systemContext: systemCtx }),
      });
      if (res.ok) { const data = await res.json(); setAiResponse(data.response || ''); }
    } catch { setAiResponse('Yhteysvirhe. Yritä uudelleen.'); }
    finally { setAiLoading(false); }
  };

  const dateKicker = (() => {
    const d = new Date();
    const wd = new Intl.DateTimeFormat('fi-FI', { weekday: 'long' }).format(d);
    const dm = new Intl.DateTimeFormat('fi-FI', { day: 'numeric', month: 'numeric', year: 'numeric' }).format(d);
    return `${wd.charAt(0).toUpperCase() + wd.slice(1)} ${dm}`;
  })();

  const urgentCount = urgentTasks.length;
  const tasksCountLabel = unifiedList.length === 0
    ? 'Ei avoimia tehtäviä'
    : urgentCount > 0
      ? `${urgentCount} kiireellistä, loput voi tehdä myöhemmin`
      : `${unifiedList.length} avointa tehtävää`;

  // Renderöi yksi tehtävärivi
  const TaskRow = ({ item }: { item: UnifiedItem }) => {
    const standaloneTask = item.standaloneId ? (standaloneTasks || []).find((t: any) => t.id === item.standaloneId) : null;
    const isDone = item.taskRef
      ? completedTasks.has(`${item.taskRef.projectId}_${item.taskRef.taskIndex}`)
      : (standaloneTask?.done || false);
    const isUrgent = item.days !== null && item.days <= 7;
    const dueLabel = item.days === 0 ? 'Tänään'
      : (item.days !== null && item.days > 0 ? `${item.days} pv` : (item.deadlineText || ''));
    return (
      <div className="trow" style={{ '--c': `var(--${item.tone})`, opacity: isDone ? 0.45 : 1, textDecoration: isDone ? 'line-through' : 'none', userSelect: 'none' } as React.CSSProperties}>
        {item.kind === 'task' && item.taskRef ? (
          <button
            type="button"
            className="chk"
            aria-label={isDone ? 'Palauta' : 'Merkitse tehdyksi'}
            onClick={(e) => {
              e.stopPropagation();
              if (isDone) undoTask(item.taskRef!.projectId, item.taskRef!.taskIndex);
              else toggleTask(item.taskRef!.projectId, item.taskRef!.taskIndex);
            }}
            style={{ background: isDone ? 'var(--ink)' : 'transparent' }}
          />
        ) : item.kind === 'task' && item.standaloneId ? (
          <button
            type="button"
            className="chk"
            aria-label={isDone ? 'Palauta' : 'Merkitse tehdyksi'}
            onClick={(e) => {
              e.stopPropagation();
              updateStandaloneTask(item.standaloneId!, { done: !isDone, completedAt: !isDone ? Date.now() : undefined });
            }}
            style={{ background: isDone ? 'var(--ink)' : 'transparent' }}
          />
        ) : (
          <span className="chk" style={{ background: 'var(--c, var(--ink))', borderColor: 'var(--c, var(--ink))' }} aria-hidden />
        )}
        <span className="ptag" title={item.projectShort}><span>{item.projectShort}</span></span>
        <div onClick={item.onClick} style={{ cursor: 'pointer', minWidth: 0 }}>
          <div className="ttitle">{item.title}</div>
          <div className="tsub">{item.subtitle}</div>
        </div>
        <span className="tkind">{item.kindLabel}</span>
        <span className={`tdue ${isUrgent ? 'urg' : ''}`}>{dueLabel}</span>
      </div>
    );
  };

  return (
    <AppShell title="Koti" subtitle={org.name || ''} hideTitle>
      {/* Hero */}
      <section className="hero">
        <div className="hero-l">
          <div className="kicker">{dateKicker}</div>
          <h1 aria-label={greetingFull}>
            <span aria-hidden>{typed || '\u00A0'}</span>
            <span className={`tw-cur ${typingDone ? 'tw-cur--done' : ''}`} aria-hidden />
          </h1>
          <p className="lede" style={{ opacity: typingDone ? 1 : 0, transition: 'opacity .4s ease' }}>
            <b>{tasksCountLabel}.</b> {urgentCount > 0
              ? 'Aloita kiireellisistä, loput voit tehdä huomenna tai delegoida.'
              : 'Hyvä päivä keskittyä projektisuunnitteluun ja inspiraation hakuun.'}
          </p>
        </div>
        {daysToFestival !== null && (
          <div className="count">
            <div className="top"></div>
            <div className="body">
              <div className="ttl">Festivaaliin</div>
              <div className="num">{daysToFestival}</div>
              <div className="lbl">päivää</div>
              <div className="meta">
                <span><b>{festivalStart?.toLocaleDateString('fi-FI', { day: 'numeric', month: 'numeric' })}.</b></span>
                <span>VK <b>{Math.ceil(daysToFestival / 7)}</b></span>
              </div>
            </div>
          </div>
        )}
      </section>

      <div className="cols">
        <div>
          {/* Tehtäväsi */}
          <section style={{ marginBottom: 32 }}>
            <div className="sec-h">
              <div className="t"><span className="n">01</span>Tehtäväsi</div>
              <div className="meta"><b>{unifiedList.length}</b> Avointa{urgentCount > 0 ? <> · <b>{urgentCount}</b> Kiireellistä</> : null}</div>
            </div>

            {/* Pikalisäys */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
              <input
                value={quickAddText}
                onChange={(e) => setQuickAddText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addQuickTask(); }}
                placeholder="Lisää tehtävä — paina Enter"
                style={{ flex: '1 1 280px', minWidth: 200, background: 'transparent', border: '1px solid var(--rule, var(--border))', padding: '8px 10px', fontSize: 14, color: 'var(--ink)' }}
              />
              <input
                type="date"
                value={quickAddDeadline}
                onChange={(e) => setQuickAddDeadline(e.target.value)}
                title="Deadline (valinnainen)"
                style={{ background: 'transparent', border: '1px solid var(--rule, var(--border))', padding: '8px 10px', fontSize: 13, color: 'var(--ink)' }}
              />
              <button
                type="button"
                onClick={addQuickTask}
                disabled={!quickAddText.trim()}
                style={{
                  fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '.16em', textTransform: 'uppercase',
                  background: quickAddText.trim() ? 'var(--ink)' : 'transparent',
                  color: quickAddText.trim() ? 'var(--paper)' : 'var(--ink3)',
                  border: quickAddText.trim() ? 'none' : '1px solid var(--rule, var(--border))',
                  padding: '8px 14px',
                  cursor: quickAddText.trim() ? 'pointer' : 'not-allowed',
                }}
              >
                Lisää
              </button>
            </div>

            {unifiedList.length === 0 ? (
              <div style={{ padding: '24px 0', color: 'var(--ink2)', fontSize: 14 }}>
                Ei avoimia tehtäviä sinulle. Projektitehtäviä voi määritellä Projektit-sivulta, apurahoja Apurahat-sivulta.
              </div>
            ) : (
              <div className="tlist">
                {urgentTasks.length > 0 && <div className="tg">Kiireellinen — viikon sisällä</div>}
                {urgentTasks.map(item => <TaskRow key={item.id} item={item} />)}
                {laterTasks.length > 0 && <div className="tg" style={{ paddingTop: 18 }}>Myöhemmin</div>}
                {laterTasks.map(item => <TaskRow key={item.id} item={item} />)}
              </div>
            )}
          </section>

          {/* Projektisi */}
          {myProjects.length > 0 && (
            <section style={{ marginBottom: 32 }}>
              <div className="sec-h">
                <div className="t"><span className="n">02</span>Projektisi</div>
                <button className="btn-link" onClick={() => router.push(`/${orgSlug}/projects`)}>Kaikki projektit ↗</button>
              </div>
              <div className="pgrid">
                {myProjects.slice(0, 5).map((p: any) => {
                  const tone = projectToneMap.get(p.id) || 'blue';
                  const myOpen = (p.tasks || []).filter((t: any) => t.assignee === user?.displayName && !t.done).length;
                  const totalTasks = (p.tasks || []).length;
                  const done = (p.tasks || []).filter((t: any) => t.done).length;
                  const progress = totalTasks > 0 ? Math.round((done / totalTasks) * 100) : 0;
                  const dl = p.deadline ? new Date(p.deadline).toLocaleDateString('fi-FI', { day: 'numeric', month: 'numeric' }) + '.' : '—';
                  return (
                    <div key={p.id} className="pcard" style={{ '--c': `var(--${tone})` } as React.CSSProperties}
                      onClick={() => router.push(`/${orgSlug}/projects`)}>
                      <div className="pkick">{(p.t || '').slice(0, 18).toUpperCase()}</div>
                      <div className="pname">{p.t}</div>
                      <div className="plead">{p.lead || p.responsible || '—'}{p.phase ? ` · ${p.phase}` : ''}</div>
                      <div className="pbottom">
                        <div className="ppct">{progress}<sub>%</sub></div>
                        <div className="pbar"><i style={{ width: `${progress}%` }} /></div>
                        <div className="popen">
                          <span><b>{myOpen}</b> Avointa</span>
                          <span>DL <b>{dl}</b></span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Vuosirytmi — vain jos käyttäjä on lisännyt vaiheita yearwheel-sivulla */}
          {yearPhasesView.length > 0 && (
            <section style={{ marginBottom: 32 }}>
              <div className="sec-h">
                <div className="t"><span className="n">03</span>Vuosirytmi {new Date().getFullYear()}</div>
                {currentPhaseIdx >= 0 && (
                  <div className="meta">Vaihe <b>{currentPhaseIdx + 1} / {yearPhasesView.length}</b></div>
                )}
              </div>
              <div className="year" style={{ gridTemplateColumns: `repeat(${Math.min(yearPhasesView.length, 6)}, 1fr)` }}>
                {yearPhasesView.slice(0, 6).map(q => (
                  <div key={q.id} className={`q ${q.status === 'cur' ? 'cur' : ''} ${q.status === 'done' ? 'done' : ''}`} style={{ '--c': `var(--${q.tone})` } as React.CSSProperties}
                    onClick={() => router.push(`/${orgSlug}/yearwheel`)}>
                    <div className="top" />
                    <div className="ql">{q.monthsLabel}</div>
                    <div className="qt">{q.name}</div>
                    <div className="qbar"><i style={{ width: `${q.pct}%` }} /></div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Pikalinkit — yhteiset + omat */}
          <QuickLinksSection />

          {/* Tiimin aktiviteetti */}
          {activityItems.length > 0 && (
            <section style={{ marginBottom: 8 }}>
              <div className="sec-h">
                <div className="t"><span className="n">05</span>Mitä tiimissä tapahtui</div>
                <button className="btn-link" onClick={() => router.push(`/${orgSlug}/viestit`)}>Kaikki ↗</button>
              </div>
              <div className="activity">
                {activityItems.map(a => (
                  <div key={a.id} className="act-row" style={{ '--c': `var(--${a.tone})` } as React.CSSProperties}>
                    <div className="at">{a.t}</div>
                    <div className="ax">
                      <b>{a.who}</b> {a.verb} <i>{a.what}</i>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* AI Actions */}
          {(() => {
            const isJuhla = orgSlug === 'juhlatoimikunta';
            const activeProjectsList = projects.filter((p: any) => p.st === 'active' && !p.archived).map((p: any) => p.t).join(', ') || 'ei aktiivisia';
            const defaultStatus = isJuhla
              ? 'Anna tilannekatsaus juhlien järjestelyistä.'
              : 'Anna tilannekatsaus ' + (org.name || 'organisaation') + ' viestinnästä juuri nyt. Aktiiviset projektit: ' + activeProjectsList + '. Avoimia tehtäviä: ' + myTasks.length + '.';
            const defaultInsp = 'Kerro yksi todellinen, dokumentoitu esimerkki kulttuurialan järjestöstä joka muutti maailmaa.';
            const statusPrompt = aiProfile?.statusPrompt
              ? (aiProfile.statusPrompt as string)
                  .replace('{tasks}', String(myTasks.length))
                  .replace('{activeProjects}', activeProjectsList)
                  .replace('{orgName}', org.name || 'organisaation')
              : defaultStatus;
            const inspPrompt: string = aiProfile?.inspirationPrompt || defaultInsp;
            const statusDesc: string = aiProfile?.statusDesc || (isJuhla ? 'Missä mennään juhlien järjestelyissä?' : 'Mitä viestinnässä tapahtuu juuri nyt?');
            const statusLabel: string = aiProfile?.statusLabel || 'Tilannekatsaus';
            const inspDesc: string = aiProfile?.inspirationDesc || 'Inspiraatiota kulttuurialan vaikuttavista esimerkeistä';
            const inspLabel: string = aiProfile?.inspirationLabel || 'Inspiraatiota';
            return (
              <section style={{ marginTop: 32, marginBottom: 16 }}>
                <div className="sec-h">
                  <div className="t"><span className="n">06</span>Hetki ehdottaa</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 0, border: '1px solid var(--rule)' }}>
                  <div onClick={() => askAI(statusPrompt)} style={{ padding: '20px 22px', cursor: 'pointer', background: 'var(--paper-l)', borderRight: isMobile ? 'none' : '1px solid var(--rule)', borderBottom: isMobile ? '1px solid var(--rule)' : 'none' }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 10, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 8 }}>{statusLabel}</div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.02em', color: 'var(--ink)', marginBottom: 6 }}>Pyydä tilannekatsaus</div>
                    <div style={{ fontSize: 12, color: 'var(--ink2)', lineHeight: 1.5 }}>{statusDesc}</div>
                  </div>
                  <div onClick={() => askAI(inspPrompt)} style={{ padding: '20px 22px', cursor: 'pointer', background: 'var(--paper-l)' }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 10, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--green)', marginBottom: 8 }}>{inspLabel}</div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.02em', color: 'var(--ink)', marginBottom: 6 }}>Hae inspiraatiota</div>
                    <div style={{ fontSize: 12, color: 'var(--ink2)', lineHeight: 1.5 }}>{inspDesc}</div>
                  </div>
                </div>
              </section>
            );
          })()}

          {(aiLoading || aiResponse) && (
            <section style={{ marginTop: 16 }}>
              <div style={{ background: 'var(--paper-l)', border: '1px solid var(--rule)', padding: '20px 22px', position: 'relative' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'var(--accent)' }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 10, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--accent)' }}>Hetki</span>
                  {aiResponse && <button className="btn-link" onClick={() => setAiResponse('')} style={{ marginLeft: 'auto' }}>Sulje</button>}
                </div>
                {aiLoading ? (
                  <div className="typing"><span /><span /><span /></div>
                ) : (
                  <MarkdownText text={aiResponse} style={{ fontSize: 14, color: 'var(--ink)', lineHeight: 1.7 }} />
                )}
              </div>
            </section>
          )}
        </div>

        {/* Right column */}
        <div>
          {/* Tänään (Agenda) */}
          {todayMeetings.length > 0 && (
            <section className="rsec">
              <div className="sec-h">
                <div className="t">Tänään</div>
                <div className="meta">{new Intl.DateTimeFormat('fi-FI', { weekday: 'short', day: 'numeric', month: 'numeric' }).format(new Date())}</div>
              </div>
              <div className="agenda">
                {todayMeetings.map((m, i) => {
                  const time = m.startTime || '';
                  const dur = (m.startTime && m.endTime) ? (() => {
                    const [sh, sm] = m.startTime.split(':').map(Number);
                    const [eh, em] = m.endTime.split(':').map(Number);
                    if (Number.isFinite(sh) && Number.isFinite(eh)) {
                      return Math.max(0, (eh * 60 + (em || 0)) - (sh * 60 + (sm || 0)));
                    }
                    return null;
                  })() : null;
                  return (
                    <div key={m.id || i} className="agrow" style={{ '--c': `var(--blue)` } as React.CSSProperties}>
                      <div>
                        <div className="ag-time">{time}</div>
                        {dur ? <span className="ag-dur">{dur} min</span> : <span className="ag-dur">—</span>}
                      </div>
                      <div>
                        <div className="ag-t">{m.title || '(Nimetön)'}</div>
                        {m.attendees && m.attendees.length > 0 && (
                          <div className="ag-w">{m.attendees.map(a => a.name).filter(Boolean).slice(0, 3).join(', ')}</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Odottaa muilta */}
          {waitingItems.length > 0 && (
            <section className="rsec">
              <div className="sec-h">
                <div className="t">Odottaa muilta</div>
                <div className="meta"><b>{waitingItems.length}</b> Kohdetta</div>
              </div>
              <div className="wlist">
                {waitingItems.map(w => (
                  <div key={w.id} className="wrow" style={{ '--c': `var(--${w.tone})` } as React.CSSProperties}>
                    <div>
                      <div className="wt">{w.title}</div>
                      <div className="ww"><span className="dot" />{w.who}</div>
                    </div>
                    <div className="wage">{w.ageDays !== null ? `${w.ageDays} pv` : '—'}</div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Apurahat */}
          {grants.length > 0 && (
            <section className="rsec">
              <div className="sec-h">
                <div className="t">Apurahat</div>
                <button className="btn-link" onClick={() => router.push(`/${orgSlug}/budget`)}>Kaikki ↗</button>
              </div>
              <div className="gr-stats">
                <div className="gr-stat">
                  <div className="l">Myönnetty</div>
                  <div className="v">{fmtFi(grantsSummary.awarded)}<span className="cur">€</span></div>
                </div>
                <div className="gr-stat">
                  <div className="l">Haettu</div>
                  <div className="v lite">{fmtFi(grantsSummary.applied)}<span className="cur">€</span></div>
                </div>
              </div>
              {grantsSummary.upcoming.length > 0 && (
                <div className="gr-list">
                  {grantsSummary.upcoming.map((g, i) => {
                    const sd = STATUS_DEFS[g.status];
                    const tone = toneFor(g.id, i);
                    return (
                      <div key={g.id} className="gr-row" style={{ '--c': `var(--${tone})` } as React.CSSProperties}>
                        <div>
                          <div className="gn">{g.funder}</div>
                          <div className="gst">{sd.label}</div>
                        </div>
                        <div className="gd">DL {g.deadlineText || (g.deadline ? new Date(g.deadline).toLocaleDateString('fi-FI', { day: 'numeric', month: 'numeric' }) + '.' : '—')}</div>
                        <div className="ga">{g.amount > 0 ? `${fmtFi(g.amount)} €` : '—'}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {/* Pyynnöt sinulle (jos on) */}
          {(() => {
            const myRequests = (teamMessages || []).filter((m: any) => m.type === 'request' && m.to === user?.displayName && !m.done);
            if (myRequests.length === 0) return null;
            return (
              <section className="rsec">
                <div className="sec-h">
                  <div className="t">Pyynnöt sinulle</div>
                  <div className="meta"><b>{myRequests.length}</b></div>
                </div>
                <div className="wlist">
                  {myRequests.map((msg: any) => (
                    <div key={msg.id} className="wrow" style={{ '--c': `var(--yellow)` } as React.CSSProperties}>
                      <div>
                        <div className="wt">{msg.text}</div>
                        <div className="ww"><span className="dot" />{msg.from}</div>
                      </div>
                      <button
                        className="btn-link"
                        onClick={() => setTeamMessages(prev => prev.map((m: any) => m.id === msg.id ? { ...m, done: true } : m))}
                      >
                        Tehty
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            );
          })()}

          {/* Linkitysvinkki */}
          {!myMember && myGrants.length === 0 && orgMembers.length > 0 && (
            <section className="rsec">
              <div style={{ padding: '14px 16px', border: '1px solid var(--rule)', background: 'var(--paper-l)' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 10, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--yellow)', marginBottom: 6 }}>Vinkki</div>
                <div style={{ fontSize: 12, color: 'var(--ink2)', lineHeight: 1.5 }}>
                  Käyttäjätiliäsi ei ole linkitetty tiimiläistietoihin. Apurahat ja vastuut näkyvät kun tiimissäsi on tiimiläinen jonka nimi tai sähköposti vastaa sinua.
                </div>
                <button className="btn-link" onClick={() => router.push(`/${orgSlug}/team`)} style={{ marginTop: 10 }}>Avaa Tiimi ↗</button>
              </div>
            </section>
          )}
        </div>
      </div>

      {editingTask && (
        <TaskEditDialog
          key={editingTask.kind === 'standalone' ? `s_${editingTask.id}` : `p_${editingTask.projectId}_${editingTask.taskIndex}`}
          task={(() => {
            if (editingTask.kind === 'standalone') {
              const t = (standaloneTasks || []).find((x: any) => x.id === editingTask.id);
              return t ? { text: t.text, deadline: t.deadline, projectId: null, done: !!t.done, note: t.note } : null;
            }
            const p = projects.find((pp: any) => pp.id === editingTask.projectId);
            const t = p?.tasks?.[editingTask.taskIndex];
            return t ? { text: t.text, deadline: t.deadline, projectId: editingTask.projectId, done: !!t.done, note: t.note } : null;
          })()}
          projects={projects}
          onClose={() => setEditingTask(null)}
          onSave={(updates, targetProjectId) => {
            if (editingTask.kind === 'standalone') {
              if (targetProjectId !== null) {
                // Siirrä projektiin ja päivitä
                const t = (standaloneTasks || []).find((x: any) => x.id === editingTask.id);
                if (t) {
                  setProjects(prev => prev.map((p: any) => {
                    if (p.id !== targetProjectId) return p;
                    return {
                      ...p,
                      tasks: [...(p.tasks || []), {
                        text: updates.text ?? t.text,
                        assignee: t.assignee,
                        assignees: t.assignees,
                        deadline: updates.deadline === '' ? undefined : (updates.deadline ?? t.deadline),
                        done: !!t.done,
                        priority: t.priority || 'normal',
                        note: updates.note ?? t.note,
                      }],
                    };
                  }));
                  setStandaloneTasks((standaloneTasks || []).filter((x: any) => x.id !== editingTask.id));
                }
              } else {
                updateStandaloneTask(editingTask.id, {
                  ...updates,
                  deadline: updates.deadline === '' ? undefined : updates.deadline,
                });
              }
            } else {
              if (targetProjectId === null) {
                // Siirrä standaloneksi ja päivitä
                moveProjectTaskToStandalone(editingTask.projectId, editingTask.taskIndex);
                // Yllä oleva luo uuden standalonen, mutta päivitykset eivät tartu — käsitellään erikseen:
                setTimeout(() => {
                  setStandaloneTasks(prev => {
                    const last = prev[prev.length - 1];
                    if (!last) return prev;
                    return [...prev.slice(0, -1), {
                      ...last,
                      text: updates.text ?? last.text,
                      deadline: updates.deadline === '' ? undefined : (updates.deadline ?? last.deadline),
                      note: updates.note ?? last.note,
                    }];
                  });
                }, 0);
              } else if (targetProjectId !== editingTask.projectId) {
                // Siirrä toiseen projektiin
                const p = projects.find((pp: any) => pp.id === editingTask.projectId);
                const t = p?.tasks?.[editingTask.taskIndex];
                if (t) {
                  setProjects(prev => prev.map((pp: any) => {
                    if (pp.id === editingTask.projectId) {
                      const tasks = [...(pp.tasks || [])];
                      tasks.splice(editingTask.taskIndex, 1);
                      return { ...pp, tasks };
                    }
                    if (pp.id === targetProjectId) {
                      return {
                        ...pp,
                        tasks: [...(pp.tasks || []), {
                          ...t,
                          text: updates.text ?? t.text,
                          deadline: updates.deadline === '' ? undefined : (updates.deadline ?? t.deadline),
                          note: updates.note ?? t.note,
                        }],
                      };
                    }
                    return pp;
                  }));
                }
              } else {
                updateProjectTask(editingTask.projectId, editingTask.taskIndex, {
                  ...updates,
                  deadline: updates.deadline === '' ? undefined : updates.deadline,
                });
              }
            }
            setEditingTask(null);
          }}
          onDelete={() => {
            if (editingTask.kind === 'standalone') deleteStandaloneTask(editingTask.id);
            else deleteProjectTask(editingTask.projectId, editingTask.taskIndex);
            setEditingTask(null);
          }}
        />
      )}
    </AppShell>
  );
}

function TaskEditDialog({
  task,
  projects,
  onClose,
  onSave,
  onDelete,
}: {
  task: { text: string; deadline?: string; projectId: number | null; done: boolean; note?: string } | null;
  projects: any[];
  onClose: () => void;
  onSave: (updates: { text?: string; deadline?: string; note?: string }, targetProjectId: number | null) => void;
  onDelete: () => void;
}) {
  const [text, setText] = useState(task?.text || '');
  const [deadline, setDeadline] = useState(task?.deadline || '');
  const [projectId, setProjectId] = useState<number | null>(task?.projectId ?? null);
  const [note, setNote] = useState(task?.note || '');

  if (!task) return null;

  const submit = () => {
    onSave({ text: text.trim(), deadline: deadline || '', note: note.trim() || undefined }, projectId);
  };

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: 'var(--paper, var(--card))', border: '1px solid var(--rule, var(--border))', padding: 24, width: 'min(480px, 100%)', display: 'flex', flexDirection: 'column', gap: 12 }}
      >
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 12, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--ink2)', margin: 0 }}>
          Muokkaa tehtävää
        </h3>

        <input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Tehtävän teksti"
          style={{ background: 'transparent', border: '1px solid var(--rule, var(--border))', padding: '8px 10px', fontFamily: 'var(--font-display)', fontSize: 14, color: 'var(--ink)' }}
        />

        <label style={{ fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink3)' }}>Deadline</label>
        <input
          type="date"
          value={deadline}
          onChange={(e) => setDeadline(e.target.value)}
          style={{ background: 'transparent', border: '1px solid var(--rule, var(--border))', padding: '6px 8px', fontSize: 13, color: 'var(--ink)' }}
        />

        <label style={{ fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink3)' }}>Projekti</label>
        <select
          value={projectId ?? ''}
          onChange={(e) => setProjectId(e.target.value ? Number(e.target.value) : null)}
          style={{ background: 'transparent', border: '1px solid var(--rule, var(--border))', padding: '6px 8px', fontSize: 13, color: 'var(--ink)' }}
        >
          <option value="">— Ei projektia (itsenäinen tehtävä) —</option>
          {projects.filter((p: any) => !p.archived && !p.deletedAt).map((p: any) => (
            <option key={p.id} value={p.id}>{p.t || p.name || `Projekti ${p.id}`}</option>
          ))}
        </select>

        <label style={{ fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink3)' }}>Muistiinpano (valinnainen)</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          style={{ background: 'transparent', border: '1px solid var(--rule, var(--border))', padding: '8px 10px', fontSize: 13, color: 'var(--ink)', resize: 'vertical' }}
        />

        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button
            type="button"
            onClick={submit}
            disabled={!text.trim()}
            style={{
              fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '.16em', textTransform: 'uppercase',
              background: text.trim() ? 'var(--ink)' : 'transparent',
              color: text.trim() ? 'var(--paper, var(--card))' : 'var(--ink3)',
              border: text.trim() ? 'none' : '1px solid var(--rule, var(--border))',
              padding: '8px 16px',
              cursor: text.trim() ? 'pointer' : 'not-allowed',
            }}
          >
            Tallenna
          </button>
          <button
            type="button"
            onClick={() => { if (confirm('Poistetaanko tehtävä?')) onDelete(); }}
            style={{ fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '.16em', textTransform: 'uppercase', background: 'transparent', color: '#c14545', border: '1px solid #c14545', padding: '8px 16px', cursor: 'pointer' }}
          >
            Poista
          </button>
          <button
            type="button"
            onClick={onClose}
            style={{ marginLeft: 'auto', fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '.16em', textTransform: 'uppercase', background: 'transparent', color: 'var(--ink2)', border: '1px solid var(--rule, var(--border))', padding: '8px 16px', cursor: 'pointer' }}
          >
            Peruuta
          </button>
        </div>
      </div>
    </div>
  );
}
