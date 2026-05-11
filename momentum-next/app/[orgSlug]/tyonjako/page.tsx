'use client';

import { useMemo, useState } from 'react';
import AppShell from '@/components/AppShell';
import { useOrgData } from '@/lib/firestore';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { useParams } from 'next/navigation';
import { getOrgTeamMembers, getOrgTeams, getGrantsKey } from '@/lib/org-defaults';
import { OrgTeam, OrgTeamMember, uniqueMembersByName, resolveUserMember } from '@/lib/team-shared';
import {
  Assignable,
  acceptAssignment, rejectAssignment, reassign, markDone,
  statusLabel, statusColor, buildAssignment,
  addAssignee, removeAssignee, setAssigneesAction,
} from '@/lib/assignments-shared';
import {
  WorkItem, CapacityRow, CapacityStatus,
  StandaloneTaskLike, ProjectLike,
  buildWorkItems, computeCapacity, getUnassigned, getNoDeadline,
  daysUntilDeadline, isOverdue, deadlineQuickOptions, ACTIVE_WINDOW_DAYS,
} from '@/lib/workload-shared';
import { Grant } from '@/lib/grants-shared';
import TaskNetworkGraph, { UnifiedTask as GraphUnifiedTask, GraphProjectShape } from '@/components/sections/TaskNetworkGraph';
import LinkifiedText from '@/components/LinkifiedText';

type Tab = 'capacity' | 'inbox' | 'given' | 'graph';

const STATUS_UI: Record<CapacityStatus, { label: string; color: string; bg: string; bar: string }> = {
  free:       { label: 'Vapaa kapasiteettia', color: '#22c55e', bg: 'rgba(34,197,94,.12)',  bar: '#22c55e' },
  light:      { label: 'Kevyt',                 color: '#56a8e0', bg: 'rgba(86,168,224,.12)', bar: '#56a8e0' },
  normal:     { label: 'Normaali',              color: '#f5c542', bg: 'rgba(245,197,66,.12)', bar: '#f5c542' },
  overloaded: { label: 'LIIKAA TÖITÄ — jaa muille', color: '#ef4444', bg: 'rgba(239,68,68,.12)', bar: '#ef4444' },
};

