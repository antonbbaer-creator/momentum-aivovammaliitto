import { weekStart, addDays } from './personal-shared';
import { parseLocalDate } from './yearwheel-shared';

/**
 * Käsikirjoitusseuranta — henkilökohtainen kirjoitusajan seuranta.
 * Tallennus: users/{uid}/personalData/screenwriting
 */

export interface WritingProject {
  id: string;
  name: string;
  color: string;
  archived?: boolean;
  createdAt: number;
}

export interface WritingSession {
  id: string;
  date: string;          // 'YYYY-MM-DD' paikallinen
  minutes: number;
  projectId: string;
  note?: string;
  createdAt: number;
}

export interface ScreenwritingDoc {
  projects: WritingProject[];
  sessions: WritingSession[];
  weeklyTargetH?: number;   // tavoite tuntia / viikko, valinnainen
}

export const EMPTY_SCREENWRITING: ScreenwritingDoc = { projects: [], sessions: [] };

/** Trendinäkymän viikkojen määrä — sama kuin viikkokalenterin trendeissä. */
export const WRITING_TREND_WEEKS = 12;

export const WRITING_PALETTE = [
  '#056b9f', '#c43d65', '#185e5b', '#B07A1A',
  '#7a5fb0', '#cc7a35', '#3788b2', '#2a8a86',
  '#c14545', '#5b9b3f', '#9b7cf6', '#f09a52',
];

/** Seuraava vapaa väri paletista. */
export const nextProjectColor = (projects: WritingProject[]): string => {
  const used = new Set(projects.map(p => p.color));
  return WRITING_PALETTE.find(c => !used.has(c)) || WRITING_PALETTE[projects.length % WRITING_PALETTE.length];
};

export interface WritingWeekSummary {
  weekStartDate: Date;
  weekLabel: string;                 // esim. '23.6.'
  perProject: Record<string, number>; // projektiId → tunnit
  total: number;                     // tunnit
  sessionCount: number;
}

/** Viikkoyhteenvedot viimeisille `weeks` viikolle, vanhin ensin (kuluva viikko viimeisenä). */
export function writingWeekSummaries(
  sessions: WritingSession[],
  today: Date,
  weeks: number = WRITING_TREND_WEEKS,
  weekStartDay: 'mon' | 'sun' = 'mon',
): WritingWeekSummary[] {
  const curStart = weekStart(today, weekStartDay);
  const out: WritingWeekSummary[] = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const ws = addDays(curStart, -7 * w);
    const we = addDays(ws, 7);
    const perProject: Record<string, number> = {};
    let total = 0;
    let sessionCount = 0;
    for (const s of sessions) {
      const d = parseLocalDate(s.date);
      if (d < ws || d >= we) continue;
      const h = s.minutes / 60;
      perProject[s.projectId] = (perProject[s.projectId] || 0) + h;
      total += h;
      sessionCount += 1;
    }
    out.push({
      weekStartDate: ws,
      weekLabel: `${ws.getDate()}.${ws.getMonth() + 1}.`,
      perProject,
      total,
      sessionCount,
    });
  }
  return out;
}

/** Kesto luettavana: '45 min', '1 h', '1 h 30 min'. */
export const fmtMinutes = (min: number): string => {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
};
