import { useMemo } from 'react'
import { toNetworkDiagram } from '../../application/services/ReportingService'
import { useWorkspaceDispatch, useWorkspaceState } from '../state/WorkspaceContext'
import styles from './NetworkView.module.css'

type Side = 'start' | 'finish'
type Pt = { x: number; y: number }

type EdgeGeom = {
  id: string
  type: string
  points: Pt[]
  label: Pt
}

const NODE_W = 168
const NODE_H = 64
const GAP_X = 64
const GAP_Y = 36
const PAD = 20
const STUB = 18
const ARROW_SIZE = 9
const WRAP_LANE = 16

function sidesForType(type: string): { from: Side; to: Side } {
  switch (type) {
    case 'SS':
      return { from: 'start', to: 'start' }
    case 'FF':
      return { from: 'finish', to: 'finish' }
    case 'SF':
      return { from: 'start', to: 'finish' }
    case 'FS':
    default:
      return { from: 'finish', to: 'start' }
  }
}

function sidePoint(box: { x: number; y: number }, side: Side): Pt {
  return {
    x: side === 'start' ? box.x : box.x + NODE_W,
    y: box.y + NODE_H / 2,
  }
}

function stubFrom(p: Pt, side: Side): Pt {
  return side === 'finish' ? { x: p.x + STUB, y: p.y } : { x: p.x - STUB, y: p.y }
}

/**
 * Orthogonal connector. Forward edges use a vertical elbow in the gap between
 * columns; back/wrap edges drop to a lane under the diagram instead of
 * slicing diagonally across nodes.
 */
export function routeLink(
  from: Pt,
  fromSide: Side,
  to: Pt,
  toSide: Side,
  lane: number,
  floorY: number,
): Pt[] {
  const a = stubFrom(from, fromSide)
  const b = stubFrom(to, toSide)
  const stagger = ((lane % 5) - 2) * 5

  // Comfortable forward gap between stubs → classic elbow in the column gutter.
  if (a.x + 8 < b.x) {
    const midX = (a.x + b.x) / 2 + stagger
    return [from, a, { x: midX, y: a.y }, { x: midX, y: b.y }, b, to]
  }

  // Same column / short gap: step out, then vertical, then in.
  if (Math.abs(a.x - b.x) <= 8 && Math.abs(a.y - b.y) > 4) {
    const outX = Math.max(a.x, b.x) + STUB + Math.abs(stagger)
    return [from, a, { x: outX, y: a.y }, { x: outX, y: b.y }, b, to]
  }

  // Wrap / reverse: exit → down to floor lane → across → up → enter.
  // Never draw a straight chord across the grid.
  const y = floorY + lane * WRAP_LANE
  return [from, a, { x: a.x, y }, { x: b.x, y }, b, to]
}

function pointsToPath(points: Pt[]): string {
  if (points.length === 0) return ''
  const [first, ...rest] = points
  return `M ${first!.x} ${first!.y} ` + rest.map((p) => `L ${p.x} ${p.y}`).join(' ')
}

function arrowHeadPoints(prev: Pt, tip: Pt): string {
  const angle = Math.atan2(tip.y - prev.y, tip.x - prev.x)
  const left = angle + Math.PI / 6
  const right = angle - Math.PI / 6
  const xL = tip.x - ARROW_SIZE * Math.cos(left)
  const yL = tip.y - ARROW_SIZE * Math.sin(left)
  const xR = tip.x - ARROW_SIZE * Math.cos(right)
  const yR = tip.y - ARROW_SIZE * Math.sin(right)
  return `${tip.x},${tip.y} ${xL},${yL} ${xR},${yR}`
}

/** Trim the last segment so the line stops before the arrowhead. */
function pathBeforeArrow(points: Pt[]): Pt[] {
  if (points.length < 2) return points
  const tip = points[points.length - 1]!
  const prev = points[points.length - 2]!
  const dx = tip.x - prev.x
  const dy = tip.y - prev.y
  const len = Math.hypot(dx, dy) || 1
  const t = Math.max(0, 1 - ARROW_SIZE / len)
  const trimmed = { x: prev.x + dx * t, y: prev.y + dy * t }
  return [...points.slice(0, -1), trimmed]
}

function labelPoint(points: Pt[]): Pt {
  if (points.length < 2) return points[0] ?? { x: 0, y: 0 }
  // Prefer mid of the longest horizontal run (readable, not on a steep vertical).
  let best = { i: 0, len: -1 }
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!
    const b = points[i + 1]!
    const horiz = Math.abs(b.x - a.x)
    if (horiz > best.len) best = { i, len: horiz }
  }
  const a = points[best.i]!
  const b = points[best.i + 1]!
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - 4 }
}