export default function TyönjakoPage() {
  const { user, canEdit } = useAuth();
  const { toast } = useToast();
  const params = useParams();
  const orgSlug = (params.orgSlug as string) || '';

  // --- Data ---
  const [tasks, setTasks] = useOrgData<StandaloneTaskLike[]>('tasks', []);
  const [projects, setProjects] = useOrgData<ProjectLike[]>('projects', []);
  const [grants, setGrants] = useOrgData<Grant[]>(getGrantsKey(orgSlug), []);
  const [membersRaw] = useOrgData<OrgTeamMember[]>('orgTeamMembers', getOrgTeamMembers(orgSlug));
  const members = useMemo(() => uniqueMembersByName(membersRaw), [membersRaw]);
  const [orgTeams] = useOrgData<OrgTeam[]>('orgTeams', getOrgTeams(orgSlug));

  const myMember = useMemo(() => resolveUserMember(members, user), [members, user]);
  const myName = myMember?.name || user?.displayName || '';
  const iAmManager = !!myMember?.isManager;

  const items = useMemo(() => buildWorkItems(tasks, projects, grants), [tasks, projects, grants]);
  const capacity = useMemo(() => computeCapacity(members, items), [members, items]);
  const unassigned = useMemo(() => getUnassigned(items), [items]);
  const noDeadlineItems = useMemo(() => getNoDeadline(items), [items]);

  // Saapuneet = jonkun MUUN antamia ja odottavat hyvaksyntaa.
  // Itse itselleen + jollekin muulle annetut tehtavat eivat tule taanne — niiden
  // status on toki pending mutta antajakin olen mina, joten ei "saapuneita".
  const pendingForMe = useMemo(
    () => items.filter(i =>
      i.assignees.includes(myName)
      && i.status === 'pending'
      && !i.done
      && i.assignedBy !== myName
    ),
    [items, myName]
  );
  const givenByMe = useMemo(
    () => items.filter(i => i.assignedBy === myName && !(i.assignees.length === 1 && i.assignees[0] === myName)),
    [items, myName]
  );
  const rejectedFromMe = givenByMe.filter(i => i.status === 'rejected');
  const badge = pendingForMe.length + rejectedFromMe.length;

  // --- UI state ---
  const [tab, setTab] = useState<Tab>('capacity');
  const [sortBy, setSortBy] = useState<'team' | 'load'>('team');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [quickAddFor, setQuickAddFor] = useState<string | null>(null); // member.name
  const [showAllUnassigned, setShowAllUnassigned] = useState(false);

  const toggleExpand = (id: string) => setExpanded(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  // --- Write helpers ---
  const updateItem = (item: WorkItem, fn: <T extends Assignable & { done?: boolean }>(t: T) => T) => {
    if (item.kind === 'task') {
      setTasks(prev => prev.map(x => x.id === item.sourceId ? (fn(x) as StandaloneTaskLike) : x));
    } else if (item.kind === 'project-task') {
      setProjects(prev => prev.map(p => {
        if (p.id !== item.projectId) return p;
        return { ...p, tasks: (p.tasks || []).map(t => t.id === item.sourceId ? fn(t) : t) };
      }));
    } else {
      setGrants(prev => prev.map(g => {
        if (g.id !== item.grantId) return g;
        return { ...g, subtasks: (g.subtasks || []).map(s => s.id === item.sourceId ? fn(s) : s) };
      }));
    }
  };

  const onAccept = (item: WorkItem) => {
    updateItem(item, acceptAssignment);
    toast('Tehtävä hyväksytty', 'success');
  };
  const onReject = (item: WorkItem) => {
    const reason = window.prompt('Miksi et voi ottaa tehtävää?') || '';
    updateItem(item, (t) => rejectAssignment(t, reason, myName));
    toast('Tehtävä hylätty', 'success');
  };
  const onReassign = (item: WorkItem, newAssignee: string) => {
    updateItem(item, (t) => reassign(t, newAssignee, myName));
    toast('Tehtävä jaettu uudelleen', 'success');
  };
  const onAddAssignee = (item: WorkItem, name: string) => {
    if (!name || item.assignees.includes(name)) return;
    updateItem(item, (t) => addAssignee(t, name, myName));
    toast('Tekijä lisätty', 'success');
  };
  const onRemoveAssignee = (item: WorkItem, name: string) => {
    updateItem(item, (t) => removeAssignee(t, name));
    toast('Tekijä poistettu', 'success');
  };
  const onToggleDone = (item: WorkItem) => {
    updateItem(item, (t) => markDone(t as any, !item.done));
  };

  // Päivitä yksittäisiä kenttiä (esim. deadline) ilman delegointilogiikkaa.
  const updateItemField = (item: WorkItem, patch: Record<string, any>) => {
    if (item.kind === 'task') {
      setTasks(prev => prev.map(x => x.id === item.sourceId ? ({ ...x, ...patch } as StandaloneTaskLike) : x));
    } else if (item.kind === 'project-task') {
      setProjects(prev => prev.map(p => {
        if (p.id !== item.projectId) return p;
        return { ...p, tasks: (p.tasks || []).map(t => t.id === item.sourceId ? { ...t, ...patch } : t) };
      }));
    } else {
      setGrants(prev => prev.map(g => {
        if (g.id !== item.grantId) return g;
        return { ...g, subtasks: (g.subtasks || []).map(s => s.id === item.sourceId ? { ...s, ...patch } : s) };
      }));
    }
  };

  const onEditDeadline = (item: WorkItem, newDeadline: string) => {
    updateItemField(item, { deadline: newDeadline || undefined });
  };

  // Uusi projekti -luonti
  const [showNewProject, setShowNewProject] = useState(false);
  const createProject = (opts: { t: string; d?: string; teamId?: string; deadline?: string }) => {
    const exists = (projects || []).some(p => p.t.toLowerCase() === opts.t.toLowerCase());
    if (exists) { toast('Samanniminen projekti on jo olemassa', 'error'); return; }
    const p: any = {
      id: Date.now(),
      t: opts.t.trim(),
      d: (opts.d || '').trim(),
      st: 'idea',
      deadline: opts.deadline || '',
      team: [],
      comments: [],
      tasks: [],
      archived: false,
      createdAt: Date.now(),
      teamId: opts.teamId || undefined,
    };
    setProjects(prev => [...(prev || []), p]);
    setShowNewProject(false);
    toast('Projekti luotu', 'success');
  };

  // Raahaa jakamaton → henkilölle
  const [draggedUnassigned, setDraggedUnassigned] = useState<WorkItem | null>(null);

  // Quick add -käsittely
  const quickAdd = (opts: {
    type: 'task' | 'project-task' | 'grant-subtask';
    text: string;
    deadline: string;
    assignees: string[];
    projectId?: number;
    grantId?: string;
  }) => {
    const { type, text, deadline, assignees } = opts;
    const delegation = buildAssignment(assignees, myName);

    if (type === 'task') {
      setTasks(prev => [...prev, {
        id: 't_' + Date.now(),
        text: text.trim(),
        done: false,
        priority: 'normal',
        deadline,
        ...delegation,
      } as StandaloneTaskLike]);
    } else if (type === 'project-task' && opts.projectId !== undefined) {
      setProjects(prev => prev.map(p => p.id === opts.projectId ? {
        ...p,
        tasks: [
          ...(p.tasks || []),
          {
            id: Date.now(),
            text: text.trim(),
            done: false,
            deadline,
            ...delegation,
          } as any,
        ],
      } : p));
    } else if (type === 'grant-subtask' && opts.grantId) {
      setGrants(prev => prev.map(g => g.id === opts.grantId ? {
        ...g,
        subtasks: [
          ...(g.subtasks || []),
          {
            id: 'gs_' + Date.now(),
            text: text.trim(),
            done: false,
            deadline,
            ...delegation,
          },
        ],
      } : g));
    }
    toast('Tehtävä lisätty', 'success');
    setQuickAddFor(null);
  };

  // --- Ryhmittely ---
  const orderedRows = useMemo(() => {
    if (sortBy === 'load') {
      const rank = (s: CapacityStatus) => s === 'overloaded' ? 0 : s === 'normal' ? 1 : s === 'light' ? 2 : 3;
      return [...capacity].sort((a, b) => {
        const r = rank(a.status) - rank(b.status);
        if (r !== 0) return r;
        return (b.overdue - a.overdue) || (b.active - a.active);
      });
    }
    // Tiimeittäin
    return [...capacity].sort((a, b) => {
      const ai = orgTeams.findIndex(t => t.id === a.member.teamId);
      const bi = orgTeams.findIndex(t => t.id === b.member.teamId);
      if (ai !== bi) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
      return a.member.name.localeCompare(b.member.name);
    });
  }, [capacity, sortBy, orgTeams]);

  const freeCount = capacity.filter(r => r.status === 'free').length;
  const overloadedCount = capacity.filter(r => r.status === 'overloaded').length;

  // Projekti-muoto graafille
  const graphProjects: GraphProjectShape[] = useMemo(() => (projects || [])
    .filter(p => !p.deletedAt && !p.archived)
    .map(p => ({ id: p.id, t: p.t, teamId: (p as any).teamId, archived: p.archived, deletedAt: p.deletedAt })),
  [projects]);

  // Graafille: muunna WorkItem → GraphUnifiedTask
  // Graafin UnifiedTask-id koostuu source + sourceId:stä jotta löydämme takaisin items-listasta callbackeissa.
  const graphTasks: GraphUnifiedTask[] = useMemo(() => items.map(i => ({
    source: i.kind === 'project-task' ? 'project' : i.kind === 'grant-subtask' ? 'grant-subtask' : 'task',
    projectId: i.projectId,
    projectName: i.projectName,
    grantId: i.grantId,
    grantName: i.grantName,
    id: i.sourceId as string | number,
    text: i.text,
    done: i.done,
    deadline: i.deadline,
    assignees: i.assignees,
    assignee: i.assignee,
    assignedBy: i.assignedBy,
    status: i.status,
    rejectReason: i.rejectReason,
    completedAt: i.completedAt,
    createdAt: i.createdAt,
  })), [items]);

  const findItemByGraphTask = (t: GraphUnifiedTask): WorkItem | undefined => {
    if (t.source === 'project') return items.find(i => i.kind === 'project-task' && i.projectId === t.projectId && i.sourceId === t.id);
    if (t.source === 'grant-subtask') return items.find(i => i.kind === 'grant-subtask' && i.grantId === t.grantId && i.sourceId === t.id);
    return items.find(i => i.kind === 'task' && i.sourceId === t.id);
  };

  // --- Render ---
  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'capacity', label: 'Kapasiteetti' },
    { key: 'inbox', label: 'Saapuneet', count: pendingForMe.length },
    { key: 'given', label: 'Antamani', count: givenByMe.length },
    { key: 'graph', label: 'Verkosto' },
  ];

  return (
    <AppShell title="Työnjako" subtitle={myName ? `${myName} · ${badge} tarvitsee huomiota` : 'Tehtävien jakaminen ja työkuormat'}>
      <div style={{ display: 'flex', gap: '.4rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        {tabs.map(t => {
          const isActive = tab === t.key;
          return (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              fontSize: '.78rem', padding: '.45rem .9rem', borderRadius: 9999,
              background: isActive ? 'var(--t1)' : 'var(--elev)',
              color: isActive ? 'var(--bg)' : 'var(--t2)',
              border: '1px solid var(--border)', fontWeight: 600, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: '.4rem',
            }}>
              {t.label}
              {typeof t.count === 'number' && t.count > 0 && (
                <span style={{
                  fontSize: '.65rem', padding: '.1rem .4rem', borderRadius: 9999,
                  background: isActive ? 'var(--bg)' : 'var(--red)',
                  color: isActive ? 'var(--t1)' : '#fff', fontWeight: 700,
                }}>{t.count}</span>
              )}
            </button>
          );
        })}
      </div>

      {tab === 'capacity' && (
        <>
          {/* Pikatoiminnot */}
          {canEdit && (
            <div style={{ display: 'flex', gap: '.5rem', marginBottom: '.85rem', flexWrap: 'wrap' }}>
              <button className="btn btn-primary btn-sm" onClick={() => setShowNewProject(true)} style={{ fontSize: '.75rem' }}>
                + Uusi projekti
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setQuickAddFor(myName || '')} style={{ fontSize: '.75rem' }}>
                + Uusi tehtävä
              </button>
            </div>
          )}

          {/* Varoitus: ilman deadlinea olevat */}
          {noDeadlineItems.length > 0 && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '.75rem',
              padding: '.75rem 1rem', borderRadius: 'var(--r)',
              background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.3)',
              marginBottom: '1rem',
            }}>
              <div style={{ fontSize: '1.1rem' }}>⚠</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '.85rem', fontWeight: 700, color: 'var(--red)' }}>
                  {noDeadlineItems.length} tehtävää ilman deadlinea
                </div>
                <div style={{ fontSize: '.72rem', color: 'var(--t3)', marginTop: '.1rem' }}>
                  Aseta deadline jokaiselle tehtävälle jotta kuorma lasketaan oikein.
                </div>
              </div>
            </div>
          )}

          {/* Jakamattomat */}
          <UnassignedSection
            items={unassigned}
            showAll={showAllUnassigned}
            onToggleShowAll={() => setShowAllUnassigned(v => !v)}
            members={members}
            myName={myName}
            canEdit={canEdit}
            onDragStart={setDraggedUnassigned}
            onDragEnd={() => setDraggedUnassigned(null)}
            onReassign={onReassign}
            onEditDeadline={onEditDeadline}
            onToggleDone={onToggleDone}
          />

          {/* Järjestys + yhteenveto */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '.75rem',
            margin: '1.5rem 0 .75rem', flexWrap: 'wrap',
          }}>
            <div style={{ fontSize: '.78rem', color: 'var(--t3)' }}>
              {(() => {
                const totalActive = capacity.reduce((s, r) => s + r.active, 0);
                const projectIds = new Set<number>();
                for (const r of capacity) {
                  for (const it of r.items) {
                    if (it.projectId !== undefined) projectIds.add(it.projectId);
                  }
                }
                return (
                  <>
                    <b style={{ color: 'var(--ink)' }}>{totalActive}</b> aktiivista tehtävää · {' '}
                    <b style={{ color: 'var(--ink)' }}>{projectIds.size}</b> projektia
                  </>
                );
              })()}
            </div>
            <span style={{ flex: 1 }} />
            <div style={{ display: 'inline-flex', gap: '.35rem', fontSize: '.72rem' }}>
              <span style={{ color: 'var(--t3)', alignSelf: 'center' }}>Järjestä:</span>
              <button onClick={() => setSortBy('team')} style={chipStyle(sortBy === 'team')}>Tiimeittäin</button>
              <button onClick={() => setSortBy('load')} style={chipStyle(sortBy === 'load')}>Kuorman mukaan</button>
            </div>
          </div>

          {/* Henkilörivit */}
          <CapacityList
            rows={orderedRows}
            sortBy={sortBy}
            orgTeams={orgTeams}
            members={members}
            capacity={capacity}
            myName={myName}
            iAmManager={iAmManager}
            canEdit={canEdit}
            expanded={expanded}
            onToggle={toggleExpand}
            onQuickAdd={(name) => setQuickAddFor(name)}
            onAccept={onAccept}
            onReject={onReject}
            onReassign={onReassign}
            onToggleDone={onToggleDone}
            onEditDeadline={onEditDeadline}
            onAddAssignee={onAddAssignee}
            onRemoveAssignee={onRemoveAssignee}
            draggedUnassigned={draggedUnassigned}
            onDropUnassigned={(target) => {
              if (draggedUnassigned) onReassign(draggedUnassigned, target.name);
              setDraggedUnassigned(null);
            }}
          />

          {/* Quick-add modal */}
          {quickAddFor && (
            <QuickAddModal
              defaultAssignee={quickAddFor}
              members={members}
              projects={projects || []}
              grants={grants || []}
              onClose={() => setQuickAddFor(null)}
              onSubmit={quickAdd}
            />
          )}

          {/* Uusi projekti -modal */}
          {showNewProject && (
            <NewProjectModal
              orgTeams={orgTeams}
              onClose={() => setShowNewProject(false)}
              onSubmit={createProject}
            />
          )}
        </>
      )}

      {tab === 'inbox' && (
        <SimpleList
          empty="Ei saapuneita tehtäviä."
          items={pendingForMe}
          canEdit={canEdit}
          onUpdateField={updateItemField}
          actions={(item) => canEdit ? (
            <>
              <button className="btn btn-sm" onClick={() => onAccept(item)} style={{ background: 'var(--green)', color: '#fff', fontSize: '.7rem' }}>Hyväksy</button>
              <button className="btn btn-ghost btn-sm" onClick={() => onReject(item)} style={{ color: 'var(--red)', fontSize: '.7rem' }}>Hylkää</button>
            </>
          ) : null}
        />
      )}

      {tab === 'given' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {rejectedFromMe.length > 0 && (
            <div>
              <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--red)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '.5rem' }}>
                Hylätyt — jaa uudelleen ({rejectedFromMe.length})
              </div>
              <SimpleList empty="" items={rejectedFromMe}
                canEdit={canEdit}
                onUpdateField={updateItemField}
                actions={(item) => canEdit ? (
                  <select className="input" defaultValue="" onChange={e => { if (e.target.value) onReassign(item, e.target.value); }}
                    style={{ fontSize: '.7rem', padding: '.25rem .4rem', width: 'auto' }}>
                    <option value="">Jaa uudelleen...</option>
                    {members.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                  </select>
                ) : null}
              />
            </div>
          )}
          {givenByMe.length === 0 && (
            <div style={emptyStyle}>Et ole antanut tehtäviä vielä.</div>
          )}
          {givenByMe.filter(i => i.status !== 'rejected').length > 0 && (
            <SimpleList empty="" items={givenByMe.filter(i => i.status !== 'rejected')}
              canEdit={canEdit}
              onUpdateField={updateItemField}
            />
          )}
        </div>
      )}

      {tab === 'graph' && (
        <TaskNetworkGraph
          members={members}
          orgTeams={orgTeams}
          projects={graphProjects}
          tasks={graphTasks}
          myName={myName}
          canEdit={canEdit}
          orgSlug={orgSlug}
          onAccept={(t) => { const found = findItemByGraphTask(t); if (found) onAccept(found); }}
          onReject={(t) => { const found = findItemByGraphTask(t); if (found) onReject(found); }}
          onReassign={(t, a) => { const found = findItemByGraphTask(t); if (found) onReassign(found, a); }}
        />
      )}
    </AppShell>
  );
}

