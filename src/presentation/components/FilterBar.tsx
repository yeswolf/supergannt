import { type ChangeEvent, type ReactNode, useId, useState } from 'react'
import {
  type ColumnFilter,
  type FilterValue,
  type TaskGroupField,
  type TaskSort,
  type TaskFilterSortState,
} from '../../application/services/TaskFilterSortService'
import type { TaskColumnId } from '../taskColumns/taskColumnDefs'
import {
  TASK_SHEET_LABELS,
  TASK_COLUMN_IDS,
} from '../taskColumns/taskColumnDefs'
import { IconAction } from './IconAction'
import styles from './FilterBar.module.css'

interface Props {
  state: TaskFilterSortState
  onSetFilter: (filter: ColumnFilter) => void
  onRemoveFilter: (filterId: string) => void
  onClearFilters: () => void
  onSetSort: (sort: TaskSort | null) => void
  onSetGroup: (groupBy: TaskGroupField) => void
}

/** Columns that support text filtering. */
const TEXT_FILTER_COLUMNS: readonly TaskColumnId[] = ['name', 'wbs']

/** Columns that support numeric range filtering. */
const NUMERIC_FILTER_COLUMNS: readonly TaskColumnId[] = [
  'duration',
  'percent',
  'totalSlack',
  'freeSlack',
]

/** Columns that support date range filtering. */
const DATE_FILTER_COLUMNS: readonly TaskColumnId[] = ['start', 'finish']

/** Columns that support boolean filtering. */
const BOOLEAN_FILTER_COLUMNS: readonly TaskColumnId[] = [
  'resources', // treated as "has resource"
  'milestone',
  'critical',
  'summary',
]

/** Columns available for sorting. */
const SORTABLE_COLUMNS: readonly TaskColumnId[] = [
  'id',
  'wbs',
  'name',
  'duration',
  'percent',
  'start',
  'finish',
  'totalSlack',
  'freeSlack',
  'cost',
]

const GROUP_FIELDS: { value: TaskGroupField; label: string }[] = [
  { value: 'none', label: 'No grouping' },
  { value: 'resource', label: 'Resource' },
  { value: 'status', label: 'Status' },
  { value: 'outlineLevel', label: 'Outline Level' },
]

function generateFilterId(): string {
  return crypto.randomUUID()
}

