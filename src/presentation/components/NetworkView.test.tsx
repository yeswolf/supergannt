import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { toNetworkDiagram } from '../../application/services/ReportingService'
import { createDemoProject } from '../../application/services/ProjectFactory'
import { UuidIdGenerator } from '../../infrastructure/ids/UuidIdGenerator'
import { renderWithWorkspace } from '../../test/workspaceTestUtils'
import {
  NetworkView,
  computeNetworkLayers,
  networkColumnsThatFit,
  placeNetworkBoxes,
  routeLink,
} from './NetworkView'

describe('network routing', () => {
  it('layers successors to the right of predecessors', () => {
    const layers = computeNetworkLayers(
      ['a', 'b', 'c'],
      [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'c' },
      ],
    )
    expect(layers.get('a')).toBe(0)
    expect(layers.get('b')).toBe(1)
    expect(layers.get('c')).toBe(2)
  })

  it('wraps layer columns into a new band when viewport is narrow', () => {
    expect(networkColumnsThatFit(200)).toBe(1)
    expect(networkColumnsThatFit(500)).toBeGreaterThanOrEqual(2)

    const byLayer = new Map<number, string[]>([
      [0, ['a']],
      [1, ['b']],
      [2, ['c']],
      [3, ['d']],
    ])
    const placed = placeNetworkBoxes(byLayer, 2)
    const a = placed.boxes.get('a')!
    const b = placed.boxes.get('b')!
    const c = placed.boxes.get('c')!
    const d = placed.boxes.get('d')!
    // Band 0: a, b side by side
    expect(b.x).toBeGreaterThan(a.x)
    expect(b.y).toBe(a.y)
    // Band 1: c under a (wrap), d to the right of c
    expect(c.x).toBe(a.x)
    expect(c.y).toBeGreaterThan(a.y)
    expect(d.x).toBe(b.x)
    expect(d.y).toBe(c.y)
    // Next band starts left of previous band's last column → floor wrap
    expect(c.x).toBeLessThan(b.x)
  })

  it('routes wrap/back edges under the floor instead of a diagonal chord', () => {
    const from = { x: 400, y: 40 }
    const to = { x: 40, y: 120 }
    const points = routeLink(from, 'finish', to, 'start', 0, 200)
    expect(points.length).toBeGreaterThanOrEqual(5)
    // Must visit the floor lane (y >= 200) rather than cutting across.
    expect(points.some((p) => p.y >= 200)).toBe(true)
    // No single segment that is a long diagonal across the board.
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i]!
      const b = points[i + 1]!
      const dx = Math.abs(b.x - a.x)
      const dy = Math.abs(b.y - a.y)
      expect(dx === 0 || dy === 0).toBe(true)
    }
  })

  it('uses an elbow for forward FS links', () => {
    const points = routeLink(
      { x: 100, y: 50 },
      'finish',
      { x: 300, y: 120 },
      'start',
      0,
      400,
    )
    expect(points.some((p) => p.y >= 400)).toBe(false)
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i]!
      const b = points[i + 1]!
      expect(a.x === b.x || a.y === b.y).toBe(true)
    }
  })
})

describe('NetworkView', () => {
  it('renders demo project nodes without throwing', async () => {
    const demo = createDemoProject(new UuidIdGenerator())
    const { nodes } = toNetworkDiagram(demo)
    expect(nodes.length).toBeGreaterThan(0)

    renderWithWorkspace(<NetworkView />, { bootstrap: [{ type: 'loadDemo' }] })

    expect(screen.getByRole('heading', { name: 'Network Diagram' })).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: new RegExp(nodes[0]!.name) })).toBeInTheDocument()
    })
    for (const node of nodes.slice(0, 3)) {
      expect(screen.getByRole('button', { name: new RegExp(node.name) })).toBeInTheDocument()
    }

    expect(document.querySelector('svg[aria-hidden="true"]')).toBeTruthy()
  })
})
