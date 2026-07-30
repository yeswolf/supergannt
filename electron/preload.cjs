const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('superGanttDesktop', {
  platform: process.platform,
  isDesktop: true,
  onMenuCommand(handler) {
    const listener = (_event, command) => {
      if (typeof command === 'string') handler(command)
    }
    ipcRenderer.on('menu:command', listener)
    return () => {
      ipcRenderer.removeListener('menu:command', listener)
    }
  },
})
