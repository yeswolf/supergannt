import {
  buildWbsTree,
  type WbsNode,
} from '../../application/services/ViewModels'
import { useArrowRowNavigation } from '../hooks/useArrowRowNavigation'
import { useWorkspaceDispatch, useWorkspaceState } from '../state/WorkspaceContext'
import styles from './TreeViews.module.css'
import { ViewHeader } from './ViewHeader'

function flattenWbsIds(nodes: readonly WbsNode[]): string[] {
  const out: string[] = []
  const walk = (node: WbsNode) => {
    out.push(node.id)
    for (const child of node.children) walk(child)
  }
  for (const node of nodes) walk(node)
  return out
}

function Node({ node, depth }: { node: WbsNode; depth: number }) {
  const dispatch = useWorkspaceDispatch()
  const { selectedTaskId } = useWorkspaceState()
  return (
    <li>
      <button
        type="button"
        data-row-id={node.id}
        className={[
          styles.node,
          node.critical ? styles.critical : '',
          node.milestone ? styles.milestone : '',
          selectedTaskId === node.id ? styles.selected : '',
        ]
          .filter(Boolean)
          .join(' ')}
        style={{ paddingLeft: `calc(var(--msp-cell-px) + ${depth} * var(--msp-indent))` }}
        onClick={() => dispatch({ type: 'selectTask', taskId: node.id })}
      >
        <span className={styles.wbs}>{node.wbs}</span>
        <span className={styles.name}>{node.name}</span>
        <span className={styles.meta}>
          {node.milestone ? 'Milestone · 0h' : `${node.durationHours}h`} · {node.percentComplete}%
        </span>
      </button>
      {node.children.length > 0 ? (
        <ul className={styles.list}>
          {node.children.map((child) => (
            <Node key={child.id} node={child} depth={depth + 1} />
          ))}
        </ul>
      ) : null}
    </li>
  )
}

export function WbsView() {
  const { project, selectedTaskId } = useWorkspaceState()
  const dispatch = useWorkspaceDispatch()
  const tree = buildWbsTree(project)
  const ids = flattenWbsIds(tree)

  useArrowRowNavigation({
    ids,
    selectedId: selectedTaskId,
    onSelect: (taskId) => dispatch({ type: 'selectTask', taskId }),
  })

  return (
    <div className={styles.panel}>
      <ViewHeader title="WBS" />
      <ul className={styles.list}>
        {tree.map((node) => (
          <Node key={node.id} node={node} depth={0} />
        ))}
      </ul>
    </div>
  )
}
