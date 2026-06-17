// Käsikirjoitusmoduulin jaetut tyypit ja logiikka (Hetki Film Company).
// Eristetty omaksi kerrokseksi ilman riippuvuuksia muihin Momentum-moduuleihin,
// jotta moduuli on tarvittaessa irrotettavissa omaksi sovellukseksi.
//
// Firestore-avaimet (org-skoopattu, useOrgData):
//   screenplays                  → ScreenplayMeta[]   (indeksi listanäkymälle)
//   screenplay_doc_{id}          → ScreenplayDoc      (elementit + muistiinpanot)
//   screenplay_versions_{id}     → ScreenplayVersion[] (snapshotit, kokorajattu)

export type ScreenplayElementType =
  | 'scene'
  | 'action'
  | 'character'
  | 'dialogue'
  | 'parenthetical'
  | 'transition';

export interface ScreenplayElement {
  id: string;
  type: ScreenplayElementType;
  text: string;
}

export interface ScreenplayMeta {
  id: string;
  title: string;
  author: string;
  logline?: string;
  contact?: string;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
  // Välimuisti listanäkymää varten — editori päivittää tallennuksen yhteydessä
  pageCount?: number;
  sceneCount?: number;
}

export interface ScreenplayDoc {
  elements: ScreenplayElement[];
  // Kohtauskohtaiset muistiinpanot, avain = kohtauselementin id
  sceneNotes: Record<string, string>;
  // Hahmokortin lisätiedot, avain = normalisoitu hahmon nimi
  characterMeta: Record<string, { description?: string }>;
}

export interface ScreenplayVersion {
  id: string;
  name: string;
  colorId: string; // REVISION_COLORS id
  createdAt: number;
  pageCount: number;
  elements: ScreenplayElement[];
}

// ── Perusvakiot ───────────────────────────────────────────────────────────────

export const ELEMENT_TYPE_CYCLE: ScreenplayElementType[] = [
  'scene', 'action', 'character', 'dialogue', 'parenthetical', 'transition',
];

export const ELEMENT_LABELS: Record<ScreenplayElementType, string> = {
  scene: 'Kohtausotsikko',
  action: 'Toiminta',
  character: 'Hahmo',
  dialogue: 'Dialogi',
  parenthetical: 'Sulkuhuomautus',
  transition: 'Siirtymä',
};

// Mihin elementtityyppiin Enter siirtyy (alan vakiokäytäntö)
export const NEXT_ON_ENTER: Record<ScreenplayElementType, ScreenplayElementType> = {
  scene: 'action',
  action: 'action',
  character: 'dialogue',
  dialogue: 'character',
  parenthetical: 'dialogue',
  transition: 'scene',
};

// Käsikirjoituksen vakiomitoitus Courier 12pt:llä (10 merkkiä/tuuma, 6 riviä/tuuma).
// indent ja width merkkeinä tekstialueen vasemmasta reunasta (1,5" sivun reunasta).
export interface ElementLayout {
  indent: number;
  width: number;
  upper?: boolean;
  align?: 'left' | 'right';
  blankBefore: number; // tyhjiä rivejä ennen elementtiä
}

export const ELEMENT_LAYOUT: Record<ScreenplayElementType, ElementLayout> = {
  scene:         { indent: 0,  width: 60, upper: true, blankBefore: 2 },
  action:        { indent: 0,  width: 60, blankBefore: 1 },
  character:     { indent: 22, width: 33, upper: true, blankBefore: 1 },
  dialogue:      { indent: 10, width: 35, blankBefore: 0 },
  parenthetical: { indent: 16, width: 25, blankBefore: 0 },
  transition:    { indent: 0,  width: 60, upper: true, align: 'right', blankBefore: 1 },
};

export const LINES_PER_PAGE = 55;

// Hollywood-revisioväriket suomeksi (vakiokierto)
export const REVISION_COLORS: { id: string; label: string; css: string }[] = [
  { id: 'valkoinen',      label: 'Valkoinen',      css: '#FFFFFF' },
  { id: 'sininen',        label: 'Sininen',        css: '#AECBE8' },
  { id: 'pinkki',         label: 'Pinkki',         css: '#F3BCCB' },
  { id: 'keltainen',      label: 'Keltainen',      css: '#F2E3A2' },
  { id: 'vihrea',         label: 'Vihreä',         css: '#BFDBB5' },
  { id: 'kullankeltainen', label: 'Kullankeltainen', css: '#E5C26B' },
  { id: 'beige',          label: 'Beige',          css: '#E3D5B8' },
  { id: 'lohi',           label: 'Lohi',           css: '#F0BFA8' },
  { id: 'kirsikka',       label: 'Kirsikka',       css: '#D98A9C' },
];