/** Longest-path layering so successors sit to the right of predecessors. */
export function computeNetworkLayers(
  nodeIds: string[],
  edges: { from: string; to: string }[],
): Map<string, number> {
  const preds = new Map<string, string[]>()
  for (const id of nodeIds) preds.set(id, [])
  for (const e of edges) {
    if (!preds.has(e.to) || !preds.has(e.from)) continue
    preds.get(e.to)!.push(e.from)
  }

  const layers = new Map<string, number>()
  const visiting = new Set<string>()

  const layerOf = (id: string): number => {
    const cached = layers.get(id)
    if (cached != null) return cached
    if (visiting.has(id)) return 0
    visiting.add(id)
    const ps = preds.get(id) ?? []
    const layer = ps.length === 0 ? 0 : 1 + Math.max(...ps.map(layerOf))
    visiting.delete(id)
    layers.set(id, layer)
    return layer
  }

  for (const id of nodeIds) layerOf(id)
  return layers
}

export function NetworkView() {
  const { project, selectedTaskId } = useWorkspaceState()
  const dispatch = useWorkspaceDispatch()

  const layout = useMemo(() => {
    const { nodes, edges } = toNetworkDiagram(project)
    const layers = computeNetworkLayers(
      nodes.map((n) => n.id),
      edges,
    )
    const byLayer = new Map<number, string[]>()
    for (const n of nodes) {
      const L = layers.get(n.id) ?? 0
      const row = byLayer.get(L) ?? []
      row.push(n.id)
      byLayer.set(L, row)
    }

    const boxes = new Map<string, { x: number; y: number }>()
    let maxLayer = 0
    let maxRow = 0
    for (const [L, ids] of byLayer) {
      maxLayer = Math.max(maxLayer, L)
      maxRow = Math.max(maxRow, ids.length - 1)
      ids.forEach((id, row) => {
        boxes.set(id, {
          x: PAD + L * (NODE_W + GAP_X),
          y: PAD + row * (NODE_H + GAP_Y),
        })
      })
    }

    const contentBottom = PAD + (maxRow + 1) * (NODE_H + GAP_Y) - GAP_Y
    const floorY = contentBottom + GAP_Y
    const wrapCount = edges.filter((e) => {
      const a = boxes.get(e.from)
      const b = boxes.get(e.to)
      if (!a || !b) return false
      const { from, to } = sidesForType(e.type)
      const p1 = sidePoint(a, from)
      const p2 = sidePoint(b, to)
      return stubFrom(p1, from).x + 8 >= stubFrom(p2, to).x
    }).length

    const width = Math.max(
      PAD * 2 + NODE_W,
      PAD + (maxLayer + 1) * (NODE_W + GAP_X) - GAP_X + PAD,
    )
    const height = floorY + Math.max(1, wrapCount) * WRAP_LANE + PAD

    let wrapLane = 0
    const edgeGeoms: EdgeGeom[] = []
    for (const edge of edges) {
      const a = boxes.get(edge.from)
      const b = boxes.get(edge.to)
      if (!a || !b) continue
      const { from, to } = sidesForType(edge.type)
      const p1 = sidePoint(a, from)
      const p2 = sidePoint(b, to)
      const needsWrap = stubFrom(p1, from).x + 8 >= stubFrom(p2, to).x
      const lane = needsWrap ? wrapLane++ : edgeGeoms.length
      const points = routeLink(p1, from, p2, to, lane, floorY)
      edgeGeoms.push({
        id: edge.id,
        type: edge.type,
        points,
        label: labelPoint(points),
      })
    }

    return { nodes, boxes, width, height, edgeGeoms }
  }, [project])

  return (
    <div className={styles.panel}>
      <div className={styles.heading}>
        <h2>Network Diagram</h2>
        <p>PERT-style dependency graph with critical path highlighted.</p>
      </div>
      <div className={styles.diagram}>
        <div
          className={styles.canvas}
          style={{ width: layout.width, height: layout.height }}
        >
          {layout.nodes.map((node) => {
            const box = layout.boxes.get(node.id)
            if (!box) return null
            return (
              <button
                key={node.id}
                type="button"
                className={[
                  styles.node,
                  node.critical ? styles.critical : '',
                  node.milestone ? styles.milestone : '',
                  selectedTaskId === node.id ? styles.selected : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                style={{ left: box.x, top: box.y, width: NODE_W, height: NODE_H }}
                onClick={() => dispatch({ type: 'selectTask', taskId: node.id })}
              >
                <strong>{node.name}</strong>
                <span>
                  {node.earlyStart} → {node.earlyFinish}
                </span>
              </button>
            )
          })}
          <svg
            className={styles.links}
            width={layout.width}
            height={layout.height}
            viewBox={`0 0 ${layout.width} ${layout.height}`}
            aria-hidden="true"
          >
            {layout.edgeGeoms.map((g) => {
              const body = pathBeforeArrow(g.points)
              const tip = g.points[g.points.length - 1]!
              const prev = g.points[g.points.length - 2] ?? tip
              return (
                <g key={g.id}>
                  <path d={pointsToPath(body)} className={styles.link} />
                  <polygon points={arrowHeadPoints(prev, tip)} className={styles.arrowHead} />
                  <text
                    x={g.label.x}
                    y={g.label.y}
                    className={styles.linkLabel}
                    textAnchor="middle"
                  >
                    {g.type}
                  </text>
                </g>
              )
            })}
          </svg>
        </div>
      </div>
    </div>
  )
}
