// Project-linked notes — creative notes space with three stages:
//   luonnos (private draft) → keskustelussa (shared + commentable) → valmis (converted to action)
// Distinct from meetingNotes (which are meeting-specific with attendees/actions).

export interface NoteNode {
  id: string;
  text: string;
  x?: number;
  y?: number;
  color?: string;
  parentId?: string | null;
}

export interface NoteEdge {
  from: string;
  to: string;
  label?: string;
}

export type NoteMode = 'text' | 'mindmap';
export type NoteVisibility = 'private' | 'shared';
export type NoteStage = 'luonnos' | 'keskustelussa' | 'valmis';

export interface NoteComment {
  id: string;
  authorId: string;
  authorName: string;
  text: string;
  createdAt: number;
}

export interface NoteConversion {
  type: 'task' | 'project' | 'meeting';
  targetId: string | number;
  targetLabel?: string;
  at: number;
  by: string;          // user uid who converted
  byName: string;
}

// Open-ended prompts shown in the "Herätä" picker.
export const KICKOFF_QUESTIONS: string[] = [
  'Mitä ongelmaa yritän ratkaista?',
  'Kenelle tämä on tärkeää — ja miksi?',
  'Mitä tapahtuisi jos tekisimme päinvastoin?',
  'Mikä tässä ärsyttää minua itseäni?',
  'Mikä on pienin mahdollinen ensimmäinen versio?',
  'Kenen kanssa tämän voisi tehdä yhdessä?',
  'Mitä jos rahaa olisi rajattomasti — mitä jos ei lainkaan?',
  'Mitä en ole vielä uskaltanut ehdottaa?',
  'Mitä jokin muu ala tekisi tässä tilanteessa?',
  'Mikä on se yksi asia jonka jos tekisimme hyvin, muu ei enää ratkaisisi?',
];

export interface ProjectNote {
  id: string;
  title: string;
  content: string;
  mode: NoteMode;
  nodes?: NoteNode[];
  edges?: NoteEdge[];

  // Creative lifecycle
  stage: NoteStage;

  // Kickoff context — where this note started from (Herätä-vaihe)
  sourceQuestion?: string;     // valittu tai kirjoitettu kysymys
  sourceProjectId?: number;    // jos käynnistyi olemassa olevasta projektista
  sourceNoteId?: string;       // jos käynnistyi toisen muistiinpanon jatkoksi

  // Linkitykset
  projectIds: number[];
  teamIds: string[];
  linkedNoteIds?: string[];    // klusterit — liittyy toisiin muistiinpanoihin

  // Yksityisyys
  visibility: NoteVisibility;
  ownerId: string;
  ownerName: string;

  // Kommentointi (käytössä kun stage === 'keskustelussa' tai 'valmis')
  comments?: NoteComment[];

  // Muunnokset — mihin tästä on syntynyt toimintaa
  conversions?: NoteConversion[];

  // AI-apuna — talletetaan viimeisimmät haasta/tiivistä-vastaukset
  aiChallenge?: string;
  aiDistilled?: string;
  aiRefineQuestions?: string[]; // "Terävöitä": 3 kysymystä joihin on vastattava

  // Sanelu
  rawTranscription?: string;
  cleanTranscription?: string;

  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export const canViewNote = (note: ProjectNote, uid: string): boolean =>
  note.visibility === 'shared' || note.ownerId === uid;

export const canEditNote = (note: ProjectNote, uid: string): boolean =>
  note.ownerId === uid;

export const canCommentOnNote = (note: ProjectNote, uid: string): boolean =>
  note.visibility === 'shared' && note.stage !== 'luonnos' && canViewNote(note, uid);

export const filterVisible = (notes: ProjectNote[], uid: string): ProjectNote[] =>
  notes.filter(n => canViewNote(n, uid));

export const filterByProject = (notes: ProjectNote[], projectId: number): ProjectNote[] =>
  notes.filter(n => n.projectIds.includes(projectId));

export const filterByTeam = (notes: ProjectNote[], teamId: string): ProjectNote[] =>
  notes.filter(n => n.teamIds.includes(teamId));

export const stageLabel = (s: NoteStage): string =>
  s === 'luonnos' ? 'Luonnos' : s === 'keskustelussa' ? 'Keskustelussa' : 'Valmis';

export const stageColor = (s: NoteStage): { bg: string; fg: string } =>
  s === 'luonnos'       ? { bg: 'rgba(241,180,52,.15)', fg: 'var(--yellow)' }
: s === 'keskustelussa' ? { bg: 'rgba(155,124,246,.15)', fg: '#9b7cf6' }
:                         { bg: 'rgba(45,212,160,.15)', fg: 'var(--green)' };

export function createEmptyNote(
  ownerId: string,
  ownerName: string,
  overrides: Partial<ProjectNote> = {}
): ProjectNote {
  const now = Date.now();
  return {
    id: 'pn_' + now + '_' + Math.random().toString(36).slice(2, 8),
    title: '',
    content: '',
    mode: 'text',
    stage: 'luonnos',
    projectIds: [],
    teamIds: [],
    visibility: 'private',
    ownerId,
    ownerName,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

export function createRootNode(text = 'Keskussolmu'): NoteNode {
  return {
    id: 'n_' + Date.now(),
    text,
    parentId: null,
    x: 0,
    y: 0,
  };
}

export function createChildNode(parentId: string, text = ''): NoteNode {
  return {
    id: 'n_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    text,
    parentId,
  };
}

export function createComment(authorId: string, authorName: string, text: string): NoteComment {
  return {
    id: 'c_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    authorId,
    authorName,
    text: text.trim(),
    createdAt: Date.now(),
  };
}
