// POST /api/pdf/autotag
// Vaatii: Authorization: Bearer <Firebase ID token>, runko = PDF-tavut (application/pdf)
// Hakee Adobe-access tokenin (OAuth Server-to-Server), ajaa Adobe PDF Services Auto-Tagin
// ja palauttaa tagatun PDF:n tavuina.
//
// Ympäristömuuttujat:
//   PDF_SERVICES_CLIENT_ID
//   PDF_SERVICES_CLIENT_SECRET

import { NextRequest, NextResponse } from 'next/server';
import { getUidFromRequest } from '@/lib/auth-server';

export const runtime = 'nodejs';
export const maxDuration = 60;

const IMS_TOKEN_URL = 'https://ims-na1.adobelogin.com/ims/token/v3';
const PDF_BASE = 'https://pdf-services.adobe.io';

async function getAccessToken(): Promise<string> {
  // Testifallback: valmis 24 h access token (esim. Adobe-konsolista). Sallii live-testin
  // ennen kuin tuotannon client_secret on saatu.
  const staticToken = process.env.PDF_SERVICES_ACCESS_TOKEN;
  if (staticToken) return staticToken;

  const clientId = process.env.PDF_SERVICES_CLIENT_ID;
  const clientSecret = process.env.PDF_SERVICES_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('Adobe-avaimet puuttuvat (PDF_SERVICES_CLIENT_ID / PDF_SERVICES_CLIENT_SECRET tai PDF_SERVICES_ACCESS_TOKEN).');
  }
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'client_credentials',
    scope: 'openid,AdobeID,DCAPI',
  });
  const r = await fetch(IMS_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!r.ok) throw new Error(`IMS-token epäonnistui (${r.status}): ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  return j.access_token as string;
}

function findDownloadUri(obj: Record<string, any>, keys: string[]): string | null {
  for (const k of keys) if (obj[k]?.downloadUri) return obj[k].downloadUri as string;
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === 'object' && (v as any).downloadUri && k !== 'report') return (v as any).downloadUri as string;
  }
  return null;
}

export async function POST(req: NextRequest) {
  const uid = await getUidFromRequest(req);
  if (!uid) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let bytes: Buffer;
  try {
    bytes = Buffer.from(await req.arrayBuffer());
  } catch {
    return NextResponse.json({ error: 'PDF-runko puuttuu' }, { status: 400 });
  }
  if (!bytes.length) return NextResponse.json({ error: 'Tyhjä tiedosto' }, { status: 400 });

  try {
    const token = await getAccessToken();
    const clientId = process.env.PDF_SERVICES_CLIENT_ID!;
    const H = { Authorization: `Bearer ${token}`, 'x-api-key': clientId };

    // 1) Luo asset
    let r = await fetch(`${PDF_BASE}/assets`, {
      method: 'POST',
      headers: { ...H, 'Content-Type': 'application/json' },
      body: JSON.stringify({ mediaType: 'application/pdf' }),
    });
    if (!r.ok) throw new Error(`assets (${r.status}): ${(await r.text()).slice(0, 200)}`);
    const { uploadUri, assetID } = await r.json();

    // 2) Lataa tavut presigned-URLiin
    r = await fetch(uploadUri, { method: 'PUT', headers: { 'Content-Type': 'application/pdf' }, body: new Uint8Array(bytes) });
    if (!r.ok) throw new Error(`upload (${r.status})`);

    // 3) Käynnistä Auto-Tag
    r = await fetch(`${PDF_BASE}/operation/autotag`, {
      method: 'POST',
      headers: { ...H, 'Content-Type': 'application/json' },
      body: JSON.stringify({ assetID }),
    });
    if (r.status !== 201) throw new Error(`autotag-start (${r.status}): ${(await r.text()).slice(0, 200)}`);
    const statusUrl = r.headers.get('location');
    if (!statusUrl) throw new Error('Ei status-URLia');

    // 4) Pollaa valmistumista (max ~50 s)
    let result: Record<string, any> | null = null;
    for (let i = 0; i < 25; i++) {
      await new Promise((s) => setTimeout(s, 2000));
      r = await fetch(statusUrl, { headers: H });
      if (!r.ok) throw new Error(`status (${r.status})`);
      result = await r.json();
      if (result!.status === 'done') break;
      if (result!.status === 'failed') throw new Error('Adobe Auto-Tag epäonnistui');
    }
    if (!result || result.status !== 'done') throw new Error('Aikakatkaisu Auto-Tagissa');

    // 5) Lataa tagattu PDF
    const pdfUri = findDownloadUri(result, ['tagged-pdf', 'taggedPDF', 'tagged_pdf']);
    if (!pdfUri) throw new Error('Tagattua PDF:ää ei löytynyt vastauksesta');
    const taggedRes = await fetch(pdfUri);
    const tagged = Buffer.from(await taggedRes.arrayBuffer());

    return new NextResponse(new Uint8Array(tagged), {
      status: 200,
      headers: { 'Content-Type': 'application/pdf' },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
