'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';

// Standardi `beforeinstallprompt` ei ole vakio TS-domissa
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'momentum_install_dismissed_at';
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 paivaa

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true;
  // iOS Safari
  return (window.navigator as { standalone?: boolean }).standalone === true;
}

function isIosSafari(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua) && !(window as { MSStream?: unknown }).MSStream;
  // Edge ja Chrome iOSilla on edelleen Safari-pohjaisia mutta UA-string sisaltaa CriOS / EdgiOS
  const isWebKit = /WebKit/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
  return iOS && isWebKit;
}

function dismissedRecently(): boolean {
  try {
    const t = Number(localStorage.getItem(DISMISS_KEY) || '0');
    return t > 0 && Date.now() - t < DISMISS_TTL_MS;
  } catch {
    return false;
  }
}

export default function InstallPrompt() {
  // Asennusehdotus vain kirjautuneille — ei näytetä julkisilla jakelusivuilla
  // (esim. /avl/graafinenohje, /logogeneraattori) joilla ei ole tunnuksia.
  const { user } = useAuth();
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);
  const [showIosHint, setShowIosHint] = useState(false);

  useEffect(() => {
    if (isStandalone() || dismissedRecently()) return;

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setShow(true);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);

    // iOS: ei beforeinstallpromptia, naytetaan staattinen vinkki
    if (isIosSafari()) {
      const t = setTimeout(() => setShowIosHint(true), 4000);
      return () => {
        clearTimeout(t);
        window.removeEventListener('beforeinstallprompt', onPrompt);
      };
    }

    const onInstalled = () => {
      setShow(false);
      setShowIosHint(false);
    };
    window.addEventListener('appinstalled', onInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch { /* ignore */ }
    setShow(false);
    setShowIosHint(false);
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
    setShow(false);
  };

  if (!user) return null;
  if (!show && !showIosHint) return null;

  return (
    <div
      role="dialog"
      aria-label="Asenna Momentum"
      style={{
        position: 'fixed',
        bottom: 16,
        left: 16,
        right: 16,
        maxWidth: 420,
        margin: '0 auto',
        padding: '14px 16px',
        background: 'var(--paper, #FAF7F2)',
        border: '1px solid var(--ink, #303030)',
        borderRadius: 14,
        boxShadow: '0 12px 40px rgba(0,0,0,.18)',
        zIndex: 9999,
        fontFamily: 'var(--font-body)',
        fontSize: 13,
        lineHeight: 1.45,
        color: 'var(--ink, #303030)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            background: '#056B9F',
            flexShrink: 0,
            backgroundImage: 'url(/icons/icon-192.png)',
            backgroundSize: 'cover',
          }}
          aria-hidden
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 13, letterSpacing: '.04em', textTransform: 'uppercase', marginBottom: 4 }}>
            Asenna Momentum
          </div>
          {showIosHint ? (
            <div>
              Avaa Safarin <b>Jaa</b>-valikko ja valitse <b>Lisää aloitusnäyttöön</b>. Sen jälkeen saat ilmoitukset suoraan puhelimeesi.
            </div>
          ) : (
            <div>Asenna Momentum laitteellesi, niin saat työpöydälle / aloitusnäytölle pikakuvakkeen ja ilmoitukset uusista viesteistä.</div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            {show && !showIosHint && (
              <button
                onClick={install}
                style={{
                  background: '#056B9F',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  padding: '8px 14px',
                  fontFamily: 'var(--font-display)',
                  fontSize: 12,
                  letterSpacing: '.06em',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                }}
              >
                Asenna
              </button>
            )}
            <button
              onClick={dismiss}
              style={{
                background: 'transparent',
                color: 'var(--ink2, #555)',
                border: '1px solid var(--line, #ddd)',
                borderRadius: 8,
                padding: '8px 14px',
                fontFamily: 'var(--font-display)',
                fontSize: 12,
                letterSpacing: '.06em',
                textTransform: 'uppercase',
                cursor: 'pointer',
              }}
            >
              Ei nyt
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
