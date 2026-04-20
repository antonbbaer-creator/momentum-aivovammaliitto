'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  forceSimulation, forceManyBody, forceLink, forceCenter,
  forceX, forceY, forceCollide,
  Simulation, SimulationNodeDatum, SimulationLinkDatum,
} from 'd3-force';
import Link from 'next/link';
import { OrgTeam, OrgTeamMember } from '@/lib/team-shared';
import {
  AssignmentStatus, statusColor, statusLabel,
} from '@/lib/assignments-shared';

// --- Julkiset tyypit ---

export interface UnifiedTask {
  source: 'task' | 'project' | 'grant-subtask';
  projectId?: number;
  projectName?: string;
  grantId?: string;
  grantName?: string;
  id: string | number;
  text: string;
  done: boolean;
  deadline?: string;
  assignees: string[];     // kaikki tekijät
  assignee?: string;       // legacy
  assignedBy?: string;
  status: AssignmentStatus;
  rejectReason?: string;
  completedAt?: number;
  createdAt?: number;
}

export interface GraphProjectShape {
  id: number;
  t: string;
  archived?: boolean;
  deletedAt?: number;
  teamId?: string;
}

interface Props {
  members: OrgTeamMember[];
  orgTeams: OrgTeam[];
  projects: GraphProjectShape[];
  tasks: UnifiedTask[];
  myName: string;
  canEdit: boolean;
  orgSlug: string;
  onAccept: (t: UnifiedTask) => void;
  onReject: (t: UnifiedTask) => void;
  onReassign: (t: UnifiedTask, newAssignee: string) => void;
}

// --- Sisäiset tyypit ---

type NodeKind = 'person' | 'project' | 'task';

interface GNode extends SimulationNodeDatum {
  id: string;
  kind: NodeKind;
  label: string;
  member?: OrgTeamMember;
  project?: GraphProjectShape;
  task?: UnifiedTask;
  teamId?: string;
  color?: string;
  degree: number;         // Linkkien määrä — koko suhteessa tähän
  r: number;              // Renderöintisäde
  unassigned?: boolean;
}
type GLink = SimulationLinkDatum<GNode> & {
  kind: 'assignment' | 'project' | 'delegation';
  status?: AssignmentStatus;
};

const DEFAULT_TEAM_COLOR = '#888888';

const personId = (m: OrgTeamMember) => `person:${m.id}`;
const projectNodeId = (p: GraphProjectShape) => `project:${p.id}`;
const taskNodeId = (t: UnifiedTask) => `task:${t.source}:${t.projectId ?? '-'}:${t.id}`;

// --- Pääkomponentti ---

