'use client';

import { useEffect, useMemo, useState } from 'react';
import { useUserData } from '@/lib/use-user-data';
import {
  Routine,
  RoutineLog,
  RoutineIntent,
  RoutineCadence,
  PersonalCategory,
  PersonalSettings,
  newId,
} from '@/lib/personal-shared';
import {
  weekProgress,
  consecutiveMetWeeks,
  isReadyForEstablish,
  ideaCount,
  weekDays,
  isLoggedDone,
  upsertLog,
  intentLabel,
  cadenceLabel,
  REQUIRED_WEEKS_TO_ESTABLISH,
  SUGGESTED_MAX_IDEAS,
} from '@/lib/routines-shared';
import { formatLocalDate } from '@/lib/yearwheel-shared';
import { useToast } from '@/lib/toast';

interface DraftRoutine {
  title: string;
  intent: RoutineIntent;
  cadence: RoutineCadence;
  targetMin: number;
  targetMax: string;       // tekstinä, valinnainen
  categoryId: string;
  note: string;
}

const emptyDraft = (): DraftRoutine => ({
  title: '',
  intent: 'start',
  cadence: 'daily',
  targetMin: 4,
  targetMax: '',
  categoryId: '',
  note: '',
});

const sectionTitle: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 13,
  letterSpacing: '.16em',
  textTransform: 'uppercase',
  color: 'var(--ink2)',
  margin: '0 0 12px',
};

const subtleBtn: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 11,
  letterSpacing: '.16em',
  textTransform: 'uppercase',
  background: 'transparent',
  border: '1px solid var(--ink2)',
  padding: '6px 12px',
  cursor: 'pointer',
  color: 'var(--ink)',
};

const primaryBtn: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 11,
  letterSpacing: '.16em',
  textTransform: 'uppercase',
  background: 'var(--ink)',
  color: 'var(--paper)',
  border: 'none',
  padding: '6px 14px',
  cursor: 'pointer',
};

const ghostBtn: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 11,
  letterSpacing: '.16em',
  textTransform: 'uppercase',
  background: 'transparent',
  color: 'var(--ink2)',
  border: '1px solid var(--rule)',
  padding: '6px 14px',
  cursor: 'pointer',
};

const intentColor = (intent: RoutineIntent): string => {
  if (intent === 'start') return 'var(--hetki-yellow, #f1b434)';
  if (intent === 'stop') return 'var(--red, #c14545)';
  return 'var(--pri, #056b9f)';
};

const ESTABLISHED_COLOR = 'var(--green, #185e5b)';

const routineAccent = (r: Routine): string =>
  r.status === 'established' ? ESTABLISHED_COLOR : intentColor(r.intent);

const routineLabel = (r: Routine): string =>
  r.status === 'established' ? 'vakiintunut' : intentLabel[r.intent];

