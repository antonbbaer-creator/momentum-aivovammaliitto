// Apurit /oma/reflektio-toiminnallisuudelle.
// Erillinen tiedosto, jotta voi importata sekä klientiltä että workerista
// (ei `use client` -direktiivejä, ei React-riippuvuuksia).

import {
  AssignedTaskMirror,
  PersonalCategory,
  PersonalTask,
  Recurrence,
  Routine,
  RoutineCadence,
  RoutineIntent,
  RoutineSuggestion,
  SleepEntry,
  SleepNap,
  TimeBlock,
  TimeBlockSuggestion,
  addDays,
  expandRecurring,
  formatLocalDateTime,
  hoursPerCategory,
  newId,
  sleepHoursInWeek,
  weekStart as weekStartOf,
} from './personal-shared';

/**
 * Yhteenveto kuluvan viikon ajankäytöstä Claude-promptia varten.
 * Ottaa raakalohkot (mukaanlukien toistuvat) ja palauttaa tekstiyhteenvedon.
 */
export function summarizeWeek(
  blocks: TimeBlock[],
  categories: PersonalCategory[],
  weekStartDay: 'mon' | 'sun' = 'mon',
  sleepEntries: SleepEntry[] = [],
  naps: SleepNap[] = [],
): string {
  const wkStart = weekStartOf(new Date(), weekStartDay);
  const expanded = expandRecurring(blocks, wkStart);
  const perCat = hoursPerCategory(expanded);
  const catName = (id: string) =>
    id === '__none__' ? 'Luokittelematon' : categories.find(c => c.id === id)?.name || '–';

  const sleep = sleepHoursInWeek(sleepEntries, wkStart, naps);
  const totalUsed = Object.values(perCat).reduce((s, v) => s + v, 0) + sleep;
  const free = Math.max(0, 168 - totalUsed);

  const lines: string[] = [];
  lines.push(`Viikko alkaen ${wkStart.toISOString().slice(0, 10)} (168 h yhteensä):`);
  const entries = Object.entries(perCat).sort((a, b) => b[1] - a[1]);
  for (const [catId, hours] of entries) {
    if (hours <= 0) continue;
    lines.push(`- ${catName(catId)}: ${hours.toFixed(1)} h`);
  }
  lines.push(`- Uni: ${sleep.toFixed(1)} h`);
  lines.push(`- Määrittelemätön: ${free.toFixed(1)} h`);
  return lines.join('\n');
}

/** Tiivistä kategoriat Claudelle (id, nimi) — apuri kontekstipromptiin. */
export function summarizeCategories(categories: PersonalCategory[]): string {
  if (categories.length === 0) return '(ei vielä kategorioita)';
  return categories.map(c => `- ${c.name} (id: ${c.id})`).join('\n');
}

/**
 * Tiivistä avoimet tehtävät Claudelle. Yhdistää henkilökohtaiset tehtävät
 * (`PersonalTask`) ja organisaatioista delegoidut tehtävät (`AssignedTaskMirror`).
 * Vain tekemättömät, ei-deletoidut, ei-rejected tehtävät listataan.
 */
export function summarizeTasks(
  personal: PersonalTask[],
  assigned: AssignedTaskMirror[],
  categories: PersonalCategory[],
): string {
  const catName = (id?: string) =>
    id ? (categories.find(c => c.id === id)?.name || '–') : 'Luokittelematon';

  const openPersonal = personal.filter(t => !t.done && !t.deletedAt);
  const openAssigned = assigned.filter(t => !t.done && !t.deletedAt && t.status !== 'rejected');

  const lines: string[] = [];
  if (openPersonal.length === 0 && openAssigned.length === 0) {
    return '(ei avoimia tehtäviä)';
  }
  if (openPersonal.length > 0) {
    lines.push(`Henkilökohtaisia avoimia tehtäviä (${openPersonal.length}):`);
    for (const t of openPersonal.slice(0, 25)) {
      const dl = t.deadline ? ` (eräpäivä ${t.deadline})` : '';
      const cat = t.categoryId ? ` [${catName(t.categoryId)}]` : '';
      lines.push(`- ${t.text}${cat}${dl}`);
    }
    if (openPersonal.length > 25) lines.push(`- … ja ${openPersonal.length - 25} muuta`);
  }
  if (openAssigned.length > 0) {
    if (lines.length > 0) lines.push('');
    lines.push(`Organisaatioista delegoituja avoimia tehtäviä (${openAssigned.length}):`);
    for (const t of openAssigned.slice(0, 25)) {
      const dl = t.deadline ? ` (eräpäivä ${t.deadline})` : '';
      const org = t.orgName || t.orgId;
      lines.push(`- ${t.text} [${org}]${dl}`);
    }
    if (openAssigned.length > 25) lines.push(`- … ja ${openAssigned.length - 25} muuta`);
  }
  return lines.join('\n');
}

/** Tiivistä rutiinit Claudelle. */
export function summarizeRoutines(routines: Routine[]): string {
  const active = routines.filter(r => r.status !== 'archived');
  if (active.length === 0) return '(ei aktiivisia rutiineja)';
  return active
    .map(r => `- "${r.title}" (intent: ${r.intent}, target: ${r.targetMin}/vk, status: ${r.status})`)
    .join('\n');
}

/** Muunna ehdotus Routineksi joka voidaan tallentaa users/{uid}/personalData/routines. */
export function applyRoutineSuggestion(s: RoutineSuggestion): Routine {
  return {
    id: newId(),
    title: s.title,
    intent: (s.intent ?? 'start') as RoutineIntent,
    status: 'idea',
    cadence: (s.cadence ?? 'weekly') as RoutineCadence,
    targetMin: s.targetMin ?? 1,
    targetMax: s.targetMax,
    note: s.rationale,
    createdAt: Date.now(),
  };
}

/**
 * Muunna ehdotus TimeBlockiksi joka toistuu viikoittain.
 * Etsii suggestion.dayOfWeek (0 = sunnuntai, 1 = maanantai, ...) ensimmäisen
 * esiintymän tästä viikosta alkaen.
 */
export function applyTimeBlockSuggestion(
  s: TimeBlockSuggestion,
  weekStartDay: 'mon' | 'sun' = 'mon',
): TimeBlock {
  const wkStart = weekStartOf(new Date(), weekStartDay);
  // wkStart.getDay() palauttaa 0..6 (0=su). Etsi ensimmäinen päivä jonka getDay === s.dayOfWeek
  let target: Date | null = null;
  for (let i = 0; i < 7; i++) {
    const d = addDays(wkStart, i);
    if (d.getDay() === s.dayOfWeek) {
      target = d;
      break;
    }
  }
  if (!target) target = wkStart;

  const [sh, sm] = s.startTime.split(':').map(n => parseInt(n, 10) || 0);
  const [eh, em] = s.endTime.split(':').map(n => parseInt(n, 10) || 0);
  const start = new Date(target);
  start.setHours(sh, sm, 0, 0);
  const end = new Date(target);
  end.setHours(eh, em, 0, 0);

  return {
    id: newId(),
    categoryId: s.categoryId,
    title: s.title,
    start: formatLocalDateTime(start),
    end: formatLocalDateTime(end),
    recurrence: 'weekly' as Recurrence,
  };
}
