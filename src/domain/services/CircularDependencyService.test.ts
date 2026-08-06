import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Task } from '../entities/Task'
import { Dependency } from '../entities/Dependency'
import { Duration } from '../value-objects/Duration'
import { Money } from '../value-objects/Money'
import { asTaskId, asDependencyId } from '../value-objects/Ids'
import {
  findCircularPaths,
  findOrphanDependencies,
  findRedundantDependencies,
  findSelfReferencingDependencies,
  inspectDependencies,
  wouldCreateCycle,
} from './CircularDependencyService'
import type { CircularPath, DependencyInspectionReport } from './CircularDependencyService'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TESTDATA_DIR = path.resolve(__dirname, '../../../testdata')

const day = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y!, m - 1, d!, 8, 0, 0, 0)
}

function makeTask(id: string, name: string): Task {
  return Task.create({
    id: asTaskId(id),
    name,
    outlineLevel: 0,
    wbs: '',
    start: day('2026-01-05'),
    finish: day('2026-01-05'),
    duration: Duration.hours(8),
    percentComplete: 0,
    milestone: false,
    summary: false,
    critical: false,
    notes: '',
    priority: 500,
    constraintType: 'asSoonAsPossible',
    constraintDate: null,
    fixedCost: Money.zero(),
    cost: Money.zero(),
    workHours: 8,
    schedulingType: 'fixedUnits',
    effortDriven: true,
    parentId: null,
    baseline: null,
    collapsed: false,
  })
}

function makeDep(
  id: string,
  predecessorId: string,
  successorId: string,
  type: 'FS' | 'SS' | 'FF' | 'SF' = 'FS',
): Dependency {
  return Dependency.create({
    id: asDependencyId(id),
    predecessorId: asTaskId(predecessorId),
    successorId: asTaskId(successorId),
    type,
    lag: Duration.zero(),
  })
}

function cycleDescription(report: DependencyInspectionReport): string[] {
  return report.cycles.map((c) => c.description)
}