// --- Alikomponentit ---

function chipStyle(active: boolean): React.CSSProperties {
  return {
    fontSize: '.72rem', padding: '.35rem .7rem', borderRadius: 9999,
    background: active ? 'var(--t1)' : 'var(--elev)',
    color: active ? 'var(--bg)' : 'var(--t2)',
    border: '1px solid var(--border)', fontWeight: 600, cursor: 'pointer',
  };
}

const emptyStyle: React.CSSProperties = {
  padding: '2rem', textAlign: 'center', color: 'var(--t3)', fontSize: '.9rem',
  background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)',
};

interface CapacityListProps {
  rows: CapacityRow[];
  sortBy: 'team' | 'load';
  orgTeams: OrgTeam[];
  members: OrgTeamMember[];
  capacity: CapacityRow[];
  myName: string;
  iAmManager: boolean;
  canEdit: boolean;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  onQuickAdd: (name: string) => void;
  onAccept: (i: WorkItem) => void;
  onReject: (i: WorkItem) => void;
  onReassign: (i: WorkItem, a: string) => void;
  onToggleDone: (i: WorkItem) => void;
  onEditDeadline: (i: WorkItem, d: string) => void;
  onAddAssignee: (i: WorkItem, name: string) => void;
  onRemoveAssignee: (i: WorkItem, name: string) => void;
  draggedUnassigned: WorkItem | null;
  onDropUnassigned: (target: OrgTeamMember) => void;
}

