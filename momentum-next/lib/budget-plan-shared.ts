// Budjettisuunnitelma — kevyt suunniteltujen tuottojen ja kulujen seuranta.
// Eroaa budjetti-moduulista (kululista) — tämä on suunnitelma jota voi
// muokata ja kommentoida.

export interface BudgetPlanComment {
  id: string;
  author: string;          // displayName
  text: string;
  createdAt: number;
}

export interface BudgetPlanRow {
  id: string;
  name: string;
  amount: number;          // EUR, netto
  vat?: number;            // ALV-määrä EUR (ei prosentti)
  notes?: string;
  comments?: BudgetPlanComment[];
  deletedAt?: number;
}

export interface BudgetPlan {
  income: BudgetPlanRow[];
  expenses: BudgetPlanRow[];
  // Henkilökohtaiset työskentelyapurahat tälle vuodelle. Eivät vaikuta
  // festivaalin tulot/menot-tasapainoon — kuvaavat tiimin omaa toimeentuloa.
  personalGrants?: BudgetPlanRow[];
}

export const EMPTY_BUDGET_PLAN: BudgetPlan = { income: [], expenses: [], personalGrants: [] };

export const sumRows = (rows: BudgetPlanRow[]): { net: number; vat: number; total: number } => {
  let net = 0, vat = 0;
  for (const r of rows) {
    if (r.deletedAt) continue;
    net += r.amount || 0;
    vat += r.vat || 0;
  }
  return { net, vat, total: net + vat };
};

export const fmtEur = (n: number): string =>
  new Intl.NumberFormat('fi-FI', { maximumFractionDigits: 0 }).format(Math.round(n)) + ' €';
