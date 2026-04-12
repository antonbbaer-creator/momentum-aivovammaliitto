'use client';

import { useState } from 'react';
import AppShell from '@/components/AppShell';
import { useOrgData } from '@/lib/firestore';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { useParams } from 'next/navigation';
import { getOrgTeamMembers } from '@/lib/org-defaults';
import { OrgTeamMember } from '@/lib/team-shared';

interface MeetingNote {
  id: string;
  title: string;
  date: string; // ISO date
  attendees: string[];
  content: string;
  summary?: string; // AI-generated summary
  createdAt: number;
}

export default function MuistiinpanotPage() {
  const { canEdit } = useAuth();
  const { toast } = useToast();
  const params = useParams();
  const orgSlug = (params.orgSlug as string) || '';
  const [notes, setNotes] = useOrgData<MeetingNote[]>('meetingNotes', []);
  const [members] = useOrgData<OrgTeamMember[]>('orgTeamMembers', getOrgTeamMembers(orgSlug));
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [selectedNote, setSelectedNote] = useState<string | null>(null);
  const [summarizing, setSummarizing] = useState(false);

  // Form state
  const [nTitle, setNTitle] = useState('');
  const [nDate, setNDate] = useState(new Date().toISOString().split('T')[0]);
  const [nAttendees, setNAttendees] = useState<string[]>([]);
  const [nContent, setNContent] = useState('');

  const openNew = () => {
    setEditId(null);
    setNTitle('');
    setNDate(new Date().toISOString().split('T')[0]);
    setNAttendees([]);
    setNContent('');
    setShowForm(true);
  };

  const openEdit = (note: MeetingNote) => {
    setEditId(note.id);
    setNTitle(note.title);
    setNDate(note.date);
    setNAttendees(note.attendees);
    setNContent(note.content);
    setShowForm(true);
  };

  const save = () => {
    if (!nTitle.trim() || !nContent.trim()) return;
    const note: MeetingNote = {
      id: editId || 'mn_' + Date.now(),
      title: nTitle.trim(),
      date: nDate,
      attendees: nAttendees,
      content: nContent.trim(),
      summary: editId ? notes.find(n => n.id === editId)?.summary : undefined,
      createdAt: editId ? (notes.find(n => n.id === editId)?.createdAt ?? Date.now()) : Date.now(),
    };
    if (editId) setNotes(prev => prev.map(x => x.id === editId ? note : x));
    else setNotes(prev => [note, ...prev]);
    setShowForm(false);
    toast(editId ? 'Muistiinpano päivitetty' : 'Muistiinpano lisätty', 'success');
  };

  const remove = (id: string) => {
    setNotes(prev => prev.filter(x => x.id !== id));
    if (selectedNote === id) setSelectedNote(null);
    toast('Muistiinpano poistettu', 'success');
  };

  const toggleAttendee = (name: string) => {
    setNAttendees(prev =>
      prev.includes(name) ? prev.filter(a => a !== name) : [...prev, name]
    );
  };

  // AI summary request
  const requestSummary = async (noteId: string) => {
    const note = notes.find(n => n.id === noteId);
    if (!note) return;
    setSummarizing(true);
    try {
      // Use the chat AI endpoint to summarize
      const prompt = `Tee tiivis yhteenveto seuraavasta palaverimuistiinpanosta. Listaa pääkohdat ja mahdolliset toimenpiteet. Vastaa suomeksi.\n\nOtsikko: ${note.title}\nPäivämäärä: ${note.date}\nOsallistujat: ${note.attendees.join(', ') || 'Ei merkitty'}\n\nMuistiinpano:\n${note.content}`;

      // Try to use the AI chat endpoint
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt, orgSlug }),
      });

      if (response.ok) {
        const data = await response.json();
        const summary = data.reply || data.message || '';
        if (summary) {
          setNotes(prev => prev.map(n => n.id === noteId ? { ...n, summary } : n));
          toast('Yhteenveto luotu', 'success');
        }
      } else {
        // Fallback: simple bullet point extraction
        const lines = note.content.split('\n').filter(l => l.trim());
        const summary = `Palaveri: ${note.title} (${note.date})\nOsallistujat: ${note.attendees.join(', ') || '-'}\n\nPääkohdat:\n${lines.slice(0, 5).map(l => '- ' + l.trim()).join('\n')}`;
        setNotes(prev => prev.map(n => n.id === noteId ? { ...n, summary } : n));
        toast('Yhteenveto luotu (perusmuoto)', 'success');
      }
    } catch {
      toast('Yhteenvedon luonti epäonnistui', 'error');
    } finally {
      setSummarizing(false);
    }
  };

  // Sort newest first
  const sorted = [...notes].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Detail view
  const detail = selectedNote ? notes.find(n => n.id === selectedNote) : null;

  if (detail) {
    return (
      <AppShell title={detail.title} subtitle={formatDate(detail.date)}>
        <button className="btn btn-ghost" onClick={() => setSelectedNote(null)} style={{ marginBottom: '1rem' }}>{'<-'} Takaisin</button>

        {/* Attendees */}
        {detail.attendees.length > 0 && (
          <div style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
            <span style={{ fontSize: '.72rem', color: 'var(--t3)', fontWeight: 600 }}>Paikalla:</span>
            {detail.attendees.map(a => (
              <span key={a} style={{
                fontSize: '.72rem', padding: '.2rem .5rem', borderRadius: 9999,
                background: 'rgba(5,107,159,.1)', color: 'var(--pri-l)', fontWeight: 600,
              }}>{a}</span>
            ))}
          </div>
        )}

        {/* Content */}
        <div style={{
          background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)',
          padding: '1.5rem', marginBottom: '1.25rem', whiteSpace: 'pre-wrap',
          fontSize: '.88rem', lineHeight: 1.7, color: 'var(--t1)',
        }}>
          {detail.content}
        </div>

        {/* AI Summary */}
        {detail.summary && (
          <div style={{
            background: 'linear-gradient(135deg, rgba(155,124,246,.06), rgba(5,107,159,.04))',
            border: '1px solid rgba(155,124,246,.2)', borderRadius: 'var(--rl)',
            padding: '1.25rem', marginBottom: '1.25rem',
          }}>
            <div style={{ fontSize: '.68rem', fontWeight: 700, color: '#9b7cf6', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '.5rem' }}>
              AI-yhteenveto
            </div>
            <div style={{ fontSize: '.85rem', lineHeight: 1.7, color: 'var(--t1)', whiteSpace: 'pre-wrap' }}>
              {detail.summary}
            </div>
          </div>
        )}

        {canEdit && (
          <div style={{ display: 'flex', gap: '.5rem' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => openEdit(detail)}>Muokkaa</button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => requestSummary(detail.id)}
              disabled={summarizing}
              style={{ color: '#9b7cf6' }}
            >
              {summarizing ? 'Luodaan...' : detail.summary ? 'Päivitä yhteenveto' : 'Luo AI-yhteenveto'}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => remove(detail.id)} style={{ color: 'var(--red)', marginLeft: 'auto' }}>Poista</button>
          </div>
        )}
      </AppShell>
    );
  }

  // List view
  return (
    <AppShell title="Muistiinpanot" subtitle={`${notes.length} muistiinpanoa`}>
      {canEdit && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1.25rem' }}>
          <button className="btn btn-primary btn-sm" onClick={openNew}>+ Uusi muistiinpano</button>
        </div>
      )}

      {sorted.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--t3)' }}>
          <p style={{ fontSize: '.92rem', marginBottom: '.5rem' }}>Ei muistiinpanoja vielä.</p>
          <p style={{ fontSize: '.75rem' }}>Lisää ensimmäinen palaverimuistiinpano ylhäältä.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
          {sorted.map(note => (
            <div
              key={note.id}
              onClick={() => setSelectedNote(note.id)}
              style={{
                background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--r)',
                padding: '1rem 1.2rem', cursor: 'pointer',
                borderLeft: note.summary ? '3px solid #9b7cf6' : '3px solid var(--pri)',
                transition: 'border-color .15s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--pri)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.25rem' }}>
                <span style={{ fontSize: '.75rem', fontWeight: 700, color: 'var(--pri-l)' }}>{formatDate(note.date)}</span>
                {note.summary && (
                  <span style={{ fontSize: '.58rem', padding: '.1rem .35rem', borderRadius: 9999, background: 'rgba(155,124,246,.1)', color: '#9b7cf6', fontWeight: 700 }}>AI-yhteenveto</span>
                )}
              </div>
              <div style={{ fontSize: '.92rem', fontWeight: 700, marginBottom: '.2rem' }}>{note.title}</div>
              <div style={{ fontSize: '.72rem', color: 'var(--t3)', display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
                {note.attendees.length > 0 && (
                  <span>Paikalla: {note.attendees.slice(0, 3).join(', ')}{note.attendees.length > 3 ? ` +${note.attendees.length - 3}` : ''}</span>
                )}
                <span>{note.content.split('\n').length} rivi��</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Form modal */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowForm(false)}>
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '2rem', width: 560, maxWidth: '90vw', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', marginBottom: '1.25rem' }}>{editId ? 'Muokkaa muistiinpanoa' : 'Uusi muistiinpano'}</h3>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '.75rem' }}>
              <div className="field"><label>Otsikko *</label><input className="input" value={nTitle} onChange={e => setNTitle(e.target.value)} autoFocus placeholder="Esim. Juhlatoimikunnan palaveri" /></div>
              <div className="field"><label>Päivämäärä</label><input className="input" type="date" value={nDate} onChange={e => setNDate(e.target.value)} /></div>
            </div>

            <div className="field">
              <label>Paikalla</label>
              <div style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap' }}>
                {members.map(m => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => toggleAttendee(m.name)}
                    style={{
                      fontSize: '.72rem', padding: '.35rem .65rem', borderRadius: 9999,
                      background: nAttendees.includes(m.name) ? 'rgba(5,107,159,.15)' : 'var(--elev)',
                      color: nAttendees.includes(m.name) ? 'var(--pri-l)' : 'var(--t2)',
                      border: `1px solid ${nAttendees.includes(m.name) ? 'var(--pri)' : 'var(--border)'}`,
                      fontWeight: 600, cursor: 'pointer',
                    }}
                  >{m.name}</button>
                ))}
              </div>
            </div>

            <div className="field">
              <label>Muistiinpano *</label>
              <textarea
                className="input textarea"
                value={nContent}
                onChange={e => setNContent(e.target.value)}
                placeholder="Kirjoita palaverin muistiinpanot tähän..."
                rows={10}
                style={{ minHeight: 200, fontFamily: 'inherit', lineHeight: 1.6 }}
              />
            </div>

            <div style={{ display: 'flex', gap: '.5rem', justifyContent: 'flex-end' }}>
              {editId && <button className="btn btn-ghost btn-sm" onClick={() => { remove(editId); setShowForm(false); }} style={{ color: 'var(--red)', marginRight: 'auto' }}>Poista</button>}
              <button className="btn btn-ghost" onClick={() => setShowForm(false)}>Peruuta</button>
              <button className="btn btn-primary" onClick={save} disabled={!nTitle.trim() || !nContent.trim()}>Tallenna</button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const days = ['su', 'ma', 'ti', 'ke', 'to', 'pe', 'la'];
    return `${days[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;
  } catch {
    return dateStr;
  }
}