function CapacityList(props: CapacityListProps) {
  const { rows, sortBy, orgTeams } = props;
  const renderCard = (row: CapacityRow) => (
    <CapacityCard
      key={row.member.id}
      row={row}
      members={props.members}
      orgTeams={props.orgTeams}
      capacity={props.capacity}
      myName={props.myName}
      iAmManager={props.iAmManager}
      canEdit={props.canEdit}
      expanded={props.expanded.has(row.member.id)}
      onToggle={() => props.onToggle(row.member.id)}
      onQuickAdd={() => props.onQuickAdd(row.member.name)}
      onAccept={props.onAccept}
      onReject={props.onReject}
      onReassign={props.onReassign}
      onToggleDone={props.onToggleDone}
      onEditDeadline={props.onEditDeadline}
      onAddAssignee={props.onAddAssignee}
      onRemoveAssignee={props.onRemoveAssignee}
      draggedUnassigned={props.draggedUnassigned}
      onDropUnassigned={props.onDropUnassigned}
    />
  );

  if (sortBy === 'load') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
        {rows.map(renderCard)}
      </div>
    );
  }

  // Ryhmittely tiimeittäin
  const groups = new Map<string, CapacityRow[]>();
  for (const r of rows) {
    const key = r.member.teamId || '__none__';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }
  const teamById = new Map(orgTeams.map(t => [t.id, t]));
  const orderedKeys = [...orgTeams.map(t => t.id), '__none__'].filter(k => groups.has(k));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {orderedKeys.map(key => {
        const team = teamById.get(key);
        const list = groups.get(key)!;
        return (
          <div key={key}>
            <div style={{
              fontSize: '.72rem', fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '.06em', color: team?.color || 'var(--t3)',
              marginBottom: '.45rem', display: 'flex', alignItems: 'center', gap: '.5rem',
            }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: team?.color || 'var(--t3)' }} />
              {team?.name || 'Ei tiimiä'}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
              {list.map(renderCard)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Henkilökortti: avatar + nimi + kuormitustolppa + statusteksti + [+] + ▾
interface CapacityCardProps {
  row: CapacityRow;
  members: OrgTeamMember[];
  orgTeams: OrgTeam[];
  capacity: CapacityRow[];
  myName: string;
  iAmManager: boolean;
  canEdit: boolean;
  expanded: boolean;
  onToggle: () => void;
  onQuickAdd: () => void;
  onAccept: (i: WorkItem) => void;
  onReject: (i: WorkItem) => void;
  onReassign: (i: WorkItem, a: string) => void;
  onToggleDone: (i: WorkItem) => void;
  onEditDeadline: (i: WorkItem, d: string) => void;
  onAddAssignee: (i: WorkItem, name: string) => void;
  onRemoveAssignee: (i: WorkItem, name: string) => void;
  draggedUnassigned: WorkItem | null;
  onDropUnassigned: (target: OrgTeamMember) => void;
}

function CapacityCard(props: CapacityCardProps) {
  const { row, expanded, onToggle, draggedUnassigned, onDropUnassigned } = props;
  const [isDropTarget, setIsDropTarget] = useState(false);
  const team = props.orgTeams.find(t => t.id === row.member.teamId);
  const ui = STATUS_UI[row.status];

  return (
    <div
      onDragOver={e => {
        if (!draggedUnassigned) return;
        e.preventDefault(); e.dataTransfer.dropEffect = 'move';
        setIsDropTarget(true);
      }}
      onDragLeave={() => setIsDropTarget(false)}
      onDrop={e => {
        e.preventDefault();
        setIsDropTarget(false);
        onDropUnassigned(row.member);
      }}
      style={{
        background: 'var(--card)',
        border: `1px solid ${isDropTarget ? ui.color : 'var(--border)'}`,
        borderLeft: `3px solid ${team?.color || 'var(--border)'}`,
        borderRadius: 'var(--rl)', overflow: 'hidden',
        boxShadow: isDropTarget ? `0 0 0 2px ${ui.color}, 0 0 18px ${ui.color}` : undefined,
        transition: 'box-shadow .12s, border-color .12s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem', padding: '.8rem 1rem' }}>
        <div style={{
          width: 40, height: 40, borderRadius: '50%',
          background: team?.color || 'var(--pri)', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 700, fontSize: '.9rem', flexShrink: 0,
        }}>{row.member.name[0]}</div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '.4rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '.92rem', fontWeight: 700 }}>{row.member.name}</span>
            <span style={{ fontSize: '.68rem', color: 'var(--t3)' }}>{row.member.role}</span>
            {row.member.isManager && (
              <span style={{ fontSize: '.58rem', padding: '.08rem .4rem', borderRadius: 9999, background: 'rgba(155,124,246,.18)', color: '#b89fff', fontWeight: 700, textTransform: 'uppercase' }}>Työnjohtaja</span>
            )}
          </div>

          {/* Neutraalit luvut: aktiiviset tehtävät + projektit */}
          {(() => {
            const projectIds = new Set<number>();
            for (const it of row.items) {
              if (it.projectId !== undefined) projectIds.add(it.projectId);
            }
            return (
              <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginTop: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: '.72rem', color: 'var(--t2)' }}>
                  <b style={{ color: 'var(--ink)' }}>{row.active}</b> aktiivista tehtävää
                  <> · </>
                  <b style={{ color: 'var(--ink)' }}>{projectIds.size}</b> projektia
                  {row.overdue > 0 && <> · <span style={{ color: 'var(--red)', fontWeight: 700 }}>{row.overdue} myöhässä</span></>}
                  {row.pending > 0 && <> · <span style={{ color: 'var(--yellow)', fontWeight: 700 }}>{row.pending} odottaa</span></>}
                  {row.noDeadline > 0 && <> · <span style={{ color: 'var(--t3)' }}>{row.noDeadline} ilman DL</span></>}
                </span>
              </div>
            );
          })()}
        </div>

        {props.canEdit && (
          <button onClick={props.onQuickAdd} title="Lisää tehtävä"
            style={{ padding: '.3rem .6rem', fontSize: '.85rem', fontWeight: 700, background: 'var(--elev)', border: '1px solid var(--border)', borderRadius: 'var(--r)', cursor: 'pointer', color: 'var(--t1)' }}>
            +
          </button>
        )}
        <button onClick={onToggle} title={expanded ? 'Piilota tehtävät' : 'Näytä tehtävät'}
          style={{ padding: '.3rem .5rem', fontSize: '.72rem', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--t3)' }}>
          {expanded ? '▲' : '▼'}
        </button>
      </div>

      {expanded && (
        <div style={{ padding: '0 1rem 1rem', borderTop: '1px dashed var(--border)' }}>
          <ExpandedTaskList
            row={row}
            capacity={props.capacity}
            orgTeams={props.orgTeams}
            members={props.members}
            myName={props.myName}
            canEdit={props.canEdit}
            onAccept={props.onAccept}
            onReject={props.onReject}
            onReassign={props.onReassign}
            onToggleDone={props.onToggleDone}
            onEditDeadline={props.onEditDeadline}
            onAddAssignee={props.onAddAssignee}
            onRemoveAssignee={props.onRemoveAssignee}
          />
        </div>
      )}
    </div>
  );
}

// Tehtävälista ryhmiteltynä (myöhässä / tällä viikolla / seuraavat 2 vk / myöhemmin / ei deadlinea)
function ExpandedTaskList({
  row, capacity, orgTeams, members, myName, canEdit,
  onAccept, onReject, onReassign, onToggleDone, onEditDeadline,
  onAddAssignee, onRemoveAssignee,
}: {
  row: CapacityRow; capacity: CapacityRow[]; orgTeams: OrgTeam[]; members: OrgTeamMember[];
  myName: string; canEdit: boolean;
  onAccept: (i: WorkItem) => void; onReject: (i: WorkItem) => void;
  onReassign: (i: WorkItem, a: string) => void; onToggleDone: (i: WorkItem) => void;
  onEditDeadline: (i: WorkItem, d: string) => void;
  onAddAssignee: (i: WorkItem, name: string) => void;
  onRemoveAssignee: (i: WorkItem, name: string) => void;
}) {
  // Ryhmittele
  const groups = {
    overdue: [] as WorkItem[],
    thisWeek: [] as WorkItem[],
    nextTwoWeeks: [] as WorkItem[],
    later: [] as WorkItem[],
    noDeadline: [] as WorkItem[],
  };
  for (const it of row.items) {
    if (!it.deadline) { groups.noDeadline.push(it); continue; }
    const d = daysUntilDeadline(it.deadline);
    if (d === null) { groups.noDeadline.push(it); continue; }
    if (d < 0) groups.overdue.push(it);
    else if (d <= 7) groups.thisWeek.push(it);
    else if (d <= 14) groups.nextTwoWeeks.push(it);
    else groups.later.push(it);
  }

  const totalShown = row.items.length;

  return (
    <div style={{ paddingTop: '.75rem' }}>
      {totalShown === 0 && (
        <div style={{ color: 'var(--t3)', fontSize: '.82rem', padding: '.5rem 0' }}>
          Ei aktiivisia tehtäviä.
        </div>
      )}

      <TaskGroupList title="Myöhässä" color="var(--red)" items={groups.overdue}
        members={members} myName={myName} canEdit={canEdit}
        onAccept={onAccept} onReject={onReject} onReassign={onReassign} onToggleDone={onToggleDone} onEditDeadline={onEditDeadline}
        onAddAssignee={onAddAssignee} onRemoveAssignee={onRemoveAssignee} />
      <TaskGroupList title="Tällä viikolla" color="var(--yellow)" items={groups.thisWeek}
        members={members} myName={myName} canEdit={canEdit}
        onAccept={onAccept} onReject={onReject} onReassign={onReassign} onToggleDone={onToggleDone} onEditDeadline={onEditDeadline}
        onAddAssignee={onAddAssignee} onRemoveAssignee={onRemoveAssignee} />
      <TaskGroupList title="Seuraavat 2 viikkoa" color="var(--t2)" items={groups.nextTwoWeeks}
        members={members} myName={myName} canEdit={canEdit}
        onAccept={onAccept} onReject={onReject} onReassign={onReassign} onToggleDone={onToggleDone} onEditDeadline={onEditDeadline}
        onAddAssignee={onAddAssignee} onRemoveAssignee={onRemoveAssignee} />
      <TaskGroupList title="Myöhemmin" color="var(--t3)" items={groups.later} muted
        members={members} myName={myName} canEdit={canEdit}
        onAccept={onAccept} onReject={onReject} onReassign={onReassign} onToggleDone={onToggleDone} onEditDeadline={onEditDeadline}
        onAddAssignee={onAddAssignee} onRemoveAssignee={onRemoveAssignee} />
      <TaskGroupList title="Ei deadlinea — aseta!" color="var(--red)" items={groups.noDeadline} warn
        members={members} myName={myName} canEdit={canEdit}
        onAccept={onAccept} onReject={onReject} onReassign={onReassign} onToggleDone={onToggleDone} onEditDeadline={onEditDeadline}
        onAddAssignee={onAddAssignee} onRemoveAssignee={onRemoveAssignee} />
    </div>
  );
}

function TaskGroupList({
  title, color, items, muted, warn, members, myName, canEdit,
  onAccept, onReject, onReassign, onToggleDone, onEditDeadline,
  onAddAssignee, onRemoveAssignee,
}: {
  title: string; color: string; items: WorkItem[]; muted?: boolean; warn?: boolean;
  members: OrgTeamMember[]; myName: string; canEdit: boolean;
  onAccept: (i: WorkItem) => void; onReject: (i: WorkItem) => void;
  onReassign: (i: WorkItem, a: string) => void; onToggleDone: (i: WorkItem) => void;
  onEditDeadline: (i: WorkItem, d: string) => void;
  onAddAssignee: (i: WorkItem, name: string) => void;
  onRemoveAssignee: (i: WorkItem, name: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div style={{ marginBottom: '.85rem' }}>
      <div style={{
        fontSize: '.66rem', fontWeight: 700, color, textTransform: 'uppercase',
        letterSpacing: '.05em', marginBottom: '.3rem',
      }}>{title} ({items.length})</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '.25rem' }}>
        {items.map(i => (
          <TaskRowLine key={i.id} item={i} members={members} myName={myName} canEdit={canEdit}
            muted={muted} warn={warn}
            onAccept={onAccept} onReject={onReject} onReassign={onReassign} onToggleDone={onToggleDone}
            onEditDeadline={onEditDeadline}
            onAddAssignee={onAddAssignee} onRemoveAssignee={onRemoveAssignee} />
        ))}
      </div>
    </div>
  );
}

function TaskRowLine({
  item, members, myName, canEdit, muted, warn,
  onAccept, onReject, onReassign, onToggleDone, onEditDeadline,
  onAddAssignee, onRemoveAssignee,
}: {
  item: WorkItem; members: OrgTeamMember[]; myName: string; canEdit: boolean;
  muted?: boolean; warn?: boolean;
  onAccept: (i: WorkItem) => void; onReject: (i: WorkItem) => void;
  onReassign: (i: WorkItem, a: string) => void; onToggleDone: (i: WorkItem) => void;
  onEditDeadline: (i: WorkItem, d: string) => void;
  onAddAssignee: (i: WorkItem, name: string) => void;
  onRemoveAssignee: (i: WorkItem, name: string) => void;
}) {
  const isMineToAnswer = item.assignees.includes(myName) && item.status === 'pending';
  const overdue = isOverdue(item);
  const sc = statusColor(item.status);
  const sourceLabel =
    item.kind === 'project-task' ? `▣ ${item.projectName}` :
    item.kind === 'grant-subtask' ? `€ ${item.grantName}` :
    '';
  const availableToAdd = members.filter(m => !item.assignees.includes(m.name));

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '.5rem',
      padding: '.45rem .55rem', background: 'var(--elev)', borderRadius: 'var(--r)',
      border: `1px solid ${warn ? 'rgba(239,68,68,.3)' : 'transparent'}`,
      opacity: muted ? 0.6 : 1,
    }}>
      {canEdit && (
        <input type="checkbox" checked={item.done} onChange={() => onToggleDone(item)}
          disabled={item.status === 'pending'}
          style={{ flexShrink: 0, accentColor: 'var(--green)', cursor: 'pointer' }}
          title={item.status === 'pending' ? 'Hyväksy ensin' : (item.done ? 'Peru merkintä' : 'Merkitse valmiiksi')}
        />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '.82rem', fontWeight: 500, textDecoration: item.done ? 'line-through' : 'none' }}>{item.text}</div>
        <div style={{ display: 'flex', gap: '.3rem', fontSize: '.66rem', color: 'var(--t3)', marginTop: '.2rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {sourceLabel && <span>{sourceLabel}</span>}
          {/* Tekijät — chippeinä, × poistaa */}
          {item.assignees.length > 1 && item.assignees.map(name => (
            <span key={name} style={{
              display: 'inline-flex', alignItems: 'center', gap: '.2rem',
              padding: '.08rem .35rem', borderRadius: 9999,
              background: 'rgba(86,168,224,.15)', color: 'var(--pri-l)',
              fontWeight: 600,
            }}>
              {name}
              {canEdit && item.assignees.length > 1 && (
                <button onClick={() => onRemoveAssignee(item, name)}
                  style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, fontSize: '.72rem', lineHeight: 1 }}
                  title={`Poista ${name}`}>×</button>
              )}
            </span>
          ))}
          {item.assignedBy && (
            <span style={{
              fontStyle: item.assignees.includes(item.assignedBy) ? 'italic' : 'normal',
              color: item.assignees.includes(item.assignedBy) ? 'var(--t3)' : 'var(--t2)',
            }}>
              Antoi: {item.assignedBy}
            </span>
          )}
          {overdue && <span style={{ color: 'var(--red)', fontWeight: 700 }}>MYÖHÄSSÄ</span>}
        </div>
      </div>
      {canEdit ? (
        <input type="date" value={item.deadline || ''}
          onChange={e => onEditDeadline(item, e.target.value)}
          title={!item.deadline ? 'Aseta deadline' : 'Muokkaa deadlinea'}
          style={{
            fontSize: '.66rem', padding: '.15rem .3rem', width: 'auto', flexShrink: 0,
            background: !item.deadline ? 'rgba(239,68,68,.12)' : (overdue ? 'rgba(239,68,68,.12)' : 'var(--card)'),
            border: `1px solid ${!item.deadline ? 'rgba(239,68,68,.4)' : (overdue ? 'rgba(239,68,68,.4)' : 'var(--border)')}`,
            color: !item.deadline || overdue ? 'var(--red)' : 'var(--t2)',
            borderRadius: 'var(--r)', cursor: 'pointer',
          }}
        />
      ) : (
        item.deadline ? (
          <span style={{ fontSize: '.66rem', color: overdue ? 'var(--red)' : 'var(--t3)', fontWeight: overdue ? 700 : 400 }}>DL {item.deadline}</span>
        ) : (
          <span style={{ fontSize: '.66rem', color: 'var(--red)', fontWeight: 700 }}>⚠ ei DL</span>
        )
      )}
      {item.status !== 'accepted' && (
        <span style={{
          fontSize: '.56rem', padding: '.1rem .4rem', borderRadius: 9999,
          background: sc.bg, color: sc.fg, fontWeight: 700, textTransform: 'uppercase', flexShrink: 0,
        }}>{statusLabel(item.status)}</span>
      )}
      {canEdit && isMineToAnswer && (
        <div style={{ display: 'flex', gap: '.25rem', flexShrink: 0 }}>
          <button className="btn btn-sm" onClick={() => onAccept(item)}
            style={{ background: 'var(--green)', color: '#fff', fontSize: '.62rem', padding: '.15rem .4rem' }}>Hyväksy</button>
          <button className="btn btn-ghost btn-sm" onClick={() => onReject(item)}
            style={{ color: 'var(--red)', fontSize: '.62rem', padding: '.15rem .4rem' }}>Hylkää</button>
        </div>
      )}
      {canEdit && availableToAdd.length > 0 && (
        <select className="input" defaultValue="" onChange={e => {
          if (e.target.value) { onAddAssignee(item, e.target.value); e.target.value = ''; }
        }} style={{ fontSize: '.66rem', padding: '.15rem .3rem', width: 'auto', flexShrink: 0 }}
          title="Lisää tekijä">
          <option value="">+ Tekijä</option>
          {availableToAdd.map(m => (
            <option key={m.id} value={m.name}>{m.name}</option>
          ))}
        </select>
      )}
    </div>
  );
}

