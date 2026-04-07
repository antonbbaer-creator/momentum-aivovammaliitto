'use client';

import AppShell from '@/components/AppShell';
import { useOrgData } from '@/lib/firestore';
import { useAuth } from '@/lib/auth';

export default function DashboardPage() {
  const { orgs, activeOrg } = useAuth();
  const [org] = useOrgData('org', { name: '', slogan: '', goals: [], channels: [], team: [] });
  const [projects] = useOrgData<any[]>('projects', []);
  const [events] = useOrgData<any[]>('events', []);
  const [publications] = useOrgData<any[]>('publications', []);

  const currentOrg = orgs.find(o => o.orgId === activeOrg);
  const activeProjects = projects.filter((p: any) => p.st === 'active' && !p.archived);

  return (
    <AppShell title="Koti" subtitle={org.name || currentOrg?.name || 'Hetki'}>
      {/* Stats */}
      <div className="stats">
        <div className="stat">
          <div className="stat-num">{projects.length}</div>
          <div className="stat-lbl">Projektit</div>
        </div>
        <div className="stat">
          <div className="stat-num">{events.length}</div>
          <div className="stat-lbl">Tapahtumat</div>
        </div>
        <div className="stat">
          <div className="stat-num">{publications.length}</div>
          <div className="stat-lbl">Julkaisut</div>
        </div>
        <div className="stat">
          <div className="stat-num">{(org.channels || []).length}</div>
          <div className="stat-lbl">Kanavat</div>
        </div>
      </div>

      {/* Active projects */}
      <div className="dash">
        <div className="dc dash-w">
          <div className="dc-h">
            <h3>Aktiiviset projektit</h3>
            <span style={{ fontSize: '.75rem', color: 'var(--t3)' }}>
              {activeProjects.length} työstössä
            </span>
          </div>
          <div className="dc-b">
            {activeProjects.length === 0 ? (
              <p style={{ color: 'var(--t3)', fontSize: '.85rem', textAlign: 'center', padding: '2rem' }}>
                Ei aktiivisia projekteja. Luo ensimmäinen Projektit-sivulta.
              </p>
            ) : (
              activeProjects.slice(0, 5).map((p: any) => (
                <div key={p.id} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '.6rem 0', borderBottom: '1px solid var(--border)'
                }}>
                  <div>
                    <div style={{ fontSize: '.85rem', fontWeight: 600 }}>{p.t}</div>
                    <div style={{ fontSize: '.72rem', color: 'var(--t3)' }}>
                      {p.deadline || 'Ei deadlinea'}
                    </div>
                  </div>
                  {p.tasks?.length > 0 && (
                    <div style={{ fontSize: '.72rem', color: 'var(--t2)' }}>
                      {p.tasks.filter((t: any) => t.done).length}/{p.tasks.length} tehtävää
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="dc">
          <div className="dc-h">
            <h3>Tiimi</h3>
          </div>
          <div className="dc-b">
            {(org.team || []).length === 0 ? (
              <p style={{ color: 'var(--t3)', fontSize: '.85rem', textAlign: 'center', padding: '1rem' }}>
                Ei tiimijäseniä
              </p>
            ) : (
              (org.team || []).slice(0, 5).map((m: any, i: number) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: '.6rem',
                  padding: '.5rem 0', borderBottom: '1px solid var(--border)'
                }}>
                  <div className="ava" style={{ width: 28, height: 28, fontSize: '.6rem' }}>
                    {m.name?.[0] || '?'}
                  </div>
                  <div>
                    <div style={{ fontSize: '.82rem', fontWeight: 600 }}>{m.name}</div>
                    <div style={{ fontSize: '.65rem', color: 'var(--t3)' }}>{m.role}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
