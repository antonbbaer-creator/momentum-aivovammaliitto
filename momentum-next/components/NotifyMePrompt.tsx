'use client';

import { useEffect, useState } from 'react';
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

/**
 * First-run-banneri joka kysyy uutta käyttäjää ottamaan ilmoitukset käyttöön.
 * Näytetään AppShellissä jokaisen sivun yläosassa kun:
 *  - käyttäjä on kirjautunut
 *  - selaimen lupa on 'default' (ei vielä kysytty)
 *  - users/{uid}/meta/profile.pushAsked === undefined
 *  - notifPromptDismissedAt < 14 päivää sitten
 *  - selain ei ole iOS Safari ilman PWA:ta (siellä /settings:n IosInstallCard hoitaa)
 */
export default function NotifyMePrompt() {
  const { user } = useAuth();
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const orgSlug = (params?.orgSlug as string) || '';

  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    if (typeof window === 'undefined') return;

    // Selaimen tila
    const perm = currentPermission();
    if (perm !== 'default') return;

    // iOS Safari ilman PWA:ta — promppia ei voi täyttää järkevästi (ei push-supportia ennen
    // kuin Add to Home Screen on tehty). NotificationsSettings hoitaa ohjeistuksen.
    const ua = window.navigator.userAgent;
    const isIos = /iPhone|iPad|iPod/.test(ua);
    const standalone = window.matchMedia?.('(display-mode: standalone)').matches
      || (window.navigator as { standalone?: boolean }).standalone === true;
    if (isIos && !standalone) return;

    // Firestore: onko jo kysytty / snoozattu?
    let cancelled = false;
    (async () => {
      try {
        const ref = doc(db, 'users', user.uid, 'meta', 'profile');
        const snap = await getDoc(ref);
        const data = (snap.exists() ? snap.data() : {}) as ProfileMeta;
        if (data.pushAsked) return; // selain on jo kysynyt vähintään kerran
        const dismissedAt = data.notifPromptDismissedAt;
        if (dismissedAt && Date.now() - dismissedAt < SNOOZE_MS) return;
        if (!cancelled) setVisible(true);
      } catch {
        /* ignore */
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  if (!visible) return null;

  const enable = async () => {
    setBusy(true);
    try {
      const perm = await requestNotificationPermission();
      if (perm === 'granted') {
        const token = await registerDeviceToken();
        if (token) {
          // Ota myös prefs.enabled päälle, jotta käyttäjän ei tarvitse käydä /settings
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
      setVisible(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Virhe';
      toast(msg, 'error');
    } finally {
      setBusy(false);
    }
  };

  const snooze = async () => {
    setVisible(false);
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
    setVisible(false);
    if (orgSlug) router.push(`/${orgSlug}/settings`);
  };

  return (
    <div
      role="region"
      aria-label="Salli ilmoitukset"
      style={{
        margin: '12px 24px 0',
        padding: '0.85rem 1rem',
        background: 'rgba(5,107,159,.06)',
        border: '1px solid rgba(5,107,159,.22)',
        borderRadius: 'var(--r)',
        display: 'flex',
        gap: '0.85rem',
        alignItems: 'center',
        flexWrap: 'wrap',
      }}
    >
      <div aria-hidden style={{
        width: 30, height: 30, borderRadius: 7, flexShrink: 0,
        background: 'linear-gradient(180deg, var(--pri-l), var(--pri))',
        color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.95rem',
      }}>M</div>
      <div style={{ flex: '1 1 220px', minWidth: 0 }}>
        <div style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: '0.15rem' }}>
          Salli viesti-ilmoitukset
        </div>
        <div style={{ fontSize: '0.72rem', color: 'var(--t2)', lineHeight: 1.5 }}>
          Saat hälytyksen kun joku lähettää viestin tai mainitsee sinut — myös selain suljettuna.
        </div>
      </div>
      <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
        <button
          onClick={enable}
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
          {busy ? 'Hetki…' : 'Ota käyttöön'}
        </button>
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
  );
}
