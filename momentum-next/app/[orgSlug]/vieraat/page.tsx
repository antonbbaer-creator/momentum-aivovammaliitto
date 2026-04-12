'use client';

import { useState } from 'react';
import AppShell from '@/components/AppShell';
import { useOrgData } from '@/lib/firestore';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { useParams } from 'next/navigation';
import { useIsMobile } from '@/lib/use-mobile';

interface Guest {
  id: string;
  name: string;
  group: string;
  status: 'kutsuttu' | 'saapuu' | 'ei_paase' | 'odottaa' | 'epavarma';
  dietary?: string;
  note?: string;
  plusOne?: boolean;
  plusOneName?: string;
  headcount?: number;
  source?: string;
  companions?: string;
}

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  odottaa:   { label: 'Odottaa',    color: 'var(--yellow)', bg: 'rgba(245,197,66,.12)' },
  kutsuttu:  { label: 'Kutsuttu',   color: 'var(--pri-l)',  bg: 'rgba(5,107,159,.1)' },
  saapuu:    { label: 'Saapuu',     color: 'var(--green)',   bg: 'rgba(45,212,160,.1)' },
  epavarma:  { label: 'Epävarma',   color: '#f09a52',       bg: 'rgba(240,154,82,.1)' },
  ei_paase:  { label: 'Ei pääse',   color: 'var(--red)',     bg: 'rgba(239,68,68,.1)' },
};

const DEFAULT_GROUPS = ['FB-osallistujat', 'Seinakommentit', 'Lisävieraat', 'Kutsuttu', 'Perhe', 'Sukulaiset', 'Ystavat', 'Tyokaverit'];

