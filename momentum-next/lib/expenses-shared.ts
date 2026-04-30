// Hetki Companyn menot — kayttaja syottaa kuukausittaiset kulut.
// Erillinen Ihaa-jaetut-kulut-budjetista (lib/budjetti-shared.ts).

export interface Expense {
  id: string;            // generoitu uniikki id
  description: string;
  amount: number;        // brutto € (sisaltaa ALV jos sovellettavissa)
  date: string;          // YYYY-MM-DD
  category?: string;     // vapaa kategoria, esim. "Ohjelmistot", "Alihankinta"
  recurring?: 'monthly' | 'yearly'; // toistuva kulu
  notes?: string;
  createdAt: number;
  deletedAt?: number;
}

export const DEFAULT_EXPENSE_CATEGORIES = [
  'Ohjelmistot',
  'Alihankinta',
  'Toimistokulut',
  'Markkinointi',
  'Matkat',
  'Verot',
  'Muut',
];

export function makeExpense(partial: Partial<Expense> = {}): Expense {
  const today = new Date().toISOString().slice(0, 10);
  return {
    id: `exp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    description: '',
    amount: 0,
    date: today,
    createdAt: Date.now(),
    ...partial,
  };
}

// Laajenna toistuvat kulut konkreettisiksi kuukausittaisiksi summiksi vuodelle.
// Palauttaa kuukausi-indeksoidun arrayn (12 kuukautta, indeksi 0 = tammikuu).
export function expandExpensesByMonth(expenses: Expense[], year: number): number[] {
  const monthly = new Array(12).fill(0);
  for (const e of expenses) {
    if (e.deletedAt) continue;
    const d = new Date(e.date);
    if (e.recurring === 'monthly') {
      // Kuluu joka kuukausi date:sta vuoden loppuun
      const startMonth = d.getFullYear() === year ? d.getMonth() : 0;
      if (d.getFullYear() <= year) {
        for (let m = startMonth; m < 12; m++) monthly[m] += e.amount;
      }
    } else if (e.recurring === 'yearly') {
      // Kuluu kerran vuodessa, samana kuukautena kuin alkuperaa
      if (d.getFullYear() <= year) monthly[d.getMonth()] += e.amount;
    } else {
      if (d.getFullYear() === year) monthly[d.getMonth()] += e.amount;
    }
  }
  return monthly;
}
