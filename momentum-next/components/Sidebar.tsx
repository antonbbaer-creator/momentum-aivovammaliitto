'use client';

import { useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useModules } from '@/lib/modules';
import { usePathname, useRouter, useParams } from 'next/navigation';
import { getOrgBanner, getOrgTeamMembers, getGrantsKey } from '@/lib/org-defaults';
import { useOrgData } from '@/lib/firestore';
import { OrgTeamMember, uniqueMembersByName, resolveUserMember } from '@/lib/team-shared';
import { Assignable, effectiveStatus } from '@/lib/assignments-shared';
import type { Grant } from '@/lib/grants-shared';
import { isPersonalPath } from '@/lib/personal-shared';

const PERSONAL_MODULES = [
  { id: 'p-koti',      label: 'Koti',       path: '/oma/koti' },
  { id: 'p-viikko',    label: 'Viikko',     path: '/oma/viikko' },
  { id: 'p-asetukset', label: 'Asetukset',  path: '/oma/asetukset' },
];

interface MinimalTask extends Assignable { done?: boolean; deletedAt?: number; }
interface MinimalProject { tasks?: MinimalTask[]; deletedAt?: number; archived?: boolean; }

interface SidebarProps {
  mobileOpen?: boolean;
  onClose?: () => void;
}

