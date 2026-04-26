'use client';

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { useOrgData } from '@/lib/firestore';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { useIsMobile } from '@/lib/use-mobile';
import { softDelete, filterActive } from '@/lib/trash';
import { workerFetch } from '@/lib/worker-fetch';
import { getOrgTeams, getOrgTeamMembers } from '@/lib/org-defaults';
import { OrgTeam, OrgTeamMember, uniqueMembersByName, resolveUserMember } from '@/lib/team-shared';
import { buildAssignment } from '@/lib/assignments-shared';
import {
  ProjectNote, NoteVisibility, NoteStage, NoteComment, NoteConversion,
  canViewNote, canEditNote, canCommentOnNote, filterVisible,
  createEmptyNote, createComment, stageLabel, stageColor,
  KICKOFF_QUESTIONS,
} from '@/lib/notes-shared';

interface ProjectLite {
  id: number;
  t: string;
  d?: string;
  archived?: boolean;
  deletedAt?: number;
  teamId?: string;
  st?: string;
  deadline?: string;
  team?: unknown[];
  comments?: unknown[];
  tasks?: unknown[];
  createdAt?: number;
  noteSeedIds?: string[];
}

interface OrgTask {
  id: string; text: string; assignee?: string;
  hankkia: boolean; done: boolean; priority: 'normal' | 'high';
  deadline?: string; note?: string; category?: string;
  assignees?: string[]; assignedBy?: string; status?: 'pending' | 'accepted' | 'rejected';
}

// ── Utils ──
const relativeSaved = (ts: number): string => {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 3) return 'juuri nyt';
  if (s < 60) return `${s} s sitten`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min sitten`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h sitten`;
  return new Date(ts).toLocaleDateString('fi-FI');
};

const fmtTime = (sec: number): string =>
  `${Math.floor(sec / 60).toString().padStart(2, '0')}:${(sec % 60).toString().padStart(2, '0')}`;

/**
 * Map a MediaRecorder blob to a file extension that Whisper accepts.
 * Whisper tukee: flac, m4a, mp3, mp4, mpeg, mpga, oga, ogg, wav, webm.
 * HUOM: audio-only mp4 -> .m4a, Firefox/Safari voi tuottaa ogg tai mp4.
 */
function whisperExtForBlob(blob: Blob): string {
  const t = (blob.type || '').toLowerCase();
  if (t.includes('webm')) return 'webm';
  if (t.includes('ogg') || t.includes('oga') || t.includes('opus')) return 'ogg';
  if (t.includes('mp4') || t.includes('aac') || t.includes('x-m4a') || t.includes('m4a')) return 'm4a';
  if (t.includes('mpeg') || t.includes('mp3') || t.includes('mpga')) return 'mp3';
  if (t.includes('wav') || t.includes('wave') || t.includes('x-wav')) return 'wav';
  if (t.includes('flac')) return 'flac';
  if (typeof console !== 'undefined') console.warn('[whisper] Tuntematon blob-tyyppi, käytetään .webm-päätettä:', blob.type);
  return 'webm';
}

// Creative-space backdrop — lievä kerman väri joka erottaa projektinhallinnasta
const CREATIVE_BG = 'linear-gradient(180deg, rgba(241,180,52,.025) 0%, rgba(155,124,246,.02) 100%)';

