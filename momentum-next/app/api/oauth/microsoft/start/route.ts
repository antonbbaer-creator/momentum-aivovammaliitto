import { NextRequest, NextResponse } from 'next/server';
import { microsoftOAuthConfig, isOAuthConfigured } from '@/lib/oauth-config';

export async function GET(req: NextRequest) {
  if (!isOAuthConfigured('microsoft')) {
    return NextResponse.json(
      { error: 'Microsoft OAuth ei ole konfiguroitu (MICROSOFT_OAUTH_CLIENT_ID/SECRET puuttuu)' },
      { status: 500 },
    );
  }

  const cfg = microsoftOAuthConfig();
  const uid = req.nextUrl.searchParams.get('uid');
  if (!uid) {
    return NextResponse.json({ error: 'uid puuttuu' }, { status: 400 });
  }

  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: 'code',
    response_mode: 'query',
    scope: cfg.scopes.join(' '),
    state: uid,
    prompt: 'consent',
  });

  return NextResponse.redirect(`${cfg.authUrl}?${params.toString()}`);
}
