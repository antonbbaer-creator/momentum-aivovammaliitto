// Rutiinien viikkoseuranta- ja vakiintumislogiikka.

import { Routine, RoutineLog, weekStart, addDays } from './personal-shared';
import { formatLocalDate, parseLocalDate } from './yearwheel-shared';

export const REQUIRED_WEEKS_TO_ESTABLISH = 3;
export const SUGGESTED_MAX_IDEAS = 3;

/** Avain viikolle: viikon maanantain (tai sunnuntain) 'YYYY-MM-DD'. */
export const weekKey = (d: Date, weekStartDay: 'mon' | 'sun' = 'mon'): string =>
  formatLocalDate(weekStart(d, weekStartDay));

export interface WeekProgress {
  done: number;
  target: number;
  met: boolean;
}

/** Kuinka monta onnistunutta logia rutiinilla on annetussa viikossa, ja onko alaraja täyttynyt. */
export const weekProgress = (
  routine: Routine,
  logs: RoutineLog[],
  forWeek: Date,
  weekStartDay: 'mon' | 'sun' = 'mon',
): WeekProgress => {
  const start = weekStart(forWeek, weekStartDay);
  const end = addDays(start, 7);
  const target = routine.cadence === 'weekly' ? Math.max(1, routine.targetMin) : routine.targetMin;
  let done = 0;
  for (const log of logs) {
    if (log.routineId !== routine.id) continue;
    if (!log.done) continue;
    const d = parseLocalDate(log.date);
    if (d >= start && d < end) done++;
  }
  // Weekly: tulkitaan alaraja sellaiseksi että vähintään yksi onnistuminen riittää.
  const met = routine.cadence === 'weekly' ? done >= target : done >= target;
  return { done, target, met };
};

/**
 * Peräkkäiset täydet viikot, jotka päättyivät tähän mennessä (kuluvaa viikkoa
 * EI lasketa, koska se ei ole vielä päättynyt — vasta täyteen viikkoon perustuva
 * laskenta antaa vakiintumiselle merkityksen).
 *
 * Ennen activatedAt-aikaa olevia viikkoja ei lasketa.
 */
export const consecutiveMetWeeks = (
  routine: Routine,
  logs: RoutineLog[],
  today: Date = new Date(),
  weekStartDay: 'mon' | 'sun' = 'mon',
): number => {
  const thisWeekStart = weekStart(today, weekStartDay);
  let count = 0;
  // Aloita edellisestä päättyneestä viikosta.
  let cursor = addDays(thisWeekStart, -7);
  const activatedAt = routine.activatedAt ? new Date(routine.activatedAt) : null;
  while (true) {
    if (activatedAt && cursor < weekStart(activatedAt, weekStartDay)) break;
    const { met } = weekProgress(routine, logs, cursor, weekStartDay);
    if (!met) break;
    count++;
    cursor = addDays(cursor, -7);
  }
  return count;
};

export const isReadyForEstablish = (
  routine: Routine,
  logs: RoutineLog[],
  today: Date = new Date(),
  weekStartDay: 'mon' | 'sun' = 'mon',
): boolean =>
  routine.status === 'active' &&
  consecutiveMetWeeks(routine, logs, today, weekStartDay) >= REQUIRED_WEEKS_TO_ESTABLISH;

export const activeCount = (routines: Routine[]): number =>
  routines.filter(r => r.status === 'active').length;

export const ideaCount = (routines: Routine[]): number =>
  routines.filter(r => r.status === 'idea').length;

/** Viikon päivät (paikallinen) järjestyksessä. */
export const weekDays = (
  forWeek: Date,
  weekStartDay: 'mon' | 'sun' = 'mon',
): Date[] => {
  const start = weekStart(forWeek, weekStartDay);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
};

/** Logien indeksoitu haku: onko routineId/date -kombolla onnistunut kirjaus. */
export const isLoggedDone = (
  routineId: string,
  date: Date,
  logs: RoutineLog[],
): boolean => {
  const key = formatLocalDate(date);
  return logs.some(l => l.routineId === routineId && l.date === key && l.done);
};

/** Päivitä tai lisää päiväkirjaus. */
export const upsertLog = (
  logs: RoutineLog[],
  routineId: string,
  date: Date,
  done: boolean,
): RoutineLog[] => {
  const key = formatLocalDate(date);
  const idx = logs.findIndex(l => l.routineId === routineId && l.date === key);
  if (idx === -1) return [...logs, { routineId, date: key, done }];
  const next = logs.slice();
  next[idx] = { ...next[idx], done };
  return next;
};

export const intentLabel: Record<Routine['intent'], string> = {
  start: 'aloita',
  stop: 'lopeta',
  maintain: 'ylläpidä',
};

export const cadenceLabel: Record<Routine['cadence'], string> = {
  daily: 'päivittäin',
  weekly: 'viikoittain',
};
