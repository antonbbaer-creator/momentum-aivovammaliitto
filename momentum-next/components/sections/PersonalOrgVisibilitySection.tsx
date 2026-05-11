'use client';

import { useAuth } from '@/lib/auth';
import { useUserData } from '@/lib/use-user-data';

export default function PersonalOrgVisibilitySection() {
  const { orgs } = useAuth();
  const [hidden, setHidden] = useUserData<string[]>('hiddenOrgs', []);

  if (orgs.length === 0) return null;

  const toggle = (orgId: string) => {
    const isHidden = hidden.includes(orgId);
    if (isHidden) setHidden(hidden.filter(id => id !== orgId));
    else setHidden([...hidden, orgId]);
  };

  return (
    <section style={{ marginBottom: '1.5rem' }}>
      <h2 style={{
        fontFamily: 'var(--font-display)',
        fontSize: '1.1rem',
        fontWeight: 500,
        margin: '0 0 .35rem 0',
      }}>
        Näkyvät työtilat
      </h2>
      <p style={{ fontSize: '.82rem', color: 'var(--t2)', margin: '0 0 .9rem 0' }}>
        Kytke pois työtilat joita et aktiivisesti käytä. Pysyt jäsenenä, ne vain piiloutuvat työtilavalitsimesta.
      </p>

      <div style={{
        border: '1px solid var(--rule)',
        borderRadius: 'var(--rl)',
        background: 'var(--paper)',
        overflow: 'hidden',
      }}>
        {orgs.map((o, idx) => {
          const isHidden = hidden.includes(o.orgId);
          return (
            <label
              key={o.orgId}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '.75rem',
                padding: '.75rem 1rem',
                borderTop: idx === 0 ? 'none' : '1px solid var(--rule)',
                cursor: 'pointer',
                opacity: isHidden ? 0.55 : 1,
              }}
            >
              <input
                type="checkbox"
                checked={!isHidden}
                onChange={() => toggle(o.orgId)}
                style={{ width: 16, height: 16, cursor: 'pointer' }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '.92rem', fontWeight: 500 }}>{o.name || o.orgId}</div>
                <div style={{ fontSize: '.72rem', color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                  {o.role} · {o.orgId}
                </div>
              </div>
              {isHidden && (
                <span style={{ fontSize: '.7rem', color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                  Piilotettu
                </span>
              )}
            </label>
          );
        })}
      </div>
    </section>
  );
}
