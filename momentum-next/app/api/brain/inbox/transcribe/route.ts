// POST /api/brain/inbox/transcribe  { orgId, id, keepAudio? }
// Litteroi kirjauksen äänen (vaihdettava palveluntarjoaja, lib/brain-transcribe.ts).
// Äänitiedosto poistetaan oletuksena onnistuneen litteroinnin jälkeen.
import { getStorage } from 'firebase-admin/storage';
import { handle, readJson, requireUser, audit, col, str, BrainError } from '@/lib/brain-server';
import { adminDb } from '@/lib/firebase-admin';
import { transcribe, TRANSCRIBE_PROVIDER } from '@/lib/brain-transcribe';
import { BRAIN_COLLECTIONS as C, type BrainInboxEntry } from '@/lib/brain-shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const BUCKET = process.env.FIREBASE_STORAGE_BUCKET || 'momentum-69262.firebasestorage.app';

export async function POST(req: Request) {
  return handle(async () => {
    const body = await readJson(req);
    const actor = await requireUser(req, body.orgId, 'edit');
    const id = str(body.id, 120);
    const db = adminDb();
    const ref = col(db, actor.orgId, C.inbox).doc(id);
    const snap = await ref.get();
    if (!snap.exists) throw new BrainError(404, 'Kirjausta ei löydy');
    const entry = snap.data() as BrainInboxEntry;
    if (!entry.audioPath) throw new BrainError(400, 'Kirjauksessa ei ole ääntä');
    if (!entry.audioPath.startsWith(`organizations/${actor.orgId}/brain-audio/`)) throw new BrainError(400, 'Virheellinen äänitteen polku');

    const file = getStorage().bucket(BUCKET).file(entry.audioPath);
    const [exists] = await file.exists();
    if (!exists) throw new BrainError(404, 'Äänitiedostoa ei löydy');
    const [buf] = await file.download();
    const [meta] = await file.getMetadata();
    let text: string;
    try {
      text = await transcribe({
        audio: new Uint8Array(buf), mimeType: String(meta.contentType || 'audio/webm'), language: 'fi',
        orgId: actor.orgId, userIdToken: actor.idToken,
      });
    } catch (e) {
      await ref.update({ error: e instanceof Error ? e.message.slice(0, 300) : 'Litterointi epäonnistui' });
      throw e;
    }
    const rawText = [entry.rawText?.trim(), text].filter(Boolean).join('\n\n');
    const keep = body.keepAudio === true;
    if (!keep) await file.delete().catch(() => {});
    await ref.update({ transcript: text, rawText, error: null, audioPath: keep ? entry.audioPath : null });
    await audit(actor, 'inbox.transcribe', 'inbox', id, { provider: TRANSCRIBE_PROVIDER, audioDeleted: !keep });
    return { transcript: text, rawText };
  });
}
