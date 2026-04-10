'use client';

import { useState } from 'react';
import AppShell from '@/components/AppShell';
import { useOrgData } from '@/lib/firestore';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';

interface Film {
  id: string;
  title: string;
  director: string;
  directorBorn?: string;
  country: string;
  countryFlag?: string;
  year?: string;
  genre?: string;
  type?: string; // esikoinen, toisinkoinen
  festivals?: string;
  trailer?: string;
  screener?: string;
  screenerPw?: string;
  synopsis: string;
  status: 'consideration' | 'shortlist' | 'confirmed' | 'rejected';
  notes?: string;
  section: 'theme' | 'nordic';
  altFilm?: string; // "tai" vaihtoehto
}

const statusOptions = [
  { id: 'consideration', label: 'Harkinnassa', color: 'var(--yellow)', bg: 'rgba(241,180,52,.1)' },
  { id: 'shortlist', label: 'Lyhytlista', color: 'var(--pri-l)', bg: 'rgba(5,107,159,.1)' },
  { id: 'confirmed', label: 'Vahvistettu', color: 'var(--green)', bg: 'rgba(45,212,160,.1)' },
  { id: 'rejected', label: 'Hylätty', color: 'var(--red)', bg: 'rgba(239,107,107,.1)' },
];

const defaultThemeFilms: Film[] = [
  { id: 'tf1', title: 'Mogul Mowgli', director: '', country: 'GB', year: '2020', genre: '', type: '', festivals: 'charades library', synopsis: '', status: 'consideration', section: 'theme', altFilm: 'Memory (elke 2023 USA)' },
  { id: 'tf2', title: 'The Decline of Western Civilization', director: '', country: 'USA', year: '1981', genre: '', type: '', festivals: 'elke', synopsis: '', status: 'consideration', section: 'theme' },
  { id: 'tf3', title: 'A Place to Heal', director: '', country: 'FR', year: '2026', genre: '', type: '', festivals: 'charades', synopsis: '', status: 'consideration', section: 'theme' },
  { id: 'tf4', title: 'Palestine 36', director: '', country: 'MULTI', year: '2026', genre: '', type: '', festivals: 'Lucky Number', synopsis: '', status: 'consideration', section: 'theme', altFilm: 'Europa (1931 POL, alkukuva, Aatos Ketvel säestys)' },
  { id: 'tf5', title: 'Aelita Queen of Mars', director: '', country: 'RU', year: '1924', genre: '', type: '', festivals: '', synopsis: '', status: 'consideration', section: 'theme', altFilm: 'Cleaning Women säestys' },
  { id: 'tf6', title: 'River Dreams', director: '', country: 'KAZ', year: '2026', genre: '', type: '', festivals: 'Cinephil', synopsis: '', status: 'consideration', section: 'theme' },
  { id: 'tf7', title: 'Love Lies Bleeding', director: '', country: 'GM', year: '2024', genre: '', type: '', festivals: 'Scanbox', synopsis: '', status: 'consideration', section: 'theme' },
  { id: 'tf8', title: 'Rose of Nevada', director: '', country: 'GB', year: '2025', genre: '', type: '', festivals: 'Protagonist', synopsis: '', status: 'consideration', section: 'theme', altFilm: 'Holy Destructors (2025 LAT/LIE)' },
  { id: 'tf9', title: 'The Piano Accident', director: '', country: 'FR', year: '2025', genre: '', type: '', festivals: 'Lucky Number library', synopsis: '', status: 'consideration', section: 'theme', altFilm: 'After Yang (elke 2021 USA)' },
  { id: 'tf10', title: 'Shoplifters', director: '', country: 'JAP', year: '2018', genre: '', type: '', festivals: 'mondo', synopsis: '', status: 'consideration', section: 'theme', altFilm: 'Aftersun (manse 2022 USA)' },
];

