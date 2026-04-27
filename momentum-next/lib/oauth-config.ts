// Server-side OAuth-konfiguraatio Google + Microsoft Calendar -integraatioille.
// Vaadittavat env-muuttujat (.env.local):
//   GOOGLE_OAUTH_CLIENT_ID
//   GOOGLE_OAUTH_CLIENT_SECRET
//   MICROSOFT_OAUTH_CLIENT_ID
//   MICROSOFT_OAUTH_CLIENT_SECRET
//   MICROSOFT_TENANT_ID (oletus 'common')
//   OAUTH_REDIRECT_BASE_URL (esim. http://localhost:3000 tai https://momentum.example.com)

export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  authUrl: string;
  tokenUrl: string;
  scopes: string[];
}

const baseUrl = () =>
  process.env.OAUTH_REDIRECT_BASE_URL || 'http://localhost:3000';

export const googleOAuthConfig = (): OAuthConfig => ({
  clientId: process.env.GOOGLE_OAUTH_CLIENT_ID || '',
  clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET || '',
  redirectUri: `${baseUrl()}/api/oauth/google/callback`,
  authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenUrl: 'https://oauth2.googleapis.com/token',
  scopes: [
    'openid',
    'email',
    'https://www.googleapis.com/auth/calendar',
  ],
});

export const microsoftOAuthConfig = (): OAuthConfig => {
  const tenant = process.env.MICROSOFT_TENANT_ID || 'common';
  return {
    clientId: process.env.MICROSOFT_OAUTH_CLIENT_ID || '',
    clientSecret: process.env.MICROSOFT_OAUTH_CLIENT_SECRET || '',
    redirectUri: `${baseUrl()}/api/oauth/microsoft/callback`,
    authUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,
    tokenUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
    scopes: [
      'openid',
      'email',
      'offline_access',
      'Calendars.ReadWrite',
    ],
  };
};

export const isOAuthConfigured = (provider: 'google' | 'microsoft'): boolean => {
  const cfg = provider === 'google' ? googleOAuthConfig() : microsoftOAuthConfig();
  return !!cfg.clientId && !!cfg.clientSecret;
};
