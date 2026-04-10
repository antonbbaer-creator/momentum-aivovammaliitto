// Shared types, constants and defaults for the Ohjelmisto (Programme) hub

export interface MusicAct {
  id: string;
  artist: string;
  title: string;
  description: string;
  genre?: string;
  duration?: number;
  image?: string;
  links?: { name: string; url: string }[];
  scheduledDate?: string;  // 'YYYY-MM-DD'
  scheduledTime?: string;  // 'HH:MM'
  venue?: string;
}

export interface Workshop {
  id: string;
  title: string;
  leader: string;
  description: string;
  capacity?: number;
  duration?: number;
  days?: number;
  scheduledDate?: string;
  scheduledTime?: string;
  venue?: string;
}

export interface FestivalWeek {
  year: number;
  startDate: string;         // 'YYYY-MM-DD' Monday
  endDate: string;           // 'YYYY-MM-DD' Sunday
  venues: string[];
  venuesByDay: Record<string, string[]>;
}

// LLFF festival week 2026 — 20.-26.8.
export const LLFF_VENUES = [
  'Oodi Kino Regina',
  'Puutarhateltta',
  'Auditorio',
  'Kivipiha',
  'Omenapuutalo',
];

export const LLFF_FESTIVAL_WEEK_2026: FestivalWeek = {
  year: 2026,
  startDate: '2026-08-20',
  endDate:   '2026-08-26',
  venues: LLFF_VENUES,
  venuesByDay: {
    '2026-08-20': ['Oodi Kino Regina'],
    '2026-08-21': ['Oodi Kino Regina'],
    '2026-08-22': [],
    '2026-08-23': [],
    '2026-08-24': ['Puutarhateltta', 'Auditorio', 'Kivipiha', 'Omenapuutalo'],
    '2026-08-25': ['Puutarhateltta', 'Auditorio', 'Kivipiha', 'Omenapuutalo'],
    '2026-08-26': ['Puutarhateltta', 'Auditorio', 'Kivipiha', 'Omenapuutalo'],
  },
};

// Default music acts (seed examples)
export const DEFAULT_MUSIC: MusicAct[] = [
  {
    id: 'm1',
    artist: 'TBD Duo',
    title: 'Avajaismusiikki',
    description: 'Tunnelmallinen duo avaa festivaaliviikonlopun Omenapuutalossa.',
    genre: 'Ambient/Folk',
    scheduledDate: '2026-08-24',
    scheduledTime: '20:00',
    venue: 'Omenapuutalo',
  },
  {
    id: 'm2',
    artist: 'TBD Trio',
    title: 'Lauantain iltakonsertti',
    description: 'Kolmen muusikon improvisoitu iltakonsertti.',
    genre: 'Experimental',
    scheduledDate: '2026-08-25',
    scheduledTime: '20:00',
    venue: 'Omenapuutalo',
  },
  {
    id: 'm3',
    artist: 'TBD Solo',
    title: 'Päätöskonsertti',
    description: 'Festivaaliviikonlopun päättävä soolo-esitys.',
    genre: 'Contemporary',
    scheduledDate: '2026-08-26',
    scheduledTime: '19:00',
    venue: 'Omenapuutalo',
  },
];

// Default workshops (seed examples)
export const DEFAULT_WORKSHOPS: Workshop[] = [
  {
    id: 'w1',
    title: 'NØW-työpaja',
    leader: 'Anna Lehtonen',
    description: 'Intensiivinen kolmen päivän työpaja Auditoriossa. Osallistujat luovat esityksen festivaalin viimeisenä päivänä.',
    capacity: 12,
    days: 3,
    scheduledDate: '2026-08-24',
    scheduledTime: '10:00',
    venue: 'Auditorio',
  },
];

// Default programme items scheduled outside films (examples)
export interface ProgrammeItem {
  id: string;
  type: 'film' | 'music' | 'workshop';
  refId?: string;            // reference to film/music/workshop id, if applicable
  title: string;
  description?: string;
  date: string;              // 'YYYY-MM-DD'
  startTime: string;         // 'HH:MM'
  endTime?: string;          // 'HH:MM'
  venue: string;
}

export const DEFAULT_PROGRAMME: ProgrammeItem[] = [
  { id: 'p1', type: 'film',     title: 'Avajaisnäytös', description: 'Festivaalin avaus', date: '2026-08-20', startTime: '18:00', endTime: '20:30', venue: 'Oodi Kino Regina' },
  { id: 'p2', type: 'film',     title: 'Teemaohjelman pääteos', date: '2026-08-21', startTime: '20:00', endTime: '22:00', venue: 'Oodi Kino Regina' },
  { id: 'p3', type: 'workshop', refId: 'w1', title: 'NØW-työpaja päivä 1', date: '2026-08-24', startTime: '10:00', endTime: '16:00', venue: 'Auditorio' },
  { id: 'p4', type: 'workshop', refId: 'w1', title: 'NØW-työpaja päivä 2', date: '2026-08-25', startTime: '10:00', endTime: '16:00', venue: 'Auditorio' },
  { id: 'p5', type: 'workshop', refId: 'w1', title: 'NØW-esitys',         date: '2026-08-26', startTime: '10:00', endTime: '14:00', venue: 'Auditorio' },
  { id: 'p6', type: 'film',     title: 'Nordic Frames -lyhytelokuvat', date: '2026-08-24', startTime: '17:00', endTime: '19:00', venue: 'Puutarhateltta' },
  { id: 'p7', type: 'film',     title: 'Pääteos Nordic Frames', date: '2026-08-25', startTime: '15:00', endTime: '17:00', venue: 'Puutarhateltta' },
  { id: 'p8', type: 'film',     title: 'Ulkoilmanäytös: Teemaohjelman klassikko', date: '2026-08-25', startTime: '22:00', endTime: '23:45', venue: 'Kivipiha' },
  { id: 'p9', type: 'film',     title: 'Ulkoilmanäytös: Nordic Frames', date: '2026-08-26', startTime: '22:00', endTime: '23:45', venue: 'Kivipiha' },
  { id: 'p10', type: 'music', refId: 'm1', title: 'TBD Duo',   date: '2026-08-24', startTime: '20:00', endTime: '21:00', venue: 'Omenapuutalo' },
  { id: 'p11', type: 'music', refId: 'm2', title: 'TBD Trio',  date: '2026-08-25', startTime: '20:00', endTime: '21:30', venue: 'Omenapuutalo' },
  { id: 'p12', type: 'music', refId: 'm3', title: 'TBD Solo',  date: '2026-08-26', startTime: '19:00', endTime: '20:00', venue: 'Omenapuutalo' },
];

// Type-based colors for programme items
export const PROGRAMME_COLORS: Record<ProgrammeItem['type'], { bg: string; color: string; label: string; icon: string }> = {
  film:     { bg: 'rgba(56,136,178,.15)', color: '#3788b2', label: 'Elokuva',  icon: '▷' },
  music:    { bg: 'rgba(228,92,129,.15)', color: '#e45c81', label: 'Musiikki', icon: '♫' },
  workshop: { bg: 'rgba(42,138,134,.15)', color: '#2a8a86', label: 'Työpaja',  icon: '▣' },
};

// Day labels (Ma, Ti, ...)
export const dayLabelsShort = ['Ma', 'Ti', 'Ke', 'To', 'Pe', 'La', 'Su'];

// Helper: generate array of ISO dates from startDate to endDate inclusive
export const daysInFestivalWeek = (week: FestivalWeek): string[] => {
  const out: string[] = [];
  const start = new Date(week.startDate);
  const end = new Date(week.endDate);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
};
