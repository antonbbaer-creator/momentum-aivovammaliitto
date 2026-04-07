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

      {/* ═══ LEFT: Sidebar-style panel ═══ */}
      <div style={{
        width: 420, flexShrink: 0, display: 'flex', flexDirection: 'column',
        justifyContent: 'space-between',
        background: 'var(--pri-d) url(/textures/texture-blue.jpg) center/cover',
        backgroundBlendMode: 'overlay',
        padding: '2.5rem 2.5rem 2rem',
        position: 'relative', zIndex: 2,
      }}>
        {/* Top: Logo */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem', marginBottom: '2.5rem' }}>
            <img src="/brand/hetki-logo-white.png" alt="Hetki" style={{ height: 24 }} />
            <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', fontWeight: 500, letterSpacing: '.03em', textTransform: 'uppercase', color: '#fff' }}>Momentum</span>
          </div>

          {/* Headline */}
          <h1 style={{
            fontSize: '1.9rem', fontWeight: 800, lineHeight: 1.2, letterSpacing: '-.02em',
            color: '#fff', marginBottom: '1rem', maxWidth: 320,
          }}>
            Hallitse viestintääsi yhdestä paikasta
          </h1>
          <p style={{ color: 'rgba(255,255,255,.7)', fontSize: '.88rem', lineHeight: 1.7, marginBottom: '2rem', maxWidth: 320 }}>
            Strategiasta toteutukseen — suunnittele, seuraa ja raportoi organisaatiosi viestintää tiimisi kanssa.
          </p>

          {/* Features */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {[
              { icon: '\u25c8', title: 'Strategia ja tavoitteet', desc: 'Muuta strategia konkretiaksi' },
              { icon: '\u2630', title: 'Projektit ja kampanjat', desc: 'Kanban, tehtävät ja deadlinet' },
              { icon: '\u25a6', title: 'Vuosikello ja kalenteri', desc: 'Suunnittele viestintä kuukausitasolla' },
              { icon: '\u25c7', title: 'AI-sparrauskumppani', desc: 'Kontekstitietoinen viestinnän AI' },
            ].map(f => (
              <div key={f.title} style={{ display: 'flex', gap: '.75rem', alignItems: 'flex-start' }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 6, flexShrink: 0,
                  background: 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.15)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '.85rem', color: 'rgba(255,255,255,.8)',
                }}>{f.icon}</div>
                <div>
                  <div style={{ fontSize: '.82rem', fontWeight: 700, color: '#fff' }}>{f.title}</div>
                  <div style={{ fontSize: '.72rem', color: 'rgba(255,255,255,.5)' }}>{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom: Footer */}
        <div style={{ fontSize: '.68rem', color: 'rgba(255,255,255,.35)', marginTop: '2rem' }}>
          <span>Hetki Company Oy</span>
          <span style={{ margin: '0 .4rem' }}>{'\u00b7'}</span>
          <span>Tietosuoja</span>
          <span style={{ margin: '0 .4rem' }}>{'\u00b7'}</span>
          <span>Käyttöehdot</span>
        </div>
      </div>

      {/* ═══ RIGHT: Video + login ═══ */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>

        {/* Video background */}
        <video
          autoPlay muted loop playsInline
          onLoadedData={() => setVideoLoaded(true)}
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            objectFit: 'cover', opacity: videoLoaded ? 0.35 : 0, transition: 'opacity 1.5s',
          }}
        >
          <source src="/brand/hero-video.mp4" type="video/mp4" />
        </video>

        {/* Dark overlay */}
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(10,12,16,.75)' }} />

        {/* Login card */}
        <div style={{
          position: 'relative', zIndex: 1, textAlign: 'center',
          background: 'rgba(17,19,24,.85)', backdropFilter: 'blur(20px)',
          border: '1px solid var(--border)', borderRadius: 'var(--rxl)',
          padding: '3rem 3.5rem', maxWidth: 420, width: '100%',
          boxShadow: '0 24px 80px rgba(0,0,0,.4)',
        }}>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '.5rem' }}>Kirjaudu sisään</h2>
          <p style={{ color: 'var(--t3)', fontSize: '.85rem', marginBottom: '2rem' }}>Kirjaudu Google-tililläsi aloittaaksesi</p>

          <button
            onClick={loginWithGoogle}
            style={{
              background: '#fff', color: '#333', border: 'none',
              padding: '1rem 2rem', fontSize: '1rem', fontWeight: 600,
              borderRadius: '10px', cursor: 'pointer', display: 'inline-flex',
              alignItems: 'center', gap: '0.75rem', width: '100%', justifyContent: 'center',
              transition: 'all .2s', boxShadow: '0 2px 8px rgba(0,0,0,.1)',
            }}
            onMouseEnter={e => { (e.currentTarget as any).style.boxShadow = '0 6px 20px rgba(0,0,0,.2)'; (e.currentTarget as any).style.transform = 'translateY(-1px)'; }}
            onMouseLeave={e => { (e.currentTarget as any).style.boxShadow = '0 2px 8px rgba(0,0,0,.1)'; (e.currentTarget as any).style.transform = 'translateY(0)'; }}
          >
            <svg width="20" height="20" viewBox="0 0 48 48">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            </svg>
            Kirjaudu Googlella
          </button>

          <p style={{ marginTop: '1.5rem', fontSize: '.72rem', color: 'var(--t3)', lineHeight: 1.6 }}>
            Kirjautumalla hyväksyt Momentumin käyttöehdot ja tietosuojaselosteen.
          </p>
        </div>

        {/* Testimonial at bottom */}
        <div style={{ position: 'absolute', bottom: '2rem', left: '2.5rem', right: '2.5rem', zIndex: 1 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '.75rem',
            background: 'rgba(17,19,24,.7)', backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255,255,255,.08)', borderRadius: 'var(--rl)',
            padding: '1rem 1.25rem',
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: '50%', background: 'var(--pri)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontSize: '.7rem', fontWeight: 700, flexShrink: 0,
            }}>AB</div>
            <div>
              <div style={{ fontSize: '.78rem', color: 'rgba(255,255,255,.85)', fontStyle: 'italic' }}>
                "Momentum auttaa meitä pitämään viestinnän langat käsissä koko tiimin voimin."
              </div>
              <div style={{ fontSize: '.65rem', color: 'rgba(255,255,255,.4)', marginTop: '.2rem' }}>Anton Baer, Viestintävastaava — Aivovammaliitto</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
