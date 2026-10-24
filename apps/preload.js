const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  send: (channel, data) => {
    let validChannels = ['toMain', 'open-customer-display'];
    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel, data);
    }
  },
  receive: (channel, func) => {
    let validChannels = ['fromMain', 'scanner-data'];
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (event, ...args) => func(...args));
    }
  },
  silentPrint: (html, callback) => {
    ipcRenderer.send('silent-print', html);
    ipcRenderer.once('print-result', (_, err) => callback(err));
  },
  openCashDrawer: (config) => ipcRenderer.send('open-cash-drawer', config),
  openCustomerDisplay: (url) => ipcRenderer.send('open-customer-display', url),
});

contextBridge.exposeInMainWorld('electron', {
  printBill: (html) => ipcRenderer.invoke('print-bill', html),
  saveBillTxt: (filename, content) => ipcRenderer.invoke('save-bill-txt', { filename, content }),
  openCustomerDisplay: (url) => ipcRenderer.send('open-customer-display', url),
  onPrintStatus: (callback) => {
    const subscription = (event, payload) => callback(payload);
    ipcRenderer.on('print-status', subscription);
    return () => ipcRenderer.removeListener('print-status', subscription);
  },
  // ── Auto-Updater APIs ──────────────────────────────────────────────────
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  checkForUpdates: () => ipcRenderer.invoke('updater-check'),
  downloadUpdate: () => ipcRenderer.invoke('updater-download'),
  installUpdate: () => ipcRenderer.invoke('updater-install'),
  onUpdaterStatus: (callback) => {
    const listener = (event, payload) => callback(payload);
    ipcRenderer.on('updater-status', listener);
    return () => ipcRenderer.removeListener('updater-status', listener);
  }
});

