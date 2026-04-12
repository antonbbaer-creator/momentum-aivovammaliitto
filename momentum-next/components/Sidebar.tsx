'use client';

import { useAuth } from '@/lib/auth';
import { useModules } from '@/lib/modules';
import { usePathname, useRouter, useParams } from 'next/navigation';
import { getOrgBanner } from '@/lib/org-defaults';

const NAV_ICONS: Record<string, React.ReactNode> = {
  dashboard: (  // Koti — four-square grid
    <svg viewBox="0 0 24 24"><rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/></svg>
  ),
  strategy: (  // Strategia — compass
    <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><polygon points="16.24,7.76 14.12,14.12 7.76,16.24 9.88,9.88" strokeWidth="1.5" fill="currentColor" opacity=".3"/></svg>
  ),
  team: (  // Tiimi — two people
    <svg viewBox="0 0 24 24"><circle cx="9" cy="7" r="3"/><path d="M3 21v-2a4 4 0 014-4h4a4 4 0 014 4v2"/><circle cx="17" cy="9" r="2.5"/><path d="M21 21v-1.5a3 3 0 00-3-3h-.5"/></svg>
  ),
  viestit: (  // Viestit — chat bubble
    <svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
  ),
  aikataulut: (  // Aikataulut — calendar
    <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="17" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="16" y1="2" x2="16" y2="6"/></svg>
  ),
  viestinta: (  // Viestintä — megaphone
    <svg viewBox="0 0 24 24"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
  ),
  ohjelmisto: (  // Ohjelmisto — film clapboard
    <svg viewBox="0 0 24 24"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M2 12h20"/><path d="M7 7l3 5"/><path d="M14 7l3 5"/></svg>
  ),
  budget: (  // Apurahat — coins
    <svg viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
  ),
  vieraat: (  // Vieraat — people group
    <svg viewBox="0 0 24 24"><circle cx="8" cy="7" r="3"/><circle cx="16" cy="7" r="3"/><path d="M2 21v-2a4 4 0 014-4h4a4 4 0 014 4v2"/><path d="M16 11a4 4 0 014 4v6"/></svg>
  ),
  ruoka: (  // Ruoka — plate/utensils
    <svg viewBox="0 0 24 24"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 002-2V2"/><line x1="7" y1="2" x2="7" y2="22"/><path d="M21 15V2v0a5 5 0 00-5 5v6c0 1.1.9 2 2 2h3zm0 0v7"/></svg>
  ),
  tehtavat: (  // Tehtavat — checklist
    <svg viewBox="0 0 24 24"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
  ),
  ohjelma: (  // Ohjelma — clock/timeline
    <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 15"/></svg>
  ),
  tila: (  // Tila — building/venue
    <svg viewBox="0 0 24 24"><path d="M3 21h18"/><path d="M5 21V7l8-4v18"/><path d="M19 21V11l-6-4"/><path d="M9 9h1"/><path d="M9 13h1"/><path d="M9 17h1"/></svg>
  ),
  muistiinpanot: (  // Muistiinpanot — notepad
    <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
  ),
  admin: (  // Hallintapaneeli — gear
    <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
  ),
};

export default function Sidebar() {
  const { user, orgs, activeOrg, logout } = useAuth();
  const { enabledModules } = useModules();
  const pathname = usePathname();
  const router = useRouter();
  const params = useParams();
  const orgSlug = (params.orgSlug as string) || activeOrg || '';

  const currentOrg = orgs.find(o => o.orgId === orgSlug);
  const banner = getOrgBanner(orgSlug);

  return (
    <div className="side">
      <div className="side-hd">
        <div className="logo-text"><img src="/brand/hetki-logo-white.png" alt="Hetki" /> Momentum</div>
      </div>

      <div
        className="ws-box"
        onClick={() => router.push(`/${orgSlug}/settings`)}
        style={banner ? { padding: 0, overflow: 'hidden' } : undefined}
      >
        {banner ? (
          <img
            src={banner}
            alt={currentOrg?.name || 'Organisaatio'}
            style={{
              width: '100%',
              height: 'auto',
              display: 'block',
            }}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <div className="ws-name">{currentOrg?.name || 'Organisaatio'}</div>
        )}
      </div>

      <nav style={{ flex: 1, padding: '.5rem 0', overflowY: 'auto' }}>
        <div className="nav-sec">Työkalut</div>
        {enabledModules.map(m => (
          <div
            key={m.id}
            className={`nav-i ${pathname === `/${orgSlug}${m.path}` || pathname.startsWith(`/${orgSlug}${m.path}/`) ? 'act' : ''}`}
            onClick={() => router.push(`/${orgSlug}${m.path}`)}
          >
            <span className="nav-ic">{NAV_ICONS[m.id] || m.icon}</span>
            <span>{m.label}</span>
          </div>
        ))}
        {user?.email && ['anton@hetkicompany.com', 'anton.baer@gmail.com'].includes(user.email) && (
          <>
            <div className="nav-sec">Hallinta</div>
            <div
              className={`nav-i ${pathname === '/admin' ? 'act' : ''}`}
              onClick={() => router.push('/admin')}
            >
              <span className="nav-ic">{NAV_ICONS.admin}</span>
              <span>Hallintapaneeli</span>
            </div>
          </>
        )}
      </nav>

      <button
        type="button"
        className="side-guide"
        onClick={() => window.dispatchEvent(new Event('momentum:open-userguide'))}
        aria-label="Avaa käyttöohje"
      >
        <span className="nav-ic"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></span>
        <span>Käyttöohje</span>
      </button>

      <div className="side-ft">
        <div className="ava">
          {user?.photoURL ? (
            <img
              src={user.photoURL}
              alt=""
              style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }}
            />
          ) : (
            user?.displayName?.[0] || 'U'
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '.82rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {user?.displayName || 'Käyttäjä'}
          </div>
          <div style={{ fontSize: '.65rem', color: 'var(--t3)', cursor: 'pointer' }} onClick={logout}>
            Kirjaudu ulos
          </div>
        </div>
      </div>
    </div>
  );
}
