// GET /api/brain/export?orgId=…  → zip-vault (omistaja, ylläpitäjä). Aukeaa Obsidianissa.
import { handle, requireUser, audit } from '@/lib/brain-server';
import { buildVaultZip } from '@/lib/brain-export';
import { adminDb } from '@/lib/firebase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request) {
  return handle(async () => {
    const actor = await requireUser(req, new URL(req.url).searchParams.get('orgId'), 'admin');
    const org = await adminDb().doc(`organizations/${actor.orgId}`).get();
    const name = String(org.data()?.name || actor.orgId);
    const bytes = await buildVaultZip(actor.orgId, `${name} – aivot`);
    await audit(actor, 'brain.export', 'org', actor.orgId, { bytes: bytes.byteLength });
    const date = new Date().toISOString().slice(0, 10);
    return new Response(Buffer.from(bytes), {
      headers: {
        'content-type': 'application/zip',
        'content-disposition': `attachment; filename="aivot-${actor.orgId}-${date}.zip"`,
        'cache-control': 'no-store',
      },
    });
  });
}
