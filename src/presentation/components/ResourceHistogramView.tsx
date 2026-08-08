import { useMemo, useState, useCallback, useRef } from 'react'
import { useWorkspaceState } from '../state/WorkspaceContext'
import { computeResourceHistogram, type PeriodBucket, type HistogramGranularity } from '../../application/services/ReportingService'
import { ViewHeader } from './ViewHeader'
import styles from './ResourceHistogramView.module.css'

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function ResourceHistogramView() {
  const { project } = useWorkspaceState()
  const [granularity, setGranularity] = useState<HistogramGranularity>('week')
  const [filterText, setFilterText] = useState('')
  const [scrollOffset, setScrollOffset] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const allData = useMemo(() => {
    return computeResourceHistogram(project, granularity)
  }, [project, granularity])

  const resourceIds = useMemo(() => {
    const ids = new Set<string>()
    for (const bucket of allData) {
      ids.add(bucket.resourceId)
    }
    return [...ids]
  }, [allData])

  const resourceNames = useMemo(() => {
    const map = new Map<string, string>()
    for (const bucket of allData) {
      map.set(bucket.resourceId, bucket.resourceName)
    }
    return map
  }, [allData])

  const filteredResourceIds = useMemo(() => {
    if (!filterText.trim()) return resourceIds
    const lower = filterText.toLowerCase()
    return resourceIds.filter((id) => {
      const name = resourceNames.get(id) ?? ''
      return name.toLowerCase().includes(lower)
    })
  }, [resourceIds, resourceNames, filterText])

  const periodDates = useMemo(() => {
    const dates = new Set<string>()
    for (const bucket of allData) {
      dates.add(bucket.periodStart)
    }
    return [...dates].sort()
  }, [allData])

  const dataByResource = useMemo(() => {
    const map = new Map<string, Map<string, PeriodBucket>>()
    for (const bucket of allData) {
      let inner = map.get(bucket.resourceId)
      if (!inner) {
        inner = new Map()
        map.set(bucket.resourceId, inner)
      }
      inner.set(bucket.periodStart, bucket)
    }
    return map
  }, [allData])

  const maxHours = useMemo(() => {
    let m = 1
    for (const bucket of allData) {
      m = Math.max(m, bucket.allocatedHours, bucket.capacityHours)
    }
    return m
  }, [allData])

  const formatPeriodLabel = useCallback(
    (dateStr: string) => {
      const d = new Date(dateStr + 'T00:00:00')
      if (granularity === 'day') {
        return `${d.getMonth() + 1}/${d.getDate()}`
      }
      if (granularity === 'month') {
        return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`
      }
      // week
      return `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`
    },
    [granularity],
  )

  const handleGranularityChange = useCallback(
    (g: HistogramGranularity) => {
      setGranularity(g)
      setScrollOffset(0)
    },
    [],
  )

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        setScrollOffset(0)
        if (e.deltaY < 0) {
          setGranularity((g) => (g === 'month' ? 'week' : g === 'week' ? 'day' : 'day'))
        } else {
          setGranularity((g) => (g === 'day' ? 'week' : g === 'week' ? 'month' : 'month'))
        }
        return
      }
      setScrollOffset((s) => Math.max(0, s + (e.deltaX !== 0 ? e.deltaX : e.deltaY)))
    },
    // Dependency array intentionally empty — both setGranularity and
    // setScrollOffset are state updaters with stable identity (React
    // guarantees this for useState setters), so this callback never
    // needs to be recreated.
    [],
  )

  const scrollOffsetRef = useRef(scrollOffset)
  scrollOffsetRef.current = scrollOffset

  const handleDrag = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const container = containerRef.current
    if (!container) return
    const startX = e.clientX
    const startOffset = scrollOffsetRef.current

    const onMove = (ev: MouseEvent) => {
      const dx = startX - ev.clientX
      setScrollOffset(Math.max(0, startOffset + dx))
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [])

  const COL_WIDTH = granularity === 'day' ? 40 : granularity === 'week' ? 56 : 80
  const ROW_HEIGHT = 36
  const NAME_WIDTH = 160
  const chartWidth = periodDates.length * COL_WIDTH

  return (
    <div className={styles.panel}>
      <ViewHeader title="Resource Histogram" />

      <div className={styles.toolbar}>
        <div className={styles.scaleButtons}>
          {(['day', 'week', 'month'] as const).map((g) => (
            <button
              key={g}
              type="button"
              className={granularity === g ? styles.scaleActive : styles.scaleBtn}
              onClick={() => handleGranularityChange(g)}
            >
              {g.charAt(0).toUpperCase() + g.slice(1)}
            </button>
          ))}
        </div>
        <input
          type="text"
          className={styles.filterInput}
          placeholder="Filter resources…"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
        />
        <span className={styles.hint}>
          Scroll to pan · Ctrl+scroll to zoom
        </span>
      </div>

      <div
        ref={containerRef}
        className={styles.chartWrap}
        onWheel={handleWheel}
      >
        <div className={styles.chart} style={{ minWidth: NAME_WIDTH + chartWidth }}>
          {/* Header row with period labels */}
          <div className={styles.headerRow} style={{ paddingLeft: NAME_WIDTH }}>
            {periodDates.map((d) => (
              <div
                key={d}
                className={styles.periodLabel}
                style={{ width: COL_WIDTH }}
              >
                {formatPeriodLabel(d)}
              </div>
            ))}
          </div>

          {/* Resource rows */}
          <div
            className={styles.rowsWrap}
            onMouseDown={handleDrag}
            style={{ transform: `translateX(-${scrollOffset}px)` }}
          >
            {filteredResourceIds.map((resourceId) => {
              const bucketMap = dataByResource.get(resourceId)
              if (!bucketMap) return null
              return (
                <div key={resourceId} className={styles.resourceRow}>
                  <div className={styles.resourceName} style={{ width: NAME_WIDTH }}>
                    {resourceNames.get(resourceId) ?? 'Unknown'}
                  </div>
                  <div className={styles.barRow}>
                    {periodDates.map((d) => {
                      const bucket = bucketMap.get(d)
                      if (!bucket || bucket.allocatedHours === 0) {
                        return (
                          <div
                            key={d}
                            className={styles.emptyCell}
                            style={{ width: COL_WIDTH, height: ROW_HEIGHT }}
                          />
                        )
                      }
                      const barHeight = Math.max(4, (bucket.allocatedHours / maxHours) * (ROW_HEIGHT - 4))
                      const capacityHeight = Math.max(1, (bucket.capacityHours / maxHours) * (ROW_HEIGHT - 4))
                      const isOver = bucket.overallocated
                      const pct = bucket.capacityHours > 0
                        ? Math.round((bucket.allocatedHours / bucket.capacityHours) * 100)
                        : 0
                      const taskList = bucket.taskIds.slice(0, 3).join(', ')
                      const more = bucket.taskIds.length > 3
                        ? ` +${bucket.taskIds.length - 3} more`
                        : ''
                      return (
                        <div
                          key={d}
                          className={styles.barCell}
                          style={{ width: COL_WIDTH, height: ROW_HEIGHT }}
                          title={`${bucket.resourceName}: ${bucket.allocatedHours.toFixed(1)}h allocated / ${bucket.capacityHours.toFixed(1)}h capacity (${pct}%)${bucket.overallocated ? ' — OVERALLOCATED' : ''}\nTasks: ${taskList}${more}`}
                        >
                          <div
                            className={
                              isOver ? styles.barOverallocated : styles.bar
                            }
                            style={{
                              height: barHeight,
                              width: Math.max(2, COL_WIDTH - 6),
                            }}
                          />
                          {/* Capacity marker line */}
                          <div
                            className={styles.capacityLine}
                            style={{
                              bottom: capacityHeight,
                              width: COL_WIDTH - 2,
                            }}
                          />
                          <span className={styles.barLabel}>
                            {bucket.allocatedHours.toFixed(0)}h
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className={styles.legend}>
        <span className={styles.legendItem}>
          <span className={styles.legendSwatch} style={{ background: 'var(--histogram-ok)' }} />
          Allocated
        </span>
        <span className={styles.legendItem}>
          <span className={styles.legendSwatch} style={{ background: 'var(--histogram-overallocated)' }} />
          Overallocated
        </span>
        <span className={styles.legendItem}>
          <span className={styles.legendLine} style={{ background: 'var(--histogram-capacity-line)' }} />
          Capacity
        </span>
      </div>
    </div>
  )
}
