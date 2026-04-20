// Yhtenäinen työkuorman laskenta: yhdistää standalone-tehtävät, projektien tehtävät
// ja apurahojen aliaktiviteetit samaksi WorkItem-listaksi ja laskee henkilöiden kuorman.

import { Assignable, AssignmentStatus, effectiveStatus, getAssignees } from './assignments-shared';
import type { OrgTeamMember } from './team-shared';
import type { Grant, GrantSubtask } from './grants-shared';

export const ACTIVE_WINDOW_DAYS = 14;
const MS_PER_DAY = 86400000;

export type WorkKind = 'task' | 'project-task' | 'grant-subtask';

export interface WorkItem {
  kind: WorkKind;
  id: string;
  sourceId: string | number;
  text: string;
  assignees: string[];      // kaikki tekijät; tyhjä lista = jakamaton
  assignee?: string;        // legacy: ensimmäinen tekijä (yhteensopivuus)
  assignedBy?: string;
  status: AssignmentStatus;
  done: boolean;
  deadline?: string;
  priority?: 'normal' | 'high';
  projectId?: number;
  projectName?: string;
  grantId?: string;
  grantName?: string;
  createdAt?: number;
  completedAt?: number;
  rejectReason?: string;
}

export type CapacityStatus = 'free' | 'light' | 'normal' | 'overloaded';

export interface CapacityRow {
  member: OrgTeamMember;
  active: number;           // aktiivisia: avoin + (deadline ≤ 14vrk tai myöhässä tai ei deadlinea)
  overdue: number;          // myöhässä
  pending: number;          // odottaa hyväksyntää (status = pending)
  noDeadline: number;       // ilman deadlinea — varoituslaskuri
  totalOpen: number;        // kaikki avoimet (ml. kauempana kuin 14vrk)
  done: number;             // valmiit (kaikki ajat)
  items: WorkItem[];        // henkilölle kohdistuvat avoimet (pending + accepted), ei valmiit, ei hylätyt
  status: CapacityStatus;
}

// --- WorkItem-rakentajat ---

export interface StandaloneTaskLike extends Assignable {
  id: string;
  text: string;
  done?: boolean;
  deadline?: string;
  priority?: 'normal' | 'high';
  deletedAt?: number;
}

export interface ProjectTaskLike extends Assignable {
  id: number;
  text: string;
  done?: boolean;
  deadline?: string;
}

export interface ProjectLike {
  id: number;
  t: string;
  tasks?: ProjectTaskLike[];
  archived?: boolean;
  deletedAt?: number;
}

export function buildWorkItems(
  tasks: StandaloneTaskLike[] | undefined,
  projects: ProjectLike[] | undefined,
  grants: Grant[] | undefined,
): WorkItem[] {
  const out: WorkItem[] = [];

  for (const t of tasks || []) {
    if (t.deletedAt) continue;
    const a = getAssignees(t);
    out.push({
      kind: 'task',
      id: 'task:' + t.id,
      sourceId: t.id,
      text: t.text,
      assignees: a,
      assignee: a[0],
      assignedBy: t.assignedBy,
      status: effectiveStatus(t),
      done: !!t.done,
      deadline: t.deadline,
      priority: t.priority,
      createdAt: t.createdAt,
      completedAt: t.completedAt,
      rejectReason: t.rejectReason,
    });
  }

  for (const p of projects || []) {
    if (p.deletedAt || p.archived) continue;
    for (const t of p.tasks || []) {
      const a = getAssignees(t);
      out.push({
        kind: 'project-task',
        id: 'proj:' + p.id + ':t' + t.id,
        sourceId: t.id,
        text: t.text,
        assignees: a,
        assignee: a[0],
        assignedBy: t.assignedBy,
        status: effectiveStatus(t),
        done: !!t.done,
        deadline: t.deadline,
        projectId: p.id,
        projectName: p.t,
        createdAt: t.createdAt,
        completedAt: t.completedAt,
        rejectReason: t.rejectReason,
      });
    }
  }

  for (const g of grants || []) {
    if (g.deletedAt) continue;
    for (const s of g.subtasks || []) {
      const a = getAssignees(s);
      out.push({
        kind: 'grant-subtask',
        id: 'grant:' + g.id + ':' + s.id,
        sourceId: s.id,
        text: s.text,
        assignees: a,
        assignee: a[0],
        assignedBy: s.assignedBy,
        status: effectiveStatus(s),
        done: !!s.done,
        deadline: s.deadline,
        grantId: g.id,
        grantName: g.funder + ' · ' + g.grantName,
        createdAt: s.createdAt,
        completedAt: s.completedAt,
        rejectReason: s.rejectReason,
      });
    }
  }

  return out;
}

// --- Deadline-apurit ---

