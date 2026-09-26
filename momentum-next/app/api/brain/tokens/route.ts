// GET  /api/brain/tokens?orgId=…                              lista (omistaja, ylläpitäjä)
// POST /api/brain/tokens { orgId, create: { name, scopes[] } }  uusi token: selväkielinen arvo näytetään vain kerran
// POST /api/brain/tokens { orgId, revoke: id }                  peruu tokenin heti
import { handle, readJson, requireUser, createAgentToken, listAgentTokens, revokeAgentToken, str, BrainError } from '@/lib/brain-server';
import type { AgentScope } from '@/lib/brain-shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  return handle(async () => {
    const actor = await requireUser(req, new URL(req.url).searchParams.get('orgId'), 'admin');
    return { tokens: await listAgentTokens(actor.orgId) };
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const body = await readJson(req);
    const actor = await requireUser(req, body.orgId, 'admin');
    if (body.create && typeof body.create === 'object') {
      const c = body.create as Record<string, unknown>;
      const scopes = (Array.isArray(c.scopes) ? c.scopes : []).map(s => String(s)) as AgentScope[];
      return createAgentToken(actor, str(c.name, 100), scopes);
    }
    const id = str(body.revoke, 40);
    if (!id) throw new BrainError(400, 'create tai revoke vaaditaan');
    await revokeAgentToken(actor, id);
    return { ok: true };
  });
}
