// Shared types & helpers for delegating tasks between team members.
// Sovelletaan sekä Tehtävät-sivun, projektien ja apurahojen aliaktiviteettien kanssa.
//
// Datamalli: jokaisella tehtävällä voi olla useampi tekijä (`assignees: string[]`).
// Vanha `assignee`-kenttä säilyy taaksepäin yhteensopivuuden vuoksi ja synkronoituu
// aina ensimmäiseen assigneeseen. Käytä `getAssignees(t)` luettaessa ja `setAssignees(t, names)`
// kirjoitettaessa.

export type AssignmentStatus = 'pending' | 'accepted' | 'rejected';

export interface Assignable {
  assignees?: string[];     // tekijät — lista nimiä (uusi, useampi mahdollinen)
  assignee?: string;        // legacy: ensimmäinen tekijä tai ainoa; pidetään synkronissa
  assignedBy?: string;      // nimi — kuka antoi tehtävän
  status?: AssignmentStatus;
  rejectReason?: string;
  rejectedAt?: number;
  rejectedBy?: string;
  createdAt?: number;
  completedAt?: number;
}

// --- Lukemisen apurit ---

export const getAssignees = (t: Assignable): string[] => {
  if (Array.isArray(t.assignees) && t.assignees.length > 0) return t.assignees;
  if (t.assignee) return [t.assignee];
  return [];
};

export const hasAnyAssignee = (t: Assignable): boolean =>
  getAssignees(t).length > 0 && effectiveStatus(t) !== 'rejected';

export const includesAssignee = (t: Assignable, name: string): boolean =>
  !!name && getAssignees(t).includes(name);

// Vanhat tehtavat (ilman statusta) lasketaan hyvaksytyiksi.
export const effectiveStatus = (t: Assignable): AssignmentStatus => {
  if (!t.status) return 'accepted';
  return t.status;
};

// Tarkistaa, näkyykö tehtävä annetulle käyttäjälle "saapuneissa".
export const isPendingForMe = (t: Assignable, myName: string): boolean =>
  !!myName && includesAssignee(t, myName) && effectiveStatus(t) === 'pending';

// Onko tehtävä hyväksytty JA minun listallani.
export const isAcceptedMine = (t: Assignable, myName: string): boolean =>
  !!myName && includesAssignee(t, myName) && effectiveStatus(t) === 'accepted';

// Hylkäysilmoitukset — tehtävät jotka *minä* annoin ja jotka hylättiin.
export const isRejectedByOthers = (t: Assignable, myName: string): boolean =>
  !!myName && t.assignedBy === myName && effectiveStatus(t) === 'rejected';

// --- Kirjoittamisen apurit ---

// Normalisoi nimilistan: poistaa tyhjät ja duplikaatit.
const normalize = (names: (string | undefined | null)[]): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const n of names) {
    const v = (n || '').trim();
    if (!v || seen.has(v)) continue;
    seen.add(v); out.push(v);
  }
  return out;
};

// Kirjoita `assignees` + legacy `assignee` synkronoituna.
const writeAssignees = (names: string[]): Pick<Assignable, 'assignee' | 'assignees'> => {
  const list = normalize(names);
  if (list.length === 0) return { assignee: undefined, assignees: [] };
  return { assignee: list[0], assignees: list };
};

// Rakentaa uuden tehtävän delegointikentät yhdelle tai useammalle tekijälle:
// - jos yksi tekijä === antaja: accepted suoraan
// - jos kaikki tekijät === antaja: accepted
// - muuten: pending (riittää kun yksi on joku muu)
// - jos ei tekijöitä: accepted (jakamaton tai oma)
export const buildAssignment = (
  assigneesInput: string | string[] | undefined,
  assignedBy: string,
): Pick<Assignable, 'assignee' | 'assignees' | 'assignedBy' | 'status' | 'createdAt'> => {
  const now = Date.now();
  const list = normalize(Array.isArray(assigneesInput) ? assigneesInput : [assigneesInput || '']);
  if (list.length === 0) {
    return { assignedBy, status: 'accepted', createdAt: now };
  }
  const anyOther = list.some(n => n !== assignedBy);
  const status: AssignmentStatus = anyOther ? 'pending' : 'accepted';
  return { ...writeAssignees(list), assignedBy, status, createdAt: now };
};

