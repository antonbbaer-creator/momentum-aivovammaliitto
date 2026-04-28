'use client';

import { useMemo, useState } from 'react';
import { useUserData } from '@/lib/use-user-data';
import {
  PersonalTask,
  PersonalCategory,
  PersonalSettings,
  Routine,
  RoutineLog,
  AssignedTaskMirror,
  newId,
} from '@/lib/personal-shared';
import { useAssignedTasks } from '@/lib/use-assigned-tasks';
import {
  weekProgress,
  consecutiveMetWeeks,
  isLoggedDone,
  upsertLog,
  intentLabel,
  REQUIRED_WEEKS_TO_ESTABLISH,
} from '@/lib/routines-shared';

interface DraftTask {
  text: string;
  categoryId: string;
  deadline: string;
}

const emptyDraft = (): DraftTask => ({ text: '', categoryId: '', deadline: '' });

export default function PersonalHomeSection() {
  const [tasks, setTasks] = useUserData<PersonalTask[]>('tasks', []);
  const [categories] = useUserData<PersonalCategory[]>('categories', []);
  const [routines] = useUserData<Routine[]>('routines', []);
  const [routineLogs, setRoutineLogs] = useUserData<RoutineLog[]>('routineLogs', []);
  const [personalSettings] = useUserData<PersonalSettings>('settings', { weekStart: 'mon', dayStart: '06:00', dayEnd: '23:00' });
  const { assigned, byOrg, loading: assignedLoading } = useAssignedTasks();
  const today = useMemo(() => new Date(), []);
  const weekStartDay = personalSettings?.weekStart || 'mon';
  const activeRoutines = useMemo(() => routines.filter(r => r.status === 'active'), [routines]);

  const [draft, setDraft] = useState<DraftTask>(emptyDraft());
  const [adding, setAdding] = useState(false);

  const visibleTasks = useMemo(
    () => tasks.filter(t => !t.deletedAt).sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      const ad = a.deadline || '9999';
      const bd = b.deadline || '9999';
      return ad.localeCompare(bd);
    }),
    [tasks],
  );

  const submit = () => {
    const text = draft.text.trim();
    if (!text) return;
    const t: PersonalTask = {
      id: newId(),
      text,
      done: false,
      categoryId: draft.categoryId || undefined,
      deadline: draft.deadline || undefined,
      createdAt: Date.now(),
    };
    setTasks(prev => [...prev, t]);
    setDraft(emptyDraft());
    setAdding(false);
  };

  const toggleDone = (id: string) => {
    setTasks(prev => prev.map(t => t.id === id ? {
      ...t, done: !t.done, completedAt: !t.done ? Date.now() : undefined,
    } : t));
  };

  const remove = (id: string) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, deletedAt: Date.now() } : t));
  };

  const catColor = (id?: string) => categories.find(c => c.id === id)?.color || 'var(--ink3)';
  const catName = (id?: string) => categories.find(c => c.id === id)?.name || '';

  const toggleRoutineToday = (routineId: string) => {
    const already = isLoggedDone(routineId, today, routineLogs);
    setRoutineLogs(prev => upsertLog(prev, routineId, today, !already));
  };

  return (
    <div style={{ padding: '0 36px 60px', display: 'flex', flexDirection: 'column', gap: 32 }}>
      {/* Tämän viikon rutiinit */}
      <section>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 13, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--ink2)', margin: 0 }}>
            Tämän viikon rutiinit
          </h2>
          <a href="/oma/rutiinit" style={{ fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--ink2)', textDecoration: 'none' }}>
            Hallitse →
          </a>
        </div>
        {activeRoutines.length === 0 ? (
          <div style={{ color: 'var(--ink3)', fontSize: 13, fontStyle: 'italic' }}>
            Ei aktiivisia rutiineja — <a href="/oma/rutiinit" style={{ color: 'var(--ink2)' }}>lisää sivulla Rutiinit</a>.
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {activeRoutines.map(r => {
              const wp = weekProgress(r, routineLogs, today, weekStartDay);
              const streak = consecutiveMetWeeks(r, routineLogs, today, weekStartDay);
              const todayDone = isLoggedDone(r.id, today, routineLogs);
              const intentAccent =
                r.status === 'established' ? 'var(--green, #185e5b)'
                : r.intent === 'start' ? 'var(--hetki-yellow, #f1b434)'
                : r.intent === 'stop' ? 'var(--red, #c14545)'
                : 'var(--pri, #056b9f)';
              const accent = r.categoryId ? catColor(r.categoryId) : intentAccent;
              return (
                <div
                  key={r.id}
                  style={{
                    flex: '1 1 280px',
                    minWidth: 240,
                    border: '1px solid var(--rule)',
                    borderTop: `3px solid ${accent}`,
                    padding: 14,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <button
                      onClick={() => toggleRoutineToday(r.id)}
                      title={todayDone ? 'Peru tämän päivän kirjaus' : 'Tein tänään'}
                      style={{
                        width: 22, height: 22, padding: 0,
                        border: '1px solid var(--ink2)',
                        background: todayDone ? 'var(--green, #185e5b)' : 'transparent',
                        cursor: 'pointer',
                        flexShrink: 0,
                      }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, color: 'var(--ink)' }}>{r.title}</div>
                      <div style={{ fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink3)' }}>
                        {intentLabel[r.intent]} · {wp.done}/{wp.target} tällä vk
                      </div>
                    </div>
                  </div>
                  {/* Vakiintumismittari */}
                  <div style={{ display: 'flex', gap: 4 }}>
                    {Array.from({ length: REQUIRED_WEEKS_TO_ESTABLISH }).map((_, i) => (
                      <div key={i} style={{ flex: 1, height: 5, background: i < streak ? accent : 'var(--rule)' }} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Aggregoidut tehtävät orgeista */}
      <section>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 13, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--ink2)', margin: '0 0 12px' }}>
          Tehtävät tiimeistäni
        </h2>
        {assignedLoading ? (
          <div style={{ color: 'var(--ink3)', fontSize: 13 }}>Ladataan…</div>
        ) : assigned.length === 0 ? (
          <div style={{ color: 'var(--ink3)', fontSize: 13, fontStyle: 'italic' }}>
            Ei avoimia tehtäviä missään tiimissä juuri nyt.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {Object.entries(byOrg).map(([orgId, list]) => (
              <div key={orgId}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--ink2)', marginBottom: 6 }}>
                  {list[0]?.orgName || orgId}
                </div>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {list.map((t: AssignedTaskMirror) => {
                    const href = t.sourceType === 'noteAction'
                      ? `/${t.orgId}/muistiinpanot`
                      : `/${t.orgId}/tyonjako`;
                    return (
                      <li key={t.compositeId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--rule)' }}>
                        <span style={{ width: 12, height: 12, border: '1px solid var(--ink2)', display: 'inline-block', flexShrink: 0 }} />
                        <a
                          href={href}
                          style={{ color: 'var(--ink)', textDecoration: 'none', flex: 1 }}
                        >
                          {t.text}
                        </a>
                        {t.deadline && <span style={{ fontSize: 11, color: 'var(--ink3)' }}>{t.deadline}</span>}
                        {t.status === 'pending' && <span style={{ fontSize: 10, color: '#d97706', letterSpacing: '.12em', textTransform: 'uppercase' }}>Odottaa</span>}
                        {t.sourceType === 'noteAction' && <span style={{ fontSize: 10, color: 'var(--ink3)', letterSpacing: '.12em', textTransform: 'uppercase' }}>Palaveri</span>}
                        {t.status === 'rejected' && <span style={{ fontSize: 10, color: '#e45c81', letterSpacing: '.12em', textTransform: 'uppercase' }}>Hylätty</span>}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Omat tehtävät */}
      <section>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 13, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--ink2)', margin: 0 }}>
            Omat tehtävät
          </h2>
          {!adding && (
            <button
              onClick={() => setAdding(true)}
              style={{ fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '.16em', textTransform: 'uppercase', background: 'transparent', border: '1px solid var(--ink2)', padding: '6px 12px', cursor: 'pointer', color: 'var(--ink)' }}
            >
              + Lisää
            </button>
          )}
        </div>

        {adding && (
          <div style={{ border: '1px solid var(--rule)', padding: 14, marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input
              autoFocus
              value={draft.text}
              onChange={e => setDraft(d => ({ ...d, text: e.target.value }))}
              placeholder="Mitä pitää tehdä?"
              style={{ background: 'transparent', border: '1px solid var(--rule)', padding: '8px 10px', fontFamily: 'var(--font-display)', fontSize: 14, color: 'var(--ink)' }}
            />
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <select
                value={draft.categoryId}
                onChange={e => setDraft(d => ({ ...d, categoryId: e.target.value }))}
                style={{ background: 'transparent', border: '1px solid var(--rule)', padding: '6px 8px', fontFamily: 'var(--font-display)', fontSize: 12, color: 'var(--ink)' }}
              >
                <option value="">— elämän alue —</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <input
                type="date"
                value={draft.deadline}
                onChange={e => setDraft(d => ({ ...d, deadline: e.target.value }))}
                style={{ background: 'transparent', border: '1px solid var(--rule)', padding: '6px 8px', fontFamily: 'var(--font-display)', fontSize: 12, color: 'var(--ink)' }}
              />
              <button onClick={submit} style={{ marginLeft: 'auto', fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '.16em', textTransform: 'uppercase', background: 'var(--ink)', color: 'var(--paper)', border: 'none', padding: '6px 14px', cursor: 'pointer' }}>
                Tallenna
              </button>
              <button onClick={() => { setAdding(false); setDraft(emptyDraft()); }} style={{ fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '.16em', textTransform: 'uppercase', background: 'transparent', color: 'var(--ink2)', border: '1px solid var(--rule)', padding: '6px 14px', cursor: 'pointer' }}>
                Peruuta
              </button>
            </div>
          </div>
        )}

        {visibleTasks.length === 0 ? (
          <div style={{ color: 'var(--ink3)', fontSize: 13, fontStyle: 'italic' }}>
            Ei omia tehtäviä vielä. Lisää ensimmäinen yllä.
          </div>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column' }}>
            {visibleTasks.map(t => (
              <li key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--rule)', opacity: t.done ? 0.5 : 1 }}>
                <button
                  onClick={() => toggleDone(t.id)}
                  aria-label={t.done ? 'Merkitse kesken' : 'Merkitse tehty'}
                  style={{ width: 16, height: 16, border: '1px solid var(--ink2)', background: t.done ? 'var(--ink)' : 'transparent', cursor: 'pointer', flexShrink: 0, padding: 0 }}
                />
                <span style={{ flex: 1, textDecoration: t.done ? 'line-through' : 'none' }}>{t.text}</span>
                {t.categoryId && (
                  <span style={{ fontSize: 11, color: catColor(t.categoryId), letterSpacing: '.08em' }}>
                    {catName(t.categoryId)}
                  </span>
                )}
                {t.deadline && <span style={{ fontSize: 11, color: 'var(--ink3)' }}>{t.deadline}</span>}
                <button
                  onClick={() => remove(t.id)}
                  aria-label="Poista"
                  style={{ background: 'transparent', border: 'none', color: 'var(--ink3)', cursor: 'pointer', fontSize: 14 }}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
