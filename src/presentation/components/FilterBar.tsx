import { useState } from 'react'
import type {
  ColumnFilter,
  FilterField,
  FilterState,
  GroupByField,
} from '../../application/services/TaskFilterService'
import {
  defaultOperatorForField,
  FILTERABLE_FIELDS,
  GROUP_BY_OPTIONS,
} from '../../application/services/TaskFilterService'
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
    if (value.trim() === '' && typeof value === 'string') return
    const op = defaultOperatorForField(field)
    const newFilter: ColumnFilter = { field, operator: op, value }
    onChange({ ...state, filters: [...state.filters, newFilter] })
    setValue('')
  }

  const removeFilter = (index: number) => {
    const filters = state.filters.filter((_, i) => i !== index)
    onChange({ ...state, filters })
  }

  return (
    <div className={styles.group}>
      <span className={styles.label}>Filter:</span>
      <select
        value={field}
        onChange={(e) => setField(e.target.value as FilterField)}
        aria-label="Filter field"
      >
        {FILTERABLE_FIELDS.map((f) => (
          <option key={f.id} value={f.id}>
            {f.label}
          </option>
        ))}
      </select>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') addFilter()
        }}
        placeholder="Value…"
        aria-label="Filter value"
      />
      <button type="button" onClick={addFilter} aria-label="Add filter">
        +
      </button>
      {state.filters.length > 0 ? (
        <ul className={styles.chipList}>
          {state.filters.map((f, i) => (
            <li key={i} className={styles.chip}>
              <span className={styles.chipField}>
                {FILTERABLE_FIELDS.find((ff) => ff.id === f.field)?.label ??
                  f.field}
              </span>
              <span className={styles.chipOp}>{f.operator}</span>
              <span className={styles.chipVal}>{String(f.value)}</span>
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

function SortControls({ state, onChange }: FilterBarProps) {
  return (
    <div className={styles.group}>
      <span className={styles.label}>
        Sort
        {state.sorts.length > 0
          ? ` (${state.sorts.map((s) => `${s.field} ${s.direction === 'asc' ? '↑' : '↓'}`).join(', ')})`
          : ''}
      </span>
      {state.sorts.length > 0 ? (
        <button
          type="button"
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
