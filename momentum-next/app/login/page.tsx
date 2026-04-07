'use client';

import { useAuth } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function LoginPage() {
  const { user, loading, loginWithGoogle, orgs, activeOrg } = useAuth();
  const router = useRouter();
  const [videoLoaded, setVideoLoaded] = useState(false);

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

      {/* ═══ LEFT: Login content ═══ */}
      <div style={{
        width: 520, flexShrink: 0, display: 'flex', flexDirection: 'column',
        justifyContent: 'center', padding: '3rem 3.5rem', position: 'relative', zIndex: 2,
      }}>
        {/* Logo */}
        <div style={{ marginBottom: '3rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem', marginBottom: '.5rem' }}>
            <img src="/brand/hetki-logo-white.png" alt="Hetki" style={{ height: 28 }} />
            <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', fontWeight: 500, letterSpacing: '.03em', textTransform: 'uppercase' }}>Momentum</span>
          </div>
          <p style={{ color: 'var(--t3)', fontSize: '.85rem' }}>Viestinnän suunnittelu- ja strategiatyökalu</p>
        </div>

        {/* Main heading */}
        <h1 style={{
          fontSize: '2.2rem', fontWeight: 800, lineHeight: 1.15, letterSpacing: '-.03em',
          marginBottom: '1rem', maxWidth: 380,
        }}>
          Hallitse viestintääsi yhdestä paikasta
        </h1>
        <p style={{ color: 'var(--t2)', fontSize: '.95rem', lineHeight: 1.7, marginBottom: '2.5rem', maxWidth: 380 }}>
          Strategiasta toteutukseen — suunnittele, seuraa ja raportoi organisaatiosi viestintää tiimisi kanssa.
        </p>

        {/* Features */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '2.5rem' }}>
          {[
            { icon: '\u25c8', title: 'Strategia', desc: 'Tavoitteet ja kohderyhmät' },
            { icon: '\u2630', title: 'Projektit', desc: 'Kanban ja tehtävät' },
            { icon: '\u25a6', title: 'Kalenteri', desc: 'Vuosikello ja julkaisut' },
            { icon: '\u25c7', title: 'AI-avustaja', desc: 'Kontekstitietoinen sparraus' },
          ].map(f => (
            <div key={f.title} style={{ display: 'flex', gap: '.6rem', alignItems: 'flex-start' }}>
              <span style={{ fontSize: '1.1rem', color: 'var(--pri-l)', marginTop: '.1rem' }}>{f.icon}</span>
              <div>
                <div style={{ fontSize: '.82rem', fontWeight: 700 }}>{f.title}</div>
                <div style={{ fontSize: '.72rem', color: 'var(--t3)' }}>{f.desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Login button */}
        <button
          onClick={loginWithGoogle}
          style={{
            background: '#fff', color: '#333', border: '1px solid #ddd',
            padding: '1rem 2rem', fontSize: '1rem', fontWeight: 600,
            borderRadius: '10px', cursor: 'pointer', display: 'inline-flex',
            alignItems: 'center', gap: '0.75rem', width: 'fit-content',
            transition: 'all .2s', boxShadow: '0 2px 8px rgba(0,0,0,.08)',
          }}
          onMouseEnter={e => { (e.currentTarget as any).style.boxShadow = '0 4px 16px rgba(0,0,0,.15)'; (e.currentTarget as any).style.transform = 'translateY(-1px)'; }}
          onMouseLeave={e => { (e.currentTarget as any).style.boxShadow = '0 2px 8px rgba(0,0,0,.08)'; (e.currentTarget as any).style.transform = 'translateY(0)'; }}
        >
          <svg width="20" height="20" viewBox="0 0 48 48">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          </svg>
          Kirjaudu Googlella
        </button>

        {/* Footer */}
        <div style={{ marginTop: '3rem', fontSize: '.72rem', color: 'var(--t3)' }}>
          <span>Hetki Company Oy</span>
          <span style={{ margin: '0 .5rem' }}>{'\u00b7'}</span>
          <span>Tietosuoja</span>
          <span style={{ margin: '0 .5rem' }}>{'\u00b7'}</span>
          <span>Käyttöehdot</span>
        </div>
      </div>

      {/* ═══ RIGHT: Video background ═══ */}
      <div style={{
        flex: 1, position: 'relative', overflow: 'hidden',
        borderRadius: '24px 0 0 24px', marginLeft: '-24px',
      }}>
        {/* Video */}
        <video
          autoPlay muted loop playsInline
          onLoadedData={() => setVideoLoaded(true)}
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            objectFit: 'cover', opacity: videoLoaded ? 1 : 0, transition: 'opacity 1s',
          }}
        >
          <source src="/brand/hero-video.mp4" type="video/mp4" />
        </video>

        {/* Gradient overlay */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(135deg, rgba(5,107,159,.7) 0%, rgba(228,92,129,.4) 50%, rgba(241,180,52,.3) 100%)',
          mixBlendMode: 'multiply',
        }} />

        {/* Dark overlay for readability */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(180deg, rgba(10,12,16,.3) 0%, rgba(10,12,16,.1) 50%, rgba(10,12,16,.4) 100%)',
        }} />

        {/* Content on video */}
        <div style={{
          position: 'absolute', bottom: '3rem', left: '3rem', right: '3rem', zIndex: 1,
        }}>
          <blockquote style={{
            fontSize: '1.3rem', fontWeight: 600, color: '#fff', lineHeight: 1.5,
            fontStyle: 'italic', marginBottom: '1rem', maxWidth: 480,
          }}>
            "Momentum auttaa meitä pitämään viestinnän langat käsissä koko tiimin voimin."
          </blockquote>
          <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem' }}>
            <div style={{
              width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,.2)',
              backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontSize: '.75rem', fontWeight: 700,
            }}>AB</div>
            <div>
              <div style={{ fontSize: '.82rem', fontWeight: 600, color: '#fff' }}>Anton Baer</div>
              <div style={{ fontSize: '.7rem', color: 'rgba(255,255,255,.7)' }}>Viestintävastaava, Aivovammaliitto</div>
            </div>
          </div>
        </div>

        {/* Placeholder before video loads */}
        {!videoLoaded && (
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(135deg, var(--pri-d) 0%, var(--hetki-pink) 50%, var(--hetki-yellow) 100%)',
          }} />
        )}
      </div>
    </div>
  );
}
