// POST /api/brain/decisions  { orgId, decision: { decidedOn?, decision, rationale?, areaSlug? } }
// Päätöksen kirjaus päätöslokiin käsin.
import { handle, readJson, requireUser, addDecision, str, BrainError } from '@/lib/brain-server';
import { todayIso } from '@/lib/brain-shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  return handle(async () => {
    const body = await readJson(req);
    const actor = await requireUser(req, body.orgId, 'edit');
    const d = (body.decision && typeof body.decision === 'object' ? body.decision : {}) as Record<string, unknown>;
    const decision = str(d.decision, 1000);
    if (!decision) throw new BrainError(400, 'Kirjoita päätös');
    return {
      id: await addDecision(actor, {
        decidedOn: str(d.decidedOn, 20) || todayIso(), decision, rationale: str(d.rationale, 2000) || undefined,
        areaSlug: str(d.areaSlug, 120) || null, source: 'user', proposalId: null,
      }),
    };
  });
}