export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function emptyDoc(): ScreenplayDoc {
  return {
    elements: [{ id: newId('el'), type: 'scene', text: '' }],
    sceneNotes: {},
    characterMeta: {},
  };
}

// ── Automaattinen tyypintunnistus ────────────────────────────────────────────

const SCENE_RE = /^(INT|EXT|INT\/EXT|EXT\/INT|I\/E)[ .\/]/i;
const TRANSITION_RE = /^(CUT TO:|FADE IN|FADE OUT|FADE TO|DISSOLVE TO:|SMASH CUT|MATCH CUT|LEIKKAUS)/i;

/** Tunnistaa toimintarivistä kohtausotsikon tai siirtymän kirjoitetun tekstin perusteella. */
export function detectAutoType(text: string): ScreenplayElementType | null {
  if (SCENE_RE.test(text)) return 'scene';
  if (TRANSITION_RE.test(text)) return 'transition';
  return null;
}

// ── Tekstin rivitys ja paginointi ────────────────────────────────────────────

export function wrapText(text: string, width: number): string[] {
  const out: string[] = [];
  for (const raw of text.split('\n')) {
    if (raw.length <= width) { out.push(raw); continue; }
    const words = raw.split(' ');
    let line = '';
    for (const w of words) {
      if (line === '') {
        line = w;
      } else if (line.length + 1 + w.length <= width) {
        line += ' ' + w;
      } else {
        out.push(line);
        line = w;
      }
      // Pilko ylipitkät sanat väkisin
      while (line.length > width) {
        out.push(line.slice(0, width));
        line = line.slice(width);
      }
    }
    out.push(line);
  }
  return out.length ? out : [''];
}

export interface PrintLine {
  elId: string;
  type: ScreenplayElementType | 'blank';
  text: string;
}

export interface PaginationResult {
  pages: PrintLine[][];
  pageOfElement: Record<string, number>; // elId → sivunumero (1-pohjainen)
  pageCount: number;
}

/**
 * Jakaa elementit sivuiksi (55 riviä/sivu, Courier 12pt -mitoitus).
 * Kohtausotsikkoa tai hahmon nimeä ei jätetä orvoksi sivun loppuun.
 */
export function paginate(elements: ScreenplayElement[]): PaginationResult {
  const pages: PrintLine[][] = [];
  const pageOfElement: Record<string, number> = {};
  let current: PrintLine[] = [];

  const pushPage = () => {
    if (current.length) pages.push(current);
    current = [];
  };

  // Rakennetaan elementtikohtaiset rivilohkot
  interface Block { elId: string; type: ScreenplayElementType; lines: string[]; blankBefore: number; keepWithNext: boolean; }
  const blocks: Block[] = [];
  for (const el of elements) {
    if (el.text.trim() === '') continue; // tyhjät elementit ohitetaan printistä
    const layout = ELEMENT_LAYOUT[el.type];
    const text = layout.upper ? el.text.toUpperCase() : el.text;
    blocks.push({
      elId: el.id,
      type: el.type,
      lines: wrapText(text, layout.width),
      blankBefore: layout.blankBefore,
      keepWithNext: el.type === 'scene' || el.type === 'character' || el.type === 'parenthetical',
    });
  }

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const blank = current.length === 0 ? 0 : b.blankBefore;
    // Paljonko tilaa lohko tarvitsee, jotta se ei jää orvoksi:
    // keep-with-next -lohkot tarvitsevat perään vähintään yhden seuraavan lohkon rivin.
    const nextNeed = b.keepWithNext && i + 1 < blocks.length
      ? (i + 1 < blocks.length ? blocks[i + 1].blankBefore + 1 : 0)
      : 0;
    const need = blank + b.lines.length + nextNeed;

    if (current.length > 0 && current.length + need > LINES_PER_PAGE) {
      pushPage();
    }
    const actualBlank = current.length === 0 ? 0 : b.blankBefore;
    for (let k = 0; k < actualBlank; k++) current.push({ elId: b.elId, type: 'blank', text: '' });
    pageOfElement[b.elId] = pages.length + 1;
    for (const line of b.lines) {
      if (current.length >= LINES_PER_PAGE) pushPage();
      current.push({ elId: b.elId, type: b.type, text: line });
    }
  }
  pushPage();

  return { pages, pageOfElement, pageCount: Math.max(pages.length, 1) };
}

