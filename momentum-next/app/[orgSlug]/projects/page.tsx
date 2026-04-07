'use client';

import { useState } from 'react';
import AppShell from '@/components/AppShell';
import { useOrgData } from '@/lib/firestore';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';

interface Task { id: number; text: string; done: boolean; assignee: string; }
interface TeamMember { name: string; role: string; avatar: string; }
interface Project { id: number; t: string; d: string; st: string; deadline: string; team: TeamMember[]; comments: any[]; tasks: Task[]; archived: boolean; createdAt: number; }

const deadlineColor = (dl: string) => {
  if (!dl) return null;
  const diff = new Date(dl).getTime() - Date.now();
  const day = 86400000;
  if (diff < 0) return { color: 'var(--red)', bg: 'rgba(239,68,68,.1)', label: 'Myöhässä' };
  if (diff < 7 * day) return { color: 'var(--red)', bg: 'rgba(239,68,68,.1)', label: Math.ceil(diff / day) + ' pv jäljellä' };
  if (diff < 30 * day) return { color: 'var(--yellow)', bg: 'rgba(245,197,66,.1)', label: Math.ceil(diff / day) + ' pv jäljellä' };
  return { color: 'var(--green)', bg: 'rgba(45,212,160,.1)', label: Math.ceil(diff / day) + ' pv jäljellä' };
};
const taskProgress = (tasks: Task[]) => tasks?.length ? Math.round(tasks.filter(t => t.done).length / tasks.length * 100) : 0;

