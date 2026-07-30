import { buildRbsTree } from '../../application/services/ViewModels'
import { useWorkspaceDispatch, useWorkspaceState } from '../state/WorkspaceContext'
import styles from './TreeViews.module.css'

export function RbsView() {
  const { project, selectedResourceId } = useWorkspaceState()
  const dispatch = useWorkspaceDispatch()
  const tree = buildRbsTree(project)

  return (
    <div className={styles.panel}>
      <div className={styles.heading}>
        <h2>RBS</h2>
        <p>Resource Breakdown Structure — resources grouped by org group.</p>
      </div>
      <ul className={styles.list}>
        {tree.map((group) => (
          <li key={group.id}>
            <div className={styles.groupHead}>
              <strong>{group.name}</strong>
              <span className={styles.meta}>
                {group.assignedUnits}/{group.maxUnits} units · {group.taskCount} assignments
              </span>
            </div>
            <ul className={styles.list}>
              {group.children.map((resource) => (
                <li key={resource.id}>
                  <button
                    type="button"
                    className={[
                      styles.node,
                      selectedResourceId === resource.id ? styles.selected : '',
                      resource.assignedUnits > resource.maxUnits ? styles.critical : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() =>
                      dispatch({ type: 'selectResource', resourceId: resource.id })
                    }
                  >
                    <strong>{resource.name}</strong>
                    <span className={styles.meta}>
                      {resource.type} · {resource.assignedUnits}/{resource.maxUnits} ·{' '}
                      {resource.taskCount} tasks
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  )
}
