import { ReactNode } from 'react';

export type LinkTypeKey =
  | 'drive'
  | 'slack'
  | 'meta'
  | 'canva'
  | 'whatsapp'
  | 'notion'
  | 'web'
  | 'custom';

export interface LinkTypeDef {
  label: string;
  shortLabel?: string;
  brandColor: string;
  urlPlaceholder: string;
  icon: ReactNode;
}

const ic = (children: ReactNode) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {children}
  </svg>
);

export const LINK_TYPES: Record<LinkTypeKey, LinkTypeDef> = {
  drive: {
    label: 'Google Drive',
    shortLabel: 'Drive',
    brandColor: '#0F9D58',
    urlPlaceholder: 'https://drive.google.com/drive/folders/...',
    icon: ic(<><path d="M8 3h8l5 9-4 7H7L3 12z" /><path d="M8 3l4 9" /><path d="M16 3l-4 9 5 7" /><path d="M3 12h18" /></>),
  },
  slack: {
    label: 'Slack',
    brandColor: '#4A154B',
    urlPlaceholder: 'https://app.slack.com/client/...',
    icon: ic(<><rect x="3" y="10" width="6" height="4" rx="2" /><rect x="10" y="3" width="4" height="6" rx="2" /><rect x="15" y="10" width="6" height="4" rx="2" /><rect x="10" y="15" width="4" height="6" rx="2" /></>),
  },
  meta: {
    label: 'Meta Business Suite',
    shortLabel: 'Meta',
    brandColor: '#0866FF',
    urlPlaceholder: 'https://business.facebook.com/...',
    icon: ic(<><circle cx="8" cy="12" r="5" /><circle cx="16" cy="12" r="5" /></>),
  },
  canva: {
    label: 'Canva',
    brandColor: '#00C4CC',
    urlPlaceholder: 'https://canva.com/...',
    icon: ic(<><circle cx="12" cy="12" r="9" /><path d="M14 9a3 3 0 1 0 0 6" /></>),
  },
  whatsapp: {
    label: 'WhatsApp',
    brandColor: '#25D366',
    urlPlaceholder: 'https://wa.me/... tai https://chat.whatsapp.com/...',
    icon: ic(<><path d="M21 12a9 9 0 1 1-3.5-7.1L21 4l-1.1 3.4A8.96 8.96 0 0 1 21 12z" /><path d="M8 10c0 4 2 6 6 6" /></>),
  },
  notion: {
    label: 'Notion',
    brandColor: '#000000',
    urlPlaceholder: 'https://notion.so/...',
    icon: ic(<><rect x="4" y="3" width="16" height="18" rx="1" /><path d="M8 7l8 10" /><path d="M8 7v10" /><path d="M16 7v10" /></>),
  },
  web: {
    label: 'Verkkosivu',
    shortLabel: 'Web',
    brandColor: '#1F2937',
    urlPlaceholder: 'https://...',
    icon: ic(<><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3a14 14 0 0 1 0 18" /><path d="M12 3a14 14 0 0 0 0 18" /></>),
  },
  custom: {
    label: 'Muu linkki',
    shortLabel: 'Linkki',
    brandColor: '#6B7280',
    urlPlaceholder: 'https://...',
    icon: ic(<><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" /><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" /></>),
  },
};

export const LINK_TYPE_KEYS = Object.keys(LINK_TYPES) as LinkTypeKey[];

export interface QuickLink {
  id: string;
  type: LinkTypeKey;
  label: string;
  url: string;
  order: number;
}

export function detectLinkType(url: string): LinkTypeKey {
  const u = url.toLowerCase();
  if (u.includes('drive.google.com') || u.includes('docs.google.com')) return 'drive';
  if (u.includes('slack.com')) return 'slack';
  if (u.includes('business.facebook.com') || u.includes('business.meta.com')) return 'meta';
  if (u.includes('canva.com')) return 'canva';
  if (u.includes('wa.me') || u.includes('whatsapp.com')) return 'whatsapp';
  if (u.includes('notion.so') || u.includes('notion.site')) return 'notion';
  if (u.startsWith('http')) return 'web';
  return 'custom';
}

export function newQuickLink(partial: Partial<QuickLink> = {}): QuickLink {
  return {
    id: typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `lnk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type: partial.type ?? 'custom',
    label: partial.label ?? '',
    url: partial.url ?? '',
    order: partial.order ?? 0,
  };
}
