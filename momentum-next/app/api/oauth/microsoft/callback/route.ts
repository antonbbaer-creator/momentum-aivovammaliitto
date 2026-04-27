import { NextRequest, NextResponse } from 'next/server';
import { microsoftOAuthConfig } from '@/lib/oauth-config';
import { saveIntegrationServer } from '@/lib/integration-server';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state'); // = uid
  const error = req.nextUrl.searchParams.get('error');

  if (error) {
    return NextResponse.redirect(new URL(`/oma/asetukset?oauth_error=${encodeURIComponent(error)}`, req.url));
  }
  if (!code || !state) {
    return NextResponse.redirect(new URL('/oma/asetukset?oauth_error=missing_code', req.url));
  }

  const cfg = microsoftOAuthConfig();

  try {
    const tokenRes = await fetch(cfg.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        redirect_uri: cfg.redirectUri,
        grant_type: 'authorization_code',
        scope: cfg.scopes.join(' '),
      }).toString(),
    });

    if (!tokenRes.ok) {
      const body = await tokenRes.text();
      console.error('Microsoft token exchange failed:', body);
      return NextResponse.redirect(new URL('/oma/asetukset?oauth_error=token_exchange', req.url));
    }

    const tokens = await tokenRes.json() as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      scope: string;
      id_token?: string;
    };

    let email: string | undefined;
    if (tokens.id_token) {
      try {
        const payload = JSON.parse(
          Buffer.from(tokens.id_token.split('.')[1], 'base64').toString('utf-8'),
        );
        email = payload.email || payload.preferred_username;
      } catch {}
    }

    // Hae kalenterilista Microsoft Graphista
    let calendars: { id: string; name: string; isPrimary?: boolean; color?: string }[] = [];
    try {
      const listRes = await fetch('https://graph.microsoft.com/v1.0/me/calendars', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      if (listRes.ok) {
        const data = await listRes.json() as {
          value: Array<{ id: string; name: string; isDefaultCalendar?: boolean; color?: string; hexColor?: string }>;
        };
        calendars = (data.value || []).map(c => ({
          id: c.id,
          name: c.name,
          isPrimary: c.isDefaultCalendar,
          color: c.hexColor || undefined,
        }));
      }
    } catch (e) {
      console.warn('MS calendar list fetch failed:', e);
    }

    await saveIntegrationServer(state, 'microsoft', {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || '',
      expiresAt: Date.now() + tokens.expires_in * 1000,
      scopes: (tokens.scope || '').split(' ').filter(Boolean),
      email,
      calendars: calendars.map(c => ({
        id: c.id,
        name: c.name,
        isPrimary: c.isPrimary,
        syncEnabled: !!c.isPrimary,
        color: c.color,
      })),
    });

    return NextResponse.redirect(new URL('/oma/asetukset?oauth_ok=microsoft', req.url));
  } catch (e) {
    console.error('Microsoft OAuth callback failed:', e);
    return NextResponse.redirect(new URL('/oma/asetukset?oauth_error=server', req.url));
  }
}
