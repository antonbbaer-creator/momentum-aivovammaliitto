// Henkilökohtaisen tilan (/oma) jaetut tyypit ja apurit.
// Datapolut: users/{uid}/personalData/{key} flat-doc-konvention mukaisesti.

import { parseLocalDate, formatLocalDate } from './yearwheel-shared';

export interface PersonalTask {
  id: string;
  text: string;
  done: boolean;
  categoryId?: string;
  deadline?: string;          // 'YYYY-MM-DD'
  note?: string;
  createdAt: number;
  completedAt?: number;
  deletedAt?: number;
}

export interface PersonalCategory {
  id: string;
  name: string;
  color: string;              // CSS-väri (esim. '#056b9f')
  icon?: string;              // valinnainen merkki, mallia '◆' '▶'
}

export type Recurrence = 'none' | 'daily' | 'weekly' | 'biweekly' | 'monthly';

export type ExternalSource = 'google' | 'microsoft' | 'apple';

export interface ExternalSync {
  provider: ExternalSource;
  calendarId: string;
  externalEventId: string;
}

export interface TimeBlock {
  id: string;
  categoryId?: string;
  title: string;
  start: string;              // ISO-8601 (paikallinen, esim. '2026-04-27T09:00')
  end: string;
  recurrence?: Recurrence;    // oletus 'none'
  recurrenceUntil?: string;   // 'YYYY-MM-DD' tai puuttuu (= ikuinen)
  recurrenceExclusions?: string[]; // 'YYYY-MM-DD' -listassa olevat esiintymät ohitetaan
  sourceTaskId?: string;      // viittaus PersonalTask.id tai assignedTask.compositeId
  sourceOrgId?: string;       // jos peräisin orgista
  locked?: boolean;           // jos true, ei voi siirtää (esim. tehty/lukittu)
  done?: boolean;
  /** @deprecated käytä externalSyncs */
  externalSource?: ExternalSource;
  /** @deprecated käytä externalSyncs */
  externalCalendarId?: string;
  /** @deprecated käytä externalSyncs */
  externalEventId?: string;
  /** Lista ulkoisista kalentereista joihin tämä lohko on synkattu. */
  externalSyncs?: ExternalSync[];
}

/** Palauta lohkon ulkoiset synkat — yhdistää uudet + legacy-kentät. */
export const getExternalSyncs = (b: TimeBlock): ExternalSync[] => {
  if (b.externalSyncs && b.externalSyncs.length > 0) return b.externalSyncs;
  if (b.externalSource && b.externalCalendarId && b.externalEventId) {
    return [{
      provider: b.externalSource,
      calendarId: b.externalCalendarId,
      externalEventId: b.externalEventId,
    }];
  }
  return [];
};

export interface PersonalSettings {
  weekStart?: 'mon' | 'sun';  // oletus 'mon'
  dayStart?: string;          // 'HH:MM' oletus '06:00'
  dayEnd?: string;            // 'HH:MM' oletus '23:00'
}

// --- Rutiinit ---

export type RoutineIntent = 'start' | 'stop' | 'maintain';
export type RoutineStatus = 'idea' | 'active' | 'established' | 'archived';
export type RoutineCadence = 'daily' | 'weekly';

export interface Routine {
  id: string;
  title: string;
  intent: RoutineIntent;
  status: RoutineStatus;
  cadence: RoutineCadence;
  targetMin: number;            // alaraja: kuinka monta onnistumista per viikko
  targetMax?: number;            // valinnainen yläraja, näyttöä varten
  note?: string;
  categoryId?: string;
  createdAt: number;
  activatedAt?: number;
  establishedAt?: number;
  archivedAt?: number;
}

// Päiväkohtainen onnistumiskirjaus. Stop-rutiineissa done = "pysyin erossa".
export interface RoutineLog {
  routineId: string;
  date: string;                  // 'YYYY-MM-DD' (paikallinen)
  done: boolean;
}

// --- Uni ---
// Yksi merkintä per yö. `date` on aamun päivämäärä (jolloin heräsit).
// Bedtime on edellisen illan/yön nukkumaanmenoaika, waketime sen aamun heräämisaika.
// Tallennuspolku: users/{uid}/personalData/sleep -> { entries: SleepEntry[] }

