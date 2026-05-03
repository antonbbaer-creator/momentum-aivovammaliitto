'use client';

import { useMemo, useState } from 'react';
import { useUserData } from '@/lib/use-user-data';
import { useAssignedTasks } from '@/lib/use-assigned-tasks';
import { useAudioRecorder } from '@/lib/use-audio-recorder';
import { workerFetch } from '@/lib/worker-fetch';
import {
  PersonalCategory,
  PersonalSettings,
  PersonalTask,
  ReflectionSession,
  ReflectionTurn,
  ReflectionsDoc,
  Routine,
  RoutineSuggestion,
  SleepDoc,
  TimeBlock,
  TimeBlockSuggestion,
  newId,
} from '@/lib/personal-shared';
import {
  applyRoutineSuggestion,
  applyTimeBlockSuggestion,
  summarizeCategories,
  summarizeRoutines,
  summarizeTasks,
  summarizeWeek,
} from '@/lib/reflection-shared';

type Status = 'idle' | 'transcribing' | 'thinking' | 'error';

export default function ReflectionSection() {
  const [reflectionsDoc, setReflectionsDoc] = useUserData<ReflectionsDoc>('reflections', { sessions: [] });
  const [routines, setRoutines] = useUserData<Routine[]>('routines', []);
  const [blocks, setBlocks] = useUserData<TimeBlock[]>('calendar', []);
  const [tasks] = useUserData<PersonalTask[]>('tasks', []);
  const [sleepDoc] = useUserData<SleepDoc>('sleep', { entries: [] });
  const [categories] = useUserData<PersonalCategory[]>('categories', []);
  const [settings] = useUserData<PersonalSettings>('settings', { weekStart: 'mon', dayStart: '06:00', dayEnd: '23:00' });
  const { assigned } = useAssignedTasks();

  const sessions = reflectionsDoc.sessions ?? [];
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const activeSession = useMemo(
    () => sessions.find(s => s.id === activeSessionId) ?? null,
    [sessions, activeSessionId],
  );

  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [draftText, setDraftText] = useState('');
  const recorder = useAudioRecorder();

  const updateSession = (id: string, mut: (s: ReflectionSession) => ReflectionSession) => {
    setReflectionsDoc(prev => ({
      ...prev,
      sessions: (prev.sessions ?? []).map(s => s.id === id ? mut(s) : s),
    }));
  };

  const startNewSession = async () => {
    const greeting: ReflectionTurn = {
      role: 'assistant',
      text: 'Tervetuloa. Kerro vapaasti — minkä asian pitäisi saada elämässäsi enemmän aikaa, ja mistä se aika voisi olla pois?',
      ts: Date.now(),
    };
    const session: ReflectionSession = {
      id: newId(),
      startedAt: Date.now(),
      updatedAt: Date.now(),
      status: 'in_progress',
      turns: [greeting],
      routineSuggestions: [],
      timeblockSuggestions: [],
    };
    setReflectionsDoc(prev => ({
      ...prev,
      sessions: [...(prev.sessions ?? []), session],
    }));
    setActiveSessionId(session.id);
    setError(null);
    setDraftText('');
    recorder.reset();
  };

  const finishSession = () => {
    if (!activeSession) return;
    updateSession(activeSession.id, s => ({
      ...s,
      status: 'completed',
      updatedAt: Date.now(),
    }));
    setActiveSessionId(null);
    recorder.reset();
  };

  /** Lähetä audio Whisperille, palauta teksti. */
  const transcribeBlob = async (blob: Blob): Promise<string> => {
    const fd = new FormData();
    fd.append('audio', blob, `reflektio-${Date.now()}.webm`);
    const res = await workerFetch('/api/transcribe', { method: 'POST', body: fd });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Litterointi epäonnistui (${res.status}): ${err.slice(0, 200)}`);
    }
    const data = await res.json() as { transcription?: string; error?: string };
    if (data.error) throw new Error(data.error);
    return (data.transcription || '').trim();
  };

  /** Pyydä Claudelta seuraava vuoro keskustelussa. */
  const askClaude = async (turns: ReflectionTurn[]) => {
    const payload = {
      turns: turns.map(t => ({ role: t.role, text: t.text })),
      currentRoutines: summarizeRoutines(routines),
      currentTimeBlocks: summarizeWeek(blocks, categories, settings.weekStart, sleepDoc.entries, sleepDoc.naps),
      currentCategories: summarizeCategories(categories),
      currentTasks: summarizeTasks(tasks, assigned, categories),
    };
    const res = await workerFetch('/api/reflect', { method: 'POST', body: JSON.stringify(payload) });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Reflektio epäonnistui (${res.status}): ${err.slice(0, 200)}`);
    }
    return res.json() as Promise<{
      mode: 'ask' | 'suggest' | 'wrap_up';
      assistantText: string;
      routineSuggestions: RoutineSuggestion[];
      timeblockSuggestions: TimeBlockSuggestion[];
      insights: string | null;
    }>;
  };

  const sendUserText = async (text: string) => {
    if (!activeSession || !text.trim()) return;
    setError(null);
    const userTurn: ReflectionTurn = { role: 'user', text: text.trim(), ts: Date.now() };
    // Tallenna käyttäjän vuoro heti
    updateSession(activeSession.id, s => ({
      ...s,
      turns: [...s.turns, userTurn],
      updatedAt: Date.now(),
    }));
    setDraftText('');
    recorder.reset();

    setStatus('thinking');
    try {
      // Luo turns-lista jossa uusi userTurn on mukana
      const turnsForApi = [...activeSession.turns, userTurn];
      const reply = await askClaude(turnsForApi);
      const assistantTurn: ReflectionTurn = {
        role: 'assistant',
        text: reply.assistantText || '...',
        ts: Date.now(),
      };
      updateSession(activeSession.id, s => ({
        ...s,
        turns: [...s.turns, assistantTurn],
        updatedAt: Date.now(),
        // Lisää uudet ehdotukset, säilytä jo hyväksytyt
        routineSuggestions: [
          ...s.routineSuggestions.filter(x => x.accepted),
          ...(reply.routineSuggestions || []).map(x => ({ ...x, tempId: x.tempId || newId() })),
        ],
        timeblockSuggestions: [
          ...s.timeblockSuggestions.filter(x => x.accepted),
          ...(reply.timeblockSuggestions || []).map(x => ({ ...x, tempId: x.tempId || newId() })),
        ],
        insights: reply.insights ?? s.insights,
      }));
      setStatus('idle');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus('error');
    }
  };

  const stopAndTranscribe = async () => {
    setStatus('transcribing');
    setError(null);
    try {
      const blob = await recorder.stop();
      if (!blob) {
        setStatus('idle');
        return;
      }
      const text = await transcribeBlob(blob);
      setDraftText(prev => (prev ? prev + ' ' : '') + text);
      setStatus('idle');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus('error');
    }
  };

  const acceptRoutine = (sId: string, sug: RoutineSuggestion) => {
    const r = applyRoutineSuggestion(sug);
    setRoutines(prev => [...prev, r]);
    updateSession(sId, s => ({
      ...s,
      routineSuggestions: s.routineSuggestions.map(x =>
        x.tempId === sug.tempId ? { ...x, accepted: true, acceptedRoutineId: r.id } : x,
      ),
      updatedAt: Date.now(),
    }));
  };

  const acceptTimeBlock = (sId: string, sug: TimeBlockSuggestion) => {
    const tb = applyTimeBlockSuggestion(sug, settings.weekStart);
    setBlocks(prev => [...prev, tb]);
    updateSession(sId, s => ({
      ...s,
      timeblockSuggestions: s.timeblockSuggestions.map(x =>
        x.tempId === sug.tempId ? { ...x, accepted: true, acceptedBlockId: tb.id } : x,
      ),
      updatedAt: Date.now(),
    }));
  };

  const dismissSuggestion = (sId: string, kind: 'routine' | 'timeblock', tempId: string) => {
    updateSession(sId, s => ({
      ...s,
      routineSuggestions: kind === 'routine' ? s.routineSuggestions.filter(x => x.tempId !== tempId) : s.routineSuggestions,
      timeblockSuggestions: kind === 'timeblock' ? s.timeblockSuggestions.filter(x => x.tempId !== tempId) : s.timeblockSuggestions,
      updatedAt: Date.now(),
    }));
  };

  const dayName = (d: number) => ['Su', 'Ma', 'Ti', 'Ke', 'To', 'Pe', 'La'][d] || '?';

  // ── Render ──
  if (!activeSession) {
    const completed = sessions.filter(s => s.status !== 'in_progress').sort((a, b) => b.startedAt - a.startedAt);
    const inProgress = sessions.filter(s => s.status === 'in_progress').sort((a, b) => b.startedAt - a.startedAt);
    return (
      <div style={{ padding: '0 36px 60px', maxWidth: 720 }}>
        <p style={{ fontSize: 13, color: 'var(--ink2)', marginTop: 0 }}>
          Reflektio on äänellä tai tekstillä käytävä keskustelu, jossa tekoäly auttaa löytämään aikaa merkityksellisille asioille. Se lukee viikkokalenterisi ja rutiinisi, ja ehdottaa konkreettisia muutoksia.
        </p>

        <button
          onClick={startNewSession}
          style={{
            fontFamily: 'var(--font-display)', fontSize: 12, letterSpacing: '.16em', textTransform: 'uppercase',
            background: 'var(--ink)', color: 'var(--paper)', border: 'none', padding: '12px 20px', cursor: 'pointer',
            marginBottom: 24,
          }}
        >
          Aloita reflektio
        </button>

        {inProgress.length > 0 && (
          <section style={{ marginBottom: 28 }}>
            <h3 style={titleStyle}>Kesken</h3>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {inProgress.map(s => (
                <li key={s.id} style={listItemStyle}>
                  <button onClick={() => setActiveSessionId(s.id)} style={linkBtnStyle}>
                    {new Date(s.startedAt).toLocaleString('fi-FI')} — {s.turns.length} viestiä
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <h3 style={titleStyle}>Aiemmat reflektiot</h3>
          {completed.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--ink3)' }}>Ei vielä päättyneitä reflektioita.</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {completed.map(s => (
                <li key={s.id} style={listItemStyle}>
                  <button onClick={() => setActiveSessionId(s.id)} style={linkBtnStyle}>
                    {new Date(s.startedAt).toLocaleDateString('fi-FI')} — {s.routineSuggestions.filter(x => x.accepted).length} rutiinia, {s.timeblockSuggestions.filter(x => x.accepted).length} aikalohkoa
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    );
  }

  const isReadOnly = activeSession.status !== 'in_progress';

  return (
    <div style={{ padding: '0 36px 60px', maxWidth: 760 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <button onClick={() => setActiveSessionId(null)} style={navBtnStyle}>‹ Takaisin</button>
        {!isReadOnly && (
          <button onClick={finishSession} style={navBtnStyle}>Päätä reflektio</button>
        )}
      </div>

      {/* Keskustelu */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
        {activeSession.turns.map((t, i) => (
          <div
            key={i}
            style={{
              alignSelf: t.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '82%',
              background: t.role === 'user' ? 'var(--ink)' : 'var(--paper-l)',
              color: t.role === 'user' ? 'var(--paper)' : 'var(--ink)',
              border: t.role === 'user' ? 'none' : '1px solid var(--rule)',
              padding: '10px 14px',
              fontSize: 13,
              lineHeight: 1.4,
              whiteSpace: 'pre-wrap',
            }}
          >
            {t.text}
          </div>
        ))}
        {status === 'thinking' && (
          <div style={{ alignSelf: 'flex-start', fontSize: 11, color: 'var(--ink3)' }}>Tekoäly miettii…</div>
        )}
      </div>

      {/* Ehdotukset */}
      {(activeSession.routineSuggestions.length > 0 || activeSession.timeblockSuggestions.length > 0) && (
        <section style={{ border: '1px solid var(--rule)', padding: 14, marginBottom: 18 }}>
          <h3 style={titleStyle}>Ehdotukset</h3>
          {activeSession.routineSuggestions.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: 6 }}>Rutiinit</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {activeSession.routineSuggestions.map(sug => (
                  <div key={sug.tempId} style={{ borderTop: '1px solid var(--rule)', paddingTop: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{sug.title}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 2 }}>
                      {sug.intent === 'start' ? 'Aloita' : sug.intent === 'stop' ? 'Lopeta' : 'Ylläpidä'}
                      {sug.targetMin ? ` · ${sug.targetMin}/vk` : ''}
                      {' · '}{sug.rationale}
                    </div>
                    {!isReadOnly && !sug.accepted && (
                      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                        <button onClick={() => acceptRoutine(activeSession.id, sug)} style={smallPrimary}>Hyväksy</button>
                        <button onClick={() => dismissSuggestion(activeSession.id, 'routine', sug.tempId)} style={smallGhost}>Hylkää</button>
                      </div>
                    )}
                    {sug.accepted && (
                      <div style={{ fontSize: 10, color: 'var(--ok, #185e5b)', marginTop: 4 }}>Lisätty rutiineihin</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeSession.timeblockSuggestions.length > 0 && (
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: 6 }}>Aikalohkot</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {activeSession.timeblockSuggestions.map(sug => {
                  const cat = categories.find(c => c.id === sug.categoryId);
                  return (
                    <div key={sug.tempId} style={{ borderTop: '1px solid var(--rule)', paddingTop: 8 }}>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{sug.title}</div>
                      <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 2 }}>
                        {dayName(sug.dayOfWeek)} {sug.startTime}–{sug.endTime}
                        {' · '}{cat ? cat.name : (sug.suggestedCategoryName || 'Luokittelematon')}
                        {' · '}{sug.rationale}
                      </div>
                      {!isReadOnly && !sug.accepted && (
                        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                          <button onClick={() => acceptTimeBlock(activeSession.id, sug)} style={smallPrimary}>Lisää viikkoon</button>
                          <button onClick={() => dismissSuggestion(activeSession.id, 'timeblock', sug.tempId)} style={smallGhost}>Hylkää</button>
                        </div>
                      )}
                      {sug.accepted && (
                        <div style={{ fontSize: 10, color: 'var(--ok, #185e5b)', marginTop: 4 }}>Lisätty viikkokalenteriin</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeSession.insights && (
            <div style={{ marginTop: 12, padding: 10, background: 'var(--paper-l)', fontSize: 12, color: 'var(--ink2)' }}>
              <strong>Yhteenveto:</strong> {activeSession.insights}
            </div>
          )}
        </section>
      )}

      {/* Syöte */}
      {!isReadOnly && (
        <div style={{ borderTop: '1px solid var(--rule)', paddingTop: 14 }}>
          {error && (
            <div style={{ background: 'rgba(228,92,129,.1)', border: '1px solid #e45c81', color: '#e45c81', padding: '6px 10px', fontSize: 12, marginBottom: 10 }}>
              {error}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            {recorder.state !== 'recording' ? (
              <button
                onClick={() => recorder.start()}
                disabled={status === 'transcribing' || status === 'thinking'}
                style={smallPrimary}
              >
                {recorder.state === 'recorded' ? 'Nauhoita uudelleen' : 'Nauhoita'}
              </button>
            ) : (
              <button onClick={stopAndTranscribe} style={smallDanger}>
                Pysäytä ({Math.floor(recorder.durationMs / 1000)} s)
              </button>
            )}
            {recorder.state === 'recorded' && status === 'idle' && (
              <button onClick={stopAndTranscribe} style={smallGhost}>Litteröi</button>
            )}
            {status === 'transcribing' && <span style={{ fontSize: 11, color: 'var(--ink3)', alignSelf: 'center' }}>Litteröidään…</span>}
          </div>

          <textarea
            value={draftText}
            onChange={e => setDraftText(e.target.value)}
            placeholder="Kirjoita tai nauhoita viestisi…"
            rows={4}
            style={{ width: '100%', marginTop: 10, background: 'transparent', border: '1px solid var(--rule)', padding: 10, fontSize: 13, fontFamily: 'inherit', color: 'var(--ink)', resize: 'vertical' }}
          />

          <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
            <button
              onClick={() => sendUserText(draftText)}
              disabled={!draftText.trim() || status === 'thinking' || status === 'transcribing'}
              style={smallPrimary}
            >
              Lähetä
            </button>
            {recorder.recordedUrl && (
              <audio src={recorder.recordedUrl} controls style={{ height: 30 }} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const titleStyle: React.CSSProperties = {
  fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--ink2)',
  margin: '0 0 8px',
};
const listItemStyle: React.CSSProperties = {
  borderBottom: '1px solid var(--rule)', padding: '6px 0',
};
const linkBtnStyle: React.CSSProperties = {
  background: 'transparent', border: 'none', color: 'var(--ink)', fontSize: 13, cursor: 'pointer', textAlign: 'left', padding: 0,
};
const navBtnStyle: React.CSSProperties = {
  fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase',
  background: 'transparent', border: '1px solid var(--rule)', padding: '6px 12px', cursor: 'pointer', color: 'var(--ink)',
};
const smallPrimary: React.CSSProperties = {
  fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase',
  background: 'var(--ink)', color: 'var(--paper)', border: 'none', padding: '6px 12px', cursor: 'pointer',
};
const smallGhost: React.CSSProperties = {
  fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase',
  background: 'transparent', color: 'var(--ink2)', border: '1px solid var(--rule)', padding: '6px 12px', cursor: 'pointer',
};
const smallDanger: React.CSSProperties = {
  fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase',
  background: '#e45c81', color: 'white', border: 'none', padding: '6px 12px', cursor: 'pointer',
};
