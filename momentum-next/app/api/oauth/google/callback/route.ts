import { NextRequest, NextResponse } from 'next/server';
import { googleOAuthConfig } from '@/lib/oauth-config';
import { saveIntegrationServer } from '@/lib/integration-server';
import { verifyOAuthState } from '@/lib/oauth-state';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state');
  const error = req.nextUrl.searchParams.get('error');

  if (error) {
    return NextResponse.redirect(new URL(`/oma/asetukset?oauth_error=${encodeURIComponent(error)}`, req.url));
  }
  if (!code || !state) {
    return NextResponse.redirect(new URL('/oma/asetukset?oauth_error=missing_code', req.url));
  }

  // Verifioi state HMAC:n perusteella — varmistaa että flowin aloitti
  // todennettu käyttäjä ja että uid ei ole spoofattu.
  const verified = verifyOAuthState(state);
  if (!verified) {
    return NextResponse.redirect(new URL('/oma/asetukset?oauth_error=invalid_state', req.url));
  }
  const uid = verified.uid;

  const cfg = googleOAuthConfig();

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
      }).toString(),
    });

    if (!tokenRes.ok) {
      // Älä lokita response-bodya — voi sisältää OAuth-koodin tai muuta arkaluonteista
      console.error('Google token exchange failed:', tokenRes.status);
      return NextResponse.redirect(new URL('/oma/asetukset?oauth_error=token_exchange', req.url));
    }

    const tokens = await tokenRes.json() as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      scope: string;
      id_token?: string;
    };

    // Email id_tokenista (ei pakollinen)
    let email: string | undefined;
    if (tokens.id_token) {
      try {
        const payload = JSON.parse(
          Buffer.from(tokens.id_token.split('.')[1], 'base64').toString('utf-8'),
        );
        email = payload.email;
      } catch {}
    }

    // Hae kalenterilista heti — käytetään näyttöön ja write-mappauksen oletukseen
    let calendars: { id: string; name: string; isPrimary?: boolean; color?: string }[] = [];
    try {
      const listRes = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      if (listRes.ok) {
        const data = await listRes.json() as { items: Array<{ id: string; summary: string; primary?: boolean; backgroundColor?: string }> };
        calendars = (data.items || []).map(c => ({
          id: c.id,
          name: c.summary,
          isPrimary: c.primary,
          color: c.backgroundColor,
        }));
      }
    } catch (e) {
      console.warn('Calendar list fetch failed:', e);
    }

    await saveIntegrationServer(uid, 'google', {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || '',
      expiresAt: Date.now() + tokens.expires_in * 1000,
      scopes: (tokens.scope || '').split(' ').filter(Boolean),
      email,
      calendars: calendars.map(c => ({
        id: c.id,
        name: c.name,
        isPrimary: c.isPrimary,
        syncEnabled: !!c.isPrimary,        // oletus: vain primary näkyy
        color: c.color,
      })),
    });

    return NextResponse.redirect(new URL('/oma/asetukset?oauth_ok=google', req.url));
  } catch (e) {
    console.error('Google OAuth callback failed:', e);
    return NextResponse.redirect(new URL('/oma/asetukset?oauth_error=server', req.url));
  }
}
