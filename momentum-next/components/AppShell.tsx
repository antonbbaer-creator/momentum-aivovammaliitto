'use client';

import { useAuth } from '@/lib/auth';
import { ReactNode, useState, useEffect } from 'react';
import { useIsMobile } from '@/lib/use-mobile';
import Sidebar from './Sidebar';

interface Props {
  children: ReactNode;
  title: string;
  subtitle?: string;
}

export default function AppShell({ children, title, subtitle }: Props) {
  const { loading, user, activeOrg } = useAuth();
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Load preferences from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('momentum_textSize');
    const scales: Record<string, number> = { sm: 1, md: 1.15, lg: 1.35 };
    if (saved && scales[saved]) document.documentElement.style.fontSize = `${scales[saved] * 16}px`;
    if (localStorage.getItem('momentum_compactMode') === 'true') document.documentElement.classList.add('compact');
  }, []);

  useEffect(() => {
    if (sidebarOpen) {
      document.body.classList.add('no-scroll');
    } else {
      document.body.classList.remove('no-scroll');
    }
    return () => document.body.classList.remove('no-scroll');
  }, [sidebarOpen]);

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
      <Sidebar mobileOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="main">
        <div className="topbar">
          {isMobile && (
            <button className="mob-toggle" onClick={() => setSidebarOpen(true)} aria-label="Avaa valikko">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <line x1="2" y1="4" x2="16" y2="4" />
                <line x1="2" y1="9" x2="16" y2="9" />
                <line x1="2" y1="14" x2="16" y2="14" />
              </svg>
            </button>
          )}
          <div style={{ flex: 1 }}>
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