export default function MuistiinpanotProjektiPage() {
  const params = useParams();
  const orgSlug = (params.orgSlug as string) || '';
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, canEdit, activeOrg } = useAuth();
  const { toast } = useToast();
  const isMobile = useIsMobile();

  const [notes, setNotes] = useOrgData<ProjectNote[]>('projectNotes', []);
  const [projects, setProjects] = useOrgData<ProjectLite[]>('projects', []);
  const [tasks, setTasks] = useOrgData<OrgTask[]>('tasks', []);
  const [orgTeams] = useOrgData<OrgTeam[]>('orgTeams', getOrgTeams(orgSlug));
  const [membersRaw] = useOrgData<OrgTeamMember[]>('orgTeamMembers', getOrgTeamMembers(orgSlug));
  const members = useMemo(() => uniqueMembersByName(membersRaw), [membersRaw]);
  const myMember = useMemo(() => resolveUserMember(members, user), [members, user]);
  const myName = myMember?.name || user?.displayName || user?.email || 'Tuntematon';
  const uid = user?.uid || '';

  const preProjectId = Number(searchParams.get('project')) || null;

  // Filters
  const [filterProject, setFilterProject] = useState<number | 'all'>(preProjectId ?? 'all');
  const [filterStage, setFilterStage] = useState<NoteStage | 'all'>('all');
  const [search, setSearch] = useState('');

  useEffect(() => { if (preProjectId != null) setFilterProject(preProjectId); }, [preProjectId]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [, forceTick] = useState(0);
  useEffect(() => { const t = setInterval(() => forceTick(x => x + 1), 30000); return () => clearInterval(t); }, []);

  // Composer state — kick-off + editing
  const [pickerOpen, setPickerOpen] = useState(false); // Herätä-valikko
  const [composerOpen, setComposerOpen] = useState(false); // näytetäänkö composer
  const [draftId, setDraftId] = useState<string | null>(null);
  const [cTitle, setCTitle] = useState('');
  const [cContent, setCContent] = useState('');
  const [cVis, setCVis] = useState<NoteVisibility>('private');
  const [cProjects, setCProjects] = useState<number[]>([]);
  const [cTeams, setCTeams] = useState<string[]>([]);
  const [cSourceQuestion, setCSourceQuestion] = useState<string | undefined>(undefined);
  const [cSourceProjectId, setCSourceProjectId] = useState<number | undefined>(undefined);
  const [cSourceNoteId, setCSourceNoteId] = useState<string | undefined>(undefined);
  const [cSavedAt, setCSavedAt] = useState<number | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

  const resetComposer = () => {
    setDraftId(null); setCTitle(''); setCContent(''); setCVis('private');
    setCProjects([]); setCTeams([]);
    setCSourceQuestion(undefined); setCSourceProjectId(undefined); setCSourceNoteId(undefined);
    setCSavedAt(null);
    setComposerOpen(false);
  };

  // Start from picker option
  type KickOff =
    | { kind: 'blank' }
    | { kind: 'question'; question: string }
    | { kind: 'project'; projectId: number; lens: string }
    | { kind: 'note'; noteId: string };

  const PROJECT_LENSES = [
    'Mitä tästä puuttuu?',
    'Mikä ei toimi?',
    'Mitä jos aloittaisi alusta?',
    'Kuka muu hyötyisi tästä?',
  ];

  const kickOff = (k: KickOff) => {
    // Build seed data
    let seedTitle = '';
    const seedContent = '';
    const seedProjects: number[] = filterProject !== 'all' ? [filterProject as number] : [];
    let sourceQuestion: string | undefined;
    let sourceProjectId: number | undefined;
    let sourceNoteId: string | undefined;

    if (k.kind === 'question') {
      sourceQuestion = k.question;
    } else if (k.kind === 'project') {
      const p = projects.find(pp => pp.id === k.projectId);
      sourceProjectId = k.projectId;
      sourceQuestion = k.lens;
      if (p && !seedProjects.includes(p.id)) seedProjects.push(p.id);
      seedTitle = `${k.lens} — ${p?.t ?? ''}`.trim();
    } else if (k.kind === 'note') {
      const other = notes.find(n => n.id === k.noteId);
      sourceNoteId = k.noteId;
      seedTitle = other ? `Jatkoa: ${other.title || 'Nimetön'}` : '';
    }

    // Create draft note eagerly so composer has something to edit + saves immediately
    const now = Date.now();
    const seed = createEmptyNote(uid, myName, {
      title: seedTitle,
      content: seedContent,
      visibility: 'private',
      stage: 'luonnos',
      projectIds: seedProjects,
      teamIds: [],
      sourceQuestion,
      sourceProjectId,
      sourceNoteId,
    });
    setNotes(prev => [seed, ...prev]);

    // Sync composer UI state to the new draft
    setDraftId(seed.id);
    setCTitle(seedTitle);
    setCContent(seedContent);
    setCVis('private');
    setCProjects(seedProjects);
    setCTeams([]);
    setCSourceQuestion(sourceQuestion);
    setCSourceProjectId(sourceProjectId);
    setCSourceNoteId(sourceNoteId);
    setCSavedAt(now);
    setComposerOpen(true);
    setPickerOpen(false);
    setTimeout(() => composerRef.current?.focus(), 50);
  };

  const persistDraft = useCallback((patch: Partial<ProjectNote>) => {
    if (!canEdit) return;
    const now = Date.now();
    if (draftId == null) {
      const seed = createEmptyNote(uid, myName, {
        title: cTitle,
        content: cContent,
        visibility: cVis,
        projectIds: cProjects,
        teamIds: cTeams,
        sourceQuestion: cSourceQuestion,
        sourceProjectId: cSourceProjectId,
        sourceNoteId: cSourceNoteId,
        stage: 'luonnos',
        ...patch,
      });
      setDraftId(seed.id);
      setNotes(prev => [seed, ...prev]);
      setCSavedAt(now);
      return;
    }
    setNotes(prev => prev.map(n => n.id === draftId ? { ...n, ...patch, updatedAt: now } : n));
    setCSavedAt(now);
  }, [draftId, canEdit, uid, myName, cTitle, cContent, cVis, cProjects, cTeams, cSourceQuestion, cSourceProjectId, cSourceNoteId, setNotes]);

  const onCTitle = (v: string) => { setCTitle(v); if (v.trim() || cContent.trim()) persistDraft({ title: v }); };
  const onCContent = (v: string) => { setCContent(v); if (v.trim() || cTitle.trim()) persistDraft({ content: v }); };
  const toggleCVis = () => { const n = cVis === 'private' ? 'shared' : 'private'; setCVis(n); if (draftId) persistDraft({ visibility: n }); };
  const toggleCProject = (id: number) => {
    const n = cProjects.includes(id) ? cProjects.filter(x => x !== id) : [...cProjects, id];
    setCProjects(n); if (draftId) persistDraft({ projectIds: n });
  };
  const toggleCTeam = (id: string) => {
    const n = cTeams.includes(id) ? cTeams.filter(x => x !== id) : [...cTeams, id];
    setCTeams(n); if (draftId) persistDraft({ teamIds: n });
  };

  const finishComposer = () => {
    if (draftId && !cTitle.trim() && !cContent.trim()) {
      setNotes(prev => prev.filter(n => n.id !== draftId));
      toast('Tyhjä muistiinpano hylätty', 'success');
    } else if (draftId) {
      toast('Muistiinpano tallennettu luonnoksiin', 'success');
    }
    resetComposer();
  };

  // ── Dictation ──
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [transcribing, setTranscribing] = useState(false);
  const [recordingTarget, setRecordingTarget] = useState<'composer' | string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startRec = useCallback(async (target: 'composer' | string) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '';
      const rec = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 32000 });
      audioChunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      rec.start(1000);
      mediaRecorderRef.current = rec;
      setIsRecording(true); setRecordingTime(0); setRecordingTarget(target);
      timerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);
    } catch { toast('Mikrofonin käyttö ei onnistunut', 'error'); }
  }, [toast]);

  const stopRec = useCallback((): Promise<Blob | null> => {
    const rec = mediaRecorderRef.current;
    if (!rec) return Promise.resolve(null);
    return new Promise(resolve => {
      rec.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: rec.mimeType || 'audio/webm' });
        rec.stream.getTracks().forEach(t => t.stop());
        resolve(blob);
      };
      rec.stop(); setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    });
  }, []);

  const transcribe = useCallback(async (blob: Blob): Promise<string> => {
    const form = new FormData();
    const ext = whisperExtForBlob(blob);
    form.append('audio', blob, `dictation.${ext}`);
    const res = await workerFetch('/api/transcribe', { method: 'POST', orgId: activeOrg || '', body: form });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Litterointi epäonnistui (${res.status}) ${errText.slice(0, 200)}`);
    }
    const { transcription } = await res.json() as { transcription: string };
    return transcription || '';
  }, [activeOrg]);

  const handleStopAndTranscribe = useCallback(async () => {
    const target = recordingTarget;
    const blob = await stopRec();
    if (!blob || !target) return;
    if (blob.size > 24 * 1024 * 1024) { toast('Äänite on liian suuri', 'error'); return; }
    setTranscribing(true);
    try {
      const text = await transcribe(blob);
      if (!text) throw new Error('Tyhjä litterointi');
      if (target === 'composer') {
        const nextContent = (cContent ? cContent + '\n\n' : '') + text;
        setCContent(nextContent);
        persistDraft({ content: nextContent });
      } else {
        setNotes(prev => prev.map(n => n.id === target ? {
          ...n,
          content: (n.content ? n.content + '\n\n' : '') + text,
          rawTranscription: (n.rawTranscription ? n.rawTranscription + '\n\n' : '') + text,
          updatedAt: Date.now(),
        } : n));
      }
      toast('Litterointi valmis', 'success');
    } catch (e) { toast((e as Error).message || 'Litterointi epäonnistui', 'error'); }
    finally { setTranscribing(false); setRecordingTarget(null); }
  }, [recordingTarget, stopRec, transcribe, toast, cContent, persistDraft, setNotes]);

  useEffect(() => { return () => { if (timerRef.current) clearInterval(timerRef.current); }; }, []);

  // ── AI helpers ──
  const [aiWorking, setAiWorking] = useState<string | null>(null); // 'haasta'|'tiivistä'|'terävöitä'

  const askAI = async (prompt: string, systemContext: string): Promise<string> => {
    const res = await workerFetch('/api/chat', {
      method: 'POST',
      orgId: activeOrg || '',
      body: JSON.stringify({
        messages: [{ role: 'user', content: prompt }],
        systemContext,
      }),
    });
    if (!res.ok) throw new Error('AI-kutsu epäonnistui');
    const data = await res.json() as { response?: string };
    return (data.response || '').trim();
  };

  const aiChallenge = async (note: ProjectNote) => {
    setAiWorking('haasta');
    try {
      const prompt = `Alla on luova muistiinpano. Haasta sen kirjoittajaa: esitä 3 terävää kysymystä jotka pakottavat kyseenalaistamaan oletuksia tai löytämään heikkoja kohtia. Vastaa pelkillä kysymyksillä, yksi per rivi, numeroimattomina. Vastaa suomeksi.\n\nOtsikko: ${note.title || 'Nimetön'}\n${note.sourceQuestion ? `\nLähtökysymys: ${note.sourceQuestion}` : ''}\n\nSisältö:\n${note.content}`;
      const out = await askAI(prompt, 'Olet kriittinen mutta rakentava ideointi-sparraaja. Haastat kysymyksillä, et neuvo suoraan.');
      setNotes(prev => prev.map(n => n.id === note.id ? { ...n, aiChallenge: out, updatedAt: Date.now() } : n));
      toast('Haaste luotu', 'success');
    } catch (e) { toast((e as Error).message, 'error'); }
    finally { setAiWorking(null); }
  };

  const aiDistill = async (note: ProjectNote) => {
    setAiWorking('tiivistä');
    try {
      const prompt = `Tiivistä alla oleva muistiinpano ytimeen: yksi lause joka kertoo mistä on kyse ja miksi se merkitsee. Sitten 2-4 tärkeintä ajatusta lyhyinä ranskalaisina viivoina. Vastaa suomeksi ilman markdown-muotoilua.\n\nOtsikko: ${note.title || 'Nimetön'}\n\nSisältö:\n${note.content}`;
      const out = await askAI(prompt, 'Olet terävä editori joka löytää ytimen.');
      setNotes(prev => prev.map(n => n.id === note.id ? { ...n, aiDistilled: out, updatedAt: Date.now() } : n));
      toast('Tiivistys valmis', 'success');
    } catch (e) { toast((e as Error).message, 'error'); }
    finally { setAiWorking(null); }
  };

  const aiRefine = async (note: ProjectNote) => {
    setAiWorking('terävöitä');
    try {
      const prompt = `Alla on luova muistiinpano joka harkitaan muutettavaksi projektiksi. Tuota 3 konkreettista kysymystä joihin kirjoittajan on pakko vastata ennen kuin idea voi muuttua projektiksi. Kysymysten pitää pakottaa konkretiaa: vastuu, tavoite, ensimmäinen askel, mittari, aikajänne. Vastaa yksinkertaisella listalla, yksi kysymys per rivi, ei numerointia, ei markdownia.\n\nOtsikko: ${note.title || 'Nimetön'}\n\nSisältö:\n${note.content}`;
      const out = await askAI(prompt, 'Olet projektipäällikkö joka vaatii vastauksia ennen päätöstä.');
      const questions = out.split('\n').map(l => l.trim()).filter(l => l.length > 0).slice(0, 5);
      setNotes(prev => prev.map(n => n.id === note.id ? { ...n, aiRefineQuestions: questions, updatedAt: Date.now() } : n));
      toast('Terävöitä-kysymykset luotu', 'success');
    } catch (e) { toast((e as Error).message, 'error'); }
    finally { setAiWorking(null); }
  };

  // ── Conversions: idea → action ──
  const recordConversion = (noteId: string, conv: NoteConversion, newStage: NoteStage = 'valmis') => {
    setNotes(prev => prev.map(n => n.id === noteId ? {
      ...n,
      stage: newStage,
      conversions: [...(n.conversions || []), conv],
      updatedAt: Date.now(),
    } : n));
  };

  const convertToTask = (note: ProjectNote) => {
    const text = note.title.trim() || note.content.slice(0, 100).trim();
    if (!text) { toast('Ei sisältöä muunnettavaksi', 'error'); return; }
    const newTask: OrgTask = {
      id: 't_' + Date.now(),
      text,
      hankkia: false,
      done: false,
      priority: 'normal',
      note: `Syntynyt muistiinpanosta: ${note.title || 'Nimetön'}`,
      ...buildAssignment(myName || undefined, myName),
    };
    setTasks(prev => [newTask, ...prev]);
    recordConversion(note.id, {
      type: 'task', targetId: newTask.id, targetLabel: text,
      at: Date.now(), by: uid, byName: myName,
    });
    toast(`Tehtävä luotu: ${text.slice(0, 40)}`, 'success');
  };

  const convertToProject = (note: ProjectNote) => {
    const name = window.prompt('Uuden projektin nimi:', note.title.slice(0, 60));
    if (!name || !name.trim()) return;
    const exists = projects.some(p => (p.t || '').toLowerCase() === name.trim().toLowerCase());
    if (exists) { toast('Samanniminen projekti on jo olemassa', 'error'); return; }
    const projectId = Date.now();
    const newProject: ProjectLite = {
      id: projectId, t: name.trim(),
      d: `Syntynyt muistiinpanosta: ${note.title || 'Nimetön'}\n\n${note.content.slice(0, 300)}`,
      st: 'idea', deadline: '',
      team: [], comments: [], tasks: [],
      createdAt: Date.now(),
      noteSeedIds: [note.id],
    };
    setProjects(prev => [...prev, newProject]);
    // Add note to its projectIds so it shows up in project detail
    setNotes(prev => prev.map(n => n.id === note.id ? {
      ...n,
      projectIds: [...new Set([...n.projectIds, projectId])],
      stage: 'valmis',
      conversions: [...(n.conversions || []), {
        type: 'project', targetId: projectId, targetLabel: name.trim(),
        at: Date.now(), by: uid, byName: myName,
      }],
      updatedAt: Date.now(),
    } : n));
    toast(`Projekti luotu: ${name.trim()}`, 'success');
  };

  const convertToMeeting = (note: ProjectNote) => {
    // Lightweight: only record conversion; actual meeting creation via Palaverit-moduuli
    const label = note.title.trim() || 'Keskustelu ideasta';
    recordConversion(note.id, {
      type: 'meeting', targetId: note.id, targetLabel: label,
      at: Date.now(), by: uid, byName: myName,
    });
    toast('Merkitty palaveriksi. Luo kalenteriin Palaverit-moduulissa.', 'success');
  };

  // ── Stage transitions ──
  const advanceStage = (note: ProjectNote) => {
    if (note.stage === 'luonnos') {
      // Siirtyminen keskusteluun vaatii "jaetun" näkyvyyden
      setNotes(prev => prev.map(n => n.id === note.id ? {
        ...n, stage: 'keskustelussa', visibility: 'shared', updatedAt: Date.now(),
      } : n));
      toast('Muistiinpano jaettu keskusteluun', 'success');
    } else if (note.stage === 'keskustelussa') {
      setNotes(prev => prev.map(n => n.id === note.id ? {
        ...n, stage: 'valmis', updatedAt: Date.now(),
      } : n));
      toast('Merkitty valmiiksi toiminnaksi — muista muuntaa', 'success');
    }
  };

  const regressStage = (note: ProjectNote) => {
    if (note.stage === 'valmis') {
      setNotes(prev => prev.map(n => n.id === note.id ? { ...n, stage: 'keskustelussa', updatedAt: Date.now() } : n));
    } else if (note.stage === 'keskustelussa') {
      setNotes(prev => prev.map(n => n.id === note.id ? { ...n, stage: 'luonnos', visibility: 'private', updatedAt: Date.now() } : n));
      toast('Palautettu luonnokseksi (yksityinen)', 'success');
    }
  };

  // ── Comments ──
  const addComment = (noteId: string, text: string) => {
    if (!text.trim()) return;
    const comment = createComment(uid, myName, text);
    setNotes(prev => prev.map(n => n.id === noteId ? {
      ...n, comments: [...(n.comments || []), comment], updatedAt: Date.now(),
    } : n));
  };

  const removeNote = (id: string) => {
    setNotes(prev => softDelete(prev, id));
    if (selectedId === id) setSelectedId(null);
    if (draftId === id) resetComposer();
    toast('Siirretty roskakoriin', 'success');
  };

  // ── Derived data ──
  const activeNotes = useMemo(() => filterVisible(filterActive(notes), uid), [notes, uid]);
  const activeProjects = useMemo(() => projects.filter(p => !p.archived && !p.deletedAt), [projects]);
  const activeTeams = useMemo(() => orgTeams.filter(t => !t.deletedAt), [orgTeams]);

  const filtered = useMemo(() => {
    let list = activeNotes.filter(n => n.id !== draftId);
    if (filterProject !== 'all') list = list.filter(n => n.projectIds.includes(filterProject as number));
    if (filterStage !== 'all') list = list.filter(n => n.stage === filterStage);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(n => n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => b.updatedAt - a.updatedAt);
  }, [activeNotes, filterProject, filterStage, search, draftId]);

  // Group by stage for the list
  const byStage = useMemo(() => {
    const luonnos: ProjectNote[] = [];
    const keskustelussa: ProjectNote[] = [];
    const valmis: ProjectNote[] = [];
    for (const n of filtered) {
      if (n.stage === 'luonnos') luonnos.push(n);
      else if (n.stage === 'keskustelussa') keskustelussa.push(n);
      else valmis.push(n);
    }
    return { luonnos, keskustelussa, valmis };
  }, [filtered]);

  const projectName = (id: number) => projects.find(p => p.id === id)?.t || 'Poistettu';
  const teamName = (id: string) => orgTeams.find(t => t.id === id)?.name || id;
  const teamColor = (id: string) => orgTeams.find(t => t.id === id)?.color || '#888';

  // ── Detail view ──
  const detail = selectedId ? notes.find(n => n.id === selectedId) : null;
  const detailCanEdit = !!(detail && canEditNote(detail, uid) && canEdit);
  const detailCanView = !!(detail && canViewNote(detail, uid));
  const detailCanComment = !!(detail && canCommentOnNote(detail, uid));

  const updateDetail = (patch: Partial<ProjectNote>) => {
    if (!detail) return;
    setNotes(prev => prev.map(n => n.id === detail.id ? { ...n, ...patch, updatedAt: Date.now() } : n));
  };

  if (detail && detailCanView) {
    const stgCol = stageColor(detail.stage);
    const sourceNote = detail.sourceNoteId ? notes.find(n => n.id === detail.sourceNoteId) : null;
    const sourceProject = detail.sourceProjectId ? projects.find(p => p.id === detail.sourceProjectId) : null;

    return (
      <AppShell title={detail.title || 'Nimetön muistiinpano'} subtitle={`${detail.ownerName} · muokattu ${relativeSaved(detail.updatedAt)}`}>
        <button className="btn btn-ghost" onClick={() => setSelectedId(null)} style={{ marginBottom: '1rem' }}>{'<-'} Takaisin</button>

        {/* Stage + vis chips */}
        <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '1rem' }}>
          <span style={{
            fontSize: '.7rem', padding: '.3rem .7rem', borderRadius: 9999, fontWeight: 700,
            background: stgCol.bg, color: stgCol.fg,
            textTransform: 'uppercase', letterSpacing: '.05em',
          }}>
            {stageLabel(detail.stage)}
          </span>
          {detailCanEdit && detail.stage !== 'valmis' && (
            <button
              onClick={() => advanceStage(detail)}
              className="btn btn-ghost btn-sm"
              style={{ fontSize: '.7rem', color: detail.stage === 'luonnos' ? '#9b7cf6' : 'var(--green)' }}
            >
              {detail.stage === 'luonnos' ? 'Jaa keskusteluun →' : 'Merkitse valmiiksi →'}
            </button>
          )}
          {detailCanEdit && detail.stage !== 'luonnos' && (
            <button onClick={() => regressStage(detail)} className="btn btn-ghost btn-sm" style={{ fontSize: '.7rem', color: 'var(--t3)' }}>
              ← {detail.stage === 'valmis' ? 'Takaisin keskusteluun' : 'Takaisin luonnokseksi'}
            </button>
          )}
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: '.7rem', color: 'var(--t3)' }}>{relativeSaved(detail.updatedAt)}</span>
          {detailCanEdit && (
            <button className="btn btn-ghost btn-sm" onClick={() => { if (confirm('Poistetaanko?')) removeNote(detail.id); }} style={{ color: 'var(--red)', fontSize: '.7rem' }}>
              Poista
            </button>
          )}
        </div>

        {/* Source context — "mistä tämä lähti" */}
        {(detail.sourceQuestion || sourceNote || sourceProject) && (
          <div style={{
            background: 'rgba(155,124,246,.04)', border: '1px dashed rgba(155,124,246,.25)',
            borderRadius: 'var(--rl)', padding: '.75rem 1rem', marginBottom: '1rem',
          }}>
            <div style={{ fontSize: '.62rem', fontWeight: 700, color: '#9b7cf6', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '.25rem' }}>
              Tämä lähti liikkeelle…
            </div>
            {detail.sourceQuestion && (
              <div style={{ fontSize: '.88rem', fontStyle: 'italic', color: 'var(--t2)', fontFamily: 'var(--font-display), serif' }}>
                "{detail.sourceQuestion}"
              </div>
            )}
            {sourceProject && (
              <div style={{ fontSize: '.75rem', color: 'var(--t2)', marginTop: '.25rem' }}>
                Projektista: <strong>{sourceProject.t}</strong>
              </div>
            )}
            {sourceNote && (
              <div style={{ fontSize: '.75rem', color: 'var(--t2)', marginTop: '.25rem' }}>
                Jatkoa: <button onClick={() => setSelectedId(sourceNote.id)} style={{ background: 'none', border: 'none', color: 'var(--pri)', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>{sourceNote.title || 'Nimetön'}</button>
              </div>
            )}
          </div>
        )}

        {/* Title + content */}
        <input
          value={detail.title}
          onChange={e => detailCanEdit && updateDetail({ title: e.target.value })}
          disabled={!detailCanEdit}
          placeholder="Anna muistiinpanolle otsikko..."
          style={{
            width: '100%', background: 'transparent', border: 'none', outline: 'none',
            fontFamily: 'var(--font-display), Georgia, serif',
            fontSize: isMobile ? '1.3rem' : '1.75rem',
            fontWeight: 600, color: 'var(--t1)',
            padding: '.25rem 0', marginBottom: '.5rem',
            letterSpacing: '-.01em',
          }}
        />

        <textarea
          value={detail.content}
          onChange={e => detailCanEdit && updateDetail({ content: e.target.value })}
          disabled={!detailCanEdit}
          placeholder={detailCanEdit ? 'Kirjoita ajatuksesi — kaikki tallentuu automaattisesti.' : 'Ei sisältöä'}
          rows={Math.max(10, detail.content.split('\n').length + 2)}
          style={{
            width: '100%', background: 'var(--card)', border: '1px solid var(--border)',
            borderRadius: 'var(--rl)', padding: '1.25rem 1.35rem',
            fontSize: '.95rem', lineHeight: 1.8, color: 'var(--t1)',
            fontFamily: 'inherit', resize: 'vertical', outline: 'none', minHeight: 240,
          }}
          onFocus={e => { (e.target as HTMLTextAreaElement).style.borderColor = '#9b7cf6'; }}
          onBlur={e => { (e.target as HTMLTextAreaElement).style.borderColor = 'var(--border)'; }}
        />

        {/* Dictation */}
        {detailCanEdit && (
          <div style={{ display: 'flex', gap: '.5rem', marginTop: '.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            {!isRecording && recordingTarget !== detail.id && !transcribing && (
              <button className="btn btn-ghost btn-sm" onClick={() => startRec(detail.id)} style={{ display: 'flex', alignItems: 'center', gap: '.35rem', fontSize: '.72rem' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--red)' }} />
                Sanele lisää
              </button>
            )}
            {isRecording && recordingTarget === detail.id && (
              <>
                <span style={{ fontSize: '.78rem', color: 'var(--red)', fontWeight: 600 }}>Äänitetään… {fmtTime(recordingTime)}</span>
                <button className="btn btn-primary btn-sm" onClick={handleStopAndTranscribe}>Lopeta</button>
              </>
            )}
            {transcribing && recordingTarget === detail.id && <span style={{ fontSize: '.78rem', color: 'var(--pri)' }}>Litteroidaan…</span>}
          </div>
        )}

        {/* Projects / teams */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.35rem', alignItems: 'center', marginTop: '1rem' }}>
          {detail.projectIds.map(pid => (
            <span key={pid} style={{
              fontSize: '.7rem', padding: '.25rem .55rem', borderRadius: 9999,
              background: 'rgba(5,107,159,.12)', color: 'var(--pri-l)', fontWeight: 600,
              display: 'inline-flex', alignItems: 'center', gap: '.3rem',
            }}>
              {projectName(pid)}
              {detailCanEdit && (
                <button onClick={() => updateDetail({ projectIds: detail.projectIds.filter(x => x !== pid) })} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '.8rem', padding: 0, lineHeight: 1 }}>×</button>
              )}
            </span>
          ))}
          {detailCanEdit && activeProjects.some(p => !detail.projectIds.includes(p.id)) && (
            <ChipAddMenu label="+ Projekti" options={activeProjects.filter(p => !detail.projectIds.includes(p.id)).map(p => ({ id: String(p.id), label: p.t }))} onPick={id => updateDetail({ projectIds: [...detail.projectIds, Number(id)] })} />
          )}
          {detail.teamIds.map(tid => (
            <span key={tid} style={{
              fontSize: '.7rem', padding: '.25rem .55rem', borderRadius: 9999,
              background: teamColor(tid) + '22', color: teamColor(tid), fontWeight: 600,
              border: `1px solid ${teamColor(tid)}44`,
              display: 'inline-flex', alignItems: 'center', gap: '.3rem',
            }}>
              {teamName(tid)}
              {detailCanEdit && (
                <button onClick={() => updateDetail({ teamIds: detail.teamIds.filter(x => x !== tid) })} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '.8rem', padding: 0, lineHeight: 1 }}>×</button>
              )}
            </span>
          ))}
          {detailCanEdit && activeTeams.some(t => !detail.teamIds.includes(t.id)) && (
            <ChipAddMenu label="+ Tiimi" options={activeTeams.filter(t => !detail.teamIds.includes(t.id)).map(t => ({ id: t.id, label: t.name }))} onPick={id => updateDetail({ teamIds: [...detail.teamIds, id] })} />
          )}
        </div>

        {/* AI-triplex: Haasta / Tiivistä / Terävöitä */}
        {detailCanEdit && detail.content.trim().length > 20 && (
          <div style={{
            marginTop: '1.5rem', padding: '1rem 1.25rem',
            background: 'rgba(155,124,246,.04)', border: '1px solid rgba(155,124,246,.15)',
            borderRadius: 'var(--rl)',
          }}>
            <div style={{ fontSize: '.65rem', fontWeight: 700, color: '#9b7cf6', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '.5rem' }}>
              AI-sparraaja
            </div>
            <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', marginBottom: detail.aiChallenge || detail.aiDistilled || detail.aiRefineQuestions ? '.75rem' : 0 }}>
              <button className="btn btn-ghost btn-sm" disabled={aiWorking !== null} onClick={() => aiChallenge(detail)} style={{ fontSize: '.72rem', border: '1px solid rgba(155,124,246,.3)' }}>
                {aiWorking === 'haasta' ? 'Haastan...' : 'Haasta'}
              </button>
              <button className="btn btn-ghost btn-sm" disabled={aiWorking !== null} onClick={() => aiDistill(detail)} style={{ fontSize: '.72rem', border: '1px solid rgba(155,124,246,.3)' }}>
                {aiWorking === 'tiivistä' ? 'Tiivistän...' : 'Tiivistä ytimeen'}
              </button>
              <button className="btn btn-ghost btn-sm" disabled={aiWorking !== null} onClick={() => aiRefine(detail)} style={{ fontSize: '.72rem', border: '1px solid rgba(155,124,246,.3)' }}>
                {aiWorking === 'terävöitä' ? 'Pohdin...' : 'Terävöitä toimintaan'}
              </button>
            </div>
            {detail.aiDistilled && (
              <div style={{ marginTop: '.5rem', padding: '.75rem .9rem', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--r)' }}>
                <div style={{ fontSize: '.6rem', fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '.3rem' }}>Ytimessä</div>
                <div style={{ fontSize: '.85rem', lineHeight: 1.6, color: 'var(--t1)', whiteSpace: 'pre-wrap' }}>{detail.aiDistilled}</div>
              </div>
            )}
            {detail.aiChallenge && (
              <div style={{ marginTop: '.5rem', padding: '.75rem .9rem', background: 'var(--card)', border: '1px solid rgba(239,107,107,.25)', borderRadius: 'var(--r)' }}>
                <div style={{ fontSize: '.6rem', fontWeight: 700, color: 'var(--red)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '.3rem' }}>Haaste</div>
                <div style={{ fontSize: '.85rem', lineHeight: 1.7, color: 'var(--t1)', whiteSpace: 'pre-wrap' }}>{detail.aiChallenge}</div>
              </div>
            )}
            {detail.aiRefineQuestions && detail.aiRefineQuestions.length > 0 && (
              <div style={{ marginTop: '.5rem', padding: '.75rem .9rem', background: 'var(--card)', border: '1px solid rgba(45,212,160,.3)', borderRadius: 'var(--r)' }}>
                <div style={{ fontSize: '.6rem', fontWeight: 700, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '.3rem' }}>
                  Vastaa nämä ennen kuin tämä muuttuu projektiksi
                </div>
                <ol style={{ fontSize: '.85rem', lineHeight: 1.6, color: 'var(--t1)', paddingLeft: '1.25rem', margin: 0 }}>
                  {detail.aiRefineQuestions.map((q, i) => <li key={i} style={{ marginBottom: '.25rem' }}>{q}</li>)}
                </ol>
              </div>
            )}
          </div>
        )}

        {/* Conversion bridge */}
        {detailCanEdit && detail.content.trim().length > 10 && (
          <div style={{
            marginTop: '1.25rem', padding: '1rem 1.25rem',
            background: 'rgba(45,212,160,.05)', border: '1px solid rgba(45,212,160,.2)',
            borderRadius: 'var(--rl)',
          }}>
            <div style={{ fontSize: '.65rem', fontWeight: 700, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '.5rem' }}>
              Muuta toiminnaksi
            </div>
            <div style={{ fontSize: '.72rem', color: 'var(--t3)', marginBottom: '.6rem' }}>
              Idea ei kuole — se jää näkyviin syntyneelle projektille siemeneksi.
            </div>
            <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
              <button className="btn btn-secondary btn-sm" onClick={() => convertToTask(detail)} style={{ fontSize: '.75rem' }}>
                → Tehtäväksi
              </button>
              <button className="btn btn-primary btn-sm" onClick={() => convertToProject(detail)} style={{ fontSize: '.75rem' }}>
                → Projektiksi
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => convertToMeeting(detail)} style={{ fontSize: '.75rem' }}>
                → Palaveriksi
              </button>
            </div>
            {detail.conversions && detail.conversions.length > 0 && (
              <div style={{ marginTop: '.75rem', paddingTop: '.75rem', borderTop: '1px dashed rgba(45,212,160,.2)' }}>
                <div style={{ fontSize: '.62rem', fontWeight: 700, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '.3rem' }}>
                  Mihin tästä on syntynyt toimintaa
                </div>
                {detail.conversions.map((c, i) => (
                  <div key={i} style={{ fontSize: '.76rem', color: 'var(--t2)', padding: '.15rem 0' }}>
                    {c.type === 'task' ? '• Tehtävä' : c.type === 'project' ? '• Projekti' : '• Palaveri'}
                    {c.targetLabel ? `: ${c.targetLabel}` : ''} · {c.byName} · {relativeSaved(c.at)}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Comments — vain jaetuissa */}
        {detail.visibility === 'shared' && detail.stage !== 'luonnos' && (
          <CommentsThread
            note={detail}
            canComment={detailCanComment}
            currentUserName={myName}
            onAdd={(text) => addComment(detail.id, text)}
          />
        )}

        {detail.rawTranscription && (
          <details style={{ marginTop: '1rem', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '.5rem .75rem' }}>
            <summary style={{ cursor: 'pointer', fontSize: '.72rem', fontWeight: 700, color: 'var(--t2)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
              Raaka litterointi
            </summary>
            <div style={{ marginTop: '.5rem', fontSize: '.82rem', lineHeight: 1.6, whiteSpace: 'pre-wrap', color: 'var(--t2)' }}>
              {detail.rawTranscription}
            </div>
          </details>
        )}
      </AppShell>
    );
  }

  // ── List view ──
  const composerActive = composerOpen || pickerOpen;
  const sourceNoteForComposer = cSourceNoteId ? notes.find(n => n.id === cSourceNoteId) : null;
  const sourceProjectForComposer = cSourceProjectId ? projects.find(p => p.id === cSourceProjectId) : null;

  return (
    <AppShell title="Luomistila" subtitle="Tilaa luoda — sieltä toiminnaksi">
      {/* Creative-space header strip */}
      <div style={{
        background: CREATIVE_BG,
        margin: '-1rem -1rem 1.25rem',
        padding: isMobile ? '1rem 1rem .75rem' : '1.25rem 1.5rem 1rem',
        borderBottom: '1px solid var(--border)',
      }}>
        <p style={{
          fontFamily: 'var(--font-display), Georgia, serif',
          fontSize: isMobile ? '.88rem' : '.95rem',
          color: 'var(--t2)', lineHeight: 1.6, fontStyle: 'italic',
          maxWidth: 640, margin: 0,
        }}>
          Tämä on tila ideoiden ja luonnosten työstämiselle — kirjoittaen ja sanellen.
          Kun idea kypsyy, voit jakaa sen keskusteluun tai muuttaa tehtäväksi tai projektiksi.
        </p>
      </div>

      {canEdit && !composerActive && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '.5rem', marginBottom: '1.5rem' }}>
          <button
            onClick={() => kickOff({ kind: 'blank' })}
            className="btn btn-primary"
            style={{ fontSize: '.9rem', padding: '.6rem 1.4rem' }}
          >
            Uusi muistiinpano
          </button>
          <button
            onClick={() => setPickerOpen(true)}
            style={{
              background: 'none', border: 'none', color: 'var(--t3)',
              fontSize: '.75rem', cursor: 'pointer', fontFamily: 'inherit',
              padding: '.15rem .4rem',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--t1)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--t3)'; }}
          >
            Muut aloitustavat ▾
          </button>
        </div>
      )}

      {/* Herätä-valikko: 4 alkupistettä */}
      {pickerOpen && !composerOpen && (
        <div style={{
          background: 'var(--card)', border: '1px solid rgba(155,124,246,.3)',
          borderRadius: 'var(--rl)', padding: isMobile ? '1.25rem' : '1.5rem',
          marginBottom: '1.25rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <h3 style={{
              fontFamily: 'var(--font-display), Georgia, serif', fontSize: '1.05rem',
              fontWeight: 600, color: 'var(--t1)',
            }}>
              Mistä aloitat?
            </h3>
            <button onClick={() => setPickerOpen(false)} className="btn btn-ghost btn-sm" style={{ fontSize: '.7rem' }}>Sulje</button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', gap: '.75rem' }}>
            {/* Tyhjästä */}
            <KickoffTile
              title="Tyhjästä"
              hint="Avaa tyhjä sivu ja kirjoita tai sanele vapaasti."
              accent="#9b7cf6"
              onClick={() => kickOff({ kind: 'blank' })}
            />
            {/* Kysymyksestä */}
            <KickoffTile
              title="Kysymyksestä"
              hint="Valitse provosoiva avaus — kysymys jää näkyviin muistiinpanossa."
              accent="var(--yellow)"
              expandable
              renderExpanded={() => (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '.3rem', marginTop: '.5rem' }}>
                  {KICKOFF_QUESTIONS.map(q => (
                    <button
                      key={q}
                      onClick={() => kickOff({ kind: 'question', question: q })}
                      style={{
                        textAlign: 'left', padding: '.5rem .7rem',
                        background: 'var(--elev)', border: '1px solid var(--border)',
                        borderRadius: 'var(--r)', cursor: 'pointer',
                        fontSize: '.82rem', color: 'var(--t1)',
                        fontFamily: 'var(--font-display), Georgia, serif', fontStyle: 'italic',
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--yellow)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}
                    >
                      "{q}"
                    </button>
                  ))}
                </div>
              )}
            />
            {/* Olemassa olevasta projektista */}
            <KickoffTile
              title="Olemassa olevasta"
              hint="Valitse projekti — linssi ohjaa huomion siihen mikä tarvitsee uutta."
              accent="var(--pri)"
              disabled={activeProjects.length === 0}
              disabledHint="Ei projekteja vielä."
              expandable
              renderExpanded={() => (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '.4rem', marginTop: '.5rem' }}>
                  {activeProjects.slice(0, 10).map(p => (
                    <div key={p.id} style={{ display: 'flex', flexDirection: 'column', gap: '.25rem' }}>
                      <div style={{ fontSize: '.75rem', fontWeight: 700, color: 'var(--t1)' }}>{p.t}</div>
                      <div style={{ display: 'flex', gap: '.25rem', flexWrap: 'wrap' }}>
                        {PROJECT_LENSES.map(lens => (
                          <button
                            key={lens}
                            onClick={() => kickOff({ kind: 'project', projectId: p.id, lens })}
                            style={{
                              fontSize: '.68rem', padding: '.2rem .5rem', borderRadius: 9999,
                              background: 'rgba(5,107,159,.08)', color: 'var(--pri-l)',
                              border: '1px solid rgba(5,107,159,.2)', cursor: 'pointer',
                              fontFamily: 'inherit', fontStyle: 'italic',
                            }}
                          >
                            {lens}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            />
            {/* Toisen ideasta */}
            <KickoffTile
              title="Toisen ideasta"
              hint="Valitse olemassa oleva muistiinpano ja jatka siitä."
              accent="var(--green)"
              disabled={activeNotes.length === 0}
              disabledHint="Ei vielä ideoita jatkettavaksi."
              expandable
              renderExpanded={() => (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '.3rem', marginTop: '.5rem', maxHeight: 240, overflowY: 'auto' }}>
                  {activeNotes.slice(0, 20).map(n => (
                    <button
                      key={n.id}
                      onClick={() => kickOff({ kind: 'note', noteId: n.id })}
                      style={{
                        textAlign: 'left', padding: '.45rem .6rem',
                        background: 'var(--elev)', border: '1px solid var(--border)',
                        borderRadius: 'var(--r)', cursor: 'pointer',
                        fontSize: '.78rem', color: 'var(--t1)',
                        display: 'flex', flexDirection: 'column', gap: '.15rem',
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--green)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}
                    >
                      <span style={{ fontWeight: 600 }}>{n.title || 'Nimetön'}</span>
                      <span style={{ fontSize: '.68rem', color: 'var(--t3)' }}>
                        {stageLabel(n.stage)} · {n.ownerName}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            />
          </div>
        </div>
      )}

      {/* Composer (after kick-off chosen) */}
      {composerOpen && (
        <div style={{
          background: 'var(--elev)', border: '1px solid var(--border)',
          borderRadius: 'var(--rl)',
          padding: isMobile ? '1.25rem 1.25rem 1rem' : '2rem 2.5rem 1.25rem',
          marginBottom: '1.5rem',
          maxWidth: 760, marginLeft: 'auto', marginRight: 'auto',
          boxShadow: '0 1px 2px rgba(0,0,0,.3), 0 8px 24px rgba(0,0,0,.25)',
        }}>
          {/* Source hint — "mistä tämä lähti" */}
          {(cSourceQuestion || sourceNoteForComposer || sourceProjectForComposer) && (
            <div style={{ fontSize: '.72rem', color: 'var(--t3)', marginBottom: '.5rem', fontStyle: 'italic' }}>
              {cSourceQuestion && <>Lähtökysymys: <span style={{ color: '#9b7cf6', fontFamily: 'var(--font-display), Georgia, serif' }}>"{cSourceQuestion}"</span></>}
              {sourceProjectForComposer && <>Projektista: <strong style={{ color: 'var(--pri-l)' }}>{sourceProjectForComposer.t}</strong></>}
              {sourceNoteForComposer && <>Jatkoa: <strong style={{ color: 'var(--green)' }}>{sourceNoteForComposer.title || 'Nimetön'}</strong></>}
            </div>
          )}

          <input
            value={cTitle}
            onChange={e => onCTitle(e.target.value)}
            placeholder="Otsikko (valinnainen)"
            style={{
              width: '100%', background: 'transparent', border: 'none', outline: 'none',
              fontFamily: 'var(--font-display), Georgia, serif',
              fontSize: isMobile ? '1.25rem' : '1.75rem',
              fontWeight: 600, color: 'var(--t1)',
              padding: '.25rem 0 .5rem', letterSpacing: '-.015em',
              marginBottom: '.25rem',
            }}
          />
          <textarea
            ref={composerRef}
            value={cContent}
            onChange={e => onCContent(e.target.value)}
            placeholder={cSourceQuestion ? 'Vastaa kysymykseen tai kirjoita vapaasti…' : 'Aloita kirjoittaminen — kaikki tallentuu automaattisesti. Esc sulkee.'}
            rows={10}
            onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); finishComposer(); } }}
            style={{
              width: '100%', background: 'transparent', border: 'none', outline: 'none',
              fontSize: '1rem', lineHeight: 1.8, color: 'var(--t1)',
              fontFamily: 'inherit', resize: 'vertical', minHeight: 320,
              padding: '.25rem 0',
            }}
          />

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.35rem', alignItems: 'center', marginTop: '1.25rem', paddingTop: '.65rem', borderTop: '1px solid rgba(255,255,255,.04)' }}>
            <button
              type="button"
              onClick={toggleCVis}
              style={{
                fontSize: '.68rem', padding: '.25rem .55rem', borderRadius: 9999,
                background: cVis === 'private' ? 'rgba(241,180,52,.15)' : 'rgba(45,212,160,.15)',
                color: cVis === 'private' ? 'var(--yellow)' : 'var(--green)',
                border: `1px solid ${cVis === 'private' ? 'var(--yellow)' : 'var(--green)'}44`,
                fontWeight: 700, cursor: 'pointer',
              }}
            >
              {cVis === 'private' ? 'Yksityinen' : 'Jaettu'}
            </button>

            {cProjects.map(pid => (
              <span key={pid} style={{ fontSize: '.68rem', padding: '.25rem .5rem', borderRadius: 9999, background: 'rgba(5,107,159,.12)', color: 'var(--pri-l)', fontWeight: 600, display: 'inline-flex', gap: '.25rem', alignItems: 'center' }}>
                {projectName(pid)}
                <button onClick={() => toggleCProject(pid)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '.75rem', padding: 0, lineHeight: 1 }}>×</button>
              </span>
            ))}
            {activeProjects.some(p => !cProjects.includes(p.id)) && (
              <ChipAddMenu label="+ Projekti" options={activeProjects.filter(p => !cProjects.includes(p.id)).map(p => ({ id: String(p.id), label: p.t }))} onPick={id => toggleCProject(Number(id))} />
            )}
            {cTeams.map(tid => (
              <span key={tid} style={{ fontSize: '.68rem', padding: '.25rem .5rem', borderRadius: 9999, background: teamColor(tid) + '22', color: teamColor(tid), fontWeight: 600, border: `1px solid ${teamColor(tid)}44`, display: 'inline-flex', gap: '.25rem', alignItems: 'center' }}>
                {teamName(tid)}
                <button onClick={() => toggleCTeam(tid)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '.75rem', padding: 0, lineHeight: 1 }}>×</button>
              </span>
            ))}
            {activeTeams.some(t => !cTeams.includes(t.id)) && (
              <ChipAddMenu label="+ Tiimi" options={activeTeams.filter(t => !cTeams.includes(t.id)).map(t => ({ id: t.id, label: t.name }))} onPick={id => toggleCTeam(id)} />
            )}

            <div style={{ flex: 1 }} />

            {!isRecording && recordingTarget !== 'composer' && !transcribing && (
              <button type="button" onClick={() => startRec('composer')} className="btn btn-ghost btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '.3rem', fontSize: '.7rem' }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--red)' }} />
                Sanele
              </button>
            )}
            {isRecording && recordingTarget === 'composer' && (
              <>
                <span style={{ fontSize: '.7rem', color: 'var(--red)', fontWeight: 600 }}>{fmtTime(recordingTime)}</span>
                <button type="button" className="btn btn-primary btn-sm" style={{ fontSize: '.7rem' }} onClick={handleStopAndTranscribe}>Lopeta</button>
              </>
            )}
            {transcribing && recordingTarget === 'composer' && <span style={{ fontSize: '.7rem', color: 'var(--pri)' }}>Litteroidaan…</span>}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginTop: '.35rem' }}>
            <span style={{ fontSize: '.66rem', color: 'var(--t3)', fontStyle: 'italic' }}>
              {cSavedAt ? `Tallennettu ${relativeSaved(cSavedAt)}` : 'Tallentuu automaattisesti ensimmäisestä merkistä'}
            </span>
            <div style={{ flex: 1 }} />
            {draftId && (cTitle.trim() || cContent.trim()) && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeNote(draftId)} style={{ color: 'var(--red)', fontSize: '.7rem' }}>
                Poista
              </button>
            )}
            <button type="button" className="btn btn-primary btn-sm" onClick={finishComposer} style={{ fontSize: '.7rem' }}>
              Valmis luonnokseksi
            </button>
          </div>
        </div>
      )}

      {/* Filter bar */}
      {(activeNotes.length > 0 || filterProject !== 'all' || filterStage !== 'all' || search) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.4rem', alignItems: 'center', marginBottom: '1rem' }}>
          <input
            placeholder="Hae ideoista…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ flex: '1 1 200px', fontSize: '.78rem', padding: '.3rem .55rem', background: 'var(--elev)', border: '1px solid var(--border)', borderRadius: 'var(--r)', color: 'var(--t1)', outline: 'none' }}
          />
          <select value={filterProject === 'all' ? 'all' : String(filterProject)} onChange={e => setFilterProject(e.target.value === 'all' ? 'all' : Number(e.target.value))} style={{ fontSize: '.72rem', padding: '.3rem .4rem', background: 'var(--elev)', border: '1px solid var(--border)', borderRadius: 'var(--r)', color: 'var(--t1)' }}>
            <option value="all">Kaikki projektit</option>
            {activeProjects.map(p => <option key={p.id} value={p.id}>{p.t}</option>)}
          </select>
          <select value={filterStage} onChange={e => setFilterStage(e.target.value as NoteStage | 'all')} style={{ fontSize: '.72rem', padding: '.3rem .4rem', background: 'var(--elev)', border: '1px solid var(--border)', borderRadius: 'var(--r)', color: 'var(--t1)' }}>
            <option value="all">Kaikki vaiheet</option>
            <option value="luonnos">Luonnokset</option>
            <option value="keskustelussa">Keskustelussa</option>
            <option value="valmis">Valmiit</option>
          </select>
          {(filterProject !== 'all' || filterStage !== 'all' || search) && (
            <button onClick={() => { setFilterProject('all'); setFilterStage('all'); setSearch(''); router.replace(`/${orgSlug}/muistiinpanot-projekti`); }} style={{ fontSize: '.7rem', padding: '.3rem .55rem', background: 'transparent', border: 'none', color: 'var(--t3)', cursor: 'pointer' }}>
              Tyhjennä
            </button>
          )}
        </div>
      )}

      {/* Empty state */}
      {filtered.length === 0 && !composerActive && (
        <div style={{ textAlign: 'center', padding: '3rem 1.5rem', color: 'var(--t3)', border: '1px dashed var(--border)', borderRadius: 'var(--rl)' }}>
          {activeNotes.length === 0 ? (
            <>
              <p style={{ fontFamily: 'var(--font-display), Georgia, serif', fontSize: '1.05rem', color: 'var(--t2)', marginBottom: '.75rem', fontStyle: 'italic' }}>
                Täällä ei ole vielä yhtään ideaa.
              </p>
              <p style={{ fontSize: '.82rem', lineHeight: 1.7, maxWidth: 480, margin: '0 auto' }}>
                Aloita "Aloita uusi idea…" -napista ylhäällä. Voit valita tyhjän sivun,
                provosoivan kysymyksen, olemassa olevan projektin linssin tai jatkaa jonkun toisen ideasta.
              </p>
            </>
          ) : (
            <p style={{ fontSize: '.88rem' }}>Ei ideoita valituilla suodattimilla.</p>
          )}
        </div>
      )}

      {/* Three stage columns */}
      {filtered.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: '1rem' }}>
          <StageColumn label="Luonnokset" stage="luonnos" notes={byStage.luonnos} onOpen={setSelectedId} projectName={projectName} teamName={teamName} teamColor={teamColor} uid={uid} />
          <StageColumn label="Keskustelussa" stage="keskustelussa" notes={byStage.keskustelussa} onOpen={setSelectedId} projectName={projectName} teamName={teamName} teamColor={teamColor} uid={uid} />
          <StageColumn label="Valmiit" stage="valmis" notes={byStage.valmis} onOpen={setSelectedId} projectName={projectName} teamName={teamName} teamColor={teamColor} uid={uid} />
        </div>
      )}
    </AppShell>
  );
}

// ═════════════════════════════════════════════════════════
// Subcomponents
// ═════════════════════════════════════════════════════════

function KickoffTile({
  title, hint, accent, onClick, disabled, disabledHint, expandable, renderExpanded,
}: {
  title: string;
  hint: string;
  accent: string;
  onClick?: () => void;
  disabled?: boolean;
  disabledHint?: string;
  expandable?: boolean;
  renderExpanded?: () => React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const handleClick = () => {
    if (disabled) return;
    if (expandable) setExpanded(x => !x);
    else onClick?.();
  };
  return (
    <div style={{
      background: 'var(--elev)',
      border: `1px solid ${expanded ? accent : 'var(--border)'}`,
      borderLeft: `3px solid ${accent}`,
      borderRadius: 'var(--rl)',
      padding: '.9rem 1.1rem',
      cursor: disabled ? 'default' : 'pointer',
      opacity: disabled ? 0.5 : 1,
      transition: 'border-color .15s, background .15s',
    }}
    onClick={handleClick}
    onMouseEnter={e => { if (!disabled && !expanded) (e.currentTarget as HTMLElement).style.borderColor = accent; }}
    onMouseLeave={e => { if (!disabled && !expanded) (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}
    >
      <div style={{ fontFamily: 'var(--font-display), Georgia, serif', fontSize: '.95rem', fontWeight: 600, color: 'var(--t1)', marginBottom: '.2rem' }}>
        {title} {expandable && <span style={{ fontSize: '.7rem', color: 'var(--t3)', marginLeft: '.25rem' }}>{expanded ? '▲' : '▼'}</span>}
      </div>
      <div style={{ fontSize: '.76rem', color: 'var(--t3)', lineHeight: 1.5 }}>
        {disabled ? (disabledHint || hint) : hint}
      </div>
      {expandable && expanded && !disabled && renderExpanded && (
        <div onClick={e => e.stopPropagation()}>{renderExpanded()}</div>
      )}
    </div>
  );
}

function StageColumn({
  label, stage, notes, onOpen, projectName, teamName, teamColor, uid,
}: {
  label: string;
  stage: NoteStage;
  notes: ProjectNote[];
  onOpen: (id: string) => void;
  projectName: (id: number) => string;
  teamName: (id: string) => string;
  teamColor: (id: string) => string;
  uid: string;
}) {
  const col = stageColor(stage);
  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 'var(--rl)', minHeight: 200,
      borderTop: `3px solid ${col.fg}`,
    }}>
      <div style={{ padding: '.75rem 1rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{
          fontFamily: 'var(--font-display), Georgia, serif', fontSize: '.85rem',
          fontWeight: 600, color: col.fg,
          textTransform: 'uppercase', letterSpacing: '.06em',
        }}>
          {label}
        </h3>
        <span style={{ fontSize: '.72rem', color: 'var(--t3)' }}>{notes.length}</span>
      </div>
      <div style={{ padding: '.6rem', display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
        {notes.length === 0 && (
          <div style={{ fontSize: '.72rem', color: 'var(--t3)', padding: '1rem', fontStyle: 'italic', textAlign: 'center' }}>
            Ei vielä
          </div>
        )}
        {notes.map(n => {
          const isMine = n.ownerId === uid;
          const isPrivate = n.visibility === 'private';
          const excerpt = n.content.replace(/\s+/g, ' ').slice(0, 120);
          return (
            <div
              key={n.id}
              onClick={() => onOpen(n.id)}
              style={{
                background: 'var(--elev)', border: '1px solid var(--border)', borderRadius: 'var(--r)',
                padding: '.65rem .85rem', cursor: 'pointer',
                transition: 'border-color .15s, background .15s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = col.fg; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}
            >
              <div style={{
                fontFamily: 'var(--font-display), Georgia, serif',
                fontSize: '.88rem', fontWeight: 600, color: 'var(--t1)',
                marginBottom: '.15rem', letterSpacing: '-.005em',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {n.title || <span style={{ color: 'var(--t3)', fontStyle: 'italic' }}>Nimetön</span>}
              </div>
              {n.sourceQuestion && (
                <div style={{ fontSize: '.65rem', fontStyle: 'italic', color: '#9b7cf6', marginBottom: '.2rem', fontFamily: 'var(--font-display), Georgia, serif' }}>
                  "{n.sourceQuestion.slice(0, 60)}{n.sourceQuestion.length > 60 ? '…' : ''}"
                </div>
              )}
              {excerpt && (
                <div style={{ fontSize: '.72rem', color: 'var(--t2)', lineHeight: 1.5, marginBottom: '.25rem', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {excerpt}{n.content.length > 120 ? '…' : ''}
                </div>
              )}
              <div style={{ display: 'flex', gap: '.25rem', flexWrap: 'wrap', alignItems: 'center' }}>
                {!isMine && <span style={{ fontSize: '.6rem', color: 'var(--t3)' }}>{n.ownerName}</span>}
                {isPrivate && (
                  <span style={{ fontSize: '.56rem', padding: '.08rem .35rem', borderRadius: 9999, background: 'rgba(241,180,52,.15)', color: 'var(--yellow)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                    Yksityinen
                  </span>
                )}
                {n.projectIds.slice(0, 2).map(pid => (
                  <span key={pid} style={{ fontSize: '.58rem', padding: '.08rem .35rem', borderRadius: 9999, background: 'rgba(5,107,159,.1)', color: 'var(--pri-l)', fontWeight: 600 }}>
                    {projectName(pid)}
                  </span>
                ))}
                {n.teamIds.slice(0, 1).map(tid => (
                  <span key={tid} style={{ fontSize: '.58rem', padding: '.08rem .35rem', borderRadius: 9999, background: teamColor(tid) + '22', color: teamColor(tid), fontWeight: 600 }}>
                    {teamName(tid)}
                  </span>
                ))}
                {n.comments && n.comments.length > 0 && (
                  <span style={{ fontSize: '.6rem', color: 'var(--t3)', marginLeft: 'auto' }}>
                    {n.comments.length} kommenttia
                  </span>
                )}
                {n.conversions && n.conversions.length > 0 && (
                  <span style={{ fontSize: '.58rem', padding: '.08rem .35rem', borderRadius: 9999, background: 'rgba(45,212,160,.15)', color: 'var(--green)', fontWeight: 700 }}>
                    → {n.conversions.length}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CommentsThread({ note, canComment, currentUserName, onAdd }: {
  note: ProjectNote;
  canComment: boolean;
  currentUserName: string;
  onAdd: (text: string) => void;
}) {
  const [text, setText] = useState('');
  const comments = note.comments || [];
  return (
    <div style={{
      marginTop: '1.5rem', background: 'var(--card)',
      border: '1px solid var(--border)', borderRadius: 'var(--rl)',
      padding: '1rem 1.25rem',
    }}>
      <div style={{ fontSize: '.65rem', fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '.5rem' }}>
        Kommentit ({comments.length})
      </div>
      {comments.length === 0 && (
        <div style={{ fontSize: '.78rem', color: 'var(--t3)', fontStyle: 'italic', marginBottom: '.75rem' }}>
          Ei vielä kommentteja. {canComment && 'Kerro mitä ajattelet.'}
        </div>
      )}
      {comments.map(c => (
        <div key={c.id} style={{ display: 'flex', gap: '.6rem', marginBottom: '.7rem' }}>
          <div style={{
            width: 30, height: 30, borderRadius: '50%',
            background: c.authorName === currentUserName ? 'var(--pri)' : 'var(--elev)',
            color: c.authorName === currentUserName ? '#fff' : 'var(--t1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '.75rem', fontWeight: 700, flexShrink: 0,
          }}>
            {(c.authorName || '?')[0]}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', gap: '.4rem', alignItems: 'baseline' }}>
              <span style={{ fontSize: '.78rem', fontWeight: 600 }}>{c.authorName}</span>
              <span style={{ fontSize: '.65rem', color: 'var(--t3)' }}>{relativeSaved(c.createdAt)}</span>
            </div>
            <div style={{ fontSize: '.82rem', lineHeight: 1.6, color: 'var(--t1)', whiteSpace: 'pre-wrap' }}>
              {c.text}
            </div>
          </div>
        </div>
      ))}
      {canComment && (
        <div style={{ display: 'flex', gap: '.5rem', marginTop: '.75rem' }}>
          <input
            className="input"
            placeholder="Kirjoita kommentti…"
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && text.trim()) { onAdd(text); setText(''); } }}
            style={{ flex: 1, fontSize: '.82rem' }}
          />
          <button className="btn btn-primary btn-sm" onClick={() => { if (text.trim()) { onAdd(text); setText(''); } }} disabled={!text.trim()}>
            Kommentoi
          </button>
        </div>
      )}
    </div>
  );
}

function ChipAddMenu({ label, options, onPick }: {
  label: string;
  options: { id: string; label: string }[];
  onPick: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button type="button" onClick={() => setOpen(v => !v)} style={{ fontSize: '.68rem', padding: '.25rem .55rem', borderRadius: 9999, background: 'transparent', color: 'var(--t3)', border: '1px dashed var(--border)', fontWeight: 600, cursor: 'pointer' }}>
        {label}
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 20, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--r)', boxShadow: '0 8px 24px rgba(0,0,0,.3)', minWidth: 180, maxHeight: 260, overflowY: 'auto', padding: '.3rem' }}>
          {options.map(o => (
            <button
              key={o.id}
              onClick={() => { onPick(o.id); setOpen(false); }}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '.35rem .5rem', background: 'transparent', border: 'none', borderRadius: 'var(--r)', fontSize: '.75rem', color: 'var(--t1)', cursor: 'pointer' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--elev)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
