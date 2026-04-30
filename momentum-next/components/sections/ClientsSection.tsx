'use client';

import { useMemo, useState } from 'react';
import { useOrgData } from '@/lib/firestore';
import { useToast } from '@/lib/toast';
import { useParams } from 'next/navigation';
import {
  Client, ClientStatus, CLIENT_STATUS_META, CLIENT_STATUS_ORDER,
  compareClients, makeClient, clientIdFromName,
} from '@/lib/clients-shared';
import type { Project } from '@/components/sections/ProjectsSection';
import { softDelete, filterActive } from '@/lib/trash';

type StatusFilter = 'all' | ClientStatus;

const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
  { id: 'all', label: 'Kaikki' },
  { id: 'prospect', label: 'Mahdolliset' },
  { id: 'offer', label: 'Tarjoukset' },
  { id: 'active', label: 'Aktiiviset' },
  { id: 'frozen', label: 'Jäissä' },
  { id: 'past', label: 'Päättyneet' },
];

export default function ClientsSection() {
  const orgSlug = (useParams().orgSlug as string) || '';
  const { toast } = useToast();
  const [clients, setClients] = useOrgData<Client[]>('clients', []);
  const [projects, setProjects] = useOrgData<Project[]>('projects', []);

  const [filter, setFilter] = useState<StatusFilter>('all');
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');

  const activeClients = useMemo(() => filterActive(clients), [clients]);

  // Yhdista projekteissa olevat clientName:t mutta jotka eivat ole viela
  // Client-listalla — naytetaan ne implisiittisina (auto-sync seuraavasta
  // luonnista, mutta nayta jo nyt jotta lista ei ole aina puutteellinen)
  const enriched: Client[] = useMemo(() => {
    const byId = new Map<string, Client>();
    for (const c of activeClients) byId.set(c.id, c);
    const known = new Set(activeClients.map(c => c.name.trim().toLowerCase()));
    for (const p of projects) {
      const name = (p.clientName || '').trim();
      if (!name) continue;
      if (known.has(name.toLowerCase())) continue;
      const ghost = makeClient(name);
      if (!byId.has(ghost.id)) byId.set(ghost.id, ghost);
    }
    return Array.from(byId.values()).sort(compareClients);
  }, [activeClients, projects]);

  const visible = useMemo(() => {
    if (filter === 'all') return enriched;
    return enriched.filter(c => c.status === filter);
  }, [enriched, filter]);

  const projectsByClient = useMemo(() => {
    const map = new Map<string, Project[]>();
    for (const p of projects) {
      const name = (p.clientName || '').trim();
      if (!name) continue;
      const id = clientIdFromName(name);
      const arr = map.get(id) || [];
      arr.push(p);
      map.set(id, arr);
    }
    return map;
  }, [projects]);

  const counts = useMemo<Record<StatusFilter, number>>(() => ({
    all: enriched.length,
    prospect: enriched.filter(c => c.status === 'prospect').length,
    offer: enriched.filter(c => c.status === 'offer').length,
    active: enriched.filter(c => c.status === 'active').length,
    frozen: enriched.filter(c => c.status === 'frozen').length,
    past: enriched.filter(c => c.status === 'past').length,
  }), [enriched]);

  const upsertClient = (client: Client) => {
    setClients(prev => {
      const exists = prev.some(c => c.id === client.id);
      if (exists) return prev.map(c => c.id === client.id ? client : c);
      return [...prev, client];
    });
  };

  const addClient = () => {
    const name = newName.trim();
    if (!name) return;
    if (enriched.some(c => c.name.trim().toLowerCase() === name.toLowerCase())) {
      toast('Samanniminen asiakas on jo listalla', 'error');
      return;
    }
    upsertClient(makeClient(name));
    setNewName('');
    setAdding(false);
    toast('Asiakas lisätty', 'success');
  };

  const setStatus = (client: Client, status: ClientStatus) => {
    const stored = activeClients.find(c => c.id === client.id);
    const next: Client = {
      ...(stored || client),
      status,
      endedAt: status === 'past' ? (stored?.endedAt || new Date().toISOString().slice(0, 10)) : undefined,
    };
    upsertClient(next);
  };

  const deleteClient = (client: Client) => {
    if (!activeClients.some(c => c.id === client.id)) return;
    setClients(prev => softDelete(prev, client.id));
    toast('Asiakas siirretty roskakoriin', 'success');
  };

  const updateField = (id: string, patch: Partial<Client>) => {
    setClients(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c));
  };

  // Uudelleennimea asiakas: paivita Client.name ja .id seka kaikki projektit
  // joilla oli vanha clientName. Estaa nimitormaykset.
  const renameClient = (current: Client, nextName: string): boolean => {
    const trimmed = nextName.trim();
    if (!trimmed) {
      toast('Nimi ei voi olla tyhjä', 'error');
      return false;
    }
    if (trimmed === current.name.trim()) return true; // ei muutosta
    const lower = trimmed.toLowerCase();
    if (clients.some(c => c.id !== current.id && c.name.trim().toLowerCase() === lower)) {
      toast('Samanniminen asiakas on jo olemassa', 'error');
      return false;
    }
    const newId = clientIdFromName(trimmed);
    if (newId !== current.id && clients.some(c => c.id === newId)) {
      toast('Vastaava asiakas on jo listalla', 'error');
      return false;
    }

    const oldNameLower = current.name.trim().toLowerCase();
    setClients(prev => prev.map(c => c.id === current.id ? { ...c, id: newId, name: trimmed } : c));
    setProjects(prev => prev.map(p => {
      const pn = (p.clientName || '').trim();
      if (pn && pn.toLowerCase() === oldNameLower) return { ...p, clientName: trimmed };
      return p;
    }));
    if (editingId === current.id) setEditingId(newId);
    toast('Asiakkaan nimi päivitetty', 'success');
    return true;
  };

  if (orgSlug !== 'hetki-company') {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--t3)' }}>
        Asiakkuudet-moduuli on käytössä vain Hetki Company -työtilassa.
      </div>
    );
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '.5rem' }}>
        <button className="btn btn-primary" onClick={() => setAdding(v => !v)}>
          {adding ? 'Sulje' : '+ Uusi asiakas'}
        </button>
      </div>

      {adding && (
        <div style={{
          background: 'var(--card)', border: '1px solid var(--border)',
          borderRadius: 'var(--rl)', padding: '1.25rem', marginBottom: '1rem',
          display: 'flex', gap: '.75rem', alignItems: 'flex-end', flexWrap: 'wrap',
        }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <label style={{ fontSize: '.7rem', fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Asiakkaan nimi</label>
            <input
              className="input"
              value={newName}
              autoFocus
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addClient(); }}
              placeholder="Esim. Esimerkki Oy"
              style={{ marginTop: '.25rem' }}
            />
          </div>
          <button className="btn btn-primary" onClick={addClient} disabled={!newName.trim()}>Lisää</button>
        </div>
      )}

      {/* Suodatinpainikkeet */}
      <div style={{ display: 'flex', gap: '.4rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        {STATUS_FILTERS.map(f => {
          const isActive = filter === f.id;
          const count = counts[f.id];
          const meta = f.id !== 'all' ? CLIENT_STATUS_META[f.id] : null;
          return (
            <button key={f.id} onClick={() => setFilter(f.id)} style={{
              fontSize: '.74rem', padding: '.45rem .8rem', borderRadius: 9999,
              background: isActive ? (meta?.color || 'var(--t1)') : 'var(--elev)',
              color: isActive ? '#fff' : 'var(--t2)',
              border: `1px solid ${isActive ? (meta?.color || 'var(--t1)') : 'var(--border)'}`,
              fontWeight: 600, cursor: 'pointer',
            }}>{f.label} ({count})</button>
          );
        })}
      </div>

      {visible.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--t3)', fontSize: '.85rem' }}>
          {enriched.length === 0
            ? 'Ei vielä asiakkaita. Luo asiakas tai lisää se projektin asiakas-kentässä.'
            : 'Ei tähän suodattimeen sopivia asiakkaita.'}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
          {visible.map(c => {
            const stored = activeClients.find(x => x.id === c.id);
            const isGhost = !stored;
            const meta = CLIENT_STATUS_META[c.status];
            const projs = projectsByClient.get(c.id) || [];
            const activeProjs = projs.filter(p => !p.archived && p.st !== 'done');
            const isEditing = editingId === c.id;
            return (
              <div key={c.id} style={{
                background: 'var(--card)', border: '1px solid var(--border)',
                borderLeft: `4px solid ${meta.color}`,
                borderRadius: 'var(--rl)', padding: '1.1rem 1.2rem',
                display: 'flex', flexDirection: 'column', gap: '.65rem',
              }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.5rem' }}>
                    <div style={{
                      fontSize: '.95rem', fontWeight: 700, flex: 1, minWidth: 0,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }} title={c.name}>{c.name}</div>
                    <select
                      value={c.status}
                      onChange={e => setStatus(c, e.target.value as ClientStatus)}
                      className="input"
                      style={{ fontSize: '.7rem', padding: '.25rem .35rem', width: 'auto', flexShrink: 0, maxWidth: 130, background: 'var(--elev)' }}
                      title="Vaihda tila"
                    >
                      {CLIENT_STATUS_ORDER.map(s => (
                        <option key={s} value={s}>{CLIENT_STATUS_META[s].label}</option>
                      ))}
                    </select>
                  </div>
                  <span style={{
                    fontSize: '.6rem', padding: '.18rem .5rem', borderRadius: 9999,
                    background: meta.bg, color: meta.color, fontWeight: 700,
                    textTransform: 'uppercase', letterSpacing: '.05em',
                    alignSelf: 'flex-start',
                  }}>{meta.label}{isGhost ? ' · ei tallennettu' : ''}</span>
                </div>

                <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{
                    fontSize: '.66rem', padding: '.18rem .5rem', borderRadius: 9999,
                    background: activeProjs.length > 0 ? 'rgba(42,138,134,.12)' : 'var(--elev)',
                    color: activeProjs.length > 0 ? '#2a8a86' : 'var(--t3)',
                    fontWeight: 600,
                  }}>
                    {activeProjs.length} aktiivista projektia
                  </span>
                  {projs.length > activeProjs.length && (
                    <span style={{ fontSize: '.66rem', color: 'var(--t3)' }}>
                      · {projs.length - activeProjs.length} valmis/arkistoitu
                    </span>
                  )}
                  {(c.status === 'prospect' || c.status === 'offer') && c.estimatedValue && c.estimatedValue > 0 && (
                    <span style={{
                      fontSize: '.66rem', padding: '.18rem .5rem', borderRadius: 9999,
                      background: meta.bg, color: meta.color, fontWeight: 700,
                    }}>
                      Arvio {new Intl.NumberFormat('fi-FI', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(c.estimatedValue)}
                    </span>
                  )}
                </div>

                {projs.length > 0 && (
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '.2rem' }}>
                    {projs.slice(0, 4).map(p => (
                      <li key={p.id} style={{
                        fontSize: '.74rem', color: 'var(--t2)',
                        display: 'flex', alignItems: 'center', gap: '.4rem',
                      }}>
                        <span style={{
                          width: 6, height: 6, borderRadius: '50%',
                          background: p.archived ? 'var(--t3)' : p.st === 'done' ? 'var(--green)' : p.st === 'active' ? 'var(--pri)' : 'var(--yellow)',
                        }} />
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.t}</span>
                      </li>
                    ))}
                    {projs.length > 4 && (
                      <li style={{ fontSize: '.7rem', color: 'var(--t3)', paddingLeft: '.85rem' }}>+{projs.length - 4} muuta</li>
                    )}
                  </ul>
                )}

                {!isEditing ? (
                  <div style={{ display: 'flex', gap: '.5rem', marginTop: '.25rem', flexWrap: 'wrap' }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => {
                      // Jos ghost (ei viela tallennettu), kirjoita ensin
                      if (isGhost) upsertClient(c);
                      setDraftName(c.name);
                      setEditingId(c.id);
                    }} style={{ fontSize: '.72rem' }}>Muokkaa</button>
                    {!isGhost && (
                      <button className="btn btn-ghost btn-sm" onClick={() => deleteClient(c)} style={{ fontSize: '.72rem', color: 'var(--red)' }}>Poista</button>
                    )}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem', marginTop: '.25rem' }}>
                    <div>
                      <label style={{ fontSize: '.66rem', fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Nimi</label>
                      <input
                        className="input"
                        value={draftName}
                        onChange={e => setDraftName(e.target.value)}
                        onBlur={() => { if (draftName.trim() && draftName.trim() !== c.name.trim()) renameClient(c, draftName); }}
                        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                        placeholder="Asiakkaan nimi"
                        style={{ marginTop: '.2rem', fontSize: '.85rem', fontWeight: 600 }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '.66rem', fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Yhteyshenkilö</label>
                      <input
                        className="input"
                        value={c.contactName || ''}
                        onChange={e => updateField(c.id, { contactName: e.target.value || undefined })}
                        placeholder="Nimi"
                        style={{ marginTop: '.2rem', fontSize: '.8rem' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '.66rem', fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Sähköposti</label>
                      <input
                        className="input"
                        type="email"
                        value={c.contactEmail || ''}
                        onChange={e => updateField(c.id, { contactEmail: e.target.value || undefined })}
                        placeholder="esim@asiakas.fi"
                        style={{ marginTop: '.2rem', fontSize: '.8rem' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '.66rem', fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Puhelin</label>
                      <input
                        className="input"
                        value={c.contactPhone || ''}
                        onChange={e => updateField(c.id, { contactPhone: e.target.value || undefined })}
                        style={{ marginTop: '.2rem', fontSize: '.8rem' }}
                      />
                    </div>
                    {(c.status === 'prospect' || c.status === 'offer') && (
                      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '.4rem' }}>
                        <div>
                          <label style={{ fontSize: '.66rem', fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                            {c.status === 'offer' ? 'Tarjouksen arvio (€, netto)' : 'Mahdollisuuden arvio (€, netto)'}
                          </label>
                          <input
                            className="input"
                            type="number"
                            value={c.estimatedValue ?? ''}
                            onChange={e => {
                              const v = e.target.value;
                              const n = v === '' ? undefined : parseFloat(v);
                              updateField(c.id, { estimatedValue: isFinite(n as number) ? n : undefined });
                            }}
                            placeholder="0"
                            style={{ marginTop: '.2rem', fontSize: '.8rem' }}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: '.66rem', fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>ALV-%</label>
                          <input
                            className="input"
                            type="number"
                            value={c.estimatedVatRate ?? ''}
                            onChange={e => {
                              const v = e.target.value;
                              const n = v === '' ? undefined : parseFloat(v);
                              updateField(c.id, { estimatedVatRate: isFinite(n as number) ? n : undefined });
                            }}
                            placeholder="25,5"
                            style={{ marginTop: '.2rem', fontSize: '.8rem' }}
                          />
                        </div>
                      </div>
                    )}
                    <div>
                      <label style={{ fontSize: '.66rem', fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Muistiinpanot</label>
                      <textarea
                        className="input textarea"
                        value={c.notes || ''}
                        onChange={e => updateField(c.id, { notes: e.target.value || undefined })}
                        style={{ marginTop: '.2rem', fontSize: '.8rem', minHeight: 60 }}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: '.4rem' }}>
                      <button className="btn btn-primary btn-sm" onClick={() => setEditingId(null)} style={{ fontSize: '.72rem' }}>Valmis</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