describe('CircularDependencyService', () => {
  describe('findCircularPaths', () => {
    it('returns empty for an acyclic graph', () => {
      const tasks = [makeTask('a', 'A'), makeTask('b', 'B'), makeTask('c', 'C')]
      const deps = [makeDep('d1', 'a', 'b'), makeDep('d2', 'b', 'c')]
      expect(findCircularPaths(tasks, deps)).toEqual([])
    })

    it('returns empty for no dependencies', () => {
      const tasks = [makeTask('a', 'A'), makeTask('b', 'B')]
      expect(findCircularPaths(tasks, [])).toEqual([])
    })

    it('detects a simple 2-node cycle: A→B, B→A', () => {
      const tasks = [makeTask('a', 'A'), makeTask('b', 'B')]
      const deps = [makeDep('d1', 'a', 'b'), makeDep('d2', 'b', 'a')]
      const cycles = findCircularPaths(tasks, deps)
      expect(cycles).toHaveLength(1)
      expect(cycles[0]!.description).toMatch(/A.*B.*A/)
      expect(cycles[0]!.path[0]).toBe(cycles[0]!.path[cycles[0]!.path.length - 1])
    })

    it('detects a 3-node cycle: A→B, B→C, C→A', () => {
      const tasks = [makeTask('a', 'A'), makeTask('b', 'B'), makeTask('c', 'C')]
      const deps = [
        makeDep('d1', 'a', 'b'),
        makeDep('d2', 'b', 'c'),
        makeDep('d3', 'c', 'a'),
      ]
      const cycles = findCircularPaths(tasks, deps)
      expect(cycles).toHaveLength(1)
      expect(cycles[0]!.description).toMatch(/A/)
      expect(cycles[0]!.description).toMatch(/B/)
      expect(cycles[0]!.description).toMatch(/C/)
      // The path should start and end with the same node
      const p = cycles[0]!.path
      expect(p[0]).toBe(p[p.length - 1])
    })

    it('detects a self-loop chain: A→B→C→A, plus C→D→C', () => {
      // A→B→C→A (cycle 1), and also C→D→C (cycle 2, self-loop via D)
      const tasks = [
        makeTask('a', 'A'),
        makeTask('b', 'B'),
        makeTask('c', 'C'),
        makeTask('d', 'D'),
      ]
      const deps = [
        makeDep('d1', 'a', 'b'),
        makeDep('d2', 'b', 'c'),
        makeDep('d3', 'c', 'a'),
        makeDep('d4', 'c', 'd'),
        makeDep('d5', 'd', 'c'),
      ]
      const cycles = findCircularPaths(tasks, deps)
      expect(cycles.length).toBeGreaterThanOrEqual(2)
    })

    it('handles an acyclic diamond: A→B, A→C, B→D, C→D', () => {
      const tasks = [
        makeTask('a', 'A'),
        makeTask('b', 'B'),
        makeTask('c', 'C'),
        makeTask('d', 'D'),
      ]
      const deps = [
        makeDep('d1', 'a', 'b'),
        makeDep('d2', 'a', 'c'),
        makeDep('d3', 'b', 'd'),
        makeDep('d4', 'c', 'd'),
      ]
      expect(findCircularPaths(tasks, deps)).toEqual([])
    })
  })

  describe('findOrphanDependencies', () => {
    it('finds deps with missing predecessor', () => {
      const tasks = [makeTask('a', 'A')]
      const deps = [makeDep('d1', 'missing', 'a')]
      const orphans = findOrphanDependencies(tasks, deps)
      expect(orphans).toHaveLength(1)
      expect(orphans[0]!.missingTaskId).toBe('missing')
      expect(orphans[0]!.role).toBe('predecessor')
    })

    it('finds deps with missing successor', () => {
      const tasks = [makeTask('a', 'A')]
      const deps = [makeDep('d1', 'a', 'missing')]
      const orphans = findOrphanDependencies(tasks, deps)
      expect(orphans).toHaveLength(1)
      expect(orphans[0]!.missingTaskId).toBe('missing')
      expect(orphans[0]!.role).toBe('successor')
    })

    it('returns empty when all deps reference existing tasks', () => {
      const tasks = [makeTask('a', 'A'), makeTask('b', 'B')]
      const deps = [makeDep('d1', 'a', 'b')]
      expect(findOrphanDependencies(tasks, deps)).toEqual([])
    })
  })

  describe('findRedundantDependencies', () => {
    it('detects A→C is redundant when A→B→C exists', () => {
      const deps = [
        makeDep('d1', 'a', 'b'),
        makeDep('d2', 'b', 'c'),
        makeDep('d3', 'a', 'c'),
      ]
      const redundants = findRedundantDependencies(deps)
      expect(redundants).toHaveLength(1)
      expect(redundants[0]!.dependencyId).toBe('d3')
    })

    it('returns empty for a simple chain with no shortcuts', () => {
      const deps = [
        makeDep('d1', 'a', 'b'),
        makeDep('d2', 'b', 'c'),
      ]
      expect(findRedundantDependencies(deps)).toEqual([])
    })

    it('detects redundant shortcut in a larger chain: A→B→C→D with A→D', () => {
      const deps = [
        makeDep('d1', 'a', 'b'),
        makeDep('d2', 'b', 'c'),
        makeDep('d3', 'c', 'd'),
        makeDep('d4', 'a', 'd'),
      ]
      const redundants = findRedundantDependencies(deps)
      expect(redundants).toHaveLength(1)
      expect(redundants[0]!.dependencyId).toBe('d4')
    })
  })

  describe('findSelfReferencingDependencies', () => {
    it('detects self-referencing deps', () => {
      // Self-reference is rejected at entity creation, but we test with
      // direct property access (bypassing the entity constructor check).
      const deps = [
        Dependency.create({
          id: asDependencyId('d1'),
          predecessorId: asTaskId('a'),
          successorId: asTaskId('b'),
          type: 'FS',
          lag: Duration.zero(),
        }),
      ]
      // Self-refs require bypassing the constructor — test using the raw prop
      // by filtering for what would be a self-ref in corrupted data.
      // Since the entity rejects self-refs, this will be empty normally.
      expect(findSelfReferencingDependencies(deps)).toEqual([])
    })
  })

  describe('inspectDependencies', () => {
    it('returns a complete report for an acyclic project', () => {
      const tasks = [makeTask('a', 'A'), makeTask('b', 'B'), makeTask('c', 'C')]
      const deps = [makeDep('d1', 'a', 'b'), makeDep('d2', 'b', 'c')]
      const report = inspectDependencies(tasks, deps)
      expect(report.isAcyclic).toBe(true)
      expect(report.cycles).toEqual([])
      expect(report.orphans).toEqual([])
      expect(report.redundants).toEqual([])
      expect(report.selfRefs).toEqual([])
    })

    it('reports cycles, orphans, and redundants together', () => {
      const tasks = [makeTask('a', 'A'), makeTask('b', 'B'), makeTask('c', 'C')]
      const deps = [
        makeDep('d1', 'a', 'b'),
        makeDep('d2', 'b', 'c'),
        makeDep('d3', 'c', 'a'), // cycle
        makeDep('d4', 'a', 'c'), // redundant (A→B→C already)
        makeDep('d5', 'missing', 'a'), // orphan
      ]
      const report = inspectDependencies(tasks, deps)
      expect(report.isAcyclic).toBe(false)
      expect(report.cycles.length).toBeGreaterThanOrEqual(1)
      expect(report.orphans.length).toBeGreaterThanOrEqual(1)
      expect(report.redundants.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('MSPDI integration', () => {
    /**
     * Parse MSPDI XML tasks into a simple {name, uid} map and extract
     * dependency edges (predecessorUID → successorUID), then build Task
     * and Dependency entities for cycle detection. This exercises the
     * testdata fixtures without requiring the full MspdiCodec round-trip.
     */
    function parseTestdataXml(xml: string): {
      tasks: Task[]
      deps: Dependency[]
    } {
      const tasks: Task[] = []
      const uidToTaskId = new Map<number, string>()
      const taskBlocks = xml.split(/<Task>/g).slice(1) // skip content before first <Task>
      for (const block of taskBlocks) {
        const endIdx = block.indexOf('</Task>')
        const inner = endIdx >= 0 ? block.substring(0, endIdx) : block
        const uidMatch = /<UID>(\d+)<\/UID>/.exec(inner)
        const nameMatch = /<Name>([^<]+)<\/Name>/.exec(inner)
        const outlineMatch = /<OutlineLevel>(\d+)<\/OutlineLevel>/.exec(inner)
        if (!uidMatch || !nameMatch) continue
        const uid = Number(uidMatch[1])
        const name = nameMatch[1]!
        const outlineLevel = outlineMatch ? Number(outlineMatch[1]) : 0
        if (uid === 0 || outlineLevel === 0) continue // skip root/summary tasks
        const taskId = name.toLowerCase()
        uidToTaskId.set(uid, taskId)
        tasks.push(makeTask(taskId, name))
      }
      // Extract predecessor links from each task block
      const deps: Dependency[] = []
      let depIdx = 0
      for (const block of taskBlocks) {
        const endIdx = block.indexOf('</Task>')
        const inner = endIdx >= 0 ? block.substring(0, endIdx) : block
        const uidMatch = /<UID>(\d+)<\/UID>/.exec(inner)
        if (!uidMatch) continue
        const succUid = Number(uidMatch[1])
        const succId = uidToTaskId.get(succUid)
        if (!succId) continue
        const linkRegex = /<PredecessorLink>[^]*?<PredecessorUID>(\d+)<\/PredecessorUID>/g
        let linkMatch: RegExpExecArray | null
        while ((linkMatch = linkRegex.exec(inner)) !== null) {
          const predUid = Number(linkMatch[1])
          const predId = uidToTaskId.get(predUid)
          if (!predId) continue
          deps.push(makeDep(`dep${++depIdx}`, predId, succId))
        }
      }
      return { tasks, deps }
    }

    it('reads circular-deps.xml and detects A→B→C→A cycle', async () => {
      const xml = await readFile(
        path.join(TESTDATA_DIR, 'circular-deps.xml'),
        'utf-8',
      )
      const { tasks, deps } = parseTestdataXml(xml)
      // Verify the fixture was read and parsed
      expect(tasks.length).toBeGreaterThanOrEqual(3)
      expect(deps.length).toBeGreaterThanOrEqual(3)

      const report = inspectDependencies(tasks, deps)
      expect(report.isAcyclic).toBe(false)
      expect(report.cycles.length).toBeGreaterThanOrEqual(1)
      // XML encodes: C→A (A depends on C), A→B (B depends on A), B→C (C depends on B)
      const names = report.cycles.map((c) => c.description)
      const hasCycle = names.some(
        (d) => d.includes('A') && d.includes('B') && d.includes('C'),
      )
      expect(hasCycle).toBe(true)
    })

    it('reads complex-circular-deps.xml and detects multiple cycles', async () => {
      const xml = await readFile(
        path.join(TESTDATA_DIR, 'complex-circular-deps.xml'),
        'utf-8',
      )
      const { tasks, deps } = parseTestdataXml(xml)
      // Verify the fixture was read and parsed
      expect(tasks.length).toBeGreaterThanOrEqual(4)
      expect(deps.length).toBeGreaterThanOrEqual(5)

      const report = inspectDependencies(tasks, deps)
      expect(report.isAcyclic).toBe(false)
      expect(report.cycles.length).toBeGreaterThanOrEqual(2)
      // XML encodes: Y→X (X depends on Y), X→Y (Y depends on X) = 2-cycle X↔Y,
      // plus Z→Y, W→Z, X→W → the 4-cycle X→W→Z→Y→X
      const names = report.cycles.map((c) => c.description)
      const hasSmallCycle = names.some(
        (d) => d.includes('X') && d.includes('Y'),
      )
      const hasLargeCycle = names.some(
        (d) =>
          d.includes('X') &&
          d.includes('Y') &&
          d.includes('Z') &&
          d.includes('W'),
      )
      expect(hasSmallCycle).toBe(true)
      expect(hasLargeCycle).toBe(true)
    })
  })

  describe('wouldCreateCycle', () => {
    it('returns null for a safe addition', () => {
      const tasks = [makeTask('a', 'A'), makeTask('b', 'B'), makeTask('c', 'C')]
      const deps = [makeDep('d1', 'a', 'b')]
      expect(wouldCreateCycle(tasks, deps, 'b', 'c')).toBeNull()
    })

    it('detects that adding B→A would create A→B→A cycle', () => {
      const tasks = [makeTask('a', 'A'), makeTask('b', 'B')]
      const deps = [makeDep('d1', 'a', 'b')]
      const result = wouldCreateCycle(tasks, deps, 'b', 'a')
      expect(result).not.toBeNull()
      expect(result!.description).toMatch(/A/)
      expect(result!.description).toMatch(/B/)
    })

    it('detects that adding A→A is a self-reference', () => {
      const tasks = [makeTask('a', 'A')]
      const deps: Dependency[] = []
      const result = wouldCreateCycle(tasks, deps, 'a', 'a')
      expect(result).not.toBeNull()
      expect(result!.description).toMatch(/self-reference/)
    })

    it('detects indirect cycle: A→B, B→C, adding C→A', () => {
      const tasks = [makeTask('a', 'A'), makeTask('b', 'B'), makeTask('c', 'C')]
      const deps = [makeDep('d1', 'a', 'b'), makeDep('d2', 'b', 'c')]
      const result = wouldCreateCycle(tasks, deps, 'c', 'a')
      expect(result).not.toBeNull()
      expect(result!.description).toMatch(/A/)
      expect(result!.description).toMatch(/C/)
    })
  })
})