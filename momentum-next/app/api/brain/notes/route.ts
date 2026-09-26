// POST /api/brain/notes  { orgId, note: { slug?, name, title?, sectionSlug, kind?, properties?, bodyMd, expectedVersion? }, reason? }
// Luo tai päivittää muistiinpanon. Versio, linkit, takaisinlinkit ja audit-rivi syntyvät transaktiossa.
import { handle, readJson, requireUser, saveNote, parseNoteInput, str } from '@/lib/brain-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  return handle(async () => {
    const body = await readJson(req);
    const actor = await requireUser(req, body.orgId, 'edit');
    const input = parseNoteInput(body.note);
    return saveNote(actor, input, 'user', str(body.reason, 500) || undefined);
  });
}
