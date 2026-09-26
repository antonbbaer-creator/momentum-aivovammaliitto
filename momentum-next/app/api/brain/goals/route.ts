// POST /api/brain/goals
//   { orgId, metric: { goalId, breakdownKey?, period, value, note? } }     toteuman kirjaus (jäsen)
//   { orgId, goal: { id?, period, title, targetValue, stretchValue?, baselineValue?, baselinePeriod?, unit, breakdown[] } }  (omistaja)
import { handle, readJson, requireUser, addMetricEntry, upsertGoal, str, BrainError } from '@/lib/brain-server';
import type { GoalBreakdown } from '@/lib/brain-shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const num = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);

export async function POST(req: Request) {
  return handle(async () => {
    const body = await readJson(req);
    if (body.metric && typeof body.metric === 'object') {
      const actor = await requireUser(req, body.orgId, 'edit');
      const m = body.metric as Record<string, unknown>;
      const value = num(m.value);
      const goalId = str(m.goalId, 120);
      const period = str(m.period, 20);
      if (!goalId || !period || value === null) throw new BrainError(400, 'goalId, period ja value vaaditaan');
      return { id: await addMetricEntry(actor, { goalId, breakdownKey: str(m.breakdownKey, 80) || null, period, value, note: str(m.note, 500) || undefined }) };
    }
    if (body.goal && typeof body.goal === 'object') {
      const actor = await requireUser(req, body.orgId, 'admin');
      const g = body.goal as Record<string, unknown>;
      const title = str(g.title, 200);
      const period = str(g.period, 20);
      const targetValue = num(g.targetValue);
      if (!title || !period || targetValue === null) throw new BrainError(400, 'title, period ja targetValue vaaditaan');
      const breakdown: GoalBreakdown[] = (Array.isArray(g.breakdown) ? g.breakdown : []).slice(0, 10).map(b => {
        const o = (b && typeof b === 'object' ? b : {}) as Record<string, unknown>;
        return { key: str(o.key, 80), label: str(o.label, 200), targetValue: num(o.targetValue) || 0 };
      }).filter(b => b.key);
      return {
        id: await upsertGoal(actor, {
          id: str(g.id, 120), period, title, targetValue, stretchValue: num(g.stretchValue), baselineValue: num(g.baselineValue),
          baselinePeriod: str(g.baselinePeriod, 20) || null, unit: str(g.unit, 20), breakdown, noteSlug: str(g.noteSlug, 120) || null,
          sortOrder: num(g.sortOrder) ?? 0,
        }),
      };
    }
    throw new BrainError(400, 'metric tai goal vaaditaan');
  });
}
