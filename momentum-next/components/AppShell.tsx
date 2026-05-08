'use client';

import { useAuth } from '@/lib/auth';
import { ReactNode, useState, useEffect, useCallback } from 'react';
import { useIsMobile } from '@/lib/use-mobile';
import Sidebar from './Sidebar';
import NotifyMePrompt from './NotifyMePrompt';
import { useToast } from '@/lib/toast';
import { touchDeviceLastSeen, useForegroundNotifications, currentPermission } from '@/lib/notifications';

interface Props {
  children: ReactNode;
  title: string;
  subtitle?: string;
  hideTitle?: boolean;
  personalMode?: boolean;
}

export default function AppShell({ children, title, subtitle, hideTitle = false, personalMode = false }: Props) {
  const { loading, user, activeOrg } = useAuth();
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { toast } = useToast();

  // Foreground push: kun sovellus on auki ja FCM-viesti tulee, naytetaan in-app toast
  // sen sijaan etta selain naytaisi system-notifin (silla foreground onMessage ei
  // automaattisesti naytetta osData-notifia).
  const onForeground = useCallback((p: { title?: string; body?: string }) => {
    const text = p.title ? `${p.title}${p.body ? ' — ' + p.body : ''}` : (p.body || 'Uusi viesti');
    toast(text, 'info');
  }, [toast]);
  useForegroundNotifications(onForeground);

  // Paivita laitteen lastSeenAt kun sovellus avataan ja kayttaja on jo kirjautunut.
  useEffect(() => {
    if (!user) return;
    if (currentPermission() !== 'granted') return;
    touchDeviceLastSeen().catch(() => { /* ignore */ });
  }, [user]);

  // Rekisteroi service worker heti kun sovellus avautuu — Chromen PWA install-prompt
  // vaatii ettat SW on rekisteroity (vaikka kayttaja ei ole viela sallinut notifikaatioita).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/firebase-messaging-sw.js').catch(() => { /* ignore */ });
  }, []);

  // Typewriter-efekti sivuotsikolle (sama kuin dashboardin "Hei, Anton.")
  const [typedTitle, setTypedTitle] = useState('');
  const [titleTypingDone, setTitleTypingDone] = useState(false);
  useEffect(() => {
    if (hideTitle) return;
    setTypedTitle('');
    setTitleTypingDone(false);
    let i = 0;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      i++;
      setTypedTitle(title.slice(0, i));
      if (i >= title.length) {
        setTitleTypingDone(true);
        return;
      }
      const ch = title[i - 1];
      const delay = ch === ' ' ? 90 : ch === ',' || ch === '.' ? 200 : 55 + Math.random() * 55;
      timer = setTimeout(tick, delay);
    };
    timer = setTimeout(tick, 180);
    return () => clearTimeout(timer);
  }, [title, hideTitle]);

  // Load preferences from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('momentum_textSize');
    const scales: Record<string, number> = { sm: 1, md: 1.15, lg: 1.35 };
    if (saved && scales[saved]) document.documentElement.style.fontSize = `${scales[saved] * 16}px`;
    if (localStorage.getItem('momentum_compactMode') === 'true') document.documentElement.classList.add('compact');
    const savedTheme = localStorage.getItem('momentum_theme');
    document.documentElement.dataset.theme = savedTheme === 'dark' ? 'dark' : 'light';
  }, []);

  useEffect(() => {
    if (sidebarOpen) {
      document.body.classList.add('no-scroll');
    } else {
      document.body.classList.remove('no-scroll');
    }
    return () => document.body.classList.remove('no-scroll');
  }, [sidebarOpen]);

  if (loading || !user || (!activeOrg && !personalMode)) {
    return (
      <div className="onb">
        <div className="onb-wrap" style={{ textAlign: 'center' }}>
          <div className="typing"><span /><span /><span /></div>
        </div>
      </div>
    );
  }

  const orgShort = personalMode ? 'OMA' : (activeOrg || '').toUpperCase();
  const dateLabel = new Intl.DateTimeFormat('fi-FI', { weekday: 'short', day: 'numeric', month: 'numeric', year: 'numeric' })
    .format(new Date())
    .replace('.,', ' ·')
    .replace(/\s+/g, ' ');
  const timeLabel = new Intl.DateTimeFormat('fi-FI', { hour: '2-digit', minute: '2-digit' }).format(new Date());

  return (
    <div className="app">
      <Sidebar mobileOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="main">
        <div className="mast">
          {isMobile && (
            <button className="mob-toggle" onClick={() => setSidebarOpen(true)} aria-label="Avaa valikko">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <line x1="2" y1="4" x2="16" y2="4" />
                <line x1="2" y1="9" x2="16" y2="9" />
                <line x1="2" y1="14" x2="16" y2="14" />
              </svg>
            </button>
          )}
          <div className="crumb">
            <span>{orgShort}</span>
            <span className="sep">/</span>
            <b>{title}</b>
          </div>
          {!isMobile && (
            <input className="search" placeholder="Etsi · projektit, tehtävät, ihmiset" />
          )}
          <span className="date">{dateLabel} · {timeLabel}</span>
        </div>
        <NotifyMePrompt />
        {subtitle && (
          <div style={{ padding: '14px 36px 0', fontFamily: 'var(--font-display)', fontSize: 11, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--ink2)' }}>
            {subtitle}
          </div>
        )}
        {!hideTitle && (
          <section className="page-hero">
            <h1 aria-label={title}>
              <span aria-hidden>{typedTitle || '\u00A0'}</span>
              <span className={`tw-cur ${titleTypingDone ? 'tw-cur--done' : ''}`} aria-hidden />
            </h1>
          </section>
        )}
        <div className="page">
          <div className="page-enter">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