// Default guest data from Sirpa 70v Excel
const JUHLATOIMIKUNTA_GUESTS: Guest[] = [
  // FB-LISTALTA OSALLISTUVAT
  { id: 'g_1', name: 'Juha Nurmela', group: 'FB-osallistujat', status: 'saapuu', headcount: 1, source: 'FB-lista' },
  { id: 'g_2', name: 'Tiina-Kaisa Monto', group: 'FB-osallistujat', status: 'saapuu', headcount: 1, source: 'FB-lista' },
  { id: 'g_3', name: 'Hilkka Vihavainen', group: 'FB-osallistujat', status: 'saapuu', headcount: 1, source: 'FB-lista', plusOne: true, plusOneName: 'Markku', note: 'Seinakommentti' },
  { id: 'g_4', name: 'Amos Brotherus', group: 'FB-osallistujat', status: 'saapuu', headcount: 1, source: 'FB-lista' },
  { id: 'g_5', name: 'Johanna Uha Helle', group: 'FB-osallistujat', status: 'saapuu', headcount: 1, source: 'FB-lista', note: '+ tytot (seinakommentti), Helsinki' },
  { id: 'g_6', name: 'Nadja Nord', group: 'FB-osallistujat', status: 'saapuu', headcount: 1, source: 'FB-lista' },
  { id: 'g_7', name: 'Dmitri Kantola', group: 'FB-osallistujat', status: 'saapuu', headcount: 1, source: 'FB-lista' },
  { id: 'g_8', name: 'Natalia Kantola', group: 'FB-osallistujat', status: 'saapuu', headcount: 1, source: 'FB-lista' },
  { id: 'g_9', name: 'Liisa Vihmanen', group: 'FB-osallistujat', status: 'saapuu', headcount: 1, source: 'FB-lista' },
  { id: 'g_10', name: 'Tiina Paavilainen', group: 'FB-osallistujat', status: 'saapuu', headcount: 1, source: 'FB-lista', plusOne: true, note: '"meita on kaksi" + tarjosi apua' },
  { id: 'g_11', name: 'Virve Rissanen', group: 'FB-osallistujat', status: 'saapuu', headcount: 1, source: 'FB-lista' },
  { id: 'g_12', name: 'Anna Suur-Kujala', group: 'FB-osallistujat', status: 'saapuu', headcount: 1, source: 'FB-lista', note: '"jollain kokoonpanolla"' },
  { id: 'g_13', name: 'Ville Hassi', group: 'FB-osallistujat', status: 'saapuu', headcount: 1, source: 'FB-lista' },
  { id: 'g_14', name: 'Kristiina Satola', group: 'FB-osallistujat', status: 'saapuu', headcount: 1, source: 'FB-lista' },
  { id: 'g_15', name: 'Niko Nurmela', group: 'FB-osallistujat', status: 'saapuu', headcount: 1, source: 'FB-lista', note: '+ Alesja + tytot (seinakommentti)' },
  { id: 'g_16', name: 'Rosa Jaaskelainen', group: 'FB-osallistujat', status: 'saapuu', headcount: 1, source: 'FB-lista', note: '+ Aino (kaksistaan)' },
  { id: 'g_17', name: 'Eeva-Liisa Lehto', group: 'FB-osallistujat', status: 'saapuu', headcount: 1, source: 'FB-lista', note: 'Eevis' },
  { id: 'g_18', name: 'Marja-Liisa Honkasalo', group: 'FB-osallistujat', status: 'saapuu', headcount: 1, source: 'FB-lista' },
  { id: 'g_19', name: 'Kasper Helle', group: 'FB-osallistujat', status: 'saapuu', headcount: 1, source: 'FB-lista' },
  { id: 'g_20', name: 'Joel Helle', group: 'FB-osallistujat', status: 'saapuu', headcount: 1, source: 'FB-lista' },
  { id: 'g_21', name: 'Jouko Kajanoja', group: 'FB-osallistujat', status: 'saapuu', headcount: 1, source: 'FB-lista' },
  { id: 'g_22', name: 'Anita Kaariainen', group: 'FB-osallistujat', status: 'saapuu', headcount: 1, source: 'FB-lista' },
  { id: 'g_23', name: 'Jonna Eero-Hovi', group: 'FB-osallistujat', status: 'saapuu', headcount: 1, source: 'FB-lista' },
  { id: 'g_24', name: 'Satu Hassi', group: 'FB-osallistujat', status: 'saapuu', headcount: 1, source: 'FB-lista' },
  { id: 'g_25', name: 'Aino Jaaskelainen', group: 'FB-osallistujat', status: 'saapuu', headcount: 1, source: 'FB-lista', note: 'Rosan seurue' },
  { id: 'g_26', name: 'Inka Bobble', group: 'FB-osallistujat', status: 'saapuu', headcount: 1, source: 'FB-lista' },
  { id: 'g_27', name: 'Niina Lappalainen', group: 'FB-osallistujat', status: 'saapuu', headcount: 1, source: 'FB-lista' },
  { id: 'g_28', name: 'Anna-Maija Kajanoja', group: 'FB-osallistujat', status: 'saapuu', headcount: 1, source: 'FB-lista', plusOne: true, note: '"me molemmat" — +1' },
  { id: 'g_29', name: 'Rognvaldur Karstein Kristinsson', group: 'FB-osallistujat', status: 'saapuu', headcount: 1, source: 'FB-lista' },

  // SEINAKOMMENTEISTA
  { id: 'g_30', name: 'Ira Maya Degerth', group: 'Seinakommentit', status: 'saapuu', headcount: 4, source: 'Seina', companions: 'Tomppa, Rasmus, Melina', note: '4 hlo yhteensa' },
  { id: 'g_31', name: 'Monica Nord', group: 'Seinakommentit', status: 'saapuu', headcount: 3, source: 'Seina', companions: 'N, P', note: 'Kolme: mina, N ja P' },
  { id: 'g_32', name: 'Maija Vihera', group: 'Seinakommentit', status: 'saapuu', headcount: 1, source: 'Seina', note: 'Tulen!' },

  // LISAVIERAAT (seurueen jasenina)
  { id: 'g_33', name: 'Markku', group: 'Lisävieraat', status: 'saapuu', headcount: 1, source: 'Seina', note: 'Hilkka Vihavaisen kanssa' },
  { id: 'g_34', name: 'Johanna U.H:n tytot', group: 'Lisävieraat', status: 'saapuu', source: 'Seina', note: '"Mina + tytot tulemme"' },
  { id: 'g_35', name: 'Tiina Paavilaisen +1', group: 'Lisävieraat', status: 'saapuu', headcount: 1, source: 'Seina', note: '"meita on kaksi tulossa"' },
  { id: 'g_36', name: 'Anna-Maija K:n +1', group: 'Lisävieraat', status: 'saapuu', headcount: 1, source: 'Seina', note: '"me molemmat"' },
  { id: 'g_37', name: 'Tomppa', group: 'Lisävieraat', status: 'saapuu', headcount: 1, source: 'Seina', note: 'Ira Maya Degerthin seurue' },
  { id: 'g_38', name: 'Rasmus', group: 'Lisävieraat', status: 'saapuu', headcount: 1, source: 'Seina', note: 'Ira Maya Degerthin seurue' },
  { id: 'g_39', name: 'Melina', group: 'Lisävieraat', status: 'saapuu', headcount: 1, source: 'Seina', note: 'Ira Maya Degerthin seurue' },
  { id: 'g_40', name: 'N (Monica Nordin seurue)', group: 'Lisävieraat', status: 'saapuu', headcount: 1, source: 'Seina', note: '"meita tulee kolme"' },
  { id: 'g_41', name: 'P (Monica Nordin seurue)', group: 'Lisävieraat', status: 'saapuu', headcount: 1, source: 'Seina', note: '"meita tulee kolme"' },
  { id: 'g_42', name: 'Alesja', group: 'Lisävieraat', status: 'saapuu', headcount: 1, source: 'Seina', note: 'Niko Nurmelan kanssa' },
  { id: 'g_43', name: 'Niko N:n tytot', group: 'Lisävieraat', status: 'saapuu', source: 'Seina', note: '"tyttojen kanssa"' },
  { id: 'g_44', name: 'Anitta', group: 'Lisävieraat', status: 'saapuu', headcount: 1, source: 'Seina', note: 'Sirpa Baerin mainitsema' },
  { id: 'g_45', name: 'Anssi', group: 'Lisävieraat', status: 'saapuu', headcount: 1, source: 'Seina', note: 'Sirpa Baerin mainitsema' },
  { id: 'g_46', name: 'Anna S-K:n seurue', group: 'Lisävieraat', status: 'saapuu', source: 'Seina', note: '"jollain kokoonpanolla"' },

  // EPAVARMA
  { id: 'g_47', name: 'Elisa Leinonen-Kristinsson', group: 'FB-osallistujat', status: 'epavarma', headcount: 1, source: 'FB' },

  // KUTSUTTU — ei vastausta
  { id: 'g_48', name: 'Salahudin Elmi', group: 'Kutsuttu', status: 'kutsuttu', source: 'FB' },
  { id: 'g_49', name: 'Mari Savo', group: 'Kutsuttu', status: 'kutsuttu', source: 'FB' },
  { id: 'g_50', name: 'Liisa Kirves', group: 'Kutsuttu', status: 'kutsuttu', source: 'FB' },
  { id: 'g_51', name: 'Henock Girmachew', group: 'Kutsuttu', status: 'kutsuttu', source: 'FB' },
  { id: 'g_52', name: 'Waleed Altalib', group: 'Kutsuttu', status: 'kutsuttu', source: 'FB' },
  { id: 'g_53', name: 'Alvar Pasanen', group: 'Kutsuttu', status: 'kutsuttu', source: 'FB' },
  { id: 'g_54', name: 'Silvia Sairanen', group: 'Kutsuttu', status: 'kutsuttu', source: 'FB' },
  { id: 'g_55', name: 'Leyla Enayati Modarresi', group: 'Kutsuttu', status: 'kutsuttu', source: 'FB' },
  { id: 'g_56', name: 'Anneli Salonen', group: 'Kutsuttu', status: 'kutsuttu', source: 'FB' },
  { id: 'g_57', name: 'Ulla Jokila', group: 'Kutsuttu', status: 'kutsuttu', source: 'FB' },

  // EI OSALLISTU
  { id: 'g_58', name: 'Tiina Kaarela', group: 'FB-osallistujat', status: 'ei_paase', headcount: 0, source: 'FB', note: '"emme ole Suomessa"' },
  { id: 'g_59', name: 'Hertta Julia Virtanen', group: 'FB-osallistujat', status: 'ei_paase', headcount: 0, source: 'FB' },
  { id: 'g_60', name: 'Nora Kowalski', group: 'FB-osallistujat', status: 'ei_paase', headcount: 0, source: 'FB' },
];

