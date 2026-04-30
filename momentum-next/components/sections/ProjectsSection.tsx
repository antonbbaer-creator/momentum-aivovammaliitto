'use client';

import { useState, useMemo } from 'react';
import { useOrgData } from '@/lib/firestore';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { useIsMobile } from '@/lib/use-mobile';
import { useParams } from 'next/navigation';
import { OrgTeam, OrgTeamMember, uniqueMembersByName, resolveUserMember } from '@/lib/team-shared';
import { getOrgTeams, getOrgTeamMembers } from '@/lib/org-defaults';
import { softDelete, filterActive } from '@/lib/trash';
import { YearPhase, normalizePhase } from '@/lib/yearwheel-shared';
import { getOrgYearwheel } from '@/lib/org-defaults';
import {
  Assignable, effectiveStatus, buildAssignment, acceptAssignment,
  rejectAssignment, reassign, statusLabel, statusColor,
} from '@/lib/assignments-shared';
import Link from 'next/link';
import { ProjectNote, canViewNote, stageLabel, stageColor } from '@/lib/notes-shared';
import DrivePicker, { PickedItem } from '@/components/DrivePicker';
import { useDriveStatus } from '@/lib/drive';
import { Client, makeClient, clientIdFromName } from '@/lib/clients-shared';

export interface DriveAttachment {
  id: string;          // Drive file id
  name: string;
  mimeType: string;
  url?: string;        // webViewLink
  iconUrl?: string;
  thumbnailUrl?: string;
  addedAt: number;
}

interface Task extends Assignable {
  id: number; text: string; done: boolean; deadline: string;
}
interface TeamMember { name: string; role: string; avatar: string; }
export interface Project {
  id: number;
  t: string;
  d: string;
  st: string;
  deadline: string;
  team: TeamMember[];
  comments: any[];
  tasks: Task[];
  archived: boolean;
  createdAt: number;
  teamId?: string;   // NEW: organizational team id (executive/elokuva/viestinta/tekninen)
  phaseId?: string;  // NEW: optional link to a yearwheel phase
  clientName?: string; // Hetki Company: asiakkuuden nimi (vapaa tagi); muilla orgeilla ei käytössä
  deletedAt?: number;
  noteSeedIds?: string[]; // muistiinpanojen id:t joista projekti on syntynyt
  driveAttachments?: DriveAttachment[]; // Google Drive -liitteet
}

interface Props {
  // If provided, shows only projects for this team and auto-assigns new projects to it
  teamId?: string;
}

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

