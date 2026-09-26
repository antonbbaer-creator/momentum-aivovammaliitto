// POST /api/brain/notes/restore  { orgId, slug, version }
// Palauttaa vanhan version uutena versiona (historia säilyy).
import { handle, readJson, requireUser, restoreRevision, str, BrainError } from '@/lib/brain-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  return handle(async () => {
    const body = await readJson(req);
    const actor = await requireUser(req, body.orgId, 'edit');
    const slug = str(body.slug, 120);
    // restoreRevision validoi tunnisteen
    const version = Number(body.version);
    if (!slug || !Number.isInteger(version) || version < 1) throw new BrainError(400, 'slug ja version vaaditaan');
    return restoreRevision(actor, slug, version);
  });
}
