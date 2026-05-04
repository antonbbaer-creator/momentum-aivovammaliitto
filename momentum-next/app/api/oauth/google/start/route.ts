// OAuth-flowin aloitusreitti.
// VAATII: Authorization: Bearer <Firebase ID-token>
// PALAUTTAA: { url } — jonka asiakas navigoi (window.location.href = url).
// HMAC-allekirjoitettu state estää uid-spoofingin (CSRF-suoja).

import { NextRequest, NextResponse } from 'next/server';
import { googleOAuthConfig, isOAuthConfigured } from '@/lib/oauth-config';
import { getUidFromRequest } from '@/lib/auth-server';
import { signOAuthState } from '@/lib/oauth-state';

export async function GET(req: NextRequest) {
  if (!isOAuthConfigured('google')) {
    return NextResponse.json(
      { error: 'Google OAuth ei ole konfiguroitu (GOOGLE_OAUTH_CLIENT_ID/SECRET puuttuu)' },
      { status: 500 },
    );
  }

  const uid = await getUidFromRequest(req);
  if (!uid) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let state: string;
  try {
    state = signOAuthState(uid);
  } catch (e) {
    console.error('signOAuthState failed:', e);
    return NextResponse.json({ error: 'oauth_state_misconfigured' }, { status: 500 });
  }

  const cfg = googleOAuthConfig();
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: 'code',
    scope: cfg.scopes.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });

  return NextResponse.json({ url: `${cfg.authUrl}?${params.toString()}` });
}
