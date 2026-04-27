'use client';

import { useMemo, useState } from 'react';
import { useUserData } from '@/lib/use-user-data';
import {
  PersonalTask,
  PersonalCategory,
  AssignedTaskMirror,
  newId,
} from '@/lib/personal-shared';
import { useAssignedTasks } from '@/lib/use-assigned-tasks';

interface DraftTask {
  text: string;
  categoryId: string;
  deadline: string;
}

const emptyDraft = (): DraftTask => ({ text: '', categoryId: '', deadline: '' });

export default function PersonalHomeSection() {
  const [tasks, setTasks] = useUserData<PersonalTask[]>('tasks', []);
  const [categories] = useUserData<PersonalCategory[]>('categories', []);
  const { assigned, byOrg, loading: assignedLoading } = useAssignedTasks();

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

  return (
    <div style={{ padding: '0 36px 60px', display: 'flex', flexDirection: 'column', gap: 32 }}>
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
