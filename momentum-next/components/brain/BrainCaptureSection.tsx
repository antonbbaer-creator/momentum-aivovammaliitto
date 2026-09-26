'use client';

// Aivot → Kirjaa: nopea kirjaus tekstinä tai saneluna. Kirjaus tallentuu aina ensin Inboxiin,
// sitten tekoäly ehdottaa muutoksia aivoihin. Käyttäjä tarkistaa jokaisen ehdotuksen (muutosvertailu),
// hyväksyy, muokkaa tai hylkää. Aivoihin ei kirjoiteta mitään ilman "Tallenna hyväksytyt" -nappia.

import React, { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ref as storageRef, uploadBytes } from 'firebase/storage';
import { storage } from '@/lib/firebase';
import { useAudioRecorder } from '@/lib/use-audio-recorder';
import { useToast } from '@/lib/toast';
import { useIsMobile } from '@/lib/use-mobile';
import {
  brainApi, useBrainAccess, useBrainGoals, useBrainInbox, useBrainNotes, useBrainSections, useNoteIndex,
} from '@/lib/use-brain';
import {
  INBOX_STATUS_META, OPERATION_LABELS, KIND_LABELS, formatValue, sectionUnderHeading,
  type BrainGoal, type BrainInboxEntry, type BrainNote, type BrainOperation, type BrainSection, type InboxChannel,
} from '@/lib/brain-shared';
import BrainMarkdown, { type WikiTarget } from './BrainMarkdown';
import { brainCard, brainLabel, noteHref, useBrainBase, useWikiResolver } from './BrainShell';

const CHANNEL_LABELS: Record<InboxChannel, string> = { web: 'Verkko', voice: 'Sanelu', api: 'Rajapinta', siri: 'Siri' };

type JobStep = 'uploading' | 'saving' | 'transcribing' | 'processing' | 'done' | 'error';
interface Job {
  id: string | null;
  step: JobStep;
  message: string;
  retry?: 'transcribe' | 'process';
}

type OpMode = 'accept' | 'edit' | 'reject';

