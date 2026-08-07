import { useEffect, useRef, useState } from 'react'
import type {
  ColumnFilter,
  FilterField,
  FilterState,
  GroupByField,
} from '../../application/services/TaskFilterService'
import {
  defaultOperatorForField,
  fieldValueType,
  FILTERABLE_FIELDS,
  GROUP_BY_OPTIONS,
  parseFilterValue,
  toggleSort,
} from '../../application/services/TaskFilterService'
import type { SortSpec } from '../../application/services/TaskFilterService'
import styles from './FilterBar.module.css'

export interface FilterBarProps {
  state: FilterState
  onChange: (state: FilterState) => void
}

export function FilterBar({ state, onChange }: FilterBarProps) {
  return (
    <div className={styles.bar} role="toolbar" aria-label="Filter and sort tasks">
      <FilterControls state={state} onChange={onChange} />
      <SortControls state={state} onChange={onChange} />
      <GroupControls state={state} onChange={onChange} />
      {state.filters.length > 0 || state.sorts.length > 0 || state.groupBy !== 'none' ? (
        <button
          className={styles.clearBtn}
          type="button"
          onClick={() =>
            onChange({
              filters: [],
              sorts: [],
              groupBy: 'none',
              collapsedGroups: [],
            })
          }
          aria-label="Clear all filters and sorting"
        >
          Clear all
        </button>
      ) : null}
    </div>
  )
}

function FilterControls({ state, onChange }: FilterBarProps) {
  const [field, setField] = useState<FilterField>('name')
  const [value, setValue] = useState('')

  const addFilter = () => {
    const trimmed = value.trim()
    if (trimmed === '' && fieldValueType(field) !== 'boolean') return
    // Boolean fields require an explicit selection (no default on empty)
    if (fieldValueType(field) === 'boolean' && trimmed === '') return
    const op = defaultOperatorForField(field)
    const parsed = parseFilterValue(field, trimmed)
    // Skip NaN for numeric/date fields with bogus input
    if (
      typeof parsed === 'number' &&
      isNaN(parsed) &&
      trimmed !== ''
    )
      return
    const newFilter: ColumnFilter = { field, operator: op, value: parsed }
    onChange({ ...state, filters: [...state.filters, newFilter] })
    setValue('')
  }

  const removeFilter = (index: number) => {
    const filters = state.filters.filter((_, i) => i !== index)
    onChange({ ...state, filters })
  }

  const ftype = fieldValueType(field)

  return (
    <div className={styles.group}>
      <span className={styles.label}>Filter:</span>
      <select
        value={field}
        onChange={(e) => {
          setField(e.target.value as FilterField)
          setValue('')
        }}
        aria-label="Filter field"
      >
        {FILTERABLE_FIELDS.map((f) => (
          <option key={f.id} value={f.id}>
            {f.label}
          </option>
        ))}
      </select>
      {ftype === 'boolean' ? (
        <select
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
          }}
          aria-label="Filter value"
        >
          <option value="">Choose…</option>
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
      ) : (
        <input
          type={ftype === 'date' ? 'date' : 'text'}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') addFilter()
          }}
          placeholder={ftype === 'date' ? '' : 'Value…'}
          aria-label="Filter value"
        />
      )}
      <button type="button" onClick={addFilter} aria-label="Add filter">
        +
      </button>
      {state.filters.length > 0 ? (
        <ul className={styles.chipList}>
          {state.filters.map((f, i) => (
            <li key={`${f.field}-${i}`} className={styles.chip}>
              <span className={styles.chipField}>
                {FILTERABLE_FIELDS.find((ff) => ff.id === f.field)?.label ??
                  f.field}
              </span>
              <span className={styles.chipOp}>{f.operator}</span>
              <span className={styles.chipVal}>{formatFilterValue(f)}</span>
              <button
                type="button"
                onClick={() => removeFilter(i)}
                aria-label={`Remove ${f.field} filter`}
                className={styles.chipRemove}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function formatFilterValue(f: ColumnFilter): string {
  if (typeof f.value === 'boolean') return f.value ? 'Yes' : 'No'
  if (fieldValueType(f.field) === 'date' && typeof f.value === 'number' && !isNaN(f.value)) {
    // Epoch timestamp from date filter — render as locale date
    return new Date(f.value).toLocaleDateString()
  }
  return String(f.value)
}

/** Human label for a sort field id, e.g. 'percent' → '% Complete'. */
function sortFieldLabel(field: FilterField): string {
  return FILTERABLE_FIELDS.find((f) => f.id === field)?.label ?? field
}

function SortControls({ state, onChange }: FilterBarProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('click', onDocClick, true)
    return () => document.removeEventListener('click', onDocClick, true)
  }, [open])

  const addSort = (field: FilterField, additive: boolean) => {
    const next = toggleSort(state.sorts, field, additive)
    onChange({ ...state, sorts: next })
    setOpen(false)
  }

  const fieldLabel = (spec: SortSpec): string =>
    `${sortFieldLabel(spec.field)} ${spec.direction === 'asc' ? '↑' : '↓'}`

  return (
    <div ref={containerRef} className={styles.group} style={{ position: 'relative' }}>
      <span className={styles.label}>Sort</span>
      <button
        type="button"
        className={styles.clearBtn}
        onClick={() => setOpen((o) => !o)}
        aria-label="Add sort"
      >
        + Sort
      </button>
      {open ? (
        <div
          role="menu"
          title="Click a field to sort. Hold Ctrl/Cmd/Shift to add a secondary sort column."
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            zIndex: 50,
            background: 'var(--panel-bg, #fff)',
            border: '1px solid var(--border, #ccc)',
            borderRadius: 4,
            boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
            padding: 4,
            minWidth: 200,
          }}
        >
          {FILTERABLE_FIELDS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="menuitem"
              onClick={(e) =>
                addSort(f.id, e.ctrlKey || e.metaKey || e.shiftKey)
              }
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '4px 8px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      ) : null}
      {state.sorts.length > 0 ? (
        <ul className={styles.chipList}>
          {state.sorts.map((s, i) => (
            <li key={`${s.field}-${i}`} className={styles.chip}>
              <span className={styles.chipField}>{fieldLabel(s)}</span>
              <button
                type="button"
                onClick={() => {
                  const next = state.sorts.filter(
                    (_, j) => j !== i,
                  )
                  onChange({ ...state, sorts: next })
                }}
                aria-label={`Remove sort by ${sortFieldLabel(s.field)}`}
                className={styles.chipRemove}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {state.sorts.length > 0 ? (
        <button
          type="button"
          className={styles.clearBtn}
          onClick={() => onChange({ ...state, sorts: [] })}
          aria-label="Clear sorting"
        >
          Clear
        </button>
      ) : null}
    </div>
  )
}

function GroupControls({ state, onChange }: FilterBarProps) {
  return (
    <div className={styles.group}>
      <label className={styles.label} htmlFor="group-by-select">
        Group by:
      </label>
      <select
        id="group-by-select"
        value={state.groupBy}
        onChange={(e) =>
          onChange({
            ...state,
            groupBy: e.target.value as GroupByField,
            collapsedGroups: [],
          })
        }
        aria-label="Group tasks by"
      >
        {GROUP_BY_OPTIONS.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  )
}