export default function VieraatPage() {
  const { canEdit } = useAuth();
  const { toast } = useToast();
  const params = useParams();
  const orgSlug = params.orgSlug as string;
  const isMobile = useIsMobile();

  const defaultGuests = orgSlug === 'juhlatoimikunta' ? JUHLATOIMIKUNTA_GUESTS : [];
  const [guests, setGuests] = useOrgData<Guest[]>('guests', defaultGuests);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [filterGroup, setFilterGroup] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');

  // Form state
  const [gName, setGName] = useState('');
  const [gGroup, setGGroup] = useState('FB-osallistujat');
  const [gStatus, setGStatus] = useState<Guest['status']>('odottaa');
  const [gDietary, setGDietary] = useState('');
  const [gNote, setGNote] = useState('');
  const [gPlusOne, setGPlusOne] = useState(false);
  const [gPlusOneName, setGPlusOneName] = useState('');
  const [gHeadcount, setGHeadcount] = useState(1);
  const [gSource, setGSource] = useState('');
  const [gCompanions, setGCompanions] = useState('');

  const groups = [...new Set([...DEFAULT_GROUPS, ...guests.map(g => g.group)])].filter(Boolean);

  const openNew = () => {
    setEditId(null); setGName(''); setGGroup('FB-osallistujat'); setGStatus('odottaa');
    setGDietary(''); setGNote(''); setGPlusOne(false); setGPlusOneName('');
    setGHeadcount(1); setGSource(''); setGCompanions('');
    setShowForm(true);
  };

  const openEdit = (g: Guest) => {
    setEditId(g.id); setGName(g.name); setGGroup(g.group); setGStatus(g.status);
    setGDietary(g.dietary || ''); setGNote(g.note || '');
    setGPlusOne(g.plusOne || false); setGPlusOneName(g.plusOneName || '');
    setGHeadcount(g.headcount ?? 1); setGSource(g.source || ''); setGCompanions(g.companions || '');
    setShowForm(true);
  };

  const save = () => {
    if (!gName.trim()) return;
    const guest: Guest = {
      id: editId || 'g_' + Date.now(),
      name: gName.trim(), group: gGroup, status: gStatus,
      dietary: gDietary.trim() || undefined,
      note: gNote.trim() || undefined,
      plusOne: gPlusOne || undefined,
      plusOneName: gPlusOne ? gPlusOneName.trim() || undefined : undefined,
      headcount: gHeadcount,
      source: gSource.trim() || undefined,
      companions: gCompanions.trim() || undefined,
    };
    if (editId) setGuests(prev => prev.map(x => x.id === editId ? guest : x));
    else setGuests(prev => [...prev, guest]);
    setShowForm(false);
    toast(editId ? 'Vieras päivitetty' : 'Vieras lisätty', 'success');
  };

  const remove = (id: string) => {
    setGuests(prev => prev.filter(x => x.id !== id));
    toast('Vieras poistettu', 'success');
  };

  const setStatus = (id: string, status: Guest['status']) => {
    setGuests(prev => prev.map(x => x.id === id ? { ...x, status } : x));
  };

  // Filtered guests
  const filtered = guests.filter(g => {
    if (filterGroup && g.group !== filterGroup) return false;
    if (filterStatus && g.status !== filterStatus) return false;
    if (searchTerm && !g.name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });

  // Stats
  const attending = guests.filter(g => g.status === 'saapuu');
  const totalHeadcount = attending.reduce((sum, g) => sum + (g.headcount ?? 1), 0);
  const plusOnes = attending.filter(g => g.plusOne).length;
  const waiting = guests.filter(g => g.status === 'odottaa' || g.status === 'kutsuttu').length;
  const uncertain = guests.filter(g => g.status === 'epavarma').length;

  return (
    <AppShell title="Vieraslista" subtitle={`${guests.length} vierasta · arvio ~${totalHeadcount + plusOnes} hloa`}>
      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '.75rem', marginBottom: '1.5rem' }}>
        {Object.entries(STATUS_LABELS).map(([key, s]) => {
          const count = guests.filter(g => g.status === key).length;
          return (
            <div key={key} onClick={() => setFilterStatus(filterStatus === key ? '' : key)} style={{
              background: filterStatus === key ? s.bg : 'var(--card)',
              border: `1px solid ${filterStatus === key ? s.color : 'var(--border)'}`,
              borderRadius: 'var(--r)', padding: '.85rem 1rem', cursor: 'pointer', textAlign: 'center',
            }}>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: s.color }}>{count}</div>
              <div style={{ fontSize: '.68rem', color: 'var(--t3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em' }}>{s.label}</div>
            </div>
          );
        })}
      </div>

      {/* Summary banner */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(45,212,160,.06), rgba(5,107,159,.04))',
        border: '1px solid rgba(45,212,160,.15)', borderRadius: 'var(--rl)',
        padding: '1rem 1.25rem', marginBottom: '1.25rem',
        display: 'flex', gap: '1.5rem', flexWrap: 'wrap',
      }}>
        <div>
          <div style={{ fontSize: '.6rem', color: 'var(--t3)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '.05em' }}>Arvioitu hlömäärä</div>
          <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--green)' }}>~{totalHeadcount + plusOnes}</div>
        </div>
        <div>
          <div style={{ fontSize: '.6rem', color: 'var(--t3)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '.05em' }}>Saapuu (varmistettu)</div>
          <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--t1)' }}>{attending.length}</div>
        </div>
        <div>
          <div style={{ fontSize: '.6rem', color: 'var(--t3)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '.05em' }}>Odottaa / kutsuttu</div>
          <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--pri-l)' }}>{waiting}</div>
        </div>
        <div>
          <div style={{ fontSize: '.6rem', color: 'var(--t3)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '.05em' }}>Epavarma</div>
          <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#f09a52' }}>{uncertain}</div>
        </div>
      </div>

      {/* Filters + search + add */}
      <div style={{ display: 'flex', gap: '.5rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          className="input"
          placeholder="Hae nimellä..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          style={{ width: 180, fontSize: '.78rem' }}
        />
        <select className="input" value={filterGroup} onChange={e => setFilterGroup(e.target.value)} style={{ width: 'auto', fontSize: '.78rem' }}>
          <option value="">Kaikki ryhmät</option>
          {groups.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
        {(filterGroup || filterStatus || searchTerm) && (
          <button className="btn btn-ghost btn-sm" onClick={() => { setFilterGroup(''); setFilterStatus(''); setSearchTerm(''); }}>Tyhjennä</button>
        )}
        <div style={{ flex: 1 }} />
        {canEdit && <button className="btn btn-primary btn-sm" onClick={openNew}>+ Lisää vieras</button>}
      </div>

      {/* Guest list by group */}
      {(() => {
        const grouped = groups.filter(g => filtered.some(x => x.group === g));
        if (filtered.length === 0) return (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--t3)' }}>
            <p style={{ fontSize: '.92rem', marginBottom: '.5rem' }}>Ei vieraita vielä.</p>
            <p style={{ fontSize: '.75rem' }}>Lisää ensimmäinen vieras ylhäältä.</p>
          </div>
        );
        return grouped.map(group => (
          <div key={group} style={{ marginBottom: '1.25rem' }}>
            <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '.5rem', padding: '0 .25rem' }}>
              {group} ({filtered.filter(g => g.group === group).length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.35rem' }}>
              {filtered.filter(g => g.group === group).map(g => {
                const s = STATUS_LABELS[g.status] || STATUS_LABELS.odottaa;
                return (
                  <div key={g.id} style={{
                    display: 'flex', alignItems: 'center', gap: '.75rem',
                    padding: '.7rem .85rem', background: 'var(--card)',
                    border: '1px solid var(--border)', borderRadius: 'var(--r)',
                    borderLeft: `3px solid ${s.color}`,
                  }}>
                    <div style={{
                      width: 34, height: 34, borderRadius: '50%',
                      background: s.bg, color: s.color,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '.85rem', fontWeight: 800, flexShrink: 0,
                    }}>{g.name[0]}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem' }}>
                        <span style={{ fontSize: '.88rem', fontWeight: 600 }}>{g.name}</span>
                        {g.headcount && g.headcount > 1 && (
                          <span style={{ fontSize: '.65rem', padding: '.1rem .35rem', borderRadius: 9999, background: 'var(--elev)', color: 'var(--t2)', fontWeight: 700 }}>{g.headcount} hloa</span>
                        )}
                        {g.plusOne && (
                          <span style={{ fontSize: '.65rem', padding: '.1rem .35rem', borderRadius: 9999, background: 'rgba(45,212,160,.1)', color: 'var(--green)', fontWeight: 700 }}>+1{g.plusOneName ? ` ${g.plusOneName}` : ''}</span>
                        )}
                      </div>
                      <div style={{ fontSize: '.68rem', color: 'var(--t3)', display: 'flex', gap: '.5rem', flexWrap: 'wrap', marginTop: '.1rem' }}>
                        {g.companions && <span>Seurue: {g.companions}</span>}
                        {g.source && <span>Lähde: {g.source}</span>}
                        {g.dietary && <span>Ruokavalio: {g.dietary}</span>}
                        {g.note && <span>{g.note}</span>}
                      </div>
                    </div>
                    {canEdit && (
                      <div style={{ display: 'flex', gap: '.25rem', alignItems: 'center' }}>
                        <select className="input" value={g.status} onChange={e => setStatus(g.id, e.target.value as Guest['status'])}
                          style={{ width: 'auto', fontSize: '.72rem', padding: '.25rem .4rem', background: s.bg, color: s.color, fontWeight: 700, border: `1px solid ${s.color}40` }}>
                          {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                        </select>
                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(g)} style={{ fontSize: '.65rem', padding: '.2rem .4rem' }}>Muokkaa</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ));
      })()}

      {/* Guest form modal — all fields editable */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowForm(false)}>
          <div style={{ background: 'var(--card)', border: isMobile ? 'none' : '1px solid var(--border)', borderRadius: isMobile ? 0 : 'var(--rl)', padding: isMobile ? '1.25rem' : '2rem', width: isMobile ? '100%' : 480, maxWidth: isMobile ? '100%' : '90vw', maxHeight: isMobile ? '100%' : '90vh', height: isMobile ? '100%' : 'auto', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', marginBottom: '1.25rem' }}>{editId ? 'Muokkaa vierasta' : 'Lisää vieras'}</h3>

            <div className="field"><label>Nimi *</label><input className="input" value={gName} onChange={e => setGName(e.target.value)} autoFocus /></div>

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '.75rem' }}>
              <div className="field">
                <label>Ryhmä</label>
                <select className="input" value={gGroup} onChange={e => setGGroup(e.target.value)}>
                  {groups.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Henkilömäärä</label>
                <input className="input" type="number" min={0} value={gHeadcount} onChange={e => setGHeadcount(parseInt(e.target.value) || 1)} />
              </div>
            </div>

            <div className="field">
              <label>Tila</label>
              <div style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap' }}>
                {Object.entries(STATUS_LABELS).map(([k, v]) => (
                  <button key={k} type="button" onClick={() => setGStatus(k as Guest['status'])} style={{
                    fontSize: '.72rem', padding: '.35rem .65rem', borderRadius: 9999,
                    background: gStatus === k ? v.bg : 'var(--elev)',
                    color: gStatus === k ? v.color : 'var(--t2)',
                    border: `1px solid ${gStatus === k ? v.color : 'var(--border)'}`,
                    fontWeight: 600, cursor: 'pointer',
                  }}>{v.label}</button>
                ))}
              </div>
            </div>

            <div className="field"><label>Seurue / kanssatulijat</label><input className="input" value={gCompanions} onChange={e => setGCompanions(e.target.value)} placeholder="Esim. Tomppa, Rasmus, Melina" /></div>

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '.75rem' }}>
              <div className="field"><label>Lähde</label><input className="input" value={gSource} onChange={e => setGSource(e.target.value)} placeholder="Esim. FB-lista, Seina" /></div>
              <div className="field"><label>Ruokavalio / allergiat</label><input className="input" value={gDietary} onChange={e => setGDietary(e.target.value)} placeholder="Esim. kasvis, gluteeniton" /></div>
            </div>

            <div className="field" style={{ display: 'flex', alignItems: 'center', gap: '.75rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '.5rem', cursor: 'pointer' }}>
                <input type="checkbox" checked={gPlusOne} onChange={e => setGPlusOne(e.target.checked)} style={{ width: 18, height: 18, accentColor: 'var(--pri)' }} />
                +1 (avecin kanssa)
              </label>
            </div>
            {gPlusOne && (
              <div className="field"><label>Avecin nimi</label><input className="input" value={gPlusOneName} onChange={e => setGPlusOneName(e.target.value)} /></div>
            )}

            <div className="field"><label>Muistiinpano</label><textarea className="input textarea" value={gNote} onChange={e => setGNote(e.target.value)} /></div>

            <div style={{ display: 'flex', gap: '.5rem', justifyContent: 'flex-end' }}>
              {editId && <button className="btn btn-ghost btn-sm" onClick={() => { remove(editId); setShowForm(false); }} style={{ color: 'var(--red)', marginRight: 'auto' }}>Poista</button>}
              <button className="btn btn-ghost" onClick={() => setShowForm(false)}>Peruuta</button>
              <button className="btn btn-primary" onClick={save} disabled={!gName.trim()}>Tallenna</button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
