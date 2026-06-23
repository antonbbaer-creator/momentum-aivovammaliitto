// GET /api/avl/esitteet
// Julkinen lista AVL:n valmiista esitteistä ladattavaksi (ei vaadi kirjautumista).
// Palauttaa vain tiedostonimen, latauslinkin ja onko esite saavutettava.

import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

export const runtime = 'nodejs';

interface PublicBrochure {
  filename: string;
  url: string;
  accessible: boolean;
  uploadedAt?: number;
}

export async function GET() {
  try {
    const snap = await adminDb().doc('organizations/avl/data/pdf_documents').get();
    if (!snap.exists) return NextResponse.json({ brochures: [] });
    const docs = JSON.parse(snap.data()?.v || '[]') as Array<Record<string, any>>;
    const brochures: PublicBrochure[] = docs
      .map((d) => {
        const s = d.storage || {};
        const url = s.finalUrl || s.taggedUrl || s.originalUrl;
        if (!url) return null;
        return { filename: d.filename, url, accessible: !!s.finalUrl, uploadedAt: d.uploadedAt } as PublicBrochure;
      })
      .filter((b): b is PublicBrochure => b !== null)
      .sort((a, b) => (b.uploadedAt || 0) - (a.uploadedAt || 0));
    return NextResponse.json({ brochures });
  } catch (e) {
    // Jos admin-luku ei onnistu (esim. ympäristö ilman avainta), palauta tyhjä lista siististi
    return NextResponse.json({ brochures: [], error: e instanceof Error ? e.message : String(e) });
  }
}