export const DEFAULT_BEDTIME = '23:00';
export const DEFAULT_WAKETIME = '07:00';

export interface SleepEntry {
  date: string;            // 'YYYY-MM-DD' (aamun päivä)
  bedtime?: string;        // 'HH:MM' (oletus 23:00)
  waketime?: string;       // 'HH:MM' (oletus 07:00)
  hours?: number;          // legacy (vanha numeerinen syöte) — käytetään jos bedtime/waketime puuttuu
  note?: string;
}

/** Päiväuni / muu lisäuni (esim. päiväunet, torkut). */
export interface SleepNap {
  id: string;
  date: string;            // 'YYYY-MM-DD'
  start: string;           // 'HH:MM'
  end: string;             // 'HH:MM' (jos < start, ei sallittu — UI estää)
  note?: string;
}

export interface SleepDoc {
  entries: SleepEntry[];
  naps?: SleepNap[];
}

/** Parsi 'HH:MM' minuuteiksi. Tukee myös 'HH' ja '24:00'. */
export const parseHM = (s: string): number => {
  const [h, m] = (s || '0:0').split(':').map(n => parseInt(n, 10) || 0);
  return h * 60 + m;
};

/** Tunnit yhdelle yölle (käsittelee keskiyön ylityksen). */
export const nightHours = (bedtime: string, waketime: string): number => {
  const bedMin = parseHM(bedtime);
  const wakeMin = parseHM(waketime);
  let dur = (wakeMin - bedMin + 24 * 60) % (24 * 60);
  if (dur === 0) dur = 24 * 60;
  return dur / 60;
};

/** Palauta efektiiviset bedtime/waketime — käytä oletuksia jos puuttuvat. */
export function getSleepWindow(entry?: SleepEntry): { bedtime: string; waketime: string } {
  return {
    bedtime: entry?.bedtime ?? DEFAULT_BEDTIME,
    waketime: entry?.waketime ?? DEFAULT_WAKETIME,
  };
}

/** Yhden merkinnän tunnit, käytä legacy-fallbackia jos kentät puuttuvat. */
export function entryHours(entry?: SleepEntry): number {
  if (!entry) return nightHours(DEFAULT_BEDTIME, DEFAULT_WAKETIME);
  if (entry.bedtime || entry.waketime) {
    const w = getSleepWindow(entry);
    return nightHours(w.bedtime, w.waketime);
  }
  if (typeof entry.hours === 'number' && entry.hours > 0) return entry.hours;
  return nightHours(DEFAULT_BEDTIME, DEFAULT_WAKETIME);
}

/** Tunnit yhdelle päiväunelle. */
export const napHours = (n: SleepNap): number => {
  const startMin = parseHM(n.start);
  const endMin = parseHM(n.end);
  if (endMin <= startMin) return 0;
  return (endMin - startMin) / 60;
};

/** Summaa päiväunet viikolta [wkStart, wkStart+7d). */
export const napHoursInWeek = (naps: SleepNap[] | undefined, wkStart: Date): number => {
  if (!naps) return 0;
  const wkEnd = addDays(wkStart, 7);
  let total = 0;
  for (const n of naps) {
    const d = parseLocalDate(n.date);
    if (d >= wkStart && d < wkEnd) total += napHours(n);
  }
  return total;
};

/** Summaa uni-tunnit (yöt + päiväunet) annetulla viikolla. Oletuksena 8h jokaiselle yölle ellei merkintää. */
export const sleepHoursInWeek = (
  entries: SleepEntry[],
  wkStart: Date,
  naps?: SleepNap[],
): number => {
  const byDate: Record<string, SleepEntry> = {};
  for (const e of entries) byDate[e.date] = e;
  let total = 0;
  for (let i = 0; i < 7; i++) {
    const d = addDays(wkStart, i);
    const iso = formatLocalDate(d);
    total += entryHours(byDate[iso]);
  }
  total += napHoursInWeek(naps, wkStart);
  return total;
};

// --- Reflektio (ääniavusteinen ajankäytön reflektio) ---

export interface ReflectionTurn {
  role: 'user' | 'assistant';
  text: string;
  audioPath?: string;            // Storage-polku jos äänestä, valinnainen
  ts: number;
}

