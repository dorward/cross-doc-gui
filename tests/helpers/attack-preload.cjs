const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('probe', {
	refresh: () => ipcRenderer.invoke('project:refresh'),
});
