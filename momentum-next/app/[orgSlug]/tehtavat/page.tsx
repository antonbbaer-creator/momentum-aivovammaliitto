'use client';

import { useState } from 'react';
import AppShell from '@/components/AppShell';
import { useOrgData } from '@/lib/firestore';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { useParams } from 'next/navigation';
import { getOrgTeamMembers } from '@/lib/org-defaults';
import { OrgTeamMember } from '@/lib/team-shared';
import { useIsMobile } from '@/lib/use-mobile';

interface Task {
  id: string;
  text: string;
  assignee?: string;
  hankkia: boolean;
  done: boolean;
  priority: 'normal' | 'high';
  deadline?: string;
  note?: string;
  category?: string;
}

const TASK_CATEGORIES = ['Koristelu', 'Ohjelma', 'Kutsut', 'Musiikki', 'Valokuvaus', 'Kuljetus', 'Siivous', 'Muu'];

export default function TehtavatPage() {
  const { canEdit } = useAuth();
  const { toast } = useToast();
  const params = useParams();
  const orgSlug = (params.orgSlug as string) || '';
  const [tasks, setTasks] = useOrgData<Task[]>('tasks', []);
  const [members] = useOrgData<OrgTeamMember[]>('orgTeamMembers', getOrgTeamMembers(orgSlug));
  const isMobile = useIsMobile();
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [filterAssignee, setFilterAssignee] = useState('');
  const [filterHankkia, setFilterHankkia] = useState(false);
  const [showDone, setShowDone] = useState(false);

  // Form
  const [tText, setTText] = useState('');
  const [tAssignee, setTAssignee] = useState('');
  const [tHankkia, setTHankkia] = useState(false);
  const [tPriority, setTPriority] = useState<'normal' | 'high'>('normal');
  const [tDeadline, setTDeadline] = useState('');
  const [tNote, setTNote] = useState('');
  const [tCategory, setTCategory] = useState('');

  // Quick add
  const [quickText, setQuickText] = useState('');

  const openNew = () => {
    setEditId(null); setTText(''); setTAssignee(''); setTHankkia(false);
    setTPriority('normal'); setTDeadline(''); setTNote(''); setTCategory('');
    setShowForm(true);
  };

  const openEdit = (t: Task) => {
    setEditId(t.id); setTText(t.text); setTAssignee(t.assignee || '');
    setTHankkia(t.hankkia); setTPriority(t.priority); setTDeadline(t.deadline || '');
    setTNote(t.note || ''); setTCategory(t.category || '');
    setShowForm(true);
  };

  const save = () => {
    if (!tText.trim()) return;
    const task: Task = {
      id: editId || 't_' + Date.now(),
      text: tText.trim(), assignee: tAssignee || undefined,
      hankkia: tHankkia, done: false, priority: tPriority,
      deadline: tDeadline || undefined, note: tNote.trim() || undefined,
      category: tCategory || undefined,
    };
    if (editId) setTasks(prev => prev.map(x => x.id === editId ? { ...x, ...task } : x));
    else setTasks(prev => [...prev, task]);
    setShowForm(false);
    toast(editId ? 'Päivitetty' : 'Lisätty', 'success');
  };

  const quickAdd = () => {
    if (!quickText.trim()) return;
    setTasks(prev => [...prev, {
      id: 't_' + Date.now(), text: quickText.trim(),
      hankkia: false, done: false, priority: 'normal',
    }]);
    setQuickText('');
  };

  const toggleDone = (id: string) => {
    setTasks(prev => prev.map(x => x.id === id ? { ...x, done: !x.done } : x));
  };

  const remove = (id: string) => {
    setTasks(prev => prev.filter(x => x.id !== id));
  };

  // Filter
  const openTasks = tasks.filter(t => !t.done);
  const doneTasks = tasks.filter(t => t.done);
  const filtered = openTasks.filter(t => {
    if (filterAssignee && t.assignee !== filterAssignee) return false;
    if (filterHankkia && !t.hankkia) return false;
    return true;
  }).sort((a, b) => {
    if (a.priority === 'high' && b.priority !== 'high') return -1;
    if (b.priority === 'high' && a.priority !== 'high') return 1;
    if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline);
    if (a.deadline) return -1;
    if (b.deadline) return 1;
    return 0;
  });

  const assignees = [...new Set(tasks.map(t => t.assignee).filter(Boolean))] as string[];
  const hankkiaCount = openTasks.filter(t => t.hankkia).length;

  return (
    <AppShell title="Tehtävät" subtitle={`${openTasks.length} avointa · ${doneTasks.length} valmista`}>
      {/* Quick add */}
      {canEdit && (
        <div style={{ display: 'flex', gap: '.5rem', marginBottom: '1.25rem' }}>
          <input className="input" value={quickText} onChange={e => setQuickText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && quickAdd()}
            placeholder="Lisää tehtävä nopeasti..." style={{ flex: 1 }} />
          <button className="btn btn-primary" onClick={quickAdd} disabled={!quickText.trim()}>Lisää</button>
          <button className="btn btn-secondary" onClick={openNew}>+ Tarkempi</button>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: '.5rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <select className="input" value={filterAssignee} onChange={e => setFilterAssignee(e.target.value)} style={{ width: 'auto', fontSize: '.78rem' }}>
          <option value="">Kaikki tekijät</option>
          {assignees.map(a => <option key={a} value={a}>{a}</option>)}
          {members.filter(m => !assignees.includes(m.name)).map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
        </select>
        <button
          className={`btn btn-sm ${filterHankkia ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setFilterHankkia(!filterHankkia)}
        >
          Hankittavat ({hankkiaCount})
        </button>
        <div style={{ flex: 1 }} />
        <button className="btn btn-ghost btn-sm" onClick={() => setShowDone(!showDone)}>
          {showDone ? 'Piilota valmiit' : `Näytä valmiit (${doneTasks.length})`}
        </button>
      </div>

      {/* Task list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '.35rem' }}>
        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--t3)', fontSize: '.85rem' }}>
            {openTasks.length === 0 ? 'Ei tehtäviä vielä. Lisää ensimmäinen ylhäältä.' : 'Ei tuloksia suodattimella.'}
          </div>
        )}
        {filtered.map(t => {
          const dlDiff = t.deadline ? Math.ceil((new Date(t.deadline).getTime() - Date.now()) / 86400000) : null;
          const urgent = dlDiff !== null && dlDiff >= 0 && dlDiff <= 7;
          return (
            <div key={t.id} style={{
              display: 'flex', alignItems: 'center', gap: '.65rem',
              padding: '.65rem .85rem', background: 'var(--card)',
              border: `1px solid ${urgent ? 'rgba(239,68,68,.25)' : 'var(--border)'}`,
              borderLeft: `3px solid ${t.priority === 'high' ? 'var(--red)' : t.hankkia ? 'var(--yellow)' : 'var(--pri)'}`,
              borderRadius: 'var(--r)',
            }}>
              {canEdit && (
                <input type="checkbox" checked={t.done} onChange={() => toggleDone(t.id)}
                  style={{ width: 18, height: 18, accentColor: 'var(--green)', flexShrink: 0, cursor: 'pointer' }} />
              )}
              <div style={{ flex: 1, minWidth: 0, cursor: canEdit ? 'pointer' : 'default' }} onClick={() => canEdit && openEdit(t)}>
                <div style={{ fontSize: '.85rem', fontWeight: 600 }}>{t.text}</div>
                <div style={{ fontSize: '.68rem', color: 'var(--t3)', display: 'flex', gap: '.5rem', flexWrap: 'wrap', marginTop: '.15rem' }}>
                  {t.assignee && <span style={{ fontWeight: 600 }}>{t.assignee}</span>}
                  {t.category && <span>{t.category}</span>}
                  {t.note && <span>{t.note}</span>}
                </div>
              </div>
              {t.hankkia && (
                <span style={{ fontSize: '.58rem', padding: '.15rem .4rem', borderRadius: 9999, background: 'rgba(241,180,52,.15)', color: 'var(--yellow)', fontWeight: 700, flexShrink: 0, textTransform: 'uppercase' }}>Hankittava</span>
              )}
              {t.deadline && (
                <span style={{
                  fontSize: '.6rem', fontWeight: 700, flexShrink: 0,
                  color: urgent ? 'var(--red)' : dlDiff !== null && dlDiff <= 30 ? 'var(--yellow)' : 'var(--green)',
                }}>
                  {dlDiff !== null && dlDiff >= 0 ? (dlDiff === 0 ? 'TÄNÄÄN' : `${dlDiff} pv`) : t.deadline}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Hankintalista */}
      {(() => {
        const hankinnat = openTasks.filter(t => t.hankkia);
        if (hankinnat.length === 0) return null;
        return (
          <div style={{ marginTop: '1.5rem' }}>
            <div style={{
              fontSize: '.72rem', fontWeight: 700, color: 'var(--yellow)', textTransform: 'uppercase',
              letterSpacing: '.05em', marginBottom: '.5rem', padding: '0 .25rem',
              display: 'flex', alignItems: 'center', gap: '.5rem',
            }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--yellow)' }} />
              Hankintalista ({hankinnat.length})
            </div>
            <div style={{
              background: 'rgba(241,180,52,.04)', border: '1px solid rgba(241,180,52,.15)',
              borderRadius: 'var(--rl)', padding: '1rem',
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '.3rem' }}>
                {hankinnat.map(t => (
                  <div key={t.id} style={{
                    display: 'flex', alignItems: 'center', gap: '.65rem',
                    padding: '.5rem .7rem', background: 'var(--card)',
                    border: '1px solid var(--border)', borderRadius: 'var(--r)',
                    borderLeft: '3px solid var(--yellow)',
                  }}>
                    {canEdit && (
                      <input type="checkbox" checked={t.done} onChange={() => toggleDone(t.id)}
                        style={{ width: 18, height: 18, accentColor: 'var(--green)', flexShrink: 0, cursor: 'pointer' }} />
                    )}
                    <div style={{ flex: 1, minWidth: 0, cursor: canEdit ? 'pointer' : 'default' }} onClick={() => canEdit && openEdit(t)}>
                      <div style={{ fontSize: '.82rem', fontWeight: 600 }}>{t.text}</div>
                      <div style={{ fontSize: '.65rem', color: 'var(--t3)', display: 'flex', gap: '.4rem', flexWrap: 'wrap', marginTop: '.1rem' }}>
                        {t.assignee && <span style={{ fontWeight: 600 }}>{t.assignee}</span>}
                        {t.note && <span>{t.note}</span>}
                      </div>
                    </div>
                    {t.deadline && (
                      <span style={{ fontSize: '.6rem', fontWeight: 700, color: 'var(--t3)', flexShrink: 0 }}>{t.deadline}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Done tasks */}
      {showDone && doneTasks.length > 0 && (
        <div style={{ marginTop: '1.5rem' }}>
          <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '.5rem' }}>
            Valmiit ({doneTasks.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.3rem' }}>
            {doneTasks.map(t => (
              <div key={t.id} style={{
                display: 'flex', alignItems: 'center', gap: '.65rem',
                padding: '.5rem .8rem', background: 'var(--card)', opacity: 0.5,
                border: '1px solid var(--border)', borderRadius: 'var(--r)',
              }}>
                {canEdit && (
                  <input type="checkbox" checked={true} onChange={() => toggleDone(t.id)}
                    style={{ width: 16, height: 16, accentColor: 'var(--green)', flexShrink: 0, cursor: 'pointer' }} />
                )}
                <span style={{ fontSize: '.82rem', textDecoration: 'line-through', flex: 1 }}>{t.text}</span>
                {t.assignee && <span style={{ fontSize: '.65rem', color: 'var(--t3)' }}>{t.assignee}</span>}
                {canEdit && <button className="btn btn-ghost btn-sm" onClick={() => remove(t.id)} style={{ fontSize: '.6rem', color: 'var(--red)', padding: '.1rem .3rem' }}>x</button>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Form modal */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowForm(false)}>
          <div style={{ background: 'var(--card)', border: isMobile ? 'none' : '1px solid var(--border)', borderRadius: isMobile ? 0 : 'var(--rl)', padding: isMobile ? '1.25rem' : '2rem', width: isMobile ? '100%' : 480, maxWidth: isMobile ? '100%' : '90vw', maxHeight: isMobile ? '100%' : '90vh', height: isMobile ? '100%' : 'auto', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', marginBottom: '1.25rem' }}>{editId ? 'Muokkaa tehtävää' : 'Lisää tehtävä'}</h3>
            <div className="field"><label>Tehtävä *</label><input className="input" value={tText} onChange={e => setTText(e.target.value)} autoFocus /></div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '.75rem' }}>
              <div className="field">
                <label>Tekijä</label>
                <select className="input" value={tAssignee} onChange={e => setTAssignee(e.target.value)}>
                  <option value="">Ei määrätty</option>
                  {members.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Kategoria</label>
                <select className="input" value={tCategory} onChange={e => setTCategory(e.target.value)}>
                  <option value="">Ei kategoriaa</option>
                  {TASK_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '.75rem' }}>
              <div className="field"><label>Deadline</label><input className="input" type="date" value={tDeadline} onChange={e => setTDeadline(e.target.value)} /></div>
              <div className="field">
                <label>Prioriteetti</label>
                <div style={{ display: 'flex', gap: '.35rem' }}>
                  <button type="button" onClick={() => setTPriority('normal')} style={{
                    flex: 1, padding: '.4rem', borderRadius: 'var(--r)', fontSize: '.75rem', fontWeight: 600, cursor: 'pointer',
                    background: tPriority === 'normal' ? 'rgba(5,107,159,.15)' : 'var(--elev)',
                    color: tPriority === 'normal' ? 'var(--pri-l)' : 'var(--t2)',
                    border: `1px solid ${tPriority === 'normal' ? 'var(--pri)' : 'var(--border)'}`,
                  }}>Normaali</button>
                  <button type="button" onClick={() => setTPriority('high')} style={{
                    flex: 1, padding: '.4rem', borderRadius: 'var(--r)', fontSize: '.75rem', fontWeight: 600, cursor: 'pointer',
                    background: tPriority === 'high' ? 'rgba(239,68,68,.15)' : 'var(--elev)',
                    color: tPriority === 'high' ? 'var(--red)' : 'var(--t2)',
                    border: `1px solid ${tPriority === 'high' ? 'var(--red)' : 'var(--border)'}`,
                  }}>Tärkeää</button>
                </div>
              </div>
            </div>
            <div className="field" style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '.5rem', cursor: 'pointer' }}>
                <input type="checkbox" checked={tHankkia} onChange={e => setTHankkia(e.target.checked)} style={{ width: 18, height: 18, accentColor: 'var(--yellow)' }} />
                Pitää hankkia / ostaa
              </label>
            </div>
            <div className="field"><label>Muistiinpano</label><textarea className="input textarea" value={tNote} onChange={e => setTNote(e.target.value)} /></div>
            <div style={{ display: 'flex', gap: '.5rem', justifyContent: 'flex-end' }}>
              {editId && <button className="btn btn-ghost btn-sm" onClick={() => { remove(editId); setShowForm(false); }} style={{ color: 'var(--red)', marginRight: 'auto' }}>Poista</button>}
              <button className="btn btn-ghost" onClick={() => setShowForm(false)}>Peruuta</button>
              <button className="btn btn-primary" onClick={save} disabled={!tText.trim()}>Tallenna</button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
