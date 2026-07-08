const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('floatplayer', {
  pickPhoto: () => ipcRenderer.invoke('pick-photo'),
  pickVideo: () => ipcRenderer.invoke('pick-video'),
  readClipboardImage: () => ipcRenderer.invoke('read-clipboard-image'),
  saveImage: (dataUrl) => ipcRenderer.invoke('save-image', dataUrl),
  copyImage: (dataUrl) => ipcRenderer.send('copy-image', dataUrl),
  closeScreenshotWindow: () => ipcRenderer.send('close-screenshot-window'),
  showScreenshotContextMenu: (dataUrl) => ipcRenderer.send('show-screenshot-context-menu', dataUrl),
  updateChapters: (chapters) => ipcRenderer.send('update-chapters', chapters),
  setClickThrough: (ignore) => ipcRenderer.send('set-window-opacity-passthrough', ignore),

  onSetClickThrough: (callback) => ipcRenderer.on('set-click-through', (_e, value) => callback(value)),
  onToggleUIHidden: (callback) => ipcRenderer.on('toggle-ui-hidden', () => callback()),
  onJumpToChapter: (callback) => ipcRenderer.on('jump-to-chapter', (_e, index) => callback(index)),
  onPasteScreenshot: (callback) => ipcRenderer.on('paste-screenshot', () => callback()),
  onScreenshotImage: (callback) => ipcRenderer.on('screenshot-image', (_e, filePath) => callback(filePath))
});
