'use client';

import { useState, useEffect } from 'react';
import AppShell from '@/components/AppShell';
import { useOrgData } from '@/lib/firestore';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';

const WORKER_URL = 'https://momentum-worker.anton-4f9.workers.dev';

interface TeamMessage {
  id: string;
  from: string;
  to?: string; // if set, it's a request to specific person
  text: string;
  type: 'chat' | 'request' | 'ai-greeting';
  timestamp: string;
  done?: boolean;
}

interface TeamMember {
  id: string;
  name: string;
  role: string;
  type: 'permanent' | 'project' | 'external';
  avatar: string;
  email?: string;
  phone?: string;
  responsibilities: string[];
  channels: string[];
  currentTasks: string[];
  projects: string[];
  note?: string;
}

const memberTypes = [
  { id: 'permanent', label: 'Vakituinen', color: 'var(--pri)', bg: 'rgba(5,107,159,.1)' },
  { id: 'project', label: 'Projektikohtainen', color: 'var(--yellow)', bg: 'rgba(241,180,52,.1)' },
  { id: 'external', label: 'Ulkoinen / freelancer', color: 'var(--green)', bg: 'rgba(45,212,160,.1)' },
];

export default function TeamPage() {
  const { user, canEdit, activeOrg } = useAuth();
  const { toast } = useToast();
  const [org] = useOrgData<any>('org', { channels: [] });
  const [teamData, setTeamData] = useOrgData<TeamMember[]>('teamMembers', []);
  const [projects, setProjects] = useOrgData<any[]>('projects', []);
  const [messages, setMessages] = useOrgData<TeamMessage[]>('teamMessages', []);

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [selectedMember, setSelectedMember] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');

  // Chat state
  const [chatText, setChatText] = useState('');
  const [requestTo, setRequestTo] = useState('');
  const [requestText, setRequestText] = useState('');
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [aiGreeting, setAiGreeting] = useState('');
  const [greetingLoading, setGreetingLoading] = useState(false);

  // Generate AI morning greeting
  useEffect(() => {
    const todayKey = new Date().toISOString().slice(0, 10);
    const lastGreeting = messages.find(m => m.type === 'ai-greeting' && m.timestamp.startsWith(todayKey));
    if (lastGreeting) { setAiGreeting(lastGreeting.text); return; }
    if (greetingLoading || !org.name || messages.length < 0) return;

    setGreetingLoading(true);
    const names = teamData.map(m => m.name).join(', ');
    fetch(WORKER_URL + '/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Momentum-Org': activeOrg || '' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Kirjoita lyhyt, lämmin ja inspiroiva aamutervehdys viestintätiimille. Pilkettä silmäkulmassa. Max 2 lausetta. Tiimi: ' + names + '. Päivämäärä: ' + new Date().toLocaleDateString('fi-FI', { weekday: 'long', day: 'numeric', month: 'long' }) }],
        systemContext: 'Olet innostava tiimikaveri. Vastaa vain tervehdys, ei mitään muuta. Suomeksi. Pilkettä silmäkulmassa mutta ammattimainen.',
      }),
    }).then(r => r.json()).then(d => {
      const greeting = d.response || '';
      if (greeting) {
        setAiGreeting(greeting);
        setMessages(prev => [...prev, { id: 'ai_' + Date.now(), from: 'Momentum', text: greeting, type: 'ai-greeting', timestamp: new Date().toISOString() }]);
      }
    }).catch((e) => console.warn('AI greeting failed:', e)).finally(() => setGreetingLoading(false));
  }, [org.name, teamData.length]);

  // Send chat message
  const sendChat = () => {
    if (!chatText.trim()) return;
    setMessages(prev => [...prev, { id: 'msg_' + Date.now(), from: user?.displayName || 'Käyttäjä', text: chatText.trim(), type: 'chat', timestamp: new Date().toISOString() }]);
    setChatText('');
  };

  // Send request to team member
  const sendRequest = () => {
    if (!requestText.trim() || !requestTo) return;
    // Add as message
    setMessages(prev => [...prev, {
      id: 'req_' + Date.now(), from: user?.displayName || 'Käyttäjä', to: requestTo,
      text: requestText.trim(), type: 'request', timestamp: new Date().toISOString(), done: false,
    }]);
    toast('Pyyntö lähetetty: ' + requestTo, 'success');
    setRequestText(''); setRequestTo(''); setShowRequestForm(false);
  };

  const markRequestDone = (msgId: string) => {
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, done: true } : m));
  };

  // Form state
  const [formName, setFormName] = useState('');
  const [formRole, setFormRole] = useState('');
  const [formType, setFormType] = useState<'permanent' | 'project' | 'external'>('permanent');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formResponsibilities, setFormResponsibilities] = useState('');
  const [formChannels, setFormChannels] = useState<string[]>([]);
  const [formNote, setFormNote] = useState('');

  const openNew = () => {
    setEditId(null); setFormName(''); setFormRole(''); setFormType('permanent');
    setFormEmail(''); setFormPhone(''); setFormResponsibilities('');
    setFormChannels([]); setFormNote(''); setShowForm(true);
  };

  const openEdit = (m: TeamMember) => {
    setEditId(m.id); setFormName(m.name); setFormRole(m.role); setFormType(m.type);
    setFormEmail(m.email || ''); setFormPhone(m.phone || '');
    setFormResponsibilities(m.responsibilities.join('\n'));
    setFormChannels(m.channels || []); setFormNote(m.note || ''); setShowForm(true);
  };

  const saveMember = () => {
    if (!formName.trim() || !formRole.trim()) return;
    const member: TeamMember = {
      id: editId || 'tm_' + Date.now(),
      name: formName.trim(),
      role: formRole.trim(),
      type: formType,
      avatar: formName.trim()[0].toUpperCase(),
      email: formEmail.trim() || undefined,
      phone: formPhone.trim() || undefined,
      responsibilities: formResponsibilities.split('\n').filter(r => r.trim()),
      channels: formChannels,
      currentTasks: editId ? (teamData.find(m => m.id === editId)?.currentTasks || []) : [],
      projects: editId ? (teamData.find(m => m.id === editId)?.projects || []) : [],
      note: formNote.trim() || undefined,
    };
    if (editId) {
      setTeamData(prev => prev.map(m => m.id === editId ? member : m));
    } else {
      setTeamData(prev => [...prev, member]);
    }
    setShowForm(false);
    toast(editId ? 'Tiimiläinen päivitetty' : 'Tiimiläinen lisätty', 'success');
  };

  const removeMember = (id: string) => {
    setTeamData(prev => prev.filter(m => m.id !== id));
    if (selectedMember === id) setSelectedMember(null);
    toast('Tiimiläinen poistettu', 'success');
  };

  // Task management for member
  const addTask = (memberId: string, task: string) => {
    if (!task.trim()) return;
    setTeamData(prev => prev.map(m => m.id === memberId ? { ...m, currentTasks: [...m.currentTasks, task.trim()] } : m));
  };
  const removeTask = (memberId: string, taskIdx: number) => {
    setTeamData(prev => prev.map(m => m.id === memberId ? { ...m, currentTasks: m.currentTasks.filter((_, i) => i !== taskIdx) } : m));
  };

  const toggleChannel = (ch: string) => setFormChannels(prev => prev.includes(ch) ? prev.filter(c => c !== ch) : [...prev, ch]);

  const filtered = teamData;
  const selected = selectedMember ? teamData.find(m => m.id === selectedMember) : null;

  // Detail view
  if (selected) {
    const typeInfo = memberTypes.find(t => t.id === selected.type);
    return (
      <AppShell title={selected.name} subtitle={selected.role}>
        <button className="btn btn-ghost" onClick={() => setSelectedMember(null)} style={{ marginBottom: '1rem' }}>{'\u2190'} Takaisin tiimiin</button>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: '1.5rem' }}>
          {/* Left: main info */}
          <div>
            {/* Profile header */}
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '1.5rem', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div className="ava" style={{ width: 56, height: 56, fontSize: '1.3rem', background: 'var(--pri)' }}>{selected.avatar}</div>
                <div style={{ flex: 1 }}>
                  <h2 style={{ fontSize: '1.2rem', fontWeight: 700 }}>{selected.name}</h2>
                  <div style={{ fontSize: '.88rem', color: 'var(--t2)' }}>{selected.role}</div>
                  <span style={{ display: 'inline-block', marginTop: '.35rem', fontSize: '.68rem', padding: '.15rem .5rem', borderRadius: 9999, background: typeInfo?.bg, color: typeInfo?.color, fontWeight: 600 }}>{typeInfo?.label}</span>
                </div>
                {canEdit && <button className="btn btn-ghost btn-sm" onClick={() => openEdit(selected)}>Muokkaa</button>}
              </div>
              {selected.email && <div style={{ fontSize: '.82rem', color: 'var(--t3)', marginTop: '.75rem' }}>{selected.email}{selected.phone && ` \u00b7 ${selected.phone}`}</div>}
              {selected.note && <div style={{ fontSize: '.82rem', color: 'var(--t2)', marginTop: '.5rem', fontStyle: 'italic', lineHeight: 1.6 }}>{selected.note}</div>}
            </div>

            {/* Vastuualueet */}
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '1.5rem', marginBottom: '1.25rem' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '.88rem', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.02em', marginBottom: '.75rem' }}>Vastuualueet</h3>
              {selected.responsibilities.length > 0 ? (
                selected.responsibilities.map((r, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '.5rem', padding: '.5rem .75rem', background: 'var(--elev)', border: '1px solid var(--border)', borderRadius: 'var(--r)', marginBottom: '.35rem' }}>
                    <div style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--pri)', flexShrink: 0 }} />
                    <span style={{ fontSize: '.85rem' }}>{r}</span>
                  </div>
                ))
              ) : (
                <p style={{ color: 'var(--t3)', fontSize: '.85rem' }}>Ei määriteltyä vastuualueita.</p>
              )}
            </div>

            {/* Kanavat */}
            {selected.channels.length > 0 && (
              <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '1.5rem' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '.88rem', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.02em', marginBottom: '.75rem' }}>Kanavat</h3>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.4rem' }}>
                  {selected.channels.map((ch, i) => {
                    const channel = (org.channels || []).find((c: any) => c.name === ch);
                    return <span key={i} style={{ fontSize: '.78rem', padding: '.3rem .65rem', borderRadius: 9999, background: `${channel?.color || '#666'}18`, color: channel?.color || 'var(--t2)', fontWeight: 600 }}>{ch}</span>;
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Right: tasks and projects */}
          <div>
            {/* Työstössä nyt */}
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '1.25rem', marginBottom: '1.25rem' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '.82rem', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.02em', marginBottom: '.75rem' }}>Työstössä nyt</h3>
              {selected.currentTasks.map((task, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '.5rem .6rem', background: 'var(--elev)', border: '1px solid var(--border)', borderRadius: 'var(--r)', marginBottom: '.35rem' }}>
                  <span style={{ fontSize: '.82rem' }}>{task}</span>
                  {canEdit && <button className="btn btn-ghost btn-sm" onClick={() => removeTask(selected.id, i)} style={{ color: 'var(--t3)', fontSize: '.6rem' }}>{'\u00d7'}</button>}
                </div>
              ))}
              {selected.currentTasks.length === 0 && <p style={{ color: 'var(--t3)', fontSize: '.82rem' }}>Ei avoimia tehtäviä.</p>}
              {canEdit && (
                <form onSubmit={e => { e.preventDefault(); const input = (e.target as any).taskInput; addTask(selected.id, input.value); input.value = ''; }} style={{ display: 'flex', gap: '.5rem', marginTop: '.75rem' }}>
                  <input name="taskInput" className="input" placeholder="Lisää tehtävä..." style={{ flex: 1, fontSize: '.82rem' }} />
                  <button type="submit" className="btn btn-primary btn-sm">+</button>
                </form>
              )}
            </div>

            {/* Projektit */}
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '1.25rem' }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '.82rem', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.02em', marginBottom: '.75rem' }}>Projektit</h3>
              {projects.filter(p => !p.archived && p.team?.some((t: any) => t.name === selected.name)).map((p: any) => (
                <div key={p.id} style={{ padding: '.5rem .6rem', background: 'var(--elev)', border: '1px solid var(--border)', borderRadius: 'var(--r)', marginBottom: '.35rem' }}>
                  <div style={{ fontSize: '.82rem', fontWeight: 600 }}>{p.t}</div>
                  <div style={{ fontSize: '.68rem', color: 'var(--t3)' }}>{p.st === 'active' ? 'Työstössä' : p.st === 'idea' ? 'Idea' : 'Valmis'}</div>
                </div>
              ))}
              {projects.filter(p => !p.archived && p.team?.some((t: any) => t.name === selected.name)).length === 0 && (
                <p style={{ color: 'var(--t3)', fontSize: '.82rem' }}>Ei aktiivisia projekteja.</p>
              )}
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  // List view
  return (
    <AppShell title="Tiimi" subtitle={`${teamData.length} jäsentä`}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1.5rem' }}>
        {canEdit && <button className="btn btn-primary btn-sm" onClick={openNew}>+ Lisää tiimiläinen</button>}
      </div>

      {/* Team chat & requests */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', marginBottom: '1.5rem' }}>
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '.88rem', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.02em' }}>Tiimin keskustelu</h3>
          <button className="btn btn-primary btn-sm" onClick={() => setShowRequestForm(true)}>Lähetä pyyntö</button>
        </div>
        <div style={{ padding: '1.25rem 1.5rem', maxHeight: 400, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '.6rem' }}>
          {/* AI greeting */}
          {aiGreeting && (
            <div style={{ display: 'flex', gap: '.5rem' }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--pri)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '.55rem', fontWeight: 700, fontFamily: 'var(--font-display)', flexShrink: 0 }}>M</div>
              <div style={{ flex: 1, background: 'linear-gradient(135deg, rgba(5,107,159,.06), rgba(24,94,91,.04))', border: '1px solid rgba(5,107,159,.12)', borderRadius: 'var(--rl)', padding: '.7rem 1rem' }}>
                <div style={{ fontSize: '.82rem', color: 'var(--t1)', lineHeight: 1.6 }}>{aiGreeting}</div>
                <div style={{ fontSize: '.6rem', color: 'var(--t3)', marginTop: '.3rem' }}>Momentum {'\u00b7'} tanaan</div>
              </div>
            </div>
          )}
          {greetingLoading && !aiGreeting && (
            <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--pri)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '.55rem', fontWeight: 700, fontFamily: 'var(--font-display)' }}>M</div>
              <div className="typing"><span /><span /><span /></div>
            </div>
          )}

          {/* Messages */}
          {messages.filter(m => m.type !== 'ai-greeting').slice(-20).map(msg => (
            <div key={msg.id} style={{ display: 'flex', gap: '.5rem' }}>
              <div className="ava" style={{ width: 28, height: 28, fontSize: '.6rem', background: msg.type === 'request' ? 'var(--yellow)' : 'var(--elev)', color: msg.type === 'request' ? '#000' : 'var(--t2)', flexShrink: 0 }}>{msg.from[0]}</div>
              <div style={{ flex: 1, background: msg.type === 'request' ? 'rgba(241,180,52,.06)' : 'var(--elev)', border: `1px solid ${msg.type === 'request' ? 'rgba(241,180,52,.2)' : 'var(--border)'}`, borderRadius: 'var(--rl)', padding: '.6rem .85rem', opacity: msg.done ? 0.5 : 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.2rem' }}>
                  <span style={{ fontSize: '.75rem', fontWeight: 600 }}>{msg.from}</span>
                  <span style={{ fontSize: '.58rem', color: 'var(--t3)' }}>
                    {new Date(msg.timestamp).toLocaleDateString('fi-FI')} {new Date(msg.timestamp).toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                {msg.to && <div style={{ fontSize: '.65rem', color: 'var(--yellow)', fontWeight: 600, marginBottom: '.2rem' }}>Pyyntö: {msg.to}</div>}
                <div style={{ fontSize: '.82rem', color: msg.done ? 'var(--t3)' : 'var(--t2)', lineHeight: 1.6, textDecoration: msg.done ? 'line-through' : 'none' }}>{msg.text}</div>
                {msg.type === 'request' && !msg.done && msg.to === user?.displayName && (
                  <button className="btn btn-ghost btn-sm" onClick={() => markRequestDone(msg.id)} style={{ marginTop: '.4rem', fontSize: '.68rem', color: 'var(--green)' }}>Merkitse tehdyksi</button>
                )}
              </div>
            </div>
          ))}

          {messages.filter(m => m.type !== 'ai-greeting').length === 0 && !aiGreeting && !greetingLoading && (
            <p style={{ color: 'var(--t3)', fontSize: '.82rem', textAlign: 'center', padding: '1rem' }}>Ei viestejä vielä. Aloita keskustelu!</p>
          )}
        </div>

        {/* Chat input */}
        <div style={{ padding: '.75rem 1.25rem', borderTop: '1px solid var(--border)', display: 'flex', gap: '.5rem' }}>
          <input className="input" value={chatText} onChange={e => setChatText(e.target.value)} placeholder="Kirjoita tiimille..."
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); } }} style={{ flex: 1, fontSize: '.85rem' }} />
          <button className="btn btn-primary btn-sm" onClick={sendChat} disabled={!chatText.trim()}>Lähetä</button>
        </div>
      </div>

      {/* Request modal */}
      {showRequestForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowRequestForm(false)}>
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '2rem', width: 440, maxWidth: '90vw' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', marginBottom: '1.25rem' }}>Lähetä pyyntö tiimilaiselle</h3>
            <div className="field">
              <label>Kenelle?</label>
              <select className="input" value={requestTo} onChange={e => setRequestTo(e.target.value)}>
                <option value="">Valitse tiimilainen...</option>
                {teamData.map(m => <option key={m.id} value={m.name}>{m.name} ({m.role})</option>)}
              </select>
            </div>
            <div className="field">
              <label>Mitä tarvitset?</label>
              <textarea className="input textarea" value={requestText} onChange={e => setRequestText(e.target.value)} placeholder="Esim. Voitko lähettää uuden version esitteesta?" style={{ minHeight: 80 }} />
            </div>
            <p style={{ fontSize: '.72rem', color: 'var(--t3)', marginBottom: '1rem' }}>Pyynto nakyy tiimin keskustelussa ja lisätään vastaanottajan tehtaviin.</p>
            <div style={{ display: 'flex', gap: '.5rem', justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setShowRequestForm(false)}>Peruuta</button>
              <button className="btn btn-primary" onClick={sendRequest} disabled={!requestTo || !requestText.trim()}>Lähetä</button>
            </div>
          </div>
        </div>
      )}

      {/* Team list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
        {filtered.map(m => {
          const typeInfo = memberTypes.find(t => t.id === m.type);
          return (
            <div key={m.id} onClick={() => setSelectedMember(m.id)} style={{
              display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem 1.25rem',
              background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)',
              cursor: 'pointer', transition: 'border-color .15s',
            }} onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--pri)')} onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}>
              <div className="ava" style={{ width: 44, height: 44, fontSize: '1rem', background: 'var(--pri)', flexShrink: 0 }}>{m.avatar}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                  <span style={{ fontSize: '.95rem', fontWeight: 700 }}>{m.name}</span>
                  <span style={{ fontSize: '.62rem', padding: '.1rem .4rem', borderRadius: 9999, background: typeInfo?.bg, color: typeInfo?.color, fontWeight: 600 }}>{typeInfo?.label}</span>
                </div>
                <div style={{ fontSize: '.78rem', color: 'var(--t3)', marginTop: '.15rem' }}>{m.role}</div>
                {m.currentTasks.length > 0 && (
                  <div style={{ fontSize: '.68rem', color: 'var(--t2)', marginTop: '.35rem' }}>
                    Työstössä: {m.currentTasks.slice(0, 2).join(', ')}{m.currentTasks.length > 2 ? ` +${m.currentTasks.length - 2}` : ''}
                  </div>
                )}
              </div>
              {m.channels.length > 0 && (
                <div style={{ display: 'flex', gap: '.2rem', flexShrink: 0 }}>
                  {m.channels.slice(0, 4).map((ch, i) => {
                    const channel = (org.channels || []).find((c: any) => c.name === ch);
                    return <span key={i} style={{ width: 24, height: 24, borderRadius: 4, background: `${channel?.color || '#666'}20`, color: channel?.color || '#666', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.55rem', fontWeight: 700, fontFamily: 'var(--font-display)' }}>{channel?.ic || ch[0]}</span>;
                  })}
                </div>
              )}
              <span style={{ color: 'var(--t3)' }}>{'\u203a'}</span>
            </div>
          );
        })}
        {filtered.length === 0 && <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--t3)' }}>Ei tiimiläisiä. Lisää ensimmäinen ylhäältä.</div>}
      </div>

      {/* Add/Edit modal */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowForm(false)}>
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '2rem', width: 520, maxWidth: '90vw', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', marginBottom: '1.25rem' }}>{editId ? 'Muokkaa tiimilaista' : 'Lisää tiimiläinen'}</h3>

            <div className="field"><label>Nimi *</label><input className="input" value={formName} onChange={e => setFormName(e.target.value)} autoFocus /></div>
            <div className="field"><label>Rooli / titteli *</label><input className="input" value={formRole} onChange={e => setFormRole(e.target.value)} placeholder="Esim. Viestintävastaava" /></div>

            <div className="field">
              <label>Tyyppi</label>
              <div style={{ display: 'flex', gap: '.5rem' }}>
                {memberTypes.map(t => (
                  <button key={t.id} type="button" className={`btn btn-sm ${formType === t.id ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFormType(t.id as any)}>{t.label}</button>
                ))}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem' }}>
              <div className="field"><label>Sahkoposti</label><input className="input" value={formEmail} onChange={e => setFormEmail(e.target.value)} type="email" /></div>
              <div className="field"><label>Puhelin</label><input className="input" value={formPhone} onChange={e => setFormPhone(e.target.value)} /></div>
            </div>

            <div className="field">
              <label>Vastuualueet (yksi per rivi)</label>
              <textarea className="input textarea" value={formResponsibilities} onChange={e => setFormResponsibilities(e.target.value)} placeholder="Facebook-sisällöt&#10;Instagram-sisällöt&#10;Uutiskirjeet" style={{ minHeight: 80 }} />
            </div>

            <div className="field">
              <label>Kanavat</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.35rem' }}>
                {(org.channels || []).map((ch: any) => (
                  <button key={ch.name} type="button" className={`btn btn-sm ${formChannels.includes(ch.name) ? 'btn-primary' : 'btn-secondary'}`} onClick={() => toggleChannel(ch.name)} style={{ fontSize: '.75rem' }}>{ch.name}</button>
                ))}
              </div>
            </div>

            <div className="field"><label>Huomioita</label><textarea className="input textarea" value={formNote} onChange={e => setFormNote(e.target.value)} placeholder="Vapaaehtoinen lisatieto..." /></div>

            <div style={{ display: 'flex', gap: '.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
              {editId && <button className="btn btn-ghost btn-sm" onClick={() => { removeMember(editId); setShowForm(false); }} style={{ color: 'var(--red)', marginRight: 'auto' }}>Poista</button>}
              <button className="btn btn-ghost" onClick={() => setShowForm(false)}>Peruuta</button>
              <button className="btn btn-primary" onClick={saveMember} disabled={!formName.trim() || !formRole.trim()}>Tallenna</button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
