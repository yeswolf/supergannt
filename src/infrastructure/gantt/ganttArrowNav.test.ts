import { describe, expect, it } from 'vitest'
import { adjacentVisibleTaskId } from './ganttArrowNav'

describe('adjacentVisibleTaskId', () => {
  const ids = ['a', 'b', 'c']
  const taskIdAt = (i: number) => ids[i] ?? null

  it('selects first/last when nothing is selected', () => {
    expect(
      adjacentVisibleTaskId({
        currentId: null,
        direction: 1,
        visibleCount: 3,
        taskIdAt,
      }),
    ).toBe('a')
    expect(
      adjacentVisibleTaskId({
        currentId: null,
        direction: -1,
        visibleCount: 3,
        taskIdAt,
      }),
    ).toBe('c')
  })

  it('moves up and down within bounds', () => {
    expect(
      adjacentVisibleTaskId({
        currentId: 'b',
        direction: 1,
        visibleCount: 3,
        taskIdAt,
      }),
    ).toBe('c')
    expect(
      adjacentVisibleTaskId({
        currentId: 'b',
        direction: -1,
        visibleCount: 3,
        taskIdAt,
      }),
    ).toBe('a')
  })

  it('stays put at the ends', () => {
    expect(
      adjacentVisibleTaskId({
        currentId: 'a',
        direction: -1,
        visibleCount: 3,
        taskIdAt,
      }),
    ).toBe('a')
    expect(
      adjacentVisibleTaskId({
        currentId: 'c',
        direction: 1,
        visibleCount: 3,
        taskIdAt,
      }),
    ).toBe('c')
  })
})
