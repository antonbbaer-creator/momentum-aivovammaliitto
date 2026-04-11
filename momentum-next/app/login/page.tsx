'use client';

import { useAuth } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useRef } from 'react';

export default function LoginPage() {
  const { user, loading, loginWithGoogle, loginWithEmail, signUpWithEmail, orgs, activeOrg } = useAuth();
  const router = useRouter();
  const [videoLoaded, setVideoLoaded] = useState(false);
  const [showFirst, setShowFirst] = useState(true);
  const v1 = useRef<HTMLVideoElement>(null);
  const v2 = useRef<HTMLVideoElement>(null);

  // Form state
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      if (orgs.length > 0) {
        const org = activeOrg || orgs[0].orgId;
        router.push(`/${org}/dashboard`);
      } else {
        router.push('/onboarding');
      }
    }
  }, [user, loading, orgs, activeOrg, router]);

  useEffect(() => {
    const a = v1.current;
    const b = v2.current;
    if (!a || !b) return;

    let current: 'a' | 'b' = 'a';
    let switching = false;

    const safePlay = (el: HTMLVideoElement) => {
      const p = el.play();
      if (p && typeof p.catch === 'function') {
        p.catch(err => {
          // Autoplay blocked — retry once on next user interaction
          if (err?.name === 'NotAllowedError') {
            const resume = () => { el.play().catch(() => {}); window.removeEventListener('pointerdown', resume); };
            window.addEventListener('pointerdown', resume, { once: true });
          }
        });
      }
    };

    const switchTo = (which: 'a' | 'b') => {
      if (switching || current === which) return;
      switching = true;
      const next = which === 'a' ? a : b;
      const prev = which === 'a' ? b : a;
      next.currentTime = 0;
      safePlay(next);
      setShowFirst(which === 'a');
      current = which;
      // After crossfade completes, pause previous video so it isn't decoded in background
      window.setTimeout(() => { try { prev.pause(); } catch {} switching = false; }, 1100);
    };

    const onEndedA = () => switchTo('b');
    const onEndedB = () => switchTo('a');
    a.addEventListener('ended', onEndedA);
    b.addEventListener('ended', onEndedB);

    // Kick off first video (autoplay attribute should handle this, but be explicit)
    safePlay(a);

    // Watchdog: if the currently-visible video has been paused for >2s, restart it.
    // Handles stalled metadata, tab-resume, and missing `ended` events on some codecs.
    const watchdog = window.setInterval(() => {
      const active = current === 'a' ? a : b;
      if (active.paused && !switching) {
        active.currentTime = 0;
        safePlay(active);
      }
    }, 2000);

    // Resume when the tab becomes visible again (browsers pause backgrounded videos)
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      const active = current === 'a' ? a : b;
      if (active.paused) safePlay(active);
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      a.removeEventListener('ended', onEndedA);
      b.removeEventListener('ended', onEndedB);
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(watchdog);
    };
  }, []);

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setSubmitting(true);
    try {
      if (mode === 'signup') {
        if (!name.trim()) { setError('Syötä nimesi'); setSubmitting(false); return; }
        if (password.length < 6) { setError('Salasanan tulee olla vähintään 6 merkkiä'); setSubmitting(false); return; }
        await signUpWithEmail(email, password, name.trim());
      } else {
        await loginWithEmail(email, password);
      }
    } catch (err: any) {
      const code = err?.code || '';
      if (code === 'auth/user-not-found') setError('Käyttäjää ei löytynyt');
      else if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') setError('Väärä salasana');
      else if (code === 'auth/email-already-in-use') setError('Sähköposti on jo käytössä');
      else if (code === 'auth/invalid-email') setError('Virheellinen sähköposti');
      else if (code === 'auth/weak-password') setError('Salasana on liian heikko');
      else setError('Kirjautuminen epäonnistui');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="onb">
        <div className="onb-wrap" style={{ textAlign: 'center' }}>
          <div className="typing"><span /><span /><span /></div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>

      {/* ═══ LEFT ═══ */}
      <div style={{
        width: 480, flexShrink: 0, display: 'flex', flexDirection: 'column',
        justifyContent: 'center', padding: '3rem 3.5rem',
      }}>
        <div style={{ marginBottom: '2.5rem' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '2.4rem', fontWeight: 500, letterSpacing: '.04em', textTransform: 'uppercase', marginBottom: '.75rem' }}>Momentum</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', color: 'var(--t3)', fontSize: '.82rem' }}>
            <span>by</span>
            <img src="/brand/hetki-company-logo-white.png" alt="Hetki Company" style={{ height: 20, opacity: 0.7 }} />
          </div>
        </div>

        <h1 style={{
          fontSize: '2rem', fontWeight: 800, lineHeight: 1.2, letterSpacing: '-.02em',
          marginBottom: '1rem', maxWidth: 360,
        }}>
          Viestinnän suunnittelun strateginen kumppani
        </h1>
        <p style={{ color: 'var(--t2)', fontSize: '.92rem', lineHeight: 1.7, marginBottom: '2rem', maxWidth: 360 }}>
          Suunnittele, toteuta ja seuraa organisaatiosi viestintää yhdessä tiimisi kanssa.
        </p>

        {/* Google login */}
        <button
          onClick={loginWithGoogle}
          style={{
            background: '#fff', color: '#333', border: '1px solid #ddd',
            padding: '.85rem 1.5rem', fontSize: '.95rem', fontWeight: 600,
            borderRadius: '10px', cursor: 'pointer', display: 'flex',
            alignItems: 'center', gap: '0.75rem', width: '100%', maxWidth: 360, justifyContent: 'center',
            transition: 'all .2s', boxShadow: '0 2px 8px rgba(0,0,0,.08)',
          }}
          onMouseEnter={e => { (e.currentTarget as any).style.boxShadow = '0 4px 16px rgba(0,0,0,.15)'; }}
          onMouseLeave={e => { (e.currentTarget as any).style.boxShadow = '0 2px 8px rgba(0,0,0,.08)'; }}
        >
          <svg width="18" height="18" viewBox="0 0 48 48">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          </svg>
          Jatka Googlella
        </button>

        {/* Divider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', margin: '1.25rem 0', maxWidth: 360 }}>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          <span style={{ fontSize: '.75rem', color: 'var(--t3)', fontWeight: 500 }}>tai</span>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        </div>

        {/* Email form */}
        <form onSubmit={handleEmailSubmit} style={{ maxWidth: 360, display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
          {mode === 'signup' && (
            <input className="input" placeholder="Nimi" value={name} onChange={e => setName(e.target.value)}
              style={{ padding: '.75rem 1rem', fontSize: '.88rem', background: 'var(--elev)', border: '1px solid var(--border)' }} />
          )}
          <input className="input" type="email" placeholder="Sähköposti" value={email} onChange={e => { setEmail(e.target.value); setError(''); }}
            style={{ padding: '.75rem 1rem', fontSize: '.88rem', background: 'var(--elev)', border: '1px solid var(--border)' }} />
          <input className="input" type="password" placeholder="Salasana" value={password} onChange={e => { setPassword(e.target.value); setError(''); }}
            style={{ padding: '.75rem 1rem', fontSize: '.88rem', background: 'var(--elev)', border: '1px solid var(--border)' }} />

          {error && <p style={{ color: 'var(--red)', fontSize: '.82rem', margin: 0 }}>{error}</p>}

          <button type="submit" disabled={submitting || !email || !password}
            style={{
              background: 'var(--pri)', color: '#fff', border: 'none',
              padding: '.85rem 1.5rem', fontSize: '.95rem', fontWeight: 600,
              borderRadius: '10px', cursor: 'pointer', width: '100%',
              opacity: submitting || !email || !password ? 0.5 : 1,
              transition: 'all .2s',
            }}>
            {submitting ? 'Odota...' : mode === 'signup' ? 'Luo tili' : 'Kirjaudu sisään'}
          </button>
        </form>

        {/* Toggle mode */}
        <p style={{ marginTop: '1rem', fontSize: '.82rem', color: 'var(--t3)', maxWidth: 360 }}>
          {mode === 'login' ? (
            <>Ei vielä tiliä? <span onClick={() => { setMode('signup'); setError(''); }} style={{ color: 'var(--pri-l)', cursor: 'pointer', fontWeight: 600 }}>Luo tili</span></>
          ) : (
            <>Onko sinulla jo tili? <span onClick={() => { setMode('login'); setError(''); }} style={{ color: 'var(--pri-l)', cursor: 'pointer', fontWeight: 600 }}>Kirjaudu sisään</span></>
          )}
        </p>

        <div style={{ marginTop: '2rem', fontSize: '.72rem', color: 'var(--t3)' }}>
          Hetki Company Oy
        </div>
      </div>

      {/* ═══ RIGHT: Two preloaded videos, crossfade ═══ */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <video ref={v1} autoPlay muted playsInline preload="auto" onCanPlay={() => setVideoLoaded(true)} src="/brand/hero-video.mp4"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: showFirst ? 1 : 0, transition: 'opacity 1s ease-in-out' }} />
        <video ref={v2} muted playsInline preload="auto" src="/brand/hero-video-2.mp4"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: showFirst ? 0 : 1, transition: 'opacity 1s ease-in-out' }} />
        {!videoLoaded && (
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, var(--pri-d) 0%, var(--hetki-pink) 50%, var(--hetki-yellow) 100%)' }} />
        )}
      </div>
    </div>
  );
}
