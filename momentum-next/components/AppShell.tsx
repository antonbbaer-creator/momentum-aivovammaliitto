'use client';

import { useAuth } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import { useEffect, ReactNode } from 'react';
import Sidebar from './Sidebar';

interface Props {
  children: ReactNode;
  title: string;
  subtitle?: string;
}

export default function AppShell({ children, title, subtitle }: Props) {
  const { user, loading, orgs, activeOrg } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) router.push('/login');
    else if (orgs.length === 0) router.push('/onboarding');
    else if (!activeOrg) router.push('/onboarding');
  }, [user, loading, orgs, activeOrg, router]);

  if (loading || !user || !activeOrg) {
    return (
      <div className="onb">
        <div className="onb-wrap" style={{ textAlign: 'center' }}>
          <div className="typing"><span /><span /><span /></div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <Sidebar />
      <div className="main">
        <div className="topbar">
          <div>
            <h1>{title}</h1>
            {subtitle && <p>{subtitle}</p>}
          </div>
        </div>
        <div className="page">
          <div className="page-enter">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
