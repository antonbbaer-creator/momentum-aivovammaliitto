// POST /api/brain/inbox/apply  { orgId, id, operations: BrainOperation[] (käyttäjän hyväksymät, mahdollisesti muokatut), reject?: true }
// Kirjoittaa vain käyttäjän hyväksymät operaatiot aivoihin. Jokainen tallentaa version ja audit-rivin.
// reject: true → kirjaus hylätään eikä mitään kirjoiteta.
import { handle, readJson, requireUser, applyOperation, parseOperation, audit, col, str, BrainError } from '@/lib/brain-server';
import { adminDb } from '@/lib/firebase-admin';
import { BRAIN_COLLECTIONS as C, type BrainInboxEntry } from '@/lib/brain-shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
  return handle(async () => {
    const body = await readJson(req);
    const actor = await requireUser(req, body.orgId, 'edit');
    const id = str(body.id, 120);
    const ref = col(adminDb(), actor.orgId, C.inbox).doc(id);
    const snap = await ref.get();
    if (!snap.exists) throw new BrainError(404, 'Kirjausta ei löydy');
    const entry = snap.data() as BrainInboxEntry;
    if (entry.status === 'hyväksytty' || entry.status === 'hylätty') throw new BrainError(409, 'Kirjaus on jo käsitelty');

    if (body.reject === true) {
      await ref.update({ status: 'hylätty', processedAt: Date.now() });
      await audit(actor, 'inbox.reject', 'inbox', id, {});
      return { status: 'hylätty', applied: [] };
    }
    const ops = (Array.isArray(body.operations) ? body.operations : []).map(parseOperation);
    if (ops.some(o => !o)) throw new BrainError(400, 'Jokin hyväksytyistä operaatioista on puutteellinen');
    const applied: { index: number; target: string }[] = [];
    const failed: { index: number; error: string }[] = [];
    for (let i = 0; i < ops.length; i++) {
      try {
        const target = await applyOperation(actor, ops[i]!, `Kirjaus ${id}: ${ops[i]!.reason || ''}`.slice(0, 300), 'inbox');
        applied.push({ index: i, target });
      } catch (e) {
        failed.push({ index: i, error: e instanceof Error ? e.message.slice(0, 300) : 'virhe' });
      }
    }
    const status = failed.length && !applied.length ? entry.status : applied.length ? 'hyväksytty' : 'käsitelty';
    await ref.update({ status, processedAt: Date.now(), appliedOperations: applied.length, error: failed.length ? `${failed.length} operaatiota epäonnistui` : null });
    await audit(actor, 'inbox.apply', 'inbox', id, { applied: applied.length, failed: failed.length });
    return { status, applied, failed };
  });
}
