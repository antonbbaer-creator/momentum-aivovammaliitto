// POST /api/admin/link-user-to-org
// Vain super-admin saa kutsua. Verifioi Firebase ID-tokenin, tarkistaa
// käyttäjän sähköpostin SUPER_ADMINS-listaa vasten ja kutsuu jaettua
// linkUserToOrg-logiikkaa.

import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminMode } from '@/lib/firebase-admin';
import { getAuth } from 'firebase-admin/auth';
import { linkUserToOrg, LinkRole } from '@/lib/admin/link-user-to-org';
import { isSuperAdminEmail } from '@/lib/super-admins';

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
  } catch (e) {
    console.error('verifyIdToken failed:', e);
    const mode = adminMode();
    return NextResponse.json({
      error: 'invalid_token',
      detail: String(e),
      hint: mode === 'project-only'
        ? 'Server ei tunne service accountia. Aseta FIREBASE_ADMIN_KEY .env.local -tiedostoon (Firebase Console → Project Settings → Service Accounts → Generate new private key, base64-pakattuna).'
        : 'Token saattaa olla vanhentunut tai eri Firebase-projektista. Kirjaudu ulos ja takaisin.',
    }, { status: 401 });
  }
  if (!isSuperAdminEmail(callerEmail)) {
    return NextResponse.json({ error: 'forbidden', email: callerEmail }, { status: 403 });
  }
  if (adminMode() === 'project-only') {
    return NextResponse.json({
      error: 'admin_not_configured',
      hint: 'Firestore-kirjoitukset vaativat FIREBASE_ADMIN_KEY -env-muuttujan. Aseta se .env.local -tiedostoon ja käynnistä dev-palvelin uudelleen.',
    }, { status: 500 });
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
