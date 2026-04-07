'use client';

import { useAuth } from '@/lib/auth';
import { ReactNode } from 'react';
import Sidebar from './Sidebar';

interface Props {
  children: ReactNode;
  title: string;
  subtitle?: string;
}

export default function AppShell({ children, title, subtitle }: Props) {
  const { loading, user, activeOrg } = useAuth();

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
