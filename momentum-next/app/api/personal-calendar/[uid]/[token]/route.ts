// GET /api/personal-calendar/[uid]/[token]
// Julkinen yksisuuntainen ICS-feed Apple Calendarille / muille tilaajille.
// Auth: URL:n token vastaa users/{uid}/personalData/icsFeed-dokumentin tokenia.
// Token toimii bearer-salaisuutena; vuotaminen tarkoittaa että koko kalenteri
// luettavissa. Tunnuksen voi uudistaa /oma/asetukset-paneelista.

import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { adminDb } from '@/lib/firebase-admin';
import {
  IcsFeedDoc,
  TimeBlock,
  PersonalCategory,
} from '@/lib/personal-shared';
import { buildIcsFeed } from '@/lib/ics-feed';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function safeEq(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

async function readPersonalDoc<T>(
  uid: string,
  key: string,
  fallback: T,
): Promise<T> {
  const snap = await adminDb()
    .collection('users').doc(uid)
    .collection('personalData').doc(key)
    .get();
  if (!snap.exists) return fallback;
  const data = snap.data();
  const v = (data && typeof data === 'object' ? (data as { v?: unknown }).v : null);
  if (typeof v !== 'string') return fallback;
  try {
    return JSON.parse(v) as T;
  } catch {
    return fallback;
  }
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ uid: string; token: string }> },
) {
  const { uid, token } = await ctx.params;
  if (!uid || !token || token.length < 16) {
    return new NextResponse('Not found', { status: 404 });
  }

  const feed = await readPersonalDoc<IcsFeedDoc | null>(uid, 'icsFeed', null);
  if (!feed || !feed.enabled || !feed.token || !safeEq(feed.token, token)) {
    return new NextResponse('Not found', { status: 404 });
  }

  const [blocks, categories] = await Promise.all([
    readPersonalDoc<TimeBlock[]>(uid, 'calendar', []),
    readPersonalDoc<PersonalCategory[]>(uid, 'categories', []),
  ]);

  const ics = buildIcsFeed(blocks, categories, uid);

  return new NextResponse(ics, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="momentum.ics"',
      // Apple pollaa noin tunnin välein; tämä auttaa väliproxyja olemaan
      // serveeraamatta ylivanhaa kopiota.
      'Cache-Control': 'private, max-age=300, must-revalidate',
    },
  });
}
