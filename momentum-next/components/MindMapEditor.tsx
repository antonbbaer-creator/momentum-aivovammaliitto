'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3-force';
import { NoteNode, NoteEdge, createChildNode, createRootNode } from '@/lib/notes-shared';

interface Props {
  nodes: NoteNode[];
  edges: NoteEdge[];
  onChange: (nodes: NoteNode[], edges: NoteEdge[]) => void;
  readOnly?: boolean;
  height?: number;
}

interface SimNode extends d3.SimulationNodeDatum {
  id: string;
  text: string;
  color?: string;
  parentId?: string | null;
  fx?: number | null;
  fy?: number | null;
}

interface SimLink extends d3.SimulationLinkDatum<SimNode> {
  source: string | SimNode;
  target: string | SimNode;
}

const NODE_R = 46;
const COLORS = ['#9b7cf6', '#3788b2', '#e45c81', '#2a8a86', '#f1b434', '#2dd4a0', '#ef6b6b'];

export default function MindMapEditor({ nodes, edges, onChange, readOnly = false, height = 520 }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 800, h: height });
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  const simRef = useRef<d3.Simulation<SimNode, SimLink> | null>(null);
  const [sim, setSim] = useState<{ nodes: SimNode[]; links: SimLink[] } | null>(null);
  const [, forceTick] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) setSize({ w: e.contentRect.width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [height]);

  // Seed if empty
  useEffect(() => {
    if (nodes.length === 0 && !readOnly) {
      const root = createRootNode('Aihe');
      onChange([root], []);
    }
  }, [nodes.length, onChange, readOnly]);

  // Build / update simulation when nodes/edges from parent change
  useEffect(() => {
    if (nodes.length === 0) { setSim(null); return; }

    const simNodes: SimNode[] = nodes.map(n => ({
      id: n.id,
      text: n.text,
      color: n.color,
      parentId: n.parentId,
      x: n.x ?? size.w / 2 + (Math.random() - 0.5) * 40,
      y: n.y ?? size.h / 2 + (Math.random() - 0.5) * 40,
      fx: n.x != null ? n.x : null,
      fy: n.y != null ? n.y : null,
    }));

    // Edges come from parent-child relations + explicit edges
    const implicit: SimLink[] = nodes
      .filter(n => n.parentId)
      .map(n => ({ source: n.parentId as string, target: n.id }));
    const explicit: SimLink[] = edges.map(e => ({ source: e.from, target: e.to }));
    const simLinks: SimLink[] = [...implicit, ...explicit];

    if (simRef.current) simRef.current.stop();

    const simulation = d3.forceSimulation(simNodes)
      .force('link', d3.forceLink<SimNode, SimLink>(simLinks).id(d => d.id).distance(130).strength(0.7))
      .force('charge', d3.forceManyBody().strength(-420))
      .force('center', d3.forceCenter(size.w / 2, size.h / 2).strength(0.04))
      .force('collide', d3.forceCollide<SimNode>().radius(NODE_R + 6))
      .alpha(0.6);

    simulation.on('tick', () => forceTick(t => t + 1));
    simulation.on('end', () => {
      // Persist positions back to parent
      const positioned: NoteNode[] = nodes.map(n => {
        const s = simNodes.find(s => s.id === n.id);
        return s ? { ...n, x: Math.round(s.x ?? 0), y: Math.round(s.y ?? 0) } : n;
      });
      // Only write if any position changed meaningfully
      const changed = positioned.some((p, i) => p.x !== nodes[i].x || p.y !== nodes[i].y);
      if (changed && !readOnly) onChange(positioned, edges);
    });

    simRef.current = simulation;
    setSim({ nodes: simNodes, links: simLinks });

    return () => { simulation.stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes.length, edges.length, size.w, size.h]);

  // Helpers
  const addChild = useCallback((parentId: string | null) => {
    if (readOnly) return;
    const parent = parentId ? nodes.find(n => n.id === parentId) : null;
    const child = createChildNode(parentId ?? (nodes[0]?.id ?? 'root'), 'Uusi solmu');
    // Place near parent
    if (parent) {
      child.x = (parent.x ?? size.w / 2) + 80 + Math.random() * 40;
      child.y = (parent.y ?? size.h / 2) + 80 + Math.random() * 40;
    } else {
      child.x = size.w / 2;
      child.y = size.h / 2;
    }
    const next = [...nodes, child];
    onChange(next, edges);
    setSelected(child.id);
    setEditing(child.id);
    setEditText(child.text);
  }, [nodes, edges, onChange, readOnly, size.w, size.h]);

  const removeNode = useCallback((id: string) => {
    if (readOnly) return;
    // Remove node + all descendants + edges touching any removed id
    const toRemove = new Set<string>([id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const n of nodes) {
        if (n.parentId && toRemove.has(n.parentId) && !toRemove.has(n.id)) {
          toRemove.add(n.id);
          changed = true;
        }
      }
    }
    const nextNodes = nodes.filter(n => !toRemove.has(n.id));
    const nextEdges = edges.filter(e => !toRemove.has(e.from) && !toRemove.has(e.to));
    onChange(nextNodes, nextEdges);
    setSelected(null);
  }, [nodes, edges, onChange, readOnly]);

  const updateNodeText = useCallback((id: string, text: string) => {
    if (readOnly) return;
    onChange(nodes.map(n => n.id === id ? { ...n, text } : n), edges);
  }, [nodes, edges, onChange, readOnly]);

  const setNodeColor = useCallback((id: string, color: string) => {
    if (readOnly) return;
    onChange(nodes.map(n => n.id === id ? { ...n, color } : n), edges);
  }, [nodes, edges, onChange, readOnly]);

  // Drag
  const dragging = useRef<{ id: string; offX: number; offY: number } | null>(null);

  const onNodePointerDown = (id: string, e: React.PointerEvent) => {
    if (readOnly) return;
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const simNode = sim?.nodes.find(n => n.id === id);
    if (!simNode) return;
    simNode.fx = simNode.x;
    simNode.fy = simNode.y;
    const pt = screenToWorld(e.clientX, e.clientY);
    dragging.current = { id, offX: (simNode.x ?? 0) - pt.x, offY: (simNode.y ?? 0) - pt.y };
    simRef.current?.alphaTarget(0.3).restart();
    setSelected(id);
  };

  const onNodePointerMove = (e: React.PointerEvent) => {
    const d = dragging.current;
    if (!d || !sim) return;
    const pt = screenToWorld(e.clientX, e.clientY);
    const simNode = sim.nodes.find(n => n.id === d.id);
    if (!simNode) return;
    simNode.fx = pt.x + d.offX;
    simNode.fy = pt.y + d.offY;
  };

  const onNodePointerUp = (e: React.PointerEvent) => {
    const d = dragging.current;
    if (!d || !sim) return;
    const simNode = sim.nodes.find(n => n.id === d.id);
    if (simNode && simNode.fx != null && simNode.fy != null) {
      // Persist pinned position
      const nx = Math.round(simNode.fx);
      const ny = Math.round(simNode.fy);
      onChange(nodes.map(n => n.id === d.id ? { ...n, x: nx, y: ny } : n), edges);
    }
    dragging.current = null;
    simRef.current?.alphaTarget(0);
    (e.target as Element).releasePointerCapture?.(e.pointerId);
  };

  // Pan / zoom
  const screenToWorld = (sx: number, sy: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: sx, y: sy };
    return { x: (sx - rect.left - pan.x) / zoom, y: (sy - rect.top - pan.y) / zoom };
  };

  const onBgPointerDown = (e: React.PointerEvent) => {
    if ((e.target as Element).tagName !== 'svg') return;
    setSelected(null);
    setIsPanning(true);
    panStart.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
  };
  const onBgPointerMove = (e: React.PointerEvent) => {
    if (!isPanning || !panStart.current) return;
    setPan({
      x: panStart.current.px + (e.clientX - panStart.current.x),
      y: panStart.current.py + (e.clientY - panStart.current.y),
    });
  };
  const onBgPointerUp = () => { setIsPanning(false); panStart.current = null; };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    setZoom(z => Math.min(3, Math.max(0.3, z * delta)));
  };

  // Render helpers
  const visibleLinks = sim?.links ?? [];
  const visibleNodes = sim?.nodes ?? [];
  const selNode = selected ? nodes.find(n => n.id === selected) : null;

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        height,
        background: 'var(--elev)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--rl)',
        overflow: 'hidden',
        touchAction: 'none',
      }}
      onWheel={onWheel}
    >
      {/* Toolbar */}
      {!readOnly && (
        <div style={{
          position: 'absolute', top: 8, left: 8, zIndex: 5,
          display: 'flex', gap: 6, flexWrap: 'wrap',
        }}>
          <button
            className="btn btn-primary btn-sm"
            style={{ fontSize: '.7rem' }}
            onClick={() => addChild(selected)}
            disabled={!selected && nodes.length > 0}
            title={selected ? 'Lisää lapsisolmu valittuun' : 'Valitse ensin solmu'}
          >
            + Lapsisolmu
          </button>
          <button
            className="btn btn-ghost btn-sm"
            style={{ fontSize: '.7rem' }}
            onClick={() => addChild(null)}
          >
            + Irrallinen
          </button>
          {selNode && (
            <>
              <div style={{ display: 'flex', gap: 3, alignItems: 'center', padding: '0 6px' }}>
                {COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => setNodeColor(selNode.id, c)}
                    style={{
                      width: 18, height: 18, borderRadius: '50%',
                      background: c, border: selNode.color === c ? '2px solid white' : '1px solid rgba(255,255,255,.2)',
                      cursor: 'pointer', padding: 0,
                    }}
                    aria-label={`Väri ${c}`}
                  />
                ))}
              </div>
              {nodes.length > 1 && (
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ fontSize: '.7rem', color: 'var(--red)' }}
                  onClick={() => removeNode(selNode.id)}
                >
                  Poista
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* Zoom indicator */}
      <div style={{
        position: 'absolute', top: 8, right: 8, zIndex: 5,
        fontSize: '.65rem', color: 'var(--t3)',
        background: 'var(--card)', border: '1px solid var(--border)',
        padding: '.25rem .5rem', borderRadius: 'var(--r)',
      }}>
        {Math.round(zoom * 100)}%
        <button
          onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
          style={{ marginLeft: 6, background: 'none', border: 'none', color: 'var(--pri)', cursor: 'pointer', fontSize: '.65rem' }}
        >
          nollaa
        </button>
      </div>

      <svg
        width="100%"
        height={height}
        style={{ cursor: isPanning ? 'grabbing' : 'grab', display: 'block' }}
        onPointerDown={onBgPointerDown}
        onPointerMove={(e) => { onBgPointerMove(e); onNodePointerMove(e); }}
        onPointerUp={(e) => { onBgPointerUp(); onNodePointerUp(e); }}
        onPointerLeave={(e) => { onBgPointerUp(); onNodePointerUp(e); }}
      >
        <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
          {/* Links */}
          {visibleLinks.map((l, i) => {
            const s = typeof l.source === 'string' ? visibleNodes.find(n => n.id === l.source) : l.source;
            const t = typeof l.target === 'string' ? visibleNodes.find(n => n.id === l.target) : l.target;
            if (!s || !t) return null;
            return (
              <line
                key={i}
                x1={s.x} y1={s.y} x2={t.x} y2={t.y}
                stroke="var(--border)"
                strokeWidth={2}
                strokeOpacity={0.6}
              />
            );
          })}

          {/* Nodes */}
          {visibleNodes.map(n => {
            const src = nodes.find(x => x.id === n.id);
            const color = src?.color ?? (src?.parentId == null ? COLORS[0] : COLORS[2]);
            const isSelected = selected === n.id;
            return (
              <g
                key={n.id}
                transform={`translate(${n.x ?? 0},${n.y ?? 0})`}
                onPointerDown={(e) => onNodePointerDown(n.id, e)}
                onDoubleClick={(e) => { e.stopPropagation(); if (!readOnly) { setEditing(n.id); setEditText(src?.text ?? ''); } }}
                style={{ cursor: readOnly ? 'default' : 'move' }}
              >
                <circle
                  r={NODE_R}
                  fill={color}
                  fillOpacity={0.18}
                  stroke={color}
                  strokeWidth={isSelected ? 3 : 2}
                />
                <foreignObject x={-NODE_R + 4} y={-NODE_R + 4} width={NODE_R * 2 - 8} height={NODE_R * 2 - 8} style={{ pointerEvents: 'none' }}>
                  <div
                    style={{
                      width: '100%', height: '100%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '.72rem', fontWeight: 600, color: 'var(--t1)',
                      textAlign: 'center', lineHeight: 1.25, padding: 4,
                      overflow: 'hidden', wordBreak: 'break-word',
                    }}
                  >
                    {src?.text || '...'}
                  </div>
                </foreignObject>
              </g>
            );
          })}
        </g>
      </svg>

      {/* Inline editor */}
      {editing && (() => {
        const n = nodes.find(x => x.id === editing);
        if (!n) return null;
        const sx = (n.x ?? 0) * zoom + pan.x;
        const sy = (n.y ?? 0) * zoom + pan.y;
        return (
          <div
            style={{
              position: 'absolute',
              left: sx - 110, top: sy + NODE_R * zoom + 6,
              zIndex: 10, width: 220,
              background: 'var(--card)', border: '1px solid var(--pri)',
              borderRadius: 'var(--r)', padding: 6,
              boxShadow: '0 4px 16px rgba(0,0,0,.3)',
            }}
          >
            <textarea
              value={editText}
              onChange={e => setEditText(e.target.value)}
              autoFocus
              rows={2}
              style={{
                width: '100%', background: 'var(--elev)', border: '1px solid var(--border)',
                borderRadius: 'var(--r)', padding: 4, fontSize: '.78rem', color: 'var(--t1)',
                fontFamily: 'inherit', resize: 'none',
              }}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  updateNodeText(editing, editText.trim() || '...');
                  setEditing(null);
                } else if (e.key === 'Escape') {
                  setEditing(null);
                }
              }}
            />
            <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end', marginTop: 4 }}>
              <button className="btn btn-ghost btn-sm" style={{ fontSize: '.65rem' }} onClick={() => setEditing(null)}>Peruuta</button>
              <button
                className="btn btn-primary btn-sm"
                style={{ fontSize: '.65rem' }}
                onClick={() => { updateNodeText(editing, editText.trim() || '...'); setEditing(null); }}
              >
                Tallenna
              </button>
            </div>
          </div>
        );
      })()}

      {/* Empty hint */}
      {!readOnly && nodes.length <= 1 && (
        <div style={{
          position: 'absolute', bottom: 8, right: 8,
          fontSize: '.7rem', color: 'var(--t3)',
          background: 'var(--card)', border: '1px solid var(--border)',
          padding: '.35rem .55rem', borderRadius: 'var(--r)',
          maxWidth: 260, lineHeight: 1.4,
        }}>
          Vinkki: valitse solmu ja paina "+ Lapsisolmu". Kaksoisklikkaa solmua muokataksesi tekstiä. Raahaa vetääksesi, rullalla zoomaat.
        </div>
      )}
    </div>
  );
}
