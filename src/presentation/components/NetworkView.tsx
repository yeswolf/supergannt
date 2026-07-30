import { toNetworkDiagram } from '../../application/services/ReportingService'
import { useWorkspaceDispatch, useWorkspaceState } from '../state/WorkspaceContext'
import styles from './NetworkView.module.css'

export function NetworkView() {
  const { project, selectedTaskId } = useWorkspaceState()
  const dispatch = useWorkspaceDispatch()
  const { nodes, edges } = toNetworkDiagram(project)

  const columns = Math.max(1, Math.ceil(Math.sqrt(nodes.length)))

  return (
    <div className={styles.panel}>
      <div className={styles.heading}>
        <h2>Network Diagram</h2>
        <p>PERT-style dependency graph with critical path highlighted.</p>
      </div>
      <div className={styles.canvas} style={{ gridTemplateColumns: `repeat(${columns}, minmax(160px, 1fr))` }}>
        {nodes.map((node) => (
          <button
            key={node.id}
            type="button"
            className={[
              styles.node,
              node.critical ? styles.critical : '',
              node.milestone ? styles.milestone : '',
              selectedTaskId === node.id ? styles.selected : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={() => dispatch({ type: 'selectTask', taskId: node.id })}
          >
            <strong>{node.name}</strong>
            <span>
              {node.earlyStart} → {node.earlyFinish}
            </span>
          </button>
        ))}
      </div>
      <ul className={styles.edges}>
        {edges.map((edge) => {
          const from = nodes.find((n) => n.id === edge.from)?.name ?? edge.from
          const to = nodes.find((n) => n.id === edge.to)?.name ?? edge.to
          return (
            <li key={edge.id}>
              {from} <em>{edge.type}</em> → {to}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