export default function ProjectsSection({ teamId: fixedTeamId }: Props = {}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const orgSlug = (useParams().orgSlug as string) || '';
  const isMobile = useIsMobile();
  const [projects, setProjects] = useOrgData<Project[]>('projects', []);
  const [, setClients] = useOrgData<Client[]>('clients', []);
  const [projectNotes] = useOrgData<ProjectNote[]>('projectNotes', []);
  const [teamDataRaw] = useOrgData<OrgTeamMember[]>('orgTeamMembers', getOrgTeamMembers(orgSlug));
  const teamData = useMemo(() => uniqueMembersByName(teamDataRaw), [teamDataRaw]);
  const myMember = useMemo(() => resolveUserMember(teamData, user), [teamData, user]);
  const myName = myMember?.name || user?.displayName || '';
  const [orgTeams] = useOrgData<OrgTeam[]>('orgTeams', getOrgTeams(orgSlug));
  const [rawPhases] = useOrgData<YearPhase[]>('yearwheel', getOrgYearwheel(orgSlug));
  const phases = useMemo(() => rawPhases.map(normalizePhase), [rawPhases]);

  const driveStatus = useDriveStatus();
  const [drivePickerOpen, setDrivePickerOpen] = useState(false);

  const [mode, setMode] = useState<'kanban' | 'new' | 'detail'>('kanban');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showArchive, setShowArchive] = useState(false);
  const [dragItem, setDragItem] = useState<number | null>(null);
  const [teamFilter, setTeamFilter] = useState<string>(fixedTeamId || 'all');
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const toggleExpanded = (id: number) => setExpanded(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [deadline, setDeadline] = useState('');
  const [newTeamId, setNewTeamId] = useState<string>(fixedTeamId || '');
  const [newPhaseId, setNewPhaseId] = useState<string>('');
  const [newClientName, setNewClientName] = useState<string>('');
  const [clientFilter, setClientFilter] = useState<string>('all');

  // Asiakas-tagit ovat käytössä vain Hetki Companyssä
  const showClientField = orgSlug === 'hetki-company';
  const knownClients = useMemo(() => {
    if (!showClientField) return [] as string[];
    const set = new Set<string>();
    for (const p of projects) {
      const c = (p.clientName || '').trim();
      if (c) set.add(c);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'fi'));
  }, [projects, showClientField]);

  const cols = [{ k: 'idea', t: 'Ideat' }, { k: 'active', t: 'Työstössä' }, { k: 'done', t: 'Valmiit' }];

  // If parent passed a fixed team, always filter by it (no override)
  const effectiveFilter = fixedTeamId || teamFilter;
  const activeProjects = useMemo(() => filterActive(projects), [projects]);
  const filteredByTeam = useMemo(() => effectiveFilter === 'all'
    ? activeProjects
    : activeProjects.filter(p => p.teamId === effectiveFilter), [activeProjects, effectiveFilter]);
  const filteredByClient = useMemo(() => {
    if (!showClientField || clientFilter === 'all') return filteredByTeam;
    if (clientFilter === '__none__') return filteredByTeam.filter(p => !(p.clientName || '').trim());
    return filteredByTeam.filter(p => (p.clientName || '').trim() === clientFilter);
  }, [filteredByTeam, clientFilter, showClientField]);
  const active = useMemo(() => filteredByClient.filter(p => !p.archived), [filteredByClient]);
  const archived = useMemo(() => filteredByClient.filter(p => p.archived), [filteredByClient]);

  const createProject = () => {
    if (!title.trim()) return;
    const exists = projects.some(p => p.t.toLowerCase() === title.trim().toLowerCase());
    if (exists) { toast('Samanniminen projekti on jo olemassa', 'error'); return; }
    const trimmedClient = newClientName.trim();
    const p: Project = {
      id: Date.now(), t: title.trim(), d: desc.trim(), st: 'idea', deadline,
      team: [], comments: [], tasks: [], archived: false, createdAt: Date.now(),
      teamId: newTeamId || fixedTeamId || undefined,
      phaseId: newPhaseId || undefined,
      clientName: showClientField && trimmedClient ? trimmedClient : undefined,
    };
    setProjects(prev => [...prev, p]);
    if (showClientField && trimmedClient) ensureClient(trimmedClient);
    setTitle(''); setDesc(''); setDeadline(''); setNewPhaseId(''); setNewClientName('');
    if (!fixedTeamId) setNewTeamId('');
    setMode('kanban');
    toast('Projekti luotu', 'success');
  };

  // Auto-sync: jos projektin clientName on uusi (ei viela Clients-listalla),
  // lisaa Client-objekti automaattisesti aktiivisena. Ei ylikirjoita olemassaolevaa.
  const ensureClient = (clientName: string) => {
    if (!showClientField) return;
    const trimmed = clientName.trim();
    if (!trimmed) return;
    const id = clientIdFromName(trimmed);
    setClients(prev => {
      if (prev.some(c => c.id === id || c.name.trim().toLowerCase() === trimmed.toLowerCase())) return prev;
      return [...prev, makeClient(trimmed)];
    });
  };

  const moveProject = (id: number, newSt: string) => setProjects(prev => prev.map(p => p.id === id ? { ...p, st: newSt } : p));
  const archiveProject = (id: number) => setProjects(prev => prev.map(p => p.id === id ? { ...p, archived: true } : p));
  const unarchiveProject = (id: number) => setProjects(prev => prev.map(p => p.id === id ? { ...p, archived: false } : p));
  const deleteProject = (id: number) => { setProjects(prev => softDelete(prev, id)); toast('Siirretty roskakoriin', 'success'); };
  const updateProject = (id: number, updates: Partial<Project>) => setProjects(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));

  const selected = selectedId ? projects.find(p => p.id === selectedId) : null;

  if (mode === 'detail' && selected) {
    const progress = taskProgress(selected.tasks);
    const dlc = deadlineColor(selected.deadline);
    const selectedTeam = selected.teamId ? orgTeams.find(t => t.id === selected.teamId) : null;
    const selectedPhase = selected.phaseId ? phases.find(ph => ph.id === selected.phaseId) : null;
    return (
      <>
        <button className="btn btn-ghost" onClick={() => setMode('kanban')} style={{ marginBottom: '1rem' }}>{'←'} Takaisin projekteihin</button>

        <div style={{
          background: 'var(--card)', border: '1px solid var(--border)',
          borderLeft: selectedTeam ? `4px solid ${selectedTeam.color}` : undefined,
          borderRadius: 'var(--rl)', padding: '1.5rem', marginBottom: '1.5rem',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', marginBottom: '.35rem', alignItems: 'center' }}>
                {selectedTeam && (
                  <span style={{ fontSize: '.6rem', padding: '.18rem .55rem', borderRadius: 9999, background: selectedTeam.color, color: '#fff', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                    {selectedTeam.icon} {selectedTeam.name}
                  </span>
                )}
                {selectedPhase && (
                  <span style={{ fontSize: '.6rem', padding: '.18rem .55rem', borderRadius: 9999, background: 'var(--elev)', color: 'var(--t2)', fontWeight: 600, border: '1px solid var(--border)' }}>
                    {'◌'} {selectedPhase.name}
                  </span>
                )}
              </div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>{selected.t}</h3>
              {dlc && <span style={{ fontSize: '.72rem', padding: '.2rem .5rem', borderRadius: 9999, background: dlc.bg, color: dlc.color, fontWeight: 600, marginTop: '.35rem', display: 'inline-block' }}>{dlc.label}</span>}
            </div>
            <select className="input" style={{ width: 'auto', fontSize: '.8rem' }} value={selected.st} onChange={e => updateProject(selected.id, { st: e.target.value })}>
              <option value="idea">Idea</option><option value="active">Työstössä</option><option value="done">Valmis</option>
            </select>
          </div>
          {selected.d && <p style={{ color: 'var(--t2)', marginTop: '.75rem', lineHeight: 1.7, fontSize: '.9rem' }}>{selected.d}</p>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '.75rem', marginTop: '1rem' }}>
            <div>
              <label style={{ fontSize: '.7rem', fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Deadline</label>
              <input type="date" className="input" value={selected.deadline || ''} onChange={e => updateProject(selected.id, { deadline: e.target.value })} style={{ marginTop: '.25rem' }} />
            </div>
            <div>
              <label style={{ fontSize: '.7rem', fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Tiimi</label>
              <select className="input" value={selected.teamId || ''} onChange={e => updateProject(selected.id, { teamId: e.target.value || undefined })} style={{ marginTop: '.25rem' }}>
                <option value="">Ei tiimiä</option>
                {orgTeams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '.7rem', fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Vuosikellon vaihe</label>
              <select className="input" value={selected.phaseId || ''} onChange={e => updateProject(selected.id, { phaseId: e.target.value || undefined })} style={{ marginTop: '.25rem' }}>
                <option value="">Ei linkitettyä vaihetta</option>
                {phases.map(ph => <option key={ph.id} value={ph.id}>{ph.name}</option>)}
              </select>
            </div>
            {showClientField && (
              <div>
                <label style={{ fontSize: '.7rem', fontWeight: 600, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Asiakas</label>
                <input
                  className="input"
                  value={selected.clientName || ''}
                  onChange={e => {
                    const v = e.target.value.trim();
                    updateProject(selected.id, { clientName: v || undefined });
                    if (v) ensureClient(v);
                  }}
                  placeholder="Esim. Esimerkki Oy"
                  list="hetki-known-clients"
                  style={{ marginTop: '.25rem' }}
                />
                {knownClients.length > 0 && (
                  <datalist id="hetki-known-clients">
                    {knownClients.map(c => <option key={c} value={c} />)}
                  </datalist>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Seed notes — "mistä idea syntyi" */}
        {(() => {
          const uid = user?.uid || '';
          const seedIds = selected.noteSeedIds || [];
          const seeds = seedIds
            .map(sid => projectNotes.find(n => n.id === sid && !n.deletedAt && canViewNote(n, uid)))
            .filter((n): n is ProjectNote => !!n);
          if (seeds.length === 0) return null;
          return (
            <div style={{
              background: 'rgba(155,124,246,.04)',
              border: '1px dashed rgba(155,124,246,.3)',
              borderRadius: 'var(--rl)', padding: '1rem 1.25rem', marginBottom: '1.5rem',
            }}>
              <div style={{ fontSize: '.62rem', fontWeight: 700, color: '#9b7cf6', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '.5rem' }}>
                Syntynyt ideasta
              </div>
              {seeds.map(seed => {
                const stg = stageColor(seed.stage);
                return (
                  <Link
                    key={seed.id}
                    href={`/${orgSlug}/muistiinpanot-projekti`}
                    style={{
                      display: 'block', textDecoration: 'none',
                      padding: '.6rem .8rem', marginTop: '.35rem',
                      background: 'var(--card)', border: '1px solid var(--border)',
                      borderRadius: 'var(--r)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem', marginBottom: '.2rem' }}>
                      <span style={{
                        fontFamily: 'var(--font-display), Georgia, serif',
                        fontSize: '.85rem', fontWeight: 600, color: 'var(--t1)',
                      }}>
                        {seed.title || 'Nimetön idea'}
                      </span>
                      <span style={{
                        fontSize: '.56rem', padding: '.08rem .35rem', borderRadius: 9999, fontWeight: 700,
                        background: stg.bg, color: stg.fg,
                        textTransform: 'uppercase', letterSpacing: '.04em',
                      }}>
                        {stageLabel(seed.stage)}
                      </span>
                      <span style={{ fontSize: '.65rem', color: 'var(--t3)', marginLeft: 'auto' }}>
                        {seed.ownerName}
                      </span>
                    </div>
                    {seed.sourceQuestion && (
                      <div style={{ fontSize: '.72rem', fontStyle: 'italic', color: '#9b7cf6', fontFamily: 'var(--font-display), Georgia, serif', marginBottom: '.2rem' }}>
                        "{seed.sourceQuestion}"
                      </div>
                    )}
                    {seed.content && (
                      <div style={{ fontSize: '.75rem', color: 'var(--t2)', lineHeight: 1.55, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                        {seed.content.slice(0, 200)}{seed.content.length > 200 ? '…' : ''}
                      </div>
                    )}
                  </Link>
                );
              })}
            </div>
          );
        })()}

        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '1.5rem', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '.88rem', fontWeight: 500, textTransform: 'uppercase' }}>Tehtävät</h3>
            {selected.tasks.length > 0 && <span style={{ fontSize: '.75rem', color: 'var(--t3)' }}>{progress}% valmis</span>}
          </div>
          {progress > 0 && <div style={{ height: 4, background: 'var(--bg)', borderRadius: 2, marginBottom: '1rem', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: progress + '%', background: progress === 100 ? 'var(--green)' : 'var(--pri)', borderRadius: 2, transition: 'width .3s' }} />
          </div>}
          {(selected.tasks || []).map((task, i) => {
            const taskDlc = task.deadline ? deadlineColor(task.deadline) : null;
            const st = effectiveStatus(task);
            const sc = statusColor(st);
            const isMineToAnswer = task.assignee === myName && st === 'pending';
            const isRejected = st === 'rejected';
            return (
              <div key={task.id} style={{
                padding: '.75rem', background: 'var(--elev)',
                border: `1px solid ${isRejected ? 'rgba(239,68,68,.35)' : 'var(--border)'}`,
                borderLeft: `3px solid ${isRejected ? 'var(--red)' : st === 'pending' ? 'var(--yellow)' : 'transparent'}`,
                borderRadius: 'var(--r)', marginBottom: '.5rem',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem' }}>
                  <input type="checkbox" checked={task.done} disabled={st !== 'accepted'} onChange={() => {
                    const tasks = [...selected.tasks]; tasks[i] = { ...tasks[i], done: !tasks[i].done }; updateProject(selected.id, { tasks });
                  }} />
                  <span style={{ flex: 1, fontSize: '.85rem', textDecoration: task.done ? 'line-through' : 'none', color: task.done ? 'var(--t3)' : 'var(--t1)' }}>{task.text}</span>
                  {st !== 'accepted' && (
                    <span style={{ fontSize: '.58rem', padding: '.15rem .45rem', borderRadius: 9999, background: sc.bg, color: sc.fg, fontWeight: 700, textTransform: 'uppercase' }}>
                      {statusLabel(st)}
                    </span>
                  )}
                  <button className="btn btn-ghost btn-sm" onClick={() => {
                    updateProject(selected.id, { tasks: selected.tasks.filter((_, j) => j !== i) });
                  }} style={{ color: 'var(--t3)', fontSize: '.7rem' }}>{'×'}</button>
                </div>
                <div style={{ display: 'flex', gap: '.5rem', marginTop: '.5rem', marginLeft: '1.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <select className="input" value={task.assignee || ''} onChange={e => {
                    const tasks = [...selected.tasks];
                    const newAssignee = e.target.value;
                    const oldAssignee = tasks[i].assignee || '';
                    if (newAssignee !== oldAssignee) {
                      const delegation = buildAssignment(newAssignee || undefined, myName);
                      tasks[i] = { ...tasks[i], assignee: newAssignee, ...delegation };
                    } else {
                      tasks[i] = { ...tasks[i], assignee: newAssignee };
                    }
                    updateProject(selected.id, { tasks });
                  }} style={{ fontSize: '.72rem', padding: '.25rem .4rem', width: 'auto', minWidth: 120, background: 'var(--card)' }}>
                    <option value="">Ei tekijää</option>
                    {teamData.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                  </select>
                  <input type="date" className="input" value={task.deadline || ''} onChange={e => {
                    const tasks = [...selected.tasks]; tasks[i] = { ...tasks[i], deadline: e.target.value }; updateProject(selected.id, { tasks });
                  }} style={{ fontSize: '.72rem', padding: '.25rem .4rem', width: 'auto', background: 'var(--card)' }} />
                  {taskDlc && <span style={{ fontSize: '.62rem', padding: '.15rem .4rem', borderRadius: 9999, background: taskDlc.bg, color: taskDlc.color, fontWeight: 600 }}>{taskDlc.label}</span>}
                  {task.assignedBy && task.assignee && task.assignedBy !== task.assignee && (
                    <span style={{ fontSize: '.62rem', padding: '.15rem .4rem', borderRadius: 9999, background: 'rgba(5,107,159,.1)', color: 'var(--pri-l)', fontWeight: 600 }}>
                      {task.assignedBy} {'->'} {task.assignee}
                    </span>
                  )}
                  {isRejected && task.rejectReason && (
                    <span style={{ fontSize: '.62rem', color: 'var(--red)' }}>Hylätty: {task.rejectReason}</span>
                  )}
                  {isMineToAnswer && (
                    <>
                      <button className="btn btn-sm" onClick={() => {
                        const tasks = [...selected.tasks]; tasks[i] = acceptAssignment(tasks[i]); updateProject(selected.id, { tasks });
                      }} style={{ background: 'var(--green)', color: '#fff', fontSize: '.68rem', padding: '.25rem .55rem' }}>Hyväksy</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => {
                        const reason = window.prompt('Miksi et voi ottaa tehtävää?') || '';
                        const tasks = [...selected.tasks]; tasks[i] = rejectAssignment(tasks[i], reason, myName); updateProject(selected.id, { tasks });
                      }} style={{ color: 'var(--red)', fontSize: '.68rem', padding: '.25rem .55rem' }}>Hylkää</button>
                    </>
                  )}
                  {isRejected && (
                    <select className="input" defaultValue="" onChange={e => {
                      if (!e.target.value) return;
                      const tasks = [...selected.tasks]; tasks[i] = reassign(tasks[i], e.target.value, myName); updateProject(selected.id, { tasks });
                    }} style={{ fontSize: '.68rem', padding: '.25rem .4rem', width: 'auto' }}>
                      <option value="">Jaa uudelleen...</option>
                      {teamData.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                    </select>
                  )}
                </div>
              </div>
            );
          })}
          <form onSubmit={e => {
            e.preventDefault();
            const f = e.target as any;
            if (!f.taskInput.value.trim()) return;
            const assigneeVal = f.taskAssignee?.value || '';
            const delegation = buildAssignment(assigneeVal || undefined, myName);
            updateProject(selected.id, { tasks: [...(selected.tasks || []), {
              id: Date.now(), text: f.taskInput.value.trim(), done: false,
              assignee: assigneeVal,
              deadline: f.taskDeadline?.value || '',
              ...delegation,
            }] });
            f.taskInput.value = ''; if (f.taskDeadline) f.taskDeadline.value = ''; if (f.taskAssignee) f.taskAssignee.selectedIndex = 0;
          }} style={{ marginTop: '.75rem' }}>
            <div style={{ display: 'flex', gap: '.5rem', marginBottom: '.5rem' }}>
              <input name="taskInput" className="input" placeholder="Lisää tehtävä..." style={{ flex: 1 }} />
              <button type="submit" className="btn btn-primary btn-sm">Lisää</button>
            </div>
            <div style={{ display: 'flex', gap: '.5rem' }}>
              <select name="taskAssignee" className="input" style={{ fontSize: '.78rem', width: 'auto', minWidth: 140 }}>
                <option value="">Tekijä (valinnainen)</option>
                {teamData.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
              </select>
              <input name="taskDeadline" type="date" className="input" style={{ fontSize: '.78rem', width: 'auto' }} />
            </div>
          </form>
        </div>

        {/* Drive-liitteet */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '1.5rem', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '.88rem', fontWeight: 500, textTransform: 'uppercase' }}>
              Drive-liitteet ({(selected.driveAttachments || []).length})
            </h3>
            {driveStatus.connected ? (
              <button className="btn btn-ghost btn-sm" onClick={() => setDrivePickerOpen(true)}>+ Liitä Drivesta</button>
            ) : (
              <Link href={`/${orgSlug}/settings`} style={{ fontSize: '.7rem', color: 'var(--t3)' }}>Yhdistä Drive ↗</Link>
            )}
          </div>
          {(selected.driveAttachments || []).length === 0 ? (
            <p style={{ fontSize: '.78rem', color: 'var(--t3)' }}>Ei liitteitä. Liitä tiedostoja Drivesta yllä olevasta napista.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
              {(selected.driveAttachments || []).map(att => (
                <div key={att.id} style={{
                  display: 'flex', alignItems: 'center', gap: '.6rem',
                  padding: '.55rem .75rem', background: 'var(--elev)',
                  border: '1px solid var(--border)', borderRadius: 'var(--r)',
                }}>
                  {att.iconUrl ? (
                    <img src={att.iconUrl} alt="" style={{ width: 18, height: 18, flexShrink: 0 }} />
                  ) : (
                    <span style={{ width: 18, height: 18, flexShrink: 0 }} aria-hidden />
                  )}
                  <a href={att.url} target="_blank" rel="noopener noreferrer"
                    style={{ flex: 1, fontSize: '.85rem', color: 'var(--t1)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {att.name}
                  </a>
                  <span style={{ fontSize: '.65rem', color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                    {att.mimeType.includes('document') ? 'Doc' : att.mimeType.includes('spreadsheet') ? 'Sheet' : att.mimeType.includes('presentation') ? 'Slide' : att.mimeType.includes('image/') ? 'Kuva' : att.mimeType.includes('video/') ? 'Video' : att.mimeType.includes('pdf') ? 'PDF' : 'Tiedosto'}
                  </span>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => updateProject(selected.id, { driveAttachments: (selected.driveAttachments || []).filter(a => a.id !== att.id) })}
                    title="Poista liite"
                    style={{ padding: '.2rem .5rem', fontSize: '.7rem', color: 'var(--t3)' }}
                  >×</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <DrivePicker
          mode="file"
          multi
          open={drivePickerOpen}
          setOpen={setDrivePickerOpen}
          onPick={(items: PickedItem[]) => {
            if (items.length === 0) return;
            const newAttachments: DriveAttachment[] = items
              .filter(it => !it.isFolder)
              .map(it => ({
                id: it.id,
                name: it.name,
                mimeType: it.mimeType,
                url: it.url,
                iconUrl: it.iconUrl,
                thumbnailUrl: it.thumbnailUrl,
                addedAt: Date.now(),
              }));
            const existing = selected.driveAttachments || [];
            const existingIds = new Set(existing.map(a => a.id));
            const merged = [...existing, ...newAttachments.filter(a => !existingIds.has(a.id))];
            updateProject(selected.id, { driveAttachments: merged });
            toast(`${newAttachments.length} liite${newAttachments.length === 1 ? '' : 'ttä'} lisätty`, 'success');
          }}
        />

        {(() => {
          const uid = user?.uid || '';
          const notesForProject = projectNotes
            .filter(n => !n.deletedAt && n.projectIds.includes(selected.id) && canViewNote(n, uid))
            .sort((a, b) => b.updatedAt - a.updatedAt);
          return (
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '1.5rem', marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '.88rem', fontWeight: 500, textTransform: 'uppercase' }}>
                  Muistiinpanot ({notesForProject.length})
                </h3>
                <div style={{ display: 'flex', gap: '.4rem' }}>
                  <Link
                    href={`/${orgSlug}/muistiinpanot-projekti?project=${selected.id}`}
                    className="btn btn-ghost btn-sm"
                    style={{ fontSize: '.7rem', textDecoration: 'none' }}
                  >
                    Näytä kaikki
                  </Link>
                  <Link
                    href={`/${orgSlug}/muistiinpanot-projekti?project=${selected.id}`}
                    className="btn btn-primary btn-sm"
                    style={{ fontSize: '.7rem', textDecoration: 'none' }}
                  >
                    + Luo
                  </Link>
                </div>
              </div>
              {notesForProject.length === 0 ? (
                <p style={{ fontSize: '.8rem', color: 'var(--t3)', fontStyle: 'italic' }}>
                  Ei muistiinpanoja tähän projektiin. Luo ensimmäinen ylhäältä tai avaa muistiinpanot-sivu.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
                  {notesForProject.slice(0, 5).map(n => {
                    const stg = stageColor(n.stage);
                    return (
                      <Link
                        key={n.id}
                        href={`/${orgSlug}/muistiinpanot-projekti?project=${selected.id}`}
                        style={{
                          display: 'block', textDecoration: 'none',
                          padding: '.6rem .8rem',
                          background: 'var(--elev)', border: '1px solid var(--border)',
                          borderLeft: `3px solid ${stg.fg}`,
                          borderRadius: 'var(--r)',
                        }}
                      >
                        <div style={{ display: 'flex', gap: '.4rem', alignItems: 'center', marginBottom: '.15rem', flexWrap: 'wrap' }}>
                          <span style={{
                            fontSize: '.56rem', padding: '.1rem .35rem', borderRadius: 9999, fontWeight: 700,
                            background: stg.bg, color: stg.fg,
                            textTransform: 'uppercase', letterSpacing: '.04em',
                          }}>
                            {stageLabel(n.stage)}
                          </span>
                          <span style={{ fontFamily: 'var(--font-display), Georgia, serif', fontSize: '.85rem', fontWeight: 600, color: 'var(--t1)' }}>
                            {n.title || 'Nimetön'}
                          </span>
                          <span style={{ fontSize: '.65rem', color: 'var(--t3)', marginLeft: 'auto' }}>
                            {n.ownerName}
                          </span>
                        </div>
                        {n.sourceQuestion && (
                          <div style={{ fontSize: '.68rem', fontStyle: 'italic', color: '#9b7cf6', fontFamily: 'var(--font-display), Georgia, serif', marginBottom: '.15rem' }}>
                            "{n.sourceQuestion}"
                          </div>
                        )}
                        {n.content && (
                          <div style={{ fontSize: '.72rem', color: 'var(--t2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {n.content.slice(0, 140)}
                          </div>
                        )}
                      </Link>
                    );
                  })}
                  {notesForProject.length > 5 && (
                    <Link
                      href={`/${orgSlug}/muistiinpanot-projekti?project=${selected.id}`}
                      style={{ fontSize: '.72rem', color: 'var(--pri)', textDecoration: 'none', marginTop: '.25rem' }}
                    >
                      Näytä kaikki {notesForProject.length} muistiinpanoa →
                    </Link>
                  )}
                </div>
              )}
            </div>
          );
        })()}

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
      </>
    );
  }

  if (mode === 'new') {
    return (
      <>
        <button className="btn btn-ghost" onClick={() => setMode('kanban')} style={{ marginBottom: '1rem' }}>{'←'} Takaisin</button>
        <div style={{ maxWidth: 560, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)', padding: '2rem' }}>
          <div className="field"><label>Projektin nimi *</label><input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="Esim. Kevään somekampanja" autoFocus /></div>
          {showClientField && (
            <div className="field">
              <label>Asiakas (valinnainen)</label>
              <input
                className="input"
                value={newClientName}
                onChange={e => setNewClientName(e.target.value)}
                placeholder="Esim. Esimerkki Oy — jätä tyhjäksi sisäisille töille"
                list="hetki-known-clients"
              />
              {knownClients.length > 0 && (
                <datalist id="hetki-known-clients">
                  {knownClients.map(c => <option key={c} value={c} />)}
                </datalist>
              )}
            </div>
          )}
          <div className="field"><label>Kuvaus</label><textarea className="input textarea" value={desc} onChange={e => setDesc(e.target.value)} placeholder="Kuvaile projektia..." /></div>
          {!fixedTeamId && orgTeams.length > 0 && (
            <div className="field">
              <label>Tiimi {orgTeams.length > 0 ? '*' : '(valinnainen)'}</label>
              <div style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap' }}>
                {orgTeams.map(t => {
                  const isActive = newTeamId === t.id;
                  return (
                    <button key={t.id} type="button" onClick={() => setNewTeamId(t.id)} style={{
                      fontSize: '.72rem', padding: '.45rem .75rem', borderRadius: 9999,
                      background: isActive ? t.color : 'var(--elev)',
                      color: isActive ? '#fff' : 'var(--t2)',
                      border: `1px solid ${isActive ? t.color : 'var(--border)'}`,
                      fontWeight: 600, cursor: 'pointer',
                      display: 'inline-flex', alignItems: 'center', gap: '.35rem',
                    }}>
                      <span style={{ fontSize: '.88rem', lineHeight: 1 }}>{t.icon}</span>
                      {t.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div className="field">
            <label>Vuosikellon vaihe (valinnainen)</label>
            <select className="input" value={newPhaseId} onChange={e => setNewPhaseId(e.target.value)}>
              <option value="">Ei linkitettyä vaihetta</option>
              {phases.map(ph => (
                <option key={ph.id} value={ph.id}>{ph.name}</option>
              ))}
            </select>
          </div>
          <div className="field"><label>Deadline</label><input type="date" className="input" value={deadline} onChange={e => setDeadline(e.target.value)} style={{ maxWidth: 200 }} /></div>
          <button className="btn btn-primary" onClick={createProject} disabled={!title.trim() || (!fixedTeamId && orgTeams.length > 0 && !newTeamId)}>Luo projekti</button>
        </div>
      </>
    );
  }

  const currentTeam = orgTeams.find(t => t.id === effectiveFilter);

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '.5rem' }}>
        <button className="btn btn-primary" onClick={() => setMode('new')}>+ Uusi projekti{currentTeam ? ` (${currentTeam.name})` : ''}</button>
        {archived.length > 0 && <button className="btn btn-ghost btn-sm" onClick={() => setShowArchive(!showArchive)}>{showArchive ? 'Piilota arkisto' : `Arkisto (${archived.length})`}</button>}
      </div>

      {/* Asiakas-suodatin (vain Hetki Company) */}
      {showClientField && (
        <div style={{ display: 'flex', gap: '.4rem', marginBottom: '.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: '.66rem', color: 'var(--t3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', marginRight: '.25rem' }}>Asiakas</span>
          <button onClick={() => setClientFilter('all')} style={{
            fontSize: '.72rem', padding: '.35rem .65rem', borderRadius: 9999,
            background: clientFilter === 'all' ? 'var(--t1)' : 'var(--elev)',
            color: clientFilter === 'all' ? 'var(--bg)' : 'var(--t2)',
            border: '1px solid var(--border)', fontWeight: 600, cursor: 'pointer',
          }}>Kaikki</button>
          {knownClients.map(c => {
            const isActive = clientFilter === c;
            const count = activeProjects.filter(p => !p.archived && (p.clientName || '').trim() === c).length;
            return (
              <button key={c} onClick={() => setClientFilter(c)} style={{
                fontSize: '.72rem', padding: '.35rem .65rem', borderRadius: 9999,
                background: isActive ? 'var(--pri)' : 'var(--elev)',
                color: isActive ? '#fff' : 'var(--t2)',
                border: `1px solid ${isActive ? 'var(--pri)' : 'var(--border)'}`,
                fontWeight: 600, cursor: 'pointer',
              }}>{c} ({count})</button>
            );
          })}
          {(() => {
            const noneCount = activeProjects.filter(p => !p.archived && !(p.clientName || '').trim()).length;
            if (noneCount === 0) return null;
            const isActive = clientFilter === '__none__';
            return (
              <button onClick={() => setClientFilter('__none__')} style={{
                fontSize: '.72rem', padding: '.35rem .65rem', borderRadius: 9999,
                background: isActive ? 'var(--t2)' : 'var(--elev)',
                color: isActive ? 'var(--bg)' : 'var(--t3)',
                border: `1px solid ${isActive ? 'var(--t2)' : 'var(--border)'}`,
                fontWeight: 600, cursor: 'pointer', fontStyle: 'italic',
              }}>Sisäinen ({noneCount})</button>
            );
          })()}
        </div>
      )}

      {/* Team filter chips — hidden when parent forces a team */}
      {!fixedTeamId && (
        <div style={{ display: 'flex', gap: '.4rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
          <button onClick={() => setTeamFilter('all')} style={{
            fontSize: '.72rem', padding: '.4rem .75rem', borderRadius: 9999,
            background: teamFilter === 'all' ? 'var(--t1)' : 'var(--elev)',
            color: teamFilter === 'all' ? 'var(--bg)' : 'var(--t2)',
            border: '1px solid var(--border)', fontWeight: 600, cursor: 'pointer',
          }}>Kaikki tiimit ({activeProjects.filter(p => !p.archived).length})</button>
          {orgTeams.map(t => {
            const count = activeProjects.filter(p => !p.archived && p.teamId === t.id).length;
            const isActive = teamFilter === t.id;
            return (
              <button key={t.id} onClick={() => setTeamFilter(t.id)} style={{
                fontSize: '.72rem', padding: '.4rem .75rem', borderRadius: 9999,
                background: isActive ? t.color : 'var(--elev)',
                color: isActive ? '#fff' : 'var(--t2)',
                border: `1px solid ${isActive ? t.color : 'var(--border)'}`,
                fontWeight: 600, cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: '.35rem',
              }}>
                <span style={{ fontSize: '.88rem', lineHeight: 1 }}>{t.icon}</span>
                {t.name} ({count})
              </button>
            );
          })}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: '1rem' }}>
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
                  const projectTeam = p.teamId ? orgTeams.find(t => t.id === p.teamId) : null;
                  const projectPhase = p.phaseId ? phases.find(ph => ph.id === p.phaseId) : null;
                  return (
                    <div key={p.id} draggable onDragStart={() => setDragItem(p.id)}
                      onClick={() => { setSelectedId(p.id); setMode('detail'); }}
                      style={{
                        background: 'var(--elev)', border: '1px solid var(--border)',
                        borderLeft: projectTeam ? `3px solid ${projectTeam.color}` : '1px solid var(--border)',
                        borderRadius: 'var(--r)', padding: '.85rem', cursor: 'pointer', transition: 'border-color .15s',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--pri)')} onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem', marginBottom: '.35rem' }}>
                        {(p.tasks || []).length > 0 && (
                          <button
                            onClick={e => { e.stopPropagation(); toggleExpanded(p.id); }}
                            title={expanded.has(p.id) ? 'Piilota tehtavat' : 'Nayta tehtavat'}
                            style={{
                              background: 'transparent', border: 'none', cursor: 'pointer',
                              color: 'var(--t3)', fontSize: '.7rem', lineHeight: 1,
                              padding: '2px 4px', display: 'inline-flex', alignItems: 'center',
                              transform: expanded.has(p.id) ? 'rotate(90deg)' : 'rotate(0deg)',
                              transition: 'transform .15s',
                            }}
                          >▶</button>
                        )}
                        <div style={{ fontSize: '.85rem', fontWeight: 600, flex: 1 }}>{p.t}</div>
                        {(p.tasks || []).length > 0 && (
                          <span style={{ fontSize: '.6rem', color: 'var(--t3)', fontWeight: 600 }}>
                            {(p.tasks || []).filter(t => t.done).length}/{(p.tasks || []).length}
                          </span>
                        )}
                      </div>
                      {projectTeam && !fixedTeamId && (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '.25rem', marginBottom: '.35rem', marginRight: '.3rem' }}>
                          <span style={{ fontSize: '.58rem', padding: '.12rem .4rem', borderRadius: 9999, background: `${projectTeam.color}20`, color: projectTeam.color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                            {projectTeam.icon} {projectTeam.name}
                          </span>
                        </div>
                      )}
                      {showClientField && (p.clientName || '').trim() && (
                        <div style={{ display: 'inline-flex', alignItems: 'center', marginBottom: '.35rem', marginRight: '.3rem' }}>
                          <span style={{ fontSize: '.58rem', padding: '.12rem .4rem', borderRadius: 9999, background: 'rgba(155,124,246,.12)', color: '#9b7cf6', fontWeight: 700, letterSpacing: '.03em' }}>
                            ◆ {p.clientName}
                          </span>
                        </div>
                      )}
                      {projectPhase && (
                        <div style={{ fontSize: '.6rem', color: 'var(--t3)', marginBottom: '.35rem' }}>
                          {'·'} Vaihe: {projectPhase.name}
                        </div>
                      )}
                      {dlc && <div style={{ fontSize: '.65rem', padding: '.15rem .4rem', borderRadius: 9999, background: dlc.bg, color: dlc.color, fontWeight: 600, display: 'inline-block', marginBottom: '.35rem' }}>{dlc.label}</div>}
                      {prog > 0 && <div style={{ height: 3, background: 'var(--bg)', borderRadius: 2, overflow: 'hidden', marginBottom: '.35rem' }}><div style={{ height: '100%', width: prog + '%', background: prog === 100 ? 'var(--green)' : 'var(--pri)', borderRadius: 2 }} /></div>}
                      {(() => { const assignees = [...new Set((p.tasks || []).filter(t => t.assignee).map(t => t.assignee))]; return assignees.length > 0 ? (
                        <div style={{ display: 'flex', gap: '.2rem', flexWrap: 'wrap', marginBottom: '.35rem' }}>
                          {assignees.slice(0, 3).map((a, ai) => <span key={ai} style={{ fontSize: '.58rem', padding: '.1rem .35rem', borderRadius: 9999, background: 'rgba(5,107,159,.1)', color: 'var(--pri-l)', fontWeight: 600 }}>{a}</span>)}
                          {assignees.length > 3 && <span style={{ fontSize: '.58rem', color: 'var(--t3)' }}>+{assignees.length - 3}</span>}
                        </div>
                      ) : null; })()}
                      {expanded.has(p.id) && (p.tasks || []).length > 0 && (
                        <div
                          onClick={e => e.stopPropagation()}
                          style={{
                            marginTop: '.5rem', paddingTop: '.5rem',
                            borderTop: '1px dashed var(--border)',
                            display: 'flex', flexDirection: 'column', gap: '.25rem',
                          }}
                        >
                          {(p.tasks || []).map((task, ti) => {
                            const tdlc = task.deadline ? deadlineColor(task.deadline) : null;
                            return (
                              <div key={task.id} style={{
                                display: 'flex', alignItems: 'center', gap: '.4rem',
                                padding: '.3rem .4rem', background: 'var(--card)',
                                border: '1px solid var(--border)', borderRadius: 'var(--r)',
                                fontSize: '.72rem',
                              }}>
                                <input
                                  type="checkbox"
                                  checked={task.done}
                                  onChange={e => {
                                    e.stopPropagation();
                                    const newTasks = [...(p.tasks || [])];
                                    newTasks[ti] = { ...newTasks[ti], done: !newTasks[ti].done };
                                    updateProject(p.id, { tasks: newTasks });
                                  }}
                                  onClick={e => e.stopPropagation()}
                                  style={{ flexShrink: 0 }}
                                />
                                <span style={{
                                  flex: 1, minWidth: 0,
                                  textDecoration: task.done ? 'line-through' : 'none',
                                  color: task.done ? 'var(--t3)' : 'var(--t1)',
                                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                }}>{task.text}</span>
                                {task.assignee && (
                                  <span style={{
                                    fontSize: '.58rem', padding: '.1rem .35rem', borderRadius: 9999,
                                    background: 'rgba(5,107,159,.1)', color: 'var(--pri-l)',
                                    fontWeight: 600, flexShrink: 0,
                                  }}>{task.assignee}</span>
                                )}
                                {tdlc && (
                                  <span style={{
                                    fontSize: '.58rem', padding: '.1rem .35rem', borderRadius: 9999,
                                    background: tdlc.bg, color: tdlc.color, fontWeight: 600,
                                    flexShrink: 0,
                                  }}>{tdlc.label}</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '.2rem' }}>
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
    </>
  );
}
