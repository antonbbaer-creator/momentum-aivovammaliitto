// POST /api/admin/link-user-to-org
// Vain super-admin saa kutsua. Verifioi Firebase ID-tokenin, tarkistaa
// käyttäjän sähköpostin SUPER_ADMINS-listaa vasten ja kutsuu jaettua
// linkUserToOrg-logiikkaa.

import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { getAuth } from 'firebase-admin/auth';
import { linkUserToOrg, LinkRole } from '@/lib/admin/link-user-to-org';

const SUPER_ADMINS = [
  'anton@hetkicompany.com',
  'anton.baer@gmail.com',
  'anton.b.baer@gmail.com',
  'anton.baer@kinolapinlahti.fi',
  'claude-test@hetkicompany.com',
];

interface Payload {
  email: string;
  orgId: string;
  memberName?: string;
  role?: LinkRole;
}

export async function POST(req: NextRequest) {
  // Verifioi tunnus
  adminDb(); // alusta firebase-admin
  const authHeader = req.headers.get('authorization') || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  let callerEmail: string | undefined;
  try {
    const decoded = await getAuth().verifyIdToken(match[1]);
    callerEmail = (decoded.email || '').toLowerCase();
  } catch {
    return NextResponse.json({ error: 'invalid_token' }, { status: 401 });
  }
  if (!callerEmail || !SUPER_ADMINS.map(s => s.toLowerCase()).includes(callerEmail)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  let body: Payload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  if (!body.email || !body.orgId) {
    return NextResponse.json({ error: 'email tai orgId puuttuu' }, { status: 400 });
  }

  try {
    const result = await linkUserToOrg(adminDb(), body.email.trim(), body.orgId.trim(), {
      memberName: body.memberName?.trim() || null,
      role: body.role || 'member',
    });
    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (e) {
    console.error('link-user-to-org failed:', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