interface ApplyResult {
  status: string;
  applied: { index: number; target: string }[];
  failed?: { index: number; error: string }[];
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Tuntematon virhe');

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString('fi-FI', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function excerpt(s: string, n: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
}

/** Vastaa palvelimen parseOperation-tarkistusta: puutteellinen operaatio kaataisi koko tallennuksen. */
function opIsValid(op: BrainOperation): boolean {
  switch (op.type) {
    case 'append_to_note': return !!op.targetSlug && !!op.content.trim();
    case 'update_property': return !!op.targetSlug && !!op.key.trim();
    case 'create_note': return !!op.name.replace(/[[\]|#^]/g, '').trim() && !!op.sectionSlug;
    case 'add_decision': return !!op.decision.trim();
    case 'add_proposal': return !!op.title.trim();
    case 'update_goal_metric': return !!op.goalId && Number.isFinite(op.value);
  }
}

export default function BrainCaptureSection() {
  const { orgId, canEdit } = useBrainAccess();
  const inbox = useBrainInbox(orgId);
  const notes = useBrainNotes(orgId);
  const sections = useBrainSections(orgId);
  const goals = useBrainGoals(orgId);
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const recorder = useAudioRecorder();

  const [text, setText] = useState('');
  const [job, setJob] = useState<Job | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const reviewRef = useRef<HTMLDivElement | null>(null);

  const busy = !!job && job.step !== 'done' && job.step !== 'error';
  const recording = recorder.state === 'recording';

  const openEntries = useMemo(
    () => inbox.data.filter(e => e.status === 'uusi' || e.status === 'ehdotettu').sort((a, b) => b.createdAt - a.createdAt),
    [inbox.data],
  );
  const doneEntries = useMemo(
    () => inbox.data.filter(e => e.status !== 'uusi' && e.status !== 'ehdotettu').sort((a, b) => (b.processedAt || b.createdAt) - (a.processedAt || a.createdAt)).slice(0, 20),
    [inbox.data],
  );
  const selected = selectedId ? inbox.data.find(e => e.id === selectedId) || null : null;

  const openReview = (id: string) => {
    setSelectedId(id);
    // Siirretään fokus tarkistukseen (puhelimella näkymä vierii sen kohdalle)
    requestAnimationFrame(() => reviewRef.current?.focus());
  };

  const runProcess = async (id: string, prefix = '') => {
    if (!orgId) return;
    setJob({ id, step: 'processing', message: `${prefix}Tekoäly lukee aivoja ja ehdottaa… Tämä voi kestää 10–60 sekuntia.` });
    try {
      await brainApi('inbox/process', { body: { orgId, id } });
      setJob({ id, step: 'done', message: 'Ehdotus on valmis. Tarkista se ja tallenna hyväksytyt.' });
      setSelectedId(id);
    } catch (e) {
      setJob({ id, step: 'error', message: `Kirjaus on tallessa. Tekoäly ei pystynyt käsittelemään sitä: ${errMsg(e)}`, retry: 'process' });
    }
  };

  const runTranscribe = async (id: string, thenProcess: boolean) => {
    if (!orgId) return;
    setJob({ id, step: 'transcribing', message: 'Tallennettu ✓ Muutetaan sanelua tekstiksi…' });
    try {
      await brainApi('inbox/transcribe', { body: { orgId, id } });
    } catch (e) {
      setJob({ id, step: 'error', message: `Kirjaus on tallessa. Sanelun muuttaminen tekstiksi epäonnistui: ${errMsg(e)}`, retry: 'transcribe' });
      return;
    }
    if (thenProcess) await runProcess(id, 'Tallennettu ✓ ');
    else setJob({ id, step: 'done', message: 'Sanelu on muutettu tekstiksi.' });
  };

  const retry = () => {
    if (!job?.id || !job.retry) return;
    if (job.retry === 'transcribe') void runTranscribe(job.id, true);
    else void runProcess(job.id);
  };

  const save = async () => {
    if (!orgId || busy) return;
    const trimmed = text.trim();
    const blob = recording ? await recorder.stop() : recorder.recordedBlob;
    if (!trimmed && !blob) return;

    // 1. Ääni Storageen (jos on). Epäonnistuminen ei estä tekstin tallennusta.
    let audioPath: string | null = null;
    let uploadError: string | null = null;
    if (blob) {
      setJob({ id: null, step: 'uploading', message: 'Tallennetaan sanelua…' });
      const ext = (blob.type || '').includes('mp4') ? 'mp4' : 'webm';
      const path = `organizations/${orgId}/brain-audio/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
      try {
        await uploadBytes(storageRef(storage, path), blob, { contentType: blob.type || 'audio/webm' });
        audioPath = path;
      } catch (e) {
        uploadError = errMsg(e);
      }
    }
    if (!trimmed && !audioPath) {
      setJob({ id: null, step: 'error', message: `Sanelun tallennus epäonnistui: ${uploadError || 'tuntematon virhe'}. Sanelu on yhä tallessa tällä laitteella, yritä uudelleen.` });
      return;
    }

    // 2. Kirjaus Inboxiin: tämän jälkeen se ei katoa
    setJob({ id: null, step: 'saving', message: 'Tallennetaan kirjausta…' });
    let id: string;
    try {
      const res = await brainApi<{ id: string }>('inbox', {
        body: { orgId, text: trimmed, channel: audioPath ? 'voice' : 'web', ...(audioPath ? { audioPath } : {}) },
      });
      id = res.id;
    } catch (e) {
      setJob({ id: null, step: 'error', message: `Tallennus epäonnistui: ${errMsg(e)}. Tekstisi on yhä kentässä, yritä uudelleen.` });
      return;
    }
    setText('');
    if (audioPath) recorder.reset();
    setSelectedId(id);
    if (uploadError) {
      toast('Sanelun tallennus epäonnistui, teksti tallennettiin', 'error');
      setJob({ id, step: 'saving', message: `Tallennettu ✓ (vain teksti). Sanelun tallennus epäonnistui: ${uploadError}` });
    } else {
      setJob({ id, step: 'saving', message: 'Tallennettu ✓' });
    }

    // 3. Litterointi ja tekoälykäsittely
    if (audioPath) await runTranscribe(id, true);
    else await runProcess(id, uploadError ? 'Tallennettu ✓ (vain teksti, sanelu jäi tallentamatta). ' : 'Tallennettu ✓ ');
  };

  const toggleRecording = async () => {
    if (recording) await recorder.stop();
    else await recorder.start();
  };

  const hasRecording = recorder.state === 'recorded' && !!recorder.recordedBlob;
  const canSave = !busy && (!!text.trim() || hasRecording || recording);
  const jobColor = job?.step === 'error' ? 'var(--red)' : job?.step === 'done' ? 'var(--green)' : 'var(--t1)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {canEdit && (
        <section aria-labelledby="brain-capture-h" style={{ ...brainCard, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h2 id="brain-capture-h" style={{ ...brainLabel, margin: 0 }}>Uusi kirjaus</h2>
          <label htmlFor="brain-capture-text" style={{ fontSize: 16, fontWeight: 600 }}>Mitä haluat kirjata?</label>
          <textarea id="brain-capture-text" className="input" rows={6} value={text} onChange={e => setText(e.target.value)}
            placeholder="Esim. Sovittiin Aivovammaliiton kanssa, että syksyn koulutus siirtyy marraskuulle."
            style={{ width: '100%', fontSize: 16, lineHeight: 1.5, resize: 'vertical' }} />

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
            <button type="button" onClick={() => void toggleRecording()} disabled={busy}
              aria-label={recording ? 'Lopeta sanelu' : 'Aloita sanelu'} aria-pressed={recording}
              className={recording ? 'btn' : 'btn btn-secondary'}
              style={{
                minHeight: 56, minWidth: 56, padding: '0 20px', fontSize: 16, display: 'inline-flex', alignItems: 'center', gap: 10,
                ...(recording ? { background: 'var(--red)', color: 'var(--paper)', borderColor: 'var(--red)' } : {}),
                flex: isMobile ? '1 1 100%' : undefined, justifyContent: 'center',
              }}>
              <span aria-hidden style={{ fontSize: 22 }}>{recording ? '■' : '🎤'}</span>
              <span>{recording ? `Lopeta sanelu (${formatDuration(recorder.durationMs)})` : hasRecording ? 'Sanele uudelleen' : 'Sanele'}</span>
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={!canSave}
              style={{ minHeight: 56, padding: '0 24px', fontSize: 16, flex: isMobile ? '1 1 100%' : undefined }}>
              {busy ? 'Tallennetaan…' : 'Tallenna'}
            </button>
          </div>

          {recording && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15 }}>
              <span aria-hidden style={{ width: 12, height: 12, borderRadius: '50%', background: 'var(--red)', display: 'inline-block' }} />
              <span>Sanelu käynnissä: {formatDuration(recorder.durationMs)}</span>
            </div>
          )}
          {hasRecording && !recording && (
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, fontSize: 15 }}>
              <span>Sanelu valmis ({formatDuration(recorder.durationMs)}). Se tallennetaan, kun painat Tallenna.</span>
              {recorder.recordedUrl && <audio controls src={recorder.recordedUrl} aria-label="Kuuntele sanelu" style={{ maxWidth: '100%', height: 40 }} />}
              <button type="button" className="btn btn-ghost btn-sm" onClick={recorder.reset} disabled={busy} style={{ minHeight: 44 }}>Poista sanelu</button>
            </div>
          )}
          {recorder.state === 'error' && recorder.error && (
            <div role="alert" style={{ color: 'var(--red)', fontSize: 14 }}>Sanelu ei onnistunut: {recorder.error}</div>
          )}

          <div aria-live="polite" role="status" style={{ minHeight: job ? undefined : 0 }}>
            {job && (
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 'var(--r)', background: 'var(--card2)', border: `1px solid ${job.step === 'error' ? 'var(--red)' : 'var(--border)'}`, color: jobColor, fontSize: 15, lineHeight: 1.5 }}>
                {busy && <span aria-hidden style={{ fontSize: 18 }}>⏳</span>}
                <span style={{ flex: 1, minWidth: 200 }}>{job.message}</span>
                {job.step === 'error' && job.retry && (
                  <button type="button" className="btn btn-secondary btn-sm" onClick={retry} style={{ minHeight: 44 }}>Yritä uudelleen</button>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {selected && (
        <div ref={reviewRef} tabIndex={-1} style={{ outline: 'none' }}>
          <ReviewPanel
            key={`${selected.id}:${selected.aiSuggestion?.createdAt ?? 0}`}
            entry={selected} orgId={orgId} canEdit={canEdit} busy={busy}
            notes={notes.data} sections={sections.data} goals={goals.data}
            onClose={() => setSelectedId(null)}
            onProcess={() => void runProcess(selected.id)}
            onTranscribe={() => void runTranscribe(selected.id, false)}
          />
        </div>
      )}

      <section aria-labelledby="brain-inbox-open-h">
        <div className="sec-h">
          <span className="t" id="brain-inbox-open-h">Käsittelemättömät kirjaukset</span>
          <span className="meta">{inbox.loading ? 'Ladataan…' : `${openEntries.length} kpl`}</span>
        </div>
        {inbox.error && <div role="alert" style={{ color: 'var(--red)', fontSize: 14 }}>Kirjausten lataus epäonnistui: {inbox.error}</div>}
        {!inbox.loading && !openEntries.length && !inbox.error && (
          <div style={{ fontSize: 14, color: 'var(--t3)', padding: '8px 0' }}>Ei käsittelemättömiä kirjauksia.</div>
        )}
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {openEntries.map(e => (
            <InboxRow key={e.id} entry={e} active={e.id === selectedId} canEdit={canEdit} busy={busy}
              onOpen={() => openReview(e.id)}
              onProcess={() => { setSelectedId(e.id); void runProcess(e.id); }}
              onTranscribe={() => { setSelectedId(e.id); void runTranscribe(e.id, false); }} />
          ))}
        </ul>
      </section>

      {doneEntries.length > 0 && (
        <details>
          <summary style={{ cursor: 'pointer', minHeight: 44, display: 'flex', alignItems: 'center', fontSize: 15, fontWeight: 600 }}>
            Käsitellyt ({doneEntries.length} viimeisintä)
          </summary>
          <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {doneEntries.map(e => (
              <InboxRow key={e.id} entry={e} active={e.id === selectedId} canEdit={false} busy={busy} onOpen={() => openReview(e.id)} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

// ── Listan rivi ─────────────────────────────────────────────────

function InboxRow({ entry, active, canEdit, busy, onOpen, onProcess, onTranscribe }: {
  entry: BrainInboxEntry; active: boolean; canEdit: boolean; busy: boolean;
  onOpen: () => void; onProcess?: () => void; onTranscribe?: () => void;
}) {
  const meta = INBOX_STATUS_META[entry.status] || { label: entry.status, color: 'var(--t3)' };
  const hasText = !!(entry.rawText || '').trim();
  const needsTranscribe = !!entry.audioPath && !hasText;
  const canProcess = entry.status === 'uusi' && !entry.aiSuggestion && hasText;
  return (
    <li style={{ ...brainCard, padding: 0, borderColor: active ? 'var(--pri)' : 'var(--border)', display: 'flex', flexWrap: 'wrap', alignItems: 'stretch' }}>
      <button type="button" onClick={onOpen} aria-current={active ? 'true' : undefined}
        style={{ flex: '1 1 260px', minHeight: 56, textAlign: 'left', background: 'none', border: 0, padding: '10px 14px', cursor: 'pointer', color: 'var(--t1)', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 12, color: 'var(--t3)' }}>
          <span>{formatTime(entry.createdAt)}</span>
          <span>· {CHANNEL_LABELS[entry.channel] || entry.channel}</span>
          {entry.createdByName && <span>· {entry.createdByName}</span>}
        </span>
        <span style={{ fontSize: 15 }}>{hasText ? excerpt(entry.rawText, 140) : entry.audioPath ? 'Sanelu, ei vielä tekstinä' : '(tyhjä)'}</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: meta.color }}>
          Tila: {meta.label}
          {entry.status === 'hyväksytty' && typeof entry.appliedOperations === 'number' ? ` (${entry.appliedOperations} muutosta)` : ''}
        </span>
        {entry.error && <span style={{ fontSize: 13, color: 'var(--red)' }}>Virhe: {entry.error}</span>}
      </button>
      {canEdit && (needsTranscribe || canProcess) && (
        <div style={{ display: 'flex', alignItems: 'center', padding: '8px 12px', gap: 8 }}>
          {needsTranscribe && onTranscribe && (
            <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={onTranscribe} style={{ minHeight: 44 }}>Litteroi</button>
          )}
          {canProcess && onProcess && (
            <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={onProcess} style={{ minHeight: 44 }}>Käsittele tekoälyllä</button>
          )}
        </div>
      )}
    </li>
  );
}

// ── Ehdotuksen tarkistus ────────────────────────────────────────

function ReviewPanel({ entry, orgId, canEdit, busy, notes, sections, goals, onClose, onProcess, onTranscribe }: {
  entry: BrainInboxEntry; orgId: string | null; canEdit: boolean; busy: boolean;
  notes: BrainNote[]; sections: BrainSection[]; goals: BrainGoal[];
  onClose: () => void; onProcess: () => void; onTranscribe: () => void;
}) {
  const { toast } = useToast();
  const base = useBrainBase();
  const resolve = useWikiResolver(notes);
  const { bySlug } = useNoteIndex(notes);
  const suggestion = entry.aiSuggestion || null;
  const originals = suggestion?.operations || [];
  const [ops, setOps] = useState<BrainOperation[]>(originals);
  const [modes, setModes] = useState<OpMode[]>(() => originals.map(() => 'accept'));
  const [saving, setSaving] = useState(false);
  const [confirmReject, setConfirmReject] = useState(false);
  const [result, setResult] = useState<{ sent: BrainOperation[]; res: ApplyResult } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const reviewable = canEdit && entry.status === 'ehdotettu' && !!suggestion;
  const acceptedIdx = modes.map((m, i) => (m === 'reject' ? -1 : i)).filter(i => i >= 0);
  const invalid = acceptedIdx.some(i => !opIsValid(ops[i]));
  const hasText = !!(entry.rawText || '').trim();

  const setMode = (i: number, m: OpMode) => setModes(prev => prev.map((x, j) => (j === i ? m : x)));
  const setOp = (i: number, op: BrainOperation) => setOps(prev => prev.map((x, j) => (j === i ? op : x)));

  const apply = async () => {
    if (!orgId || saving) return;
    const sent = acceptedIdx.map(i => ops[i]);
    setSaving(true);
    setSaveError(null);
    try {
      const res = await brainApi<ApplyResult>('inbox/apply', { body: { orgId, id: entry.id, operations: sent } });
      setResult({ sent, res });
      const failed = res.failed?.length || 0;
      toast(failed ? `${res.applied.length} tallennettu, ${failed} epäonnistui` : sent.length ? 'Tallennettu aivoihin' : 'Merkitty käsitellyksi', failed ? 'error' : 'success');
    } catch (e) {
      setSaveError(errMsg(e));
      toast(errMsg(e), 'error');
    } finally {
      setSaving(false);
    }
  };

  const rejectAll = async () => {
    if (!orgId || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await brainApi<ApplyResult>('inbox/apply', { body: { orgId, id: entry.id, reject: true } });
      setResult({ sent: [], res });
      setConfirmReject(false);
      toast('Kirjaus hylätty', 'success');
    } catch (e) {
      setSaveError(errMsg(e));
      toast(errMsg(e), 'error');
    } finally {
      setSaving(false);
    }
  };

  const meta = INBOX_STATUS_META[entry.status] || { label: entry.status, color: 'var(--t3)' };

  return (
    <section aria-labelledby="brain-review-h" style={{ ...brainCard, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <h2 id="brain-review-h" style={{ fontFamily: 'var(--font-display)', fontSize: 18, margin: 0 }}>Kirjauksen tarkistus</h2>
          <div style={{ fontSize: 13, color: 'var(--t3)', marginTop: 4 }}>
            {formatTime(entry.createdAt)} · {CHANNEL_LABELS[entry.channel] || entry.channel}
            {entry.createdByName ? ` · ${entry.createdByName}` : ''} · <span style={{ color: meta.color, fontWeight: 600 }}>Tila: {meta.label}</span>
          </div>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} style={{ minHeight: 44 }}>Sulje tarkistus</button>
      </div>

      <div>
        <div style={brainLabel}>Kirjaus</div>
        <div style={{ whiteSpace: 'pre-wrap', fontSize: 15, lineHeight: 1.55, marginTop: 4, padding: '8px 12px', background: 'var(--card2)', borderRadius: 'var(--r)' }}>
          {hasText ? entry.rawText : entry.audioPath ? 'Sanelua ei ole vielä muutettu tekstiksi.' : '(tyhjä)'}
        </div>
      </div>

      {entry.error && <div style={{ color: 'var(--red)', fontSize: 14 }}>Virhe: {entry.error}</div>}

      {/* Ei vielä ehdotusta */}
      {!suggestion && entry.status === 'uusi' && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 14, color: 'var(--t2)', flex: '1 1 200px' }}>Tekoäly ei ole vielä käsitellyt tätä kirjausta.</span>
          {canEdit && entry.audioPath && !hasText && (
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={onTranscribe} style={{ minHeight: 44 }}>Litteroi</button>
          )}
          {canEdit && hasText && (
            <button type="button" className="btn btn-primary" disabled={busy} onClick={onProcess} style={{ minHeight: 44 }}>Käsittele tekoälyllä</button>
          )}
        </div>
      )}

      {suggestion && (
        <>
          {suggestion.summary && (
            <div>
              <div style={brainLabel}>Tekoälyn yhteenveto</div>
              <p style={{ margin: '4px 0 0', fontSize: 15, lineHeight: 1.55 }}>{suggestion.summary}</p>
            </div>
          )}
          {suggestion.questions.length > 0 && (
            <div role="note" style={{ border: '2px solid var(--hetki-yellow)', background: 'var(--card2)', borderRadius: 'var(--r)', padding: '10px 14px' }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Tekoäly kysyy:</div>
              <ul style={{ margin: 0, paddingLeft: 20, fontSize: 15, lineHeight: 1.55 }}>
                {suggestion.questions.map((q, i) => <li key={i}>{q}</li>)}
              </ul>
              {reviewable && <div style={{ fontSize: 13, color: 'var(--t2)', marginTop: 6 }}>Voit tarkentaa ehdotuksia Muokkaa-napilla tai hylätä ne.</div>}
            </div>
          )}

          {originals.length === 0 ? (
            <div style={{ fontSize: 15, color: 'var(--t2)' }}>Tekoäly ei ehdottanut muutoksia.</div>
          ) : (
            <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {ops.map((op, i) => (
                <OperationCard key={i} index={i} op={op} original={originals[i]} mode={modes[i] || 'accept'}
                  editable={reviewable && !result} onMode={m => setMode(i, m)} onChange={o => setOp(i, o)}
                  bySlug={bySlug} sections={sections} goals={goals} base={base} resolve={resolve} />
              ))}
            </ol>
          )}
        </>
      )}

      {/* Tulos */}
      {result && (
        <div role="status" style={{ border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '10px 14px', fontSize: 15, lineHeight: 1.55 }}>
          {result.res.status === 'hylätty' ? (
            <div>Kirjaus hylätty. Aivoihin ei kirjoitettu mitään.</div>
          ) : (
            <>
              <div style={{ color: 'var(--green)', fontWeight: 600 }}>
                ✓ {result.sent.length ? `Aivoihin kirjoitettiin ${result.res.applied.length}/${result.sent.length} muutosta.` : 'Kirjaus merkitty käsitellyksi.'}
              </div>
              {!!result.res.failed?.length && (
                <div style={{ marginTop: 6 }}>
                  <div style={{ color: 'var(--red)', fontWeight: 600 }}>✕ Epäonnistui ({(result.res.failed || []).length}):</div>
                  <ul style={{ margin: '4px 0 0', paddingLeft: 20 }}>
                    {(result.res.failed || []).map(f => {
                      const op = result.sent[f.index];
                      return <li key={f.index}>{op ? `${OPERATION_LABELS[op.type]} (${opTitle(op, bySlug)})` : `Muutos ${f.index + 1}`}: {f.error}</li>;
                    })}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      )}
      {saveError && <div role="alert" style={{ color: 'var(--red)', fontSize: 14 }}>Tallennus epäonnistui: {saveError}</div>}

      {/* Toiminnot */}
      {reviewable && !result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          {invalid && <div style={{ color: 'var(--red)', fontSize: 14 }}>Jostakin hyväksytystä muutoksesta puuttuu pakollinen tieto. Täydennä se tai hylkää muutos.</div>}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {originals.length > 0 ? (
              <button type="button" className="btn btn-primary" disabled={saving || invalid || acceptedIdx.length === 0} onClick={() => void apply()}
                style={{ minHeight: 48, fontSize: 15, flex: '1 1 240px' }}>
                {saving ? 'Tallennetaan…' : `Tallenna hyväksytyt aivoihin (${acceptedIdx.length})`}
              </button>
            ) : (
              <button type="button" className="btn btn-primary" disabled={saving} onClick={() => void apply()} style={{ minHeight: 48, fontSize: 15, flex: '1 1 240px' }}>
                {saving ? 'Tallennetaan…' : 'Merkitse käsitellyksi'}
              </button>
            )}
            {!confirmReject && (
              <button type="button" className="btn btn-ghost" disabled={saving} onClick={() => setConfirmReject(true)} style={{ minHeight: 48, flex: '1 1 160px' }}>
                Hylkää koko kirjaus
              </button>
            )}
          </div>
          {originals.length > 0 && acceptedIdx.length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--t2)' }}>Kaikki muutokset on hylätty. Hylkää koko kirjaus, jos mitään ei tallenneta.</div>
          )}
          {confirmReject && (
            <div role="group" aria-labelledby="brain-reject-q" style={{ border: '2px solid var(--red)', borderRadius: 'var(--r)', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div id="brain-reject-q" style={{ fontSize: 15 }}>Haluatko varmasti hylätä koko kirjauksen? Aivoihin ei tallenneta mitään.</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                <button type="button" className="btn" disabled={saving} onClick={() => void rejectAll()}
                  style={{ minHeight: 44, background: 'var(--red)', color: 'var(--paper)', borderColor: 'var(--red)' }}>
                  {saving ? 'Hylätään…' : 'Kyllä, hylkää kirjaus'}
                </button>
                <button type="button" className="btn btn-secondary" disabled={saving} onClick={() => setConfirmReject(false)} style={{ minHeight: 44 }}>Peruuta</button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function opTitle(op: BrainOperation, bySlug: Map<string, BrainNote>): string {
  switch (op.type) {
    case 'append_to_note':
    case 'update_property': {
      const n = bySlug.get(op.targetSlug);
      return n ? n.title || n.name : op.targetSlug;
    }
    case 'create_note': return op.title || op.name;
    case 'add_decision': return excerpt(op.decision, 60);
    case 'add_proposal': return op.title;
    case 'update_goal_metric': return op.goalId;
  }
}

// ── Operaatiokortti ─────────────────────────────────────────────

const MODE_META: Record<OpMode, { label: string; color: string; icon: string }> = {
  accept: { label: 'Hyväksytty', color: 'var(--green)', icon: '✓' },
  edit: { label: 'Muokattu, hyväksytään muokattuna', color: 'var(--hetki-blue)', icon: '✎' },
  reject: { label: 'Hylätty, ei tallenneta', color: 'var(--t3)', icon: '✕' },
};

function OperationCard({ index, op, original, mode, editable, onMode, onChange, bySlug, sections, goals, base, resolve }: {
  index: number; op: BrainOperation; original: BrainOperation; mode: OpMode; editable: boolean;
  onMode: (m: OpMode) => void; onChange: (op: BrainOperation) => void;
  bySlug: Map<string, BrainNote>; sections: BrainSection[]; goals: BrainGoal[]; base: string;
  resolve: (target: string, heading: string | null) => WikiTarget;
}) {
  const m = MODE_META[mode];
  const edited = JSON.stringify(op) !== JSON.stringify(original);
  const valid = opIsValid(op);
  const labelId = `brain-op-${index}-h`;
  const rejected = mode === 'reject';

  return (
    <li aria-labelledby={labelId} style={{
      width: '100%', boxSizing: 'border-box', border: `2px solid ${m.color}`, borderRadius: 'var(--rl)', padding: '12px 14px',
      background: 'var(--card)', display: 'flex', flexDirection: 'column', gap: 10, opacity: rejected ? 0.75 : 1,
    }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'baseline' }}>
        <h3 id={labelId} style={{ margin: 0, fontSize: 16, flex: '1 1 200px' }}>
          {index + 1}. {OPERATION_LABELS[op.type]}
        </h3>
        <span style={{ fontSize: 13, fontWeight: 700, color: m.color }}>
          <span aria-hidden>{m.icon} </span>{m.label}{edited && mode === 'accept' ? ' (muokattu)' : ''}
        </span>
      </div>

      <OperationTarget op={op} bySlug={bySlug} sections={sections} goals={goals} base={base} />

      {op.reason && (
        <div style={{ fontSize: 14, color: 'var(--t2)', lineHeight: 1.5 }}>
          <span style={{ fontWeight: 600 }}>Perustelu: </span>{op.reason}
        </div>
      )}

      {!rejected && <OperationDiff op={op} bySlug={bySlug} sections={sections} goals={goals} resolve={resolve} />}

      {editable && mode === 'edit' && (
        <OperationEditor op={op} onChange={onChange} sections={sections} index={index} />
      )}
      {editable && mode === 'edit' && edited && (
        <div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange(original)} style={{ minHeight: 44 }}>Palauta tekoälyn versio</button>
        </div>
      )}
      {!rejected && !valid && <div style={{ color: 'var(--red)', fontSize: 14 }}>Pakollinen tieto puuttuu.</div>}

      {editable && (
        <div role="group" aria-label={`Valinta muutokselle ${index + 1}`} style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
          {(['accept', 'edit', 'reject'] as const).map(k => {
            const on = mode === k;
            const label = k === 'accept' ? 'Hyväksy' : k === 'edit' ? 'Muokkaa' : 'Hylkää';
            return (
              <button key={k} type="button" aria-pressed={on} onClick={() => onMode(k)}
                className={on ? 'btn' : 'btn btn-secondary'}
                style={{ minHeight: 44, fontWeight: on ? 700 : 400, ...(on ? { background: MODE_META[k].color, color: 'var(--paper)', borderColor: MODE_META[k].color } : {}) }}>
                {on && <span aria-hidden>{MODE_META[k].icon} </span>}{label}
              </button>
            );
          })}
        </div>
      )}
    </li>
  );
}

function OperationTarget({ op, bySlug, sections, goals, base }: {
  op: BrainOperation; bySlug: Map<string, BrainNote>; sections: BrainSection[]; goals: BrainGoal[]; base: string;
}) {
  const rowStyle: React.CSSProperties = { fontSize: 14, lineHeight: 1.5 };
  const sectionTitle = (slug: string | null | undefined) => (slug ? sections.find(s => s.slug === slug)?.title || slug : '');
  const noteLink = (slug: string) => {
    const n = bySlug.get(slug);
    return n
      ? <Link href={noteHref(base, slug)} style={{ color: 'var(--pri)', fontWeight: 600 }}>{n.title || n.name}</Link>
      : <span>{slug} <span style={{ color: 'var(--red)' }}>(muistiinpanoa ei löydy)</span></span>;
  };
  switch (op.type) {
    case 'append_to_note':
      return (
        <div style={rowStyle}>
          <span style={{ color: 'var(--t3)' }}>Kohde: </span>{noteLink(op.targetSlug)}
          {op.heading && <><span style={{ color: 'var(--t3)' }}> · Osio: </span>{op.heading}</>}
        </div>
      );
    case 'update_property':
      return (
        <div style={rowStyle}>
          <span style={{ color: 'var(--t3)' }}>Kohde: </span>{noteLink(op.targetSlug)}
          <span style={{ color: 'var(--t3)' }}> · Ominaisuus: </span>{op.key}
        </div>
      );
    case 'create_note':
      return (
        <div style={rowStyle}>
          <span style={{ color: 'var(--t3)' }}>Osio: </span>{sectionTitle(op.sectionSlug)}
          {op.kind && op.kind !== 'note' && <><span style={{ color: 'var(--t3)' }}> · Tyyppi: </span>{KIND_LABELS[op.kind]}</>}
        </div>
      );
    case 'add_decision':
      return op.areaSlug ? <div style={rowStyle}><span style={{ color: 'var(--t3)' }}>Alue: </span>{sectionTitle(op.areaSlug)}</div> : null;
    case 'add_proposal':
      return op.area ? <div style={rowStyle}><span style={{ color: 'var(--t3)' }}>Alue: </span>{op.area}</div> : null;
    case 'update_goal_metric': {
      const g = goals.find(x => x.id === op.goalId);
      const part = g && op.breakdownKey ? g.breakdown.find(b => b.key === op.breakdownKey)?.label || op.breakdownKey : op.breakdownKey;
      return (
        <div style={rowStyle}>
          <span style={{ color: 'var(--t3)' }}>Tavoite: </span><strong>{g ? g.title : op.goalId}</strong>
          {part && <><span style={{ color: 'var(--t3)' }}> · Osa: </span>{part}</>}
        </div>
      );
    }
  }
}

// Muutosvertailun rivit: − poistuva, + lisättävä, välilyönti = ennallaan. Merkki kertoo muutoksen, väri tukee.
const diffBox: React.CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 13, lineHeight: 1.55, borderRadius: 'var(--r)',
  border: '1px solid var(--border)', overflowX: 'auto', margin: 0,
};

function DiffLines({ lines, kind }: { lines: string[]; kind: 'ctx' | 'add' | 'del' }) {
  const sign = kind === 'add' ? '+' : kind === 'del' ? '−' : ' ';
  const style: React.CSSProperties = kind === 'add'
    ? { background: 'color-mix(in srgb, var(--green) 14%, transparent)', color: 'var(--t1)' }
    : kind === 'del'
      ? { background: 'color-mix(in srgb, var(--red) 12%, transparent)', color: 'var(--t1)', textDecoration: 'line-through' }
      : { color: 'var(--t3)' };
  return (
    <>
      {lines.map((l, i) => (
        <div key={i} style={{ ...style, padding: '0 10px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          <span aria-hidden style={{ display: 'inline-block', width: 16, fontWeight: 700, textDecoration: 'none', color: kind === 'add' ? 'var(--green)' : kind === 'del' ? 'var(--red)' : 'var(--t3)' }}>{sign}</span>
          <span className="sr-only" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{kind === 'add' ? 'Lisätään: ' : kind === 'del' ? 'Poistuu: ' : ''}</span>
          {l || ' '}
        </div>
      ))}
    </>
  );
}

function tailLines(s: string, n: number): { lines: string[]; cut: boolean } {
  const all = s.replace(/\s+$/, '').split('\n');
  return { lines: all.slice(-n), cut: all.length > n };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 14, lineHeight: 1.5 }}>
      <span style={{ color: 'var(--t3)' }}>{label}: </span>
      <span style={{ whiteSpace: 'pre-wrap' }}>{children}</span>
    </div>
  );
}

function OperationDiff({ op, bySlug, sections, goals, resolve }: {
  op: BrainOperation; bySlug: Map<string, BrainNote>; sections: BrainSection[]; goals: BrainGoal[];
  resolve: (target: string, heading: string | null) => WikiTarget;
}) {
  const [preview, setPreview] = useState(false);
  switch (op.type) {
    case 'append_to_note': {
      const note = bySlug.get(op.targetSlug);
      const body = note?.bodyMd || '';
      const sec = op.heading ? sectionUnderHeading(body, op.heading) : null;
      const newHeading = !!op.heading && sec === null;
      const ctx = tailLines(sec !== null ? sec : body, 6);
      const ctxLabel = op.heading && sec !== null ? `Osion "${op.heading}" nykyinen loppu` : 'Muistiinpanon nykyinen loppu';
      return (
        <div>
          <div style={{ ...brainLabel, marginBottom: 4 }}>Muutos</div>
          <div style={diffBox}>
            {note && body.trim() ? (
              <>
                <div style={{ padding: '4px 10px', fontSize: 12, color: 'var(--t3)', fontFamily: 'inherit' }}>{ctxLabel}{ctx.cut ? ' (alku lyhennetty)' : ''}:</div>
                <DiffLines lines={ctx.lines} kind="ctx" />
              </>
            ) : (
              <div style={{ padding: '4px 10px', fontSize: 12, color: 'var(--t3)' }}>{note ? 'Muistiinpano on tyhjä.' : 'Muistiinpanoa ei löydy.'}</div>
            )}
            {newHeading && <DiffLines lines={['', `## ${op.heading}`, '']} kind="add" />}
            <DiffLines lines={op.content.replace(/\s+$/, '').split('\n')} kind="add" />
          </div>
          {newHeading && <div style={{ fontSize: 13, color: 'var(--t2)', marginTop: 4 }}>Otsikkoa &quot;{op.heading}&quot; ei vielä ole, joten se lisätään muistiinpanon loppuun.</div>}
        </div>
      );
    }
    case 'update_property': {
      const note = bySlug.get(op.targetSlug);
      const old = note?.properties?.[op.key];
      return (
        <div>
          <div style={{ ...brainLabel, marginBottom: 4 }}>Muutos</div>
          <div style={diffBox}>
            {old !== undefined && old !== ''
              ? <DiffLines lines={[`${op.key}: ${old}`]} kind="del" />
              : <div style={{ padding: '4px 10px', fontSize: 12, color: 'var(--t3)' }}>Ominaisuutta ei ole vielä, se lisätään.</div>}
            <DiffLines lines={[`${op.key}: ${op.value}`]} kind="add" />
          </div>
        </div>
      );
    }
    case 'create_note': {
      const props = Object.entries(op.properties || {});
      const sectionTitle = sections.find(s => s.slug === op.sectionSlug)?.title || op.sectionSlug;
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <Field label="Nimi">{op.name}</Field>
          {op.title && op.title !== op.name && <Field label="Otsikko">{op.title}</Field>}
          <Field label="Osio">{sectionTitle}</Field>
          {props.length > 0 && <Field label="Ominaisuudet">{props.map(([k, v]) => `${k}: ${v}`).join(', ')}</Field>}
          <div style={{ ...brainLabel, marginTop: 4 }}>Uusi sisältö</div>
          <div style={diffBox}>
            <DiffLines lines={(op.content || '').replace(/\s+$/, '').split('\n')} kind="add" />
          </div>
          <div>
            <button type="button" className="btn btn-ghost btn-sm" aria-expanded={preview} onClick={() => setPreview(v => !v)} style={{ minHeight: 44 }}>
              {preview ? 'Piilota esikatselu' : 'Näytä esikatselu'}
            </button>
          </div>
          {preview && (
            <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '8px 12px' }}>
              <BrainMarkdown source={op.content || ''} resolve={resolve} compact />
            </div>
          )}
        </div>
      );
    }
    case 'add_decision': {
      const area = op.areaSlug ? sections.find(s => s.slug === op.areaSlug)?.title || op.areaSlug : '';
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Field label="Päivä">{op.decidedOn}</Field>
          <Field label="Päätös">{op.decision}</Field>
          {op.rationale && <Field label="Perustelu päätökselle">{op.rationale}</Field>}
          {area && <Field label="Alue">{area}</Field>}
        </div>
      );
    }
    case 'add_proposal':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Field label="Otsikko">{op.title}</Field>
          {op.content && <Field label="Sisältö">{op.content}</Field>}
          {op.area && <Field label="Alue">{op.area}</Field>}
          {op.impact && <Field label="Vaikutus">{op.impact}</Field>}
          {op.urgency && <Field label="Kiireellisyys">{op.urgency}</Field>}
        </div>
      );
    case 'update_goal_metric': {
      const g = goals.find(x => x.id === op.goalId);
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Field label="Kausi">{op.period}</Field>
          <Field label="Uusi arvo">{Number.isFinite(op.value) ? formatValue(op.value, g?.unit || '') : '(puuttuu)'}</Field>
          {g && <Field label="Tavoite">{formatValue(g.targetValue, g.unit)}</Field>}
          {op.note && <Field label="Huomio">{op.note}</Field>}
        </div>
      );
    }
  }
}

