// POST /api/brain/inbox/process  { orgId, id }
// Tekoäly hakee aivoista liittyvät muistiinpanot ja ehdottaa operaatioita (ei kirjoita mitään aivoihin).
// Tila: uusi → ehdotettu. Virhe tallennetaan kirjaukseen, kirjaus itse säilyy.
import { handle, readJson, requireUser, audit, col, docId, aiQuota, BrainError } from '@/lib/brain-server';
import { adminDb } from '@/lib/firebase-admin';
import { suggestForInbox } from '@/lib/brain-ai';
import { BRAIN_COLLECTIONS as C, type BrainInboxEntry } from '@/lib/brain-shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(req: Request) {
  return handle(async () => {
    const body = await readJson(req);
    const actor = await requireUser(req, body.orgId, 'edit');
    const id = docId(body.id, 'kirjauksen tunniste');
    const ref = col(adminDb(), actor.orgId, C.inbox).doc(id);
    const snap = await ref.get();
    if (!snap.exists) throw new BrainError(404, 'Kirjausta ei löydy');
    const entry = snap.data() as BrainInboxEntry;
    if (entry.status === 'hyväksytty' || entry.status === 'hylätty') throw new BrainError(409, 'Kirjaus on jo käsitelty');
    const text = (entry.rawText || '').trim();
    if (entry.audioPath && !entry.transcript) throw new BrainError(400, 'Litteroi ääni ensin');
    if (!text) throw new BrainError(400, 'Kirjaus on tyhjä');
    await aiQuota(actor, 'process');
    try {
      const suggestion = await suggestForInbox(actor.orgId, text, entry.createdByName || actor.name);
      await ref.update({ aiSuggestion: JSON.parse(JSON.stringify(suggestion)), status: 'ehdotettu', error: null });
      await audit(actor, 'inbox.suggest', 'inbox', id, { operations: suggestion.operations.length, questions: suggestion.questions.length, model: suggestion.model });
      return { suggestion };
    } catch (e) {
      await ref.update({ error: e instanceof Error ? e.message.slice(0, 300) : 'Käsittely epäonnistui' });
      throw e;
    }
  });
}
