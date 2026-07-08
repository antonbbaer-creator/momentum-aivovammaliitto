'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import AppShell from '@/components/AppShell';
import { useOrgData, writeOrgDataNow } from '@/lib/firestore';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { useParams } from 'next/navigation';
import { getOrgTeamMembers } from '@/lib/org-defaults';
import { OrgTeamMember, uniqueMembersByName, resolveUserMember } from '@/lib/team-shared';
import { buildAssignment, setAssigneesAction } from '@/lib/assignments-shared';
import { useIsMobile } from '@/lib/use-mobile';
import { softDelete, filterActive } from '@/lib/trash';
import { workerFetch } from '@/lib/worker-fetch';
import DrivePicker, { PickedItem } from '@/components/DrivePicker';
import { useDriveStatus, getFileContent, exportToDoc } from '@/lib/drive';
import LinkifiedText from '@/components/LinkifiedText';

interface ActionItem {
  text: string;
  assignee: string;            // legacy: ensimmäinen assignee tai 'Kaikki'
  assignees?: string[];        // useampi tekijä (uusi); jos puuttuu, käytetään assignee-kenttää
  confirmed?: boolean;         // true kun käyttäjä on lisännyt projektiin/luonut projektin (eli "siirretty pois palaverista")
  linkedTaskId?: string;       // automaattisesti luotu standalone-tehtävä data/tasks-listassa
  note?: string;               // vapaamuotoinen lisätieto (kontekstia, taustaa)
  links?: string[];            // URL-linkit relevanttiin tietoon
}

// Lue actionItemin tekijät joko uudesta tai vanhasta kentästä.
const getActionAssignees = (item: ActionItem): string[] => {
  if (Array.isArray(item.assignees) && item.assignees.length > 0) return item.assignees;
  if (item.assignee) return [item.assignee];
  return [];
};

// Pilkkoo tekstin ~maxChars-mittaisiin paloihin rivirajoja kunnioittaen.
// overlap (oletus 0) tuottaa palaisiin pienen paalleemenon jotta rajan
// yli menevat keskustelut nakyvat kahdesti — auttaa AI:ta yhdistamaan kontekstin.
const chunkText = (text: string, maxChars: number, overlap = 0): string[] => {
  if (text.length <= maxChars) return [text];
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    let end = Math.min(i + maxChars, text.length);
    if (end < text.length) {
      const nl = text.lastIndexOf('\n', end);
      if (nl > i + Math.floor(maxChars / 2)) end = nl;
    }
    chunks.push(text.slice(i, end).trim());
    if (end >= text.length) break;
    // siirry eteenpain, mutta jata overlap-merkkien verran paallekkaisyyteen
    i = Math.max(end - overlap, i + 1);
  }
  return chunks.filter(c => c.length > 0);
};

// Parsii "Vastuuhenkilo: tehtava" -muotoiset rivit ActionItem-objekteiksi.
const parseActionLines = (raw: string): ActionItem[] => {
  const out: ActionItem[] = [];
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  for (const line of lines) {
    const cleaned = line.replace(/^[-*•]\s*/, '').replace(/^\d+[.)]\s*/, '');
    const colonIdx = cleaned.indexOf(':');
    if (colonIdx <= 0) continue;
    const assignee = cleaned.slice(0, colonIdx).trim();
    const text = cleaned.slice(colonIdx + 1).trim();
    if (!text || assignee.length > 80) continue;
    out.push({ text, assignee, confirmed: false });
  }
  return out;
};

