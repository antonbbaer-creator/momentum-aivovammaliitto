/* Momentum FCM service worker
 * Tata tiedostoa EI bundlata Next.js:n kautta — se serveroidaan suoraan public/-kansiosta
 * jotta polku /firebase-messaging-sw.js loytyy ja scope on '/'.
 *
 * Compat-buildit ladataan Firebase CDN:stä — ei NPM-paketista — koska importScripts
 * vaatii joko CDN-URLin tai workerin oman bundlauksen. Versio pidetaan synkassa
 * package.json:n firebase-version kanssa.
 */
importScripts('https://www.gstatic.com/firebasejs/12.11.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.11.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyB6MGUyOveOl1zaV_1c0TdBVldZM09Sm8E',
  authDomain: 'momentum-69262.firebaseapp.com',
  projectId: 'momentum-69262',
  storageBucket: 'momentum-69262.firebasestorage.app',
  messagingSenderId: '465706849550',
  appId: '1:465706849550:web:9103dc22e7088e53c5335f',
});

const messaging = firebase.messaging();

// Background-viestit (sovellus suljettu / valilehti taustalla).
// Foreground-viestit menevat onMessage-handlerille selain-puolella.
messaging.onBackgroundMessage((payload) => {
  const title = (payload.notification && payload.notification.title) || 'Momentum';
  const body = (payload.notification && payload.notification.body) || '';
  const data = payload.data || {};
  const link = data.link || '/';

  self.registration.showNotification(title, {
    body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { link },
    tag: data.tag || undefined,       // tag yhdistaa samaa kanavaa koskevat viestit
    renotify: !!data.tag,
  });
});

// Tyhja fetch-handler: Chromen PWA install-kriteeri vaatii etta SW kasittelee
// fetch-eventin. Emme cache mitaan — annetaan kaiken mennä verkkoon.
self.addEventListener('fetch', () => { /* noop, network passthrough */ });

// Klikkaus → avaa olemassa oleva valilehti tai uusi linkkiin.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || '/';
  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of allClients) {
      try {
        const url = new URL(client.url);
        if (url.origin === self.location.origin) {
          await client.focus();
          // Jos sama origin, navigoidaan linkkiin
          if ('navigate' in client) {
            try { await client.navigate(link); } catch (_) { /* ignore */ }
          }
          return;
        }
      } catch (_) { /* ignore */ }
    }
    await self.clients.openWindow(link);
  })());
});