export default function Sidebar({ mobileOpen, onClose }: SidebarProps) {
  const { user, orgs, activeOrg, logout } = useAuth();
  const { enabledModules } = useModules();
  const pathname = usePathname();
  const router = useRouter();
  const params = useParams();
  const personalMode = isPersonalPath(pathname);
  const orgSlug = (params.orgSlug as string) || activeOrg || '';
  const [switcherOpen, setSwitcherOpen] = useState(false);

  const currentOrg = orgs.find(o => o.orgId === orgSlug);
  const banner = personalMode ? null : getOrgBanner(orgSlug);

  const [tasksRaw] = useOrgData<MinimalTask[]>('tasks', []);
  const [projectsRaw] = useOrgData<MinimalProject[]>('projects', []);
  const [grantsRaw] = useOrgData<Grant[]>(getGrantsKey(orgSlug), []);
  const [membersRaw] = useOrgData<OrgTeamMember[]>('orgTeamMembers', getOrgTeamMembers(orgSlug));
  const tyonjakoBadge = useMemo(() => {
    if (!user) return 0;
    const members = uniqueMembersByName(membersRaw || []);
    const me = resolveUserMember(members, user);
    const myName = me?.name || user.displayName || '';
    if (!myName) return 0;
    const check = (a: Assignable, done?: boolean) => {
      const st = effectiveStatus(a);
      if (done) return false;
      if (a.assignee === myName && st === 'pending') return true;
      if (a.assignedBy === myName && st === 'rejected') return true;
      return false;
    };
    let n = 0;
    for (const t of (tasksRaw || [])) if (!t.deletedAt && check(t, t.done)) n++;
    for (const p of (projectsRaw || [])) {
      if (p.deletedAt || p.archived) continue;
      for (const t of (p.tasks || [])) if (check(t, t.done)) n++;
    }
    for (const g of (grantsRaw || [])) {
      if (g.deletedAt) continue;
      for (const s of (g.subtasks || []) as MinimalTask[]) if (check(s, s.done)) n++;
    }
    return n;
  }, [tasksRaw, projectsRaw, grantsRaw, membersRaw, user]);

  const navigate = (path: string) => {
    router.push(path);
    onClose?.();
  };

  const initials = (user?.displayName || 'U')
    .split(' ')
    .map(s => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const orgShort = personalMode
    ? 'HENKILÖKOHTAINEN'
    : (currentOrg?.name || orgSlug || 'ORG').toUpperCase();
  const isAdmin = !!user?.email && ['anton@hetkicompany.com', 'anton.baer@gmail.com'].includes(user.email);

  const sidebarContent = (
    <>
      <div className="side-brand">
        <span className="h">Momentum</span>
      </div>

      <div className="side-org" onClick={() => setSwitcherOpen(v => !v)} style={{ position: 'relative' }}>
        <span className="lbl">Työtila</span>
        {banner ? (
          <img
            src={banner}
            alt={currentOrg?.name || 'Organisaatio'}
            style={{ width: '100%', height: 'auto', display: 'block', marginTop: 6 }}
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          />
        ) : (
          <span className="name">
            {orgShort}
            <span style={{ fontSize: 10, color: 'var(--ink3)', letterSpacing: '.16em' }}>↕</span>
          </span>
        )}
        {switcherOpen && (
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'absolute', left: 12, right: 12, top: '100%',
              background: 'var(--paper)', border: '1px solid var(--rule)',
              boxShadow: '0 8px 24px rgba(0,0,0,.08)', zIndex: 20, padding: '6px 0',
            }}
          >
            {orgs.map(o => (
              <div
                key={o.orgId}
                className={`nav-row ${o.orgId === orgSlug && !personalMode ? 'act' : ''}`}
                onClick={() => { setSwitcherOpen(false); navigate(`/${o.orgId}/dashboard`); }}
              >
                <span className="num">·</span>
                <span style={{ textTransform: 'none', letterSpacing: '.04em' }}>{o.name || o.orgId}</span>
              </div>
            ))}
            <div style={{ height: 1, background: 'var(--rule)', margin: '6px 14px' }} />
            <div
              className={`nav-row ${personalMode && pathname.startsWith('/oma/koti') ? 'act' : ''}`}
              onClick={() => { setSwitcherOpen(false); navigate('/oma/koti'); }}
            >
              <span className="num">◉</span>
              <span style={{ textTransform: 'none', letterSpacing: '.04em' }}>Henkilökohtainen</span>
            </div>
            <div
              className={`nav-row ${pathname.startsWith('/oma/asetukset') ? 'act' : ''}`}
              onClick={() => { setSwitcherOpen(false); navigate('/oma/asetukset'); }}
            >
              <span className="num">⚙</span>
              <span style={{ textTransform: 'none', letterSpacing: '.04em' }}>Asetukset</span>
            </div>
          </div>
        )}
      </div>

      <nav className="side-nav">
        <div className="side-sec">{personalMode ? 'Oma tila' : 'Työkalut'}</div>
        {personalMode ? (
          PERSONAL_MODULES.map((m, i) => {
            const active = pathname === m.path || pathname.startsWith(`${m.path}/`);
            return (
              <div
                key={m.id}
                className={`nav-row ${active ? 'act' : ''}`}
                onClick={() => navigate(m.path)}
              >
                <span className="num">{String(i + 1).padStart(2, '0')}</span>
                <span>{m.label}</span>
              </div>
            );
          })
        ) : (
          enabledModules.map((m, i) => {
            const active = pathname === `/${orgSlug}${m.path}` || pathname.startsWith(`/${orgSlug}${m.path}/`);
            const showBadge = m.id === 'tyonjako' && tyonjakoBadge > 0;
            return (
              <div
                key={m.id}
                className={`nav-row ${active ? 'act' : ''}`}
                onClick={() => navigate(`/${orgSlug}${m.path}`)}
              >
                <span className="num">{String(i + 1).padStart(2, '0')}</span>
                <span>{m.label}</span>
                {showBadge && <span className="badge">{tyonjakoBadge}</span>}
              </div>
            );
          })
        )}

        {isAdmin && !personalMode && (
          <>
            <div className="side-sec" style={{ marginTop: 12 }}>Hallinta</div>
            <div
              className={`nav-row ${pathname === '/admin' ? 'act' : ''}`}
              onClick={() => navigate('/admin')}
            >
              <span className="num">A1</span>
              <span>Hallintapaneeli</span>
            </div>
            <div
              className={`nav-row ${pathname === `/${orgSlug}/roskakori` ? 'act' : ''}`}
              onClick={() => navigate(`/${orgSlug}/roskakori`)}
            >
              <span className="num">A2</span>
              <span>Roskakori</span>
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
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 10, letterSpacing: '.16em', color: 'var(--ink3)' }}>?</span>
        <span>Käyttöohje</span>
      </button>

      <div className="cbar"></div>

      <div className="side-foot">
        <div className="av">
          {user?.photoURL ? (
            <img
              src={user.photoURL}
              alt=""
              style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }}
            />
          ) : (
            initials
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="nm" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {user?.displayName || 'Käyttäjä'}
          </div>
          <div className="ro" style={{ cursor: 'pointer' }} onClick={logout}>
            Kirjaudu ulos
          </div>
        </div>
      </div>
    </>
  );

  return (
    <>
      <div className="side">
        {sidebarContent}
      </div>

      {mobileOpen && (
        <div className="mob-overlay" style={{ display: 'block' }} onClick={onClose} />
      )}
      <div className={`mob-drawer${mobileOpen ? ' open' : ''}`}>
        <button className="mob-close" onClick={onClose} aria-label="Sulje valikko">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <line x1="3" y1="3" x2="13" y2="13" />
            <line x1="13" y1="3" x2="3" y2="13" />
          </svg>
        </button>
        {sidebarContent}
      </div>
    </>
  );
}