export default function ProjectsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [projects, setProjects] = useOrgData<Project[]>('projects', []);
  const [mode, setMode] = useState<'kanban' | 'new' | 'detail'>('kanban');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showArchive, setShowArchive] = useState(false);
  const [dragItem, setDragItem] = useState<number | null>(null);

  // New project form
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [deadline, setDeadline] = useState('');

  const cols = [{ k: 'idea', t: 'Ideat' }, { k: 'active', t: 'Työstössä' }, { k: 'done', t: 'Valmiit' }];
  const active = projects.filter(p => !p.archived);
  const archived = projects.filter(p => p.archived);

  const createProject = () => {
    if (!title.trim()) return;
    const exists = projects.some(p => p.t.toLowerCase() === title.trim().toLowerCase());
    if (exists) { toast('Samanniminen projekti on jo olemassa', 'error'); return; }
    const p: Project = { id: Date.now(), t: title.trim(), d: desc.trim(), st: 'idea', deadline, team: [], comments: [], tasks: [], archived: false, createdAt: Date.now() };
    setProjects(prev => [...prev, p]);
    setTitle(''); setDesc(''); setDeadline(''); setMode('kanban');
    toast('Projekti luotu', 'success');
  };

  const moveProject = (id: number, newSt: string) => setProjects(prev => prev.map(p => p.id === id ? { ...p, st: newSt } : p));
  const archiveProject = (id: number) => setProjects(prev => prev.map(p => p.id === id ? { ...p, archived: true } : p));
  const unarchiveProject = (id: number) => setProjects(prev => prev.map(p => p.id === id ? { ...p, archived: false } : p));
  const deleteProject = (id: number) => setProjects(prev => prev.filter(p => p.id !== id));
  const updateProject = (id: number, updates: Partial<Project>) => setProjects(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));

  const selected = selectedId ? projects.find(p => p.id === selectedId) : null;

  // Detail view
  if (mode === 'detail' && selected) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const progress = taskProgress(selected.tasks);
    const dlc = deadlineColor(selected.deadline);
    return (
      <AppShell title={selected.t} subtitle="Projekti">
        <button className="btn btn-ghost" onClick={() => setMode('kanban')} style={{ marginBottom: '1rem' }}>{'\u2190'} Takaisin projekteihin</button>

        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '1.5rem', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>{selected.t}</h3>
              {dlc && <span style={{ fontSize: '.72rem', padding: '.2rem .5rem', borderRadius: 9999, background: dlc.bg, color: dlc.color, fontWeight: 600 }}>{dlc.label}</span>}
            </div>
            <select className="input" style={{ width: 'auto', fontSize: '.8rem' }} value={selected.st} onChange={e => updateProject(selected.id, { st: e.target.value })}>
              <option value="idea">Idea</option><option value="active">Työstössä</option><option value="done">Valmis</option>
            </select>
          </div>
          {selected.d && <p style={{ color: 'var(--t2)', marginTop: '.75rem', lineHeight: 1.7, fontSize: '.9rem' }}>{selected.d}</p>}
          <div style={{ marginTop: '1rem' }}>
            <label style={{ fontSize: '.72rem', fontWeight: 600, color: 'var(--t3)' }}>Deadline</label>
            <input type="date" className="input" value={selected.deadline || ''} onChange={e => updateProject(selected.id, { deadline: e.target.value })} style={{ marginTop: '.25rem', maxWidth: 200 }} />
          </div>
        </div>

        {/* Tasks */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '1.5rem', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '.88rem', fontWeight: 500, textTransform: 'uppercase' }}>Tehtävät</h3>
            {selected.tasks.length > 0 && <span style={{ fontSize: '.75rem', color: 'var(--t3)' }}>{progress}% valmis</span>}
          </div>
          {progress > 0 && <div style={{ height: 4, background: 'var(--bg)', borderRadius: 2, marginBottom: '1rem', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: progress + '%', background: progress === 100 ? 'var(--green)' : 'var(--pri)', borderRadius: 2, transition: 'width .3s' }} />
          </div>}
          {(selected.tasks || []).map((task, i) => (
            <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: '.6rem', padding: '.5rem 0', borderBottom: '1px solid var(--border)' }}>
              <input type="checkbox" checked={task.done} onChange={() => {
                const tasks = [...selected.tasks]; tasks[i] = { ...tasks[i], done: !tasks[i].done }; updateProject(selected.id, { tasks });
              }} />
              <span style={{ flex: 1, fontSize: '.85rem', textDecoration: task.done ? 'line-through' : 'none', color: task.done ? 'var(--t3)' : 'var(--t1)' }}>{task.text}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => {
                updateProject(selected.id, { tasks: selected.tasks.filter((_, j) => j !== i) });
              }} style={{ color: 'var(--t3)', fontSize: '.7rem' }}>{'\u00d7'}</button>
            </div>
          ))}
          <form onSubmit={e => { e.preventDefault(); const input = (e.target as any).taskInput; if (!input.value.trim()) return; updateProject(selected.id, { tasks: [...(selected.tasks || []), { id: Date.now(), text: input.value.trim(), done: false, assignee: '' }] }); input.value = ''; }} style={{ marginTop: '.75rem', display: 'flex', gap: '.5rem' }}>
            <input name="taskInput" className="input" placeholder="Lisää tehtävä..." style={{ flex: 1 }} />
            <button type="submit" className="btn btn-primary btn-sm">Lisää</button>
          </form>
        </div>

        {/* Comments */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '1.5rem' }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '.88rem', fontWeight: 500, textTransform: 'uppercase', marginBottom: '1rem' }}>Keskustelu ({(selected.comments || []).length})</h3>
          {(selected.comments || []).map((c: any) => (
            <div key={c.id} style={{ display: 'flex', gap: '.6rem', marginBottom: '.75rem' }}>
              <div className="ava" style={{ width: 32, height: 32, fontSize: '.7rem', background: 'var(--pri)', flexShrink: 0 }}>{(c.author || 'A')[0]}</div>
              <div style={{ flex: 1, background: 'var(--elev)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '.75rem 1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '.25rem' }}>
                  <span style={{ fontSize: '.8rem', fontWeight: 600 }}>{c.author}</span>
                  <span style={{ fontSize: '.65rem', color: 'var(--t3)' }}>{c.timestamp ? new Date(c.timestamp).toLocaleDateString('fi-FI') : ''}</span>
                </div>
                <p style={{ fontSize: '.85rem', color: 'var(--t2)', lineHeight: 1.6 }}>{c.text}</p>
              </div>
            </div>
          ))}
          <form onSubmit={e => { e.preventDefault(); const input = (e.target as any).commentInput; if (!input.value.trim()) return; updateProject(selected.id, { comments: [...(selected.comments || []), { id: Date.now(), author: user?.displayName || 'Käyttäjä', text: input.value.trim(), timestamp: new Date().toISOString() }] }); input.value = ''; }} style={{ display: 'flex', gap: '.5rem' }}>
            <input name="commentInput" className="input" placeholder="Kirjoita kommentti..." style={{ flex: 1 }} />
            <button type="submit" className="btn btn-primary btn-sm">Lähetä</button>
          </form>
        </div>
      </AppShell>
    );
  }

  // New project form
  if (mode === 'new') {
    return (
      <AppShell title="Uusi projekti" subtitle="Luo uusi viestintäprojekti">
        <button className="btn btn-ghost" onClick={() => setMode('kanban')} style={{ marginBottom: '1rem' }}>{'\u2190'} Takaisin</button>
        <div style={{ maxWidth: 560, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '2rem' }}>
          <div className="field"><label>Projektin nimi *</label><input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="Esim. Kevään somekampanja" autoFocus /></div>
          <div className="field"><label>Kuvaus</label><textarea className="input textarea" value={desc} onChange={e => setDesc(e.target.value)} placeholder="Kuvaile projektia..." /></div>
          <div className="field"><label>Deadline</label><input type="date" className="input" value={deadline} onChange={e => setDeadline(e.target.value)} style={{ maxWidth: 200 }} /></div>
          <button className="btn btn-primary" onClick={createProject} disabled={!title.trim()}>Luo projekti</button>
        </div>
      </AppShell>
    );
  }

  // Kanban view
  return (
    <AppShell title="Projektit" subtitle={`${active.length} projektia`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <button className="btn btn-primary" onClick={() => setMode('new')}>+ Uusi projekti</button>
        {archived.length > 0 && <button className="btn btn-ghost btn-sm" onClick={() => setShowArchive(!showArchive)}>{showArchive ? 'Piilota arkisto' : `Arkisto (${archived.length})`}</button>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
        {cols.map(col => {
          const items = active.filter(p => p.st === col.k);
          return (
            <div key={col.k} onDragOver={e => e.preventDefault()} onDrop={() => { if (dragItem) moveProject(dragItem, col.k); setDragItem(null); }}
              style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', minHeight: 300 }}>
              <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '.82rem', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.03em' }}>{col.t}</h3>
                <span style={{ fontSize: '.72rem', color: 'var(--t3)' }}>{items.length}</span>
              </div>
              <div style={{ padding: '.75rem', display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
                {items.map(p => {
                  const dlc = deadlineColor(p.deadline);
                  const prog = taskProgress(p.tasks);
                  return (
                    <div key={p.id} draggable onDragStart={() => setDragItem(p.id)}
                      onClick={() => { setSelectedId(p.id); setMode('detail'); }}
                      style={{ background: 'var(--elev)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '.85rem', cursor: 'pointer', transition: 'border-color .15s' }}
                      onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--pri)')} onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}>
                      <div style={{ fontSize: '.85rem', fontWeight: 600, marginBottom: '.35rem' }}>{p.t}</div>
                      {dlc && <div style={{ fontSize: '.65rem', padding: '.15rem .4rem', borderRadius: 9999, background: dlc.bg, color: dlc.color, fontWeight: 600, display: 'inline-block', marginBottom: '.35rem' }}>{dlc.label}</div>}
                      {prog > 0 && <div style={{ height: 3, background: 'var(--bg)', borderRadius: 2, overflow: 'hidden' }}><div style={{ height: '100%', width: prog + '%', background: prog === 100 ? 'var(--green)' : 'var(--pri)', borderRadius: 2 }} /></div>}
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '.4rem' }}>
                        {col.k === 'done' && <button className="btn btn-ghost btn-sm" onClick={e => { e.stopPropagation(); archiveProject(p.id); }} style={{ fontSize: '.65rem' }}>Arkistoi</button>}
                      </div>
                    </div>
                  );
                })}
                {items.length === 0 && <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--t3)', fontSize: '.82rem' }}>Ei projekteja</div>}
              </div>
            </div>
          );
        })}
      </div>

      {showArchive && archived.length > 0 && (
        <div style={{ marginTop: '1.5rem', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '1rem 1.25rem' }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '.82rem', fontWeight: 500, marginBottom: '.75rem', textTransform: 'uppercase' }}>Arkisto</h3>
          {archived.map(p => (
            <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '.5rem 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: '.85rem', color: 'var(--t2)' }}>{p.t}</span>
              <div style={{ display: 'flex', gap: '.3rem' }}>
                <button className="btn btn-ghost btn-sm" onClick={() => unarchiveProject(p.id)} style={{ fontSize: '.7rem' }}>Palauta</button>
                <button className="btn btn-ghost btn-sm" onClick={() => { if (window.confirm('Poistetaanko?')) deleteProject(p.id); }} style={{ fontSize: '.7rem', color: 'var(--red)' }}>Poista</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
