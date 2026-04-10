// Shared Publication model — unified lifecycle: brief → draft → ready → published
// Used by PublicationQueueSection, PublicationDetailSection, EditorSection, CalendarSection, Dashboard.

export type PublicationStatus = 'brief' | 'draft' | 'ready' | 'published';

export interface Publication {
  // Core
  id: string;
  title: string;
  body: string;
  channels: string[];
  date: string | null;          // julkaisupäivä (ISO YYYY-MM-DD)
  image: string | null;         // cover/kansikuva url (yleensä R2)
  status: PublicationStatus;
  category?: string;
  publishedChannels: string[];  // kanavat joihin on jo julkaistu
  created: string;              // ISO YYYY-MM-DD

  // Brief-metadata
  brief?: string;               // toimeksianto: tavoite, sävy, kohderyhmä
  assigneeId?: string;          // OrgTeamMember.id
  requestedById?: string;       // kuka pyysi tämän (jos muu kuin tekijä)
  dueDate?: string | null;      // sisäinen deadline (milloin valmis tuotettu)
  priority?: 'low' | 'normal' | 'high';

  // Sisältölinkit
  mediaIds?: string[];          // mediapankin tiedostojen id:t / r2-key-pohjaiset id:t
  designId?: string;            // linkki EditorSectionin Designiin
  projectId?: number;           // linkki Projectiin (valinnainen kampanja-ryhmittely)

  // Metadata
  updatedAt?: number;           // ms since epoch
}

export interface PublicationCategory {
  id: string;
  label: string;
}

export const PUBLICATION_CATEGORIES: PublicationCategory[] = [
  { id: 'some', label: 'Sosiaalinen media' },
  { id: 'press', label: 'Lehdistö' },
  { id: 'partner', label: 'Kumppanit' },
  { id: 'internal', label: 'Sisäinen' },
];

export const STATUS_LABELS: Record<PublicationStatus, string> = {
  brief: 'Brief',
  draft: 'Työstössä',
  ready: 'Valmis',
  published: 'Julkaistu',
};

export const STATUS_ORDER: PublicationStatus[] = ['brief', 'draft', 'ready', 'published'];

export const STATUS_COLORS: Record<PublicationStatus, { bg: string; fg: string; border: string }> = {
  brief: { bg: 'rgba(155,124,246,.12)', fg: '#9b7cf6', border: 'rgba(155,124,246,.35)' },
  draft: { bg: 'rgba(5,107,159,.12)', fg: 'var(--pri-l)', border: 'rgba(5,107,159,.35)' },
  ready: { bg: 'rgba(45,212,160,.12)', fg: 'var(--green)', border: 'rgba(45,212,160,.35)' },
  published: { bg: 'rgba(148,163,184,.15)', fg: 'var(--t3)', border: 'rgba(148,163,184,.35)' },
};

// Map old/legacy status values to the new lifecycle
export function normalizeStatus(raw: any): PublicationStatus {
  if (raw === 'brief' || raw === 'draft' || raw === 'ready' || raw === 'published') return raw;
  // Legacy fallbacks
  if (raw === 'suunniteltu') return 'draft';
  if (raw === 'valmis') return 'ready';
  if (raw === 'julkaistu') return 'published';
  return 'draft';
}

// Ensure a loaded publication record has all the expected fields (backwards-compatible migration)
export function normalizePublication(p: any): Publication {
  if (!p) return {
    id: 'pub_' + Date.now(),
    title: '',
    body: '',
    channels: [],
    date: null,
    image: null,
    status: 'brief',
    publishedChannels: [],
    created: new Date().toISOString().slice(0, 10),
  };
  return {
    id: p.id || 'pub_' + Date.now(),
    title: p.title || '',
    body: p.body || '',
    channels: Array.isArray(p.channels) ? p.channels : [],
    date: p.date || null,
    image: p.image || null,
    status: normalizeStatus(p.status),
    category: p.category || 'some',
    publishedChannels: Array.isArray(p.publishedChannels) ? p.publishedChannels : [],
    created: p.created || new Date().toISOString().slice(0, 10),
    brief: p.brief || '',
    assigneeId: p.assigneeId || undefined,
    requestedById: p.requestedById || undefined,
    dueDate: p.dueDate || null,
    priority: p.priority || 'normal',
    mediaIds: Array.isArray(p.mediaIds) ? p.mediaIds : [],
    designId: p.designId || undefined,
    projectId: typeof p.projectId === 'number' ? p.projectId : undefined,
    updatedAt: p.updatedAt || Date.now(),
  };
}

// Completeness check — how "ready" is a publication to be published?
export interface PublicationCompleteness {
  hasTitle: boolean;
  hasBody: boolean;
  hasMedia: boolean;
  hasChannels: boolean;
  hasSchedule: boolean;
  checks: number;        // kaikkien kenttien lkm (5)
  done: number;          // täytetyt
  percentage: number;    // 0-100
}