// --- Jakamattomat ---

function UnassignedSection({
  items, showAll, onToggleShowAll, members, myName, canEdit,
  onDragStart, onDragEnd, onReassign, onEditDeadline, onToggleDone,
}: {
  items: WorkItem[]; showAll: boolean; onToggleShowAll: () => void;
  members: OrgTeamMember[]; myName: string; canEdit: boolean;
  onDragStart: (i: WorkItem) => void; onDragEnd: () => void;
  onReassign: (i: WorkItem, a: string) => void;
  onEditDeadline: (i: WorkItem, d: string) => void;
  onToggleDone: (i: WorkItem) => void;
}) {
  if (items.length === 0) return null;
  const visible = showAll ? items : items.slice(0, 8);
  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 'var(--rl)', padding: '.85rem 1rem', marginBottom: '.5rem',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', marginBottom: '.55rem' }}>
        <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--yellow)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
          Jakamattomat tehtävät ({items.length})
        </div>
        <span style={{ flex: 1 }} />
        {items.length > 8 && (
          <button onClick={onToggleShowAll} className="btn btn-ghost btn-sm" style={{ fontSize: '.7rem' }}>
            {showAll ? 'Näytä vähemmän' : `Näytä kaikki (${items.length})`}
          </button>
        )}
      </div>
      <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
        {visible.map(i => {
          const overdue = isOverdue(i);
          const wasRejected = i.status === 'rejected';
          const sourceLabel =
            i.kind === 'project-task' ? `▣ ${i.projectName}` :
            i.kind === 'grant-subtask' ? `€ ${i.grantName}` :
            '';
          return (
            <div key={i.id}
              draggable={canEdit}
              onDragStart={() => onDragStart(i)}
              onDragEnd={onDragEnd}
              style={{
                padding: '.5rem .7rem', background: 'var(--elev)',
                border: `1px solid ${overdue ? 'rgba(239,68,68,.4)' : wasRejected ? 'rgba(239,68,68,.35)' : 'var(--border)'}`,
                borderLeft: `3px solid ${wasRejected ? 'var(--red)' : 'var(--yellow)'}`,
                borderRadius: 'var(--r)', cursor: canEdit ? 'grab' : 'default',
                minWidth: 200, maxWidth: 300,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '.35rem', marginBottom: '.2rem' }}>
                {canEdit && (
                  <input type="checkbox" checked={i.done} onChange={e => { e.stopPropagation(); onToggleDone(i); }}
                    style={{ marginTop: 2, accentColor: 'var(--green)', cursor: 'pointer' }}
                    title={i.done ? 'Peru merkintä' : 'Merkitse valmiiksi'} />
                )}
                <div style={{ fontSize: '.8rem', fontWeight: 600, flex: 1 }}>{i.text}</div>
                {wasRejected && (
                  <span style={{
                    fontSize: '.55rem', padding: '.1rem .35rem', borderRadius: 9999,
                    background: 'rgba(239,68,68,.15)', color: 'var(--red)',
                    fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em',
                    flexShrink: 0,
                  }}>
                    Hylatty
                  </span>
                )}
              </div>
              {wasRejected && i.rejectReason && (
                <div style={{
                  fontSize: '.65rem', color: 'var(--red)', marginBottom: '.25rem',
                  fontStyle: 'italic',
                }}>
                  Syy: {i.rejectReason}
                </div>
              )}
              <div style={{ display: 'flex', gap: '.4rem', fontSize: '.65rem', color: 'var(--t3)', flexWrap: 'wrap', alignItems: 'center' }}>
                {sourceLabel && <span>{sourceLabel}</span>}
                {canEdit ? (
                  <input type="date" value={i.deadline || ''}
                    onChange={e => onEditDeadline(i, e.target.value)}
                    style={{
                      fontSize: '.65rem', padding: '.1rem .25rem',
                      background: !i.deadline ? 'rgba(239,68,68,.12)' : (overdue ? 'rgba(239,68,68,.12)' : 'var(--card)'),
                      border: `1px solid ${!i.deadline ? 'rgba(239,68,68,.4)' : (overdue ? 'rgba(239,68,68,.4)' : 'var(--border)')}`,
                      color: !i.deadline || overdue ? 'var(--red)' : 'var(--t2)',
                      borderRadius: 'var(--r)', cursor: 'pointer',
                    }}
                  />
                ) : (
                  i.deadline ? (
                    <span style={{ color: overdue ? 'var(--red)' : 'var(--t3)', fontWeight: overdue ? 700 : 400 }}>DL {i.deadline}</span>
                  ) : (
                    <span style={{ color: 'var(--red)', fontWeight: 700 }}>⚠ ei DL</span>
                  )
                )}
                {overdue && <span style={{ color: 'var(--red)', fontWeight: 700 }}>MYÖHÄSSÄ</span>}
              </div>
              {canEdit && (
                <select className="input" defaultValue="" onChange={e => {
                  if (e.target.value) { onReassign(i, e.target.value); e.target.value = ''; }
                }} style={{ fontSize: '.68rem', padding: '.2rem .35rem', width: '100%', marginTop: '.4rem' }}>
                  <option value="">Anna henkilölle...</option>
                  {members.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                </select>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --- Quick add modal ---

function QuickAddModal({
  defaultAssignee, members, projects, grants, onClose, onSubmit,
}: {
  defaultAssignee: string;
  members: OrgTeamMember[];
  projects: ProjectLike[];
  grants: Grant[];
  onClose: () => void;
  onSubmit: (opts: { type: 'task' | 'project-task' | 'grant-subtask'; text: string; deadline: string; assignees: string[]; projectId?: number; grantId?: string; }) => void;
}) {
  const [text, setText] = useState('');
  const [type, setType] = useState<'task' | 'project-task' | 'grant-subtask'>('task');
  const [deadline, setDeadline] = useState(deadlineQuickOptions()[2].value); // oletus viikon päähän
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>(defaultAssignee ? [defaultAssignee] : []);
  const [projectId, setProjectId] = useState<number | ''>('');
  const [grantId, setGrantId] = useState<string>('');
  const toggleAssignee = (name: string) => {
    setSelectedAssignees(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]);
  };

  const activeProjects = projects.filter(p => !p.deletedAt && !p.archived);
  const activeGrants = grants.filter(g => !g.deletedAt);

  const canSubmit = text.trim().length > 0 && !!deadline &&
    (type !== 'project-task' || projectId !== '') &&
    (type !== 'grant-subtask' || !!grantId);

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--card)', border: '1px solid var(--border)',
        borderRadius: 'var(--rl)', padding: '1.5rem', width: 460, maxWidth: '90vw',
        maxHeight: '90vh', overflowY: 'auto',
      }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1rem' }}>
          Lisää tehtävä {selectedAssignees.length > 0 && <span style={{ color: 'var(--t3)', fontWeight: 500 }}>· {selectedAssignees.join(', ')}</span>}
        </h3>

        <div className="field">
          <label>Tyyppi</label>
          <div style={{ display: 'flex', gap: '.3rem', flexWrap: 'wrap' }}>
            <button type="button" onClick={() => setType('task')} style={chipStyle(type === 'task')}>Tehtävä</button>
            <button type="button" onClick={() => setType('project-task')} style={chipStyle(type === 'project-task')} disabled={activeProjects.length === 0}>Projektin osa</button>
            <button type="button" onClick={() => setType('grant-subtask')} style={chipStyle(type === 'grant-subtask')} disabled={activeGrants.length === 0}>Apurahan osa</button>
          </div>
        </div>

        {type === 'project-task' && (
          <div className="field">
            <label>Projekti *</label>
            <select className="input" value={projectId} onChange={e => setProjectId(e.target.value ? Number(e.target.value) : '')}>
              <option value="">— Valitse projekti —</option>
              {activeProjects.map(p => <option key={p.id} value={p.id}>{p.t}</option>)}
            </select>
          </div>
        )}

        {type === 'grant-subtask' && (
          <div className="field">
            <label>Apuraha *</label>
            <select className="input" value={grantId} onChange={e => setGrantId(e.target.value)}>
              <option value="">— Valitse apuraha —</option>
              {activeGrants.map(g => <option key={g.id} value={g.id}>{g.funder} · {g.grantName}</option>)}
            </select>
          </div>
        )}

        <div className="field">
          <label>Kuvaus *</label>
          <input className="input" value={text} onChange={e => setText(e.target.value)} autoFocus placeholder="Mitä pitää tehdä?" />
        </div>

        <div className="field">
          <label>Tekijät <span style={{ color: 'var(--t3)', fontWeight: 400 }}>(voi valita useamman)</span></label>
          <div style={{ display: 'flex', gap: '.3rem', flexWrap: 'wrap' }}>
            {members.map(m => {
              const active = selectedAssignees.includes(m.name);
              return (
                <button key={m.id} type="button" onClick={() => toggleAssignee(m.name)}
                  style={{
                    fontSize: '.72rem', padding: '.3rem .6rem', borderRadius: 9999,
                    background: active ? 'var(--pri)' : 'var(--elev)',
                    color: active ? '#fff' : 'var(--t2)',
                    border: `1px solid ${active ? 'var(--pri)' : 'var(--border)'}`,
                    fontWeight: 600, cursor: 'pointer',
                  }}>
                  {active ? '✓ ' : ''}{m.name}
                </button>
              );
            })}
          </div>
        </div>

        <div className="field">
          <label>Deadline * <span style={{ color: 'var(--t3)', fontWeight: 400 }}>(pakollinen)</span></label>
          <input type="date" className="input" value={deadline} onChange={e => setDeadline(e.target.value)} required />
          <div style={{ display: 'flex', gap: '.3rem', flexWrap: 'wrap', marginTop: '.35rem' }}>
            {deadlineQuickOptions().map(o => (
              <button key={o.value} type="button" onClick={() => setDeadline(o.value)}
                className="btn btn-ghost btn-sm"
                style={{ fontSize: '.66rem', padding: '.2rem .5rem', background: deadline === o.value ? 'var(--elev)' : 'transparent' }}>
                {o.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
          <button className="btn btn-ghost" onClick={onClose}>Peruuta</button>
          <button className="btn btn-primary" disabled={!canSubmit}
            onClick={() => onSubmit({
              type, text, deadline, assignees: selectedAssignees,
              projectId: type === 'project-task' ? (projectId as number) : undefined,
              grantId: type === 'grant-subtask' ? grantId : undefined,
            })}>
            Lisää tehtävä
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Saapuneet / Antamani yksinkertainen lista ---

function SimpleList({ items, empty: emptyText, actions, canEdit, onUpdateField }: {
  items: WorkItem[]; empty: string;
  actions?: (item: WorkItem) => React.ReactNode;
  canEdit?: boolean;
  onUpdateField?: (item: WorkItem, patch: Record<string, any>) => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const editable = !!(canEdit && onUpdateField);
  if (items.length === 0) return <div style={emptyStyle}>{emptyText}</div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
      {items.map(i => {
        const overdue = isOverdue(i);
        const sc = statusColor(i.status);
        const sourceLabel =
          i.kind === 'project-task' ? `▣ ${i.projectName}` :
          i.kind === 'grant-subtask' ? `€ ${i.grantName}` :
          '';
        const isExpanded = expandedId === i.id;
        const links = i.links || [];
        return (
          <div key={i.id} style={{
            display: 'flex', alignItems: 'flex-start', gap: '.65rem',
            padding: '.7rem .9rem', background: 'var(--card)',
            border: `1px solid ${i.status === 'rejected' ? 'rgba(239,68,68,.3)' : 'var(--border)'}`,
            borderLeft: `3px solid ${i.status === 'rejected' ? 'var(--red)' : i.status === 'pending' ? 'var(--yellow)' : 'var(--pri)'}`,
            borderRadius: 'var(--r)', flexWrap: 'wrap',
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              {isExpanded && editable ? (
                <input
                  className="input"
                  value={i.text}
                  onChange={e => onUpdateField!(i, { text: e.target.value })}
                  placeholder="Tehtavan nimi"
                  style={{ fontSize: '.88rem', fontWeight: 600, width: '100%', padding: '.3rem .5rem' }}
                />
              ) : (
                <LinkifiedText
                  text={i.text}
                  style={{ fontSize: '.88rem', fontWeight: 600, display: 'block' }}
                />
              )}
              <div style={{ fontSize: '.68rem', color: 'var(--t3)', display: 'flex', gap: '.5rem', flexWrap: 'wrap', marginTop: '.15rem' }}>
                {sourceLabel && <span style={{ fontWeight: 600 }}>{sourceLabel}</span>}
                {i.assignedBy && i.assignee && i.assignedBy !== i.assignee && <span>{i.assignedBy} {'->'} <b>{i.assignee}</b></span>}
                {i.status === 'rejected' && i.rejectReason && <span style={{ color: 'var(--red)' }}>Syy: {i.rejectReason}</span>}
                {i.deadline && <span style={{ color: overdue ? 'var(--red)' : 'var(--t3)', fontWeight: overdue ? 700 : 400 }}>{i.deadline}{overdue ? ' (myöhässä)' : ''}</span>}
              </div>
              {!isExpanded && (i.note || links.length > 0) && (
                <div style={{ marginTop: '.3rem', display: 'flex', flexDirection: 'column', gap: '.25rem' }}>
                  {i.note && (
                    <LinkifiedText
                      text={i.note}
                      style={{ fontSize: '.72rem', color: 'var(--t2)', lineHeight: 1.5, display: 'block' }}
                    />
                  )}
                  {links.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.3rem' }}>
                      {links.map((url, lidx) => {
                        const href = url.startsWith('www.') ? `https://${url}` : url;
                        let label = url;
                        try {
                          const u = new URL(href);
                          label = u.hostname.replace(/^www\./, '') + (u.pathname && u.pathname !== '/' ? u.pathname : '');
                          if (label.length > 38) label = label.slice(0, 35) + '...';
                        } catch { /* keep raw */ }
                        return (
                          <a
                            key={lidx}
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            style={{
                              fontSize: '.65rem', padding: '.15rem .45rem', borderRadius: 9999,
                              border: '1px solid rgba(155,124,246,.4)', background: 'rgba(155,124,246,.08)',
                              color: '#9b7cf6', textDecoration: 'none', fontWeight: 600,
                            }}
                            title={url}
                          >
                            {label}
                          </a>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
            {i.status !== 'accepted' && (
              <span style={{ fontSize: '.6rem', padding: '.15rem .5rem', borderRadius: 9999, background: sc.bg, color: sc.fg, fontWeight: 700, textTransform: 'uppercase' }}>
                {statusLabel(i.status)}
              </span>
            )}
            {actions && <div style={{ display: 'flex', gap: '.3rem' }}>{actions(i)}</div>}
            <button
              type="button"
              onClick={() => setExpandedId(isExpanded ? null : i.id)}
              title={isExpanded ? 'Sulje lisätiedot' : 'Avaa lisätiedot (muokkaa, lisää linkki)'}
              style={{
                fontSize: '.7rem', padding: '.2rem .45rem', background: 'transparent',
                border: '1px solid var(--border)', borderRadius: 'var(--r)',
                color: 'var(--t2)', cursor: 'pointer', flexShrink: 0,
              }}
            >
              {isExpanded ? '▴' : '▾'}
            </button>
            {isExpanded && (
              <div style={{
                flexBasis: '100%', marginTop: '.5rem', padding: '.7rem',
                background: 'var(--elev)', borderRadius: 'var(--r)',
                border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '.55rem',
              }}>
                <label style={{ fontSize: '.65rem', color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700 }}>
                  Lisätieto
                </label>
                <textarea
                  className="input"
                  value={i.note || ''}
                  onChange={e => editable && onUpdateField!(i, { note: e.target.value })}
                  placeholder="Kontekstia, taustaa, ohjeita..."
                  disabled={!editable}
                  rows={3}
                  style={{ fontSize: '.78rem', resize: 'vertical', minHeight: '3rem' }}
                />
                <label style={{ fontSize: '.65rem', color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700 }}>
                  Linkit
                </label>
                {links.map((url, lidx) => (
                  <div key={lidx} style={{ display: 'flex', gap: '.4rem', alignItems: 'center' }}>
                    <input
                      className="input"
                      value={url}
                      onChange={e => {
                        if (!editable) return;
                        const next = [...links];
                        next[lidx] = e.target.value;
                        onUpdateField!(i, { links: next });
                      }}
                      placeholder="https://..."
                      disabled={!editable}
                      style={{ flex: 1, fontSize: '.75rem' }}
                    />
                    {url && (
                      <a
                        href={url.startsWith('www.') ? `https://${url}` : url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        style={{ fontSize: '.7rem', color: '#9b7cf6', padding: '.2rem .4rem' }}
                        title="Avaa linkki"
                      >
                        ↗
                      </a>
                    )}
                    {editable && (
                      <button
                        type="button"
                        onClick={() => onUpdateField!(i, { links: links.filter((_, idx) => idx !== lidx) })}
                        style={{
                          fontSize: '.72rem', color: 'var(--red)', padding: '.2rem .4rem',
                          background: 'transparent', border: 'none', cursor: 'pointer',
                        }}
                        title="Poista linkki"
                      >
                        x
                      </button>
                    )}
                  </div>
                ))}
                {editable && (
                  <button
                    type="button"
                    onClick={() => onUpdateField!(i, { links: [...links, ''] })}
                    style={{
                      fontSize: '.7rem', padding: '.25rem .55rem', alignSelf: 'flex-start',
                      background: 'transparent', border: '1px dashed var(--border)',
                      borderRadius: 'var(--r)', color: '#9b7cf6', cursor: 'pointer',
                    }}
                  >
                    + Lisää linkki
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// --- Uusi projekti -modal ---

function NewProjectModal({
  orgTeams, onClose, onSubmit,
}: {
  orgTeams: OrgTeam[];
  onClose: () => void;
  onSubmit: (opts: { t: string; d?: string; teamId?: string; deadline?: string }) => void;
}) {
  const [t, setT] = useState('');
  const [d, setD] = useState('');
  const [teamId, setTeamId] = useState<string>(orgTeams[0]?.id || '');
  const [deadline, setDeadline] = useState('');

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--card)', border: '1px solid var(--border)',
        borderRadius: 'var(--rl)', padding: '1.5rem', width: 460, maxWidth: '90vw',
        maxHeight: '90vh', overflowY: 'auto',
      }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1rem' }}>Uusi projekti</h3>

        <div className="field">
          <label>Projektin nimi *</label>
          <input className="input" value={t} onChange={e => setT(e.target.value)} autoFocus
            placeholder="Esim. Kevätkampanja 2026" />
        </div>

        <div className="field">
          <label>Kuvaus</label>
          <textarea className="input textarea" value={d} onChange={e => setD(e.target.value)}
            placeholder="Mistä projektissa on kyse?" />
        </div>

        {orgTeams.length > 0 && (
          <div className="field">
            <label>Tiimi</label>
            <div style={{ display: 'flex', gap: '.3rem', flexWrap: 'wrap' }}>
              {orgTeams.map(team => {
                const active = teamId === team.id;
                return (
                  <button key={team.id} type="button" onClick={() => setTeamId(team.id)} style={{
                    fontSize: '.72rem', padding: '.4rem .7rem', borderRadius: 9999,
                    background: active ? team.color : 'var(--elev)',
                    color: active ? '#fff' : 'var(--t2)',
                    border: `1px solid ${active ? team.color : 'var(--border)'}`,
                    fontWeight: 600, cursor: 'pointer',
                    display: 'inline-flex', alignItems: 'center', gap: '.3rem',
                  }}>
                    <span style={{ fontSize: '.85rem', lineHeight: 1 }}>{team.icon}</span>
                    {team.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="field">
          <label>Deadline</label>
          <input type="date" className="input" value={deadline} onChange={e => setDeadline(e.target.value)}
            style={{ maxWidth: 200 }} />
        </div>

        <div style={{ display: 'flex', gap: '.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
          <button className="btn btn-ghost" onClick={onClose}>Peruuta</button>
          <button className="btn btn-primary" disabled={!t.trim()}
            onClick={() => onSubmit({
              t, d: d || undefined,
              teamId: teamId || undefined,
              deadline: deadline || undefined,
            })}>
            Luo projekti
          </button>
        </div>
      </div>
    </div>
  );
}
