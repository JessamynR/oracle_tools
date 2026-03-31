const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hcmAPI', {
  lookup      : (params) => ipcRenderer.invoke('hcm:lookup',       params),
  ccReport    : (params) => ipcRenderer.invoke('hcm:ccreport',     params),
  ccHierarchy : (params) => ipcRenderer.invoke('hcm:ccHierarchy',  params),
  appVersion  : ()       => ipcRenderer.invoke('app:version'),
  getSettings : ()       => ipcRenderer.invoke('hcm:getSettings'),
  saveSettings: (params) => ipcRenderer.invoke('hcm:saveSettings', params),
});
