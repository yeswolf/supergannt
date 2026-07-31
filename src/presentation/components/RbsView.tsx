import { buildRbsTree } from '../../application/services/ViewModels'
import { useWorkspaceDispatch, useWorkspaceState } from '../state/WorkspaceContext'
import styles from './TreeViews.module.css'
import { ViewHeader } from './ViewHeader'

export function RbsView() {
  const { project, selectedResourceId } = useWorkspaceState()
  const dispatch = useWorkspaceDispatch()
  const tree = buildRbsTree(project)

  return (
    <div className={styles.panel}>
      <ViewHeader title="RBS" />
      <ul className={styles.list}>
        {tree.map((group) => (
          <li key={group.id}>
            <div className={styles.groupHead}>
              <span className={styles.name}>{group.name}</span>
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
                    <span className={styles.name}>{resource.name}</span>
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
