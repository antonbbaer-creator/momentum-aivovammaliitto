'use client';

import { useEffect, useState, useCallback } from 'react';
import { collection, getDocs, doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import {
  currentPermission,
  requestNotificationPermission,
  registerDeviceToken,
  unregisterDeviceToken,
  type NotifPermission,
  type DeviceDoc,
} from '@/lib/notifications';
import { DEFAULT_NOTIF_PREFS, type NotifPrefs, type ChatNotifLevel } from '@/lib/chat-shared';
import { useToast } from '@/lib/toast';

type DeviceRow = DeviceDoc & { id: string; isThisDevice: boolean };

const PREFS_DOC = (uid: string) => doc(db, 'users', uid, 'meta', 'notifPrefs');

const PLATFORM_LABEL: Record<DeviceDoc['platform'], string> = {
  'web': 'Selain',
  'desktop-pwa': 'Tyopoyta (asennettu)',
  'ios-pwa': 'iPhone / iPad',
  'android-pwa': 'Android',
};

export default function NotificationsSettings() {
  const { toast } = useToast();
  const [permission, setPermission] = useState<NotifPermission>('default');
  const [prefs, setPrefs] = useState<NotifPrefs>(DEFAULT_NOTIF_PREFS);
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Lue tila kun komponentti ilmestyy
  useEffect(() => {
    setPermission(currentPermission());
    const user = auth.currentUser;
    if (!user) { setLoaded(true); return; }
    (async () => {
      try {
        const snap = await getDoc(PREFS_DOC(user.uid));
        if (snap.exists()) setPrefs({ ...DEFAULT_NOTIF_PREFS, ...(snap.data() as Partial<NotifPrefs>) });
      } catch { /* ignore */ }
      await refreshDevices();
      setLoaded(true);
    })();
  }, []);

  const refreshDevices = useCallback(async () => {
    const user = auth.currentUser;
    if (!user) return;
    try {
      const snap = await getDocs(collection(db, 'users', user.uid, 'devices'));
      const thisDeviceId = (typeof window !== 'undefined' && localStorage.getItem('momentum_device_id')) || '';
      const rows: DeviceRow[] = snap.docs.map(d => ({
        id: d.id,
        isThisDevice: d.id === thisDeviceId,
        ...(d.data() as DeviceDoc),
      }));
      rows.sort((a, b) => b.lastSeenAt - a.lastSeenAt);
      setDevices(rows);
    } catch { /* ignore */ }
  }, []);

  const savePrefs = async (next: NotifPrefs) => {
    setPrefs(next);
    const user = auth.currentUser;
    if (!user) return;
    try {
      await setDoc(PREFS_DOC(user.uid), next, { merge: true });
    } catch (e) {
      console.warn('[notifications] prefs save failed', e);
    }
  };

  const enableNotifications = async () => {
    setBusy(true);
    try {
      let perm = currentPermission();
      if (perm === 'unsupported') {
        toast('Selaimesi ei tue ilmoituksia', 'error');
        return;
      }
      if (perm !== 'granted') {
        perm = await requestNotificationPermission();
        setPermission(perm);
      }
      if (perm !== 'granted') {
        toast('Ilmoituksia ei sallittu', 'info');
        await savePrefs({ ...prefs, enabled: false });
        return;
      }
      const token = await registerDeviceToken();
      if (!token) {
        toast('Ilmoituksia ei voitu rekisteroida (token puuttuu)', 'error');
        return;
      }
      await savePrefs({ ...prefs, enabled: true });
      await refreshDevices();
      toast('Ilmoitukset kaytossa tassa laitteessa', 'success');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Ilmoitusten kytkemisessa virhe';
      toast(msg, 'error');
    } finally {
      setBusy(false);
    }
  };

  const disableThisDevice = async () => {
    setBusy(true);
    try {
      await unregisterDeviceToken();
      await savePrefs({ ...prefs, enabled: false });
      await refreshDevices();
      toast('Ilmoitukset poistettu kaytosta tassa laitteessa', 'info');
    } finally {
      setBusy(false);
    }
  };

  const removeDevice = async (deviceId: string) => {
    const user = auth.currentUser;
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'devices', deviceId));
      await refreshDevices();
      toast('Laite poistettu', 'info');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Poisto epaonnistui';
      toast(msg, 'error');
    }
  };

  const setChatLevel = (level: ChatNotifLevel) => savePrefs({ ...prefs, chatMessages: level });
  const setTasksOn = (on: boolean) => savePrefs({ ...prefs, tasks: on });

  if (!loaded) return null;

  const permLabel: Record<NotifPermission, string> = {
    default: 'Ei kysytty',
    granted: 'Sallittu',
    denied: 'Estetty selaimen asetuksissa',
    unsupported: 'Selain ei tue',
  };

  return (
    <div style={{ marginTop: '.85rem' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '.82rem', fontWeight: 600, marginBottom: '.2rem' }}>Ilmoitukset</div>
          <div style={{ fontSize: '.7rem', color: 'var(--t3)', lineHeight: 1.5 }}>
            {permission === 'granted' && prefs.enabled
              ? <>Ilmoitukset päällä tässä laitteessa. Saat hälytyksen kun joku lähettää viestin tai mainitsee sinut.</>
              : permission === 'denied'
                ? <>Selaimesi estää ilmoitukset. Salli ne osoitepalkin lukko-ikonista ja palaa tänne.</>
                : permission === 'unsupported'
                  ? <>Selaimesi ei tue ilmoituksia.</>
                  : <>Salli ilmoitukset, niin Momentum hälyttää sinua chat-viesteistä, mainitseinneista ja sinulle annetuista tehtävistä — myös selain suljettuna.</>}
          </div>
        </div>
        <button
          onClick={prefs.enabled ? disableThisDevice : enableNotifications}
          disabled={busy || permission === 'unsupported'}
          style={{
            padding: '.55rem 1rem',
            cursor: busy ? 'wait' : 'pointer',
            background: prefs.enabled ? 'var(--paper-l)' : 'var(--ink)',
            color: prefs.enabled ? 'var(--ink)' : 'var(--paper)',
            border: `1px solid ${prefs.enabled ? 'var(--rule)' : 'var(--ink)'}`,
            fontFamily: 'var(--font-display)', fontSize: '.72rem', fontWeight: 500,
            letterSpacing: '.06em', textTransform: 'uppercase', whiteSpace: 'nowrap',
            opacity: busy || permission === 'unsupported' ? 0.5 : 1,
          }}
        >
          {busy ? 'Hetki…' : prefs.enabled ? 'Katkaise' : 'Salli ilmoitukset'}
        </button>
      </div>

      {/* Tilannerivit */}
      <div style={{ fontSize: '.66rem', color: 'var(--t3)', marginTop: '.4rem' }}>
        Selaimen lupa: <b style={{ color: 'var(--t2)' }}>{permLabel[permission]}</b>
      </div>

      {/* Per-tyyppi-toggleet */}
      {prefs.enabled && (
        <div style={{ marginTop: '.85rem', display: 'grid', gap: '.5rem' }}>
          <div style={{ fontSize: '.7rem', color: 'var(--t2)' }}>Mistä haluat ilmoituksen?</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '.4rem' }}>
            {([
              { key: 'all', label: 'Kaikki viestit', desc: 'Kaikki kanavien viestit (paitsi muted)' },
              { key: 'mentions', label: 'Vain maininnat', desc: '@nimi, @here, @all, DMt' },
              { key: 'none', label: 'Ei mitaan', desc: 'Vain badget sidebariin' },
            ] as { key: ChatNotifLevel; label: string; desc: string }[]).map(o => (
              <button
                key={o.key}
                onClick={() => setChatLevel(o.key)}
                style={{
                  padding: '.7rem', cursor: 'pointer',
                  background: prefs.chatMessages === o.key ? 'var(--paper-d)' : 'var(--paper-l)',
                  border: `1px solid ${prefs.chatMessages === o.key ? 'var(--ink)' : 'var(--rule)'}`,
                  color: 'var(--ink)', textAlign: 'left',
                  fontFamily: 'var(--font-display)',
                }}
              >
                <div style={{ fontSize: '.74rem', fontWeight: 500, letterSpacing: '.04em', textTransform: 'uppercase' }}>{o.label}</div>
                <div style={{ fontSize: '.64rem', color: 'var(--ink2)', fontFamily: 'var(--font)', marginTop: '.2rem' }}>{o.desc}</div>
              </button>
            ))}
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '.6rem', fontSize: '.78rem', marginTop: '.4rem' }}>
            <input
              type="checkbox"
              checked={prefs.tasks}
              onChange={e => setTasksOn(e.target.checked)}
            />
            Ilmoita kun saan uuden tehtavan tai tehtavani statuks muuttuu
          </label>
        </div>
      )}

      {/* Laitteet */}
      {devices.length > 0 && (
        <div style={{ marginTop: '.85rem' }}>
          <div style={{ fontSize: '.7rem', color: 'var(--t2)', marginBottom: '.4rem' }}>Rekisteroidyt laitteet</div>
          <div style={{ display: 'grid', gap: '.3rem' }}>
            {devices.map(d => (
              <div key={d.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                gap: '.6rem', padding: '.5rem .7rem',
                background: 'var(--paper-l)', border: '1px solid var(--rule)',
              }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: '.72rem', fontWeight: 500 }}>
                    {PLATFORM_LABEL[d.platform] || d.platform}
                    {d.isThisDevice && <span style={{ color: 'var(--pri)', marginLeft: '.4rem', fontSize: '.62rem' }}>· Tämä laite</span>}
                  </div>
                  <div style={{ fontSize: '.62rem', color: 'var(--t3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    Viimeksi: {new Date(d.lastSeenAt).toLocaleString('fi-FI')}
                  </div>
                </div>
                <button
                  onClick={() => removeDevice(d.id)}
                  style={{
                    padding: '.35rem .6rem', cursor: 'pointer',
                    background: 'transparent', color: 'var(--t2)',
                    border: '1px solid var(--rule)',
                    fontFamily: 'var(--font-display)', fontSize: '.62rem',
                    letterSpacing: '.06em', textTransform: 'uppercase',
                  }}
                >
                  Poista
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