export function publicationCompleteness(p: Publication): PublicationCompleteness {
  const hasTitle = !!p.title?.trim();
  const hasBody = !!p.body?.trim();
  const hasMedia = !!(p.image || (p.mediaIds && p.mediaIds.length > 0));
  const hasChannels = (p.channels?.length || 0) > 0;
  const hasSchedule = !!p.date;
  const done = [hasTitle, hasBody, hasMedia, hasChannels, hasSchedule].filter(Boolean).length;
  return {
    hasTitle,
    hasBody,
    hasMedia,
    hasChannels,
    hasSchedule,
    checks: 5,
    done,
    percentage: Math.round((done / 5) * 100),
  };
}

// Deadline helper — internal dueDate OR external publish date, whichever is earlier
export function effectiveDeadline(p: Publication): string | null {
  if (p.dueDate && p.date) {
    return p.dueDate < p.date ? p.dueDate : p.date;
  }
  return p.dueDate || p.date || null;
}

export function deadlineStatus(dateStr: string | null): {
  label: string;
  color: string;
  bg: string;
  days: number | null;
} | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - Date.now();
  const day = 86400000;
  const days = Math.ceil(diff / day);
  if (days < 0) return { label: `${Math.abs(days)} pv myöhässä`, color: 'var(--red)', bg: 'rgba(239,68,68,.1)', days };
  if (days === 0) return { label: 'Tänään', color: 'var(--red)', bg: 'rgba(239,68,68,.1)', days };
  if (days <= 3) return { label: `${days} pv`, color: 'var(--red)', bg: 'rgba(239,68,68,.1)', days };
  if (days <= 14) return { label: `${days} pv`, color: 'var(--yellow)', bg: 'rgba(245,197,66,.1)', days };
  return { label: `${days} pv`, color: 'var(--green)', bg: 'rgba(45,212,160,.1)', days };
}

// Sorting helpers
export function sortByDeadline(a: Publication, b: Publication): number {
  const da = effectiveDeadline(a);
  const db = effectiveDeadline(b);
  if (!da && !db) return (b.updatedAt || 0) - (a.updatedAt || 0);
  if (!da) return 1;
  if (!db) return -1;
  return da.localeCompare(db);
}

// Filter helpers
export function filterByAssignee(pubs: Publication[], assigneeIds: string[] | null): Publication[] {
  if (!assigneeIds || assigneeIds.length === 0) return pubs;
  return pubs.filter(p => p.assigneeId && assigneeIds.includes(p.assigneeId));
}

export function filterByChannel(pubs: Publication[], channel: string | null): Publication[] {
  if (!channel || channel === 'all') return pubs;
  return pubs.filter(p => p.channels.includes(channel));
}

export function filterByCategory(pubs: Publication[], categoryId: string | null): Publication[] {
  if (!categoryId || categoryId === 'all') return pubs;
  return pubs.filter(p => (p.category || 'some') === categoryId);
}

export function groupByStatus(pubs: Publication[]): Record<PublicationStatus, Publication[]> {
  const out: Record<PublicationStatus, Publication[]> = { brief: [], draft: [], ready: [], published: [] };
  for (const p of pubs) {
    out[p.status].push(p);
  }
  // Sort each group by deadline
  for (const k of STATUS_ORDER) {
    out[k].sort(sortByDeadline);
  }
  return out;
}

export function newBriefTemplate(partial: Partial<Publication> = {}): Publication {
  const nowIso = new Date().toISOString().slice(0, 10);
  return normalizePublication({
    id: 'pub_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    title: '',
    body: '',
    channels: [],
    date: null,
    image: null,
    status: 'brief',
    category: 'some',
    publishedChannels: [],
    created: nowIso,
    priority: 'normal',
    ...partial,
  });
}

// Platform icon+color mapping (shared with PublicationsSection legacy)
export const PLATFORM_META: Record<string, { color: string; ic: string; url?: string; post?: string }> = {
  'Facebook':   { color: '#1877F2', ic: 'FB', url: 'https://business.facebook.com/latest/home', post: 'https://business.facebook.com/latest/composer' },
  'Instagram':  { color: '#E1306C', ic: 'IG', url: 'https://business.facebook.com/latest/home', post: 'https://business.facebook.com/latest/composer' },
  'LinkedIn':   { color: '#0A66C2', ic: 'LI', url: 'https://www.linkedin.com/feed/', post: 'https://www.linkedin.com/post/new' },
  'TikTok':     { color: '#00F2EA', ic: 'TT', url: 'https://www.tiktok.com/creator#/upload', post: 'https://www.tiktok.com/creator#/upload' },
  'YouTube':    { color: '#FF0000', ic: 'YT', url: 'https://studio.youtube.com/', post: 'https://studio.youtube.com/' },
  'Nettisivut': { color: '#34D399', ic: 'WW' },
  'Uutiskirje': { color: '#FB923C', ic: 'UK' },
};
