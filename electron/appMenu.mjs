import { app, BrowserWindow, Menu, dialog } from 'electron'

/**
 * @param {string} command
 */
function sendMenuCommand(command) {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  win?.webContents.send('menu:command', command)
}

/**
 * @param {string} command
 * @param {string} label
 * @param {Electron.MenuItemConstructorOptions=} extra
 * @returns {Electron.MenuItemConstructorOptions}
 */
function cmd(command, label, extra = {}) {
  return {
    label,
    ...extra,
    click: () => sendMenuCommand(command),
  }
}

/**
 * Application menu mirrors ribbon tabs → groups → commands.
 * @param {{ isDev?: boolean }} [options]
 */
export function buildAppMenu(options = {}) {
  const isDev = Boolean(options.isDev)
  const isMac = process.platform === 'darwin'

  /** @type {Electron.MenuItemConstructorOptions[]} */
  const template = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' },
            ],
          },
        ]
      : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'New',
          submenu: [
            cmd('file.new.blank', 'Blank'),
            cmd('file.new.sample', 'Sample'),
          ],
        },
        cmd('file.open', 'Open…', { accelerator: 'CmdOrCtrl+O' }),
        { type: 'separator' },
        {
          label: 'Save',
          submenu: [
            cmd('file.save.mspdi', 'Save XML', { accelerator: 'CmdOrCtrl+S' }),
            cmd('file.save.mpp', 'Save MPP'),
            cmd('file.save.mpx', 'Save MPX'),
            cmd('file.exportPdf', 'Export PDF'),
          ],
        },
        ...(isMac
          ? []
          : [
              { type: 'separator' },
              { role: 'quit', label: 'Exit' },
            ]),
      ],
    },
    {
      label: 'Task',
      submenu: [
        {
          label: 'Insert',
          submenu: [
            cmd('task.insert.task', 'Task'),
            cmd('task.insert.milestone', 'Milestone'),
          ],
        },
        {
          label: 'Structure',
          submenu: [
            cmd('task.structure.indent', 'Indent'),
            cmd('task.structure.outdent', 'Outdent'),
            cmd('task.structure.delete', 'Delete'),
          ],
        },
        {
          label: 'Schedule',
          submenu: [
            cmd('task.schedule.link', 'Link'),
            cmd('task.schedule.unlink', 'Unlink'),
            cmd('task.schedule.info', 'Information'),
          ],
        },
        {
          label: 'Assign',
          submenu: [cmd('task.assign.resources', 'Resources')],
        },
        {
          label: 'Zoom',
          submenu: [
            cmd('task.zoom.in', 'Zoom In', { accelerator: 'CmdOrCtrl+=' }),
            cmd('task.zoom.out', 'Zoom Out', { accelerator: 'CmdOrCtrl+-' }),
          ],
        },
      ],
    },
    {
      label: 'Resource',
      submenu: [
        {
          label: 'Insert',
          submenu: [cmd('resource.insert.add', 'Add Resource')],
        },
        {
          label: 'Assign',
          submenu: [cmd('resource.assign.toTask', 'Assign to Task')],
        },
        {
          label: 'Views',
          submenu: [
            cmd('resource.view.resources', 'Resource Sheet'),
            cmd('resource.view.resourceUsage', 'Resource Usage'),
            cmd('resource.view.rbs', 'RBS'),
          ],
        },
      ],
    },
    {
      label: 'Project',
      submenu: [
        {
          label: 'Properties',
          submenu: [cmd('project.properties.calendar', 'Calendar')],
        },
        {
          label: 'Schedule',
          submenu: [
            cmd('project.schedule.setBaseline', 'Set Baseline'),
            cmd('project.schedule.clearBaseline', 'Clear Baseline'),
          ],
        },
        {
          label: 'Reports',
          submenu: [cmd('project.reports.reports', 'Reports')],
        },
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Task Views',
          submenu: [
            cmd('view.set.gantt', 'Gantt Chart'),
            cmd('view.set.tasks', 'Task Sheet'),
            cmd('view.set.network', 'Network Diagram'),
            cmd('view.set.wbs', 'WBS'),
            cmd('view.set.taskUsage', 'Task Usage'),
            cmd('view.set.calendar', 'Calendar'),
          ],
        },
        {
          label: 'Resource Views',
          submenu: [
            cmd('view.set.resources', 'Resource Sheet'),
            cmd('view.set.rbs', 'RBS'),
            cmd('view.set.resourceUsage', 'Resource Usage'),
          ],
        },
        {
          label: 'Other',
          submenu: [cmd('view.set.reports', 'Reports')],
        },
        { type: 'separator' },
        { role: 'reload' },
        ...(isDev
          ? [{ role: 'forceReload' }, { role: 'toggleDevTools' }]
          : []),
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About SuperGantt',
          click: () => {
            dialog.showMessageBox({
              type: 'info',
              title: 'About SuperGantt',
              message: 'SuperGantt',
              detail: `Version ${app.getVersion()}\nModern MS Project / ProjectLibre alternative`,
            })
          },
        },
      ],
    },
  ]

  return Menu.buildFromTemplate(template)
}

/**
 * @param {{ isDev?: boolean }} [options]
 */
export function installAppMenu(options = {}) {
  Menu.setApplicationMenu(buildAppMenu(options))
}