export interface RoutineSuggestion {
  tempId: string;
  title: string;
  intent: RoutineIntent;
  cadence?: RoutineCadence;
  targetMin?: number;
  targetMax?: number;
  rationale: string;             // miksi Claude ehdottaa
  accepted?: boolean;
  acceptedRoutineId?: string;    // jos hyväksytty, viittaus luotuun Routine.id
}

export interface TimeBlockSuggestion {
  tempId: string;
  title: string;
  categoryId?: string;
  suggestedCategoryName?: string;
  dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = sunnuntai
  startTime: string;             // 'HH:MM'
  endTime: string;
  rationale: string;
  accepted?: boolean;
  acceptedBlockId?: string;
}

export type ReflectionStatus = 'in_progress' | 'completed' | 'abandoned';

export interface ReflectionSession {
  id: string;
  startedAt: number;
  updatedAt: number;
  status: ReflectionStatus;
  topic?: string;
  turns: ReflectionTurn[];
  routineSuggestions: RoutineSuggestion[];
  timeblockSuggestions: TimeBlockSuggestion[];
  insights?: string;             // loppuyhteenveto
}

export interface ReflectionsDoc {
  sessions: ReflectionSession[];
}

// Aggregaattimirror — Cloud Function kirjoittaa, client lukee.
// Polku: users/{uid}/assignedTasks/{compositeId}
export interface AssignedTaskMirror {
  compositeId: string;
  orgId: string;
  orgName?: string;
  sourceType: 'task' | 'projectTask' | 'grantSubtask' | 'noteAction';
  sourceId?: string;          // projectId / grantId / noteId / undefined kun root-task
  taskId: string;
  text: string;
  deadline?: string;
  status: 'pending' | 'rejected' | 'accepted' | 'done';
  done: boolean;
  deletedAt?: number;
  assignedBy?: string;
  updatedAt: number;
}

// --- Helpers ---

export const PERSONAL_SLUG = '__personal__';

/** Onko polku henkilökohtaisen tilan alla. */
export const isPersonalPath = (pathname: string): boolean =>
  pathname === '/oma' || pathname.startsWith('/oma/');

/** Maanantai annetun päivän viikolta paikallisaikaa kunnioittaen. */
export const weekStart = (d: Date, weekStartDay: 'mon' | 'sun' = 'mon'): Date => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = x.getDay();              // 0=su, 1=ma, ...
  const diff = weekStartDay === 'mon'
    ? (day === 0 ? -6 : 1 - day)
    : -day;
  x.setDate(x.getDate() + diff);
  return x;
};

/** Lisää päiviä, palauta uusi Date. */
export const addDays = (d: Date, n: number): Date => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