// ── Muokkauskentät ──────────────────────────────────────────────

const inputStyle: React.CSSProperties = { width: '100%', fontSize: 16, minHeight: 44, boxSizing: 'border-box' };

function TextField({ id, label, value, onChange, multiline, type }: {
  id: string; label: string; value: string; onChange: (v: string) => void; multiline?: boolean; type?: string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label htmlFor={id} style={{ fontSize: 14, fontWeight: 600 }}>{label}</label>
      {multiline
        ? <textarea id={id} className="input" rows={5} value={value} onChange={e => onChange(e.target.value)} style={{ ...inputStyle, lineHeight: 1.5, resize: 'vertical' }} />
        : <input id={id} className="input" type={type || 'text'} value={value} onChange={e => onChange(e.target.value)} style={inputStyle} />}
    </div>
  );
}

function NumberField({ id, label, value, onChange }: { id: string; label: string; value: number; onChange: (v: number) => void }) {
  // Oma tekstitila, jotta pilkku ja keskeneräinen luku säilyvät kirjoittaessa
  const [raw, setRaw] = useState(() => (Number.isFinite(value) ? String(value).replace('.', ',') : ''));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label htmlFor={id} style={{ fontSize: 14, fontWeight: 600 }}>{label}</label>
      <input id={id} className="input" type="text" inputMode="decimal" value={raw}
        onChange={e => {
          setRaw(e.target.value);
          const s = e.target.value.replace(/\s/g, '').replace(',', '.');
          onChange(s === '' ? Number.NaN : Number(s));
        }}
        style={inputStyle} />
    </div>
  );
}

