'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useUserData } from '@/lib/use-user-data';
import { useAssignedTasks } from '@/lib/use-assigned-tasks';
import {
  DEFAULT_BEDTIME,
  DEFAULT_WAKETIME,
  PersonalCategory,
  PersonalSettings,
  PersonalTask,
  SleepDoc,
  SleepEntry,
  SleepNap,
  TimeBlock,
  Recurrence,
  ExternalSync,
  addDays,
  blockHours,
  entryHours,
  expandRecurring,
  fixMojibake,
  formatLocalDateTime,
  freeHoursInWeek,
  getExternalSyncs,
  getSleepWindow,
  hoursPerCategory,
  napHours,
  napHoursInWeek,
  newId,
  nightHours,
  parseHM,
  parseLocalDateTime,
  sleepHoursInWeek,
  weekStart as weekStartOf,
} from '@/lib/personal-shared';
import { formatLocalDate, parseLocalDate } from '@/lib/yearwheel-shared';
import { useExternalEvents } from '@/lib/use-external-events';
import { useIntegrations, useIntegrationApi } from '@/lib/use-integrations';
import {
  ExternalEvent,
  getCalendarCategoryIds,
  isCalendarWriteFor,
} from '@/lib/integrations-shared';

const DAY_NAMES_MON = ['Ma', 'Ti', 'Ke', 'To', 'Pe', 'La', 'Su'];
const DAY_NAMES_SUN = ['Su', 'Ma', 'Ti', 'Ke', 'To', 'Pe', 'La'];
const SLOT_MIN = 30;            // 30 min slotit
const SLOT_PX = 22;             // pikseliä per slot
const slotsPerHour = 60 / SLOT_MIN;

type DraftBlock = {
  dayIdx: number;                // 0..6
  startSlot: number;
  endSlot: number;               // exclusive
} | null;

interface BlockEditState {
  block: TimeBlock;
  isNew: boolean;
}

const slotToTime = (slot: number): string => {
  const totalMin = slot * SLOT_MIN;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};