export default function TaskNetworkGraph({
  members, orgTeams, projects, tasks, myName, canEdit, orgSlug,
  onAccept, onReject, onReassign,
}: Props) {
  // Näkymän koko
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });

  // Viewport (pan/zoom)
  const viewRef = useRef({ tx: 0, ty: 0, scale: 1 });
  const [viewTick, setViewTick] = useState(0); // pakottaa uudelleenrenderin labelille

  // Tila
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<GNode | null>(null);
  const [focusPersonId, setFocusPersonId] = useState<string | null>(null); // member.id

  // Settings paneeli + arvot
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [centerStrength, setCenterStrength] = useState(0.05);
  const [repelStrength, setRepelStrength] = useState(220);
  const [linkStrength, setLinkStrength] = useState(0.4);
  const [linkDistance, setLinkDistance] = useState(60);
  const [textFadeZoom, setTextFadeZoom] = useState(0.6); // task-labelit näkyviin vasta tällä zoomilla

  // Suodattimet
  const [viewMode, setViewMode] = useState<'active' | 'all' | 'done'>('active');
  const [timeRange, setTimeRange] = useState<'all' | '7d' | '30d' | '90d' | 'year'>('all');
  const [showAccepted, setShowAccepted] = useState(true);
  const [showPending, setShowPending] = useState(true);
  const [showRejected, setShowRejected] = useState(true);
  const [showDone, setShowDone] = useState(false);
  const [teamFilter, setTeamFilter] = useState<string>('all');

  // --- Koko ResizeObserverilla ---
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // HiDPI canvas
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = size.w * dpr;
    c.height = size.h * dpr;
    c.style.width = size.w + 'px';
    c.style.height = size.h + 'px';
    const ctx = c.getContext('2d');
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }, [size.w, size.h]);

  // --- Datan suodatus (huomioi focus) ---
  const focusMember = useMemo(
    () => focusPersonId ? members.find(m => m.id === focusPersonId) ?? null : null,
    [focusPersonId, members]
  );

  const timeRangeCutoff = useMemo(() => {
    if (timeRange === 'all') return 0;
    const now = Date.now();
    const day = 86400000;
    switch (timeRange) {
      case '7d': return now - 7 * day;
      case '30d': return now - 30 * day;
      case '90d': return now - 90 * day;
      case 'year': {
        const d = new Date(); d.setMonth(0, 1); d.setHours(0, 0, 0, 0);
        return d.getTime();
      }
    }
  }, [timeRange]);

  const filteredTasks = useMemo(() => tasks.filter(t => {
    // Näkymävalitsin: Aktiiviset / Kaikki / Vain valmiit
    if (viewMode === 'active' && t.done) return false;
    if (viewMode === 'done' && !t.done) return false;
    // viewMode === 'all' sallii kaikki

    // Aikaikkuna — koskee ensisijaisesti valmistuneita tehtäviä
    if (timeRangeCutoff && t.done) {
      const ts = t.completedAt ?? t.createdAt ?? 0;
      if (ts < timeRangeCutoff) return false;
    }

    if (focusMember) {
      if (!t.assignees.includes(focusMember.name) && t.assignedBy !== focusMember.name) return false;
    }
    // Näkymävalitsin ohittaa statusvalitsimet kun ei olla 'active'-tilassa
    if (viewMode === 'active' && !t.done) {
      if (t.status === 'accepted' && !showAccepted) return false;
      if (t.status === 'pending' && !showPending) return false;
      if (t.status === 'rejected' && !showRejected) return false;
    }
    if (teamFilter !== 'all' && !focusMember) {
      if (t.assignees.length > 0) {
        const anyInTeam = t.assignees.some(name => {
          const m = members.find(x => x.name === name);
          return m && m.teamId === teamFilter;
        });
        if (!anyInTeam) return false;
      } else if (t.projectId) {
        const p = projects.find(x => x.id === t.projectId);
        if (!p || p.teamId !== teamFilter) return false;
      } else {
        return false;
      }
    }
    return true;
  }), [tasks, showAccepted, showPending, showRejected, showDone, teamFilter, members, projects, focusMember, viewMode, timeRangeCutoff]);

  const filteredMembers = useMemo(() => {
    if (focusMember) return [focusMember];
    return teamFilter === 'all' ? members : members.filter(m => m.teamId === teamFilter);
  }, [members, teamFilter, focusMember]);

  const filteredProjects = useMemo(() => {
    if (focusMember) {
      // Projektit joissa focus-henkilöllä on tehtäviä
      const pIds = new Set(filteredTasks.filter(t => t.projectId).map(t => t.projectId!));
      return projects.filter(p => pIds.has(p.id));
    }
    return teamFilter === 'all' ? projects : projects.filter(p => p.teamId === teamFilter);
  }, [projects, teamFilter, focusMember, filteredTasks]);

  // --- Rakenna nodet + linkit ---
  const { nodes, links, nodesById, adjacency } = useMemo(() => {
    const ns: GNode[] = [];
    const ls: GLink[] = [];
    const teamColor = (tid?: string) => orgTeams.find(t => t.id === tid)?.color || DEFAULT_TEAM_COLOR;

    const degree = new Map<string, number>();
    const inc = (k: string) => degree.set(k, (degree.get(k) || 0) + 1);

    for (const m of filteredMembers) {
      ns.push({ id: personId(m), kind: 'person', label: m.name, member: m, teamId: m.teamId, color: teamColor(m.teamId), degree: 0, r: 10 });
    }
    for (const p of filteredProjects) {
      ns.push({ id: projectNodeId(p), kind: 'project', label: p.t, project: p, teamId: p.teamId, color: teamColor(p.teamId), degree: 0, r: 8 });
    }
    for (const t of filteredTasks) {
      ns.push({
        id: taskNodeId(t), kind: 'task', label: t.text, task: t,
        unassigned: t.assignees.length === 0 && t.status !== 'rejected',
        degree: 0, r: 4,
      });
      // Tekijäviivat: yksi per assignee
      for (const name of t.assignees) {
        const a = members.find(m => m.name === name);
        if (a && filteredMembers.some(fm => fm.id === a.id)) {
          const linkS = taskNodeId(t), linkT = personId(a);
          ls.push({ source: linkS, target: linkT, kind: 'assignment', status: t.status });
          inc(linkS); inc(linkT);
        }
      }
      // Delegointi: task ← assignedBy. Piirretään kun antaja on joku muu kuin
      // kukaan tekijöistä, ja antaja löytyy näkyvistä jäsenistä.
      if (t.assignedBy && !t.assignees.includes(t.assignedBy)) {
        const by = members.find(m => m.name === t.assignedBy);
        if (by && filteredMembers.some(fm => fm.id === by.id)) {
          const linkS = personId(by), linkT = taskNodeId(t);
          ls.push({ source: linkS, target: linkT, kind: 'delegation', status: t.status });
        }
      }
      if (t.projectId) {
        const proj = projects.find(p => p.id === t.projectId);
        if (proj && filteredProjects.some(fp => fp.id === proj.id)) {
          const linkS = taskNodeId(t), linkT = projectNodeId(proj);
          ls.push({ source: linkS, target: linkT, kind: 'project' });
          inc(linkS); inc(linkT);
        }
      }
    }

    // Aseta degree + kokotieto
    for (const n of ns) {
      n.degree = degree.get(n.id) || 0;
      if (n.kind === 'person') n.r = 8 + Math.min(10, Math.sqrt(n.degree) * 2.2);
      else if (n.kind === 'project') n.r = 7 + Math.min(6, Math.sqrt(n.degree) * 1.5);
      else n.r = 4 + Math.min(3, Math.sqrt(n.degree));
    }

    // Adjacency: kuka liittyy keneen (hover-korostukseen)
    const adj = new Map<string, Set<string>>();
    for (const l of ls) {
      const s = (typeof l.source === 'string' ? l.source : (l.source as GNode).id) as string;
      const t = (typeof l.target === 'string' ? l.target : (l.target as GNode).id) as string;
      if (!adj.has(s)) adj.set(s, new Set());
      if (!adj.has(t)) adj.set(t, new Set());
      adj.get(s)!.add(t);
      adj.get(t)!.add(s);
    }

    const map = new Map<string, GNode>();
    for (const n of ns) map.set(n.id, n);

    return { nodes: ns, links: ls, nodesById: map, adjacency: adj };
  }, [filteredMembers, filteredProjects, filteredTasks, members, projects, orgTeams]);

  // --- Positioiden säilytys ---
  const posRef = useRef<Map<string, { x: number; y: number }>>(new Map());

  // --- Simulaatio ---
  const simRef = useRef<Simulation<GNode, GLink> | null>(null);

  useEffect(() => {
    if (!nodes.length) {
      if (simRef.current) { simRef.current.stop(); simRef.current = null; }
      return;
    }

    // Palauta aiemmat positiot tunnettujen id:iden osalta
    for (const n of nodes) {
      const p = posRef.current.get(n.id);
      if (p) { n.x = p.x; n.y = p.y; }
    }

    const sim = forceSimulation<GNode>(nodes)
      .force('charge', forceManyBody<GNode>().strength(d => {
        if (d.kind === 'person') return -repelStrength * 2;
        if (d.kind === 'project') return -repelStrength * 1.2;
        return -repelStrength * 0.4;
      }))
      .force('collide', forceCollide<GNode>(d => d.r + 4))
      .force('center', forceCenter(size.w / 2, size.h / 2).strength(centerStrength))
      .force('link', forceLink<GNode, GLink>(links).id((d: any) => d.id).distance(linkDistance).strength(linkStrength));

    sim.alpha(0.9).alphaDecay(0.025);
    sim.on('tick', () => {
      for (const n of nodes) {
        if (typeof n.x === 'number' && typeof n.y === 'number') {
          posRef.current.set(n.id, { x: n.x, y: n.y });
        }
      }
      drawRef.current?.();
    });

    simRef.current = sim;
    return () => { sim.stop(); };
  }, [nodes, links, size.w, size.h, centerStrength, repelStrength, linkStrength, linkDistance]);

  // --- Piirto ---
  const drawRef = useRef<() => void>(() => {});
  const draw = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const { w, h } = size;
    const { tx, ty, scale } = viewRef.current;

    ctx.save();
    ctx.fillStyle = getCssVar('--bg') || '#0d1012';
    ctx.fillRect(0, 0, w, h);
    ctx.translate(tx, ty);
    ctx.scale(scale, scale);

    const hoverSet = hoveredId
      ? new Set<string>([hoveredId, ...(adjacency.get(hoveredId) || [])])
      : null;
    const selectedSet = selectedNode
      ? new Set<string>([selectedNode.id, ...(adjacency.get(selectedNode.id) || [])])
      : null;
    const highlightSet = hoverSet || selectedSet;

    // Edget
    ctx.lineWidth = 1 / scale;
    for (const l of links) {
      const s = typeof l.source === 'string' ? nodesById.get(l.source) : l.source as GNode;
      const t = typeof l.target === 'string' ? nodesById.get(l.target) : l.target as GNode;
      if (!s || !t || typeof s.x !== 'number' || typeof t.x !== 'number' || typeof s.y !== 'number' || typeof t.y !== 'number') continue;

      const highlighted = !highlightSet || highlightSet.has(s.id) && highlightSet.has(t.id);
      let color: string;
      if (l.kind === 'project') color = 'rgba(150,150,150,0.25)';
      else if (l.kind === 'delegation') color = 'rgba(180,140,220,0.55)';
      else if (l.status === 'pending') color = 'rgba(241,180,52,0.7)';
      else if (l.status === 'rejected') color = 'rgba(239,68,68,0.7)';
      else color = 'rgba(120,170,220,0.55)';

      ctx.globalAlpha = highlighted ? (l.kind === 'delegation' ? 0.7 : 0.9) : 0.08;
      ctx.strokeStyle = color;
      ctx.lineWidth = l.kind === 'delegation' ? 0.8 / scale : 1 / scale;
      if (l.kind === 'project' || l.kind === 'delegation' || l.status === 'pending' || l.status === 'rejected') {
        ctx.setLineDash(l.kind === 'delegation' ? [2 / scale, 3 / scale] : [4 / scale, 3 / scale]);
      } else {
        ctx.setLineDash([]);
      }
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(t.x, t.y);
      ctx.stroke();

      // Delegoinnille pieni nuolenkärki puoliväliin → osoittaa antajasta tehtävään
      if (l.kind === 'delegation') {
        const mx = (s.x + t.x) / 2;
        const my = (s.y + t.y) / 2;
        const dx = t.x - s.x;
        const dy = t.y - s.y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const ux = dx / len, uy = dy / len;
        const perpX = -uy, perpY = ux;
        const arrowLen = 6 / scale;
        const arrowW = 3 / scale;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(mx + ux * arrowLen, my + uy * arrowLen);
        ctx.lineTo(mx - ux * arrowLen + perpX * arrowW, my - uy * arrowLen + perpY * arrowW);
        ctx.lineTo(mx - ux * arrowLen - perpX * arrowW, my - uy * arrowLen - perpY * arrowW);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
      }
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // Nodet
    for (const n of nodes) {
      if (typeof n.x !== 'number' || typeof n.y !== 'number') continue;
      const highlighted = !highlightSet || highlightSet.has(n.id);
      ctx.globalAlpha = highlighted ? 1 : 0.2;

      if (n.kind === 'person') {
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fillStyle = n.color || DEFAULT_TEAM_COLOR;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.lineWidth = 1.2 / scale;
        ctx.stroke();
      } else if (n.kind === 'project') {
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(40,48,56,0.9)';
        ctx.fill();
        ctx.strokeStyle = n.color || '#aaa';
        ctx.lineWidth = 1.5 / scale;
        ctx.stroke();
      } else if (n.kind === 'task' && n.task) {
        const st = n.task.status;
        const isGrant = n.task.source === 'grant-subtask';
        const ring =
          n.task.done ? '#22c55e' :
          st === 'pending' ? '#f5c542' :
          st === 'rejected' ? '#ef4444' :
          isGrant ? '#e3b341' : '#56a8e0';
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        if (n.task.done) {
          // Valmis: täytetty himmennetty vihreä, ei erillistä reunaa — retrospektiivistä tarkastelua varten
          ctx.fillStyle = 'rgba(34,197,94,0.35)';
          ctx.fill();
          ctx.globalAlpha *= 0.55;
          ctx.strokeStyle = 'rgba(34,197,94,0.6)';
          ctx.lineWidth = 1 / scale;
          ctx.stroke();
        } else {
          ctx.fillStyle = isGrant ? 'rgba(36,30,20,0.9)' : 'rgba(22,28,34,0.9)';
          ctx.fill();
          ctx.strokeStyle = ring;
          ctx.lineWidth = 1.2 / scale;
          if (st !== 'accepted') ctx.setLineDash([2 / scale, 2 / scale]);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
      ctx.globalAlpha = 1;
    }

    // Raahauksen ghost-viiva ja kohde
    if (draggingTaskRef.current && draggingTaskRef.current.worldX !== undefined) {
      const t = draggingTaskRef.current;
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = '#f5c542';
      ctx.lineWidth = 1.5 / scale;
      ctx.setLineDash([5 / scale, 3 / scale]);
      ctx.beginPath();
      ctx.moveTo(t.sourceX, t.sourceY);
      ctx.lineTo(t.worldX!, t.worldY!);
      ctx.stroke();
      ctx.setLineDash([]);
      // Vihjerengas lähellä olevaan henkilöön
      const near = findNearestPerson(t.worldX!, t.worldY!, nodes, 60);
      if (near) {
        ctx.strokeStyle = '#f5c542';
        ctx.lineWidth = 2 / scale;
        ctx.beginPath();
        ctx.arc(near.x!, near.y!, near.r + 6, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // Labelit — henkilöt aina, muut vain hoveratessa tai riittävällä zoomilla
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (const n of nodes) {
      if (typeof n.x !== 'number' || typeof n.y !== 'number') continue;
      const highlighted = !highlightSet || highlightSet.has(n.id);
      const baseAlpha = highlighted ? 1 : 0.25;

      if (n.kind === 'person') {
        ctx.globalAlpha = baseAlpha;
        ctx.fillStyle = getCssVar('--t1') || '#eaeef1';
        ctx.font = `600 ${13 / scale}px var(--font-display, system-ui)`;
        drawLabel(ctx, n.label, n.x, n.y + n.r + 4 / scale, scale);
      } else if (n.kind === 'project') {
        const show = scale >= textFadeZoom || highlighted;
        if (show) {
          ctx.globalAlpha = baseAlpha * 0.85;
          ctx.fillStyle = getCssVar('--t2') || '#c8ced3';
          ctx.font = `500 ${11 / scale}px var(--font-display, system-ui)`;
          const lbl = n.label.length > 28 ? n.label.slice(0, 26) + '…' : n.label;
          drawLabel(ctx, lbl, n.x, n.y + n.r + 3 / scale, scale);
        }
      } else if (n.kind === 'task') {
        const show = hoveredId === n.id || (selectedNode?.id === n.id) || scale >= textFadeZoom + 0.4;
        if (show) {
          ctx.globalAlpha = baseAlpha * 0.9;
          ctx.fillStyle = getCssVar('--t2') || '#c8ced3';
          ctx.font = `500 ${10 / scale}px var(--font-display, system-ui)`;
          const lbl = n.label.length > 32 ? n.label.slice(0, 30) + '…' : n.label;
          drawLabel(ctx, lbl, n.x, n.y + n.r + 2 / scale, scale);
        }
      }
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }, [size, nodes, links, nodesById, adjacency, hoveredId, selectedNode, textFadeZoom]);

  useEffect(() => { drawRef.current = draw; draw(); }, [draw, viewTick]);

  // --- Hiiri / interaktiot ---
  const panRef = useRef<{ startClientX: number; startClientY: number; baseTx: number; baseTy: number } | null>(null);
  const draggingTaskRef = useRef<{
    task: UnifiedTask;
    sourceX: number; sourceY: number;
    startClientX: number; startClientY: number;
    worldX?: number; worldY?: number;
    moved?: boolean;
  } | null>(null);
  const pendingClickRef = useRef<{ id: string; x: number; y: number } | null>(null);

  const screenToWorld = (sx: number, sy: number) => {
    const { tx, ty, scale } = viewRef.current;
    return { x: (sx - tx) / scale, y: (sy - ty) / scale };
  };

  const hitTest = useCallback((wx: number, wy: number): GNode | null => {
    // Prefer smaller nodes on top so iterate reverse
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      if (typeof n.x !== 'number' || typeof n.y !== 'number') continue;
      const dx = wx - n.x, dy = wy - n.y;
      if (dx * dx + dy * dy < (n.r + 3) * (n.r + 3)) return n;
    }
    return null;
  }, [nodes]);

  const getRelPos = (e: React.MouseEvent | MouseEvent | React.WheelEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: (e as MouseEvent).clientX - rect.left, y: (e as MouseEvent).clientY - rect.top };
  };

  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const { x, y } = getRelPos(e);
    const { x: wx, y: wy } = screenToWorld(x, y);
    const hit = hitTest(wx, wy);
    if (hit && hit.kind === 'task' && canEdit && hit.task) {
      draggingTaskRef.current = {
        task: hit.task,
        sourceX: hit.x!, sourceY: hit.y!,
        startClientX: e.clientX, startClientY: e.clientY,
      };
      return;
    }
    pendingClickRef.current = hit ? { id: hit.id, x: e.clientX, y: e.clientY } : null;
    if (!hit) {
      panRef.current = {
        startClientX: e.clientX, startClientY: e.clientY,
        baseTx: viewRef.current.tx, baseTy: viewRef.current.ty,
      };
    }
  };

  const onMouseMove = (e: React.MouseEvent) => {
    const { x, y } = getRelPos(e);
    const { x: wx, y: wy } = screenToWorld(x, y);

    if (draggingTaskRef.current) {
      const dx = e.clientX - draggingTaskRef.current.startClientX;
      const dy = e.clientY - draggingTaskRef.current.startClientY;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) draggingTaskRef.current.moved = true;
      draggingTaskRef.current.worldX = wx;
      draggingTaskRef.current.worldY = wy;
      drawRef.current?.();
      return;
    }
    if (panRef.current) {
      viewRef.current.tx = panRef.current.baseTx + (e.clientX - panRef.current.startClientX);
      viewRef.current.ty = panRef.current.baseTy + (e.clientY - panRef.current.startClientY);
      drawRef.current?.();
      setViewTick(v => v + 1);
      return;
    }
    const hit = hitTest(wx, wy);
    const id = hit?.id ?? null;
    if (id !== hoveredId) setHoveredId(id);
  };

  const onMouseUp = (e: React.MouseEvent) => {
    if (draggingTaskRef.current) {
      const d = draggingTaskRef.current;
      draggingTaskRef.current = null;
      const { x, y } = getRelPos(e);
      const { x: wx, y: wy } = screenToWorld(x, y);
      if (d.moved) {
        const person = findNearestPerson(wx, wy, nodes, 60);
        if (person && person.member) {
          onReassign(d.task, person.member.name);
        }
      } else {
        // Kiinteä klikkaus tehtävään → valitse
        const hit = hitTest(wx, wy);
        if (hit) handleClick(hit);
      }
      drawRef.current?.();
      return;
    }
    if (panRef.current) {
      panRef.current = null;
      return;
    }
    if (pendingClickRef.current) {
      const { x, y } = getRelPos(e);
      const { x: wx, y: wy } = screenToWorld(x, y);
      const hit = hitTest(wx, wy);
      if (hit && hit.id === pendingClickRef.current.id) handleClick(hit);
      pendingClickRef.current = null;
    }
  };

  const handleClick = (n: GNode) => {
    if (n.kind === 'person' && n.member) {
      setFocusPersonId(prev => prev === n.member!.id ? null : n.member!.id);
      setSelectedNode(null);
      return;
    }
    setSelectedNode(prev => (prev?.id === n.id ? null : n));
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const { x, y } = getRelPos(e);
    const oldScale = viewRef.current.scale;
    const delta = -e.deltaY * 0.0015;
    const newScale = Math.max(0.25, Math.min(4, oldScale * (1 + delta)));
    // Zoom ankkuroidaan kursoriin
    viewRef.current.tx = x - (x - viewRef.current.tx) * (newScale / oldScale);
    viewRef.current.ty = y - (y - viewRef.current.ty) * (newScale / oldScale);
    viewRef.current.scale = newScale;
    drawRef.current?.();
    setViewTick(v => v + 1);
  };

  const onMouseLeave = () => {
    if (draggingTaskRef.current) draggingTaskRef.current = null;
    if (panRef.current) panRef.current = null;
    pendingClickRef.current = null;
    setHoveredId(null);
  };

  // --- Nollaa näkymä fokus-muutoksissa ---
  useEffect(() => {
    // Nollaa viewport fokuksen vaihtuessa
    viewRef.current = { tx: 0, ty: 0, scale: 1 };
    setViewTick(v => v + 1);
    posRef.current.clear();
  }, [focusPersonId]);

  // --- Alustavat positiot uusille nodeille ---
  useEffect(() => {
    const { w, h } = size;
    for (const n of nodes) {
      if (typeof n.x !== 'number' || typeof n.y !== 'number') {
        n.x = w / 2 + (Math.random() - 0.5) * Math.min(w, h) * 0.6;
        n.y = h / 2 + (Math.random() - 0.5) * Math.min(w, h) * 0.6;
      }
    }
  }, [nodes, size]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '.6rem' }}>
      {/* Yläpalkki: fokus-chip + hammasratas */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap' }}>
        {focusMember && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '.5rem',
            padding: '.35rem .7rem', borderRadius: 9999,
            background: 'var(--card)', border: '1px solid var(--border)',
            fontSize: '.78rem', fontWeight: 600,
          }}>
            <span style={{ color: 'var(--t3)' }}>Fokus:</span>
            <span>{focusMember.name}</span>
            <button onClick={() => setFocusPersonId(null)}
              style={{ background: 'transparent', border: 'none', color: 'var(--t3)', cursor: 'pointer', fontSize: '.9rem', padding: 0, marginLeft: '.2rem' }}
              aria-label="Poista fokus"
            >✕</button>
          </div>
        )}
        {!focusMember && (
          <div style={{ fontSize: '.72rem', color: 'var(--t3)' }}>
            Klikkaa henkilöä fokusoidaksesi · raahaa tehtävää henkilöön jakaaksesi
          </div>
        )}
        <span style={{ flex: 1 }} />

        {/* Näkymävalitsin */}
        <div style={{ display: 'inline-flex', borderRadius: 9999, border: '1px solid var(--border)', padding: 2, background: 'var(--elev)' }}>
          {(['active', 'all', 'done'] as const).map(m => (
            <button key={m} onClick={() => setViewMode(m)} style={{
              fontSize: '.7rem', padding: '.3rem .7rem', borderRadius: 9999,
              background: viewMode === m ? 'var(--t1)' : 'transparent',
              color: viewMode === m ? 'var(--bg)' : 'var(--t2)',
              border: 'none', fontWeight: 600, cursor: 'pointer',
            }}>
              {m === 'active' ? 'Aktiiviset' : m === 'all' ? 'Kaikki' : 'Vain valmiit'}
            </button>
          ))}
        </div>
        <button
          onClick={() => setSettingsOpen(v => !v)}
          style={{
            padding: '.4rem .75rem', fontSize: '.75rem', borderRadius: 'var(--r)',
            background: settingsOpen ? 'var(--t1)' : 'var(--elev)',
            color: settingsOpen ? 'var(--bg)' : 'var(--t2)',
            border: '1px solid var(--border)', cursor: 'pointer', fontWeight: 600,
            display: 'inline-flex', alignItems: 'center', gap: '.4rem',
          }}
          aria-label="Graafin asetukset"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
          </svg>
          Asetukset
        </button>
      </div>

      {/* Canvas */}
      <div
        ref={wrapperRef}
        style={{
          position: 'relative', width: '100%', height: 'calc(100vh - 240px)',
          minHeight: 520, borderRadius: 'var(--rl)', overflow: 'hidden',
          border: '1px solid var(--border)', background: 'var(--bg)',
        }}
      >
        <canvas
          ref={canvasRef}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseLeave}
          onWheel={onWheel}
          style={{
            display: 'block', width: '100%', height: '100%',
            cursor: draggingTaskRef.current ? 'grabbing' : (panRef.current ? 'grabbing' : 'default'),
          }}
        />

        {/* Asetuspaneeli — slide oikealta */}
        {settingsOpen && (
          <div style={{
            position: 'absolute', top: 0, right: 0, height: '100%', width: 280,
            background: 'var(--card)', borderLeft: '1px solid var(--border)',
            padding: '1rem', overflowY: 'auto', zIndex: 5,
            boxShadow: '-4px 0 16px rgba(0,0,0,.2)',
          }}>
            <SettingsSection title="Suodattimet">
              {viewMode === 'active' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '.4rem', fontSize: '.78rem' }}>
                  <Check label="Hyväksytyt" checked={showAccepted} onChange={setShowAccepted} />
                  <Check label="Odottavat" checked={showPending} onChange={setShowPending} />
                  <Check label="Hylätyt" checked={showRejected} onChange={setShowRejected} />
                </div>
              )}
              {viewMode !== 'active' && (
                <>
                  <div style={{ fontSize: '.68rem', color: 'var(--t3)', margin: '.2rem 0 .25rem', textTransform: 'uppercase' }}>Aikaväli (valmistumispäivälle)</div>
                  <select className="input" value={timeRange} onChange={e => setTimeRange(e.target.value as any)} style={{ fontSize: '.78rem' }}>
                    <option value="all">Kaikki aika</option>
                    <option value="7d">Viim. 7 vrk</option>
                    <option value="30d">Viim. 30 vrk</option>
                    <option value="90d">Viim. 90 vrk</option>
                    <option value="year">Tämä vuosi</option>
                  </select>
                </>
              )}
              {!focusMember && (
                <>
                  <div style={{ fontSize: '.68rem', color: 'var(--t3)', margin: '.6rem 0 .25rem', textTransform: 'uppercase' }}>Tiimi</div>
                  <select className="input" value={teamFilter} onChange={e => setTeamFilter(e.target.value)} style={{ fontSize: '.78rem' }}>
                    <option value="all">Kaikki tiimit</option>
                    {orgTeams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </>
              )}
            </SettingsSection>

            <SettingsSection title="Näyttö">
              <Slider label="Tekstin himmennysraja" value={textFadeZoom} min={0.3} max={1.5} step={0.05}
                onChange={setTextFadeZoom} hint={`${Math.round(textFadeZoom * 100)}%`} />
            </SettingsSection>

            <SettingsSection title="Fysiikka">
              <Slider label="Keskustavoima" value={centerStrength} min={0} max={0.3} step={0.01}
                onChange={v => { setCenterStrength(v); simRef.current?.alpha(0.6).restart(); }} />
              <Slider label="Hylkivä voima" value={repelStrength} min={50} max={600} step={10}
                onChange={v => { setRepelStrength(v); simRef.current?.alpha(0.6).restart(); }} />
              <Slider label="Linkin voima" value={linkStrength} min={0} max={1.5} step={0.05}
                onChange={v => { setLinkStrength(v); simRef.current?.alpha(0.6).restart(); }} />
              <Slider label="Linkin etäisyys" value={linkDistance} min={20} max={200} step={5}
                onChange={v => { setLinkDistance(v); simRef.current?.alpha(0.6).restart(); }} />
            </SettingsSection>

            <SettingsSection title="Ryhmät (värit)">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '.3rem', fontSize: '.75rem' }}>
                {orgTeams.map(t => (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                    <span style={{ width: 12, height: 12, borderRadius: '50%', background: t.color, flexShrink: 0 }} />
                    <span>{t.name}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                  <span style={{ width: 12, height: 12, borderRadius: '50%', background: DEFAULT_TEAM_COLOR, flexShrink: 0 }} />
                  <span>Ei tiimiä</span>
                </div>
              </div>
            </SettingsSection>

            <SettingsSection title="Yhteydet">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '.3rem', fontSize: '.72rem', color: 'var(--t2)' }}>
                <LegendLine color="rgba(120,170,220,0.85)" dashed={false} label="Tekijä ↔ tehtävä" />
                <LegendLine color="rgba(180,140,220,0.85)" dashed arrow label="Antaja → tehtävä" />
                <LegendLine color="rgba(150,150,150,0.6)" dashed label="Projekti / apuraha ↔ tehtävä" />
              </div>
            </SettingsSection>

            <SettingsSection title="Tila">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '.3rem', fontSize: '.75rem' }}>
                <LegendDot color="#56a8e0" label="Hyväksytty" />
                <LegendDot color="#f5c542" label="Odottaa (katkoviiva)" />
                <LegendDot color="#ef4444" label="Hylätty (katkoviiva)" />
              </div>
            </SettingsSection>
          </div>
        )}

        {/* Tehtävän sivupaneeli */}
        {selectedNode && selectedNode.kind === 'task' && selectedNode.task && (
          <TaskPopover
            node={selectedNode}
            onClose={() => setSelectedNode(null)}
            myName={myName}
            canEdit={canEdit}
            members={members}
            onAccept={onAccept}
            onReject={onReject}
            onReassign={onReassign}
            viewRef={viewRef}
          />
        )}
        {selectedNode && selectedNode.kind === 'project' && selectedNode.project && (
          <ProjectPopover node={selectedNode} onClose={() => setSelectedNode(null)} orgSlug={orgSlug} viewRef={viewRef} />
        )}
      </div>
    </div>
  );
}