export function FilterBar({
  state,
  onSetFilter,
  onRemoveFilter,
  onClearFilters,
  onSetSort,
  onSetGroup,
}: Props) {
  const [adding, setAdding] = useState(false)
  const [addCol, setAddCol] = useState<TaskColumnId>('name')
  const [textValue, setTextValue] = useState('')
  const [numMin, setNumMin] = useState('')
  const [numMax, setNumMax] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [boolValue, setBoolValue] = useState(true)

  const hasActiveFilters =
    state.filters.length > 0 || state.sort !== null || state.groupBy !== 'none'

  const addFilter = () => {
    let filter: FilterValue
    if (TEXT_FILTER_COLUMNS.includes(addCol)) {
      if (!textValue.trim()) return
      filter = { type: 'textContains', value: textValue.trim() }
    } else if (NUMERIC_FILTER_COLUMNS.includes(addCol)) {
      filter = {
        type: 'numericRange',
        min: numMin !== '' ? Number(numMin) : undefined,
        max: numMax !== '' ? Number(numMax) : undefined,
      }
      if (filter.min === undefined && filter.max === undefined) return
    } else if (DATE_FILTER_COLUMNS.includes(addCol)) {
      if (!dateFrom && !dateTo) return
      filter = {
        type: 'dateRange',
        from: dateFrom || undefined,
        to: dateTo || undefined,
      }
    } else if (BOOLEAN_FILTER_COLUMNS.includes(addCol)) {
      filter = { type: 'boolean', value: boolValue }
    } else {
      return
    }
    onSetFilter({ id: generateFilterId(), column: addCol, filter })
    setTextValue('')
    setNumMin('')
    setNumMax('')
    setDateFrom('')
    setDateTo('')
    setAdding(false)
  }

  const renderFilterInputs = (): ReactNode => {
    if (TEXT_FILTER_COLUMNS.includes(addCol)) {
      return (
        <input
          type="text"
          className={`${styles.controlBase} ${styles.filterInput}`}
          placeholder={`Contains…`}
          value={textValue}
          onChange={(e) => setTextValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') addFilter()
          }}
        />
      )
    }
    if (NUMERIC_FILTER_COLUMNS.includes(addCol)) {
      return (
        <>
          <input
            type="number"
            className={`${styles.controlBase} ${styles.numInput}`}
            placeholder="Min"
            value={numMin}
            onChange={(e) => setNumMin(e.target.value)}
          />
          <span className={styles.rangeSep}>–</span>
          <input
            type="number"
            className={`${styles.controlBase} ${styles.numInput}`}
            placeholder="Max"
            value={numMax}
            onChange={(e) => setNumMax(e.target.value)}
          />
        </>
      )
    }
    if (DATE_FILTER_COLUMNS.includes(addCol)) {
      return (
        <>
          <input
            type="date"
            className={`${styles.controlBase} ${styles.filterInput}`}
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
          <span className={styles.rangeSep}>–</span>
          <input
            type="date"
            className={`${styles.controlBase} ${styles.filterInput}`}
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </>
      )
    }
    if (BOOLEAN_FILTER_COLUMNS.includes(addCol)) {
      return (
        <label className={styles.booleanLabel}>
          <input
            type="checkbox"
            checked={boolValue}
            onChange={(e) => setBoolValue(e.target.checked)}
          />{' '}
          {boolValue ? 'Yes' : 'No'}
        </label>
      )
    }
    return null
  }

  return (
    <div className={styles.bar}>
      <div className={styles.left}>
        <IconAction
          icon="filter"
          label="Toggle filter"
          title="Add filter"
          pressed={adding || hasActiveFilters}
          onClick={() => setAdding((v) => !v)}
        />

        {adding ? (
          <>
            <select
              className={`${styles.controlBase} ${styles.select}`}
              value={addCol}
              onChange={(e) => setAddCol(e.target.value as TaskColumnId)}
            >
              {TASK_COLUMN_IDS.filter(
                (id) =>
                  TEXT_FILTER_COLUMNS.includes(id) ||
                  NUMERIC_FILTER_COLUMNS.includes(id) ||
                  DATE_FILTER_COLUMNS.includes(id) ||
                  BOOLEAN_FILTER_COLUMNS.includes(id),
              ).map((id) => (
                <option key={id} value={id}>
                  {TASK_SHEET_LABELS[id]}
                </option>
              ))}
            </select>
            {renderFilterInputs()}
            <IconAction icon="ok" label="Apply filter" onClick={addFilter} />
          </>
        ) : null}

        {state.filters.map((f) => (
          <span key={f.id} className={styles.chip}>
            <span className={styles.chipCol}>{TASK_SHEET_LABELS[f.column]}</span>
            <span className={styles.chipVal}>{describeFilter(f.filter)}</span>
            <button
              type="button"
              className={styles.chipRemove}
              aria-label={`Remove filter on ${TASK_SHEET_LABELS[f.column]}`}
              onClick={() => onRemoveFilter(f.id)}
            >
              ×
            </button>
          </span>
        ))}

        {/* Sort indicator */}
        <select
          className={`${styles.controlBase} ${styles.select}`}
          value={state.sort?.column ?? ''}
          aria-label="Sort by"
          onChange={(e) => {
            const col = e.target.value as TaskColumnId | ''
            if (!col) {
              onSetSort(null)
            } else {
              onSetSort({
                column: col,
                direction: state.sort?.direction ?? 'asc',
              })
            }
          }}
        >
          <option value="">Sort…</option>
          {SORTABLE_COLUMNS.map((id) => (
            <option key={id} value={id}>
              {TASK_SHEET_LABELS[id]}
            </option>
          ))}
        </select>
        {state.sort ? (
          <IconAction
            icon={state.sort.direction === 'asc' ? 'sortAsc' : 'sortDesc'}
            label={
              state.sort.direction === 'asc' ? 'Ascending' : 'Descending'
            }
            onClick={() =>
              onSetSort({
                ...state.sort,
                direction: state.sort!.direction === 'asc' ? 'desc' : 'asc',
              })
            }
          />
        ) : null}

        {/* Grouping */}
        <select
          className={`${styles.controlBase} ${styles.select}`}
          value={state.groupBy}
          aria-label="Group by"
          onChange={(e) => onSetGroup(e.target.value as TaskGroupField)}
        >
          {GROUP_FIELDS.map((g) => (
            <option key={g.value} value={g.value}>
              {g.label}
            </option>
          ))}
        </select>

        {hasActiveFilters ? (
          <IconAction
            icon="cancel"
            label="Clear all filters"
            title="Clear all filters, sort, and grouping"
            onClick={onClearFilters}
          />
        ) : null}
      </div>

      {hasActiveFilters ? (
        <div className={styles.summary}>
          {state.filters.length > 0 ? `${state.filters.length} filter(s)` : ''}
          {state.sort ? ' · Sorted' : ''}
          {state.groupBy !== 'none'
            ? ` · Grouped by ${GROUP_FIELDS.find((g) => g.value === state.groupBy)?.label ?? state.groupBy}`
            : ''}
        </div>
      ) : null}
    </div>
  )
}

function describeFilter(f: FilterValue): string {
  switch (f.type) {
    case 'textContains':
      return `contains "${f.value}"`
    case 'textEquals':
      return `= "${f.value}"`
    case 'numericRange': {
      if (f.min !== undefined && f.max !== undefined) return `${f.min}–${f.max}`
      if (f.min !== undefined) return `≥ ${f.min}`
      return `≤ ${f.max}`
    }
    case 'dateRange': {
      if (f.from && f.to) return `${f.from} … ${f.to}`
      if (f.from) return `from ${f.from}`
      return `to ${f.to}`
    }
    case 'boolean':
      return f.value ? 'Yes' : 'No'
  }
}
