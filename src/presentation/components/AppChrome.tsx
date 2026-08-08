import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { saveBlobToDisk } from '../desktop/saveBlob'
import { errorMessage } from '../errorMessage'
import { openPlanFile } from '../openPlanFile'
import { planFileInputAccept } from '../planFileInputAccept'
import { useWorkspaceDispatch, useWorkspaceState } from '../state/WorkspaceContext'
import type { AppView } from '../state/workspace'
import { useTheme } from '../theme/ThemeContext'
import {
  matchProjectShortcut,
  PROJECT_SHORTCUT_HINTS,
  type ProjectShortcut,
} from '../projectShortcuts'
import { Icons, type RibbonIconName } from './icons/RibbonIcons'
import { APP_VIEWS, MORE_VIEWS, PRIMARY_VIEWS } from './nav/views'
import styles from './AppChrome.module.css'

type Command = {
  id: string
  label: string
  hint?: string
  icon: RibbonIconName
  keywords?: string
  disabled?: boolean
  run: () => void
}

function useIsNarrow(breakpoint = 820) {
  const [narrow, setNarrow] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false
    }
    return window.matchMedia(`(max-width: ${breakpoint}px)`).matches
  })
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`)
    const onChange = () => setNarrow(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [breakpoint])
  return narrow
}

function Menu({
  label,
  children,
  open,
  onOpenChange,
  asSheet,
}: {
  label: string
  children: ReactNode
  open: boolean
  onOpenChange: (open: boolean) => void
  asSheet?: boolean
}) {
  return (
    <div className={styles.menuWrap}>
      <button
        type="button"
        className={open ? styles.menuBtnActive : styles.menuBtn}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => onOpenChange(!open)}
      >
        {label}
        <span aria-hidden>▾</span>
      </button>
      {open ? (
        asSheet ? (
          <div
            className={styles.sheetScrim}
            role="presentation"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) onOpenChange(false)
            }}
          >
            <div className={styles.fileSheet} role="menu" aria-label={label}>
              {children}
            </div>
          </div>
        ) : (
          <div className={styles.menu} role="menu" aria-label={label}>
            {children}
          </div>
        )
      ) : null}
    </div>
  )
}

function MenuItem({
  label,
  onClick,
  disabled,
  checked,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  checked?: boolean
}) {
  return (
    <button
      type="button"
      role={checked === undefined ? 'menuitem' : 'menuitemradio'}
      aria-checked={checked === undefined ? undefined : checked}
      className={styles.menuItem}
      disabled={disabled}
      onClick={onClick}
    >
      {checked === undefined ? null : (
        <span className={styles.menuCheck} aria-hidden>
          {checked ? '✓' : ''}
        </span>
      )}
      {label}
    </button>
  )
}

export function AppChrome() {
  const {
    project,
    view,
    selectedTaskId,
    selectedTaskIds,
    services,
    busyMessage,
    taskInfoOpen,
    assignDialogOpen,
    autoSave,
    progressLinesOn,
    progressDate,
  } = useWorkspaceState()
  const dispatch = useWorkspaceDispatch()
  const { theme, setTheme, themes } = useTheme()
  const fileRef = useRef<HTMLInputElement>(null)
  const [themeMenu, setThemeMenu] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [paletteQuery, setPaletteQuery] = useState('')
  const [paletteIndex, setPaletteIndex] = useState(0)
  const paletteInputRef = useRef<HTMLInputElement>(null)
  const isNarrow = useIsNarrow()

  const canLink = selectedTaskIds.length >= 2
  const canUnlink = selectedTaskIds.length > 0 || Boolean(selectedTaskId)
  const isBusy = Boolean(busyMessage)
  const moreActive = MORE_VIEWS.some((v) => v.id === view)

  const onOpen = (file: File) => {
    if (isBusy) return
    void openPlanFile(file, services, dispatch)
  }

  const onSave = async (format: 'mspdi' | 'mpx' | 'mpp' = 'mspdi') => {
    const label =
      format === 'mpp' ? 'Saving MPP…' : format === 'mpx' ? 'Saving MPX…' : 'Saving XML…'
    dispatch({ type: 'setBusy', message: label })
    try {
      const result = await services.files.saveFile(project, undefined, format)
      const savedPath = await saveBlobToDisk(result.blob, result.fileName)
      if (savedPath == null) {
        dispatch({ type: 'setStatus', message: 'Save cancelled' })
        return
      }
      dispatch({
        type: 'setProject',
        project: result.project,
        message: `Saved ${savedPath}`,
      })
    } catch (error) {
      dispatch({
        type: 'setStatus',
        message: errorMessage(error, 'Failed to save file'),
      })
    } finally {
      dispatch({ type: 'setBusy', message: null })
    }
  }

  const onExportPdf = async () => {
    dispatch({ type: 'setBusy', message: 'Exporting PDF…' })
    try {
      const { exportProjectPdf } = await import('../../infrastructure/pdf/exportProjectPdf')
      const fileName = `${project.name || 'project'}.pdf`
      const blob = await exportProjectPdf(
        project,
        progressLinesOn && progressDate ? new Date(progressDate + 'T00:00:00') : null,
      )
      const savedPath = await saveBlobToDisk(blob, fileName)
      if (savedPath == null) {
        dispatch({ type: 'setStatus', message: 'Export cancelled' })
        return
      }
      dispatch({ type: 'setStatus', message: `Exported ${savedPath}` })
    } catch (error) {
      dispatch({
        type: 'setStatus',
        message: errorMessage(error, 'PDF export failed'),
      })
    } finally {
      dispatch({ type: 'setBusy', message: null })
    }
  }

  const setView = (next: AppView) => {
    dispatch({ type: 'setView', view: next })
    setMoreOpen(false)
    setPaletteOpen(false)
  }

  const ganttZoom = (dir: 'in' | 'out') => {
    window.dispatchEvent(new CustomEvent('supergantt:gantt-zoom', { detail: dir }))
  }

  const commands = useMemo<Command[]>(() => {
    const list: Command[] = [
      {
        id: 'new-blank',
        label: 'New blank plan',
        icon: 'blank',
        keywords: 'file new blank',
        hint: PROJECT_SHORTCUT_HINTS.newBlank,
        run: () => dispatch({ type: 'newProject' }),
      },
      {
        id: 'new-sample',
        label: 'Load sample plan',
        icon: 'sample',
        keywords: 'file demo sample',
        run: () => dispatch({ type: 'loadDemo' }),
      },
      {
        id: 'open',
        label: 'Open…',
        icon: 'open',
        keywords: 'file open mpp xml mspdi',
        hint: PROJECT_SHORTCUT_HINTS.open,
        disabled: isBusy,
        run: () => fileRef.current?.click(),
      },
      {
        id: 'save-xml',
        label: 'Save as XML',
        icon: 'saveXml',
        keywords: 'file save mspdi xml',
        hint: PROJECT_SHORTCUT_HINTS.saveXml,
        run: () => void onSave('mspdi'),
      },
      {
        id: 'save-mpp',
        label: 'Save as MPP',
        icon: 'saveMpp',
        keywords: 'file save mpp',
        run: () => void onSave('mpp'),
      },
      {
        id: 'save-mpx',
        label: 'Save as MPX',
        icon: 'saveMpx',
        keywords: 'file save mpx',
        run: () => void onSave('mpx'),
      },
      {
        id: 'export-pdf',
        label: 'Export PDF',
        icon: 'reports',
        keywords: 'file export pdf',
        run: () => void onExportPdf(),
      },
      ...themes.map((t) => ({
        id: `theme-${t.id}`,
        label: `Theme: ${t.label}`,
        icon: 'theme' as const,
        keywords: t.keywords,
        run: () => setTheme(t.id),
      })),
      {
        id: 'add-task',
        label: 'Add task',
        icon: 'plus',
        keywords: 'insert task',
        hint: PROJECT_SHORTCUT_HINTS.addTask,
        run: () =>
          dispatch({ type: 'addTask', afterTaskId: selectedTaskId ?? undefined }),
      },
      {
        id: 'add-milestone',
        label: 'Add milestone',
        icon: 'milestone',
        run: () =>
          dispatch({ type: 'addMilestone', afterTaskId: selectedTaskId ?? undefined }),
      },
      {
        id: 'indent',
        label: 'Indent task',
        icon: 'indent',
        hint: PROJECT_SHORTCUT_HINTS.indent,
        disabled: !selectedTaskId,
        run: () =>
          selectedTaskId && dispatch({ type: 'indentTask', taskId: selectedTaskId }),
      },
      {
        id: 'outdent',
        label: 'Outdent task',
        icon: 'outdent',
        hint: PROJECT_SHORTCUT_HINTS.outdent,
        disabled: !selectedTaskId,
        run: () =>
          selectedTaskId && dispatch({ type: 'outdentTask', taskId: selectedTaskId }),
      },
      {
        id: 'delete-task',
        label: 'Delete task',
        icon: 'delete',
        hint: PROJECT_SHORTCUT_HINTS.deleteSelection,
        disabled: !selectedTaskId && selectedTaskIds.length === 0,
        run: () => dispatch({ type: 'deleteSelection' }),
      },
      {
        id: 'link',
        label: 'Link selected tasks',
        icon: 'link',
        hint: PROJECT_SHORTCUT_HINTS.link,
        disabled: !canLink,
        run: () => dispatch({ type: 'linkSelection' }),
      },
      {
        id: 'unlink',
        label: 'Unlink selection',
        icon: 'unlink',
        hint: PROJECT_SHORTCUT_HINTS.unlink,
        disabled: !canUnlink,
        run: () => dispatch({ type: 'unlinkSelection' }),
      },
      {
        id: 'task-info',
        label: 'Task information',
        icon: 'information',
        hint: PROJECT_SHORTCUT_HINTS.taskInfo,
        disabled: !selectedTaskId,
        run: () => dispatch({ type: 'openTaskInfo' }),
      },
      {
        id: 'assign',
        label: 'Assign resources',
        icon: 'resources',
        hint: PROJECT_SHORTCUT_HINTS.assign,
        disabled: !selectedTaskId,
        run: () => dispatch({ type: 'openAssignDialog' }),
      },
      {
        id: 'add-resource',
        label: 'Add resource',
        icon: 'addResource',
        run: () => {
          dispatch({ type: 'addResource' })
          dispatch({ type: 'setView', view: 'resources' })
        },
      },
      {
        id: 'baseline',
        label: 'Set baseline',
        icon: 'baseline',
        run: () => dispatch({ type: 'setBaseline' }),
      },
      {
        id: 'clear-baseline',
        label: 'Clear baseline',
        icon: 'clearBaseline',
        run: () => dispatch({ type: 'clearBaseline' }),
      },
      {
        id: 'zoom-in',
        label: 'Zoom in (Gantt)',
        icon: 'zoomIn',
        hint: PROJECT_SHORTCUT_HINTS.zoomIn,
        run: () => ganttZoom('in'),
      },
      {
        id: 'zoom-out',
        label: 'Zoom out (Gantt)',
        icon: 'zoomOut',
        hint: PROJECT_SHORTCUT_HINTS.zoomOut,
        run: () => ganttZoom('out'),
      },
      ...APP_VIEWS.map((v) => ({
        id: `view-${v.id}`,
        label: `Go to ${v.label}`,
        icon: v.icon,
        keywords: `view ${v.short}`,
        run: () => setView(v.id),
      })),
    ]
    return list
  }, [
    canLink,
    canUnlink,
    dispatch,
    isBusy,
    onExportPdf,
    onSave,
    selectedTaskId,
    selectedTaskIds.length,
    setTheme,
    themes,
  ])

  const filteredCommands = useMemo(() => {
    const q = paletteQuery.trim().toLowerCase()
    if (!q) return commands.filter((c) => !c.disabled).slice(0, 12)
    return commands
      .filter((c) => {
        if (c.disabled) return false
        const hay = `${c.label} ${c.keywords ?? ''}`.toLowerCase()
        return hay.includes(q)
      })
      .slice(0, 20)
  }, [commands, paletteQuery])

  useEffect(() => {
    setPaletteIndex(0)
  }, [paletteQuery, paletteOpen, filteredCommands])

  useEffect(() => {
    const runShortcut = (action: ProjectShortcut) => {
      switch (action) {
        case 'palette':
          setPaletteOpen(true)
          setPaletteQuery('')
          return
        case 'newBlank':
          dispatch({ type: 'newProject' })
          return
        case 'open':
          if (!isBusy) fileRef.current?.click()
          return
        case 'saveXml':
          void onSave('mspdi')
          return
        case 'zoomIn':
          ganttZoom('in')
          return
        case 'zoomOut':
          ganttZoom('out')
          return
        case 'addTask':
          dispatch({ type: 'addTask', afterTaskId: selectedTaskId ?? undefined })
          return
        case 'deleteSelection':
          if (selectedTaskId || selectedTaskIds.length > 0) {
            dispatch({ type: 'deleteSelection' })
          }
          return
        case 'indent':
          if (selectedTaskId) dispatch({ type: 'indentTask', taskId: selectedTaskId })
          return
        case 'outdent':
          if (selectedTaskId) dispatch({ type: 'outdentTask', taskId: selectedTaskId })
          return
        case 'link':
          if (selectedTaskIds.length >= 2) dispatch({ type: 'linkSelection' })
          return
        case 'unlink':
          if (selectedTaskId || selectedTaskIds.length > 0) {
            dispatch({ type: 'unlinkSelection' })
          }
          return
        case 'taskInfo':
          if (selectedTaskId) dispatch({ type: 'openTaskInfo' })
          return
        case 'assign':
          if (selectedTaskId) dispatch({ type: 'openAssignDialog' })
          return
        case 'undo':
          dispatch({ type: 'undo' })
          return
        case 'redo':
          dispatch({ type: 'redo' })
          return
      }
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPaletteOpen(false)
        setMoreOpen(false)
        setThemeMenu(false)
        return
      }

      const action = matchProjectShortcut(e)
      if (!action) return

      // Undo/Redo work everywhere — including dialogs.
      if (action === 'undo' || action === 'redo') {
        e.preventDefault()
        runShortcut(action)
        return
      }

      if (action === 'palette') {
        e.preventDefault()
        runShortcut(action)
        return
      }

      // Dialogs / palette own their own keys (Enter, arrows, …).
      if (paletteOpen || taskInfoOpen || assignDialogOpen) return

      e.preventDefault()
      runShortcut(action)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    assignDialogOpen,
    dispatch,
    isBusy,
    onSave,
    paletteOpen,
    selectedTaskId,
    selectedTaskIds,
    taskInfoOpen,
  ])

  useEffect(() => {
    if (paletteOpen) {
      const t = window.setTimeout(() => paletteInputRef.current?.focus(), 0)
      return () => window.clearTimeout(t)
    }
  }, [paletteOpen])

  useEffect(() => {
    if (!themeMenu && !moreOpen) return
    const onDoc = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      if (!target) return
      const insideMenu = target.closest(`.${styles.menuWrap}`)
      const insideMore =
        target.closest(`.${styles.moreSheet}`) ||
        target.closest(`.${styles.bottomNav}`)
      if (!insideMenu) setThemeMenu(false)
      if (!insideMore) setMoreOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [themeMenu, moreOpen])

  const renderNavButton = (
    item: (typeof APP_VIEWS)[number],
    opts?: { short?: boolean },
  ) => {
    const Icon = Icons[item.icon]
    const active = view === item.id
    return (
      <button
        key={item.id}
        type="button"
        className={active ? styles.navActive : styles.navBtn}
        aria-current={active ? 'page' : undefined}
        aria-label={item.label}
        title={item.label}
        onClick={() => setView(item.id)}
      >
        <span className={styles.navIcon} aria-hidden>
          <Icon />
        </span>
        <span className={styles.navLabel}>{opts?.short ? item.short : item.label}</span>
      </button>
    )
  }

  const activeCmd = filteredCommands[paletteIndex]
  const activeDescendantId = activeCmd ? `palette-opt-${activeCmd.id}` : undefined

  const runPaletteCommand = (cmd: Command) => {
    cmd.run()
    setPaletteOpen(false)
  }

  return (
    <>
      <header className={styles.topBar}>
        <div className={styles.brandMark} aria-hidden>
          <Icons.app />
        </div>
        <div className={styles.brand}>SuperGantt</div>
        <div className={styles.titleDivider} />
        <input
          className={styles.projectName}
          value={project.name}
          aria-label="Project name"
          onChange={(e) =>
            dispatch({ type: 'updateProjectInfo', patch: { name: e.target.value } })
          }
        />
        {autoSave.dirty ? <span className={styles.dirty}>●</span> : null}

        <div className={styles.topActions}>
          <Menu
            label="Theme"
            open={themeMenu}
            onOpenChange={(open) => {
              setThemeMenu(open)
              if (open) setMoreOpen(false)
            }}
            asSheet={isNarrow}
          >
            {themes.map((t) => (
              <MenuItem
                key={t.id}
                label={t.label}
                checked={theme === t.id}
                onClick={() => {
                  setTheme(t.id)
                  setThemeMenu(false)
                }}
              />
            ))}
          </Menu>

          <button
            type="button"
            className={styles.searchBtn}
            onClick={() => {
              setPaletteOpen(true)
              setPaletteQuery('')
            }}
            aria-label="Command palette (Ctrl+K)"
            title="Command palette (Ctrl+K)"
          >
            <Icons.search />
            <kbd className={styles.kbd}>Ctrl K</kbd>
          </button>
        </div>
      </header>

      <nav className={styles.rail} aria-label="Views">
        {/* Desktop: flat list — no More overflow for now */}
        {APP_VIEWS.map((v) => renderNavButton(v, { short: true }))}
      </nav>

      <nav className={styles.bottomNav} aria-label="Mobile views">
        {PRIMARY_VIEWS.map((v) => renderNavButton(v, { short: true }))}
        <button
          type="button"
          className={moreActive || moreOpen ? styles.navActive : styles.navBtn}
          aria-expanded={moreOpen}
          onClick={() => {
            setMoreOpen((o) => !o)
            setThemeMenu(false)
          }}
        >
          <span className={styles.navIcon} aria-hidden>
            ···
          </span>
          <span className={styles.navLabel}>More</span>
        </button>
      </nav>

      {moreOpen ? (
        <>
          <div
            className={styles.sheetScrim}
            role="presentation"
            onMouseDown={() => setMoreOpen(false)}
          />
          <div className={styles.moreSheet} role="dialog" aria-label="More views">
            <div className={styles.moreSheetHead}>
              <strong>More views</strong>
              <button
                type="button"
                className={styles.sheetClose}
                aria-label="Close"
                title="Close"
                onClick={() => setMoreOpen(false)}
              >
                <Icons.cancel />
              </button>
            </div>
            <div className={styles.moreSheetGrid}>
              {MORE_VIEWS.map((v) => renderNavButton(v))}
            </div>
          </div>
        </>
      ) : null}

      {paletteOpen ? (
        <div
          className={styles.paletteScrim}
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setPaletteOpen(false)
          }}
        >
          <div
            className={styles.palette}
            role="dialog"
            aria-label="Command palette"
            aria-modal="true"
          >
            <input
              ref={paletteInputRef}
              className={styles.paletteInput}
              value={paletteQuery}
              placeholder="Type a command…"
              aria-label="Filter commands"
              aria-controls="command-palette-list"
              aria-activedescendant={activeDescendantId}
              role="combobox"
              aria-expanded="true"
              aria-autocomplete="list"
              onChange={(e) => setPaletteQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  setPaletteIndex((i) =>
                    filteredCommands.length === 0
                      ? 0
                      : Math.min(i + 1, filteredCommands.length - 1),
                  )
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  setPaletteIndex((i) => Math.max(i - 1, 0))
                } else if (e.key === 'Enter' && activeCmd) {
                  e.preventDefault()
                  runPaletteCommand(activeCmd)
                }
              }}
            />
            <ul
              id="command-palette-list"
              className={styles.paletteList}
              role="listbox"
              aria-label="Commands"
            >
              {filteredCommands.map((cmd, i) => {
                const Icon = Icons[cmd.icon]
                const active = i === paletteIndex
                return (
                  <li key={cmd.id} role="presentation">
                    <button
                      type="button"
                      id={`palette-opt-${cmd.id}`}
                      role="option"
                      aria-selected={active}
                      className={
                        active ? styles.paletteItemActive : styles.paletteItem
                      }
                      onMouseEnter={() => setPaletteIndex(i)}
                      onClick={() => runPaletteCommand(cmd)}
                    >
                      <span className={styles.paletteIcon} aria-hidden>
                        <Icon />
                      </span>
                      <span>{cmd.label}</span>
                      {cmd.hint ? (
                        <kbd className={styles.paletteHint}>{cmd.hint}</kbd>
                      ) : null}
                    </button>
                  </li>
                )
              })}
              {filteredCommands.length === 0 ? (
                <li className={styles.paletteEmpty}>No matching commands</li>
              ) : null}
            </ul>
          </div>
        </div>
      ) : null}

      <input
        ref={fileRef}
        type="file"
        accept={planFileInputAccept()}
        className={styles.hidden}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void onOpen(file)
          e.target.value = ''
        }}
      />
    </>
  )
}

/** @deprecated Ribbon removed — use AppChrome */
export { AppChrome as Toolbar }