/** ISO-aika 'YYYY-MM-DDTHH:MM' paikallisesti (ei UTC). */
export const formatLocalDateTime = (d: Date): string => {
  const date = formatLocalDate(d);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${date}T${hh}:${mm}`;
};

/** Parsi 'YYYY-MM-DDTHH:MM' paikallisaikana. */
export const parseLocalDateTime = (s: string): Date => {
  const [datePart, timePart = '00:00'] = s.split('T');
  const d = parseLocalDate(datePart);
  const [h, m] = timePart.split(':').map((n) => parseInt(n, 10) || 0);
  d.setHours(h, m, 0, 0);
  return d;
};

/** Lohkon kesto tunneissa (millisekunneista). */
export const blockHours = (b: TimeBlock): number => {
  const a = parseLocalDateTime(b.start).getTime();
  const z = parseLocalDateTime(b.end).getTime();
  return Math.max(0, (z - a) / 3_600_000);
};

/**
 * Laajenna toistuvat lohkot annetun viikon konkreettisiin esiintymiin.
 * Palauttaa lohkot joiden start..end osuvat viikolle [weekStart, weekStart+7d).
 * Toistolohkon `start`/`end`-aikaa siirretään päivien yli; itse päivämäärä
 * muutetaan kohdepäivään.
 */
export const expandRecurring = (blocks: TimeBlock[], wkStart: Date): TimeBlock[] => {
  const wkEnd = addDays(wkStart, 7);
  const out: TimeBlock[] = [];

  for (const b of blocks) {
    const baseStart = parseLocalDateTime(b.start);
    const baseEnd = parseLocalDateTime(b.end);
    const durMs = baseEnd.getTime() - baseStart.getTime();
    const recur = b.recurrence ?? 'none';
    const until = b.recurrenceUntil ? parseLocalDate(b.recurrenceUntil) : null;

    if (recur === 'none') {
      if (baseStart >= wkStart && baseStart < wkEnd) out.push(b);
      continue;
    }

    // Päivä ilman kellonaikaa — käytetään first-occurrence-vertailussa, jotta
    // baseStart 14:00 ei estä saman päivän aamuesiintymää.
    const baseDay = new Date(baseStart.getFullYear(), baseStart.getMonth(), baseStart.getDate());
    const exclusions = new Set(b.recurrenceExclusions ?? []);

    const pushOcc = (day: Date) => {
      if (exclusions.has(formatLocalDate(day))) return;
      const occStart = new Date(day);
      occStart.setHours(baseStart.getHours(), baseStart.getMinutes(), 0, 0);
      const occEnd = new Date(occStart.getTime() + durMs);
      out.push({
        ...b,
        id: `${b.id}@${formatLocalDate(day)}`,
        start: formatLocalDateTime(occStart),
        end: formatLocalDateTime(occEnd),
      });
    };

    if (recur === 'weekly' || recur === 'biweekly') {
      const stepDays = recur === 'biweekly' ? 14 : 7;
      const weekday = baseStart.getDay();
      for (let i = 0; i < 7; i++) {
        const day = addDays(wkStart, i);
        if (day.getDay() !== weekday) continue;
        if (day < baseDay) continue;
        if (until && day > until) continue;
        // Biweekly: vain joka toinen esiintymä baseDayn jälkeen
        const diffDays = Math.round((day.getTime() - baseDay.getTime()) / 86_400_000);
        if (diffDays % stepDays !== 0) continue;
        pushOcc(day);
      }
    } else if (recur === 'daily') {
      for (let i = 0; i < 7; i++) {
        const day = addDays(wkStart, i);
        if (day < baseDay) continue;
        if (until && day > until) continue;
        pushOcc(day);
      }
    } else if (recur === 'monthly') {
      // Sama kuukauden päivä. Jos kohdekuussa ei ole sitä päivää (esim. 31.),
      // ohitetaan kyseinen kuukausi.
      const dom = baseStart.getDate();
      for (let i = 0; i < 7; i++) {
        const day = addDays(wkStart, i);
        if (day < baseDay) continue;
        if (until && day > until) continue;
        if (day.getDate() !== dom) continue;
        // Varmista että kuukausi sisältää tämän päivän (selvä: getDate palauttaa
        // sen mikä on, joten jos kuukausi ei sisällä, day.getDate ei ole dom)
        pushOcc(day);
      }
    }
  }

  return out;
};

/** Tunnit per kategoria annetuista (laajennetuista) lohkoista. */
export const hoursPerCategory = (
  blocks: TimeBlock[],
): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const b of blocks) {
    const key = b.categoryId || '__none__';
    out[key] = (out[key] || 0) + blockHours(b);
  }
  return out;
};

/** Vapaa-aika viikossa: 168h - varatut. */
export const freeHoursInWeek = (blocks: TimeBlock[]): number => {
  const used = blocks.reduce((sum, b) => sum + blockHours(b), 0);
  return Math.max(0, 168 - used);
};

/** Yksinkertainen ID-generaattori. */
export const newId = (): string =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/**
 * Korjaa MacRoman-tulkitusta UTF-8-mojibakea: esim. "√§" → "ä", "√∂" → "ö".
 * Tällaista mojibakea tuli aiemmin Apple Calendar -synkkauksesta, jossa
 * osascriptin outputti tulkittiin väärällä koodauksella. Soveltaa korjaus
 * vain jos teksti sisältää tunnistettavan √-prefixin.
 */
const MOJIBAKE_MAP: Record<string, string> = {
  '√§': 'ä',
  '√∂': 'ö',
  '√Ñ': 'Ä',
  '√ñ': 'Ö',
  '√•': 'å',
  '√º': 'ü',
};
export function fixMojibake(s: string): string {
  if (!s || !s.includes('√')) return s;
  let out = s;
  for (const [bad, good] of Object.entries(MOJIBAKE_MAP)) {
    if (out.includes(bad)) out = out.split(bad).join(good);
  }
  return out;
}
