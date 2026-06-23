// POST /api/pdf/alt-suggest
// Vaatii: Authorization: Bearer <Firebase ID token>
// Runko: { imageBase64: string (data-URL tai raaka base64), context?: string }
// Palauttaa: { alt: string }  — suomenkielinen vaihtoehtoinen teksti kuvalle.
//
// Ympäristömuuttuja: ANTHROPIC_API_KEY

import { NextRequest, NextResponse } from 'next/server';
import { getUidFromRequest } from '@/lib/auth-server';

export const runtime = 'nodejs';
export const maxDuration = 30;

const MODEL = 'claude-haiku-4-5-20251001';

const PROMPT =
  'Kirjoita tälle kuvalle suomenkielinen vaihtoehtoinen teksti (alt-teksti) ruudunlukijaa varten. ' +
  'Kuvaile lyhyesti ja olennaisin ensin, yksi virke, korkeintaan noin 15 sanaa. ' +
  'Älä aloita sanoilla "kuva" tai "kuvassa". Jos kuva on logo, palauta pelkkä organisaation nimi. ' +
  'Jos kuva on puhtaasti koristeellinen (esim. väripalkki tai kuvio ilman sisältöä), palauta täsmälleen sana KORISTE. ' +
  'Palauta pelkkä alt-teksti ilman lainausmerkkejä tai selityksiä.';

export async function POST(req: NextRequest) {
  const uid = await getUidFromRequest(req);
  if (!uid) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'AI-ehdotukset eivät ole käytössä (ANTHROPIC_API_KEY puuttuu).' },
      { status: 503 },
    );
  }

  let imageBase64: string | undefined;
  let context: string | undefined;
  try {
    const body = await req.json();
    imageBase64 = body.imageBase64;
    context = typeof body.context === 'string' ? body.context : undefined;
  } catch {
    return NextResponse.json({ error: 'Virheellinen runko' }, { status: 400 });
  }
  if (!imageBase64) return NextResponse.json({ error: 'imageBase64 puuttuu' }, { status: 400 });

  // Tunnista media-tyyppi ja riisu data-URL-etuliite
  let mediaType = 'image/png';
  const m = imageBase64.match(/^data:(image\/[a-z+]+);base64,(.*)$/i);
  if (m) { mediaType = m[1]; imageBase64 = m[2]; }

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 100,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
              { type: 'text', text: context ? `${PROMPT}\n\nKonteksti: ${context}` : PROMPT },
            ],
          },
        ],
      }),
    });
    if (!r.ok) {
      const t = await r.text();
      return NextResponse.json({ error: `Anthropic (${r.status}): ${t.slice(0, 200)}` }, { status: 502 });
    }
    const data = await r.json();
    const text: string = (data.content?.[0]?.text || '').trim();
    const decorative = /^KORISTE\b/i.test(text);
    return NextResponse.json({ alt: decorative ? '' : text, decorative });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