const defaultNordicFilms: Film[] = [
  { id: 'nf1', title: 'Butterfly', director: 'Itonje Søimer Guttormsen', directorBorn: '1979', country: 'Norja', countryFlag: '\ud83c\uddf3\ud83c\uddf4', year: '2026', genre: 'Drama/Comedy', type: 'toisinkoinen', festivals: 'IFFR / Göteborg 2026', trailer: '', screener: '', synopsis: 'Two estranged sisters reunite in Gran Canaria after their parents\u2019 deaths, only to inherit an unfinished resort and esoteric retreat. Through the strange and the sincere, Guttormsen explores the stories we construct about ourselves and the ones we avoid.', status: 'consideration', section: 'nordic' },
  { id: 'nf2', title: 'The Ugly Stepsister', director: 'Emilie Blichfeldt', directorBorn: '1991', country: 'Norja', countryFlag: '\ud83c\uddf3\ud83c\uddf4', year: '2025', genre: 'Comedy Body Horror', type: 'esikoinen', festivals: 'Sundance 2025 (R&A 2025)', trailer: 'https://youtu.be/8zDgCKH83Nk', synopsis: 'Determined to outshine her beautiful stepsister, Elvira resorts to extreme measures to win the prince\u2019s heart in this dark re-imagining of the Cinderella fairy tale.', status: 'consideration', section: 'nordic' },
  { id: 'nf3', title: 'The Patron', director: 'Julia Thelin', directorBorn: '1991', country: 'Ruotsi', countryFlag: '\ud83c\uddf8\ud83c\uddea', year: '2026', genre: 'Drama', type: 'esikoinen', festivals: 'Göteborg 2026', trailer: 'https://youtu.be/7Jt-nKUdWGA', screener: 'https://vimeo.com/reviews/bf3075a1-b354-4e42-bb47-573c4313abad/videos/1087716149', screenerPw: 'Th3P4tr0n', synopsis: 'A cleaner dreams of a more exciting life. One evening, she claims to be an art patron and lures two art students to her employer\u2019s empty house. Intoxicated by her position of power, she allows herself to be drawn further into the fraud.', status: 'consideration', section: 'nordic' },
  { id: 'nf4', title: 'Birita', director: 'B\u00fai Dam', directorBorn: '', country: 'Färsaaret', countryFlag: '\ud83c\uddeb\ud83c\uddf4', year: '2026', genre: 'Documentary', type: 'esikoinen', festivals: 'CPH:DOX 2026', trailer: 'https://vimeo.com/1172175877/ef6328226c', screener: 'https://vimeo.com/1164762351', screenerPw: 'Copenhagen2026', synopsis: 'In the Faroe Islands, a family of theatre people are working on staging \u2018King Lear\u2019 with the mother in the lead role \u2013 a beloved actress who suffers from Alzheimer\u2019s.', status: 'consideration', section: 'nordic' },
  { id: 'nf5', title: 'If Luck Will Come', director: 'Camille Bild\u00f8e', directorBorn: '1994', country: 'Tanska', countryFlag: '\ud83c\udde9\ud83c\uddf0', year: '2026', genre: 'Documentary', type: 'toisinkoinen', festivals: 'CPH:DOX 2026', synopsis: '', status: 'consideration', section: 'nordic', altFilm: 'Christiania (Karl Friis Forchhammer, doc, toisinkoinen, CPH:DOX 2026)' },
  { id: 'nf6', title: 'The Squirrel (Orava)', director: 'Markus Lehmusruusu', directorBorn: '1983', country: 'Suomi', countryFlag: '\ud83c\uddeb\ud83c\uddee', year: '', genre: 'Scifi', type: 'toisinkoinen', festivals: '', synopsis: '', status: 'consideration', section: 'nordic' },
  { id: 'nf7', title: 'A Light That Never Goes Out', director: 'Lauri-Matti Parppei', directorBorn: '1985', country: 'Suomi', countryFlag: '\ud83c\uddeb\ud83c\uddee', year: '', genre: 'Drama', type: 'esikoinen', festivals: 'Saatavilla Ruutu+', synopsis: '', status: 'consideration', section: 'nordic', notes: 'Jossain on valo joka ei sammu' },
  { id: 'nf8', title: 'Almost Forever', director: 'Lia Hietala & Hannah Reinikainen', directorBorn: '', country: 'Ruotsi/Suomi', countryFlag: '\ud83c\uddf8\ud83c\uddea\ud83c\uddeb\ud83c\uddee', year: '2026', genre: 'Documentary', type: 'esikoinen', festivals: 'CPH:DOX 2026', synopsis: '', status: 'consideration', section: 'nordic' },
];

