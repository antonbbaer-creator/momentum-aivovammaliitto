'use client';

import { useAuth } from '@/lib/auth';
import { useModules } from '@/lib/modules';
import { usePathname, useRouter, useParams } from 'next/navigation';

export default function Sidebar() {
  const { user, orgs, activeOrg, logout } = useAuth();
  const { enabledModules } = useModules();
  const pathname = usePathname();
  const router = useRouter();
  const params = useParams();
  const orgSlug = (params.orgSlug as string) || activeOrg || '';

  const currentOrg = orgs.find(o => o.orgId === orgSlug);

  return (
    <div className="side">
      <div className="side-hd">
        <div className="logo-text"><img src="/brand/hetki-logo-white.png" alt="Hetki" /> Momentum</div>
      </div>

      <div className="ws-box" onClick={() => router.push(`/${orgSlug}/settings`)}>
        <div className="ws-name">{currentOrg?.name || 'Organisaatio'}</div>
        <div className="ws-plan">Free Plan</div>
      </div>

      <nav style={{ flex: 1, padding: '.5rem 0', overflowY: 'auto' }}>
        <div className="nav-sec">Työkalut</div>
        {enabledModules.map(m => (
          <div
            key={m.id}
            className={`nav-i ${pathname === `/${orgSlug}${m.path}` || pathname.startsWith(`/${orgSlug}${m.path}/`) ? 'act' : ''}`}
            onClick={() => router.push(`/${orgSlug}${m.path}`)}
          >
            <span className="nav-ic">{m.icon}</span>
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
              <span className="nav-ic">{'\u2699'}</span>
              <span>Hallintapaneeli</span>
            </div>
          </>
        )}
      </nav>

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
