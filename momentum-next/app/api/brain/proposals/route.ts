// POST /api/brain/proposals
//   { orgId, id, action: 'accept' | 'reject' | 'later', note?, snoozeUntil?, logDecision?, decisionText?, decisionRationale? }
//   { orgId, create: { title, bodyMd, area?, impact?, urgency? } }   käyttäjän oma ehdotus
// Hyväksyntä lisää tehtävän Kehityssuunnitelmaan ja voi kirjata päätöksen päätöslokiin.
import { handle, readJson, requireUser, decideProposal, createProposal, str, BrainError } from '@/lib/brain-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  return handle(async () => {
    const body = await readJson(req);
    const actor = await requireUser(req, body.orgId, 'edit');
    if (body.create && typeof body.create === 'object') {
      const c = body.create as Record<string, unknown>;
      const id = await createProposal(actor, {
        title: str(c.title, 300), bodyMd: str(c.bodyMd, 50_000), area: str(c.area, 200) || undefined,
        impact: str(c.impact, 100) || undefined, urgency: str(c.urgency, 100) || undefined,
      });
      return { id };
    }
    const id = str(body.id, 120);
    const action = str(body.action, 20);
    if (!id || (action !== 'accept' && action !== 'reject' && action !== 'later')) throw new BrainError(400, 'id ja action (accept, reject, later) vaaditaan');
    return decideProposal(actor, id, action, {
      note: str(body.note, 1000) || undefined,
      snoozeUntil: str(body.snoozeUntil, 10) || undefined,
      logDecision: body.logDecision === true,
      decisionText: str(body.decisionText, 1000) || undefined,
      decisionRationale: str(body.decisionRationale, 2000) || undefined,
    });
  });
}
