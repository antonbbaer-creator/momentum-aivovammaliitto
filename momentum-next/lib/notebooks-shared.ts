// Muistiinpanot — henkilökohtaiset muistikirjat (/oma/muistiinpanot).
//
// Tallennus useUserData-hookilla kahteen tasoon:
//   users/{uid}/personalData/notebooks                — kansiot + muistikirjojen metadata
//   users/{uid}/personalData/notebookPages_{id}       — yhden muistikirjan kaikki sivut
//
// Sivusisältö pidetään erillään metadatasta, koska hook serialisoi koko arvon
// jokaisella kirjoituksella ja Firestore-docin raja on 1 Mt. Jos yksittäisen
// muistikirjan 1 Mt joskus tulee vastaan, migraatiopolku on doc per sivu
// (notebookPage_{nbId}_{pageId}) — ei v1:ssä.

export type LeatherColor = 'cognac' | 'black' | 'olive' | 'burgundy' | 'natural' | 'navy';
export type AccentColor = 'natural' | 'black' | 'brass' | 'bordeaux' | 'forest' | 'cream';
export type LeatherFinish = 'smooth' | 'grained';
export type NotebookFormat = 'pocket' | 'a5' | 'a4';
export type PaperStyle = 'lined' | 'dotted' | 'blank';
export type NotebookFont = 'dm' | 'pitch' | 'serif' | 'mono' | 'hand' | 'humanist';

export interface NotebookFolder {
  id: string;
  name: string;
  createdAt: number;
}

/** Kannen tarra: sijainti ja koko suhteellisina (0..1 kannen mitoista). */
export interface NotebookSticker {
  id: string;
  src: string;
  /** Keskipisteen x-sijainti 0..1 */
  x: number;
  /** Keskipisteen y-sijainti 0..1 */
  y: number;
  /** 1 = noin 38 % kannen leveydestä */
  scale: number;
  /** Kierto asteina */
  rotation: number;
}

/** Käyttäjän oma tarrakirjasto: users/{uid}/personalData/stickerLibrary */
export interface UserSticker {
  id: string;
  name: string;
  src: string;
}
export interface StickerLibraryDoc {
  items: UserSticker[];
}

/** Valmiit tarrat brändilogoista (public/brand). */
export const STICKER_LIBRARY: { id: string; name: string; src: string }[] = [
  { id: 'hetki', name: 'Hetki', src: '/brand/hetki-logo-black.png' },
  { id: 'hetki-company', name: 'Hetki Company', src: '/brand/hetki-company-logo-black.png' },
  { id: 'llff-2026', name: 'LLFF 2026', src: '/brand/llff-logo-2026.png' },
  { id: 'llff-symbol-2026', name: 'LLFF symboli 2026', src: '/brand/llff-symbol-2026.png' },
  { id: 'llff-symbol-violet', name: 'LLFF symboli violetti', src: '/brand/llff-symbol-2025-violet.png' },
  { id: 'llff-2025', name: 'LLFF 2025', src: '/brand/llff-logo-2025-black-fi.png' },
  { id: 'avl', name: 'Aivovammaliitto', src: '/brand/avl-logo.png' },
  { id: 'avl-tree', name: 'AVL puu', src: '/brand/avl-tree-icon.png' },
  { id: 'ihaa', name: 'Ihaa', src: '/brand/ihaa-logo.png' },
  { id: 'loisto', name: 'Loisto', src: '/brand/loisto-logo.png' },
  { id: 'luuri', name: 'Luuri', src: '/brand/luuri-logo.svg' },
];

export interface Notebook {
  id: string;
  title: string;
  folderId: string | null;
  cover: LeatherColor;
  finish: LeatherFinish;
  band: AccentColor;
  ribbon: AccentColor;
  format: NotebookFormat;
  paper: PaperStyle;
  font: NotebookFont;
  /** Kanteen embossattu etiketti (max ~16 merkkiä) */
  label?: string;
  /** Kanteen embossatut nimikirjaimet (max 3 merkkiä) */
  initials?: string;
  /** Kanteen liimatut tarrat */
  stickers?: NotebookSticker[];
  /** Denormalisoitu kirjoitettujen sivujen määrä hyllynäkymää varten */
  pageCount?: number;
  /** Viimeksi auki ollut aukeama — lukunauha muistaa paikan */
  lastSpread?: number;
  createdAt: number;
  updatedAt: number;
}

export interface NotebooksDoc {
  folders: NotebookFolder[];
  notebooks: Notebook[];
}

/** Muistikirjan kiinteä sivumäärä — kuin oikeassa vihossa. */
export const NOTEBOOK_PAGES = 50;

/** Legacy-muoto (dynaamiset sivut) — säilytetään vain migraatiota varten. */
export interface NotebookPage {
  id: string;
  body: string;
  createdAt: number;
  updatedAt: number;
}

export interface NotebookPagesDoc {
  /** Sivunumero ("1".."50") → sisältö. Vain kirjoitetut sivut tallennetaan. */
  bodies?: Record<string, string>;
  /** Legacy: vanha dynaaminen sivulista, migratoidaan bodies-muotoon luettaessa. */
  pages?: NotebookPage[];
}