export function parseDeadlineToDate(deadline?: string): Date | null {
  if (!deadline) return null;
  const parts = deadline.split('-').map(n => parseInt(n, 10));
  if (parts.length !== 3 || parts.some(isNaN)) return null;
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

export function daysUntilDeadline(deadline?: string, now = Date.now()): number | null {
  const d = parseDeadlineToDate(deadline);
  if (!d) return null;
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  return Math.ceil((d.getTime() - today.getTime()) / MS_PER_DAY);
}

export function isOverdue(item: { deadline?: string; done?: boolean }, now = Date.now()): boolean {
  if (item.done) return false;
  const d = daysUntilDeadline(item.deadline, now);
  return d !== null && d < 0;
}

// Aktiivinen = ei valmis, ei hylätty, JA (deadline ≤ 14 vrk / myöhässä / ei deadlinea)
export function isActive(item: WorkItem, now = Date.now()): boolean {
  if (item.done) return false;
  if (item.status === 'rejected') return false;
  if (!item.deadline) return true; // ei-deadline lasketaan aktiiviseksi, mutta korostetaan varoituksella
  const d = daysUntilDeadline(item.deadline, now);
  if (d === null) return true;
  return d <= ACTIVE_WINDOW_DAYS;
}

// --- Kuormalaskenta ---

// Ylikuormaraja: myöhässä > 3 TAI aktiivisia > 10.
// Yksittäinen myöhässä oleva tehtävä on muistutus, ei vielä ylikuorman merkki.
export const OVERDUE_ALERT_THRESHOLD = 3;

function classifyCapacity(active: number, overdue: number): CapacityStatus {
  if (overdue > OVERDUE_ALERT_THRESHOLD || active > 10) return 'overloaded';
  if (active === 0) return 'free';
  if (active <= 4) return 'light';
  return 'normal';
}

export function computeCapacity(
  members: OrgTeamMember[],
  items: WorkItem[],
  now = Date.now(),
): CapacityRow[] {
  const byName = new Map<string, CapacityRow>();
  for (const m of members) {
    byName.set(m.name, {
      member: m,
      active: 0, overdue: 0, pending: 0, noDeadline: 0, totalOpen: 0, done: 0,
      items: [],
      status: 'free',
    });
  }

  for (const it of items) {
    if (it.assignees.length === 0) continue;
    for (const name of it.assignees) {
      const row = byName.get(name);
      if (!row) continue; // tuntematon jäsen — ohitetaan

      if (it.done) { row.done++; continue; }
      if (it.status === 'rejected') continue;

      row.totalOpen++;
      if (it.status === 'pending') row.pending++;
      if (!it.deadline) row.noDeadline++;
      if (isOverdue(it, now)) row.overdue++;
      if (isActive(it, now)) row.active++;
      row.items.push(it);
    }
  }

  for (const row of byName.values()) {
    row.status = classifyCapacity(row.active, row.overdue);
    // Järjestä henkilön työt: myöhässä ensin, sitten deadline nousevasti, ei-deadline viimeisenä
    row.items.sort((a, b) => {
      const da = daysUntilDeadline(a.deadline, now);
      const db = daysUntilDeadline(b.deadline, now);
      if (da === null && db === null) return 0;
      if (da === null) return 1;
      if (db === null) return -1;
      return da - db;
    });
  }

  return members.map(m => byName.get(m.name)!);
}

// Jakamattomat = tehtävät ilman tekijöitä ja jotka eivät ole valmiita/hylättyjä
export function getUnassigned(items: WorkItem[]): WorkItem[] {
  return items
    .filter(i => i.assignees.length === 0 && !i.done && i.status !== 'rejected')
    .sort((a, b) => {
      // Myöhässä olevat ja lähempänä erääntyvät ylös
      const da = daysUntilDeadline(a.deadline);
      const db = daysUntilDeadline(b.deadline);
      if (da === null && db === null) return 0;
      if (da === null) return 1;
      if (db === null) return -1;
      return da - db;
    });
}

// Ilman deadlinea olevat (kaikki, assignatut + jakamattomat) — varoitusbanneriin
export function getNoDeadline(items: WorkItem[]): WorkItem[] {
  return items.filter(i => !i.deadline && !i.done && i.status !== 'rejected');
}

// Deadline-pikavalinnat (tänään, huomenna, viikon päästä jne.) YYYY-MM-DD
export function deadlineQuickOptions(now = new Date()): { label: string; value: string }[] {
  const fmt = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const plus = (days: number) => { const d = new Date(today); d.setDate(d.getDate() + days); return d; };
  return [
    { label: 'Tänään', value: fmt(today) },
    { label: 'Huomenna', value: fmt(plus(1)) },
    { label: 'Viikon päästä', value: fmt(plus(7)) },
    { label: 'Kahden viikon päästä', value: fmt(plus(14)) },
    { label: '2 kk päästä', value: fmt(plus(60)) },
  ];
}