export default function FilmsPage() {
  const { canEdit } = useAuth();
  const { toast } = useToast();
  const [films, setFilms] = useOrgData<Film[]>('films', [...defaultThemeFilms, ...defaultNordicFilms]);
  const [tab, setTab] = useState<'theme' | 'nordic'>('theme');
  const [selectedFilm, setSelectedFilm] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [formTitle, setFormTitle] = useState('');
  const [formDirector, setFormDirector] = useState('');
  const [formCountry, setFormCountry] = useState('');
  const [formYear, setFormYear] = useState('');
  const [formGenre, setFormGenre] = useState('');
  const [formType, setFormType] = useState('');
  const [formFestivals, setFormFestivals] = useState('');
  const [formTrailer, setFormTrailer] = useState('');
  const [formSynopsis, setFormSynopsis] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formAlt, setFormAlt] = useState('');
  const [editId, setEditId] = useState<string | null>(null);

  const sectionFilms = films.filter(f => f.section === tab);
  const selected = selectedFilm ? films.find(f => f.id === selectedFilm) : null;

  const updateFilmStatus = (id: string, status: Film['status']) => {
    setFilms(prev => prev.map(f => f.id === id ? { ...f, status } : f));
    toast('Status päivitetty', 'success');
  };

  const openNew = () => {
    setEditId(null); setFormTitle(''); setFormDirector(''); setFormCountry(''); setFormYear('');
    setFormGenre(''); setFormType(''); setFormFestivals(''); setFormTrailer(''); setFormSynopsis('');
    setFormNotes(''); setFormAlt(''); setShowForm(true);
  };

  const openEdit = (f: Film) => {
    setEditId(f.id); setFormTitle(f.title); setFormDirector(f.director); setFormCountry(f.country);
    setFormYear(f.year || ''); setFormGenre(f.genre || ''); setFormType(f.type || '');
    setFormFestivals(f.festivals || ''); setFormTrailer(f.trailer || ''); setFormSynopsis(f.synopsis);
    setFormNotes(f.notes || ''); setFormAlt(f.altFilm || ''); setShowForm(true);
  };

  const saveFilm = () => {
    if (!formTitle.trim()) return;
    const film: Film = {
      id: editId || 'film_' + Date.now(), title: formTitle.trim(), director: formDirector.trim(),
      country: formCountry.trim(), year: formYear.trim(), genre: formGenre.trim(), type: formType.trim(),
      festivals: formFestivals.trim(), trailer: formTrailer.trim(), synopsis: formSynopsis.trim(),
      notes: formNotes.trim(), altFilm: formAlt.trim(), status: 'consideration', section: tab,
    };
    if (editId) { setFilms(prev => prev.map(f => f.id === editId ? { ...f, ...film, status: f.status } : f)); }
    else { setFilms(prev => [...prev, film]); }
    setShowForm(false);
    toast(editId ? 'Elokuva päivitetty' : 'Elokuva lisätty', 'success');
  };

  const removeFilm = (id: string) => {
    setFilms(prev => prev.filter(f => f.id !== id));
    if (selectedFilm === id) setSelectedFilm(null);
    toast('Elokuva poistettu', 'success');
  };

  // Detail view
  if (selected) {
    const st = statusOptions.find(s => s.id === selected.status);
    return (
      <AppShell title={selected.title} subtitle={selected.director || 'Elokuva'}>
        <button className="btn btn-ghost" onClick={() => setSelectedFilm(null)} style={{ marginBottom: '1rem' }}>{'\u2190'} Takaisin</button>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '1.5rem' }}>
          <div>
            {/* Main info */}
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '1.5rem', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                <div>
                  <h2 style={{ fontSize: '1.3rem', fontWeight: 800, marginBottom: '.25rem' }}>{selected.title}</h2>
                  {selected.director && <div style={{ fontSize: '.88rem', color: 'var(--t2)' }}>{selected.director}{selected.directorBorn ? ` (${selected.directorBorn})` : ''}</div>}
                </div>
                {canEdit && <button className="btn btn-ghost btn-sm" onClick={() => openEdit(selected)}>Muokkaa</button>}
              </div>
              <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                {selected.countryFlag && <span style={{ fontSize: '1.1rem' }}>{selected.countryFlag}</span>}
                <span style={{ fontSize: '.78rem', padding: '.2rem .55rem', borderRadius: 9999, background: 'var(--elev)', border: '1px solid var(--border)', fontWeight: 600 }}>{selected.country}</span>
                {selected.year && <span style={{ fontSize: '.78rem', padding: '.2rem .55rem', borderRadius: 9999, background: 'var(--elev)', border: '1px solid var(--border)' }}>{selected.year}</span>}
                {selected.genre && <span style={{ fontSize: '.78rem', padding: '.2rem .55rem', borderRadius: 9999, background: 'var(--elev)', border: '1px solid var(--border)' }}>{selected.genre}</span>}
                {selected.type && <span style={{ fontSize: '.78rem', padding: '.2rem .55rem', borderRadius: 9999, background: 'rgba(5,107,159,.1)', color: 'var(--pri-l)', fontWeight: 600 }}>{selected.type}</span>}
              </div>
              {selected.synopsis && <p style={{ fontSize: '.88rem', color: 'var(--t2)', lineHeight: 1.8 }}>{selected.synopsis}</p>}
            </div>

            {/* Alt film */}
            {selected.altFilm && (
              <div style={{ background: 'rgba(241,180,52,.04)', border: '1px solid rgba(241,180,52,.15)', borderRadius: 'var(--rl)', padding: '1rem 1.25rem', marginBottom: '1.25rem' }}>
                <div style={{ fontSize: '.72rem', fontWeight: 600, color: 'var(--yellow)', textTransform: 'uppercase', marginBottom: '.25rem' }}>Vaihtoehto</div>
                <div style={{ fontSize: '.88rem', color: 'var(--t2)' }}>{selected.altFilm}</div>
              </div>
            )}

            {/* Notes */}
            {selected.notes && (
              <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '1.25rem' }}>
                <h3 style={{ fontSize: '.78rem', fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', marginBottom: '.5rem' }}>Muistiinpanot</h3>
                <p style={{ fontSize: '.85rem', color: 'var(--t2)', lineHeight: 1.6 }}>{selected.notes}</p>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div>
            {/* Status */}
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '1.25rem', marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '.78rem', fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', marginBottom: '.75rem' }}>Status</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '.35rem' }}>
                {statusOptions.map(s => (
                  <button key={s.id} className={`btn btn-sm ${selected.status === s.id ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => canEdit && updateFilmStatus(selected.id, s.id as Film['status'])}
                    style={{ justifyContent: 'flex-start', background: selected.status === s.id ? s.bg : undefined, color: selected.status === s.id ? s.color : undefined, borderColor: selected.status === s.id ? s.color : undefined }}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Links */}
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '1.25rem', marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '.78rem', fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', marginBottom: '.75rem' }}>Linkit</h3>
              {selected.festivals && <div style={{ fontSize: '.82rem', color: 'var(--t2)', marginBottom: '.5rem' }}><strong>Festivaalit:</strong> {selected.festivals}</div>}
              {selected.trailer && <a href={selected.trailer} target="_blank" rel="noopener" className="btn btn-secondary btn-sm" style={{ width: '100%', marginBottom: '.35rem', textDecoration: 'none', justifyContent: 'center' }}>Traileri {'\u2197'}</a>}
              {selected.screener && <a href={selected.screener} target="_blank" rel="noopener" className="btn btn-secondary btn-sm" style={{ width: '100%', textDecoration: 'none', justifyContent: 'center' }}>Screener {'\u2197'}</a>}
              {selected.screenerPw && <div style={{ fontSize: '.72rem', color: 'var(--t3)', marginTop: '.35rem' }}>Salasana: <code style={{ background: 'var(--elev)', padding: '.1rem .3rem', borderRadius: 3 }}>{selected.screenerPw}</code></div>}
            </div>

            {canEdit && <button className="btn btn-sm" onClick={() => removeFilm(selected.id)} style={{ width: '100%', color: 'var(--red)', border: '1px solid rgba(239,107,107,.3)', background: 'rgba(239,107,107,.05)' }}>Poista elokuva</button>}
          </div>
        </div>
      </AppShell>
    );
  }

  // List view
  return (
    <AppShell title="Elokuvat" subtitle="Kuratointi 2026">
      {/* Tabs */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', background: 'var(--elev)', borderRadius: 'var(--r)', padding: '3px' }}>
          <button className={`cal-view-btn ${tab === 'theme' ? 'act' : ''}`} onClick={() => setTab('theme')}>Teemaohjelmisto ({films.filter(f => f.section === 'theme').length})</button>
          <button className={`cal-view-btn ${tab === 'nordic' ? 'act' : ''}`} onClick={() => setTab('nordic')}>Nordic Frames ({films.filter(f => f.section === 'nordic').length})</button>
        </div>
        {canEdit && <button className="btn btn-primary btn-sm" onClick={openNew}>+ Lisää elokuva</button>}
      </div>

      {/* Status summary */}
      <div style={{ display: 'flex', gap: '.5rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        {statusOptions.map(s => {
          const count = sectionFilms.filter(f => f.status === s.id).length;
          return count > 0 ? (
            <span key={s.id} style={{ fontSize: '.72rem', padding: '.25rem .65rem', borderRadius: 9999, background: s.bg, color: s.color, fontWeight: 600 }}>{s.label}: {count}</span>
          ) : null;
        })}
      </div>

      {/* Film list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '.6rem' }}>
        {sectionFilms.map((f, i) => {
          const st = statusOptions.find(s => s.id === f.status);
          return (
            <div key={f.id} onClick={() => setSelectedFilm(f.id)} style={{
              display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem 1.25rem',
              background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)',
              cursor: 'pointer', transition: 'border-color .15s',
            }} onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--pri)')} onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}>
              <div style={{ fontSize: '.82rem', fontWeight: 700, color: 'var(--t3)', minWidth: 24 }}>{i + 1}.</div>
              {f.countryFlag && <span style={{ fontSize: '1.2rem' }}>{f.countryFlag}</span>}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                  <span style={{ fontSize: '.95rem', fontWeight: 700, fontStyle: 'italic' }}>{f.title}</span>
                  {f.year && <span style={{ fontSize: '.68rem', color: 'var(--t3)' }}>({f.year})</span>}
                </div>
                <div style={{ fontSize: '.75rem', color: 'var(--t3)', marginTop: '.15rem' }}>
                  {f.director && <span>{f.director}</span>}
                  {f.country && <span> {'\u00b7'} {f.country}</span>}
                  {f.genre && <span> {'\u00b7'} {f.genre}</span>}
                  {f.type && <span> {'\u00b7'} <em>{f.type}</em></span>}
                </div>
                {f.altFilm && <div style={{ fontSize: '.68rem', color: 'var(--yellow)', marginTop: '.2rem' }}>tai: {f.altFilm}</div>}
              </div>
              {f.festivals && <span style={{ fontSize: '.65rem', color: 'var(--t3)', maxWidth: 120, textAlign: 'right' }}>{f.festivals}</span>}
              <span style={{ fontSize: '.65rem', padding: '.2rem .5rem', borderRadius: 9999, background: st?.bg, color: st?.color, fontWeight: 600, flexShrink: 0 }}>{st?.label}</span>
              <span style={{ color: 'var(--t3)' }}>{'\u203a'}</span>
            </div>
          );
        })}
        {sectionFilms.length === 0 && <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--t3)' }}>Ei elokuvia. Lisää ensimmäinen ylhäältä.</div>}
      </div>

      {/* Add/Edit modal */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowForm(false)}>
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '2rem', width: 560, maxWidth: '90vw', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', marginBottom: '1.25rem' }}>{editId ? 'Muokkaa elokuvaa' : 'Lisää elokuva'} ({tab === 'theme' ? 'Teemaohjelmisto' : 'Nordic Frames'})</h3>
            <div className="field"><label>Elokuvan nimi *</label><input className="input" value={formTitle} onChange={e => setFormTitle(e.target.value)} autoFocus /></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem' }}>
              <div className="field"><label>Ohjaaja</label><input className="input" value={formDirector} onChange={e => setFormDirector(e.target.value)} /></div>
              <div className="field"><label>Maa</label><input className="input" value={formCountry} onChange={e => setFormCountry(e.target.value)} /></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '.75rem' }}>
              <div className="field"><label>Vuosi</label><input className="input" value={formYear} onChange={e => setFormYear(e.target.value)} /></div>
              <div className="field"><label>Genre</label><input className="input" value={formGenre} onChange={e => setFormGenre(e.target.value)} /></div>
              <div className="field"><label>Tyyppi</label><input className="input" value={formType} onChange={e => setFormType(e.target.value)} placeholder="esikoinen / toisinkoinen" /></div>
            </div>
            <div className="field"><label>Festivaalit / lähde</label><input className="input" value={formFestivals} onChange={e => setFormFestivals(e.target.value)} /></div>
            <div className="field"><label>Traileri URL</label><input className="input" value={formTrailer} onChange={e => setFormTrailer(e.target.value)} /></div>
            <div className="field"><label>Synopsis</label><textarea className="input textarea" value={formSynopsis} onChange={e => setFormSynopsis(e.target.value)} /></div>
            <div className="field"><label>Vaihtoehto (tai)</label><input className="input" value={formAlt} onChange={e => setFormAlt(e.target.value)} placeholder="Vaihtoehtoinen elokuva" /></div>
            <div className="field"><label>Muistiinpanot</label><textarea className="input textarea" value={formNotes} onChange={e => setFormNotes(e.target.value)} style={{ minHeight: 60 }} /></div>
            <div style={{ display: 'flex', gap: '.5rem', justifyContent: 'flex-end' }}>
              {editId && <button className="btn btn-ghost btn-sm" onClick={() => { removeFilm(editId); setShowForm(false); }} style={{ color: 'var(--red)', marginRight: 'auto' }}>Poista</button>}
              <button className="btn btn-ghost" onClick={() => setShowForm(false)}>Peruuta</button>
              <button className="btn btn-primary" onClick={saveFilm} disabled={!formTitle.trim()}>Tallenna</button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