// Merkitse tehtävä valmiiksi / peru valmistuminen. Pitää kirjaa completedAt-ajasta.
export const markDone = <T extends Assignable & { done?: boolean }>(t: T, done: boolean): T => ({
  ...t,
  done,
  completedAt: done ? Date.now() : undefined,
});

// Hyväksy saapunut tehtävä (hyväksyntä koskee koko tehtävää — kaikki tekijät).
export const acceptAssignment = <T extends Assignable>(t: T): T => ({
  ...t,
  status: 'accepted',
  rejectReason: undefined,
  rejectedAt: undefined,
  rejectedBy: undefined,
});

// Hylkää tehtävä — tehtävä palaa ilman tekijöitä, rekisteröidään syy + hylkääjä.
export const rejectAssignment = <T extends Assignable>(t: T, reason: string, byName: string): T => ({
  ...t,
  ...writeAssignees([]),
  status: 'rejected',
  rejectReason: reason.trim() || undefined,
  rejectedAt: Date.now(),
  rejectedBy: byName,
});

// Korvaa kaikki tekijät yhdellä uudella henkilöllä (Siirrä toiselle).
export const reassign = <T extends Assignable>(t: T, newAssignee: string, byName: string): T => {
  const base = buildAssignment(newAssignee, byName);
  return {
    ...t,
    ...writeAssignees(base.assignees || []),
    assignedBy: base.assignedBy,
    status: base.status,
    rejectReason: undefined,
    rejectedAt: undefined,
    rejectedBy: undefined,
  };
};

// Vaihda koko tekijälista (valitse N henkilöä kerralla).
export const setAssigneesAction = <T extends Assignable>(t: T, names: string[], byName: string): T => {
  const base = buildAssignment(names, byName);
  return {
    ...t,
    ...writeAssignees(base.assignees || []),
    assignedBy: base.assignedBy,
    status: base.status,
    rejectReason: undefined,
    rejectedAt: undefined,
    rejectedBy: undefined,
  };
};

// Lisää yksi tekijä nykyisten jatkoksi. Jos uusi henkilö on muu kuin antaja ja
// tehtävä oli accepted, palauttaa pending-tilaan niin että uusi henkilö voi hyväksyä.
export const addAssignee = <T extends Assignable>(t: T, name: string, byName: string): T => {
  const curr = getAssignees(t);
  if (curr.includes(name)) return t;
  const list = [...curr, name];
  const anyOther = list.some(n => n !== byName);
  return {
    ...t,
    ...writeAssignees(list),
    assignedBy: t.assignedBy || byName,
    status: anyOther && t.status !== 'accepted' ? 'pending' : (t.status || 'accepted'),
  };
};

// Poista yksi tekijä. Jos tekijöitä ei enää ole, tehtävä ei muutu "rejected"-tilaan
// vaan pysyy accepted-tilassa (mutta jakamattomana) kunnes joku antaa sen uudelleen.
export const removeAssignee = <T extends Assignable>(t: T, name: string): T => {
  const curr = getAssignees(t).filter(n => n !== name);
  return {
    ...t,
    ...writeAssignees(curr),
    status: curr.length === 0 ? 'accepted' : t.status,
  };
};

// Statuskuvake tyyliin sovellettavaksi.
export const statusLabel = (s: AssignmentStatus): string => {
  switch (s) {
    case 'pending': return 'Odottaa';
    case 'rejected': return 'Hylätty';
    default: return '';
  }
};

export const statusColor = (s: AssignmentStatus): { bg: string; fg: string } => {
  switch (s) {
    case 'pending': return { bg: 'rgba(245,197,66,.15)', fg: 'var(--yellow)' };
    case 'rejected': return { bg: 'rgba(239,68,68,.15)', fg: 'var(--red)' };
    default: return { bg: 'transparent', fg: 'var(--t3)' };
  }
};

// Yhteensopivuus: hasAssignee (vanha nimi) — viittaa nyt hasAnyAssignee-funktioon.
export const hasAssignee = hasAnyAssignee;
