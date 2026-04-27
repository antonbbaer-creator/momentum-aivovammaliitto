import { NextRequest, NextResponse } from 'next/server';
import { googleOAuthConfig, isOAuthConfigured } from '@/lib/oauth-config';

export async function GET(req: NextRequest) {
  if (!isOAuthConfigured('google')) {
    return NextResponse.json(
      { error: 'Google OAuth ei ole konfiguroitu (GOOGLE_OAUTH_CLIENT_ID/SECRET puuttuu)' },
      { status: 500 },
    );
  }

  const cfg = googleOAuthConfig();
  const uid = req.nextUrl.searchParams.get('uid');
  if (!uid) {
    return NextResponse.json({ error: 'uid puuttuu' }, { status: 400 });
  }

  // state = uid (callback tarvitsee tietää kenelle tokenit kuuluu)
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: 'code',
    scope: cfg.scopes.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state: uid,
  });

  return NextResponse.redirect(`${cfg.authUrl}?${params.toString()}`);
}
