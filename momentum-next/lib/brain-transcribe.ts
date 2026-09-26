// Puheentunnistus vaihdettavan rajapinnan takana. Valinta: BRAIN_TRANSCRIBE_PROVIDER.
//
//   worker-whisper (oletus)  Momentum Workerin /api/transcribe → OpenAI Whisper (language: fi).
//                            HUOM: Whisper käsittelee äänen Yhdysvalloissa. Antonin päätös 26.9.2026:
//                            käytetään toistaiseksi, EU-vaihtoehto myöhemmin (docs/aivot-tietosuoja.md).
//
// Uusi palveluntarjoaja: lisää funktio PROVIDERS-olioon ja aseta ympäristömuuttuja.

import { WORKER_URL } from './worker-fetch';
import { BrainError } from './brain-server';

export interface TranscribeInput {
  audio: Uint8Array;
  mimeType: string;
  language: string;
  orgId: string;
  userIdToken?: string;   // Worker tunnistaa käyttäjän Firebase-tokenilla
}

type Provider = (input: TranscribeInput) => Promise<string>;

const workerWhisper: Provider = async ({ audio, mimeType, orgId, userIdToken }) => {
  if (!userIdToken) throw new BrainError(401, 'Litterointi vaatii kirjautuneen käyttäjän');
  const ext = mimeType.includes('mp4') ? 'mp4' : mimeType.includes('ogg') ? 'ogg' : mimeType.includes('wav') ? 'wav' : 'webm';
  const form = new FormData();
  form.append('audio', new Blob([Buffer.from(audio)], { type: mimeType }), `kirjaus.${ext}`);
  const res = await fetch(`${WORKER_URL}/api/transcribe`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${userIdToken}`, 'X-Momentum-Org': orgId },
    body: form,
    signal: AbortSignal.timeout(90_000),
  });
  const data = await res.json().catch(() => ({})) as { transcription?: string; error?: string };
  if (!res.ok || typeof data.transcription !== 'string') {
    throw new BrainError(502, `Litterointi epäonnistui (${res.status}). Ääni on tallessa, voit yrittää uudelleen.`);
  }
  return data.transcription.trim();
};

const PROVIDERS: Record<string, Provider> = {
  'worker-whisper': workerWhisper,
};

export const TRANSCRIBE_PROVIDER = process.env.BRAIN_TRANSCRIBE_PROVIDER || 'worker-whisper';

export async function transcribe(input: TranscribeInput): Promise<string> {
  const p = PROVIDERS[TRANSCRIBE_PROVIDER];
  if (!p) throw new BrainError(503, `Tuntematon puheentunnistus: ${TRANSCRIBE_PROVIDER}`);
  if (input.audio.byteLength > 25 * 1024 * 1024) throw new BrainError(413, 'Äänite on liian pitkä (yli 25 Mt). Pilko se osiin.');
  return p(input);
}