function OperationEditor({ op, onChange, sections, index }: {
  op: BrainOperation; onChange: (op: BrainOperation) => void; sections: BrainSection[]; index: number;
}) {
  const id = (k: string) => `brain-op-${index}-${k}`;
  const wrap: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 10, padding: '10px 12px', background: 'var(--card2)', borderRadius: 'var(--r)' };
  switch (op.type) {
    case 'append_to_note':
      return (
        <div style={wrap}>
          <TextField id={id('heading')} label="Otsikko, jonka alle lisätään (tyhjä = loppuun)" value={op.heading || ''} onChange={v => onChange({ ...op, heading: v || null })} />
          <TextField id={id('content')} label="Lisättävä teksti" value={op.content} onChange={v => onChange({ ...op, content: v })} multiline />
        </div>
      );
    case 'update_property':
      return (
        <div style={wrap}>
          <TextField id={id('value')} label={`Uusi arvo: ${op.key}`} value={op.value} onChange={v => onChange({ ...op, value: v })} />
        </div>
      );
    case 'create_note':
      return (
        <div style={wrap}>
          <TextField id={id('name')} label="Nimi (linkit viittaavat tähän)" value={op.name} onChange={v => onChange({ ...op, name: v })} />
          <TextField id={id('title')} label="Otsikko" value={op.title || ''} onChange={v => onChange({ ...op, title: v || undefined })} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label htmlFor={id('section')} style={{ fontSize: 14, fontWeight: 600 }}>Osio</label>
            <select id={id('section')} className="input" value={op.sectionSlug} onChange={e => onChange({ ...op, sectionSlug: e.target.value })} style={inputStyle}>
              {!sections.some(s => s.slug === op.sectionSlug) && <option value={op.sectionSlug}>{op.sectionSlug}</option>}
              {sections.map(s => <option key={s.slug} value={s.slug}>{s.title}</option>)}
            </select>
          </div>
          <TextField id={id('content')} label="Sisältö (Markdown)" value={op.content} onChange={v => onChange({ ...op, content: v })} multiline />
        </div>
      );
    case 'add_decision':
      return (
        <div style={wrap}>
          <TextField id={id('date')} label="Päivä" type="date" value={op.decidedOn} onChange={v => onChange({ ...op, decidedOn: v })} />
          <TextField id={id('decision')} label="Päätös" value={op.decision} onChange={v => onChange({ ...op, decision: v })} multiline />
          <TextField id={id('rationale')} label="Perustelu päätökselle" value={op.rationale || ''} onChange={v => onChange({ ...op, rationale: v || undefined })} multiline />
        </div>
      );
    case 'add_proposal':
      return (
        <div style={wrap}>
          <TextField id={id('title')} label="Otsikko" value={op.title} onChange={v => onChange({ ...op, title: v })} />
          <TextField id={id('content')} label="Sisältö" value={op.content} onChange={v => onChange({ ...op, content: v })} multiline />
          <TextField id={id('area')} label="Alue" value={op.area || ''} onChange={v => onChange({ ...op, area: v || undefined })} />
          <TextField id={id('impact')} label="Vaikutus" value={op.impact || ''} onChange={v => onChange({ ...op, impact: v || undefined })} />
          <TextField id={id('urgency')} label="Kiireellisyys" value={op.urgency || ''} onChange={v => onChange({ ...op, urgency: v || undefined })} />
        </div>
      );
    case 'update_goal_metric':
      return (
        <div style={wrap}>
          <NumberField id={id('value')} label="Arvo" value={op.value} onChange={v => onChange({ ...op, value: v })} />
          <TextField id={id('period')} label="Kausi" value={op.period} onChange={v => onChange({ ...op, period: v })} />
          <TextField id={id('note')} label="Huomio" value={op.note || ''} onChange={v => onChange({ ...op, note: v || undefined })} />
        </div>
      );
  }
}