// ── Kohtaukset ja hahmot ─────────────────────────────────────────────────────

export interface SceneInfo {
  id: string;        // kohtauselementin id
  number: number;    // 1-pohjainen kohtausnumero
  heading: string;
  elementIndex: number;
}

export function extractScenes(elements: ScreenplayElement[]): SceneInfo[] {
  const scenes: SceneInfo[] = [];
  elements.forEach((el, idx) => {
    if (el.type === 'scene') {
      scenes.push({
        id: el.id,
        number: scenes.length + 1,
        heading: el.text.toUpperCase() || '(NIMETÖN KOHTAUS)',
        elementIndex: idx,
      });
    }
  });
  return scenes;
}

/** Poistaa hahmonimestä lisämääreet kuten (V.O.) / (CONT'D) ja normalisoi. */
export function normalizeCharacter(name: string): string {
  return name.replace(/\(.*?\)/g, '').trim().toUpperCase();
}

export interface CharacterStats {
  name: string;
  dialogueCount: number; // repliikkien määrä
  wordCount: number;     // sanat dialogissa
  sceneCount: number;    // monessako kohtauksessa esiintyy puhujana
  firstSceneNumber: number | null;
}

export function countWords(text: string): number {
  const t = text.trim();
  return t === '' ? 0 : t.split(/\s+/).length;
}

export function extractCharacterStats(elements: ScreenplayElement[]): CharacterStats[] {
  const map = new Map<string, CharacterStats & { scenes: Set<number> }>();
  let currentSpeaker: string | null = null;
  let sceneNumber = 0;

  for (const el of elements) {
    if (el.type === 'scene') {
      sceneNumber++;
      currentSpeaker = null;
    } else if (el.type === 'character') {
      const name = normalizeCharacter(el.text);
      if (!name) { currentSpeaker = null; continue; }
      currentSpeaker = name;
      if (!map.has(name)) {
        map.set(name, {
          name, dialogueCount: 0, wordCount: 0, sceneCount: 0,
          firstSceneNumber: sceneNumber || null, scenes: new Set(),
        });
      }
      if (sceneNumber > 0) map.get(name)!.scenes.add(sceneNumber);
    } else if (el.type === 'dialogue' && currentSpeaker) {
      const s = map.get(currentSpeaker)!;
      s.dialogueCount++;
      s.wordCount += countWords(el.text);
    } else if (el.type === 'action' || el.type === 'transition') {
      currentSpeaker = null;
    }
  }

  return Array.from(map.values())
    .map(({ scenes, ...rest }) => ({ ...rest, sceneCount: scenes.size }))
    .sort((a, b) => b.dialogueCount - a.dialogueCount);
}

// ── Versiot ──────────────────────────────────────────────────────────────────

// Firestore-dokumentin raja on 1 MB — pidetään snapshotlista turvallisesti alle sen.
const VERSIONS_MAX_CHARS = 700_000;

/** Pudottaa vanhimpia snapshotteja kunnes lista mahtuu kokorajaan. */
export function capVersions(versions: ScreenplayVersion[]): ScreenplayVersion[] {
  const sorted = [...versions].sort((a, b) => a.createdAt - b.createdAt);
  while (sorted.length > 1 && JSON.stringify(sorted).length > VERSIONS_MAX_CHARS) {
    sorted.shift();
  }
  return sorted;
}

// ── Fountain-vienti (varmuuskopio / yhteensopivuus) ──────────────────────────

export function toFountain(meta: ScreenplayMeta, elements: ScreenplayElement[]): string {
  const head = [
    `Title: ${meta.title}`,
    `Author: ${meta.author}`,
    meta.contact ? `Contact: ${meta.contact}` : null,
    `Draft date: ${new Date(meta.updatedAt).toLocaleDateString('fi-FI')}`,
  ].filter(Boolean).join('\n');

  const body = elements.map(el => {
    const text = el.text.trim();
    if (!text) return null;
    switch (el.type) {
      case 'scene': return '\n' + (SCENE_RE.test(text) ? text.toUpperCase() : '.' + text.toUpperCase());
      case 'action': return '\n' + text;
      case 'character': return '\n' + text.toUpperCase();
      case 'parenthetical': return text.startsWith('(') ? text : `(${text})`;
      case 'dialogue': return text;
      case 'transition': return '\n> ' + text.toUpperCase();
    }
  }).filter(Boolean).join('\n');

  return head + '\n\n====\n' + body + '\n';
}
