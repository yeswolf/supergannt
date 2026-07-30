const { contextBridge } = require('electron')

contextBridge.exposeInMainWorld('superGanttDesktop', {
  platform: process.platform,
  isDesktop: true,
})
