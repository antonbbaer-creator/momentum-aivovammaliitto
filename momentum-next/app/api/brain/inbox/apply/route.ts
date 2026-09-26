// POST /api/brain/inbox/apply  { orgId, id, operations: BrainOperation[] (käyttäjän hyväksymät, mahdollisesti muokatut), reject?: true }
// Kirjoittaa vain käyttäjän hyväksymät operaatiot aivoihin. Jokainen tallentaa version ja audit-rivin.
// reject: true → kirjaus hylätään eikä mitään kirjoiteta.
import { FieldValue } from 'firebase-admin/firestore';
import { handle, readJson, requireUser, applyOperation, parseOperation, audit, col, docId, BrainError } from '@/lib/brain-server';
import { adminDb } from '@/lib/firebase-admin';
import { BRAIN_COLLECTIONS as C, stableId, type BrainInboxEntry } from '@/lib/brain-shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
  return handle(async () => {
    const body = await readJson(req);
    const actor = await requireUser(req, body.orgId, 'edit');
    const id = docId(body.id, 'kirjauksen tunniste');
    const db = adminDb();
    const ref = col(db, actor.orgId, C.inbox).doc(id);
    // Varaus transaktiossa: rinnakkainen hyväksyntä (tuplaklikkaus, kaksi välilehteä) ei kirjoita kahdesti
    const now0 = Date.now();
    const entry = await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new BrainError(404, 'Kirjausta ei löydy');
      const cur = snap.data() as BrainInboxEntry & { applyingAt?: number | null };
      if (cur.status === 'hyväksytty' || cur.status === 'hylätty') throw new BrainError(409, 'Kirjaus on jo käsitelty');
      if (cur.applyingAt && now0 - cur.applyingAt < 120_000) throw new BrainError(409, 'Kirjausta tallennetaan parhaillaan');
      tx.update(ref, { applyingAt: now0 });
      return cur as BrainInboxEntry & { appliedOpHashes?: string[] };
    });
    try {

    if (body.reject === true) {
      await ref.update({ status: 'hylätty', processedAt: Date.now(), applyingAt: null });
      await audit(actor, 'inbox.reject', 'inbox', id, {});
      return { status: 'hylätty', applied: [], failed: [] };
    }
    const ops = (Array.isArray(body.operations) ? body.operations : []).map(o => parseOperation(o, 'ai'));
    if (ops.some(o => !o)) throw new BrainError(400, 'Jokin hyväksytyistä operaatioista on puutteellinen');
    const applied: { index: number; target: string }[] = [];
    const failed: { index: number; error: string }[] = [];
    // Jokainen onnistunut operaatio kirjataan heti (tiiviste), joten keskeytyksen jälkeinen uusi yritys ohittaa sen
    const done = new Set(entry.appliedOpHashes || []);
    let alreadyDone = 0;
    for (let i = 0; i < ops.length; i++) {
      const hash = stableId(JSON.stringify(ops[i]));
      if (done.has(hash)) { applied.push({ index: i, target: 'jo tallennettu' }); alreadyDone++; continue; }
      try {
        const target = await applyOperation(actor, ops[i]!, `Kirjaus ${id}: ${ops[i]!.reason || ''}`.slice(0, 300), 'inbox', 'ai');
        await ref.update({ appliedOpHashes: FieldValue.arrayUnion(hash) });
        applied.push({ index: i, target });
      } catch (e) {
        failed.push({ index: i, error: e instanceof Error ? e.message.slice(0, 300) : 'virhe' });
      }
    }
    // Osittain epäonnistunut: kirjaus jää odottamaan, ja ehdotukseen jäävät vain epäonnistuneet operaatiot,
    // jotta uusi yritys ei kirjoita onnistuneita toiseen kertaan.
    const prevApplied = entry.appliedOperations || 0;
    if (failed.length) {
      const remaining = failed.map(f => ops[f.index]!);
      await ref.update({
        status: 'ehdotettu',
        appliedOperations: prevApplied + applied.length - alreadyDone,
        // createdAt vaihtuu, jotta selaimen tarkistusnäkymä latautuu jäljellä olevilla operaatioilla
        aiSuggestion: entry.aiSuggestion ? JSON.parse(JSON.stringify({ ...entry.aiSuggestion, operations: remaining, createdAt: Date.now() })) : null,
        applyingAt: null,
        error: `${failed.length} operaatiota epäonnistui. Korjaa ja yritä uudelleen.`,
      });
      await audit(actor, 'inbox.apply', 'inbox', id, { applied: applied.length, failed: failed.length });
      return { status: 'ehdotettu', applied, failed };
    }
    const status = applied.length || prevApplied ? 'hyväksytty' : 'käsitelty';
    await ref.update({ status, processedAt: Date.now(), appliedOperations: prevApplied + applied.length - alreadyDone, error: null, applyingAt: null });
    await audit(actor, 'inbox.apply', 'inbox', id, { applied: applied.length, failed: failed.length });
    return { status, applied, failed };
    } catch (e) {
      await ref.update({ applyingAt: null }).catch(() => {});
      throw e;
    }
  });
}
