'use client';

import { useAuth } from '@/lib/auth';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState, ReactNode } from 'react';

export default function OrgLayout({ children }: { children: ReactNode }) {
  const { user, loading, orgs, activeOrg, setActiveOrg } = useAuth();
  const params = useParams();
  const router = useRouter();
  const orgSlug = params.orgSlug as string;
  const [synced, setSynced] = useState(false);

  useEffect(() => {
    if (loading) return;

    // Not authenticated
    if (!user) { router.push('/login'); return; }

    // No orgs
    if (orgs.length === 0) { router.push('/onboarding'); return; }

    // Check if user has access to this org
    const hasAccess = orgs.some(o => o.orgId === orgSlug);
    if (!hasAccess) {
      // Redirect to first available org
      router.push(`/${orgs[0].orgId}/dashboard`);
      return;
    }

    // Sync activeOrg with URL
    if (activeOrg !== orgSlug) {
      setActiveOrg(orgSlug);
    }

    setSynced(true);
  }, [loading, user, orgs, orgSlug, activeOrg, setActiveOrg, router]);

  // Wait until auth is loaded and org is synced
  if (loading || !user || !synced || activeOrg !== orgSlug) {
    return (
      <div className="onb">
        <div className="onb-wrap" style={{ textAlign: 'center' }}>
          <div className="typing"><span /><span /><span /></div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