/** Lukee sivusisällöt; migratoi legacy-listan sivuille 1..n luontijärjestyksessä. */
export const pagesBodies = (doc: NotebookPagesDoc): Record<string, string> => {
  if (doc.bodies) return doc.bodies;
  if (doc.pages && doc.pages.length > 0) {
    const out: Record<string, string> = {};
    [...doc.pages]
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
      .forEach((p, i) => {
        if (p.body.trim() && i < NOTEBOOK_PAGES) out[String(i + 1)] = p.body;
      });
    return out;
  }
  return {};
};

/** Poistaa HTML-tagit kirjoitettujen sivujen laskentaa varten. */
const stripHtml = (s: string): string => s.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ');

export const countWrittenPages = (bodies: Record<string, string>): number =>
  Object.values(bodies).filter((b) => stripHtml(b).trim() !== '').length;

/** Nahkasävyt kannen gradienteille (hi → base → lo). Absoluuttisia värejä — nahka on nahkaa molemmissa teemoissa. */
export const LEATHER: Record<LeatherColor, { name: string; hi: string; base: string; lo: string }> = {
  cognac:   { name: 'Konjakki',        hi: '#B97443', base: '#9A5B33', lo: '#6E3D1F' },
  black:    { name: 'Musta',           hi: '#3A342F', base: '#26221F', lo: '#15120F' },
  olive:    { name: 'Oliivi',          hi: '#6E6C49', base: '#5C5A3A', lo: '#3E3D26' },
  burgundy: { name: 'Viininpunainen',  hi: '#7A3340', base: '#5E2430', lo: '#40161F' },
  natural:  { name: 'Luonnonvärinen',  hi: '#D9B388', base: '#C99E6F', lo: '#A87C4C' },
  navy:     { name: 'Tummansininen',   hi: '#35424F', base: '#26303F', lo: '#161E29' },
};

/** Kuminauhan ja lukunauhan värit */
export const ACCENTS: Record<AccentColor, { name: string; hex: string }> = {
  natural:  { name: 'Luonnon',      hex: '#C9A276' },
  black:    { name: 'Musta',        hex: '#1F1C1A' },
  brass:    { name: 'Messinki',     hex: '#B08D3E' },
  bordeaux: { name: 'Bordeaux',     hex: '#6E2B38' },
  forest:   { name: 'Metsänvihreä', hex: '#2F4A3E' },
  cream:    { name: 'Kerma',        hex: '#EFE5D2' },
};

/**
 * Kirjoitusfontit. DM Sans ja Pitch Sans on jo @font-face-ladattu (globals.css);
 * loput ovat system-stackeja — ei uusia fonttilatauksia. Käsiala-stack vaihtelee
 * käyttöjärjestelmittäin; oikea käsialafontti voidaan lisätä myöhemmin
 * public/fonts/ + @font-face -konventiolla.
 */
export const FONT_STACKS: Record<NotebookFont, { name: string; stack: string }> = {
  dm:       { name: 'DM Sans',       stack: "'DM Sans', system-ui, sans-serif" },
  pitch:    { name: 'Pitch Sans',    stack: "'Pitch Sans', 'DM Sans', monospace" },
  serif:    { name: 'Antiikva',      stack: "Georgia, 'Iowan Old Style', 'Times New Roman', serif" },
  mono:     { name: 'Kirjoituskone', stack: "ui-monospace, SFMono-Regular, Menlo, monospace" },
  hand:     { name: 'Käsiala',       stack: "'Bradley Hand', 'Segoe Print', 'Comic Sans MS', cursive" },
  humanist: { name: 'Humanistinen',  stack: "Avenir, 'Gill Sans', Seravek, Verdana, sans-serif" },
};

/** Muistikirjan koko → tiilen mitat hyllyssä */
export const FORMAT: Record<NotebookFormat, { name: string; tileW: number; aspect: string }> = {
  pocket: { name: 'Tasku', tileW: 120, aspect: '9 / 14' },
  a5:     { name: 'A5',    tileW: 156, aspect: '1 / 1.414' },
  a4:     { name: 'A4',    tileW: 196, aspect: '1 / 1.414' },
};

export const NOTEBOOK_FONT_ORDER: NotebookFont[] = ['dm', 'pitch', 'serif', 'mono', 'hand', 'humanist'];
export const LEATHER_ORDER: LeatherColor[] = ['cognac', 'black', 'olive', 'burgundy', 'natural', 'navy'];
export const ACCENT_ORDER: AccentColor[] = ['natural', 'black', 'brass', 'bordeaux', 'forest', 'cream'];
export const FORMAT_ORDER: NotebookFormat[] = ['pocket', 'a5', 'a4'];
export const PAPER_ORDER: PaperStyle[] = ['lined', 'dotted', 'blank'];
export const PAPER_NAMES: Record<PaperStyle, string> = { lined: 'Viivat', dotted: 'Pisteet', blank: 'Tyhjä' };
export const FINISH_NAMES: Record<LeatherFinish, string> = { smooth: 'Sileä', grained: 'Martioitu' };

export const DEFAULT_NOTEBOOK = (id: string): Notebook => ({
  id,
  title: '',
  folderId: null,
  cover: 'cognac',
  finish: 'smooth',
  band: 'black',
  ribbon: 'bordeaux',
  format: 'a5',
  paper: 'lined',
  font: 'dm',
  label: '',
  initials: '',
  pageCount: 0,
  lastSpread: 0,
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

/** Aikaleima tapahtumakäsittelijöille (react-hooks/purity ei tunnista käsittelijäkontekstia). */
export const nowTs = (): number => Date.now();
