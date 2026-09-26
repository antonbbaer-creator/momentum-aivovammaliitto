// POST /api/brain/inbox  { orgId, text?, channel?: 'web' | 'voice', audioPath? }
// Tallentaa kirjauksen heti tilassa "uusi". Tämä onnistuu aina ennen jatkokäsittelyä,
// joten kirjaus ei katoa, vaikka litterointi tai tekoäly epäonnistuisi.
// audioPath: selain lataa äänen ensin Storageen polkuun organizations/{orgId}/brain-audio/…
import { handle, readJson, requireUser, createInboxEntry, str, BrainError } from '@/lib/brain-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  return handle(async () => {
    const body = await readJson(req);
    const actor = await requireUser(req, body.orgId, 'edit');
    const audioPath = str(body.audioPath, 300) || null;
    if (audioPath && (!audioPath.startsWith(`organizations/${actor.orgId}/brain-audio/`) || audioPath.includes('..'))) {
      throw new BrainError(400, 'Virheellinen äänitteen polku');
    }
    const channel = body.channel === 'voice' || audioPath ? 'voice' : 'web';
    const id = await createInboxEntry(actor, { rawText: typeof body.text === 'string' ? body.text : '', channel, audioPath });
    return { id };
  });
}
