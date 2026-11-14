'use strict';

/**
 * Task executor — only predefined safe actions.
 * Never executes arbitrary shell commands.
 */

const HANDLERS = {
  openFolder:    doOpenFolder,
  openFile:      doOpenFile,
  openApp:       doOpenApp,
  backupReports: doBackup,
  syncData:      doSyncData,
  monitorFolder: doMonitorFolder,
  send_sms:      doSendSms,
};

/**
 * Execute a task dispatched by the server.
 * @param {string} action
 * @param {object} payload
 * @param {string[]} allowedFolders  - paths the admin approved
 * @param {object} api               - window.agent (preload API)
 */
async function execute(action, payload, allowedFolders, api) {
  const handler = HANDLERS[action];
  if (!handler) throw new Error(`Unknown action: ${action}`);
  return handler(payload, allowedFolders, api);
}

async function doOpenFolder({ path: p }, af, api) {
  await api.openPath(p, af);
  return { ok: true, path: p };
}

async function doOpenFile({ path: p }, af, api) {
  await api.openPath(p, af);
  return { ok: true, path: p };
}

async function doOpenApp({ path: p }, af, api) {
  await api.openApp(p, af);
  return { ok: true, path: p };
}

async function doBackup({ sourceFolder, destFolder }, af, api) {
  const result = await api.backup(sourceFolder, destFolder, af);
  return result;
}

async function doSyncData(payload, _af, _api) {
  // Sync is driven by the server; agent just acknowledges
  return { ok: true, acknowledged: true, payload };
}

async function doMonitorFolder({ path: p }, af, api) {
  await api.watchFolder(p, af);
  return { ok: true, watching: p };
}

async function doSendSms(payload) {
  return {
    ok: false,
    error: 'إرسال SMS يتطلب تشغيل python-agent.py مع مودم GSM متصل.',
    phone: payload?.phone,
  };
}

module.exports = { execute };
