// Budjetti-moduuli — kuluseuranta
//
// Suunniteltu toimimaan useissa konteksteissa:
// - Jaettu harrastusprojekti (Ihaa): split-laskelma kuka maksoi mitä, kuka velkaa kenelle
// - Voittoa tavoittelematon (AVL, LLFF): kategoriat, budjettitavoitteet, projektibudjetit
// - Yleiskäyttö: yksinkertainen kululista + kategoriat

export interface BudgetEntry {
  id: string;
  date: string;             // ISO yyyy-mm-dd
  description: string;
  amount: number;           // EUR (aina positiivinen)
  category?: string;        // viittaa BudgetCategory.id tai vapaa teksti
  paidBy?: string;          // tiimin jäsenen nimi — tärkeää jaetuissa kuluissa
  vendor?: string;          // myyjä/toimittaja
  projectId?: number;       // valinnainen linkki projektiin (Project.id)
  invoiceNumber?: string;   // laskunumero kirjanpitoa varten
  vat?: number;             // ALV-prosentti (esim. 25.5 tai 14)
  receiptUrl?: string;      // R2-linkki kuittikuvaan (myöhemmin)
  notes?: string;
  createdAt: number;
  createdBy?: string;       // uid
  deletedAt?: number;
}

export interface BudgetCategory {
  id: string;
  name: string;
  color: string;
  icon?: string;
  target?: number;          // EUR vuositavoite
  year?: number;            // vuosi johon target liittyy
  deletedAt?: number;
}

export interface BudgetSettings {
  defaultYear: number;
  currency: 'EUR';
  // Jos true, sivulla näytetään jakolaskelma (kuka maksoi paljonko, kuka velkaa kenelle).
  // Sopii jaettuihin harrastusprojekteihin (Ihaa).
  showSplit: boolean;
  // Jos annettu, split-laskelma jaetaan vain näiden jäsenten kesken. Muuten käytetään kaikkia orgTeamMembersia.
  splitMembers?: string[];
}

export const DEFAULT_BUDGET_SETTINGS: BudgetSettings = {
  defaultYear: new Date().getFullYear(),
  currency: 'EUR',
  showSplit: false,
};

// ── Split-laskelma: kuka maksoi paljonko, kuka velkaa kenelle ──

export interface BalanceRow {
  name: string;
  paid: number;          // kuinka paljon tämä henkilö on maksanut
  share: number;         // kuinka paljon tämän pitäisi maksaa (yhteensumma / henkilöä)
  balance: number;       // paid - share (+ saatava, - velkaa)
}

export interface Transfer {
  from: string;
  to: string;
  amount: number;
}

export interface SplitResult {
  total: number;
  perPersonShare: number;
  rows: BalanceRow[];
  transfers: Transfer[]; // pienin joukko siirtoja jolla saldot tasataan
}

/**
 * Laskee kuka on velkaa kenelle kun joukko ihmisiä jakaa kulut tasan.
 * Palauttaa optimaalisen siirtolistan (pienin siirtojen määrä).
 */
export function calculateSplit(
  entries: BudgetEntry[],
  people: string[]
): SplitResult {
  if (people.length === 0) {
    return { total: 0, perPersonShare: 0, rows: [], transfers: [] };
  }

  const relevant = entries.filter(e =>
    !e.deletedAt && e.paidBy && people.includes(e.paidBy)
  );

  const paidBy: Record<string, number> = {};
  for (const p of people) paidBy[p] = 0;
  for (const e of relevant) paidBy[e.paidBy!] = (paidBy[e.paidBy!] || 0) + e.amount;

  const total = Object.values(paidBy).reduce((s, x) => s + x, 0);
  const perPersonShare = total / people.length;

  const rows: BalanceRow[] = people.map(name => ({
    name,
    paid: paidBy[name] || 0,
    share: perPersonShare,
    balance: (paidBy[name] || 0) - perPersonShare,
  }));

  // Siirrot: kerää velalliset (balance < 0) ja saatavalliset (balance > 0),
  // sitten matchaa ne kunnes kaikki tasataan.
  const debtors = rows.filter(r => r.balance < -0.005).map(r => ({ ...r, balance: r.balance }));
  const creditors = rows.filter(r => r.balance > 0.005).map(r => ({ ...r, balance: r.balance }));
  const transfers: Transfer[] = [];

  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const d = debtors[i];
    const c = creditors[j];
    const amt = Math.min(-d.balance, c.balance);
    if (amt > 0.005) {
      transfers.push({ from: d.name, to: c.name, amount: Math.round(amt * 100) / 100 });
    }
    d.balance += amt;
    c.balance -= amt;
    if (Math.abs(d.balance) < 0.005) i++;
    if (Math.abs(c.balance) < 0.005) j++;
  }

  return {
    total: Math.round(total * 100) / 100,
    perPersonShare: Math.round(perPersonShare * 100) / 100,
    rows,
    transfers,
  };
}

// ── Summat ──

export interface CategorySummary {
  id: string;
  name: string;
  color: string;
  spent: number;
  target?: number;
  progress?: number; // 0..1
}

export function summarizeByCategory(
  entries: BudgetEntry[],
  categories: BudgetCategory[],
  year?: number
): CategorySummary[] {
  const rows = new Map<string, CategorySummary>();
  for (const cat of categories) {
    if (cat.deletedAt) continue;
    rows.set(cat.id, {
      id: cat.id,
      name: cat.name,
      color: cat.color,
      spent: 0,
      target: cat.target,
    });
  }
  // Uncategorized-bucket
  rows.set('__uncategorized', {
    id: '__uncategorized',
    name: 'Muut',
    color: '#888',
    spent: 0,
  });

  for (const e of entries) {
    if (e.deletedAt) continue;
    if (year != null && new Date(e.date).getFullYear() !== year) continue;
    const key = e.category && rows.has(e.category) ? e.category : '__uncategorized';
    const row = rows.get(key)!;
    row.spent += e.amount;
  }

  const result = Array.from(rows.values());
  for (const r of result) {
    if (r.target && r.target > 0) r.progress = r.spent / r.target;
  }
  // Piilota tyhjä "Muut" jos ei ole kategorioimattomia
  return result.filter(r => r.id !== '__uncategorized' || r.spent > 0);
}

export function totalForYear(entries: BudgetEntry[], year: number): { expenses: number; count: number } {
  let expenses = 0, count = 0;
  for (const e of entries) {
    if (e.deletedAt) continue;
    if (new Date(e.date).getFullYear() !== year) continue;
    expenses += e.amount;
    count++;
  }
  return {
    expenses: Math.round(expenses * 100) / 100,
    count,
  };
}

export const fmtEur = (n: number): string =>
  new Intl.NumberFormat('fi-FI', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(n);