// --- Apurit ---

function drawLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, scale: number) {
  // Tausta labelille jotta pysyy luettavana solmujen päällä
  const pad = 2 / scale;
  const metrics = ctx.measureText(text);
  const h = 12 / scale;
  ctx.fillStyle = 'rgba(13,16,18,0.6)';
  ctx.fillRect(x - metrics.width / 2 - pad, y - pad / 2, metrics.width + pad * 2, h + pad);
  ctx.fillStyle = getCssVar('--t1') || '#eaeef1';
  ctx.fillText(text, x, y);
}

function findNearestPerson(x: number, y: number, nodes: GNode[], maxDist: number): GNode | null {
  let best: GNode | null = null;
  let bestD = maxDist * maxDist;
  for (const n of nodes) {
    if (n.kind !== 'person' || typeof n.x !== 'number' || typeof n.y !== 'number') continue;
    const dx = x - n.x, dy = y - n.y;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = n; }
  }
  return best;
}

function getCssVar(name: string): string | null {
  if (typeof window === 'undefined') return null;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || null;
}

// --- Pienet alikomponentit ---

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '1.25rem' }}>
      <div style={{ fontSize: '.68rem', fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '.5rem' }}>{title}</div>
      {children}
    </div>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '.5rem', cursor: 'pointer' }}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function Slider({ label, value, min, max, step, onChange, hint }: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; hint?: string;
}) {
  return (
    <div style={{ marginBottom: '.6rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.72rem', marginBottom: '.25rem' }}>
        <span style={{ color: 'var(--t2)' }}>{label}</span>
        <span style={{ color: 'var(--t3)' }}>{hint ?? value}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ width: '100%' }} />
    </div>
  );
}

