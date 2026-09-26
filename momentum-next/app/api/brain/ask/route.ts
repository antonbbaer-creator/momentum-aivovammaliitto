// POST /api/brain/ask  { orgId, question }
// Vastaus aivojen sisällöstä lähdeviitteineen. Jos vastausta ei ole, vastaus sanoo sen eikä arvaa.
import { handle, readJson, requireUser, audit, str, BrainError } from '@/lib/brain-server';
import { askBrain } from '@/lib/brain-ai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(req: Request) {
  return handle(async () => {
    const body = await readJson(req);
    const actor = await requireUser(req, body.orgId, 'read');
    const question = str(body.question, 2000);
    if (!question) throw new BrainError(400, 'Kirjoita kysymys');
    const answer = await askBrain(actor.orgId, question);
    await audit(actor, 'brain.ask', 'brain', '-', { found: answer.found, sources: answer.sources.length });
    return answer;
  });
}
