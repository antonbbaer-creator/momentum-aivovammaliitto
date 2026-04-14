// Palaverimoduulin jaetut tyypit ja apufunktiot

// ── Vakiopaikat ───────────────────────────────────────────────────

export interface PresetLocation {
  id: string;
  name: string;
  address: string;
  type: 'physical' | 'remote';
}

export const PRESET_LOCATIONS: PresetLocation[] = [
  { id: 'lapinlahti', name: 'Lapinlahti Ateljee 10', address: 'Lapinlahdenpolku 8, 00180 Helsinki', type: 'physical' },
  { id: 'sofia',      name: 'Sofia Helsinki',         address: 'Sofiankatu 4, 00170 Helsinki',       type: 'physical' },
  { id: 'remote',     name: 'Etänä (Google Meet)',     address: '',                                   type: 'remote'   },
];

// ── Tietomalli ────────────────────────────────────────────────────

export interface MeetingLocation {
  presetId?: string;
  name: string;
  address?: string;
  type: 'physical' | 'remote' | 'hybrid';
  meetLink?: string;
}

export interface MeetingAttendee {
  id: string;
  type: 'member' | 'external';
  memberId?: string;
  name: string;
  email?: string;
  rsvp: 'pending' | 'accepted' | 'declined';
  attendance: 'in-person' | 'remote' | null;
  rsvpAt?: number;
}

export interface RecurrenceRule {
  frequency: 'weekly' | 'biweekly' | 'monthly';
  endDate?: string;
  exceptions?: string[];
}

export interface Meeting {
  id: string;
  title: string;
  description?: string;
  date: string;
  startTime: string;
  endTime: string;
  location: MeetingLocation;
  organizerId: string;
  attendees: MeetingAttendee[];
  status: 'scheduled' | 'cancelled' | 'completed';
  recurrence?: RecurrenceRule;
  recurrenceGroupId?: string;
  linkedNoteId?: string;
  pollId?: string;
  meetLinkCreated: boolean;
  reminders: number[];
  createdAt: number;
  createdBy: string;
  deletedAt?: number;
}

export interface MeetingPollOption {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
}

export interface MeetingPollVote {
  optionId: string;
  memberId: string;
  name: string;
  vote: 'yes' | 'no' | 'maybe';
}

export interface MeetingPoll {
  id: string;
  title: string;
  description?: string;
  options: MeetingPollOption[];
  votes: MeetingPollVote[];
  invitees: MeetingAttendee[];
  status: 'open' | 'closed';
  selectedOptionId?: string;
  deadline?: string;
  createdAt: number;
  createdBy: string;
  deletedAt?: number;
}

// ── Apufunktiot ───────────────────────────────────────────────────

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  const days = ['su', 'ma', 'ti', 'ke', 'to', 'pe', 'la'];
  return `${days[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;
}

export function formatTimeRange(start: string, end: string): string {
  return `${start}–${end}`;
}

export function isMeetingSoon(meeting: Meeting, minutesBefore: number): boolean {
  const meetingTime = new Date(`${meeting.date}T${meeting.startTime}`).getTime();
  const now = Date.now();
  const diff = meetingTime - now;
  return diff > 0 && diff <= minutesBefore * 60 * 1000;
}

export function isMeetingPast(meeting: Meeting): boolean {
  const meetingEnd = new Date(`${meeting.date}T${meeting.endTime}`).getTime();
  return Date.now() > meetingEnd;
}

export function sortMeetingsByDate(meetings: Meeting[]): Meeting[] {
  return [...meetings].sort((a, b) => {
    const da = `${a.date}T${a.startTime}`;
    const db = `${b.date}T${b.startTime}`;
    return da.localeCompare(db);
  });
}

export function getRsvpCounts(attendees: MeetingAttendee[]): { accepted: number; declined: number; pending: number } {
  return attendees.reduce(
    (acc, a) => {
      acc[a.rsvp]++;
      return acc;
    },
    { accepted: 0, declined: 0, pending: 0 }
  );
}

export function expandRecurrence(meeting: Meeting, monthsAhead: number): Meeting[] {
  if (!meeting.recurrence) return [meeting];

  const instances: Meeting[] = [];
  const start = new Date(meeting.date);
  const end = meeting.recurrence.endDate
    ? new Date(meeting.recurrence.endDate)
    : new Date(start.getTime() + monthsAhead * 30 * 24 * 60 * 60 * 1000);

  const groupId = meeting.recurrenceGroupId || generateId();
  const exceptions = new Set(meeting.recurrence.exceptions || []);

  let current = new Date(start);
  let index = 0;

  while (current <= end) {
    const dateStr = current.toISOString().split('T')[0];

    if (!exceptions.has(dateStr)) {
      instances.push({
        ...meeting,
        id: index === 0 ? meeting.id : `${meeting.id}_${index}`,
        date: dateStr,
        recurrenceGroupId: groupId,
        attendees: meeting.attendees.map(a => ({ ...a, rsvp: index === 0 ? a.rsvp : 'pending' as const, attendance: index === 0 ? a.attendance : null })),
      });
    }

    index++;

    switch (meeting.recurrence.frequency) {
      case 'weekly':
        current.setDate(current.getDate() + 7);
        break;
      case 'biweekly':
        current.setDate(current.getDate() + 14);
        break;
      case 'monthly':
        current.setMonth(current.getMonth() + 1);
        break;
    }
  }

  return instances;
}
