// Laskutus — vain Hetki Companyssa kaytossa.
// Idea: nahda paljonko eri asiakkuudet tuottavat ja seurata laskutuksen tilaa.
// Linkitys asiakkaaseen tehdaan clientName-stringilla (sama kuin Project.clientName).

export type InvoiceStatus = 'planned' | 'invoiced' | 'paid' | 'cancelled';

export interface Invoice {
  id: string;            // generoitu uniikki id
  clientName: string;    // linkki asiakkaaseen (sama kuin Project.clientName)
  description: string;   // mista laskutetaan, esim. "Brändivideo - Operaatio Arktis"
  amount: number;        // netto € (ilman ALVia)
  vatRate: number;       // ALV-% (esim. 25.5)
  status: InvoiceStatus; // tulossa / laskutettu / maksettu / peruutettu
  issueDate: string;     // YYYY-MM-DD — laskun paivamaara (planned: arvio)
  dueDate?: string;      // YYYY-MM-DD — erapaiva
  paidDate?: string;     // YYYY-MM-DD — milloin maksettu
  invoiceNumber?: string;
  projectId?: number;    // valinnainen linkki projektiin
  notes?: string;
  createdAt: number;
  deletedAt?: number;
}

export const INVOICE_STATUS_META: Record<InvoiceStatus, { label: string; color: string; bg: string }> = {
  planned:   { label: 'Tulossa',     color: '#f1b434', bg: 'rgba(241,180,52,.14)' },
  invoiced:  { label: 'Laskutettu',  color: '#3788b2', bg: 'rgba(55,136,178,.14)' },
  paid:      { label: 'Maksettu',    color: '#2dd4a0', bg: 'rgba(45,212,160,.14)' },
  cancelled: { label: 'Peruutettu',  color: '#7a7a82', bg: 'rgba(120,120,130,.14)' },
};

// Pipeline-jarjestys: tulossa → laskutettu → maksettu (peruutettu sivuhaara)
export const INVOICE_STATUS_ORDER: InvoiceStatus[] = ['planned', 'invoiced', 'paid', 'cancelled'];

export const DEFAULT_VAT_RATE = 25.5; // Suomen yleinen ALV 9/2024 alkaen

export function makeInvoice(clientName: string, partial: Partial<Invoice> = {}): Invoice {
  const today = new Date().toISOString().slice(0, 10);
  return {
    id: `inv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    clientName: clientName.trim(),
    description: '',
    amount: 0,
    vatRate: DEFAULT_VAT_RATE,
    status: 'planned',
    issueDate: today,
    createdAt: Date.now(),
    ...partial,
  };
}

export const grossAmount = (inv: Invoice): number => inv.amount * (1 + inv.vatRate / 100);

export const isOverdue = (inv: Invoice): boolean => {
  if (inv.status !== 'invoiced' || !inv.dueDate) return false;
  return new Date(inv.dueDate).getTime() < Date.now() - 86400000;
};

export const formatEur = (n: number): string => {
  return new Intl.NumberFormat('fi-FI', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
};

export const formatEurDetailed = (n: number): string => {
  return new Intl.NumberFormat('fi-FI', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
};