function LegendLine({ color, dashed, arrow, label }: { color: string; dashed?: boolean; arrow?: boolean; label: string }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '.5rem' }}>
      <svg width={36} height={10} style={{ flexShrink: 0 }}>
        <line x1={2} y1={5} x2={arrow ? 26 : 34} y2={5} stroke={color} strokeWidth={1.5} strokeDasharray={dashed ? '3,3' : '0'} />
        {arrow && (
          <polygon points="26,1 34,5 26,9" fill={color} />
        )}
      </svg>
      <span>{label}</span>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '.5rem' }}>
      <span style={{ width: 10, height: 10, borderRadius: '50%', border: `2px solid ${color}`, flexShrink: 0 }} />
      <span>{label}</span>
    </div>
  );
}

// --- Popoverit ---

function TaskPopover({
  node, onClose, myName, canEdit, members, onAccept, onReject, onReassign, viewRef,
}: {
  node: GNode; onClose: () => void; myName: string; canEdit: boolean; members: OrgTeamMember[];
  onAccept: (t: UnifiedTask) => void;
  onReject: (t: UnifiedTask) => void;
  onReassign: (t: UnifiedTask, a: string) => void;
  viewRef: React.MutableRefObject<{ tx: number; ty: number; scale: number }>;
}) {
  const t = node.task!;
  const sc = statusColor(t.status);
  const isMineToAnswer = t.assignees.includes(myName) && t.status === 'pending';
  return (
    <div style={{
      position: 'absolute', top: 16, left: 16, width: 300,
      background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)',
      padding: '1rem', boxShadow: '0 8px 24px rgba(0,0,0,.25)', zIndex: 6,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '.5rem' }}>
        <div style={{ fontSize: '.62rem', color: 'var(--t3)', textTransform: 'uppercase' }}>Tehtävä</div>
        <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--t3)', cursor: 'pointer', fontSize: '.9rem', padding: 0 }}>✕</button>
      </div>
      <h3 style={{ fontSize: '.95rem', fontWeight: 700, margin: '.25rem 0 .5rem', lineHeight: 1.35 }}>{t.text}</h3>
      {t.status !== 'accepted' && (
        <span style={{ fontSize: '.6rem', padding: '.15rem .45rem', borderRadius: 9999, background: sc.bg, color: sc.fg, fontWeight: 700, textTransform: 'uppercase' }}>
          {statusLabel(t.status)}
        </span>
      )}
      <div style={{ marginTop: '.75rem', display: 'flex', flexDirection: 'column', gap: '.3rem', fontSize: '.78rem' }}>
        {t.projectName && <Row label="Projekti" value={t.projectName} />}
        {t.assignedBy && <Row label="Antoi" value={t.assignedBy} />}
        <Row label={t.assignees.length > 1 ? 'Tekijät' : 'Tekijä'} value={t.assignees.length > 0 ? t.assignees.join(', ') : '— ei tekijää —'} />
        {t.deadline && <Row label="Deadline" value={t.deadline} />}
        {t.rejectReason && <Row label="Hylkäyssyy" value={t.rejectReason} />}
      </div>
      {canEdit && (
        <div style={{ marginTop: '.75rem', display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
          {isMineToAnswer && (
            <div style={{ display: 'flex', gap: '.35rem' }}>
              <button className="btn btn-sm" onClick={() => onAccept(t)} style={{ background: 'var(--green)', color: '#fff', flex: 1 }}>Hyväksy</button>
              <button className="btn btn-ghost btn-sm" onClick={() => onReject(t)} style={{ color: 'var(--red)', flex: 1 }}>Hylkää</button>
            </div>
          )}
          <select className="input" defaultValue="" onChange={e => {
            if (e.target.value) { onReassign(t, e.target.value); e.target.value = ''; }
          }} style={{ fontSize: '.75rem' }}>
            <option value="">{t.assignee ? 'Jaa uudelleen...' : 'Anna henkilölle...'}</option>
            {members.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
          </select>
        </div>
      )}
    </div>
  );
}

function ProjectPopover({ node, onClose, orgSlug, viewRef }: {
  node: GNode; onClose: () => void; orgSlug: string;
  viewRef: React.MutableRefObject<{ tx: number; ty: number; scale: number }>;
}) {
  const p = node.project!;
  return (
    <div style={{
      position: 'absolute', top: 16, left: 16, width: 260,
      background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--rl)',
      padding: '1rem', boxShadow: '0 8px 24px rgba(0,0,0,.25)', zIndex: 6,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ fontSize: '.62rem', color: 'var(--t3)', textTransform: 'uppercase' }}>Projekti</div>
        <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--t3)', cursor: 'pointer' }}>✕</button>
      </div>
      <h3 style={{ fontSize: '.95rem', fontWeight: 700, margin: '.25rem 0 .75rem' }}>{p.t}</h3>
      <Link href={`/${orgSlug}/projects`} className="btn btn-secondary btn-sm" style={{ display: 'inline-block' }}>
        Avaa projekti
      </Link>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: '.6rem' }}>
      <span style={{ minWidth: 70, color: 'var(--t3)', fontSize: '.66rem', textTransform: 'uppercase' }}>{label}</span>
      <span style={{ color: 'var(--t1)' }}>{value}</span>
    </div>
  );
}
