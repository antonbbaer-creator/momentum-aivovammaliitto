// Asiakkuudet — vain Hetki Companyssa kaytossa.
// Synkronoidaan Project.clientName-kentan kanssa: jokainen uusi asiakasnimi
// projekteissa luo automaattisesti Client-dokumentin (auto-sync).

export type ClientStatus = 'active' | 'frozen' | 'past';

export interface Client {
  id: string;              // generoitu (slug nimesta)
  name: string;            // naytttonimi, sama jota Project.clientName kayttaa
  status: ClientStatus;    // aktiivinen / jaissa / paattynyt
  startedAt: string;       // ISO YYYY-MM-DD
  endedAt?: string;        // YYYY-MM-DD jos paattynyt
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  notes?: string;
  color?: string;          // tagivari (hex)
  deletedAt?: number;
  createdAt: number;
}

export const CLIENT_STATUS_META: Record<ClientStatus, { label: string; color: string; bg: string }> = {
  active: { label: 'Aktiivinen', color: '#2a8a86', bg: 'rgba(42,138,134,.12)' },
  frozen: { label: 'Jäissä',      color: '#f1b434', bg: 'rgba(241,180,52,.14)' },
  past:   { label: 'Päättynyt',   color: '#7a7a82', bg: 'rgba(120,120,130,.14)' },
};

export const CLIENT_STATUS_ORDER: ClientStatus[] = ['active', 'frozen', 'past'];

const COLOR_PALETTE = [
  '#9b7cf6', '#e45c81', '#3788b2', '#f1b434', '#2a8a86',
  '#f09a52', '#5b8def', '#d65e8a', '#7c8fa0', '#5fa0a3',
];

export function pickClientColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return COLOR_PALETTE[Math.abs(h) % COLOR_PALETTE.length];
}

export function clientIdFromName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/å/g, 'a')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || `asiakas-${Date.now()}`;
}

export function makeClient(name: string, status: ClientStatus = 'active'): Client {
  const trimmed = name.trim();
  return {
    id: clientIdFromName(trimmed),
    name: trimmed,
    status,
    startedAt: new Date().toISOString().slice(0, 10),
    color: pickClientColor(trimmed),
    createdAt: Date.now(),
  };
}

// Apuri: lokalisoitu vertailu suomeksi
export const compareClients = (a: Client, b: Client): number => {
  const ai = CLIENT_STATUS_ORDER.indexOf(a.status);
  const bi = CLIENT_STATUS_ORDER.indexOf(b.status);
  if (ai !== bi) return ai - bi;
  return a.name.localeCompare(b.name, 'fi');
};