// Deduplikoi tehtavat normalisoidun tekstin perusteella; sailyttaa ekan esiintyman.
const dedupeActions = (items: ActionItem[]): ActionItem[] => {
  const seen = new Set<string>();
  const out: ActionItem[] = [];
  for (const it of items) {
    const key = it.text.toLowerCase().replace(/[^a-z0-9äöå ]/gi, '').replace(/\s+/g, ' ').trim().slice(0, 120);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
};

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
  const { canEdit, activeOrg, user } = useAuth();
  const { toast } = useToast();
  const params = useParams();
  const orgSlug = (params.orgSlug as string) || '';
  const [notes, setNotes] = useOrgData<MeetingNote[]>('meetingNotes', []);
  const [membersRaw] = useOrgData<OrgTeamMember[]>('orgTeamMembers', getOrgTeamMembers(orgSlug));
  const members = useMemo(() => uniqueMembersByName(membersRaw), [membersRaw]);
  const myMember = useMemo(() => resolveUserMember(members, user), [members, user]);
  const myName = myMember?.name || user?.displayName || '';
  const [tasks, setTasks] = useOrgData<{ id: string; text: string; assignee?: string; hankkia: boolean; done: boolean; priority: 'normal' | 'high'; deadline?: string; note?: string; category?: string }[]>('tasks', []);
  const [projects, setProjects] = useOrgData<any[]>('projects', []);
  const [projectMenuFor, setProjectMenuFor] = useState<string | null>(null); // "noteId:idx"
  const isMobile = useIsMobile();
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [selectedNote, setSelectedNote] = useState<string | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  const [summarizingId, setSummarizingId] = useState<string | null>(null);
  const [extractingTasks, setExtractingTasks] = useState(false);
  const [extractingTasksId, setExtractingTasksId] = useState<string | null>(null);
  const [expandedAction, setExpandedAction] = useState<string | null>(null); // key: noteId:idx
  const [editingSummary, setEditingSummary] = useState(false);
  const [editSummaryText, setEditSummaryText] = useState('');
  const [contextText, setContextText] = useState('');
  const [showContextInput, setShowContextInput] = useState(false);
  const [refiningContext, setRefiningContext] = useState(false);
  const [preContextText, setPreContextText] = useState('');
  const [showPreContextInput, setShowPreContextInput] = useState(false);
  const [showAddAction, setShowAddAction] = useState(false);
  const [newActionText, setNewActionText] = useState('');
  const [newActionAssignees, setNewActionAssignees] = useState<string[]>([]);

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
  const [saving, setSaving] = useState(false);

  // ── Luonnosvarmistus (localStorage) ──
  // Lomakkeen sisältö talletetaan paikallisesti aina kun se muuttuu, ja
  // poistetaan vasta kun muistio on varmasti tallentunut Firestoreen asti.
  // Näin litterointi selviää sivun sulkemisesta, reloadista ja navigoinnista.
  interface NoteDraft {
    editId: string | null;
    nTitle: string;
    nDate: string;
    nAttendees: string[];
    nContent: string;
    nRawTranscription: string;
    nCleanTranscription: string;
    ts: number;
  }
  const draftKey = `hetki_note_draft_${activeOrg || ''}`;
  const [draftFound, setDraftFound] = useState<NoteDraft | null>(null);
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearDraft = useCallback(() => {
    try { localStorage.removeItem(draftKey); } catch { /* ignore */ }
    setDraftFound(null);
  }, [draftKey]);

  // Etsi tallentamaton luonnos sivulle tultaessa
  useEffect(() => {
    try {
      const raw = localStorage.getItem(draftKey);
      if (!raw) return;
      const d = JSON.parse(raw) as NoteDraft;
      if (d && (d.nContent || d.nRawTranscription || d.nTitle)) setDraftFound(d);
    } catch { /* rikkinäinen luonnos — ohitetaan */ }
  }, [draftKey]);

  // Talleta luonnos (kevyellä viiveellä) kun lomake on auki ja sisältö muuttuu
  useEffect(() => {
    if (!showForm) return;
    if (!nTitle && !nContent && !nRawTranscription) return;
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => {
      const draft: NoteDraft = { editId, nTitle, nDate, nAttendees, nContent, nRawTranscription, nCleanTranscription, ts: Date.now() };
      try { localStorage.setItem(draftKey, JSON.stringify(draft)); } catch { /* quota täynnä tms. */ }
    }, 400);
    return () => { if (draftTimerRef.current) clearTimeout(draftTimerRef.current); };
  }, [showForm, editId, nTitle, nDate, nAttendees, nContent, nRawTranscription, nCleanTranscription, draftKey]);

  const restoreDraft = useCallback((d: NoteDraft) => {
    setEditId(d.editId);
    setNTitle(d.nTitle);
    setNDate(d.nDate || new Date().toISOString().split('T')[0]);
    setNAttendees(Array.isArray(d.nAttendees) ? d.nAttendees : []);
    setNContent(d.nContent);
    setNRawTranscription(d.nRawTranscription || '');
    setNCleanTranscription(d.nCleanTranscription || '');
    setShowForm(true);
    setDraftFound(null);
  }, []);

  // Detail-naytton nimen pikamuokkaus
  const [editingTitle, setEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');

  const driveStatus = useDriveStatus();
  const [drivePickerOpen, setDrivePickerOpen] = useState(false);
  const [driveBusy, setDriveBusy] = useState(false);

  const importFromDrive = async (items: PickedItem[]) => {
    if (items.length === 0) return;
    setDriveBusy(true);
    try {
      const newNotes: MeetingNote[] = [];
      for (const it of items) {
        if (it.isFolder) continue;
        try {
          const content = await getFileContent(it.id, it.mimeType);
          newNotes.push({
            id: 'mn_' + Date.now() + '_' + it.id.slice(0, 6),
            title: it.name.replace(/\.(docx?|md|txt)$/i, ''),
            date: new Date().toISOString().split('T')[0],
            attendees: [],
            content,
            createdAt: Date.now(),
          });
        } catch (err: any) {
          toast(`"${it.name}" ei latautunut: ${err?.message || err}`, 'error');
        }
      }
      if (newNotes.length > 0) {
        setNotes(prev => [...newNotes, ...prev]);
        toast(`${newNotes.length} muistiinpano${newNotes.length === 1 ? '' : 'a'} tuotu Drivesta`, 'success');
      }
    } finally {
      setDriveBusy(false);
    }
  };

  const exportNoteToDrive = async (note: MeetingNote) => {
    setDriveBusy(true);
    try {
      const md = [
        `# ${note.title}`,
        `*${note.date}*`,
        note.attendees.length > 0 ? `**Osallistujat:** ${note.attendees.join(', ')}` : '',
        '',
        note.content,
        note.summary ? `\n\n## Yhteenveto\n\n${note.summary}` : '',
      ].filter(Boolean).join('\n');
      const file = await exportToDoc(note.title || 'Muistiinpano', md);
      toast('Vienti onnistui — avaa Drivessä', 'success');
      if (file.webViewLink) window.open(file.webViewLink, '_blank', 'noopener');
    } catch (e: any) {
      toast(`Vienti epäonnistui: ${e?.message || e}`, 'error');
    } finally {
      setDriveBusy(false);
    }
  };

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

  // Pikamuokkaus: vaihda muistioon nimi (detail-naytto)
  const renameNote = (noteId: string, nextTitle: string): boolean => {
    const trimmed = nextTitle.trim();
    if (!trimmed) {
      toast('Nimi ei voi olla tyhjä', 'error');
      return false;
    }
    setNotes(prev => prev.map(n => n.id === noteId ? { ...n, title: trimmed } : n));
    toast('Nimi päivitetty', 'success');
    return true;
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

  const save = async () => {
    if (!nTitle.trim() || !nContent.trim() || saving) return;
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
    // Älä tallenna raakalitterointia kahteen kertaan: jos se on identtinen
    // sisällön kanssa, content riittää. Ilman tätä muistiodokumentti paisuu
    // kaksinkertaiseksi ja törmää Firestoren 1 Mt:n dokumenttirajaan.
    const slim = (x: MeetingNote): MeetingNote =>
      x.rawTranscription && x.rawTranscription === x.content ? { ...x, rawTranscription: undefined } : x;
    const next = (editId ? notes.map(x => x.id === editId ? note : x) : [note, ...notes]).map(slim);

    // Kokovahti: Firestore-dokumentin kova raja on 1 048 576 tavua.
    const bytes = new TextEncoder().encode(JSON.stringify(next)).length;
    if (bytes > 1_000_000) {
      toast('Muistiot eivät mahdu tallennusrajaan (1 Mt). Poista vanhoja muistioita pysyvästi roskakorin kautta ja yritä uudelleen — teksti säilyy luonnoksena.', 'error');
      return;
    }
    if (bytes > 850_000) {
      toast('Muistioarkisto lähestyy tallennusrajaa — vanhoja muistioita kannattaa siivota', 'error');
    }
    setSaving(true);
    try {
      // Kirjoita Firestoreen heti ja odota vahvistus — vasta sen jälkeen
      // siivotaan luonnos ja äänitteen varmuuskopio pois.
      if (activeOrg && user) {
        await writeOrgDataNow(activeOrg, 'meetingNotes', next, user.uid);
      }
      setNotes(next);
      setShowForm(false);
      clearDraft();
      clearIDB();
      toast(editId ? 'Muistiinpano päivitetty' : 'Muistiinpano tallennettu', 'success');
    } catch {
      // Teksti säilyy lomakkeella, luonnoksessa ja äänite varmuuskopiossa
      toast('Tallennus epäonnistui — teksti on tallessa luonnoksena, yritä uudelleen', 'error');
    } finally {
      setSaving(false);
    }
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

  // Apufunktio AI-kutsuille
  const callChat = useCallback((prompt: string, systemContext: string, maxTokens = 4096) => workerFetch('/api/chat', {
    method: 'POST',
    orgId: activeOrg || '',
    body: JSON.stringify({
      messages: [{ role: 'user', content: prompt }],
      systemContext,
      max_tokens: maxTokens,
    }),
  }), [activeOrg]);

  const readResponseText = async (res: Response): Promise<string> => {
    if (!res.ok) return '';
    const data = await res.json();
    return ((data.response || '') as string).trim();
  };

  // VAIN yhteenveto. Tehtavat poimitaan erillisella napilla (requestActionItems)
  // jotta pitkat palaverit eivat tormaisi output-tokenrajaan.
  const requestSummary = async (noteId: string, extraContext?: string) => {
    const note = notes.find(n => n.id === noteId);
    if (!note) return;
    setSummarizing(true);
    setSummarizingId(noteId);
    try {
      const contextBlock = extraContext && extraContext.trim()
        ? `\nLisäkonteksti (mistä on kyse, kuka vastaa, mitä ei pidä päätellä väärin):\n${extraContext.trim()}\n`
        : '';
      const meetingHeader = `Otsikko: ${note.title}
Paivamaara: ${note.date}
Osallistujat: ${note.attendees.join(', ') || 'Ei merkitty'}
${contextBlock}`;

      const CHUNK_THRESHOLD = 6000;     // Aloita chunkkaus aikaisemmin (~25 min palaverin transkriptio)
      const CHUNK_SIZE = 5000;          // Pienempi palanen → tarkempi per-osa yhteenveto
      const CHUNK_OVERLAP = 400;        // 8% paalleemenoa rajojen yli, ettei konteksti hyppaa
      const GROUP_REDUCE_SIZE = 4;      // Hierarkinen reduce: yhdista 4 osayhteenvetoa ryhmaan
      const content = note.content || '';

      const partialSummaryPrompt = (chunk: string, idx: number, total: number) =>
        `Tee SEIKKAPERAINEN yhteenveto tasta palaverin OSASTA ${idx + 1}/${total}. Sisaltaa:
- Mista puhuttiin (kaikki esiin tulleet aiheet, ei vain paaaiheita)
- Kaikki paatokset, ehdotukset ja erimielisyydet — myos pienemmat
- Numerot, paivamaarat, nimet ja konkreettiset detaljit jotka mainittiin
- Avoimet kysymykset jotka jaivat keskustelussa kesken

Vastaa SELKOTEKSTINA suomeksi, ei markdownia, ei listamerkkeja.

${meetingHeader}
Muistiinpanon osa ${idx + 1}/${total}:
${chunk}`;

      const reducePrompt = (parts: string[], finalShort = false) =>
        finalShort
          ? `Alla on saman palaverin valiyhteenvedot. Tee niista lopullinen koherentti yhteenveto kappaleina (ei listamerkkeja, ei markdownia). Sailyta KAIKKI olennaiset paatokset, ehdotukset, numerot, nimet ja avoimet kysymykset. Poista vain toistoa, ala lyhenna sisaltoa muuten. Sailyta kronologinen kulku jos se on selvaa. Vastaa suomeksi.

${meetingHeader}
Valiyhteenvedot:
${parts.map((s, i) => `--- Valiosio ${i + 1} ---\n${s}`).join('\n\n')}`
          : `Yhdista alla olevat samaan palaveriin liittyvat osayhteenvedot YHDEKSI rikkaaksi tekstiksi. Sailyta kaikki yksityiskohdat, paatokset, numerot ja nimet — ala tiivista. Poista vain selvaa toistoa. Vastaa SELKOTEKSTINA suomeksi (ei markdownia).

${meetingHeader}
Osayhteenvedot:
${parts.map((s, i) => `--- Osa ${i + 1} ---\n${s}`).join('\n\n')}`;

      let summary = '';
      let chunkCount = 1;

      if (content.length <= CHUNK_THRESHOLD) {
        const prompt = `Tee SEIKKAPERAINEN ja KATTAVA yhteenveto seuraavasta palaverimuistiinpanosta. Sailyta:
- Kaikki esiin tulleet aiheet (ei vain paaaiheita)
- Kaikki paatokset, ehdotukset ja erimielisyydet
- Konkreettiset detaljit: numerot, paivamaarat, nimet
- Avoimet kysymykset

Vastaa SELKOTEKSTINA ilman markdown-muotoilua (ei #-otsikoita, ei **-boldausta, ei listamerkkejä). Kayta tavallisia kappaleita. Vastaa suomeksi.

${meetingHeader}
Muistiinpano:
${content}`;
        summary = await readResponseText(await callChat(
          prompt,
          'Olet palaverimuistiinpanojen yhteenvetaja. Vastaa selkotekstina ilman markdown-muotoilua, sailyta kaikki olennaiset yksityiskohdat.',
          4096,
        ));
      } else {
        // Pitka: map-reduce — pienemmat palaset + isompi tokenbudjetti per palanen
        const chunks = chunkText(content, CHUNK_SIZE, CHUNK_OVERLAP);
        chunkCount = chunks.length;

        const partialSummaries = await Promise.all(chunks.map((chunk, idx) =>
          callChat(
            partialSummaryPrompt(chunk, idx, chunks.length),
            'Olet palaverimuistiinpanojen yhteenvetaja. Vastaa selkotekstina, sailyta kaikki yksityiskohdat tasta osasta.',
            2500,
          ).then(readResponseText),
        ));

        let validPartials = partialSummaries.filter(s => s.length > 0);

        // Hierarkinen reduce: jos osayhteenvetoja on yli GROUP_REDUCE_SIZE,
        // tehdaan ensin ryhmareduce 4:n erissa ja vasta sitten lopullinen yhdistely.
        // Tama estaa ylipakkautumisen kun on 6+ palasta.
        if (validPartials.length > GROUP_REDUCE_SIZE) {
          const groups: string[][] = [];
          for (let i = 0; i < validPartials.length; i += GROUP_REDUCE_SIZE) {
            groups.push(validPartials.slice(i, i + GROUP_REDUCE_SIZE));
          }
          const groupSummaries = await Promise.all(groups.map(group =>
            callChat(
              reducePrompt(group, false),
              'Olet palaverimuistiinpanojen yhteenvetaja. Yhdista osat ilman tiivistysta — sailyta kaikki yksityiskohdat.',
              3000,
            ).then(readResponseText),
          ));
          validPartials = groupSummaries.filter(s => s.length > 0);
        }

        if (validPartials.length > 1) {
          summary = await readResponseText(await callChat(
            reducePrompt(validPartials, true),
            'Olet palaverimuistiinpanojen yhteenvetaja. Vastaa selkotekstina, sailyta kaikki olennaiset paatokset ja yksityiskohdat.',
            4096,
          ));
          if (!summary) summary = validPartials.join('\n\n');
        } else if (validPartials.length === 1) {
          summary = validPartials[0];
        }
      }

      if (summary) {
        setNotes(prev => prev.map(n => n.id === noteId ? { ...n, summary } : n));
        const detail = chunkCount > 1 ? ` (${chunkCount} osaa)` : '';
        toast(`Yhteenveto luotu${detail}`, 'success');
      } else {
        const lines = content.split('\n').filter(l => l.trim());
        const fallback = `Palaveri: ${note.title} (${note.date})\nOsallistujat: ${note.attendees.join(', ') || '-'}\n\nPaakohdat:\n${lines.slice(0, 5).map(l => '- ' + l.trim()).join('\n')}`;
        setNotes(prev => prev.map(n => n.id === noteId ? { ...n, summary: fallback } : n));
        toast('Yhteenveto luotu (perusmuoto)', 'success');
      }
    } catch {
      toast('Yhteenvedon luonti eponnistui', 'error');
    } finally {
      setSummarizing(false);
      setSummarizingId(null);
    }
  };

  // VAIN tehtavien poiminta omalla token-budjetilla. Korvaa olemassa olevat
  // ehdotetut (vahvistamattomat) toimenpiteet; vahvistetut sailyvat.
  const requestActionItems = async (noteId: string) => {
    const note = notes.find(n => n.id === noteId);
    if (!note) return;
    setExtractingTasks(true);
    setExtractingTasksId(noteId);
    try {
      const meetingHeader = `Otsikko: ${note.title}
Paivamaara: ${note.date}
Osallistujat: ${note.attendees.join(', ') || 'Ei merkitty'}
`;

      const CHUNK_THRESHOLD = 6000;
      const CHUNK_SIZE = 5000;
      const CHUNK_OVERLAP = 400;
      const content = note.content || '';
      let newItems: ActionItem[] = [];
      let chunkCount = 1;

      if (content.length <= CHUNK_THRESHOLD) {
        const prompt = `Poimi alla olevasta palaverimuistiinpanosta KAIKKI toimenpiteet, paatokset ja sovitut tehtavat. Ala jata mitaan pois — myos pienemmat tehtavat ja "muista tehda X" -tyyppiset kommentit. Listaa jokainen toimenpide omalla rivillaan muodossa:

Vastuuhenkilo: Toimenpiteen kuvaus

Jos vastuuhenkiloa ei tiedeta, kayta "Kaikki" tai "Ei maaritetty". Ala lisaa otsikoita, numerointia tai muuta tekstia – vain rivit muodossa "Vastuuhenkilo: tehtava". Vastaa suomeksi.

${meetingHeader}
Muistiinpano:
${content}`;
        const raw = await readResponseText(await callChat(
          prompt,
          'Olet palaverimuistiinpanojen tehtavapoimija. Listaa vain toimenpiteet muodossa "Vastuuhenkilo: tehtava". Ala jata mitaan pois.',
          4096,
        ));
        newItems = parseActionLines(raw);
      } else {
        const chunks = chunkText(content, CHUNK_SIZE, CHUNK_OVERLAP);
        chunkCount = chunks.length;
        const chunkActions = await Promise.all(chunks.map((chunk, idx) =>
          callChat(
            `Poimi tasta palaverin OSASTA ${idx + 1}/${chunks.length} KAIKKI toimenpiteet, paatokset ja sovitut tehtavat. Ala jata mitaan pois — myos pienemmat tehtavat. HUOMIO: tassa osassa voi olla paallekkaisyytta edellisen osan kanssa rajalla — ala huoli toistosta, lista mieluummin tehtava kahdesti kuin jata pois. Listaa jokainen omalla rivillaan muodossa:

Vastuuhenkilo: Toimenpiteen kuvaus

Jos vastuuhenkiloa ei tiedeta, kayta "Kaikki" tai "Ei maaritetty". Ala lisaa otsikoita, numerointia tai muuta tekstia. Vastaa suomeksi.

${meetingHeader}
Muistiinpanon osa ${idx + 1}/${chunks.length}:
${chunk}`,
            'Olet palaverimuistiinpanojen tehtavapoimija. Listaa vain toimenpiteet muodossa "Vastuuhenkilo: tehtava". Mieluummin tupla kuin puuttuva.',
            2500,
          ).then(readResponseText),
        ));
        newItems = dedupeActions(chunkActions.flatMap(parseActionLines));
      }

      if (newItems.length > 0) {
        // Sailyta vahvistetut + linkitetyt vanhat tehtavat; korvaa muut ehdotukset.
        setNotes(prev => prev.map(n => {
          if (n.id !== noteId) return n;
          const keep = (n.actionItems || []).filter(a => a.confirmed || a.linkedTaskId);
          // Suodata uudet jotka ovat samat kuin sailytetyt (deduplikointi yli vanhojen)
          const keepKeys = new Set(keep.map(k => k.text.toLowerCase().replace(/\s+/g, ' ').trim()));
          const fresh = newItems.filter(it => !keepKeys.has(it.text.toLowerCase().replace(/\s+/g, ' ').trim()));
          return { ...n, actionItems: [...keep, ...fresh] };
        }));
        const detail = chunkCount > 1 ? `, ${chunkCount} osaa` : '';
        toast(`Tehtavat poimittu (${newItems.length} kpl${detail})`, 'success');
      } else {
        toast('Tehtavia ei loytynyt', 'info');
      }
    } catch {
      toast('Tehtavien poiminta epaonnistui', 'error');
    } finally {
      setExtractingTasks(false);
      setExtractingTasksId(null);
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

  // ── Korjaa yhteenveto kontekstilla ──
  // Tarkeaa: regeneroi yhteenveto AINA alkuperaisesta transkriptiosta (note.content)
  // ja antaa kayttajan korjauksen lisakontekstina. EI tiivista nykyista
  // yhteenvetoa, jotta toistuva paivitys ei kadottaisi palaverin sisaltoa.
  const refineSummaryWithContext = async (noteId: string) => {
    const ctx = contextText.trim();
    if (!ctx) return;
    setRefiningContext(true);
    setContextText('');
    setShowContextInput(false);
    try {
      await requestSummary(noteId, ctx);
    } finally {
      setRefiningContext(false);
    }
  };

  // Aloita yhteenveto alusta — pyyhkii nykyisen ja regeneroi puhtaalta poydalta.
  const regenerateSummaryFromScratch = async (noteId: string) => {
    if (typeof window !== 'undefined') {
      const ok = window.confirm('Aloita yhteenveto alusta? Nykyinen yhteenveto korvataan kokonaan uudella, joka tehdaan alkuperaisesta palaveritekstista.');
      if (!ok) return;
    }
    await requestSummary(noteId);
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

  // Laajenna 'Kaikki' kaikiksi tiimijäsenten nimiksi tehtävän tekijöitä rakennettaessa.
  // Säilyy actionItem.assignees-listassa 'Kaikki'-merkkijonona luettavuuden vuoksi,
  // mutta linkitetyssä tehtävässä jokainen jäsen on eksplisiittisesti listattu.
  const expandAssignees = (names: string[]): string[] => {
    if (!names.includes('Kaikki')) return names;
    const memberNames = members.map(m => m.name);
    const others = names.filter(n => n !== 'Kaikki');
    return Array.from(new Set([...memberNames, ...others]));
  };

  const addActionItem = (noteId: string, text: string, assignees: string[]) => {
    if (!text.trim()) return;
    const note = notes.find(n => n.id === noteId);
    const item: ActionItem = {
      text: text.trim(),
      assignee: assignees[0] || '',
      assignees: assignees.length > 0 ? assignees : undefined,
      confirmed: false,
    };
    // Auto-luo standalone-tehtävä jos tekijöitä on annettu — näin se näkyy heti kotisivulla.
    if (assignees.length > 0) {
      const expanded = expandAssignees(assignees);
      const newId = 't_' + Date.now();
      const newTask = {
        id: newId,
        text: text.trim(),
        hankkia: false,
        done: false,
        priority: 'normal' as const,
        note: note ? `Palaverista: ${note.title} (${note.date})` : 'Palaverista',
        ...buildAssignment(expanded, myName),
      };
      setTasks(prev => [newTask, ...prev]);
      item.linkedTaskId = newId;
    }
    setNotes(prev => prev.map(n => {
      if (n.id !== noteId) return n;
      return { ...n, actionItems: [...(n.actionItems || []), item] };
    }));
    toast(assignees.length > 0 ? `Tehtävä luotu: ${assignees.join(', ')}` : 'Toimenpide lisätty', 'success');
  };

  // Synkronoi olemassa olevan actionItemin tekijät: luo tehtävä jos ei vielä ole,
  // tai päivitä olemassa olevan linkitetyn tehtävän tekijät.
  const setActionItemAssignees = (noteId: string, idx: number, newAssignees: string[]) => {
    const note = notes.find(n => n.id === noteId);
    const item = note?.actionItems?.[idx];
    if (!note || !item) return;
    const cleaned = newAssignees.filter(a => a && a.trim());

    // Päivitä actionItem
    updateActionItem(noteId, idx, {
      assignee: cleaned[0] || '',
      assignees: cleaned.length > 0 ? cleaned : undefined,
    });

    const expanded = expandAssignees(cleaned);

    // Jos linkitetty tehtävä on jo olemassa → päivitä sen tekijät
    if (item.linkedTaskId) {
      setTasks(prev => prev.map(t =>
        t.id === item.linkedTaskId
          ? { ...(setAssigneesAction(t as any, expanded, myName) as any) }
          : t
      ));
      return;
    }

    // Muuten luo uusi linkitetty tehtävä jos tekijöitä on
    if (cleaned.length === 0) return;
    const newId = 't_' + Date.now();
    const newTask = {
      id: newId,
      text: item.text,
      hankkia: false,
      done: false,
      priority: 'normal' as const,
      note: `Palaverista: ${note.title} (${note.date})`,
      ...buildAssignment(expanded, myName),
    };
    setTasks(prev => [newTask, ...prev]);
    updateActionItem(noteId, idx, { linkedTaskId: newId });
  };

  const removeActionItem = (noteId: string, idx: number) => {
    setNotes(prev => prev.map(n => {
      if (n.id !== noteId || !n.actionItems) return n;
      return { ...n, actionItems: n.actionItems.filter((_, i) => i !== idx) };
    }));
  };

  // Lisää toimenpide olemassa olevaan projektiin projektin tasks[]-listaan.
  // Jos actionItem oli auto-linkattuna standalone-tehtävään, poistetaan se sieltä
  // siirron yhteydessä ettei sama tehtävä esiinny kahdessa paikassa.
  const addActionToProject = (noteId: string, idx: number, projectId: number) => {
    const note = notes.find(n => n.id === noteId);
    const item = note?.actionItems?.[idx];
    if (!item) return;
    const itemAssignees = getActionAssignees(item);
    const newTask = {
      id: Date.now(),
      text: item.text,
      done: false,
      assignee: itemAssignees[0] || '',
      assignees: itemAssignees.length > 0 ? itemAssignees : undefined,
      deadline: '',
      ...buildAssignment(itemAssignees.length > 0 ? itemAssignees : undefined, myName),
    };
    setProjects(prev => prev.map(p => p.id === projectId
      ? { ...p, tasks: [...(p.tasks || []), newTask] }
      : p
    ));
    if (item.linkedTaskId) {
      setTasks(prev => prev.filter(t => t.id !== item.linkedTaskId));
    }
    updateActionItem(noteId, idx, { confirmed: true, linkedTaskId: undefined });
    const proj = projects.find(p => p.id === projectId);
    toast(`Lisätty projektiin: ${proj?.t || 'projekti'}`, 'success');
    setProjectMenuFor(null);
  };

  // Luo uusi projekti toimenpiteestä ja lisää se ensimmäiseksi tehtäväksi
  const createProjectFromAction = (noteId: string, idx: number) => {
    const note = notes.find(n => n.id === noteId);
    const item = note?.actionItems?.[idx];
    if (!item) return;
    const name = window.prompt('Uuden projektin nimi:', item.text.slice(0, 60));
    if (!name || !name.trim()) return;
    const exists = projects.some(p => (p.t || '').toLowerCase() === name.trim().toLowerCase());
    if (exists) { toast('Samanniminen projekti on jo olemassa', 'error'); return; }
    const projectId = Date.now();
    const newProject = {
      id: projectId,
      t: name.trim(),
      d: `Luotu muistiinpanosta: ${note.title} (${note.date})`,
      st: 'idea',
      deadline: '',
      team: [],
      comments: [],
      tasks: [(() => {
        const itemAssignees = getActionAssignees(item);
        return {
          id: Date.now() + 1,
          text: item.text,
          done: false,
          assignee: itemAssignees[0] || '',
          assignees: itemAssignees.length > 0 ? itemAssignees : undefined,
          deadline: '',
          ...buildAssignment(itemAssignees.length > 0 ? itemAssignees : undefined, myName),
        };
      })()],
      archived: false,
      createdAt: Date.now(),
    };
    setProjects(prev => [...prev, newProject]);
    if (item.linkedTaskId) {
      setTasks(prev => prev.filter(t => t.id !== item.linkedTaskId));
    }
    updateActionItem(noteId, idx, { confirmed: true, linkedTaskId: undefined });
    toast(`Projekti luotu: ${name.trim()}`, 'success');
    setProjectMenuFor(null);
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
      // Älä pyyhi edellisen äänityksen varmuuskopiota kysymättä
      if (hasRecovery && !window.confirm('Uuden äänityksen aloittaminen poistaa edellisen äänitteen varmuuskopion. Jatketaanko?')) {
        return;
      }
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
  }, [toast, clearIDB, saveChunkToIDB, hasRecovery]);

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

  // ── Beforeunload warning during recording, transcription and unsaved form ──
  const hasUnsavedForm = showForm && (nContent.trim().length > 0 || nRawTranscription.length > 0);
  useEffect(() => {
    if (!isRecording && !transcribing && !hasUnsavedForm) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isRecording, transcribing, hasUnsavedForm]);

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
    // HUOM: äänitteen varmuuskopiota EI tyhjennetä tässä — se poistetaan
    // vasta kun muistio on oikeasti tallennettu (save) tai käyttäjä hylkää sen.
    toast('Litterointi valmis — muista tallentaa muistio', 'success');
  }, [activeOrg, nTitle, toast]);

  // ── Transcription flow (supports large files via audio decoding + WAV chunking) ──
  const transcribeAudio = useCallback(async (audioBlob: Blob) => {
    setTranscribing(true);
    try {
      // Small files (< 24 MB): send directly
      if (audioBlob.size <= 24 * 1024 * 1024) {
        const ext = whisperExtForBlob(audioBlob);
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '.5rem', marginBottom: '1rem' }}>
          <button className="btn btn-ghost" onClick={() => setSelectedNote(null)}>{'<-'} Takaisin</button>
          {canEdit && !editingTitle && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => { setDraftTitle(detail.title); setEditingTitle(true); }}
              style={{ fontSize: '.72rem' }}
              title="Muokkaa muistion nimeä"
            >Muokkaa nimeä</button>
          )}
        </div>

        {/* Inline-muokkaus muistion nimelle */}
        {editingTitle && canEdit && (
          <div style={{
            background: 'rgba(155,124,246,.04)', border: '1px solid rgba(155,124,246,.25)',
            borderRadius: 'var(--rl)', padding: '.75rem 1rem', marginBottom: '1rem',
          }}>
            <div style={{ fontSize: '.65rem', fontWeight: 700, color: '#9b7cf6', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '.4rem' }}>
              Muokkaa nimeä
            </div>
            <input
              className="input"
              value={draftTitle}
              autoFocus
              onChange={e => setDraftTitle(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  if (renameNote(detail.id, draftTitle)) setEditingTitle(false);
                } else if (e.key === 'Escape') {
                  setEditingTitle(false);
                }
              }}
              style={{ fontSize: '.95rem', fontWeight: 600 }}
            />
            <div style={{ display: 'flex', gap: '.4rem', justifyContent: 'flex-end', marginTop: '.5rem' }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditingTitle(false)} style={{ fontSize: '.72rem' }}>Peruuta</button>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => { if (renameNote(detail.id, draftTitle)) setEditingTitle(false); }}
                disabled={!draftTitle.trim() || draftTitle.trim() === detail.title.trim()}
                style={{ fontSize: '.72rem' }}
              >Tallenna</button>
            </div>
          </div>
        )}

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

        {/* Anna kontekstia ennen yhteenvedon luontia */}
        {!detail.summary && canEdit && (
          <div style={{
            background: 'rgba(155,124,246,.04)', border: '1px solid rgba(155,124,246,.18)',
            borderRadius: 'var(--rl)', padding: '.75rem 1rem', marginBottom: '.75rem',
          }}>
            {!showPreContextInput ? (
              <div
                onClick={() => { setPreContextText(''); setShowPreContextInput(true); }}
                style={{ fontSize: '.78rem', color: '#9b7cf6', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '.4rem' }}
              >
                <span style={{ fontSize: '.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' }}>Anna kontekstia AI:lle (valinnainen)</span>
                <span style={{ color: 'var(--t3)', fontSize: '.75rem' }}>-- mistä on kyse, kuka osallistuu, mitä ei pidä tulkita väärin</span>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: '.65rem', fontWeight: 700, color: '#9b7cf6', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: '.35rem' }}>
                  Anna kontekstia AI:lle (valinnainen)
                </div>
                <div style={{ fontSize: '.68rem', color: 'var(--t3)', marginBottom: '.5rem' }}>
                  Auttaa parempaan yhteenvetoon. Esim. taustaa, lyhenteet, kuka kuka on.
                </div>
                <textarea
                  className="input textarea"
                  value={preContextText}
                  onChange={e => setPreContextText(e.target.value)}
                  autoFocus
                  placeholder="Esim: Aivovammaliiton hallituskokous, käsitellään 2027 viestintästrategiaa. Sade = hallituksen pj. AVL = Aivovammaliitto."
                  style={{
                    fontSize: '.82rem', lineHeight: 1.5, minHeight: 70, width: '100%',
                    background: 'rgba(255,255,255,.03)',
                  }}
                />
                <div style={{ display: 'flex', gap: '.35rem', justifyContent: 'flex-end', marginTop: '.5rem' }}>
                  <button className="btn btn-ghost btn-sm" style={{ fontSize: '.65rem' }} onClick={() => { setShowPreContextInput(false); setPreContextText(''); }}>Sulje</button>
                  <button
                    className="btn btn-primary btn-sm"
                    style={{ fontSize: '.65rem', color: '#fff' }}
                    disabled={summarizing}
                    onClick={() => { requestSummary(detail.id, preContextText); setShowPreContextInput(false); }}
                  >
                    {summarizing ? 'Luodaan...' : 'Luo yhteenveto kontekstilla'}
                  </button>
                </div>
              </div>
            )}
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
                {canEdit && !editingSummary && (
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => regenerateSummaryFromScratch(detail.id)}
                    disabled={summarizing}
                    title="Pyyhkii nykyisen yhteenvedon ja luo uuden alkuperaisesta palaveritekstista"
                    style={{ fontSize: '.65rem', color: '#9b7cf6', padding: '.2rem .5rem' }}
                  >
                    {summarizingId === detail.id ? 'Luodaan...' : '↻ Aloita alusta'}
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
                <div style={{ display: 'flex', gap: '.4rem', alignItems: 'center' }}>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => requestActionItems(detail.id)}
                    disabled={summarizing || extractingTasks}
                    style={{ fontSize: '.65rem', color: '#9b7cf6', padding: '.2rem .5rem' }}
                    title="Poimi tehtavat AI:lla erillisella kutsulla (toimii myos pitkille palavereille)"
                  >
                    {extractingTasksId === detail.id
                      ? 'Poimitaan...'
                      : (detail.actionItems && detail.actionItems.length > 0)
                        ? 'Poimi uudelleen'
                        : 'Poimi AI:lla'}
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setShowAddAction(true)}
                    style={{ fontSize: '.65rem', color: '#9b7cf6', padding: '.2rem .5rem' }}
                  >
                    + Lisää toimenpide
                  </button>
                </div>
              )}
            </div>
            {detail.actionItems && detail.actionItems.map((item, idx) => {
              const expandKey = `${detail.id}:${idx}`;
              const isExpanded = expandedAction === expandKey;
              const links = item.links || [];
              return (
              <div key={idx} style={{
                padding: '.75rem 1.25rem', borderTop: '1px solid var(--border)',
                display: 'flex', alignItems: 'flex-start', gap: '.75rem',
                background: item.confirmed ? 'rgba(24,94,91,.04)' : 'var(--card)',
                opacity: item.confirmed ? 0.7 : 1,
                flexWrap: 'wrap',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {isExpanded && canEdit ? (
                    <input
                      className="input"
                      value={item.text}
                      onChange={e => updateActionItem(detail.id, idx, { text: e.target.value })}
                      style={{ fontSize: '.82rem', width: '100%', padding: '.3rem .5rem' }}
                      placeholder="Tehtavan nimi"
                    />
                  ) : (
                    <LinkifiedText
                      text={item.text}
                      style={{ fontSize: '.82rem', lineHeight: 1.5, color: 'var(--t1)', display: 'block' }}
                    />
                  )}
                  {!isExpanded && (item.note || links.length > 0) && (
                    <div style={{ marginTop: '.3rem', display: 'flex', flexDirection: 'column', gap: '.25rem' }}>
                      {item.note && (
                        <LinkifiedText
                          text={item.note}
                          style={{ fontSize: '.72rem', color: 'var(--t2)', lineHeight: 1.5, display: 'block' }}
                        />
                      )}
                      {links.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.3rem' }}>
                          {links.map((url, lidx) => {
                            const href = url.startsWith('www.') ? `https://${url}` : url;
                            let label = url;
                            try {
                              const u = new URL(href);
                              label = u.hostname.replace(/^www\./, '') + (u.pathname && u.pathname !== '/' ? u.pathname : '');
                              if (label.length > 38) label = label.slice(0, 35) + '...';
                            } catch { /* keep raw */ }
                            return (
                              <a
                                key={lidx}
                                href={href}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={e => e.stopPropagation()}
                                style={{
                                  fontSize: '.65rem', padding: '.15rem .45rem', borderRadius: 9999,
                                  border: '1px solid rgba(155,124,246,.4)', background: 'rgba(155,124,246,.08)',
                                  color: '#9b7cf6', textDecoration: 'none', fontWeight: 600,
                                }}
                                title={url}
                              >
                                {label}
                              </a>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem', marginTop: '.35rem', flexWrap: 'wrap' }}>
                    {(() => {
                      const current = getActionAssignees(item);
                      const toggle = (name: string) => {
                        if (!canEdit) return;
                        const next = current.includes(name)
                          ? current.filter(n => n !== name)
                          : [...current, name];
                        setActionItemAssignees(detail.id, idx, next);
                      };
                      const optionStyle = (selected: boolean): React.CSSProperties => ({
                        fontSize: '.68rem', padding: '.2rem .55rem', borderRadius: 9999,
                        border: '1px solid ' + (selected ? '#9b7cf6' : 'var(--border)'),
                        background: selected ? 'rgba(155,124,246,.18)' : 'var(--elev)',
                        color: selected ? '#9b7cf6' : 'var(--t2)',
                        fontWeight: 600, cursor: canEdit ? 'pointer' : 'default',
                      });
                      const allOpt = ['Kaikki', ...members.map(m => m.name)];
                      return (
                        <>
                          {current.length === 0 && (
                            <span style={{ fontSize: '.68rem', color: 'var(--t3)', fontStyle: 'italic' }}>Ei tekijää</span>
                          )}
                          {allOpt.map(name => {
                            const selected = current.includes(name);
                            if (!selected && !canEdit) return null;
                            return (
                              <button
                                key={name}
                                type="button"
                                onClick={() => toggle(name)}
                                disabled={!canEdit}
                                style={optionStyle(selected)}
                              >
                                {selected ? '✓ ' : '+ '}{name}
                              </button>
                            );
                          })}
                        </>
                      );
                    })()}
                  </div>
                </div>
                {canEdit && (
                  <div style={{ display: 'flex', gap: '.3rem', flexShrink: 0, alignItems: 'center', position: 'relative' }}>
                    {!item.confirmed && (
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => setProjectMenuFor(projectMenuFor === `${detail.id}:${idx}` ? null : `${detail.id}:${idx}`)}
                        style={{
                          fontSize: '.65rem', padding: '.3rem .5rem', whiteSpace: 'nowrap',
                          border: '1px solid var(--border)', background: 'var(--elev)',
                        }}
                        title="Lisää projektiin tai luo uusi projekti"
                      >
                        Projektiin ▾
                      </button>
                    )}
                    {projectMenuFor === `${detail.id}:${idx}` && (
                      <div
                        onClick={e => e.stopPropagation()}
                        style={{
                          position: 'absolute', top: '100%', right: 0, marginTop: '.35rem',
                          background: 'var(--card)', border: '1px solid var(--border)',
                          borderRadius: 'var(--r)', boxShadow: '0 8px 24px rgba(0,0,0,.3)',
                          minWidth: 220, zIndex: 50, padding: '.35rem',
                        }}
                      >
                        <div style={{
                          fontSize: '.62rem', color: 'var(--t3)', textTransform: 'uppercase',
                          letterSpacing: '.05em', padding: '.35rem .5rem .2rem', fontWeight: 700,
                        }}>
                          Lisää projektiin
                        </div>
                        {projects.filter(p => !p.archived && !p.deletedAt).length === 0 && (
                          <div style={{ fontSize: '.72rem', color: 'var(--t3)', padding: '.35rem .5rem', fontStyle: 'italic' }}>
                            Ei projekteja vielä
                          </div>
                        )}
                        {projects.filter(p => !p.archived && !p.deletedAt).map(p => (
                          <button
                            key={p.id}
                            onClick={() => addActionToProject(detail.id, idx, p.id)}
                            style={{
                              display: 'block', width: '100%', textAlign: 'left',
                              padding: '.4rem .6rem', background: 'transparent', border: 'none',
                              borderRadius: 'var(--r)', fontSize: '.78rem', color: 'var(--t1)',
                              cursor: 'pointer',
                            }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'var(--elev)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                          >
                            {p.t}
                          </button>
                        ))}
                        <div style={{ borderTop: '1px solid var(--border)', margin: '.3rem 0' }} />
                        <button
                          onClick={() => createProjectFromAction(detail.id, idx)}
                          style={{
                            display: 'block', width: '100%', textAlign: 'left',
                            padding: '.4rem .6rem', background: 'transparent', border: 'none',
                            borderRadius: 'var(--r)', fontSize: '.78rem', color: 'var(--pri-l)',
                            cursor: 'pointer', fontWeight: 600,
                          }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'var(--elev)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          + Luo uusi projekti
                        </button>
                      </div>
                    )}
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => removeActionItem(detail.id, idx)}
                      style={{ fontSize: '.72rem', color: 'var(--red)', padding: '.2rem .4rem' }}
                    >
                      x
                    </button>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setExpandedAction(isExpanded ? null : expandKey)}
                  title={isExpanded ? 'Sulje lisätiedot' : 'Avaa lisätiedot (muokkaa, lisaa linkki)'}
                  style={{
                    fontSize: '.7rem', padding: '.2rem .4rem', background: 'transparent',
                    border: '1px solid var(--border)', borderRadius: 'var(--r)',
                    color: 'var(--t2)', cursor: 'pointer', flexShrink: 0,
                  }}
                >
                  {isExpanded ? '▴' : '▾'}
                </button>
                {item.confirmed && (
                  <span style={{ fontSize: '.65rem', color: 'var(--green)', fontWeight: 700 }}>Projektissa</span>
                )}
                {!item.confirmed && item.linkedTaskId && (
                  <span style={{ fontSize: '.6rem', color: 'var(--t3)', letterSpacing: '.08em', textTransform: 'uppercase' }}>Tehtäväksi</span>
                )}
                {isExpanded && (
                  <div style={{
                    flexBasis: '100%', marginTop: '.6rem', padding: '.7rem',
                    background: 'var(--elev)', borderRadius: 'var(--r)',
                    border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '.55rem',
                  }}>
                    <label style={{ fontSize: '.65rem', color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700 }}>
                      Lisatieto
                    </label>
                    <textarea
                      className="input"
                      value={item.note || ''}
                      onChange={e => updateActionItem(detail.id, idx, { note: e.target.value })}
                      placeholder="Kontekstia, taustaa, ohjeita..."
                      disabled={!canEdit}
                      rows={3}
                      style={{ fontSize: '.78rem', resize: 'vertical', minHeight: '3rem' }}
                    />
                    <label style={{ fontSize: '.65rem', color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700 }}>
                      Linkit
                    </label>
                    {(item.links || []).map((url, lidx) => (
                      <div key={lidx} style={{ display: 'flex', gap: '.4rem', alignItems: 'center' }}>
                        <input
                          className="input"
                          value={url}
                          onChange={e => {
                            const next = [...(item.links || [])];
                            next[lidx] = e.target.value;
                            updateActionItem(detail.id, idx, { links: next });
                          }}
                          placeholder="https://..."
                          disabled={!canEdit}
                          style={{ flex: 1, fontSize: '.75rem' }}
                        />
                        {url && (
                          <a
                            href={url.startsWith('www.') ? `https://${url}` : url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            style={{ fontSize: '.7rem', color: '#9b7cf6', padding: '.2rem .4rem' }}
                            title="Avaa linkki"
                          >
                            ↗
                          </a>
                        )}
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => {
                              const next = (item.links || []).filter((_, i) => i !== lidx);
                              updateActionItem(detail.id, idx, { links: next });
                            }}
                            style={{
                              fontSize: '.72rem', color: 'var(--red)', padding: '.2rem .4rem',
                              background: 'transparent', border: 'none', cursor: 'pointer',
                            }}
                            title="Poista linkki"
                          >
                            x
                          </button>
                        )}
                      </div>
                    ))}
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => {
                          const next = [...(item.links || []), ''];
                          updateActionItem(detail.id, idx, { links: next });
                        }}
                        style={{
                          fontSize: '.7rem', padding: '.25rem .55rem', alignSelf: 'flex-start',
                          background: 'transparent', border: '1px dashed var(--border)',
                          borderRadius: 'var(--r)', color: '#9b7cf6', cursor: 'pointer',
                        }}
                      >
                        + Lisaa linkki
                      </button>
                    )}
                  </div>
                )}
              </div>
              );
            })}

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
                          addActionItem(detail.id, newActionText, newActionAssignees);
                          setNewActionText('');
                          setNewActionAssignees([]);
                        }
                      }}
                    />
                    <div style={{ display: 'flex', gap: '.3rem', flexWrap: 'wrap' }}>
                      {['Kaikki', ...members.map(m => m.name)].map(name => {
                        const selected = newActionAssignees.includes(name);
                        return (
                          <button
                            key={name}
                            type="button"
                            onClick={() => setNewActionAssignees(prev =>
                              prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
                            )}
                            style={{
                              fontSize: '.68rem', padding: '.2rem .55rem', borderRadius: 9999,
                              border: '1px solid ' + (selected ? '#9b7cf6' : 'var(--border)'),
                              background: selected ? 'rgba(155,124,246,.18)' : 'var(--elev)',
                              color: selected ? '#9b7cf6' : 'var(--t2)',
                              fontWeight: 600, cursor: 'pointer',
                            }}
                          >
                            {selected ? '✓ ' : '+ '}{name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '.3rem', flexShrink: 0, paddingTop: '.2rem' }}>
                    <button
                      className="btn btn-primary btn-sm"
                      disabled={!newActionText.trim()}
                      onClick={() => {
                        addActionItem(detail.id, newActionText, newActionAssignees);
                        setNewActionText('');
                        setNewActionAssignees([]);
                      }}
                      style={{ fontSize: '.65rem' }}
                    >
                      Lisää
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => { setShowAddAction(false); setNewActionText(''); setNewActionAssignees([]); }}
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
                disabled={summarizing || extractingTasks}
                style={{ color: '#9b7cf6' }}
              >
                {summarizingId === detail.id ? 'Luodaan...' : detail.summary ? 'Paivita yhteenveto' : 'Luo AI-yhteenveto'}
              </button>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => requestActionItems(detail.id)}
                disabled={summarizing || extractingTasks}
                style={{ color: '#9b7cf6' }}
                title="Poimii tehtavat erikseen omalla AI-kutsulla – soveltuu pitkille palavereille"
              >
                {extractingTasksId === detail.id
                  ? 'Poimitaan...'
                  : (detail.actionItems && detail.actionItems.length > 0)
                    ? 'Poimi tehtavat uudelleen'
                    : 'Poimi tehtavat'}
              </button>
              {driveStatus.connected && (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => exportNoteToDrive(detail)}
                  disabled={driveBusy}
                  title="Vie tämä muistiinpano Google Docsiksi Driveen"
                >
                  {driveBusy ? 'Viedään…' : 'Vie Driveen'}
                </button>
              )}
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
      <DrivePicker
        mode="doc"
        multi
        open={drivePickerOpen}
        setOpen={setDrivePickerOpen}
        onPick={importFromDrive}
      />
      {canEdit && (
        <div style={{ display: 'flex', gap: '.5rem', justifyContent: 'flex-end', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
          <button className="btn btn-primary btn-sm" onClick={openNew}>+ Uusi muistiinpano</button>
          {driveStatus.connected && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setDrivePickerOpen(true)}
              disabled={driveBusy}
              title="Tuo Google Doc tai tekstitiedosto Drivesta"
            >
              {driveBusy ? 'Hetki…' : 'Tuo Drivesta'}
            </button>
          )}
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

      {/* Luonnos-palkki: tallentamaton muistio löytyi paikallisesta varmistuksesta */}
      {draftFound && !showForm && !isRecording && !transcribing && (
        <div style={{
          background: 'rgba(241,180,52,.06)', border: '1px solid rgba(241,180,52,.25)',
          borderRadius: 'var(--r)', padding: '1rem 1.2rem', marginBottom: '1rem',
          display: 'flex', alignItems: 'center', gap: '.75rem', flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: '.85rem', fontWeight: 600, color: 'var(--t1)' }}>
            Tallentamaton muistio löydetty{draftFound.nTitle ? `: ${draftFound.nTitle}` : ''}
            {draftFound.ts ? ` (${new Date(draftFound.ts).toLocaleString('fi-FI', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })})` : ''}.
            Haluatko jatkaa sen muokkausta?
          </span>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => restoreDraft(draftFound)}
            style={{ marginLeft: 'auto', whiteSpace: 'nowrap' }}
          >
            Palauta luonnos
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => {
              if (window.confirm('Poistetaanko tallentamaton luonnos pysyvästi?')) clearDraft();
            }}
            style={{ color: 'var(--t3)', whiteSpace: 'nowrap' }}
          >
            Hylkää
          </button>
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
            Äänitteen varmuuskopio löydetty. Haluatko litteroida sen?
          </span>
          <button
            className="btn btn-primary btn-sm"
            onClick={async () => {
              const blob = await recoverFromIDB();
              if (blob) {
                setHasRecovery(false);
                await transcribeAudio(blob);
              } else {
                toast('Äänitettä ei voitu palauttaa', 'error');
                clearIDB();
              }
            }}
            style={{ marginLeft: 'auto', whiteSpace: 'nowrap' }}
          >
            Palauta ja litteroi
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => {
              if (window.confirm('Poistetaanko äänitteen varmuuskopio pysyvästi?')) clearIDB();
            }}
            style={{ color: 'var(--t3)', whiteSpace: 'nowrap' }}
          >
            Hylkää
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
                {(note.rawTranscription || note.cleanTranscription) && (
                  <span style={{ fontSize: '.58rem', padding: '.1rem .35rem', borderRadius: 9999, background: 'rgba(5,107,159,.1)', color: 'var(--pri)', fontWeight: 700 }}>Litteroitu</span>
                )}
                {note.summary && (
                  <span style={{ fontSize: '.58rem', padding: '.1rem .35rem', borderRadius: 9999, background: 'rgba(155,124,246,.1)', color: '#9b7cf6', fontWeight: 700 }}>AI-yhteenveto</span>
                )}
                {canEdit && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`Poistetaanko muistiinpano "${note.title}"? Voit palauttaa sen myöhemmin roskakorista.`)) {
                        remove(note.id);
                      }
                    }}
                    title="Poista muistiinpano"
                    aria-label="Poista muistiinpano"
                    style={{
                      marginLeft: 'auto',
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--t3)',
                      cursor: 'pointer',
                      fontSize: '1rem',
                      lineHeight: 1,
                      padding: '.2rem .4rem',
                      borderRadius: 4,
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--red)'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--t3)'; }}
                  >
                    ×
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem', marginBottom: '.2rem' }}>
                <div style={{ fontSize: '.92rem', fontWeight: 700, flex: 1, minWidth: 0 }}>{note.title}</div>
                {canEdit && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      const next = window.prompt('Muokkaa otsikkoa:', note.title);
                      if (next === null) return;
                      const trimmed = next.trim();
                      if (!trimmed || trimmed === note.title) return;
                      setNotes(prev => prev.map(n => n.id === note.id ? { ...n, title: trimmed } : n));
                      toast('Otsikko päivitetty', 'success');
                    }}
                    title="Muokkaa otsikkoa"
                    aria-label="Muokkaa otsikkoa"
                    style={{
                      background: 'transparent',
                      border: '1px solid var(--border)',
                      color: 'var(--t3)',
                      cursor: 'pointer',
                      fontSize: '.65rem',
                      letterSpacing: '.04em',
                      textTransform: 'uppercase',
                      padding: '.15rem .5rem',
                      borderRadius: 4,
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--ink)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--pri)'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--t3)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}
                  >
                    Otsikko
                  </button>
                )}
              </div>
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
              <button className="btn btn-ghost" onClick={() => setShowForm(false)} disabled={saving}>Peruuta</button>
              <button className="btn btn-primary" onClick={save} disabled={!nTitle.trim() || !nContent.trim() || saving}>{saving ? 'Tallennetaan…' : 'Tallenna'}</button>
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

/**
 * Map a MediaRecorder blob to a file extension that Whisper accepts.
 * Whisper tukee: flac, m4a, mp3, mp4, mpeg, mpga, oga, ogg, wav, webm.
 * HUOM: audio-only mp4 -> .m4a (ei .mp4, muuten Whisper voi hylätä koska ei videoraitaa).
 */
function whisperExtForBlob(blob: Blob): string {
  const t = (blob.type || '').toLowerCase();
  if (t.includes('webm')) return 'webm';
  if (t.includes('ogg') || t.includes('oga') || t.includes('opus')) return 'ogg';
  if (t.includes('mp4') || t.includes('aac') || t.includes('x-m4a') || t.includes('m4a')) return 'm4a';
  if (t.includes('mpeg') || t.includes('mp3') || t.includes('mpga')) return 'mp3';
  if (t.includes('wav') || t.includes('wave') || t.includes('x-wav')) return 'wav';
  if (t.includes('flac')) return 'flac';
  // Tuntematon — oleta webm (Chrome/Edgen yleisin), mutta lokita varoitus
  if (typeof console !== 'undefined') console.warn('[whisper] Tuntematon blob-tyyppi, käytetään .webm-päätettä:', blob.type);
  return 'webm';
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
