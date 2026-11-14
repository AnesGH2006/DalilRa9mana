const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // يمكن إضافة IPC هنا لاحقاً
});