export default function RoutinesSection() {
  const [routines, setRoutines] = useUserData<Routine[]>('routines', []);
  const [logs, setLogs] = useUserData<RoutineLog[]>('routineLogs', []);
  const [categories] = useUserData<PersonalCategory[]>('categories', []);
  const [settings] = useUserData<PersonalSettings>('settings', { weekStart: 'mon', dayStart: '06:00', dayEnd: '23:00' });
  const { toast } = useToast();

  const weekStartDay = settings?.weekStart || 'mon';

  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<DraftRoutine>(emptyDraft());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const today = useMemo(() => new Date(), []);

  // Automaattinen vakiintumistarkistus
  useEffect(() => {
    if (routines.length === 0) return;
    const ripe = routines.filter(r => r.status === 'active' && isReadyForEstablish(r, logs, today, weekStartDay));
    if (ripe.length === 0) return;
    setRoutines(prev => prev.map(r => {
      if (ripe.find(x => x.id === r.id)) {
        return { ...r, status: 'established', establishedAt: Date.now() };
      }
      return r;
    }));
    ripe.forEach(r => toast(`Rutiini syntyi: ${r.title}`, 'success'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routines, logs, weekStartDay]);

  const active = useMemo(() => routines.filter(r => r.status === 'active'), [routines]);
  const ideas = useMemo(() => routines.filter(r => r.status === 'idea'), [routines]);
  const established = useMemo(() => routines.filter(r => r.status === 'established'), [routines]);
  const archived = useMemo(() => routines.filter(r => r.status === 'archived'), [routines]);

  const submit = () => {
    const title = draft.title.trim();
    if (!title) return;
    const targetMin = Math.max(1, Math.floor(draft.targetMin || 1));
    const targetMax = draft.targetMax ? Math.max(1, parseInt(draft.targetMax, 10) || 0) || undefined : undefined;
    const note = draft.note.trim() || undefined;
    const categoryId = draft.categoryId || undefined;

    if (editingId) {
      setRoutines(prev => prev.map(r => r.id === editingId ? {
        ...r,
        title,
        intent: draft.intent,
        cadence: draft.cadence,
        targetMin,
        targetMax,
        note,
        categoryId,
      } : r));
    } else {
      const r: Routine = {
        id: newId(),
        title,
        intent: draft.intent,
        status: 'idea',
        cadence: draft.cadence,
        targetMin,
        targetMax,
        note,
        categoryId,
        createdAt: Date.now(),
      };
      setRoutines(prev => [...prev, r]);
    }
    setDraft(emptyDraft());
    setAdding(false);
    setEditingId(null);
  };

  const beginEdit = (r: Routine) => {
    setDraft({
      title: r.title,
      intent: r.intent,
      cadence: r.cadence,
      targetMin: r.targetMin,
      targetMax: r.targetMax ? String(r.targetMax) : '',
      categoryId: r.categoryId || '',
      note: r.note || '',
    });
    setEditingId(r.id);
    setAdding(true);
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const cancelDraft = () => {
    setAdding(false);
    setEditingId(null);
    setDraft(emptyDraft());
  };

  const activate = (id: string) => {
    setRoutines(prev => prev.map(r => r.id === id ? { ...r, status: 'active', activatedAt: Date.now() } : r));
  };

  const deactivate = (id: string) => {
    setRoutines(prev => prev.map(r => r.id === id ? { ...r, status: 'idea', activatedAt: undefined } : r));
  };

  const archive = (id: string) => {
    setRoutines(prev => prev.map(r => r.id === id ? { ...r, status: 'archived', archivedAt: Date.now() } : r));
  };

  const restore = (id: string) => {
    setRoutines(prev => prev.map(r => r.id === id ? { ...r, status: 'idea', archivedAt: undefined } : r));
  };

  const removeRoutine = (id: string) => {
    setRoutines(prev => prev.filter(r => r.id !== id));
    setLogs(prev => prev.filter(l => l.routineId !== id));
  };

  const toggleDay = (routineId: string, date: Date) => {
    const already = isLoggedDone(routineId, date, logs);
    setLogs(prev => upsertLog(prev, routineId, date, !already));
  };

  const catColor = (id?: string) => categories.find(c => c.id === id)?.color || 'var(--ink3)';
  const catName = (id?: string) => categories.find(c => c.id === id)?.name || '';

  const renderActiveCard = (r: Routine) => {
    const wp = weekProgress(r, logs, today, weekStartDay);
    const streak = consecutiveMetWeeks(r, logs, today, weekStartDay);
    const days = weekDays(today, weekStartDay);
    const todayKey = formatLocalDate(today);
    const accent = r.categoryId ? catColor(r.categoryId) : routineAccent(r);

    return (
      <div
        key={r.id}
        style={{
          flex: '1 1 320px',
          minWidth: 280,
          border: '1px solid var(--rule)',
          borderTop: `4px solid ${accent}`,
          padding: 18,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          background: 'var(--paper)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, color: 'var(--ink)' }}>{r.title}</div>
            <div style={{ fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink3)', marginTop: 4 }}>
              <span style={{ color: routineAccent(r), fontWeight: 600 }}>{routineLabel(r)}</span> · {cadenceLabel[r.cadence]} · alaraja {r.targetMin}{r.cadence === 'daily' ? ' / vk' : ''}
            </div>
            {r.categoryId && (
              <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 2 }}>{catName(r.categoryId)}</div>
            )}
          </div>
          <button
            onClick={() => archive(r.id)}
            title="Arkistoi"
            aria-label="Arkistoi"
            style={{ background: 'transparent', border: 'none', color: 'var(--ink3)', cursor: 'pointer', fontSize: 18 }}
          >×</button>
        </div>

        {/* Päiväkirjaus: viikon päivät rivissä */}
        <div>
          <div style={{ fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink2)', marginBottom: 6 }}>
            Tämä viikko
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {days.map(d => {
              const key = formatLocalDate(d);
              const isToday = key === todayKey;
              const done = isLoggedDone(r.id, d, logs);
              const future = d > today;
              const dayName = ['su', 'ma', 'ti', 'ke', 'to', 'pe', 'la'][d.getDay()];
              return (
                <button
                  key={key}
                  onClick={() => !future && toggleDay(r.id, d)}
                  disabled={future}
                  title={key}
                  style={{
                    flex: 1,
                    minWidth: 32,
                    aspectRatio: '1 / 1',
                    border: isToday ? '2px solid var(--ink)' : '1px solid var(--rule)',
                    background: done ? ESTABLISHED_COLOR : 'transparent',
                    color: done ? 'var(--paper)' : (future ? 'var(--ink3)' : 'var(--ink2)'),
                    cursor: future ? 'not-allowed' : 'pointer',
                    fontFamily: 'var(--font-display)',
                    fontSize: 11,
                    letterSpacing: '.1em',
                    textTransform: 'uppercase',
                    opacity: future ? 0.4 : 1,
                  }}
                >
                  {dayName}
                </button>
              );
            })}
          </div>
          <div style={{ fontSize: 12, color: wp.met ? 'var(--green, #185e5b)' : 'var(--ink3)', marginTop: 6 }}>
            {wp.done} / {wp.target} {wp.met ? '— alaraja täynnä' : ''}
          </div>
        </div>

        {/* Vakiintumismittari: 3 pylvästä */}
        <div>
          <div style={{ fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink2)', marginBottom: 6 }}>
            Putki vakiintumiseen ({streak} / {REQUIRED_WEEKS_TO_ESTABLISH} vk)
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {Array.from({ length: REQUIRED_WEEKS_TO_ESTABLISH }).map((_, i) => (
              <div
                key={i}
                style={{
                  flex: 1,
                  height: 8,
                  background: i < streak ? accent : 'var(--rule)',
                }}
              />
            ))}
          </div>
        </div>

        {r.note && (
          <div style={{ fontSize: 12, color: 'var(--ink3)', fontStyle: 'italic' }}>{r.note}</div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 'auto', flexWrap: 'wrap' }}>
          <button onClick={() => beginEdit(r)} style={ghostBtn}>Muokkaa</button>
          <button onClick={() => deactivate(r.id)} style={ghostBtn}>Palauta ehdokkaaksi</button>
        </div>
      </div>
    );
  };

  return (
    <div style={{ padding: '0 36px 60px', display: 'flex', flexDirection: 'column', gap: 32 }}>
      {/* Aktiiviset */}
      <section>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
          <h2 style={sectionTitle}>Aktiiviset rutiinit ({active.length})</h2>
          {!adding && (
            <button onClick={() => setAdding(true)} style={subtleBtn}>+ Uusi rutiini</button>
          )}
        </div>
        <p style={{ color: 'var(--ink3)', fontSize: 12, marginTop: 0, marginBottom: 14 }}>
          Aktiivisia rutiineja voi olla niin monta kuin haluat. Kun alaraja täyttyy {REQUIRED_WEEKS_TO_ESTABLISH} viikkoa peräkkäin,
          rutiini siirtyy vakiintuneisiin.
        </p>

        {adding && (
          <div style={{ border: '1px solid var(--rule)', padding: 14, marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 11, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--ink2)' }}>
              {editingId ? 'Muokkaa rutiinia' : 'Uusi rutiini'}
            </div>
            <input
              autoFocus
              value={draft.title}
              onChange={e => setDraft(d => ({ ...d, title: e.target.value }))}
              placeholder="Rutiinin nimi (esim. Aamulenkki, Lukeminen 30 min)"
              style={{ background: 'transparent', border: '1px solid var(--rule)', padding: '8px 10px', fontFamily: 'var(--font-display)', fontSize: 14, color: 'var(--ink)' }}
            />

            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
                <legend style={{ fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink2)', marginBottom: 6 }}>Tarkoitus</legend>
                {(['start', 'maintain', 'stop'] as RoutineIntent[]).map(opt => (
                  <label key={opt} style={{ marginRight: 12, fontSize: 13, color: 'var(--ink)' }}>
                    <input type="radio" name="intent" checked={draft.intent === opt} onChange={() => setDraft(d => ({ ...d, intent: opt }))} /> {intentLabel[opt]}
                  </label>
                ))}
              </fieldset>
              <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
                <legend style={{ fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink2)', marginBottom: 6 }}>Tahti</legend>
                {(['daily', 'weekly'] as RoutineCadence[]).map(opt => (
                  <label key={opt} style={{ marginRight: 12, fontSize: 13, color: 'var(--ink)' }}>
                    <input type="radio" name="cadence" checked={draft.cadence === opt} onChange={() => setDraft(d => ({ ...d, cadence: opt }))} /> {cadenceLabel[opt]}
                  </label>
                ))}
              </fieldset>
            </div>

            <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <label style={{ fontSize: 12, color: 'var(--ink2)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                Alaraja (krt / vk)
                <input
                  type="number"
                  min={1}
                  max={7}
                  value={draft.targetMin}
                  onChange={e => setDraft(d => ({ ...d, targetMin: parseInt(e.target.value, 10) || 1 }))}
                  style={{ width: 80, background: 'transparent', border: '1px solid var(--rule)', padding: '6px 8px', color: 'var(--ink)' }}
                />
              </label>
              <label style={{ fontSize: 12, color: 'var(--ink2)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                Yläraja (valinnainen)
                <input
                  type="number"
                  min={1}
                  value={draft.targetMax}
                  onChange={e => setDraft(d => ({ ...d, targetMax: e.target.value }))}
                  style={{ width: 80, background: 'transparent', border: '1px solid var(--rule)', padding: '6px 8px', color: 'var(--ink)' }}
                />
              </label>
              {categories.length > 0 && (
                <label style={{ fontSize: 12, color: 'var(--ink2)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  Elämänalue
                  <select
                    value={draft.categoryId}
                    onChange={e => setDraft(d => ({ ...d, categoryId: e.target.value }))}
                    style={{ background: 'transparent', border: '1px solid var(--rule)', padding: '6px 8px', color: 'var(--ink)' }}
                  >
                    <option value="">—</option>
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </label>
              )}
            </div>

            <textarea
              value={draft.note}
              onChange={e => setDraft(d => ({ ...d, note: e.target.value }))}
              placeholder="Muistiinpano (valinnainen)"
              rows={2}
              style={{ background: 'transparent', border: '1px solid var(--rule)', padding: '8px 10px', fontSize: 13, color: 'var(--ink)', resize: 'vertical' }}
            />

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={submit} style={primaryBtn}>
                {editingId ? 'Tallenna muutokset' : 'Tallenna ehdokkaaksi'}
              </button>
              <button onClick={cancelDraft} style={ghostBtn}>Peruuta</button>
            </div>
          </div>
        )}

        {active.length === 0 ? (
          <div style={{ color: 'var(--ink3)', fontSize: 13, fontStyle: 'italic' }}>
            Ei aktiivisia rutiineja. Aktivoi yksi tai kaksi ehdokasta alta.
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {active.map(renderActiveCard)}
          </div>
        )}
      </section>

      {/* Ehdokkaat */}
      {ideas.length > 0 && (
        <section>
          <h2 style={sectionTitle}>Ehdokkaat — aloita tai lopeta ({ideas.length})</h2>
          {ideaCount(routines) > SUGGESTED_MAX_IDEAS && (
            <p style={{ color: 'var(--ink3)', fontSize: 12, marginTop: 0, marginBottom: 10, fontStyle: 'italic' }}>
              Vinkki: korkeintaan {SUGGESTED_MAX_IDEAS} ehdokasta kerrallaan helpottaa valintaa — voit toki pitää enemmänkin.
            </p>
          )}
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {ideas.map(r => (
              <li key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--rule)' }}>
                <span style={{ width: 10, height: 10, background: routineAccent(r), flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ color: 'var(--ink)' }}>{r.title}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink3)', letterSpacing: '.1em', textTransform: 'uppercase' }}>
                    <span style={{ color: routineAccent(r), fontWeight: 600 }}>{intentLabel[r.intent]}</span> · {cadenceLabel[r.cadence]} · alaraja {r.targetMin}
                  </div>
                </div>
                <button
                  onClick={() => beginEdit(r)}
                  style={ghostBtn}
                >Muokkaa</button>
                <button
                  onClick={() => activate(r.id)}
                  style={subtleBtn}
                >Aktivoi</button>
                <button
                  onClick={() => removeRoutine(r.id)}
                  aria-label="Poista"
                  style={{ background: 'transparent', border: 'none', color: 'var(--ink3)', cursor: 'pointer', fontSize: 14 }}
                >×</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Vakiintuneet */}
      {established.length > 0 && (
        <section>
          <h2 style={sectionTitle}>Vakiintuneet</h2>
          <p style={{ color: 'var(--ink3)', fontSize: 12, marginTop: 0, marginBottom: 10 }}>
            Voit yhä kirjata näitä ylläpidoksi — eivät syö aktiivipaikkoja.
          </p>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {established.map(r => {
              const wp = weekProgress(r, logs, today, weekStartDay);
              const todayDone = isLoggedDone(r.id, today, logs);
              return (
                <li key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--rule)', borderLeft: `3px solid ${ESTABLISHED_COLOR}`, paddingLeft: 10 }}>
                  <button
                    onClick={() => toggleDay(r.id, today)}
                    title={todayDone ? 'Peru tämän päivän kirjaus' : 'Tein tänään'}
                    style={{
                      width: 18, height: 18, padding: 0,
                      border: '1px solid var(--ink2)',
                      background: todayDone ? ESTABLISHED_COLOR : 'transparent',
                      cursor: 'pointer',
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ color: 'var(--ink)' }}>{r.title}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink3)', letterSpacing: '.1em', textTransform: 'uppercase' }}>
                      <span style={{ color: ESTABLISHED_COLOR, fontWeight: 600 }}>vakiintunut</span> · {cadenceLabel[r.cadence]} · {wp.done}/{wp.target} tällä viikolla
                    </div>
                  </div>
                  <button onClick={() => beginEdit(r)} style={ghostBtn}>Muokkaa</button>
                  <button onClick={() => archive(r.id)} style={ghostBtn}>Arkistoi</button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Arkistoidut */}
      {archived.length > 0 && (
        <section>
          <button
            onClick={() => setShowArchived(s => !s)}
            style={{ ...ghostBtn, marginBottom: 10 }}
          >
            {showArchived ? 'Piilota' : 'Näytä'} arkistoidut ({archived.length})
          </button>
          {showArchived && (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {archived.map(r => (
                <li key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--rule)', color: 'var(--ink3)' }}>
                  <span style={{ flex: 1, textDecoration: 'line-through' }}>{r.title}</span>
                  <button onClick={() => restore(r.id)} style={ghostBtn}>Palauta</button>
                  <button onClick={() => removeRoutine(r.id)} aria-label="Poista" style={{ background: 'transparent', border: 'none', color: 'var(--ink3)', cursor: 'pointer', fontSize: 14 }}>×</button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {routines.length === 0 && !adding && (
        <div style={{ color: 'var(--ink3)', fontSize: 13, fontStyle: 'italic' }}>
          Ei rutiineja vielä. Lisää ensimmäinen ehdokas yltä.
        </div>
      )}
    </div>
  );
}
