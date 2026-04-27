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

export type Recurrence = 'none' | 'daily' | 'weekly';

export interface TimeBlock {
  id: string;
  categoryId?: string;
  title: string;
  start: string;              // ISO-8601 (paikallinen, esim. '2026-04-27T09:00')
  end: string;
  recurrence?: Recurrence;    // oletus 'none'
  recurrenceUntil?: string;   // 'YYYY-MM-DD' tai puuttuu (= ikuinen)
  sourceTaskId?: string;      // viittaus PersonalTask.id tai assignedTask.compositeId
  sourceOrgId?: string;       // jos peräisin orgista
  locked?: boolean;           // jos true, ei voi siirtää (esim. tehty/lukittu)
  done?: boolean;
  // Ulkoinen kalenteri-synkka — kun lohko mapattu Googleen/Microsoftiin
  externalSource?: 'google' | 'microsoft';
  externalCalendarId?: string;
  externalEventId?: string;
}

export interface PersonalSettings {
  weekStart?: 'mon' | 'sun';  // oletus 'mon'
  dayStart?: string;          // 'HH:MM' oletus '06:00'
  dayEnd?: string;            // 'HH:MM' oletus '23:00'
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

    // Toistuva: generoi esiintymät viikon sisällä.
    if (recur === 'weekly') {
      // Sama viikonpäivä, sama kellonaika
      const weekday = baseStart.getDay();
      for (let i = 0; i < 7; i++) {
        const day = addDays(wkStart, i);
        if (day.getDay() !== weekday) continue;
        if (day < baseStart) continue;             // ei ennen ensimmäistä esiintymää
        if (until && day > until) continue;
        const occStart = new Date(day);
        occStart.setHours(baseStart.getHours(), baseStart.getMinutes(), 0, 0);
        const occEnd = new Date(occStart.getTime() + durMs);
        out.push({
          ...b,
          id: `${b.id}@${formatLocalDate(day)}`,
          start: formatLocalDateTime(occStart),
          end: formatLocalDateTime(occEnd),
        });
      }
    } else if (recur === 'daily') {
      for (let i = 0; i < 7; i++) {
        const day = addDays(wkStart, i);
        if (day < new Date(baseStart.getFullYear(), baseStart.getMonth(), baseStart.getDate())) continue;
        if (until && day > until) continue;
        const occStart = new Date(day);
        occStart.setHours(baseStart.getHours(), baseStart.getMinutes(), 0, 0);
        const occEnd = new Date(occStart.getTime() + durMs);
        out.push({
          ...b,
          id: `${b.id}@${formatLocalDate(day)}`,
          start: formatLocalDateTime(occStart),
          end: formatLocalDateTime(occEnd),
        });
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
