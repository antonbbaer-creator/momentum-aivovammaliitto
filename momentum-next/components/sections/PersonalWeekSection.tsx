'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useUserData } from '@/lib/use-user-data';
import { useAssignedTasks } from '@/lib/use-assigned-tasks';
import {
  PersonalCategory,
  PersonalSettings,
  PersonalTask,
  TimeBlock,
  Recurrence,
  addDays,
  blockHours,
  expandRecurring,
  formatLocalDateTime,
  freeHoursInWeek,
  hoursPerCategory,
  newId,
  parseLocalDateTime,
  weekStart as weekStartOf,
} from '@/lib/personal-shared';
import { formatLocalDate, parseLocalDate } from '@/lib/yearwheel-shared';
import { useExternalEvents } from '@/lib/use-external-events';
import { useIntegrations, useIntegrationApi } from '@/lib/use-integrations';
import { ExternalEvent } from '@/lib/integrations-shared';

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

const parseHM = (s: string): number => {
  const [h, m] = s.split(':').map(n => parseInt(n, 10) || 0);
  return h * 60 + m;
};

export default function PersonalWeekSection() {
  const [blocks, setBlocks] = useUserData<TimeBlock[]>('calendar', []);
  const [categories, setCategories] = useUserData<PersonalCategory[]>('categories', []);
  const [settings] = useUserData<PersonalSettings>('settings', {
    weekStart: 'mon', dayStart: '06:00', dayEnd: '23:00',
  });
  const [tasks, setTasks] = useUserData<PersonalTask[]>('tasks', []);
  const { assigned } = useAssignedTasks();
  const { events: externalEvents, lastFetchedAt, loading: externalLoading } = useExternalEvents();
  const { google, microsoft } = useIntegrations();
  const integrationApi = useIntegrationApi();

  const ws = settings.weekStart || 'mon';
  const dayStartMin = parseHM(settings.dayStart || '06:00');
  const dayEndMin = parseHM(settings.dayEnd || '23:00');
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

  // Kalenteri → kategoria -mappaus (id-ketjusta)
  const calendarToCategory = useMemo(() => {
    const out: Record<string, string> = {}; // `${provider}:${calendarId}` → categoryId
    for (const integ of [google, microsoft]) {
      if (!integ) continue;
      for (const c of integ.calendars || []) {
        if (c.mappedCategoryId) out[`${integ.provider}:${c.id}`] = c.mappedCategoryId;
      }
    }
    return out;
  }, [google, microsoft]);

  const externalCategoryFor = (e: ExternalEvent): string | undefined =>
    calendarToCategory[`${e.source}:${e.calendarId}`];

  // Konfliktitarkistus: oma lohko päällekkäin ulkoisen kanssa
  const overlapsExternal = (b: TimeBlock): boolean => {
    const bs = parseLocalDateTime(b.start).getTime();
    const be = parseLocalDateTime(b.end).getTime();
    for (const e of externalEvents) {
      const es = parseLocalDateTime(e.start).getTime();
      const ee = parseLocalDateTime(e.end).getTime();
      if (bs < ee && es < be) {
        // skip if oman lohko ITSE on synkka tämän kanssa
        if (b.externalEventId && b.externalEventId === e.externalEventId) continue;
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

  // Etsi kirjoituskelpoinen ulkoinen kalenteri kategorialle
  const writeTargetFor = (categoryId?: string): { provider: 'google' | 'microsoft'; calendarId: string } | null => {
    if (!categoryId) return null;
    for (const integ of [google, microsoft]) {
      if (!integ) continue;
      for (const c of integ.calendars || []) {
        if (c.mappedCategoryId === categoryId && (c.writeEnabled ?? true)) {
          return { provider: integ.provider, calendarId: c.id };
        }
      }
    }
    return null;
  };

  const saveBlock = async () => {
    if (!editing) return;
    let block = { ...editing.block };
    const target = writeTargetFor(block.categoryId);

    if (editing.isNew) {
      // Push uutena ulkoiseen kalenteriin jos kategoria on mapattu
      if (target) {
        try {
          const res = await integrationApi.pushEvent('POST', {
            provider: target.provider,
            calendarId: target.calendarId,
            title: block.title || '',
            start: block.start,
            end: block.end,
          });
          block = {
            ...block,
            externalSource: target.provider,
            externalCalendarId: target.calendarId,
            externalEventId: res.externalEventId,
          };
        } catch (e) {
          console.warn('Push externally failed:', e);
        }
      }
      setBlocks(prev => [...prev, block]);
    } else {
      const baseId = block.id.split('@')[0];
      block.id = baseId;
      // Jos lohko on jo synkattu, p\u00e4ivit\u00e4 ulkoinen
      if (block.externalSource && block.externalCalendarId && block.externalEventId) {
        try {
          await integrationApi.pushEvent('PATCH', {
            provider: block.externalSource,
            calendarId: block.externalCalendarId,
            externalEventId: block.externalEventId,
            title: block.title || '',
            start: block.start,
            end: block.end,
          });
        } catch (e) {
          console.warn('Update external failed:', e);
        }
      } else if (target) {
        // Ei viel\u00e4 synkattu, mutta kategoria nyt mappaa kalenteriin \u2192 luo ulkoinen
        try {
          const res = await integrationApi.pushEvent('POST', {
            provider: target.provider,
            calendarId: target.calendarId,
            title: block.title || '',
            start: block.start,
            end: block.end,
          });
          block = {
            ...block,
            externalSource: target.provider,
            externalCalendarId: target.calendarId,
            externalEventId: res.externalEventId,
          };
        } catch (e) {
          console.warn('Create external failed:', e);
        }
      }
      setBlocks(prev => prev.map(b => b.id === baseId ? block : b));
    }
    setEditing(null);
  };

  const deleteBlock = async () => {
    if (!editing) return;
    const baseId = editing.block.id.split('@')[0];
    const b = editing.block;
    if (b.externalSource && b.externalCalendarId && b.externalEventId) {
      try {
        await integrationApi.pushEvent('DELETE', {
          provider: b.externalSource,
          calendarId: b.externalCalendarId,
          externalEventId: b.externalEventId,
        });
      } catch (e) {
        console.warn('Delete external failed:', e);
      }
    }
    setBlocks(prev => prev.filter(x => x.id !== baseId));
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
    // Mapatut ulkoiset — vain ne joilla on mappedCategoryId
    const wkEnd = addDays(wkStart, 7);
    for (const e of externalEvents) {
      const catId = externalCategoryFor(e);
      if (!catId) continue;
      const s = parseLocalDateTime(e.start);
      if (s < wkStart || s >= wkEnd) continue;
      const hours = Math.max(0,
        (parseLocalDateTime(e.end).getTime() - s.getTime()) / 3_600_000);
      // V\u00e4lt\u00e4 tuplalaskentaa: jos lohko on jo synkattu ulkoiseksi, sit\u00e4 vastaava
      // external event ohitetaan
      const dup = expanded.some(b => b.externalEventId === e.externalEventId);
      if (dup) continue;
      perCat[catId] = (perCat[catId] || 0) + hours;
      usedExt += hours;
    }
    const totalUsed = expanded.reduce((sum, b) => sum + blockHours(b), 0) + usedExt;
    const free = Math.max(0, 168 - totalUsed);
    return { perCat, free };
  }, [expanded, externalEvents, calendarToCategory, wkStart]);

  const catColor = (id?: string) => categories.find(c => c.id === id)?.color || '#888';
  const catName = (id?: string) => categories.find(c => c.id === id)?.name || (id ? '–' : 'Luokittelematon');

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
            const byKey = (b: TimeBlock) => b.externalEventId || b.id;
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
            onDragOver={onDayDragOver}
            onDrop={(e) => onDayDrop(dIdx, e)}
            style={{ position: 'relative', borderLeft: '1px solid var(--rule)', height: slotsPerDay * SLOT_PX }}
          >
            {/* Slotit klikkaus/veto */}
            {Array.from({ length: slotsPerDay }, (_, s) => (
              <div
                key={s}
                onMouseDown={() => onSlotMouseDown(dIdx, s)}
                onMouseEnter={() => onSlotMouseEnter(dIdx, s)}
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
                  title={`${e.title}\n${e.source === 'google' ? 'Google' : 'Microsoft'}`}
                  style={{
                    position: 'absolute',
                    top, left: 'calc(50% + 1px)', right: 2, height,
                    background: `repeating-linear-gradient(45deg, ${hexWithAlpha(baseColor, 0.12)} 0 6px, ${hexWithAlpha(baseColor, 0.05)} 6px 12px)`,
                    borderLeft: `2px dashed ${baseColor}`,
                    padding: '2px 4px', fontSize: 10, color: 'var(--ink2)',
                    overflow: 'hidden', pointerEvents: 'auto', cursor: 'default',
                  }}
                >
                  <div style={{ lineHeight: 1.1, fontStyle: 'italic' }}>{e.title}</div>
                  <div style={{ fontSize: 9, color: 'var(--ink3)' }}>
                    {e.source === 'google' ? 'G' : 'MS'} · {slotToTime(startSlotAbs)}
                  </div>
                </div>
              );
            })}

            {/* Olemassaolevat lohkot */}
            {blocksByDay[dIdx].map(b => {
              const startD = parseLocalDateTime(b.start);
              const endD = parseLocalDateTime(b.end);
              const startSlotAbs = (startD.getHours() * 60 + startD.getMinutes()) / SLOT_MIN;
              const endSlotAbs = (endD.getHours() * 60 + endD.getMinutes()) / SLOT_MIN;
              const top = (startSlotAbs - startSlot0) * SLOT_PX;
              const height = Math.max(SLOT_PX - 2, (endSlotAbs - startSlotAbs) * SLOT_PX - 2);
              const color = catColor(b.categoryId);
              const conflict = overlapsExternal(b);
              return (
                <div
                  key={b.id}
                  onClick={(e) => { e.stopPropagation(); setEditing({ block: b, isNew: false }); }}
                  style={{
                    position: 'absolute',
                    top,
                    left: 2,
                    right: externalByDay[dIdx].length > 0 ? 'calc(50% + 1px)' : 2,
                    height,
                    background: hexWithAlpha(color, b.done ? 0.3 : 0.18),
                    borderLeft: `3px solid ${color}`,
                    boxShadow: conflict ? 'inset 0 0 0 1px #e45c81' : undefined,
                    padding: '3px 6px',
                    fontSize: 11,
                    color: 'var(--ink)',
                    cursor: 'pointer',
                    overflow: 'hidden',
                    textDecoration: b.done ? 'line-through' : 'none',
                  }}
                >
                  <div style={{ fontWeight: 500, lineHeight: 1.2 }}>
                    {b.title || catName(b.categoryId)}
                    {conflict && <span title="P\u00e4\u00e4llekk\u00e4in ulkoisen tapahtuman kanssa" style={{ color: '#e45c81', marginLeft: 4 }}>!</span>}
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--ink3)', letterSpacing: '.06em' }}>
                    {slotToTime(startSlotAbs)}–{slotToTime(endSlotAbs)}
                    {b.recurrence && b.recurrence !== 'none' && ' ↻'}
                    {b.externalSource && <span title={`Synkronoitu ${b.externalSource === 'google' ? 'Googleen' : 'Microsoftiin'}`}> ⇆</span>}
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
          {Object.entries(summary.perCat).map(([catId, hours]) => {
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
            <span style={{ width: 12, height: 12, background: 'transparent', border: '1px solid var(--ink2)' }} />
            <span style={{ flex: 1, fontSize: 12, fontWeight: 500 }}>Vapaata</span>
            <div style={{ width: 200, height: 8, background: 'var(--paper-d)', position: 'relative' }}>
              <div style={{ position: 'absolute', inset: 0, width: `${(summary.free / 168) * 100}%`, background: 'var(--ink2)' }} />
            </div>
            <span style={{ width: 70, textAlign: 'right', fontFamily: 'var(--font-display)', fontVariantNumeric: 'tabular-nums', fontSize: 12, fontWeight: 500 }}>
              {summary.free.toFixed(1)} h
            </span>
          </div>
        </div>
      </div>

      {/* Editori-modal */}
      {editing && (
        <BlockEditor
          state={editing}
          categories={categories}
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

function BlockEditor({
  state, categories, onChange, onSave, onDelete, onCancel, onCompleteSourceTask,
}: {
  state: BlockEditState;
  categories: PersonalCategory[];
  onChange: (block: TimeBlock) => void;
  onSave: () => void;
  onDelete: () => void;
  onCancel: () => void;
  onCompleteSourceTask?: () => void;
}) {
  const b = state.block;
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

        <select
          value={b.categoryId || ''}
          onChange={e => onChange({ ...b, categoryId: e.target.value || undefined })}
          style={{ background: 'transparent', border: '1px solid var(--rule)', padding: '6px 8px', fontFamily: 'var(--font-display)', fontSize: 12, color: 'var(--ink)' }}
        >
          <option value="">— elämän alue —</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>

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
        okEvents.push({
          id: e.id || `apple-${Math.random().toString(36).slice(2, 10)}`,
          title: e.title,
          start: e.start,
          end: e.end,
          recurrence: e.recurrence || 'none',
          externalSource: e.externalSource || 'apple',
          externalCalendarId: e.externalCalendarId,
          externalEventId: e.externalEventId,
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
