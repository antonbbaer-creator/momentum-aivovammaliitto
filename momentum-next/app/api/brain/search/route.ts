// GET /api/brain/search?orgId=…&q=…&limit=20
// Täysitekstihaku orgin muistiinpanoihin (suomen normalisointi, otsikko painaa eniten).
import { handle, requireUser, searchBrain } from '@/lib/brain-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  return handle(async () => {
    const url = new URL(req.url);
    const actor = await requireUser(req, url.searchParams.get('orgId'), 'read');
    const q = (url.searchParams.get('q') || '').slice(0, 200);
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 20, 1), 50);
    return { results: await searchBrain(actor.orgId, q, limit) };
  });
}
