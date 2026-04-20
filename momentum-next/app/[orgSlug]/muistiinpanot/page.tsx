'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import AppShell from '@/components/AppShell';
import { useOrgData } from '@/lib/firestore';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { useParams } from 'next/navigation';
import { getOrgTeamMembers } from '@/lib/org-defaults';
import { OrgTeamMember } from '@/lib/team-shared';
import { useIsMobile } from '@/lib/use-mobile';
import { softDelete, filterActive } from '@/lib/trash';
import { workerFetch } from '@/lib/worker-fetch';

interface ActionItem {
  text: string;
  assignee: string;
  confirmed?: boolean;
}

interface MeetingNote {
  id: string;
  title: string;
  date: string; // ISO date
  attendees: string[];
  content: string;
  summary?: string; // AI-generated summary
  actionItems?: ActionItem[]; // AI-ehdottamat toimenpiteet
  rawTranscription?: string; // raaka litterointi sellaisenaan
  cleanTranscription?: string; // kiteytetty, putsattu litterointi
  createdAt: number;
  deletedAt?: number;
}

export default function MuistiinpanotPage() {
  const { canEdit, activeOrg } = useAuth();
  const { toast } = useToast();
  const params = useParams();
  const orgSlug = (params.orgSlug as string) || '';
  const [notes, setNotes] = useOrgData<MeetingNote[]>('meetingNotes', []);
  const [members] = useOrgData<OrgTeamMember[]>('orgTeamMembers', getOrgTeamMembers(orgSlug));
  const [tasks, setTasks] = useOrgData<{ id: string; text: string; assignee?: string; hankkia: boolean; done: boolean; priority: 'normal' | 'high'; deadline?: string; note?: string; category?: string }[]>('tasks', []);
  const isMobile = useIsMobile();
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [selectedNote, setSelectedNote] = useState<string | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  const [summarizingId, setSummarizingId] = useState<string | null>(null);
  const [editingSummary, setEditingSummary] = useState(false);
  const [editSummaryText, setEditSummaryText] = useState('');
  const [contextText, setContextText] = useState('');
  const [showContextInput, setShowContextInput] = useState(false);
  const [refiningContext, setRefiningContext] = useState(false);
  const [showAddAction, setShowAddAction] = useState(false);
  const [newActionText, setNewActionText] = useState('');
  const [newActionAssignee, setNewActionAssignee] = useState('');

  // Text-to-speech state
  const [isSpeaking, setIsSpeaking] = useState(false);

  const readAloud = useCallback((text: string) => {
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'fi-FI';
    utterance.rate = 1.0;
    // Try to find Finnish voice
    const voices = window.speechSynthesis.getVoices();
    const fiVoice = voices.find(v => v.lang.startsWith('fi'));
    if (fiVoice) utterance.voice = fiVoice;
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    setIsSpeaking(true);
    window.speechSynthesis.speak(utterance);
  }, [isSpeaking]);

  // Stop speech on unmount or note change
  useEffect(() => {
    return () => { window.speechSynthesis.cancel(); };
  }, [selectedNote]);

  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [transcribing, setTranscribing] = useState(false);
  const [hasRecovery, setHasRecovery] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Form state
  const [nTitle, setNTitle] = useState('');
  const [nDate, setNDate] = useState(new Date().toISOString().split('T')[0]);
  const [nAttendees, setNAttendees] = useState<string[]>([]);
  const [nContent, setNContent] = useState('');
  const [nRawTranscription, setNRawTranscription] = useState('');
  const [nCleanTranscription, setNCleanTranscription] = useState('');

  const openNew = () => {
    setEditId(null);
    setNTitle('');
    setNDate(new Date().toISOString().split('T')[0]);
    setNAttendees([]);
    setNContent('');
    setNRawTranscription('');
    setNCleanTranscription('');
    setShowForm(true);
  };

  const openEdit = (note: MeetingNote) => {
    setEditId(note.id);
    setNTitle(note.title);
    setNDate(note.date);
    setNAttendees(note.attendees);
    setNContent(note.content);
    setNRawTranscription(note.rawTranscription || '');
    setNCleanTranscription(note.cleanTranscription || '');
    setShowForm(true);
  };

  const save = () => {
    if (!nTitle.trim() || !nContent.trim()) return;
    const existing = editId ? notes.find(n => n.id === editId) : undefined;
    const note: MeetingNote = {
      id: editId || 'mn_' + Date.now(),
      title: nTitle.trim(),
      date: nDate,
      attendees: nAttendees,
      content: nContent.trim(),
      summary: existing?.summary,
      rawTranscription: nRawTranscription || existing?.rawTranscription || undefined,
      cleanTranscription: nCleanTranscription || existing?.cleanTranscription || undefined,
      createdAt: existing?.createdAt ?? Date.now(),
    };
    if (editId) setNotes(prev => prev.map(x => x.id === editId ? note : x));
    else setNotes(prev => [note, ...prev]);
    setShowForm(false);
    toast(editId ? 'Muistiinpano päivitetty' : 'Muistiinpano lisätty', 'success');
  };

  const remove = (id: string) => {
    setNotes(prev => softDelete(prev, id));
    if (selectedNote === id) setSelectedNote(null);
    toast('Siirretty roskakoriin', 'success');
  };

  const toggleAttendee = (name: string) => {
    setNAttendees(prev =>
      prev.includes(name) ? prev.filter(a => a !== name) : [...prev, name]
    );
  };

  // AI summary request
  const requestSummary = async (noteId: string) => {
    const note = notes.find(n => n.id === noteId);
    if (!note) return;
    setSummarizing(true);
    setSummarizingId(noteId);
    try {
      const prompt = `Tee tiivis yhteenveto seuraavasta palaverimuistiinpanosta. Vastaa SELKOTEKSTINA ilman markdown-muotoilua (ei #-otsikoita, ei **-boldausta, ei listamerkkejä). Kayta tavallisia kappaleita ja riveja.

Yhteenvedon jalkeen listaa kaikki toimenpiteet ja paatokset omalla rivillaan muodossa:
---TOIMENPITEET---
Vastuuhenkilo: Toimenpiteen kuvaus
Vastuuhenkilo: Toinen toimenpide

Jos vastuuhenkiloa ei tiedeta, kayta "Kaikki" tai "Ei maaritetty".
Vastaa suomeksi.

Otsikko: ${note.title}
Paivamaara: ${note.date}
Osallistujat: ${note.attendees.join(', ') || 'Ei merkitty'}

Muistiinpano:
${note.content}`;

      const response = await workerFetch('/api/chat', {
        method: 'POST',
        orgId: activeOrg || '',
        body: JSON.stringify({
          messages: [{ role: 'user', content: prompt }],
          systemContext: 'Olet palaverimuistiinpanojen yhteenvetaja. Vastaa selkotekstina ilman markdown-muotoilua.',
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const raw = (data.response || '') as string;
        // Parse summary and action items
        const sepIdx = raw.indexOf('---TOIMENPITEET---');
        const summary = (sepIdx >= 0 ? raw.slice(0, sepIdx) : raw).trim();
        const actionItems: ActionItem[] = [];
        if (sepIdx >= 0) {
          const lines = raw.slice(sepIdx + '---TOIMENPITEET---'.length).trim().split('\n').filter(l => l.trim());
          for (const line of lines) {
            const colonIdx = line.indexOf(':');
            if (colonIdx > 0) {
              actionItems.push({
                text: line.slice(colonIdx + 1).trim(),
                assignee: line.slice(0, colonIdx).trim().replace(/^-\s*/, ''),
                confirmed: false,
              });
            }
          }
        }
        if (summary) {
          setNotes(prev => prev.map(n => n.id === noteId ? { ...n, summary, actionItems: actionItems.length > 0 ? actionItems : n.actionItems } : n));
          toast('Yhteenveto luotu', 'success');
        }
      } else {
        const lines = note.content.split('\n').filter(l => l.trim());
        const summary = `Palaveri: ${note.title} (${note.date})\nOsallistujat: ${note.attendees.join(', ') || '-'}\n\nPaakohdat:\n${lines.slice(0, 5).map(l => '- ' + l.trim()).join('\n')}`;
        setNotes(prev => prev.map(n => n.id === noteId ? { ...n, summary } : n));
        toast('Yhteenveto luotu (perusmuoto)', 'success');
      }
    } catch {
      toast('Yhteenvedon luonti eponnistui', 'error');
    } finally {
      setSummarizing(false);
      setSummarizingId(null);
    }
  };

  // ── Summary editing ──
  const startEditSummary = (note: MeetingNote) => {
    setEditSummaryText(note.summary || '');
    setEditingSummary(true);
  };

  const saveSummaryEdits = (noteId: string) => {
    setNotes(prev => prev.map(n => n.id === noteId ? {
      ...n,
      summary: editSummaryText.trim(),
    } : n));
    setEditingSummary(false);
    toast('Yhteenveto päivitetty', 'success');
  };

  const cancelSummaryEdit = () => {
    setEditingSummary(false);
    setEditSummaryText('');
  };

  // ── Refine summary with context ──
  const refineSummaryWithContext = async (noteId: string) => {
    const note = notes.find(n => n.id === noteId);
    if (!note || !contextText.trim()) return;
    setRefiningContext(true);
    try {
      const prompt = `Alla on palaverimuistiinpanon AI-yhteenveto. Kayttaja on lisannyt korjauksen tai tarkennuksen. Päivitä yhteenveto niin etta korjaus on huomioitu. Vastaa SELKOTEKSTINA ilman markdown-muotoilua. Sailyta yhteenvedon rakenne ja tyyli, muuta vain se mika korjauksen perusteella pitaa muuttaa.

Nykyinen yhteenveto:
${note.summary}

Kayttajan korjaus/tarkennus:
${contextText.trim()}

Paivitetty yhteenveto:`;

      const response = await workerFetch('/api/chat', {
        method: 'POST',
        orgId: activeOrg || '',
        body: JSON.stringify({
          messages: [{ role: 'user', content: prompt }],
          systemContext: 'Olet palaverimuistiinpanojen yhteenvetaja. Päivitä yhteenveto kayttajan korjauksen perusteella. Vastaa selkotekstina ilman markdown-muotoilua.',
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const updated = ((data.response || '') as string).trim();
        if (updated) {
          setNotes(prev => prev.map(n => n.id === noteId ? { ...n, summary: updated } : n));
          toast('Yhteenveto päivitetty korjauksen perusteella', 'success');
        }
      } else {
        toast('Päivitys epäonnistui', 'error');
      }
    } catch {
      toast('Päivitys epäonnistui', 'error');
    } finally {
      setRefiningContext(false);
      setContextText('');
      setShowContextInput(false);
    }
  };

  // ── Action item management ──
  const updateActionItem = (noteId: string, idx: number, updates: Partial<ActionItem>) => {
    setNotes(prev => prev.map(n => {
      if (n.id !== noteId || !n.actionItems) return n;
      const items = [...n.actionItems];
      items[idx] = { ...items[idx], ...updates };
      return { ...n, actionItems: items };
    }));
  };

  const addActionItem = (noteId: string, text: string, assignee: string) => {
    if (!text.trim()) return;
    const item: ActionItem = { text: text.trim(), assignee: assignee || '', confirmed: false };
    setNotes(prev => prev.map(n => {
      if (n.id !== noteId) return n;
      return { ...n, actionItems: [...(n.actionItems || []), item] };
    }));
    toast('Toimenpide lisätty', 'success');
  };

  const removeActionItem = (noteId: string, idx: number) => {
    setNotes(prev => prev.map(n => {
      if (n.id !== noteId || !n.actionItems) return n;
      return { ...n, actionItems: n.actionItems.filter((_, i) => i !== idx) };
    }));
  };

  const createTaskFromAction = (noteId: string, idx: number) => {
    const note = notes.find(n => n.id === noteId);
    const item = note?.actionItems?.[idx];
    if (!item) return;
    const newTask = {
      id: 't_' + Date.now(),
      text: item.text,
      assignee: item.assignee || undefined,
      hankkia: false,
      done: false,
      priority: 'normal' as const,
      note: `Palaverista: ${note.title} (${note.date})`,
    };
    setTasks(prev => [newTask, ...prev]);
    updateActionItem(noteId, idx, { confirmed: true });
    toast(`Tehtävä luotu: ${item.assignee || 'Ei tekijää'}`, 'success');
  };

  // ── IndexedDB: save chunks progressively during recording ──
  const DB_NAME = 'hetki_recording';
  const STORE_NAME = 'chunks';

  const openIDB = useCallback((): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => { req.result.createObjectStore(STORE_NAME); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }, []);

  const saveChunkToIDB = useCallback(async (chunk: Blob, index: number) => {
    try {
      const db = await openIDB();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(chunk, index);
      tx.objectStore(STORE_NAME).put({ count: index + 1, mimeType: chunk.type, ts: Date.now() }, 'meta');
      db.close();
    } catch { /* silently fail */ }
  }, [openIDB]);

  const clearIDB = useCallback(async () => {
    try {
      const db = await openIDB();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).clear();
      db.close();
    } catch { /* ignore */ }
    setHasRecovery(false);
  }, [openIDB]);

  const recoverFromIDB = useCallback(async (): Promise<Blob | null> => {
    try {
      const db = await openIDB();
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const meta = await new Promise<{ count: number; mimeType: string; ts: number } | undefined>((res) => {
        const r = store.get('meta'); r.onsuccess = () => res(r.result); r.onerror = () => res(undefined);
      });
      if (!meta || !meta.count) { db.close(); return null; }
      const chunks: Blob[] = [];
      for (let i = 0; i < meta.count; i++) {
        const chunk = await new Promise<Blob | undefined>((res) => {
          const r = store.get(i); r.onsuccess = () => res(r.result); r.onerror = () => res(undefined);
        });
        if (chunk) chunks.push(chunk);
      }
      db.close();
      if (chunks.length === 0) return null;
      return new Blob(chunks, { type: meta.mimeType || 'audio/webm' });
    } catch { return null; }
  }, [openIDB]);

  // ── Recording ──
  const chunkIndexRef = useRef(0);

  const startRecording = useCallback(async () => {
    try {
      await clearIDB();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '';
      const recorder = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        audioBitsPerSecond: 32000, // 32 kbps — tunti ~ 14 MB
      });
      audioChunksRef.current = [];
      chunkIndexRef.current = 0;
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
          saveChunkToIDB(e.data, chunkIndexRef.current++);
        }
      };
      recorder.start(1000);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);
    } catch {
      toast('Mikrofonin kaytto ei onnistunut', 'error');
    }
  }, [toast, clearIDB, saveChunkToIDB]);

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;
    return new Promise<Blob>((resolve) => {
      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        recorder.stream.getTracks().forEach(t => t.stop());
        resolve(blob);
      };
      recorder.stop();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    });
  }, []);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  // ── Beforeunload warning during recording ──
  useEffect(() => {
    if (!isRecording) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isRecording]);

  // Check for recovery on mount
  useEffect(() => {
    (async () => {
      try {
        const db = await openIDB();
        const tx = db.transaction('chunks', 'readonly');
        const meta = await new Promise<{ count: number; ts: number } | undefined>((res) => {
          const r = tx.objectStore('chunks').get('meta'); r.onsuccess = () => res(r.result); r.onerror = () => res(undefined);
        });
        db.close();
        if (meta && meta.count > 0) setHasRecovery(true);
      } catch { /* no recovery */ }
    })();
  }, [openIDB]);

  // ── Send one audio blob to Whisper ──
  const transcribeChunk = useCallback(async (blob: Blob, filename: string): Promise<string> => {
    const form = new FormData();
    form.append('audio', blob, filename);
    const res = await workerFetch('/api/transcribe', {
      method: 'POST',
      orgId: activeOrg || '',
      body: form,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Litterointi epäonnistui' }));
      throw new Error((err as { error?: string }).error || 'Litterointi epäonnistui');
    }
    const { transcription } = await res.json() as { transcription: string };
    return transcription || '';
  }, [activeOrg]);

  // ── AI cleanup + open form ──
  const finishTranscription = useCallback(async (transcription: string) => {
    let clean = '';
    try {
      const chatRes = await workerFetch('/api/chat', {
        method: 'POST',
        orgId: activeOrg || '',
        body: JSON.stringify({
          messages: [{ role: 'user', content: `Olet litteroinnin putsaaja. Alla on raaka litterointi palaverista tai muistiinpanosta. Tee siitä selkeä, kiteytetty versio jossa kaikki oleelliset asiat ovat mukana.\n\nOhjeet:\n- Poista täytesanat, toistot ja epäselvyydet\n- Säilytä kaikki faktat, päätökset ja toimenpiteet\n- Jos puhujat mainitsevat nimensä tai nimiin viitataan keskustelussa, merkitse puheenvuorot muodossa "Nimi: sanoma asia"\n- Jos puhujia ei voi tunnistaa, kirjoita teksti ilman puhujamerkintöjä\n- Vastaa suomeksi\n\nRaaka litterointi:\n${transcription}` }],
          systemContext: 'Olet litteroinnin putsaaja. Tunnista puhujat jos mahdollista ja tuota selkeä versio raa\'asta litteroinnista.',
        }),
      });
      if (chatRes.ok) {
        const chatData = await chatRes.json() as { response?: string };
        clean = chatData.response || '';
      }
    } catch {
      // Clean transcription is optional
    }
    setNRawTranscription(transcription);
    setNCleanTranscription(clean);
    setNContent(transcription);
    if (!nTitle) setNTitle('Litteroitu ' + new Date().toISOString().split('T')[0]);
    setShowForm(true);
    clearIDB();
    toast('Litterointi valmis', 'success');
  }, [activeOrg, nTitle, toast, clearIDB]);

  // ── Transcription flow (supports large files via audio decoding + WAV chunking) ──
  const transcribeAudio = useCallback(async (audioBlob: Blob) => {
    setTranscribing(true);
    try {
      // Small files (< 24 MB): send directly
      if (audioBlob.size <= 24 * 1024 * 1024) {
        const ext = audioBlob.type.includes('mp4') ? 'mp4' : audioBlob.type.includes('mp3') || audioBlob.type.includes('mpeg') ? 'mp3' : audioBlob.type.includes('wav') ? 'wav' : 'webm';
        const transcription = await transcribeChunk(audioBlob, `recording.${ext}`);
        if (!transcription) throw new Error('Tyhjä litterointi — ei tunnistettu puhetta');
        return await finishTranscription(transcription);
      }

      // Large files: decode to AudioBuffer, split into valid WAV chunks
      toast('Puretaan äänitiedostoa...', 'success');
      const ab = await audioBlob.arrayBuffer();
      const audioCtx = new AudioContext({ sampleRate: 16000 });
      const audioBuffer = await audioCtx.decodeAudioData(ab);
      audioCtx.close();

      // 16kHz mono 16-bit = ~1.92 MB/min → 12 min per ~23 MB chunk
      const chunkSec = 720;
      const samplesPerChunk = chunkSec * audioBuffer.sampleRate;
      const totalChunks = Math.ceil(audioBuffer.length / samplesPerChunk);
      const parts: string[] = [];

      for (let i = 0; i < totalChunks; i++) {
        const startSample = i * samplesPerChunk;
        const endSample = Math.min(startSample + samplesPerChunk, audioBuffer.length);
        // Encode chunk as valid WAV file
        const wavBlob = encodeAudioBufferToWav(audioBuffer, startSample, endSample);
        toast(`Litteroidaan osaa ${i + 1}/${totalChunks}...`, 'success');
        const part = await transcribeChunk(wavBlob, `chunk_${i}.wav`);
        if (part) parts.push(part);
      }

      const transcription = parts.join('\n\n');
      if (!transcription) throw new Error('Tyhjä litterointi — ei tunnistettu puhetta');
      await finishTranscription(transcription);
    } catch (e) {
      toast((e as Error).message || 'Litterointi epäonnistui', 'error');
    } finally {
      setTranscribing(false);
    }
  }, [toast, transcribeChunk, finishTranscription]);

  // ── Record & transcribe flow ──
  const handleStopAndTranscribe = useCallback(async () => {
    const blob = await stopRecording();
    if (blob) await transcribeAudio(blob);
  }, [stopRecording, transcribeAudio]);

  // ── File upload handler ──
  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ''; // reset input
    await transcribeAudio(file);
  }, [transcribeAudio]);

  // Sort newest first
  const sorted = [...filterActive(notes)].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Detail view
  const detail = selectedNote ? notes.find(n => n.id === selectedNote) : null;

  if (detail) {
    return (
      <AppShell title={detail.title} subtitle={formatDate(detail.date)}>
        <button className="btn btn-ghost" onClick={() => setSelectedNote(null)} style={{ marginBottom: '1rem' }}>{'<-'} Takaisin</button>

        {/* Attendees */}
        {detail.attendees.length > 0 && (
          <div style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
            <span style={{ fontSize: '.72rem', color: 'var(--t3)', fontWeight: 600 }}>Paikalla:</span>
            {detail.attendees.map(a => (
              <span key={a} style={{
                fontSize: '.72rem', padding: '.2rem .5rem', borderRadius: 9999,
                background: 'rgba(5,107,159,.1)', color: 'var(--pri-l)', fontWeight: 600,
              }}>{a}</span>
            ))}
          </div>
        )}

        {/* Korjaa yhteenvetoa — aina nakyvissa yhteenvedon ylapuolella */}
        {detail.summary && canEdit && (
          <div style={{
            background: 'rgba(241,180,52,.04)', border: '1px solid rgba(241,180,52,.15)',
            borderRadius: 'var(--rl)', padding: '.75rem 1rem', marginBottom: '.75rem',
          }}>
            {!showContextInput ? (
              <div
                onClick={() => { setContextText(''); setShowContextInput(true); }}
                style={{ fontSize: '.78rem', color: 'var(--yellow)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '.4rem' }}
              >
                <span style={{ fontSize: '.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' }}>Korjaa yhteenvetoa</span>
                <span style={{ color: 'var(--t3)', fontSize: '.75rem' }}>-- kerro mitä AI ymmärsi väärin</span>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: '.65rem', fontWeight: 700, color: 'var(--yellow)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: '.35rem' }}>
                  Korjaa yhteenvetoa
                </div>
                <div style={{ fontSize: '.68rem', color: 'var(--t3)', marginBottom: '.5rem' }}>
                  Kerro mitä pitää korjata. AI päivittää yhteenvedon korjauksesi perusteella.
                </div>
                <textarea
                  className="input textarea"
                  value={contextText}
                  onChange={e => setContextText(e.target.value)}
                  autoFocus
                  placeholder="Esim: Kohdassa X puhuttiin oikeasti Y:sta. Svetlanan ehdotus koski 2027 budjettia, ei 2026."
                  style={{
                    fontSize: '.82rem', lineHeight: 1.5, minHeight: 70, width: '100%',
                    background: 'rgba(255,255,255,.03)',
                  }}
                />
                <div style={{ display: 'flex', gap: '.35rem', justifyContent: 'flex-end', marginTop: '.5rem' }}>
                  <button className="btn btn-ghost btn-sm" style={{ fontSize: '.65rem' }} onClick={() => { setShowContextInput(false); setContextText(''); }}>Peruuta</button>
                  <button
                    className="btn btn-primary btn-sm"
                    style={{ fontSize: '.65rem' }}
                    disabled={!contextText.trim() || refiningContext}
                    onClick={() => refineSummaryWithContext(detail.id)}
                  >
                    {refiningContext ? 'Päivitetään...' : 'Päivitä yhteenveto'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* AI Summary */}
        {detail.summary && (
          <div style={{
            background: 'linear-gradient(135deg, rgba(155,124,246,.06), rgba(5,107,159,.04))',
            border: '1px solid rgba(155,124,246,.2)', borderRadius: 'var(--rl)',
            padding: editingSummary ? '1.5rem' : '1.25rem', marginBottom: '1.25rem',
            transition: 'padding .2s ease',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.5rem' }}>
              <div style={{ fontSize: '.68rem', fontWeight: 700, color: '#9b7cf6', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                AI-yhteenveto
              </div>
              <div style={{ display: 'flex', gap: '.3rem' }}>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => readAloud(detail.summary || '')}
                  style={{ fontSize: '.65rem', color: isSpeaking ? 'var(--red)' : 'var(--pri)', padding: '.2rem .5rem' }}
                >
                  {isSpeaking ? 'Pysayta' : 'Lue aaneen'}
                </button>
                {canEdit && !editingSummary && (
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => startEditSummary(detail)}
                    style={{ fontSize: '.65rem', color: '#9b7cf6', padding: '.2rem .5rem' }}
                  >
                    Muokkaa tekstia
                  </button>
                )}
              </div>
            </div>

            {editingSummary ? (
              <>
                <textarea
                  className="input textarea"
                  value={editSummaryText}
                  onChange={e => setEditSummaryText(e.target.value)}
                  autoFocus
                  style={{
                    fontSize: '.88rem', lineHeight: 1.8, width: '100%',
                    minHeight: Math.max(240, Math.min(500, editSummaryText.split('\n').length * 28)),
                    background: 'rgba(255,255,255,.03)', marginBottom: '.75rem',
                    transition: 'min-height .2s ease',
                  }}
                />
                <div style={{ display: 'flex', gap: '.5rem', justifyContent: 'flex-end' }}>
                  <button className="btn btn-ghost btn-sm" onClick={cancelSummaryEdit}>Peruuta</button>
                  <button className="btn btn-primary btn-sm" onClick={() => saveSummaryEdits(detail.id)}>Tallenna</button>
                </div>
              </>
            ) : (
              <div style={{ fontSize: '.85rem', lineHeight: 1.7, color: 'var(--t1)', whiteSpace: 'pre-wrap' }}>
                {detail.summary}
              </div>
            )}
          </div>
        )}

        {/* Action items */}
        {((detail.actionItems && detail.actionItems.length > 0) || canEdit) && (
          <div style={{
            border: '1px solid rgba(155,124,246,.2)', borderRadius: 'var(--rl)',
            marginBottom: '1.25rem', overflow: 'hidden',
          }}>
            <div style={{ padding: '.75rem 1.25rem', background: 'rgba(155,124,246,.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '.68rem', fontWeight: 700, color: '#9b7cf6', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                Toimenpiteet {detail.actionItems && detail.actionItems.length > 0 && `(${detail.actionItems.filter(a => a.confirmed).length}/${detail.actionItems.length} vahvistettu)`}
              </span>
              {canEdit && !showAddAction && (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setShowAddAction(true)}
                  style={{ fontSize: '.65rem', color: '#9b7cf6', padding: '.2rem .5rem' }}
                >
                  + Lisää toimenpide
                </button>
              )}
            </div>
            {detail.actionItems && detail.actionItems.map((item, idx) => (
              <div key={idx} style={{
                padding: '.75rem 1.25rem', borderTop: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', gap: '.75rem',
                background: item.confirmed ? 'rgba(24,94,91,.04)' : 'var(--card)',
                opacity: item.confirmed ? 0.7 : 1,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '.82rem', lineHeight: 1.5, color: 'var(--t1)' }}>{item.text}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginTop: '.35rem' }}>
                    <select
                      value={item.assignee}
                      onChange={e => {
                        if (!canEdit) return;
                        updateActionItem(detail.id, idx, { assignee: e.target.value });
                        // If already confirmed, also update the task
                        if (item.confirmed) {
                          setTasks(prev => prev.map(t =>
                            t.note?.includes(detail.title) && t.text === item.text
                              ? { ...t, assignee: e.target.value || undefined }
                              : t
                          ));
                          toast('Tehtavan tekija paivitetty', 'success');
                        }
                      }}
                      disabled={!canEdit}
                      style={{
                        fontSize: '.7rem', padding: '.2rem .4rem', borderRadius: 'var(--r)',
                        background: 'var(--elev)', border: '1px solid var(--border)', color: 'var(--t1)',
                        fontWeight: 600, cursor: canEdit ? 'pointer' : 'default',
                      }}
                    >
                      <option value="">Ei tekijaa</option>
                      <option value="Kaikki">Kaikki</option>
                      {members.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                    </select>
                  </div>
                </div>
                {canEdit && !item.confirmed && (
                  <div style={{ display: 'flex', gap: '.3rem', flexShrink: 0, alignItems: 'center' }}>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => createTaskFromAction(detail.id, idx)}
                      style={{ fontSize: '.65rem', padding: '.3rem .6rem', whiteSpace: 'nowrap' }}
                    >
                      Luo tehtava
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => removeActionItem(detail.id, idx)}
                      style={{ fontSize: '.72rem', color: 'var(--red)', padding: '.2rem .4rem' }}
                    >
                      x
                    </button>
                  </div>
                )}
                {item.confirmed && (
                  <span style={{ fontSize: '.65rem', color: 'var(--green)', fontWeight: 700 }}>Luotu</span>
                )}
              </div>
            ))}

            {/* Manuaalinen toimenpiteen lisäys */}
            {showAddAction && canEdit && (
              <div style={{ padding: '.75rem 1.25rem', borderTop: '1px solid var(--border)', background: 'var(--card)' }}>
                <div style={{ display: 'flex', gap: '.5rem', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <input
                      className="input"
                      value={newActionText}
                      onChange={e => setNewActionText(e.target.value)}
                      placeholder="Toimenpiteen kuvaus..."
                      autoFocus
                      style={{ fontSize: '.82rem', marginBottom: '.4rem' }}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && newActionText.trim()) {
                          addActionItem(detail.id, newActionText, newActionAssignee);
                          setNewActionText('');
                          setNewActionAssignee('');
                        }
                      }}
                    />
                    <select
                      className="input"
                      value={newActionAssignee}
                      onChange={e => setNewActionAssignee(e.target.value)}
                      style={{ fontSize: '.72rem', padding: '.25rem .4rem', width: 'auto', minWidth: 140 }}
                    >
                      <option value="">Tekijä (valinnainen)</option>
                      <option value="Kaikki">Kaikki</option>
                      {members.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                    </select>
                  </div>
                  <div style={{ display: 'flex', gap: '.3rem', flexShrink: 0, paddingTop: '.2rem' }}>
                    <button
                      className="btn btn-primary btn-sm"
                      disabled={!newActionText.trim()}
                      onClick={() => {
                        addActionItem(detail.id, newActionText, newActionAssignee);
                        setNewActionText('');
                        setNewActionAssignee('');
                      }}
                      style={{ fontSize: '.65rem' }}
                    >
                      Lisää
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => { setShowAddAction(false); setNewActionText(''); setNewActionAssignee(''); }}
                      style={{ fontSize: '.65rem' }}
                    >
                      Valmis
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Clean transcription — collapsible when summary exists */}
        {detail.cleanTranscription && (
          detail.summary ? (
            <TranscriptionCollapsible text={detail.cleanTranscription} label="Kiteytetty litterointi" onReadAloud={readAloud} isSpeaking={isSpeaking} />
          ) : (
            <div style={{
              background: 'linear-gradient(135deg, rgba(5,107,159,.04), rgba(24,94,91,.04))',
              border: '1px solid rgba(5,107,159,.2)', borderRadius: 'var(--rl)',
              padding: '1.25rem', marginBottom: '1.25rem',
            }}>
              <div style={{ fontSize: '.68rem', fontWeight: 700, color: 'var(--pri)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '.5rem' }}>
                Kiteytetty litterointi
              </div>
              <div style={{ fontSize: '.85rem', lineHeight: 1.7, color: 'var(--t1)', whiteSpace: 'pre-wrap' }}>
                {detail.cleanTranscription}
              </div>
            </div>
          )
        )}

        {/* Content - collapsible when summary exists */}
        {detail.summary ? (
          <TranscriptionCollapsible text={detail.content} label="Alkuperainen muistiinpano" onReadAloud={readAloud} isSpeaking={isSpeaking} />
        ) : (
          <div style={{
            background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)',
            padding: '1.5rem', marginBottom: '1.25rem', whiteSpace: 'pre-wrap',
            fontSize: '.88rem', lineHeight: 1.7, color: 'var(--t1)',
          }}>
            {detail.content}
          </div>
        )}

        {/* Raw transcription (collapsible) */}
        {detail.rawTranscription && detail.rawTranscription !== detail.content && (
          <TranscriptionCollapsible text={detail.rawTranscription} label="Raaka litterointi" onReadAloud={readAloud} isSpeaking={isSpeaking} />
        )}

        <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
          {!detail.summary && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => readAloud(detail.content)}
              style={{ color: isSpeaking ? 'var(--red)' : 'var(--pri)' }}
            >
              {isSpeaking ? 'Pysayta lukeminen' : 'Lue aaneen'}
            </button>
          )}
          {canEdit && (
            <>
              <button className="btn btn-secondary btn-sm" onClick={() => openEdit(detail)}>Muokkaa</button>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => requestSummary(detail.id)}
                disabled={summarizing}
                style={{ color: '#9b7cf6' }}
              >
                {summarizing ? 'Luodaan...' : detail.summary ? 'Paivita yhteenveto' : 'Luo AI-yhteenveto'}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => remove(detail.id)} style={{ color: 'var(--red)', marginLeft: 'auto' }}>Poista</button>
            </>
          )}
        </div>
      </AppShell>
    );
  }

  // List view
  return (
    <AppShell title="Muistiinpanot" subtitle={`${notes.length} muistiinpanoa`}>
      {canEdit && (
        <div style={{ display: 'flex', gap: '.5rem', justifyContent: 'flex-end', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
          <button className="btn btn-primary btn-sm" onClick={openNew}>+ Uusi muistiinpano</button>
          {!isRecording && !transcribing && (
            <>
              <button className="btn btn-secondary btn-sm" onClick={startRecording} style={{ display: 'flex', alignItems: 'center', gap: '.35rem' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--red)', display: 'inline-block' }} />
                Äänitä
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => fileInputRef.current?.click()}>
                Lataa äänite
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*,.mp3,.wav,.m4a,.webm,.mp4,.ogg"
                style={{ display: 'none' }}
                onChange={handleFileUpload}
              />
            </>
          )}
        </div>
      )}

      {/* Recording indicator */}
      {isRecording && (
        <div style={{
          background: 'rgba(239,107,107,.08)', border: '1px solid rgba(239,107,107,.3)',
          borderRadius: 'var(--r)', padding: '1rem 1.2rem', marginBottom: '1rem',
          display: 'flex', alignItems: 'center', gap: '.75rem',
        }}>
          <span style={{
            width: 12, height: 12, borderRadius: '50%', background: 'var(--red)',
            animation: 'pulse 1.5s ease-in-out infinite',
          }} />
          <span style={{ fontSize: '.88rem', fontWeight: 600 }}>
            Äänitetään... {Math.floor(recordingTime / 60).toString().padStart(2, '0')}:{(recordingTime % 60).toString().padStart(2, '0')}
          </span>
          <button
            className="btn btn-primary btn-sm"
            onClick={handleStopAndTranscribe}
            style={{ marginLeft: 'auto' }}
          >
            Lopeta ja litteroi
          </button>
        </div>
      )}

      {/* Transcribing indicator */}
      {transcribing && (
        <div style={{
          background: 'rgba(5,107,159,.06)', border: '1px solid rgba(5,107,159,.2)',
          borderRadius: 'var(--r)', padding: '1rem 1.2rem', marginBottom: '1rem',
          display: 'flex', alignItems: 'center', gap: '.75rem',
        }}>
          <span style={{ fontSize: '.88rem', fontWeight: 600, color: 'var(--pri)' }}>
            Litteroidaan ja kiteytetaan...
          </span>
        </div>
      )}

      {/* Recovery banner */}
      {hasRecovery && !isRecording && !transcribing && (
        <div style={{
          background: 'rgba(241,180,52,.06)', border: '1px solid rgba(241,180,52,.25)',
          borderRadius: 'var(--r)', padding: '1rem 1.2rem', marginBottom: '1rem',
          display: 'flex', alignItems: 'center', gap: '.75rem',
        }}>
          <span style={{ fontSize: '.85rem', fontWeight: 600, color: 'var(--t1)' }}>
            Keskeytetty aanite loydetty. Haluatko palauttaa ja litteroida sen?
          </span>
          <button
            className="btn btn-primary btn-sm"
            onClick={async () => {
              const blob = await recoverFromIDB();
              if (blob) {
                setHasRecovery(false);
                await transcribeAudio(blob);
              } else {
                toast('Aanitetta ei voitu palauttaa', 'error');
                clearIDB();
              }
            }}
            style={{ marginLeft: 'auto', whiteSpace: 'nowrap' }}
          >
            Palauta ja litteroi
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => clearIDB()}
            style={{ color: 'var(--t3)', whiteSpace: 'nowrap' }}
          >
            Hylkaa
          </button>
        </div>
      )}

      {sorted.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--t3)' }}>
          <p style={{ fontSize: '.92rem', marginBottom: '.5rem' }}>Ei muistiinpanoja vielä.</p>
          <p style={{ fontSize: '.75rem' }}>Lisää ensimmäinen palaverimuistiinpano ylhäältä.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
          {sorted.map(note => (
            <div
              key={note.id}
              onClick={() => setSelectedNote(note.id)}
              style={{
                background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--r)',
                padding: '1rem 1.2rem', cursor: 'pointer',
                borderLeft: note.summary ? '3px solid #9b7cf6' : '3px solid var(--pri)',
                transition: 'border-color .15s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--pri)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.25rem' }}>
                <span style={{ fontSize: '.75rem', fontWeight: 700, color: 'var(--pri-l)' }}>{formatDate(note.date)}</span>
                {note.rawTranscription && (
                  <span style={{ fontSize: '.58rem', padding: '.1rem .35rem', borderRadius: 9999, background: 'rgba(5,107,159,.1)', color: 'var(--pri)', fontWeight: 700 }}>Litteroitu</span>
                )}
                {note.summary && (
                  <span style={{ fontSize: '.58rem', padding: '.1rem .35rem', borderRadius: 9999, background: 'rgba(155,124,246,.1)', color: '#9b7cf6', fontWeight: 700 }}>AI-yhteenveto</span>
                )}
              </div>
              <div style={{ fontSize: '.92rem', fontWeight: 700, marginBottom: '.2rem' }}>{note.title}</div>
              <div style={{ fontSize: '.72rem', color: 'var(--t3)', display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                {note.attendees.length > 0 && (
                  <span>Paikalla: {note.attendees.slice(0, 3).join(', ')}{note.attendees.length > 3 ? ` +${note.attendees.length - 3}` : ''}</span>
                )}
                <span>{note.content.split('\n').length} rivia</span>
                {canEdit && !note.summary && (
                  <button
                    className="btn btn-ghost"
                    onClick={(e) => { e.stopPropagation(); requestSummary(note.id); }}
                    disabled={summarizing}
                    style={{ color: '#9b7cf6', fontSize: '.65rem', padding: '.15rem .4rem', marginLeft: 'auto' }}
                  >
                    {summarizingId === note.id ? 'Luodaan...' : 'Luo AI-yhteenveto'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Form modal */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowForm(false)}>
          <div style={{ background: 'var(--card)', border: isMobile ? 'none' : '1px solid var(--border)', borderRadius: isMobile ? 0 : 'var(--rl)', padding: isMobile ? '1.25rem' : '2rem', width: isMobile ? '100%' : 560, maxWidth: isMobile ? '100%' : '90vw', maxHeight: isMobile ? '100%' : '90vh', height: isMobile ? '100%' : 'auto', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', marginBottom: '1.25rem' }}>{editId ? 'Muokkaa muistiinpanoa' : 'Uusi muistiinpano'}</h3>

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr', gap: '.75rem' }}>
              <div className="field"><label>Otsikko *</label><input className="input" value={nTitle} onChange={e => setNTitle(e.target.value)} autoFocus placeholder="Esim. Juhlatoimikunnan palaveri" /></div>
              <div className="field"><label>Päivämäärä</label><input className="input" type="date" value={nDate} onChange={e => setNDate(e.target.value)} /></div>
            </div>

            <div className="field">
              <label>Paikalla</label>
              <div style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap' }}>
                {members.map(m => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => toggleAttendee(m.name)}
                    style={{
                      fontSize: '.72rem', padding: '.35rem .65rem', borderRadius: 9999,
                      background: nAttendees.includes(m.name) ? 'rgba(5,107,159,.15)' : 'var(--elev)',
                      color: nAttendees.includes(m.name) ? 'var(--pri-l)' : 'var(--t2)',
                      border: `1px solid ${nAttendees.includes(m.name) ? 'var(--pri)' : 'var(--border)'}`,
                      fontWeight: 600, cursor: 'pointer',
                    }}
                  >{m.name}</button>
                ))}
              </div>
            </div>

            <div className="field">
              <label>Muistiinpano *{nRawTranscription ? ' (raaka litterointi)' : ''}</label>
              <textarea
                className="input textarea"
                value={nContent}
                onChange={e => setNContent(e.target.value)}
                placeholder="Kirjoita palaverin muistiinpanot tähän..."
                rows={10}
                style={{ minHeight: 200, fontFamily: 'inherit', lineHeight: 1.6 }}
              />
            </div>

            {nCleanTranscription && (
              <div className="field">
                <label>Kiteytetty litterointi (AI)</label>
                <textarea
                  className="input textarea"
                  value={nCleanTranscription}
                  onChange={e => setNCleanTranscription(e.target.value)}
                  rows={6}
                  style={{ minHeight: 120, fontFamily: 'inherit', lineHeight: 1.6 }}
                />
              </div>
            )}

            <div style={{ display: 'flex', gap: '.5rem', justifyContent: 'flex-end' }}>
              {editId && <button className="btn btn-ghost btn-sm" onClick={() => { remove(editId); setShowForm(false); }} style={{ color: 'var(--red)', marginRight: 'auto' }}>Poista</button>}
              <button className="btn btn-ghost" onClick={() => setShowForm(false)}>Peruuta</button>
              <button className="btn btn-primary" onClick={save} disabled={!nTitle.trim() || !nContent.trim()}>Tallenna</button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const days = ['su', 'ma', 'ti', 'ke', 'to', 'pe', 'la'];
    return `${days[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;
  } catch {
    return dateStr;
  }
}

/** Encode a segment of an AudioBuffer as a valid WAV file (mono 16-bit) */
function encodeAudioBufferToWav(buffer: AudioBuffer, startSample: number, endSample: number): Blob {
  const sampleRate = buffer.sampleRate;
  const length = endSample - startSample;
  const rawData = buffer.getChannelData(0).slice(startSample, endSample);
  const dataSize = length * 2;
  const ab = new ArrayBuffer(44 + dataSize);
  const v = new DataView(ab);
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + dataSize, true); w(8, 'WAVE');
  w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
  v.setUint16(22, 1, true); v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, dataSize, true);
  let off = 44;
  for (let i = 0; i < length; i++) {
    const s = Math.max(-1, Math.min(1, rawData[i]));
    v.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    off += 2;
  }
  return new Blob([ab], { type: 'audio/wav' });
}

function TranscriptionCollapsible({ text, label = 'Raaka litterointi', onReadAloud, isSpeaking }: { text: string; label?: string; onReadAloud?: (text: string) => void; isSpeaking?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{
      border: '1px solid var(--border)', borderRadius: 'var(--rl)',
      marginBottom: '1.25rem', overflow: 'hidden',
    }}>
      <div style={{
        background: 'var(--elev)', padding: '.75rem 1.25rem',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <button
          onClick={() => setOpen(!open)}
          style={{
            background: 'none', border: 'none', padding: 0,
            cursor: 'pointer', fontSize: '.72rem', fontWeight: 700, color: 'var(--t2)',
            textTransform: 'uppercase', letterSpacing: '.05em',
            display: 'flex', alignItems: 'center', gap: '.5rem',
          }}
        >
          <span>{label}</span>
          <span style={{ fontSize: '.8rem' }}>{open ? '[-]' : '[+]'}</span>
        </button>
        {onReadAloud && (
          <button
            onClick={() => onReadAloud(text)}
            style={{
              background: 'none', border: 'none', padding: '.2rem .5rem',
              cursor: 'pointer', fontSize: '.65rem', fontWeight: 600,
              color: isSpeaking ? 'var(--red)' : 'var(--pri)',
            }}
          >
            {isSpeaking ? 'Pysayta' : 'Lue aaneen'}
          </button>
        )}
      </div>
      {open && (
        <div style={{
          padding: '1.25rem', fontSize: '.82rem', lineHeight: 1.7,
          color: 'var(--t2)', whiteSpace: 'pre-wrap', background: 'var(--card)',
        }}>
          {text}
        </div>
      )}
    </div>
  );
}
