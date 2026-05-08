'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';
import {
  currentPermission,
  requestNotificationPermission,
  registerDeviceToken,
} from '@/lib/notifications';
import { useToast } from '@/lib/toast';

const SNOOZE_MS = 14 * 24 * 60 * 60 * 1000; // 14 päivää

interface ProfileMeta {
  pushAsked?: boolean;
  notifPromptDismissedAt?: number;
}

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

type Step = 'install' | 'permit' | 'ios-install' | 'hidden';

/**
 * Onboarding-banneri joka opastaa käyttäjän käyttämään Momentumia natiivina:
 *  1) Asenna app puhelimelle/työpöydälle (PWA)
 *  2) Salli ilmoitukset
 *
 *  Looginen valinta:
 *  - jos `beforeinstallprompt` on saatavilla (Android Chrome / desktop Chrome/Edge):
 *      step = 'install' → asenna prompt + sitten 'permit'
 *  - jos iOS Safari ilman PWA:ta:
 *      step = 'ios-install' → näytä manuaalinen ohjeistus
 *  - muuten:
 *      step = 'permit' → kysy ilmoituslupa
 *  - jos lupa jo annettu tai snoozattu / pushAsked → 'hidden'
 */
export default function NotifyMePrompt() {
  const { user } = useAuth();
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const orgSlug = (params?.orgSlug as string) || '';

  const [step, setStep] = useState<Step>('hidden');
  const [busy, setBusy] = useState(false);
  const [showIosSteps, setShowIosSteps] = useState(false);
  const installEvtRef = useRef<BeforeInstallPromptEvent | null>(null);

  // Kuuntele beforeinstallprompt — tallenna tapahtuma tulevaa promptia varten.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = (e: Event) => {
      e.preventDefault();
      installEvtRef.current = e as BeforeInstallPromptEvent;
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  // Päätä mitä näytetään käyttäjälle
  useEffect(() => {
    if (!user) return;
    if (typeof window === 'undefined') return;

    const ua = window.navigator.userAgent;
    const isIos = /iPhone|iPad|iPod/.test(ua);
    const isIosSafari = isIos && !/CriOS|FxiOS|EdgiOS/.test(ua) && /Safari/.test(ua);
    const standalone = window.matchMedia?.('(display-mode: standalone)').matches
      || (window.navigator as { standalone?: boolean }).standalone === true;

    let cancelled = false;
    (async () => {
      // Snooze + jo kysytty -tila
      try {
        const ref = doc(db, 'users', user.uid, 'meta', 'profile');
        const snap = await getDoc(ref);
        const data = (snap.exists() ? snap.data() : {}) as ProfileMeta;
        const dismissedAt = data.notifPromptDismissedAt;
        if (dismissedAt && Date.now() - dismissedAt < SNOOZE_MS) return;

        const perm = currentPermission();
        // Käyttäjä on jo sallinut → ei näytetä mitään
        if (perm === 'granted') return;

        // iOS Safari + ei standalonea → opasta asennus (push toimii vain PWA:na)
        if (isIosSafari && !standalone) {
          if (!cancelled) setStep('ios-install');
          return;
        }

        // Voiko asentaa PWA:n? Annetaan eventille hetki tulla — se voi tulla vasta
        // muutaman sadan ms:n päässä page loadista.
        await new Promise(r => setTimeout(r, 800));
        if (cancelled) return;
        if (installEvtRef.current && !standalone) {
          setStep('install');
          return;
        }

        // Muuten: pyydä lupa suoraan
        if (perm === 'default') setStep('permit');
      } catch {
        /* ignore */
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  if (step === 'hidden') return null;

  const enableNotifications = async () => {
    setBusy(true);
    try {
      const perm = await requestNotificationPermission();
      if (perm === 'granted') {
        const token = await registerDeviceToken();
        if (token) {
          const u = auth.currentUser;
          if (u) {
            try {
              await setDoc(
                doc(db, 'users', u.uid, 'meta', 'notifPrefs'),
                { enabled: true },
                { merge: true },
              );
            } catch { /* ignore */ }
          }
          toast('Ilmoitukset käytössä — saat hälytyksen viesteistä', 'success');
        } else {
          toast('Ilmoituksia ei voitu rekisteröidä — kokeile /settings-sivulla', 'error');
        }
      } else if (perm === 'denied') {
        toast('Ilmoitukset estetty selaimessa. Voit sallia osoitepalkin lukosta.', 'info');
      }
      setStep('hidden');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Virhe';
      toast(msg, 'error');
    } finally {
      setBusy(false);
    }
  };

  const installApp = async () => {
    const evt = installEvtRef.current;
    if (!evt) {
      // Ei voida promptata — siirry suoraan lupakysymykseen
      setStep('permit');
      return;
    }
    setBusy(true);
    try {
      await evt.prompt();
      const choice = await evt.userChoice;
      installEvtRef.current = null;
      if (choice.outcome === 'accepted') {
        toast('Momentum asennettu', 'success');
        // Asennuksen jälkeen sovellus avataan PWA:na — push-lupa pyydetään seuraavalla
        // avauksella standalone-tilassa. Päätetään tämä banneri pois nyt.
        setStep('hidden');
      } else {
        // Dismiss → siirry suoraan lupakysymykseen tässä selaininstanssissa
        setStep('permit');
      }
    } catch {
      setStep('permit');
    } finally {
      setBusy(false);
    }
  };

  const snooze = async () => {
    setStep('hidden');
    const u = auth.currentUser;
    if (!u) return;
    try {
      await setDoc(
        doc(db, 'users', u.uid, 'meta', 'profile'),
        { notifPromptDismissedAt: Date.now() },
        { merge: true },
      );
    } catch { /* ignore */ }
  };

  const goToSettings = () => {
    setStep('hidden');
    if (orgSlug) router.push(`/${orgSlug}/settings`);
  };

  // Sisältötekstit per vaihe
  let title = '';
  let body = '';
  let primaryLabel = '';
  let primaryAction: () => void = () => {};
  if (step === 'install') {
    title = 'Asenna Momentum';
    body = 'Asenna Momentum laitteellesi yhdellä napautuksella saadaksesi ilmoitukset ja oman ikonin kotinäytölle.';
    primaryLabel = 'Asenna';
    primaryAction = installApp;
  } else if (step === 'permit') {
    title = 'Salli viesti-ilmoitukset';
    body = 'Saat hälytyksen kun joku lähettää viestin tai mainitsee sinut — myös selain suljettuna.';
    primaryLabel = 'Salli ilmoitukset';
    primaryAction = enableNotifications;
  } else if (step === 'ios-install') {
    title = 'Asenna Momentum iPhonelle';
    body = 'iPhonella push-ilmoitukset toimivat vasta kun Momentum on asennettu kotinäytölle. Sen jälkeen avaat appin yhdellä napautuksella.';
    primaryLabel = showIosSteps ? 'Piilota ohjeet' : 'Näytä ohjeet';
    primaryAction = () => setShowIosSteps(s => !s);
  }

  return (
    <div
      role="region"
      aria-label={title}
      style={{
        margin: '12px 24px 0',
        padding: '0.85rem 1rem',
        background: 'rgba(5,107,159,.06)',
        border: '1px solid rgba(5,107,159,.22)',
        borderRadius: 'var(--r)',
      }}
    >
      <div style={{ display: 'flex', gap: '0.85rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <div aria-hidden style={{
          width: 30, height: 30, borderRadius: 7, flexShrink: 0,
          background: 'linear-gradient(180deg, var(--pri-l), var(--pri))',
          color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.95rem',
        }}>M</div>
        <div style={{ flex: '1 1 240px', minWidth: 0 }}>
          <div style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.15rem' }}>{title}</div>
          <div style={{ fontSize: '0.72rem', color: 'var(--t2)', lineHeight: 1.5 }}>{body}</div>
        </div>
        <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
          <button
            onClick={primaryAction}
            disabled={busy}
            style={{
              padding: '0.5rem 0.95rem',
              background: 'var(--ink)',
              color: 'var(--paper)',
              border: '1px solid var(--ink)',
              fontFamily: 'var(--font-display)',
              fontSize: '0.7rem',
              fontWeight: 500,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              cursor: busy ? 'wait' : 'pointer',
              opacity: busy ? 0.6 : 1,
            }}
          >
            {busy ? 'Hetki…' : primaryLabel}
          </button>
          {step !== 'ios-install' && (
            <button
              onClick={goToSettings}
              style={{
                padding: '0.5rem 0.7rem',
                background: 'transparent',
                color: 'var(--t2)',
                border: '1px solid var(--rule)',
                fontFamily: 'var(--font-display)',
                fontSize: '0.66rem',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                cursor: 'pointer',
              }}
            >
              Asetuksiin
            </button>
          )}
          <button
            onClick={snooze}
            aria-label="Sulje banneri"
            style={{
              padding: '0.5rem 0.55rem',
              background: 'transparent',
              color: 'var(--t3)',
              border: '1px solid transparent',
              fontFamily: 'var(--font-display)',
              fontSize: '1rem',
              cursor: 'pointer',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
      </div>

      {step === 'ios-install' && showIosSteps && (
        <ol style={{
          margin: '0.75rem 0 0 3rem',
          paddingLeft: '1.1rem',
          fontSize: '0.74rem',
          lineHeight: 1.7,
          color: 'var(--ink)',
        }}>
          <li>
            Paina selaimen alalaidan{' '}
            <span aria-label="jakamiskuvake" style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '0 .4rem', background: 'var(--paper-d)',
              borderRadius: 4, fontSize: '.7rem',
            }}>
              <svg width="11" height="13" viewBox="0 0 11 13" fill="none" aria-hidden style={{ marginTop: 1 }}>
                <path d="M5.5 1L5.5 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                <path d="M3 3.2L5.5 1L8 3.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M2 6V11.5C2 11.7761 2.22386 12 2.5 12H8.5C8.77614 12 9 11.7761 9 11.5V6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
              jakaminen
            </span>{' '}
            -kuvaketta.
          </li>
          <li>
            Vieritä alas ja valitse <b>“Lisää aloitusnäyttöön”</b>{' '}
            <span aria-hidden style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 14, height: 14, border: '1.2px solid currentColor',
              borderRadius: 3, fontSize: '.75rem', lineHeight: 1, fontWeight: 600,
            }}>+</span>
          </li>
          <li>Avaa Momentum kotinäytön M-ikonista — push-ilmoitukset voi sallia avautuvalla sivulla.</li>
        </ol>
      )}
    </div>
  );
}
