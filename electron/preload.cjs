const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld(
  "camp",
  Object.freeze({
    status: () => ipcRenderer.invoke("camp:status"),
    setup: (secret, mode) => ipcRenderer.invoke("camp:setup", secret, mode),
    unlock: (secret) => ipcRenderer.invoke("camp:unlock", secret),
    lock: () => ipcRenderer.invoke("camp:lock"),
    load: () => ipcRenderer.invoke("camp:load"),
    save: (data) => ipcRenderer.invoke("camp:save", data),
    restore: (data) => ipcRenderer.invoke("camp:restore", data),
    backup: () => ipcRenderer.invoke("camp:backup"),
    commitArchive: (next, files) =>
      ipcRenderer.invoke("camp:archive-commit", next, files),
    searchArchives: (query, offset) =>
      ipcRenderer.invoke("camp:archive-search", query, offset),
    lookupArchives: (pairs) => ipcRenderer.invoke("camp:archive-lookup", pairs),
    verifyAttachments: (value) =>
      ipcRenderer.invoke("camp:verify-attachments", value),
    saveAerial: (dataUrl) => ipcRenderer.invoke("camp:aerial-save", dataUrl),
    readAerial: (ref) => ipcRenderer.invoke("camp:aerial-read", ref),
    pickBackup: () => ipcRenderer.invoke("camp:pick-backup"),
    restoreBackup: (token) => ipcRenderer.invoke("camp:restore-backup", token),
    exportBackup: () => ipcRenderer.invoke("camp:export-backup"),
    chooseBackup: () => ipcRenderer.invoke("camp:choose-backup"),
    openFolder: () => ipcRenderer.invoke("camp:open-folder"),
    openCampfit: () => ipcRenderer.invoke("camp:camfit-login"),
    camfitProfile: () => ipcRenderer.invoke("camp:camfit-profile"),
    downloadCampfit: () => ipcRenderer.invoke("camp:camfit-download"),
    saveCamfitProfile: (profile) =>
      ipcRenderer.invoke("camp:camfit-profile-save", profile),
    cancelCampfitSync: () => ipcRenderer.invoke("camp:camfit-cancel"),
    quit: () => ipcRenderer.invoke("camp:quit"),
  }),
);