export default function PersonalWeekSection() {
  const [blocks, setBlocks] = useUserData<TimeBlock[]>('calendar', []);
  const [categories, setCategories] = useUserData<PersonalCategory[]>('categories', []);
  const [settings] = useUserData<PersonalSettings>('settings', {
    weekStart: 'mon', dayStart: '06:00', dayEnd: '23:00',
  });
  const [tasks, setTasks] = useUserData<PersonalTask[]>('tasks', []);
  const [sleepDoc, setSleepDoc] = useUserData<SleepDoc>('sleep', { entries: [] });
  const { assigned } = useAssignedTasks();
  const { events: externalEvents, lastFetchedAt, loading: externalLoading } = useExternalEvents();
  const { google, microsoft } = useIntegrations();
  const integrationApi = useIntegrationApi();

  const ws = settings.weekStart || 'mon';
  // Näytä koko vuorokausi 00:00–24:00 — uniaikalohkot vaativat tämän.
  const dayStartMin = 0;
  const dayEndMin = 24 * 60;
  const startSlot0 = Math.floor(dayStartMin / SLOT_MIN);
  const endSlot0 = Math.ceil(dayEndMin / SLOT_MIN);
  const slotsPerDay = endSlot0 - startSlot0;

  const [weekOffset, setWeekOffset] = useState(0);
  const [showImport, setShowImport] = useState(false);
  const wkStart = useMemo(() => {
    const ws0 = weekStartOf(new Date(), ws);
    return addDays(ws0, weekOffset * 7);
  }, [weekOffset, ws]);

  const dayDates = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(wkStart, i)), [wkStart]);
  const dayNames = ws === 'mon' ? DAY_NAMES_MON : DAY_NAMES_SUN;

  // Uni-merkinnät: yksi per yö, avaimena aamun ISO-päivä.
  const sleepEntries = sleepDoc.entries ?? [];
  const sleepByDate = useMemo(() => {
    const out: Record<string, SleepEntry> = {};
    for (const e of sleepEntries) out[e.date] = e;
    return out;
  }, [sleepEntries]);

  // Drag-tila uni-aikoja varten. Tallennetaan tyhjäksi raahauksen aikana ja
  // commitoidaan setSleepDoc:iin mouseupissa.
  const [sleepDraft, setSleepDraft] = useState<{ date: string; bedtime: string; waketime: string } | null>(null);
  const [napDraft, setNapDraft] = useState<{ id: string; start: string; end: string } | null>(null);
  const sleepDragRef = useRef<
    | { kind: 'bedtime' | 'waketime'; date: string; columnEl: HTMLDivElement | null }
    | { kind: 'nap-start' | 'nap-end'; napId: string; columnEl: HTMLDivElement | null }
    | null
  >(null);
  const dayColumnRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Päiväunet
  const naps = sleepDoc.naps ?? [];
  const napsByDay = useMemo(() => {
    const out: SleepNap[][] = Array.from({ length: 7 }, () => []);
    for (const n of naps) {
      for (let i = 0; i < 7; i++) {
        if (n.date === formatLocalDate(dayDates[i])) {
          out[i].push(n);
          break;
        }
      }
    }
    return out;
  }, [naps, dayDates]);

  const addNap = (nap: SleepNap) => {
    setSleepDoc(prev => ({
      ...prev,
      entries: prev.entries ?? [],
      naps: [...(prev.naps ?? []), nap],
    }));
  };
  const updateNap = (id: string, patch: Partial<SleepNap>) => {
    setSleepDoc(prev => ({
      ...prev,
      entries: prev.entries ?? [],
      naps: (prev.naps ?? []).map(n => n.id === id ? { ...n, ...patch } : n),
    }));
  };
  const deleteNap = (id: string) => {
    setSleepDoc(prev => ({
      ...prev,
      entries: prev.entries ?? [],
      naps: (prev.naps ?? []).filter(n => n.id !== id),
    }));
  };

  // Modal-tila uuden päiväunen luomiseen
  const [newNapOpen, setNewNapOpen] = useState(false);

  // Trendit-näkymässä piilotetut kategoriat (oletuksena kaikki näkyvissä)
  const SLEEP_KEY = '__sleep__';
  const FREE_KEY = '__free__';
  const [trendInactive, setTrendInactive] = useState<Set<string>>(new Set());
  const isTrendActive = (key: string) => !trendInactive.has(key);
  const toggleTrend = (key: string) => {
    setTrendInactive(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Toistuvan poiston valintamodaalin tila
  const [recurringDelete, setRecurringDelete] = useState<{
    baseId: string;
    occurrenceDate: string;   // 'YYYY-MM-DD'
  } | null>(null);

  // Lohkon raahaus (move-drag) — ajan/päivän vaihto vetämällä
  const [moveDrag, setMoveDrag] = useState<{
    block: TimeBlock;
    startX: number;
    startY: number;
    origDayIdx: number;
    origStartMin: number;
    curDayIdx: number;
    curStartMin: number;
    durationMin: number;
  } | null>(null);
  const moveDragActiveRef = useRef(false);
  const blockClickSuppressRef = useRef(false);

  /** Päivitä yksi yö pysyvään doc-tallennukseen. */
  const commitSleep = (date: string, win: { bedtime: string; waketime: string }) => {
    const w = getSleepWindow();
    const isDefault = win.bedtime === w.bedtime && win.waketime === w.waketime;
    setSleepDoc(prev => {
      const cur = prev.entries ?? [];
      const others = cur.filter(e => e.date !== date);
      if (isDefault) {
        return { ...prev, entries: others };
      }
      return { ...prev, entries: [...others, { date, bedtime: win.bedtime, waketime: win.waketime }] };
    });
  };

  /** Snap minuutit lähimpään 15 min -askeleeseen, clamp 0..1440. */
  const snapMin = (min: number): number => {
    const clamped = Math.max(0, Math.min(24 * 60 - 1, min));
    return Math.round(clamped / 15) * 15;
  };

  const minToHM = (min: number): string => {
    const m = ((min % (24 * 60)) + 24 * 60) % (24 * 60);
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  };

  /** Mouse-y suhteessa sarakkeeseen → minuutit (0..1440). */
  const yToMin = (clientY: number, columnEl: HTMLDivElement): number => {
    const rect = columnEl.getBoundingClientRect();
    const ratio = (clientY - rect.top) / rect.height;
    return snapMin(ratio * 24 * 60);
  };

  // Window-tason mousemove + mouseup uniraahausta varten
  useEffect(() => {
    const onMove = (ev: MouseEvent) => {
      // ── Lohkon move-drag ──
      if (moveDrag) {
        const dx = ev.clientX - moveDrag.startX;
        const dy = ev.clientY - moveDrag.startY;
        if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
          moveDragActiveRef.current = true;
        }
        if (moveDragActiveRef.current) {
          // Etsi kohdesarake clientX:n perusteella
          let targetDay = moveDrag.origDayIdx;
          for (let i = 0; i < 7; i++) {
            const col = dayColumnRefs.current[i];
            if (!col) continue;
            const r = col.getBoundingClientRect();
            if (ev.clientX >= r.left && ev.clientX < r.right) {
              targetDay = i;
              break;
            }
          }
          // Uusi alkuminuutti deltasta y-suunnassa
          const minutesPerPx = SLOT_MIN / SLOT_PX;
          const deltaMin = Math.round((dy * minutesPerPx) / 15) * 15;
          let newStartMin = moveDrag.origStartMin + deltaMin;
          newStartMin = Math.max(0, Math.min(24 * 60 - moveDrag.durationMin, newStartMin));
          setMoveDrag(prev => prev ? { ...prev, curDayIdx: targetDay, curStartMin: newStartMin } : prev);
        }
        return;
      }

      const drag = sleepDragRef.current;
      if (!drag || !drag.columnEl) return;
      const newMin = yToMin(ev.clientY, drag.columnEl);
      if (!('napId' in drag)) {
        const dragDate = drag.date;
        const dragKind = drag.kind;
        setSleepDraft(prev => {
          const baseEntry = sleepByDate[dragDate];
          const baseWin = prev && prev.date === dragDate
            ? prev
            : getSleepWindow(baseEntry);
          const next = { date: dragDate, bedtime: baseWin.bedtime, waketime: baseWin.waketime };
          if (dragKind === 'bedtime') next.bedtime = minToHM(newMin);
          else next.waketime = minToHM(newMin);
          return next;
        });
      } else {
        const dragNapId = drag.napId;
        const dragKind = drag.kind;
        const nap = naps.find(n => n.id === dragNapId);
        if (!nap) return;
        setNapDraft(prev => {
          const base = prev && prev.id === dragNapId ? prev : { id: dragNapId, start: nap.start, end: nap.end };
          const next = { ...base };
          const t = minToHM(newMin);
          if (dragKind === 'nap-start') {
            next.start = t;
            if (parseHM(next.start) >= parseHM(next.end)) next.end = minToHM(Math.min(24 * 60 - 15, parseHM(next.start) + 15));
          } else {
            next.end = t;
            if (parseHM(next.end) <= parseHM(next.start)) next.start = minToHM(Math.max(0, parseHM(next.end) - 15));
          }
          return next;
        });
      }
    };
    const onUp = () => {
      // ── Lohkon move-drag commit ──
      if (moveDrag) {
        if (moveDragActiveRef.current) {
          commitMove(moveDrag);
          blockClickSuppressRef.current = true;
        }
        moveDragActiveRef.current = false;
        setMoveDrag(null);
        return;
      }

      const drag = sleepDragRef.current;
      if (!drag) return;
      sleepDragRef.current = null;
      if (!('napId' in drag)) {
        setSleepDraft(prev => {
          if (prev) commitSleep(prev.date, { bedtime: prev.bedtime, waketime: prev.waketime });
          return null;
        });
      } else {
        setNapDraft(prev => {
          if (prev) updateNap(prev.id, { start: prev.start, end: prev.end });
          return null;
        });
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sleepByDate, naps, moveDrag]);

  /** Aloita raahaus uniaikaa varten. */
  const startSleepDrag = (
    e: React.MouseEvent,
    kind: 'bedtime' | 'waketime',
    date: string,
    columnEl: HTMLDivElement | null,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    sleepDragRef.current = { kind, date, columnEl };
    const baseEntry = sleepByDate[date];
    const win = getSleepWindow(baseEntry);
    setSleepDraft({ date, bedtime: win.bedtime, waketime: win.waketime });
  };

  const startNapDrag = (
    e: React.MouseEvent,
    kind: 'nap-start' | 'nap-end',
    napId: string,
    columnEl: HTMLDivElement | null,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    sleepDragRef.current = { kind, napId, columnEl };
    const nap = naps.find(n => n.id === napId);
    if (nap) setNapDraft({ id: napId, start: nap.start, end: nap.end });
  };

  /** Hae renderoitavat uni-osiot päivälle dIdx (aamuosa + iltaosa). */
  const sleepPortionsFor = (dIdx: number): Array<{
    kind: 'morning' | 'evening' | 'sameDay';
    date: string;          // entryyn liittyvä date (aamun päivä)
    fromMin: number;
    toMin: number;
    win: { bedtime: string; waketime: string };
  }> => {
    const out: Array<{ kind: 'morning' | 'evening' | 'sameDay'; date: string; fromMin: number; toMin: number; win: { bedtime: string; waketime: string } }> = [];

    // Tämän aamun heräämiseen liittyvä yö (date = iso(dayDates[dIdx]))
    const morningIso = formatLocalDate(dayDates[dIdx]);
    const morningWin = sleepDraft?.date === morningIso
      ? { bedtime: sleepDraft.bedtime, waketime: sleepDraft.waketime }
      : getSleepWindow(sleepByDate[morningIso]);
    const bedMinM = parseHM(morningWin.bedtime);
    const wakeMinM = parseHM(morningWin.waketime);
    if (bedMinM > wakeMinM || bedMinM === wakeMinM) {
      // Cross-midnight: aamuosa 00:00 → waketime (jos waketime > 0)
      if (wakeMinM > 0) {
        out.push({ kind: 'morning', date: morningIso, fromMin: 0, toMin: wakeMinM, win: morningWin });
      }
    } else {
      // Sama-päivä uni: bedtime → waketime samalla aamulla (esim. 02:00–07:00)
      out.push({ kind: 'sameDay', date: morningIso, fromMin: bedMinM, toMin: wakeMinM, win: morningWin });
    }

    // Seuraavan aamun yöhön liittyvä iltaosa (date = iso(dayDates[dIdx+1]))
    const tomorrow = addDays(dayDates[dIdx], 1);
    const tomorrowIso = formatLocalDate(tomorrow);
    const eveningWin = sleepDraft?.date === tomorrowIso
      ? { bedtime: sleepDraft.bedtime, waketime: sleepDraft.waketime }
      : getSleepWindow(sleepByDate[tomorrowIso]);
    const bedMinE = parseHM(eveningWin.bedtime);
    const wakeMinE = parseHM(eveningWin.waketime);
    if (bedMinE > wakeMinE || bedMinE === wakeMinE) {
      if (bedMinE < 24 * 60) {
        out.push({ kind: 'evening', date: tomorrowIso, fromMin: bedMinE, toMin: 24 * 60, win: eveningWin });
      }
    }

    return out;
  };

  // Laajennetut lohkot tälle viikolle
  const expanded = useMemo(() => expandRecurring(blocks, wkStart), [blocks, wkStart]);

  const blocksByDay = useMemo(() => {
    const out: TimeBlock[][] = Array.from({ length: 7 }, () => []);
    for (const b of expanded) {
      const start = parseLocalDateTime(b.start);
      const dIdx = Math.floor((start.getTime() - wkStart.getTime()) / 86_400_000);
      if (dIdx < 0 || dIdx > 6) continue;
      out[dIdx].push(b);
    }
    return out;
  }, [expanded, wkStart]);

  // 12 viikon trendidata (tämä viikko + 11 edellistä)
  const TREND_WEEKS = 12;
  const weeklySummaries = useMemo(() => {
    const out: Array<{
      weekStart: Date;
      weekLabel: string;
      perCat: Record<string, number>;
      sleep: number;
      total: number;
    }> = [];
    for (let w = TREND_WEEKS - 1; w >= 0; w--) {
      const ws = addDays(wkStart, -7 * w);
      const expandedW = expandRecurring(blocks, ws);
      const perCat = hoursPerCategory(expandedW);
      const sleep = sleepHoursInWeek(sleepEntries, ws, naps);
      const total = Object.values(perCat).reduce((s, v) => s + v, 0) + sleep;
      out.push({
        weekStart: ws,
        weekLabel: `${ws.getDate()}.${ws.getMonth() + 1}.`,
        perCat,
        sleep,
        total,
      });
    }
    return out;
  }, [blocks, sleepEntries, naps, wkStart]);

  // Lohkot näytetään raahauksen aikana muutetussa päivässä
  const visibleByDay = useMemo(() => {
    if (!moveDrag || !moveDragActiveRef.current) return blocksByDay;
    if (moveDrag.origDayIdx === moveDrag.curDayIdx) return blocksByDay;
    const out = blocksByDay.map(arr => arr.slice());
    out[moveDrag.origDayIdx] = out[moveDrag.origDayIdx].filter(b => b.id !== moveDrag.block.id);
    out[moveDrag.curDayIdx] = [...out[moveDrag.curDayIdx], moveDrag.block];
    return out;
  }, [blocksByDay, moveDrag]);

  // Ulkoiset tapahtumat tälle viikolle, ryhmiteltynä päivittäin
  const externalByDay = useMemo(() => {
    const out: ExternalEvent[][] = Array.from({ length: 7 }, () => []);
    const wkEnd = addDays(wkStart, 7);
    for (const e of externalEvents) {
      const start = parseLocalDateTime(e.start);
      if (start < wkStart || start >= wkEnd) continue;
      const dIdx = Math.floor((start.getTime() - wkStart.getTime()) / 86_400_000);
      if (dIdx < 0 || dIdx > 6) continue;
      out[dIdx].push(e);
    }
    return out;
  }, [externalEvents, wkStart]);

  // Kalenteri → kategoriat -mappaus (yksi kalenteri voi feedata useaan kategoriaan)
  const calendarToCategories = useMemo(() => {
    const out: Record<string, string[]> = {}; // `${provider}:${calendarId}` → categoryId[]
    for (const integ of [google, microsoft]) {
      if (!integ) continue;
      for (const c of integ.calendars || []) {
        const ids = getCalendarCategoryIds(c);
        if (ids.length > 0) out[`${integ.provider}:${c.id}`] = ids;
      }
    }
    return out;
  }, [google, microsoft]);

  // Ulkoiselle tapahtumalle: kategoria näytöllä on ensimmäinen liitetty (väritystä varten).
  const externalCategoryFor = (e: ExternalEvent): string | undefined => {
    const ids = calendarToCategories[`${e.source}:${e.calendarId}`];
    return ids && ids.length > 0 ? ids[0] : undefined;
  };


  // Konfliktitarkistus: oma lohko päällekkäin ulkoisen kanssa
  const overlapsExternal = (b: TimeBlock): boolean => {
    const bs = parseLocalDateTime(b.start).getTime();
    const be = parseLocalDateTime(b.end).getTime();
    const ownSyncIds = new Set(getExternalSyncs(b).map(s => s.externalEventId));
    for (const e of externalEvents) {
      const es = parseLocalDateTime(e.start).getTime();
      const ee = parseLocalDateTime(e.end).getTime();
      if (bs < ee && es < be) {
        // skip if oman lohko ITSE on synkka tämän kanssa
        if (ownSyncIds.has(e.externalEventId)) continue;
        return true;
      }
    }
    return false;
  };

  // Drag-luonti
  const [draft, setDraft] = useState<DraftBlock>(null);
  const draftStartRef = useRef<{ day: number; slot: number } | null>(null);

  // Modal-editori
  const [editing, setEditing] = useState<BlockEditState | null>(null);

  // Tehtävän drag-drop
  const dragTaskRef = useRef<{ id: string; text: string; orgId?: string } | null>(null);

  const onSlotMouseDown = (dayIdx: number, slotInDay: number) => {
    draftStartRef.current = { day: dayIdx, slot: slotInDay };
    setDraft({ dayIdx, startSlot: slotInDay, endSlot: slotInDay + 1 });
  };

  const onSlotMouseEnter = (dayIdx: number, slotInDay: number) => {
    if (!draftStartRef.current) return;
    const { day, slot } = draftStartRef.current;
    if (day !== dayIdx) return;
    setDraft({
      dayIdx,
      startSlot: Math.min(slot, slotInDay),
      endSlot: Math.max(slot, slotInDay) + 1,
    });
  };

  const finishDraft = () => {
    if (!draft) {
      draftStartRef.current = null;
      return;
    }
    const day = dayDates[draft.dayIdx];
    const start = new Date(day);
    const startMin = (startSlot0 + draft.startSlot) * SLOT_MIN;
    start.setHours(Math.floor(startMin / 60), startMin % 60, 0, 0);
    const end = new Date(day);
    const endMin = (startSlot0 + draft.endSlot) * SLOT_MIN;
    end.setHours(Math.floor(endMin / 60), endMin % 60, 0, 0);

    const newBlock: TimeBlock = {
      id: newId(),
      title: '',
      categoryId: categories[0]?.id,
      start: formatLocalDateTime(start),
      end: formatLocalDateTime(end),
      recurrence: 'none',
    };
    setEditing({ block: newBlock, isNew: true });
    setDraft(null);
    draftStartRef.current = null;
  };

  // Etsi kirjoituskelpoiset ulkoiset kalenterit kategorialle.
  // Voi olla useita (esim. työn Google + Outlook), mutta ensisijaisesti yksi per provider.
  const writeTargetsFor = (categoryId?: string): Array<{ provider: 'google' | 'microsoft'; calendarId: string }> => {
    if (!categoryId) return [];
    const out: Array<{ provider: 'google' | 'microsoft'; calendarId: string }> = [];
    for (const integ of [google, microsoft]) {
      if (!integ) continue;
      for (const c of integ.calendars || []) {
        if (isCalendarWriteFor(c, categoryId)) {
          out.push({ provider: integ.provider, calendarId: c.id });
        }
      }
    }
    return out;
  };

  const saveBlock = async () => {
    if (!editing) return;
    let block = { ...editing.block, title: fixMojibake(editing.block.title || '') };
    const targets = writeTargetsFor(block.categoryId);
    const existingSyncs = getExternalSyncs(block);

    // P\u00e4ivit\u00e4 olemassa olevat synkat (sama externalEventId s\u00e4ilyy)
    const updatedSyncs: ExternalSync[] = [];
    for (const s of existingSyncs) {
      if (s.provider === 'apple') {
        // Apple synkka on yksisuuntainen \u2014 s\u00e4ilyt\u00e4 metadata mutta \u00e4l\u00e4 yrit\u00e4 push
        updatedSyncs.push(s);
        continue;
      }
      try {
        await integrationApi.pushEvent('PATCH', {
          provider: s.provider,
          calendarId: s.calendarId,
          externalEventId: s.externalEventId,
          title: block.title || '',
          start: block.start,
          end: block.end,
        });
        updatedSyncs.push(s);
      } catch (e) {
        console.warn('Update external failed:', e);
        updatedSyncs.push(s);
      }
    }

    // Luo uusia synkkoja write-kohteille joihin ei viel\u00e4 ole
    const have = new Set(updatedSyncs.map(s => `${s.provider}:${s.calendarId}`));
    for (const t of targets) {
      if (have.has(`${t.provider}:${t.calendarId}`)) continue;
      try {
        const res = await integrationApi.pushEvent('POST', {
          provider: t.provider,
          calendarId: t.calendarId,
          title: block.title || '',
          start: block.start,
          end: block.end,
        });
        updatedSyncs.push({
          provider: t.provider,
          calendarId: t.calendarId,
          externalEventId: res.externalEventId,
        });
      } catch (e) {
        console.warn('Create external failed:', e);
      }
    }

    // Tallenna uudet kent\u00e4t; tyhjenn\u00e4 legacy-kent\u00e4t
    block = {
      ...block,
      externalSyncs: updatedSyncs.length > 0 ? updatedSyncs : undefined,
      externalSource: undefined,
      externalCalendarId: undefined,
      externalEventId: undefined,
    };

    if (editing.isNew) {
      setBlocks(prev => [...prev, block]);
    } else {
      const baseId = block.id.split('@')[0];
      block.id = baseId;
      setBlocks(prev => prev.map(b => b.id === baseId ? block : b));
    }
    setEditing(null);
  };

  const startBlockMove = (
    e: React.MouseEvent,
    block: TimeBlock,
    dIdx: number,
  ) => {
    if (sleepDragRef.current || draftStartRef.current) return;
    e.stopPropagation();
    const startD = parseLocalDateTime(block.start);
    const endD = parseLocalDateTime(block.end);
    const startMin = startD.getHours() * 60 + startD.getMinutes();
    const durationMin = (endD.getTime() - startD.getTime()) / 60000;
    setMoveDrag({
      block,
      startX: e.clientX,
      startY: e.clientY,
      origDayIdx: dIdx,
      origStartMin: startMin,
      curDayIdx: dIdx,
      curStartMin: startMin,
      durationMin,
    });
    moveDragActiveRef.current = false;
  };

  const commitMove = async (md: NonNullable<typeof moveDrag>) => {
    const newDayDate = dayDates[md.curDayIdx];
    const newStart = new Date(newDayDate);
    newStart.setHours(Math.floor(md.curStartMin / 60), md.curStartMin % 60, 0, 0);
    const newEnd = new Date(newStart.getTime() + md.durationMin * 60000);
    const newStartIso = formatLocalDateTime(newStart);
    const newEndIso = formatLocalDateTime(newEnd);

    const baseId = md.block.id.split('@')[0];
    const isRecurring = md.block.recurrence && md.block.recurrence !== 'none';
    const occurrenceDate = md.block.id.includes('@') ? md.block.id.split('@')[1] : null;

    if (isRecurring && occurrenceDate) {
      // Siirrä vain tämä esiintymä: lisää poikkeus + luo uusi kerta-lohko
      const newBlock: TimeBlock = {
        ...md.block,
        id: newId(),
        recurrence: 'none',
        recurrenceUntil: undefined,
        recurrenceExclusions: undefined,
        start: newStartIso,
        end: newEndIso,
        externalSyncs: undefined,
        externalSource: undefined,
        externalCalendarId: undefined,
        externalEventId: undefined,
      };
      setBlocks(prev => {
        const updated = prev.map(b => {
          if (b.id !== baseId) return b;
          const list = new Set(b.recurrenceExclusions ?? []);
          list.add(occurrenceDate);
          return { ...b, recurrenceExclusions: Array.from(list) };
        });
        return [...updated, newBlock];
      });
      return;
    }

    // Ei toistuva: päivitä master + ulkoiset synkat
    setBlocks(prev => prev.map(b => b.id === baseId ? { ...b, start: newStartIso, end: newEndIso } : b));
    const syncs = getExternalSyncs(md.block);
    for (const s of syncs) {
      if (s.provider === 'apple') continue;
      try {
        await integrationApi.pushEvent('PATCH', {
          provider: s.provider,
          calendarId: s.calendarId,
          externalEventId: s.externalEventId,
          title: md.block.title || '',
          start: newStartIso,
          end: newEndIso,
        });
      } catch (e) {
        console.warn('Move external failed:', e);
      }
    }
  };

  const deleteBlock = async () => {
    if (!editing) return;
    const block = editing.block;
    const baseId = block.id.split('@')[0];
    const isRecurring = block.recurrence && block.recurrence !== 'none';
    const occurrenceDate = block.id.includes('@') ? block.id.split('@')[1] : null;

    // Toistuva esiintymä → kysy käyttäjältä mitä poistetaan
    if (isRecurring && occurrenceDate) {
      setRecurringDelete({ baseId, occurrenceDate });
      return;
    }

    // Ei toistuva tai master-id (ilman @) → poista koko sarja
    const syncs = getExternalSyncs(block);
    for (const s of syncs) {
      if (s.provider === 'apple') continue;
      try {
        await integrationApi.pushEvent('DELETE', {
          provider: s.provider,
          calendarId: s.calendarId,
          externalEventId: s.externalEventId,
        });
      } catch (e) {
        console.warn('Delete external failed:', e);
      }
    }
    setBlocks(prev => prev.filter(x => x.id !== baseId));
    setEditing(null);
  };

  /** Poista vain yksi esiintymä toistuvasta lohkosta. */
  const deleteSingleOccurrence = (baseId: string, dateIso: string) => {
    setBlocks(prev => prev.map(b => {
      if (b.id !== baseId) return b;
      const list = new Set(b.recurrenceExclusions ?? []);
      list.add(dateIso);
      return { ...b, recurrenceExclusions: Array.from(list) };
    }));
    setRecurringDelete(null);
    setEditing(null);
  };

  /** Poista tämä ja kaikki tulevat esiintymät → recurrenceUntil = previous day. */
  const deleteThisAndFuture = (baseId: string, dateIso: string) => {
    const d = parseLocalDate(dateIso);
    const prev = new Date(d);
    prev.setDate(prev.getDate() - 1);
    const untilIso = formatLocalDate(prev);
    setBlocks(prevBlocks => prevBlocks.map(b => {
      if (b.id !== baseId) return b;
      // Jos recurrenceUntil olisi ennen baseStartia, poista koko sarja
      const baseDay = parseLocalDateTime(b.start);
      const baseDayOnly = new Date(baseDay.getFullYear(), baseDay.getMonth(), baseDay.getDate());
      if (prev < baseDayOnly) {
        return null as unknown as TimeBlock;
      }
      return { ...b, recurrenceUntil: untilIso };
    }).filter(Boolean) as TimeBlock[]);
    setRecurringDelete(null);
    setEditing(null);
  };

  const cancelEdit = () => {
    setEditing(null);
  };

  // Tehtävän pudotus päivään
  const onDayDragOver = (e: React.DragEvent) => {
    if (dragTaskRef.current) e.preventDefault();
  };

  const onDayDrop = (dayIdx: number, e: React.DragEvent) => {
    e.preventDefault();
    const t = dragTaskRef.current;
    if (!t) return;
    dragTaskRef.current = null;

    // Pudota klo 09:00 1h kestolla, käyttäjä voi muokata
    const day = dayDates[dayIdx];
    const start = new Date(day);
    start.setHours(9, 0, 0, 0);
    const end = new Date(start.getTime() + 60 * 60_000);
    const newBlock: TimeBlock = {
      id: newId(),
      title: t.text,
      categoryId: categories[0]?.id,
      start: formatLocalDateTime(start),
      end: formatLocalDateTime(end),
      recurrence: 'none',
      sourceTaskId: t.id,
      sourceOrgId: t.orgId,
    };
    setEditing({ block: newBlock, isNew: true });
  };

  // Yhteenveto: omat lohkot + ulkoiset mapatut tapahtumat
  const summary = useMemo(() => {
    // Omat
    const perCat = hoursPerCategory(expanded);
    let usedExt = 0;
    // Mapatut ulkoiset — vain ne joilla on jokin liitetty kategoria
    const wkEnd = addDays(wkStart, 7);
    // Kerää kaikkien omien lohkojen synkkien externalEventId:t tuplalaskennan estoon
    const ownSyncIds = new Set<string>();
    for (const b of expanded) {
      for (const s of getExternalSyncs(b)) ownSyncIds.add(s.externalEventId);
    }
    for (const e of externalEvents) {
      const catId = externalCategoryFor(e);
      if (!catId) continue;
      const s = parseLocalDateTime(e.start);
      if (s < wkStart || s >= wkEnd) continue;
      if (ownSyncIds.has(e.externalEventId)) continue;
      const hours = Math.max(0,
        (parseLocalDateTime(e.end).getTime() - s.getTime()) / 3_600_000);
      perCat[catId] = (perCat[catId] || 0) + hours;
      usedExt += hours;
    }
    const sleepHours = sleepHoursInWeek(sleepEntries, wkStart, naps);
    const totalUsed =
      expanded.reduce((sum, b) => sum + blockHours(b), 0) + usedExt + sleepHours;
    const free = Math.max(0, 168 - totalUsed);
    return { perCat, free, sleepHours };
  }, [expanded, externalEvents, calendarToCategories, wkStart, sleepEntries]);

  const catColor = (id?: string) => categories.find(c => c.id === id)?.color || '#888';
  const catName = (id?: string) => fixMojibake(categories.find(c => c.id === id)?.name || (id ? '–' : 'Luokittelematon'));

  // Todo: yhteenveto tehtävistä joita voi vetää
  const draggableTasks = useMemo(() => {
    const personal = tasks.filter(t => !t.deletedAt && !t.done).slice(0, 6);
    const fromOrgs = assigned.slice(0, 6);
    return { personal, fromOrgs };
  }, [tasks, assigned]);

  // Apurit
  const wkLabel = `${formatLocalDate(wkStart)} – ${formatLocalDate(addDays(wkStart, 6))}`;

  // Slot-rivit (vasen kelloreuna)
  const hourLabels = useMemo(() => {
    const out: { slotIdx: number; label: string }[] = [];
    for (let s = 0; s < slotsPerDay; s++) {
      if ((startSlot0 + s) % slotsPerHour === 0) {
        out.push({ slotIdx: s, label: slotToTime(startSlot0 + s) });
      }
    }
    return out;
  }, [slotsPerDay, startSlot0]);

  return (
    <div style={{ padding: '0 36px 60px' }} onMouseUp={finishDraft} onMouseLeave={finishDraft}>
      {/* Otsikko + viikkonavigaatio */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 10, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 13, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--ink2)', margin: 0 }}>
            Viikko {wkLabel}
          </h2>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {(google || microsoft) && (
            <span style={{ fontSize: 10, color: 'var(--ink3)', alignSelf: 'center', letterSpacing: '.08em' }}>
              {externalLoading
                ? 'P\u00e4ivitet\u00e4\u00e4n\u2026'
                : lastFetchedAt
                  ? `Kalenterit p\u00e4ivitetty ${new Date(lastFetchedAt).toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' })}`
                  : ''}
            </span>
          )}
          <button onClick={() => setWeekOffset(o => o - 1)} style={navBtnStyle}>‹ Edellinen</button>
          <button onClick={() => setWeekOffset(0)} style={navBtnStyle}>Tämä viikko</button>
          <button onClick={() => setWeekOffset(o => o + 1)} style={navBtnStyle}>Seuraava ›</button>
          <button onClick={() => setShowImport(true)} style={navBtnStyle} title="Tuo Apple-kalenterista (leikepöydän kautta)">
            Tuo Apple-kalenterista
          </button>
          <button onClick={() => setNewNapOpen(true)} style={navBtnStyle} title="Lisää päiväuni">
            + Päiväuni
          </button>
        </div>
      </div>

      {showImport && (
        <AppleImportPanel
          existingCategories={categories}
          onClose={() => setShowImport(false)}
          onImport={(incomingEvents, incomingCategories) => {
            if (incomingCategories && incomingCategories.length > 0) {
              const existingIds = new Set(categories.map(c => c.id));
              const newCats = incomingCategories.filter(c => !existingIds.has(c.id));
              if (newCats.length > 0) {
                setCategories([...categories, ...newCats]);
              }
            }
            const byKey = (b: TimeBlock) => {
              const syncs = getExternalSyncs(b);
              return syncs[0]?.externalEventId || b.id;
            };
            const incomingKeys = new Set(incomingEvents.map(byKey));
            const merged = [
              ...blocks.filter(b => !incomingKeys.has(byKey(b))),
              ...incomingEvents,
            ];
            setBlocks(merged);
            setShowImport(false);
          }}
        />
      )}

      {/* Vetolähde-paneeli */}
      {(draggableTasks.personal.length > 0 || draggableTasks.fromOrgs.length > 0) && (
        <div style={{ border: '1px solid var(--rule)', padding: 12, marginBottom: 14, fontSize: 12 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: 8 }}>
            Vedä tehtävä viikkoon ajan varaamiseksi
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {draggableTasks.personal.map(t => (
              <div
                key={t.id}
                draggable
                onDragStart={() => { dragTaskRef.current = { id: t.id, text: t.text }; }}
                onDragEnd={() => { dragTaskRef.current = null; }}
                style={{ border: '1px dashed var(--ink2)', padding: '4px 8px', cursor: 'grab', background: 'var(--paper)' }}
              >
                {t.text}
              </div>
            ))}
            {draggableTasks.fromOrgs.map(t => (
              <div
                key={t.compositeId}
                draggable
                onDragStart={() => { dragTaskRef.current = { id: t.compositeId, text: t.text, orgId: t.orgId }; }}
                onDragEnd={() => { dragTaskRef.current = null; }}
                style={{ border: '1px dashed var(--ink2)', padding: '4px 8px', cursor: 'grab', background: 'var(--paper-l)' }}
                title={t.orgName || t.orgId}
              >
                {t.text} <span style={{ color: 'var(--ink3)', fontSize: 10 }}>· {t.orgName || t.orgId}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Viikkogridi */}
      <div style={{ display: 'grid', gridTemplateColumns: '50px repeat(7, 1fr)', border: '1px solid var(--rule)', userSelect: 'none' }}>
        {/* Otsakerivi */}
        <div />
        {dayDates.map((d, i) => (
          <div key={i} style={{ borderLeft: '1px solid var(--rule)', borderBottom: '1px solid var(--rule)', padding: '6px 8px', fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ink2)', textAlign: 'center' }}>
            {dayNames[i]} {d.getDate()}.{d.getMonth() + 1}.
          </div>
        ))}

        {/* Tunti-otsakkeet vasemmassa sarakkeessa */}
        <div style={{ position: 'relative', borderRight: '1px solid var(--rule)' }}>
          {hourLabels.map(h => (
            <div
              key={h.slotIdx}
              style={{
                position: 'absolute',
                top: h.slotIdx * SLOT_PX,
                right: 4,
                fontSize: 10,
                color: 'var(--ink3)',
                fontFamily: 'var(--font-display)',
              }}
            >
              {h.label}
            </div>
          ))}
          <div style={{ height: slotsPerDay * SLOT_PX }} />
        </div>

        {/* Päiväsarakkeet */}
        {dayDates.map((d, dIdx) => (
          <div
            key={dIdx}
            ref={(el) => { dayColumnRefs.current[dIdx] = el; }}
            onDragOver={onDayDragOver}
            onDrop={(e) => onDayDrop(dIdx, e)}
            style={{ position: 'relative', borderLeft: '1px solid var(--rule)', height: slotsPerDay * SLOT_PX }}
          >
            {/* Slotit klikkaus/veto */}
            {Array.from({ length: slotsPerDay }, (_, s) => (
              <div
                key={s}
                onMouseDown={() => { if (!sleepDragRef.current && !moveDrag) onSlotMouseDown(dIdx, s); }}
                onMouseEnter={() => { if (!sleepDragRef.current && !moveDrag) onSlotMouseEnter(dIdx, s); }}
                style={{
                  position: 'absolute',
                  top: s * SLOT_PX,
                  left: 0,
                  right: 0,
                  height: SLOT_PX,
                  borderTop: (startSlot0 + s) % slotsPerHour === 0 ? '1px solid var(--rule)' : '1px dotted var(--paper-d)',
                  cursor: 'crosshair',
                }}
              />
            ))}

            {/* Uni-lohkot (aamu + ilta) */}
            {sleepPortionsFor(dIdx).map((p, pi) => {
              const top = (p.fromMin / SLOT_MIN - startSlot0) * SLOT_PX;
              const height = ((p.toMin - p.fromMin) / SLOT_MIN) * SLOT_PX;
              const totalNight = nightHours(p.win.bedtime, p.win.waketime);
              const isEvening = p.kind === 'evening';
              const isMorning = p.kind === 'morning';
              const isSameDay = p.kind === 'sameDay';
              // Top handle muuttaa bedtimea (paitsi aamuosassa cross-midnight kun top edustaa keskiyötä — silloinkin bedtime drag toimii koska siirtää nukkumaanmenon aamutunteihin)
              const topDragKind: 'bedtime' | 'waketime' = 'bedtime';
              const bottomDragKind: 'bedtime' | 'waketime' = 'waketime';
              // Iltaosalla bottom-handle puuttuu (lohko menee 24:00 asti, ei drag-pistettä)
              const showTopHandle = isEvening || isMorning || isSameDay;
              const showBottomHandle = isMorning || isSameDay;
              return (
                <div
                  key={`sleep-${pi}`}
                  title={`Uni ${p.win.bedtime}–${p.win.waketime} (${totalNight.toFixed(1)} h)`}
                  style={{
                    position: 'absolute',
                    top, left: 0, right: 0, height,
                    background: 'linear-gradient(180deg, #d6e3ef 0%, #c2d4e6 100%)',
                    borderLeft: '3px solid #5a7fa8',
                    borderTop: showTopHandle ? '2px solid #5a7fa8' : '1px solid rgba(90,127,168,.25)',
                    borderBottom: showBottomHandle ? '2px solid #5a7fa8' : '1px solid rgba(90,127,168,.25)',
                    pointerEvents: 'none',
                    zIndex: 1,
                  }}
                >
                  <div style={{ fontSize: 10, color: '#2c4768', fontFamily: 'var(--font-display)', letterSpacing: '.06em', padding: '3px 8px', pointerEvents: 'none', fontWeight: 500 }}>
                    Uni {p.win.bedtime}–{p.win.waketime} · {totalNight.toFixed(1)} h
                  </div>
                  {showTopHandle && (
                    <div
                      onMouseDown={(e) => startSleepDrag(e, topDragKind, p.date, dayColumnRefs.current[dIdx])}
                      style={{ position: 'absolute', left: 0, right: 0, top: -5, height: 10, cursor: 'ns-resize', pointerEvents: 'auto', zIndex: 2 }}
                    />
                  )}
                  {showBottomHandle && (
                    <div
                      onMouseDown={(e) => startSleepDrag(e, bottomDragKind, p.date, dayColumnRefs.current[dIdx])}
                      style={{ position: 'absolute', left: 0, right: 0, bottom: -5, height: 10, cursor: 'ns-resize', pointerEvents: 'auto', zIndex: 2 }}
                    />
                  )}
                </div>
              );
            })}

            {/* Päiväunet */}
            {napsByDay[dIdx].map(n => {
              const live = napDraft?.id === n.id ? { start: napDraft.start, end: napDraft.end } : { start: n.start, end: n.end };
              const fromMin = parseHM(live.start);
              const toMin = parseHM(live.end);
              if (toMin <= fromMin) return null;
              const top = (fromMin / SLOT_MIN - startSlot0) * SLOT_PX;
              const height = ((toMin - fromMin) / SLOT_MIN) * SLOT_PX;
              const hours = (toMin - fromMin) / 60;
              return (
                <div
                  key={n.id}
                  title={`Päiväuni ${live.start}–${live.end} (${hours.toFixed(1)} h)`}
                  style={{
                    position: 'absolute',
                    top, left: 0, right: 0, height,
                    background: 'linear-gradient(180deg, #d6e3ef 0%, #c2d4e6 100%)',
                    borderLeft: '3px solid #5a7fa8',
                    borderTop: '2px solid #5a7fa8',
                    borderBottom: '2px solid #5a7fa8',
                    pointerEvents: 'none',
                    zIndex: 1,
                  }}
                >
                  <div style={{ fontSize: 10, color: '#2c4768', fontFamily: 'var(--font-display)', letterSpacing: '.06em', padding: '3px 8px', pointerEvents: 'none', fontWeight: 500, display: 'flex', justifyContent: 'space-between', gap: 4 }}>
                    <span>Uni {live.start}–{live.end} · {hours.toFixed(1)} h</span>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); if (confirm('Poistetaanko päiväuni?')) deleteNap(n.id); }}
                    title="Poista"
                    style={{
                      position: 'absolute', top: 2, right: 2,
                      width: 16, height: 16, fontSize: 11, lineHeight: '14px',
                      background: 'rgba(255,255,255,.7)', color: '#2c4768',
                      border: '1px solid rgba(90,127,168,.4)', cursor: 'pointer',
                      pointerEvents: 'auto', zIndex: 3, padding: 0,
                    }}
                  >×</button>
                  <div
                    onMouseDown={(e) => startNapDrag(e, 'nap-start', n.id, dayColumnRefs.current[dIdx])}
                    style={{ position: 'absolute', left: 0, right: 0, top: -5, height: 10, cursor: 'ns-resize', pointerEvents: 'auto', zIndex: 2 }}
                  />
                  <div
                    onMouseDown={(e) => startNapDrag(e, 'nap-end', n.id, dayColumnRefs.current[dIdx])}
                    style={{ position: 'absolute', left: 0, right: 0, bottom: -5, height: 10, cursor: 'ns-resize', pointerEvents: 'auto', zIndex: 2 }}
                  />
                </div>
              );
            })}

            {/* Ulkoiset kalenteritapahtumat (haalea raidallinen tausta) */}
            {externalByDay[dIdx].map(e => {
              const startD = parseLocalDateTime(e.start);
              const endD = parseLocalDateTime(e.end);
              const startSlotAbs = (startD.getHours() * 60 + startD.getMinutes()) / SLOT_MIN;
              const endSlotAbs = (endD.getHours() * 60 + endD.getMinutes()) / SLOT_MIN;
              const top = (startSlotAbs - startSlot0) * SLOT_PX;
              const height = Math.max(SLOT_PX - 2, (endSlotAbs - startSlotAbs) * SLOT_PX - 2);
              const catId = externalCategoryFor(e);
              const baseColor = catId ? catColor(catId) : (e.source === 'google' ? '#4285f4' : '#0078d4');
              return (
                <div
                  key={e.id}
                  title={`${fixMojibake(e.title)}\n${e.source === 'google' ? 'Google' : 'Microsoft'}`}
                  style={{
                    position: 'absolute',
                    top, left: 'calc(50% + 1px)', right: 2, height,
                    background: `repeating-linear-gradient(45deg, ${hexWithAlpha(baseColor, 0.12)} 0 6px, ${hexWithAlpha(baseColor, 0.05)} 6px 12px)`,
                    borderLeft: `2px dashed ${baseColor}`,
                    padding: '2px 4px', fontSize: 10, color: 'var(--ink2)',
                    overflow: 'hidden', pointerEvents: 'auto', cursor: 'default',
                  }}
                >
                  <div style={{ lineHeight: 1.1, fontStyle: 'italic' }}>{fixMojibake(e.title)}</div>
                  <div style={{ fontSize: 9, color: 'var(--ink3)' }}>
                    {e.source === 'google' ? 'G' : 'MS'} · {slotToTime(startSlotAbs)}
                  </div>
                </div>
              );
            })}

            {/* Olemassaolevat lohkot */}
            {visibleByDay[dIdx].map(b => {
              const isDragging = moveDrag && moveDragActiveRef.current && moveDrag.block.id === b.id;
              let startSlotAbs: number;
              let endSlotAbs: number;
              if (isDragging && moveDrag) {
                startSlotAbs = moveDrag.curStartMin / SLOT_MIN;
                endSlotAbs = (moveDrag.curStartMin + moveDrag.durationMin) / SLOT_MIN;
              } else {
                const startD = parseLocalDateTime(b.start);
                const endD = parseLocalDateTime(b.end);
                startSlotAbs = (startD.getHours() * 60 + startD.getMinutes()) / SLOT_MIN;
                endSlotAbs = (endD.getHours() * 60 + endD.getMinutes()) / SLOT_MIN;
              }
              const top = (startSlotAbs - startSlot0) * SLOT_PX;
              const height = Math.max(SLOT_PX - 2, (endSlotAbs - startSlotAbs) * SLOT_PX - 2);
              const color = catColor(b.categoryId);
              const conflict = !isDragging && overlapsExternal(b);
              return (
                <div
                  key={b.id}
                  onMouseDown={(e) => startBlockMove(e, b, dIdx)}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (blockClickSuppressRef.current) {
                      blockClickSuppressRef.current = false;
                      return;
                    }
                    setEditing({ block: b, isNew: false });
                  }}
                  style={{
                    position: 'absolute',
                    top,
                    left: 2,
                    right: externalByDay[dIdx].length > 0 ? 'calc(50% + 1px)' : 2,
                    height,
                    background: hexWithAlpha(color, b.done ? 0.3 : 0.18),
                    borderLeft: `3px solid ${color}`,
                    boxShadow: conflict ? 'inset 0 0 0 1px #e45c81' : (isDragging ? '0 4px 12px rgba(0,0,0,.2)' : undefined),
                    padding: '3px 6px',
                    fontSize: 11,
                    color: 'var(--ink)',
                    cursor: isDragging ? 'grabbing' : 'grab',
                    overflow: 'hidden',
                    textDecoration: b.done ? 'line-through' : 'none',
                    opacity: isDragging ? 0.85 : 1,
                    zIndex: isDragging ? 5 : undefined,
                    userSelect: 'none',
                  }}
                >
                  <div style={{ fontWeight: 500, lineHeight: 1.2 }}>
                    {fixMojibake(b.title) || catName(b.categoryId)}
                    {conflict && <span title="P\u00e4\u00e4llekk\u00e4in ulkoisen tapahtuman kanssa" style={{ color: '#e45c81', marginLeft: 4 }}>!</span>}
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--ink3)', letterSpacing: '.06em' }}>
                    {slotToTime(startSlotAbs)}–{slotToTime(endSlotAbs)}
                    {b.recurrence && b.recurrence !== 'none' && ' ↻'}
                    {(() => {
                      const syncs = getExternalSyncs(b);
                      if (syncs.length === 0) return null;
                      const labels = syncs.map(s => s.provider === 'google' ? 'Google' : s.provider === 'microsoft' ? 'Microsoft' : 'Apple');
                      return <span title={`Synkronoitu: ${labels.join(', ')}`}> ⇆{syncs.length > 1 ? `×${syncs.length}` : ''}</span>;
                    })()}
                  </div>
                </div>
              );
            })}

            {/* Drag-luontiluonnos */}
            {draft && draft.dayIdx === dIdx && (
              <div
                style={{
                  position: 'absolute',
                  top: draft.startSlot * SLOT_PX,
                  left: 2, right: 2,
                  height: (draft.endSlot - draft.startSlot) * SLOT_PX - 2,
                  background: 'rgba(0,0,0,.08)',
                  border: '1px dashed var(--ink2)',
                  pointerEvents: 'none',
                }}
              />
            )}
          </div>
        ))}
      </div>

      {/* Yhteenveto */}
      <div style={{ marginTop: 24, border: '1px solid var(--rule)', padding: 16 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--ink2)', marginBottom: 10 }}>
          Viikon ajankäyttö
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {Object.entries(summary.perCat)
            .sort(([, a], [, b]) => b - a)
            .map(([catId, hours]) => {
            const pct = (hours / 168) * 100;
            return (
              <div key={catId} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 12, height: 12, background: catColor(catId === '__none__' ? undefined : catId) }} />
                <span style={{ flex: 1, fontSize: 12 }}>{catName(catId === '__none__' ? undefined : catId)}</span>
                <div style={{ width: 200, height: 8, background: 'var(--paper-d)', position: 'relative' }}>
                  <div style={{ position: 'absolute', inset: 0, width: `${Math.min(100, pct)}%`, background: catColor(catId === '__none__' ? undefined : catId) }} />
                </div>
                <span style={{ width: 70, textAlign: 'right', fontFamily: 'var(--font-display)', fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>
                  {hours.toFixed(1)} h
                </span>
              </div>
            );
          })}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--rule)' }}>
            <span style={{ width: 12, height: 12, background: '#3b3b5c' }} />
            <span style={{ flex: 1, fontSize: 12 }}>Uni</span>
            <div style={{ width: 200, height: 8, background: 'var(--paper-d)', position: 'relative' }}>
              <div style={{ position: 'absolute', inset: 0, width: `${(summary.sleepHours / 168) * 100}%`, background: '#3b3b5c' }} />
            </div>
            <span style={{ width: 70, textAlign: 'right', fontFamily: 'var(--font-display)', fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>
              {summary.sleepHours.toFixed(1)} h
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 12, height: 12, background: 'transparent', border: '1px solid var(--ink2)' }} />
            <span style={{ flex: 1, fontSize: 12, fontWeight: 500 }}>Määrittelemätön</span>
            <div style={{ width: 200, height: 8, background: 'var(--paper-d)', position: 'relative' }}>
              <div style={{ position: 'absolute', inset: 0, width: `${(summary.free / 168) * 100}%`, background: 'var(--ink2)' }} />
            </div>
            <span style={{ width: 70, textAlign: 'right', fontFamily: 'var(--font-display)', fontVariantNumeric: 'tabular-nums', fontSize: 12, fontWeight: 500 }}>
              {summary.free.toFixed(1)} h
            </span>
          </div>
        </div>
      </div>

      {/* Trendit */}
      {(() => {
        // Kaikki avaimet trendien valikkoa varten: kategoriat joilla on dataa
        // tällä viikolla tai 12 viikon historiassa, sekä Uni ja Määrittelemätön.
        const allKeys = new Set<string>();
        for (const k of Object.keys(summary.perCat)) allKeys.add(k);
        for (const w of weeklySummaries) for (const k of Object.keys(w.perCat)) allKeys.add(k);
        allKeys.add(SLEEP_KEY);
        allKeys.add(FREE_KEY);

        const keyLabel = (key: string): string =>
          key === SLEEP_KEY ? 'Uni'
          : key === FREE_KEY ? 'Määrittelemätön'
          : catName(key === '__none__' ? undefined : key);
        const keyColor = (key: string): string =>
          key === SLEEP_KEY ? '#3b3b5c'
          : key === FREE_KEY ? '#d6d3c4'
          : catColor(key === '__none__' ? undefined : key);

        // Järjestä valikko: kategoriat eniten→vähiten tämän viikon mukaan, sitten Uni + Määrittelemätön
        const catKeys = Array.from(allKeys)
          .filter(k => k !== SLEEP_KEY && k !== FREE_KEY)
          .sort((a, b) => (summary.perCat[b] || 0) - (summary.perCat[a] || 0));
        const orderedKeys = [...catKeys, SLEEP_KEY, FREE_KEY];

        const cur = weeklySummaries[weeklySummaries.length - 1];
        const prev = weeklySummaries[weeklySummaries.length - 2];

        // Pie-slicet: vain aktiiviset
        const pieSlices = [
          ...Object.entries(summary.perCat)
            .filter(([k]) => isTrendActive(k))
            .sort(([, a], [, b]) => b - a)
            .map(([catId, hours]) => ({
              label: catName(catId === '__none__' ? undefined : catId),
              value: hours,
              color: catColor(catId === '__none__' ? undefined : catId),
            })),
          ...(isTrendActive(SLEEP_KEY) ? [{ label: 'Uni', value: summary.sleepHours, color: '#3b3b5c' }] : []),
          ...(isTrendActive(FREE_KEY) ? [{ label: 'Määrittelemätön', value: summary.free, color: '#d6d3c4' }] : []),
        ];

        return (
          <div style={{ marginTop: 24, border: '1px solid var(--rule)', padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--ink2)' }}>
                Trendit
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  onClick={() => setTrendInactive(new Set())}
                  style={{ fontFamily: 'var(--font-display)', fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', background: 'transparent', border: '1px solid var(--rule)', padding: '4px 8px', cursor: 'pointer', color: 'var(--ink2)' }}
                >
                  Kaikki
                </button>
                <button
                  type="button"
                  onClick={() => setTrendInactive(new Set(orderedKeys))}
                  style={{ fontFamily: 'var(--font-display)', fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', background: 'transparent', border: '1px solid var(--rule)', padding: '4px 8px', cursor: 'pointer', color: 'var(--ink2)' }}
                >
                  Ei mitään
                </button>
              </div>
            </div>

            {/* Toggle-rivi */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
              {orderedKeys.map(key => {
                const active = isTrendActive(key);
                const color = keyColor(key);
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggleTrend(key)}
                    aria-pressed={active}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '4px 10px',
                      fontSize: 11,
                      fontFamily: 'var(--font-display)', letterSpacing: '.04em',
                      background: active ? 'var(--paper-l)' : 'transparent',
                      color: active ? 'var(--ink)' : 'var(--ink3)',
                      border: `1px solid ${active ? color : 'var(--rule)'}`,
                      cursor: 'pointer',
                      textDecoration: active ? 'none' : 'line-through',
                      opacity: active ? 1 : 0.65,
                    }}
                  >
                    <span style={{ display: 'inline-block', width: 8, height: 8, background: color, opacity: active ? 1 : 0.3 }} />
                    {keyLabel(key)}
                  </button>
                );
              })}
            </div>

            {/* Tämä vs viime viikko -delta-rivit (vain aktiiviset) */}
            {prev && (() => {
              const allCatIds = new Set<string>([...Object.keys(cur.perCat), ...Object.keys(prev.perCat)]);
              const deltas = Array.from(allCatIds)
                .filter(id => isTrendActive(id))
                .map(id => ({
                  id,
                  label: catName(id === '__none__' ? undefined : id),
                  color: catColor(id === '__none__' ? undefined : id),
                  cur: cur.perCat[id] || 0,
                  delta: (cur.perCat[id] || 0) - (prev.perCat[id] || 0),
                }));
              const top = deltas
                .filter(d => Math.abs(d.delta) >= 0.25)
                .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
                .slice(0, 4);
              if (top.length === 0) return null;
              return (
                <div style={{ marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                  {top.map(d => {
                    const sign = d.delta > 0 ? '+' : '−';
                    const color = d.delta > 0 ? '#185e5b' : '#c14545';
                    return (
                      <div key={d.id} style={{ flex: '0 0 auto', minWidth: 140, display: 'flex', flexDirection: 'column', gap: 2, padding: '8px 10px', borderLeft: `3px solid ${d.color}`, background: 'var(--paper-l)' }}>
                        <div style={{ fontSize: 11, color: 'var(--ink2)' }}>{d.label}</div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                          <span style={{ fontFamily: 'var(--font-display)', fontVariantNumeric: 'tabular-nums', fontSize: 18, color: 'var(--ink)' }}>
                            {d.cur.toFixed(1)} h
                          </span>
                          <span style={{ fontFamily: 'var(--font-display)', fontVariantNumeric: 'tabular-nums', fontSize: 11, color }}>
                            {sign}{Math.abs(d.delta).toFixed(1)} h
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            <div style={{ display: 'flex', gap: 32, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div style={{ flexShrink: 0 }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 9, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: 8 }}>
                  Tämä viikko
                </div>
                <PieChart slices={pieSlices} />
              </div>
              <div style={{ flex: 1, minWidth: 380 }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 9, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink3)', marginBottom: 8 }}>
                  Aktiiviset kategoriat · {TREND_WEEKS} viikkoa
                </div>
                <WeeklyLineChart
                  weeks={weeklySummaries}
                  categories={categories}
                  isActive={isTrendActive}
                  sleepKey={SLEEP_KEY}
                />
              </div>
            </div>
          </div>
        );
      })()}

      {/* Toistuvan poiston valinta */}
      {recurringDelete && (
        <RecurringDeleteDialog
          dateIso={recurringDelete.occurrenceDate}
          onlyThis={() => deleteSingleOccurrence(recurringDelete.baseId, recurringDelete.occurrenceDate)}
          thisAndFuture={() => deleteThisAndFuture(recurringDelete.baseId, recurringDelete.occurrenceDate)}
          onCancel={() => setRecurringDelete(null)}
        />
      )}

      {/* Päiväuni-modal */}
      {newNapOpen && (
        <NewNapDialog
          defaultDate={formatLocalDate(dayDates[0])}
          onCancel={() => setNewNapOpen(false)}
          onSave={(nap) => { addNap(nap); setNewNapOpen(false); }}
        />
      )}

      {/* Editori-modal */}
      {editing && (
        <BlockEditor
          state={editing}
          categories={categories}
          onCreateCategory={(name, color) => {
            const id = `cat-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
            const cat: PersonalCategory = { id, name, color };
            setCategories([...categories, cat]);
            return id;
          }}
          onChange={(block) => setEditing({ ...editing, block })}
          onSave={saveBlock}
          onDelete={deleteBlock}
          onCancel={cancelEdit}
          onCompleteSourceTask={editing.block.sourceTaskId && !editing.block.sourceOrgId ? () => {
            // Henkilökohtainen tehtävä — merkitse tehdyksi
            setTasks(prev => prev.map(t => t.id === editing.block.sourceTaskId
              ? { ...t, done: true, completedAt: Date.now() }
              : t));
            setEditing({ ...editing, block: { ...editing.block, done: true, locked: true } });
          } : undefined}
        />
      )}
    </div>
  );
}

const navBtnStyle: React.CSSProperties = {
  fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase',
  background: 'transparent', border: '1px solid var(--rule)', padding: '6px 12px', cursor: 'pointer', color: 'var(--ink)',
};

const NEW_CATEGORY_PALETTE = [
  '#056b9f', '#e45c81', '#185e5b', '#f1b434',
  '#9b7cf6', '#f09a52', '#3788b2', '#2a8a86',
  '#c14545', '#7a5fb0', '#cc7a35', '#5b9b3f',
];

function BlockEditor({
  state, categories, onCreateCategory, onChange, onSave, onDelete, onCancel, onCompleteSourceTask,
}: {
  state: BlockEditState;
  categories: PersonalCategory[];
  onCreateCategory: (name: string, color: string) => string;
  onChange: (block: TimeBlock) => void;
  onSave: () => void;
  onDelete: () => void;
  onCancel: () => void;
  onCompleteSourceTask?: () => void;
}) {
  const b = state.block;
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatColor, setNewCatColor] = useState(NEW_CATEGORY_PALETTE[0]);

  const submitNewCategory = () => {
    const name = newCatName.trim();
    if (!name) return;
    const id = onCreateCategory(name, newCatColor);
    onChange({ ...b, categoryId: id });
    setCreatingCategory(false);
    setNewCatName('');
    setNewCatColor(NEW_CATEGORY_PALETTE[0]);
  };
  const startD = parseLocalDateTime(b.start);
  const endD = parseLocalDateTime(b.end);
  const dateStr = formatLocalDate(startD);
  const startTime = `${String(startD.getHours()).padStart(2, '0')}:${String(startD.getMinutes()).padStart(2, '0')}`;
  const endTime = `${String(endD.getHours()).padStart(2, '0')}:${String(endD.getMinutes()).padStart(2, '0')}`;

  const updateTime = (newStart: string, newEnd: string, newDate: string) => {
    const d = parseLocalDate(newDate);
    const [sh, sm] = newStart.split(':').map(n => parseInt(n, 10) || 0);
    const [eh, em] = newEnd.split(':').map(n => parseInt(n, 10) || 0);
    const s = new Date(d); s.setHours(sh, sm, 0, 0);
    const e = new Date(d); e.setHours(eh, em, 0, 0);
    onChange({ ...b, start: formatLocalDateTime(s), end: formatLocalDateTime(e) });
  };

  return (
    <div
      onClick={onCancel}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: 'var(--paper)', border: '1px solid var(--rule)', padding: 24, width: 'min(440px, 100%)', display: 'flex', flexDirection: 'column', gap: 12 }}
      >
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 12, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--ink2)', margin: 0 }}>
          {state.isNew ? 'Uusi aikalohko' : 'Muokkaa lohkoa'}
        </h3>

        <input
          autoFocus
          value={b.title}
          onChange={e => onChange({ ...b, title: e.target.value })}
          placeholder="Mitä teet?"
          style={{ background: 'transparent', border: '1px solid var(--rule)', padding: '8px 10px', fontFamily: 'var(--font-display)', fontSize: 14, color: 'var(--ink)' }}
        />

        <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
          <select
            value={b.categoryId || ''}
            onChange={e => {
              if (e.target.value === '__new__') {
                setCreatingCategory(true);
                return;
              }
              onChange({ ...b, categoryId: e.target.value || undefined });
            }}
            style={{ flex: 1, background: 'transparent', border: '1px solid var(--rule)', padding: '6px 8px', fontFamily: 'var(--font-display)', fontSize: 12, color: 'var(--ink)' }}
          >
            <option value="">— elämän alue —</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            <option value="__new__">+ Uusi alue…</option>
          </select>
          {b.categoryId && (
            <span
              style={{
                width: 24, alignSelf: 'stretch',
                background: categories.find(c => c.id === b.categoryId)?.color || 'var(--ink3)',
                border: '1px solid var(--rule)',
              }}
              title="Alueen väri"
            />
          )}
        </div>

        {creatingCategory && (
          <div style={{ border: '1px dashed var(--ink3)', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--ink3)' }}>
              Uusi elämän alue
            </div>
            <input
              autoFocus
              value={newCatName}
              onChange={e => setNewCatName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') submitNewCategory(); }}
              placeholder="Esim. Liikunta, Perhe, Aivovammaliitto"
              style={{ background: 'transparent', border: '1px solid var(--rule)', padding: '6px 8px', fontFamily: 'var(--font-display)', fontSize: 13, color: 'var(--ink)' }}
            />
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {NEW_CATEGORY_PALETTE.map(col => (
                <button
                  key={col}
                  type="button"
                  onClick={() => setNewCatColor(col)}
                  aria-label={`Väri ${col}`}
                  style={{
                    width: 24, height: 24, padding: 0,
                    background: col,
                    border: newCatColor === col ? '2px solid var(--ink)' : '1px solid var(--rule)',
                    cursor: 'pointer',
                  }}
                />
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={submitNewCategory}
                disabled={!newCatName.trim()}
                style={{
                  fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '.16em', textTransform: 'uppercase',
                  background: newCatName.trim() ? 'var(--ink)' : 'transparent',
                  color: newCatName.trim() ? 'var(--paper)' : 'var(--ink3)',
                  border: newCatName.trim() ? 'none' : '1px solid var(--rule)',
                  padding: '6px 12px',
                  cursor: newCatName.trim() ? 'pointer' : 'not-allowed',
                }}
              >
                Luo alue
              </button>
              <button
                type="button"
                onClick={() => { setCreatingCategory(false); setNewCatName(''); }}
                style={{ fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '.16em', textTransform: 'uppercase', background: 'transparent', color: 'var(--ink2)', border: '1px solid var(--rule)', padding: '6px 12px', cursor: 'pointer' }}
              >
                Peruuta
              </button>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="date"
            value={dateStr}
            onChange={e => updateTime(startTime, endTime, e.target.value)}
            style={inputStyle}
          />
          <input
            type="time"
            value={startTime}
            onChange={e => updateTime(e.target.value, endTime, dateStr)}
            style={inputStyle}
          />
          <span style={{ color: 'var(--ink3)' }}>–</span>
          <input
            type="time"
            value={endTime}
            onChange={e => updateTime(startTime, e.target.value, dateStr)}
            style={inputStyle}
          />
        </div>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ink2)' }}>
          Toisto
          <select
            value={b.recurrence || 'none'}
            onChange={e => onChange({ ...b, recurrence: e.target.value as Recurrence })}
            style={inputStyle}
          >
            <option value="none">Ei toistoa</option>
            <option value="daily">Päivittäin</option>
            <option value="weekly">Viikoittain (sama viikonpäivä)</option>
            <option value="biweekly">Joka toinen viikko</option>
            <option value="monthly">Kuukausittain (sama päivä kuukaudesta)</option>
          </select>
        </label>

        {b.recurrence && b.recurrence !== 'none' && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ink2)' }}>
            Toisto loppuu (valinnainen)
            <input
              type="date"
              value={b.recurrenceUntil || ''}
              onChange={e => onChange({ ...b, recurrenceUntil: e.target.value || undefined })}
              style={inputStyle}
            />
          </label>
        )}

        {b.sourceTaskId && (
          <div style={{ background: 'var(--paper-l)', padding: 10, fontSize: 11, color: 'var(--ink2)', borderLeft: '3px solid var(--accent)' }}>
            Lohko on linkitetty tehtävään.{onCompleteSourceTask && !b.done && (
              <button onClick={onCompleteSourceTask} style={{ marginLeft: 8, fontFamily: 'var(--font-display)', fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', background: 'var(--ink)', color: 'var(--paper)', border: 'none', padding: '4px 8px', cursor: 'pointer' }}>
                Merkitse tehty
              </button>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <button onClick={onSave} style={{ fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '.16em', textTransform: 'uppercase', background: 'var(--ink)', color: 'var(--paper)', border: 'none', padding: '8px 16px', cursor: 'pointer' }}>
            Tallenna
          </button>
          {!state.isNew && (
            <button onClick={onDelete} style={{ fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '.16em', textTransform: 'uppercase', background: 'transparent', color: '#e45c81', border: '1px solid #e45c81', padding: '8px 16px', cursor: 'pointer' }}>
              Poista
            </button>
          )}
          <button onClick={onCancel} style={{ marginLeft: 'auto', fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '.16em', textTransform: 'uppercase', background: 'transparent', color: 'var(--ink2)', border: '1px solid var(--rule)', padding: '8px 16px', cursor: 'pointer' }}>
            Peruuta
          </button>
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  background: 'transparent', border: '1px solid var(--rule)', padding: '6px 8px',
  fontFamily: 'var(--font-display)', fontSize: 12, color: 'var(--ink)',
};

function AppleImportPanel({
  existingCategories,
  onClose,
  onImport,
}: {
  existingCategories: PersonalCategory[];
  onClose: () => void;
  onImport: (events: TimeBlock[], categories?: PersonalCategory[]) => void;
}) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [parsedEvents, setParsedEvents] = useState<TimeBlock[] | null>(null);
  const [parsedCategories, setParsedCategories] = useState<PersonalCategory[] | null>(null);

  const tryParse = (raw: string) => {
    setError(null);
    setParsedEvents(null);
    setParsedCategories(null);
    if (!raw.trim()) return;
    try {
      const data = JSON.parse(raw);
      let eventsArr: any[];
      let categoriesArr: any[] | undefined;
      if (Array.isArray(data)) {
        eventsArr = data;
      } else if (data && typeof data === 'object' && Array.isArray(data.events)) {
        eventsArr = data.events;
        if (Array.isArray(data.categories)) categoriesArr = data.categories;
      } else {
        throw new Error('Odotettiin lista tai { events, categories }');
      }
      const okEvents: TimeBlock[] = [];
      for (const e of eventsArr) {
        if (typeof e?.title !== 'string' || typeof e?.start !== 'string' || typeof e?.end !== 'string') {
          throw new Error('Tapahtumalta puuttuu title/start/end');
        }
        const provider: 'apple' | 'google' | 'microsoft' = e.externalSource || 'apple';
        const calendarId: string | undefined = e.externalCalendarId;
        const externalEventId: string | undefined = e.externalEventId;
        const externalSyncs = (calendarId && externalEventId)
          ? [{ provider, calendarId, externalEventId }]
          : undefined;
        okEvents.push({
          id: e.id || `apple-${Math.random().toString(36).slice(2, 10)}`,
          title: e.title,
          start: e.start,
          end: e.end,
          recurrence: e.recurrence || 'none',
          externalSyncs,
          categoryId: e.categoryId,
        });
      }
      setParsedEvents(okEvents);

      if (categoriesArr) {
        const okCats: PersonalCategory[] = [];
        for (const c of categoriesArr) {
          if (typeof c?.id !== 'string' || typeof c?.name !== 'string' || typeof c?.color !== 'string') continue;
          okCats.push({ id: c.id, name: c.name, color: c.color, icon: c.icon });
        }
        setParsedCategories(okCats);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Virheellinen JSON');
    }
  };

  const newCategoryCount = parsedCategories
    ? parsedCategories.filter(c => !existingCategories.some(x => x.id === c.id)).length
    : 0;

  const pasteFromClipboard = async () => {
    try {
      const t = await navigator.clipboard.readText();
      setText(t);
      tryParse(t);
    } catch {
      setError('Leikepöydän luku epäonnistui — liitä käsin tekstialueeseen.');
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: 'var(--paper)', border: '1px solid var(--rule)', padding: 20, width: 'min(640px, 92vw)', maxHeight: '88vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}
      >
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 13, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--ink2)' }}>
          Tuo Apple-kalenterista
        </div>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--ink3)' }}>
          Suorita ensin Macilla skripti <code>scripts/sync-apple-calendar.sh</code> — se lukee kalenterisi ja kopioi tapahtumat leikepöydälle JSON-muodossa. Liitä se tähän tai paina Liitä leikepöydältä.
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={pasteFromClipboard} style={{ ...inputStyle, cursor: 'pointer', fontFamily: 'var(--font-display)', letterSpacing: '.14em', textTransform: 'uppercase', fontSize: 11, padding: '6px 12px' }}>
            Liitä leikepöydältä
          </button>
        </div>
        <textarea
          value={text}
          onChange={(e) => { setText(e.target.value); tryParse(e.target.value); }}
          placeholder='[{"title":"...","start":"2026-04-27T09:00","end":"2026-04-27T10:00",...}]'
          rows={10}
          style={{ width: '100%', background: 'transparent', border: '1px solid var(--rule)', padding: 10, fontFamily: 'monospace', fontSize: 12, color: 'var(--ink)', resize: 'vertical' }}
        />
        {error && <div style={{ color: '#c14545', fontSize: 12 }}>Virhe: {error}</div>}
        {parsedEvents && (
          <div style={{ fontSize: 12, color: 'var(--ink2)' }}>
            {parsedEvents.length} tapahtumaa valmiina tuotavaksi. Olemassa olevat samalla externalEventId:llä korvataan.
            {parsedCategories && parsedCategories.length > 0 && (
              <> Lisätään {newCategoryCount} uutta elämänaluetta ({parsedCategories.length - newCategoryCount} jo olemassa).</>
            )}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button
            onClick={() => parsedEvents && onImport(parsedEvents, parsedCategories || undefined)}
            disabled={!parsedEvents || parsedEvents.length === 0}
            style={{ fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '.16em', textTransform: 'uppercase', background: parsedEvents && parsedEvents.length > 0 ? 'var(--ink)' : 'transparent', color: parsedEvents && parsedEvents.length > 0 ? 'var(--paper)' : 'var(--ink3)', border: parsedEvents && parsedEvents.length > 0 ? 'none' : '1px solid var(--rule)', padding: '8px 16px', cursor: parsedEvents && parsedEvents.length > 0 ? 'pointer' : 'not-allowed' }}
          >
            Tuo {parsedEvents?.length || 0} tapahtumaa
          </button>
          <button onClick={onClose} style={{ marginLeft: 'auto', fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '.16em', textTransform: 'uppercase', background: 'transparent', color: 'var(--ink2)', border: '1px solid var(--rule)', padding: '8px 16px', cursor: 'pointer' }}>
            Sulje
          </button>
        </div>
      </div>
    </div>
  );
}

function PieChart({ slices, size = 280 }: {
  slices: { label: string; value: number; color: string }[];
  size?: number;
}) {
  const filtered = slices.filter(s => s.value > 0);
  const total = filtered.reduce((s, x) => s + x.value, 0);
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 4;

  if (total <= 0) {
    return <div style={{ fontSize: 11, color: 'var(--ink3)' }}>Ei dataa</div>;
  }

  if (filtered.length === 1) {
    const only = filtered[0];
    return (
      <svg width={size} height={size} style={{ display: 'block' }}>
        <circle cx={cx} cy={cy} r={r} fill={only.color}>
          <title>{only.label}: {only.value.toFixed(1)} h (100%)</title>
        </circle>
        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" fontSize={13} fill="var(--paper)" fontWeight={600}>
          {only.value.toFixed(1)}h
        </text>
      </svg>
    );
  }

  // Yhdistä pienet (<3% kokonaisuudesta) "Muut"-luokaksi
  const minPct = 0.03;
  const big = filtered.filter(s => s.value / total >= minPct);
  const small = filtered.filter(s => s.value / total < minPct);
  const merged = small.length > 0
    ? [...big, { label: 'Muut', value: small.reduce((a, b) => a + b.value, 0), color: '#a8a89a' }]
    : big;

  let cum = -Math.PI / 2;
  const slicesEls: React.ReactNode[] = [];
  const insideLabels: React.ReactNode[] = [];

  merged.forEach((s, i) => {
    const angle = (s.value / total) * 2 * Math.PI;
    const x1 = cx + r * Math.cos(cum);
    const y1 = cy + r * Math.sin(cum);
    const startAngle = cum;
    cum += angle;
    const x2 = cx + r * Math.cos(cum);
    const y2 = cy + r * Math.sin(cum);
    const large = angle > Math.PI ? 1 : 0;
    const d = `M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${large} 1 ${x2},${y2} Z`;
    const pct = (s.value / total) * 100;
    slicesEls.push(
      <path key={`slice-${i}`} d={d} fill={s.color} stroke="var(--paper)" strokeWidth={1.5}>
        <title>{s.label}: {s.value.toFixed(1)} h ({pct.toFixed(0)}%)</title>
      </path>
    );

    // Sisälabeli isoille slicille (≥7%): tunnit + prosentti
    if (pct >= 7) {
      const midAngle = startAngle + angle / 2;
      const innerR = r * 0.65;
      const ix = cx + innerR * Math.cos(midAngle);
      const iy = cy + innerR * Math.sin(midAngle);
      insideLabels.push(
        <g key={`in-${i}`}>
          <text x={ix} y={iy - 1} fontSize={11} textAnchor="middle" fill="rgba(0,0,0,.7)" fontWeight={600}>
            {s.value.toFixed(1)}h
          </text>
          <text x={ix} y={iy + 11} fontSize={9} textAnchor="middle" fill="rgba(0,0,0,.55)">
            {pct.toFixed(0)}%
          </text>
        </g>
      );
    }
  });

  return (
    <svg width={size} height={size} style={{ display: 'block' }}>
      {slicesEls}
      {insideLabels}
    </svg>
  );
}

function WeeklyLineChart({
  weeks, categories, width = 720, height = 260, isActive, sleepKey,
}: {
  weeks: Array<{ weekLabel: string; perCat: Record<string, number>; sleep: number }>;
  categories: PersonalCategory[];
  width?: number;
  height?: number;
  isActive?: (key: string) => boolean;
  sleepKey?: string;
}) {
  const [hovered, setHovered] = useState<{ id: string; weekIdx: number } | null>(null);
  const padL = 36, padR = 14, padT = 12, padB = 28;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const active = isActive ?? (() => true);
  const sKey = sleepKey ?? '__sleep__';

  // Kaikki aktiiviset kategoriat (ei top-5 -rajoitusta), järjestys käytön mukaan
  const totals: Record<string, number> = {};
  for (const w of weeks) for (const [k, v] of Object.entries(w.perCat)) totals[k] = (totals[k] || 0) + (v || 0);
  const topIds = Object.keys(totals)
    .filter(id => active(id))
    .sort((a, b) => totals[b] - totals[a]);
  const sleepActive = active(sKey);

  const colorFor = (id: string) =>
    id === '__none__' ? '#888' : (categories.find(c => c.id === id)?.color || '#888');
  const nameFor = (id: string) =>
    id === '__none__' ? 'Luokittelematon' : (categories.find(c => c.id === id)?.name || '–');

  // Y max: pyöristä ylöspäin lähimpään 5 h:n kerrannaiseen
  let maxVal = 0;
  for (const id of topIds) for (const w of weeks) maxVal = Math.max(maxVal, w.perCat[id] || 0);
  if (sleepActive) for (const w of weeks) maxVal = Math.max(maxVal, w.sleep);
  if (maxVal === 0) maxVal = 10;
  const yMax = Math.ceil(maxVal / 5) * 5;

  const xPos = (wi: number) => padL + (weeks.length === 1 ? innerW / 2 : (innerW * wi) / (weeks.length - 1));
  const yPos = (val: number) => padT + innerH - (val / yMax) * innerH;

  const buildPath = (vals: number[]) =>
    vals.map((v, i) => `${i === 0 ? 'M' : 'L'}${xPos(i).toFixed(1)},${yPos(v).toFixed(1)}`).join(' ');

  // Y-akselin viivat
  const yTicks = [0, yMax * 0.25, yMax * 0.5, yMax * 0.75, yMax];

  // Sarjojen järjestys: top 5 + Uni (jos aktiivinen)
  const series: Array<{ id: string; label: string; color: string; values: number[]; dashed?: boolean }> = [
    ...topIds.map(id => ({
      id,
      label: nameFor(id),
      color: colorFor(id),
      values: weeks.map(w => w.perCat[id] || 0),
    })),
    ...(sleepActive ? [{
      id: sKey,
      label: 'Uni',
      color: '#3b3b5c',
      values: weeks.map(w => w.sleep),
      dashed: true,
    }] : []),
  ];

  const hoveredSeries = hovered ? series.find(s => s.id === hovered.id) : null;
  const hoveredVal = hoveredSeries && hovered ? hoveredSeries.values[hovered.weekIdx] : null;
  const hoveredWeek = hovered ? weeks[hovered.weekIdx] : null;

  return (
    <div style={{ position: 'relative' }}>
    {/* Status-rivi yläpuolella: näyttää valitun sarjan tiedot */}
    <div style={{ minHeight: 18, marginBottom: 4, fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '.02em', display: 'flex', alignItems: 'center', gap: 8 }}>
      {hoveredSeries && hoveredWeek && hoveredVal !== null ? (
        <>
          <span style={{ display: 'inline-block', width: 10, height: 10, background: hoveredSeries.color }} />
          <span style={{ color: hoveredSeries.color, fontWeight: 600 }}>{hoveredSeries.label}</span>
          <span style={{ color: 'var(--ink3)' }}>·</span>
          <span style={{ color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>{hoveredVal.toFixed(1)} h</span>
          <span style={{ color: 'var(--ink3)' }}>·</span>
          <span style={{ color: 'var(--ink2)' }}>{hoveredWeek.weekLabel}</span>
        </>
      ) : (
        <span style={{ color: 'var(--ink3)', fontStyle: 'italic' }}>Vie hiiri viivan päälle</span>
      )}
    </div>
    <svg
      width="100%"
      viewBox={`0 0 ${width} ${height}`}
      style={{ display: 'block', maxWidth: width }}
      onMouseLeave={() => setHovered(null)}
    >
      {/* Y-akselin ohjaviivat */}
      {yTicks.map((t, i) => (
        <g key={i}>
          <line
            x1={padL} x2={padL + innerW}
            y1={yPos(t)} y2={yPos(t)}
            stroke="var(--rule)" strokeDasharray={i === 0 ? undefined : '2,3'}
          />
          <text x={padL - 6} y={yPos(t) + 3} fontSize={9} textAnchor="end" fill="var(--ink3)">
            {t.toFixed(0)}
          </text>
        </g>
      ))}
      {/* Viikkolabelit */}
      {weeks.map((w, wi) => (
        <text
          key={wi}
          x={xPos(wi)}
          y={padT + innerH + 14}
          fontSize={9}
          textAnchor="middle"
          fill={wi === weeks.length - 1 ? 'var(--ink)' : 'var(--ink3)'}
          fontWeight={wi === weeks.length - 1 ? 600 : 400}
        >
          {w.weekLabel}
        </text>
      ))}
      {/* Viivat — kaksi vaihetta: ensin näkymättömät leveät hit-areat, sitten näkyvät viivat */}
      {series.map((s) => {
        const isHovered = hovered?.id === s.id;
        const isAnyHovered = hovered !== null;
        return (
          <g key={`hit-${s.id}`}>
            <path
              d={buildPath(s.values)}
              fill="none"
              stroke="transparent"
              strokeWidth={14}
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ cursor: 'pointer' }}
              onMouseEnter={() => setHovered({ id: s.id, weekIdx: weeks.length - 1 })}
            />
            <path
              d={buildPath(s.values)}
              fill="none"
              stroke={s.color}
              strokeWidth={isHovered ? 3 : 2}
              strokeDasharray={s.dashed ? '4,3' : undefined}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={isAnyHovered && !isHovered ? 0.18 : 0.9}
              style={{ pointerEvents: 'none', transition: 'opacity .12s, stroke-width .12s' }}
            />
            {s.values.map((v, i) => (
              <circle
                key={i}
                cx={xPos(i)}
                cy={yPos(v)}
                r={isHovered ? 4 : 2.5}
                fill={s.color}
                opacity={isAnyHovered && !isHovered ? 0.18 : 1}
                style={{ cursor: 'pointer', transition: 'opacity .12s' }}
                onMouseEnter={() => setHovered({ id: s.id, weekIdx: i })}
              >
                <title>{s.label} {weeks[i].weekLabel}: {v.toFixed(1)} h</title>
              </circle>
            ))}
          </g>
        );
      })}
      {/* Hoveroidun pisteen vertical guide */}
      {hovered && (
        <line
          x1={xPos(hovered.weekIdx)}
          x2={xPos(hovered.weekIdx)}
          y1={padT}
          y2={padT + innerH}
          stroke="var(--ink3)"
          strokeDasharray="2,3"
          strokeWidth={1}
          opacity={0.4}
          pointerEvents="none"
        />
      )}
    </svg>
    </div>
  );
}

function RecurringDeleteDialog({
  dateIso, onlyThis, thisAndFuture, onCancel,
}: {
  dateIso: string;
  onlyThis: () => void;
  thisAndFuture: () => void;
  onCancel: () => void;
}) {
  const human = (() => {
    try {
      const d = new Date(dateIso + 'T00:00');
      return d.toLocaleDateString('fi-FI', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    } catch { return dateIso; }
  })();
  return (
    <div
      onClick={onCancel}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: 'var(--paper)', border: '1px solid var(--rule)', padding: 24, width: 'min(440px, 100%)', display: 'flex', flexDirection: 'column', gap: 14 }}
      >
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 12, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--ink2)', margin: 0 }}>
          Poista toistuva lohko
        </h3>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--ink2)', lineHeight: 1.4 }}>
          Tämä lohko on osa toistuvaa sarjaa. Poistetaanko vain {human}, vai myös kaikki tulevat esiintymät?
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button onClick={onlyThis} style={{
            fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '.16em', textTransform: 'uppercase',
            background: 'var(--ink)', color: 'var(--paper)', border: 'none', padding: '10px 16px', cursor: 'pointer', textAlign: 'left',
          }}>
            Vain tämä esiintymä
          </button>
          <button onClick={thisAndFuture} style={{
            fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '.16em', textTransform: 'uppercase',
            background: 'transparent', color: '#e45c81', border: '1px solid #e45c81', padding: '10px 16px', cursor: 'pointer', textAlign: 'left',
          }}>
            Tämä ja kaikki tulevat
          </button>
          <button onClick={onCancel} style={{
            fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '.16em', textTransform: 'uppercase',
            background: 'transparent', color: 'var(--ink2)', border: '1px solid var(--rule)', padding: '10px 16px', cursor: 'pointer', textAlign: 'left',
          }}>
            Peruuta
          </button>
        </div>
      </div>
    </div>
  );
}

function NewNapDialog({
  defaultDate, onCancel, onSave,
}: {
  defaultDate: string;
  onCancel: () => void;
  onSave: (n: SleepNap) => void;
}) {
  const [date, setDate] = useState(defaultDate);
  const [start, setStart] = useState('13:00');
  const [end, setEnd] = useState('14:00');
  const [note, setNote] = useState('');

  const valid = parseHM(start) < parseHM(end);

  const submit = () => {
    if (!valid) return;
    onSave({
      id: newId(),
      date,
      start,
      end,
      note: note.trim() || undefined,
    });
  };

  return (
    <div
      onClick={onCancel}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: 'var(--paper)', border: '1px solid var(--rule)', padding: 24, width: 'min(420px, 100%)', display: 'flex', flexDirection: 'column', gap: 12 }}
      >
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 12, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--ink2)', margin: 0 }}>
          Lisää päiväuni
        </h3>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ink2)' }}>
          Päivä
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} />
        </label>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ink2)' }}>
            Alkaa
            <input type="time" value={start} onChange={(e) => setStart(e.target.value)} style={inputStyle} />
          </label>
          <span style={{ color: 'var(--ink3)', alignSelf: 'flex-end', paddingBottom: 8 }}>–</span>
          <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ink2)' }}>
            Päättyy
            <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} style={inputStyle} />
          </label>
        </div>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ink2)' }}>
          Huomio (valinnainen)
          <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="esim. päiväunet" style={inputStyle} />
        </label>

        {!valid && (
          <div style={{ fontSize: 11, color: '#e45c81' }}>Päättymisajan on oltava alkamisajan jälkeen.</div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <button
            onClick={submit}
            disabled={!valid}
            style={{
              fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '.16em', textTransform: 'uppercase',
              background: valid ? 'var(--ink)' : 'transparent',
              color: valid ? 'var(--paper)' : 'var(--ink3)',
              border: valid ? 'none' : '1px solid var(--rule)',
              padding: '8px 16px', cursor: valid ? 'pointer' : 'not-allowed',
            }}
          >
            Tallenna
          </button>
          <button onClick={onCancel} style={{ marginLeft: 'auto', fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '.16em', textTransform: 'uppercase', background: 'transparent', color: 'var(--ink2)', border: '1px solid var(--rule)', padding: '8px 16px', cursor: 'pointer' }}>
            Peruuta
          </button>
        </div>
      </div>
    </div>
  );
}

function hexWithAlpha(hex: string, alpha: number): string {
  if (!hex.startsWith('#') || (hex.length !== 7 && hex.length !== 4)) return hex;
  const full = hex.length === 4
    ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
    : hex;
  const r = parseInt(full.slice(1, 3), 16);
  const g = parseInt(full.slice(3, 5), 16);
  const b = parseInt(full.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
