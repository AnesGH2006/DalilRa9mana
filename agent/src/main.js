'use strict';

const {
  app, BrowserWindow, ipcMain, Tray, Menu,
  shell, dialog, nativeTheme, desktopCapturer, screen,
} = require('electron');
const path    = require('path');
const fs      = require('fs');
const { exec } = require('child_process');

// ── PowerShell helper (EncodedCommand avoids all quoting issues) ───────────────
function runPS(script, timeoutMs = 12000) {
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  return new Promise((resolve, reject) => {
    exec(
      `powershell.exe -NoProfile -NonInteractive -EncodedCommand ${encoded}`,
      { timeout: timeoutMs, windowsHide: true, maxBuffer: 10 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) reject(new Error(stderr.trim() || err.message));
        else resolve(stdout.trim());
      },
    );
  });
}

const isDev = process.argv.includes('--dev');

let mainWindow = null;
let tray       = null;

// ── Helpers ───────────────────────────────────────────────────────────────────
function isPathAllowed(targetPath, allowedFolders) {
  if (!Array.isArray(allowedFolders) || allowedFolders.length === 0) return false;
  const norm = path.normalize(targetPath);
  return allowedFolders.some((f) => norm.startsWith(path.normalize(f)));
}

function dataPath(filename) {
  return path.join(app.getPath('userData'), filename);
}

// ── Window ─────────────────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width:     980,
    height:    680,
    minWidth:  820,
    minHeight: 560,
    title:     'Dalil Ra9mana Agent',
    frame:     false,
    backgroundColor: '#0f172a',
    show:      false,
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
      sandbox:          false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());

  // Hide to tray instead of closing
  mainWindow.on('close', (e) => {
    e.preventDefault();
    mainWindow.hide();
  });

  if (isDev) mainWindow.webContents.openDevTools({ mode: 'detach' });
}

// ── Tray ──────────────────────────────────────────────────────────────────────
function createTray() {
  const iconFile = path.join(__dirname, '..', 'assets', 'tray.png');
  const fallback = path.join(__dirname, '..', 'assets', 'icon.png');
  const icon = fs.existsSync(iconFile) ? iconFile : (fs.existsSync(fallback) ? fallback : null);

  if (!icon) { tray = null; return; }

  tray = new Tray(icon);
  tray.setToolTip('Dalil Ra9mana Agent');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'إظهار النافذة', click: () => mainWindow?.show() },
    { type: 'separator' },
    { label: 'إنهاء',          click: () => { app.exit(0); } },
  ]));
  tray.on('click', () => mainWindow?.show());
}

// ── App lifecycle ──────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  createWindow();
  createTray();
  nativeTheme.themeSource = 'dark';
});

app.on('window-all-closed', (e) => e.preventDefault()); // keep alive in tray
app.on('activate', () => mainWindow?.show());

// ── IPC: window controls ───────────────────────────────────────────────────────
ipcMain.handle('win:minimize', () => mainWindow?.minimize());
ipcMain.handle('win:maximize', () =>
  mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow?.maximize());
ipcMain.handle('win:close',   () => mainWindow?.hide());

// ── IPC: dialogs ───────────────────────────────────────────────────────────────
ipcMain.handle('dialog:file', async (_e, filters) => {
  const r = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: filters ?? [{ name: 'Excel Files', extensions: ['xlsx', 'xls'] }],
  });
  return r.canceled ? null : r.filePaths[0];
});

ipcMain.handle('dialog:folder', async () => {
  const r = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
  return r.canceled ? null : r.filePaths[0];
});

// ── IPC: filesystem (constrained) ─────────────────────────────────────────────
ipcMain.handle('fs:read', async (_e, filePath, allowedFolders) => {
  if (!isPathAllowed(filePath, allowedFolders)) throw new Error('Path not in allowed folders');
  return fs.promises.readFile(filePath);
});

ipcMain.handle('fs:list', async (_e, folderPath, allowedFolders) => {
  if (!isPathAllowed(folderPath, allowedFolders)) throw new Error('Path not in allowed folders');
  const entries = await fs.promises.readdir(folderPath, { withFileTypes: true });
  return entries.map((e) => ({ name: e.name, isDir: e.isDirectory() }));
});

const watchers = new Map();
ipcMain.handle('fs:watch', async (_e, folderPath, allowedFolders) => {
  if (!isPathAllowed(folderPath, allowedFolders)) throw new Error('Path not in allowed folders');
  if (watchers.has(folderPath)) return { watching: true, existing: true };

  const w = fs.watch(folderPath, { recursive: false }, (eventType, filename) => {
    if (filename && /\.(xlsx|xls)$/i.test(filename)) {
      mainWindow?.webContents.send('fs:fileChanged', { eventType, filename, folder: folderPath });
    }
  });
  watchers.set(folderPath, w);
  return { watching: true };
});

ipcMain.handle('fs:open', async (_e, targetPath, allowedFolders) => {
  if (!isPathAllowed(targetPath, allowedFolders)) throw new Error('Path not in allowed folders');
  const err = await shell.openPath(targetPath);
  if (err) throw new Error(err);
  return { ok: true };
});

ipcMain.handle('fs:openApp', async (_e, appPath, allowedFolders) => {
  if (!isPathAllowed(appPath, allowedFolders)) throw new Error('Path not in allowed folders');
  const err = await shell.openPath(appPath);
  if (err) throw new Error(err);
  return { ok: true };
});

ipcMain.handle('fs:backup', async (_e, srcFolder, destFolder, allowedFolders) => {
  if (!isPathAllowed(srcFolder,  allowedFolders)) throw new Error('Source path not in allowed folders');
  if (!isPathAllowed(destFolder, allowedFolders)) throw new Error('Destination path not in allowed folders');

  await fs.promises.mkdir(destFolder, { recursive: true });
  const files = await fs.promises.readdir(srcFolder);
  let copied = 0;
  for (const f of files) {
    if (/\.(pdf|xlsx|xls)$/i.test(f)) {
      await fs.promises.copyFile(
        path.join(srcFolder, f),
        path.join(destFolder, f),
      );
      copied++;
    }
  }
  return { ok: true, copied };
});

// ── IPC: auto-start ────────────────────────────────────────────────────────────
ipcMain.handle('autostart:get', () => app.getLoginItemSettings().openAtLogin);
ipcMain.handle('autostart:set', (_e, enabled) => {
  app.setLoginItemSettings({ openAtLogin: Boolean(enabled) });
  return Boolean(enabled);
});

// ── IPC: settings (plain JSON in userData) ─────────────────────────────────────
const SETTINGS_PATH = dataPath('settings.json');
ipcMain.handle('store:get', async () => {
  try { return JSON.parse(await fs.promises.readFile(SETTINGS_PATH, 'utf-8')); }
  catch { return {}; }
});
ipcMain.handle('store:set', async (_e, data) => {
  await fs.promises.writeFile(SETTINGS_PATH, JSON.stringify(data, null, 2));
  return true;
});

// ── IPC: secure token (safeStorage) ───────────────────────────────────────────
const TOKEN_PATH = dataPath('.agent_token');
ipcMain.handle('token:save', async (_e, token) => {
  const { safeStorage } = require('electron');
  const enc = safeStorage.encryptString(String(token));
  await fs.promises.writeFile(TOKEN_PATH, enc);
  return true;
});
ipcMain.handle('token:load', async () => {
  const { safeStorage } = require('electron');
  try {
    const enc = await fs.promises.readFile(TOKEN_PATH);
    return safeStorage.decryptString(enc);
  } catch { return null; }
});
ipcMain.handle('token:delete', async () => {
  try { await fs.promises.unlink(TOKEN_PATH); } catch {}
  return true;
});

// ── IPC: Screen capture (Electron desktopCapturer) ────────────────────────────
ipcMain.handle('screen:capture', async () => {
  const display = screen.getPrimaryDisplay();
  const { width, height } = display.size;
  const scaleFactor = display.scaleFactor || 1;
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: {
      width:  Math.round(width  * scaleFactor * 0.6),
      height: Math.round(height * scaleFactor * 0.6),
    },
  });
  if (!sources.length) throw new Error('No screen sources found');
  return {
    dataUrl:      sources[0].thumbnail.toDataURL(),
    screenWidth:  Math.round(width  * scaleFactor),
    screenHeight: Math.round(height * scaleFactor),
  };
});

ipcMain.handle('screen:size', () => {
  const { width, height } = screen.getPrimaryDisplay().size;
  const sf = screen.getPrimaryDisplay().scaleFactor || 1;
  return { width: Math.round(width * sf), height: Math.round(height * sf) };
});

// ── IPC: Mouse control (via PowerShell P/Invoke) ───────────────────────────────
const MOUSE_TYPE_DEF = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class RobotMouse {
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, int dx, int dy, uint dwData, int dwExtraInfo);
    public const uint LEFTDOWN   = 0x0002;
    public const uint LEFTUP     = 0x0004;
    public const uint RIGHTDOWN  = 0x0008;
    public const uint RIGHTUP    = 0x0010;
    public const uint MIDDLEDOWN = 0x0020;
    public const uint MIDDLEUP   = 0x0040;
    public const uint WHEEL      = 0x0800;
}
"@`;

ipcMain.handle('robot:click', async (_e, x, y, button = 'left') => {
  const downFlag = { left: '[RobotMouse]::LEFTDOWN', right: '[RobotMouse]::RIGHTDOWN', middle: '[RobotMouse]::MIDDLEDOWN' }[button] || '[RobotMouse]::LEFTDOWN';
  const upFlag   = { left: '[RobotMouse]::LEFTUP',   right: '[RobotMouse]::RIGHTUP',   middle: '[RobotMouse]::MIDDLEUP'   }[button] || '[RobotMouse]::LEFTUP';
  await runPS(`${MOUSE_TYPE_DEF}
[RobotMouse]::SetCursorPos(${Math.round(x)}, ${Math.round(y)})
Start-Sleep -Milliseconds 80
[RobotMouse]::mouse_event(${downFlag}, 0, 0, 0, 0)
Start-Sleep -Milliseconds 50
[RobotMouse]::mouse_event(${upFlag}, 0, 0, 0, 0)`);
  return { ok: true };
});

ipcMain.handle('robot:doubleclick', async (_e, x, y) => {
  await runPS(`${MOUSE_TYPE_DEF}
[RobotMouse]::SetCursorPos(${Math.round(x)}, ${Math.round(y)})
Start-Sleep -Milliseconds 80
[RobotMouse]::mouse_event([RobotMouse]::LEFTDOWN, 0, 0, 0, 0); Start-Sleep -Milliseconds 40
[RobotMouse]::mouse_event([RobotMouse]::LEFTUP,   0, 0, 0, 0); Start-Sleep -Milliseconds 120
[RobotMouse]::mouse_event([RobotMouse]::LEFTDOWN, 0, 0, 0, 0); Start-Sleep -Milliseconds 40
[RobotMouse]::mouse_event([RobotMouse]::LEFTUP,   0, 0, 0, 0)`);
  return { ok: true };
});

ipcMain.handle('robot:scroll', async (_e, x, y, delta) => {
  // delta: positive = scroll up, negative = scroll down
  await runPS(`${MOUSE_TYPE_DEF}
[RobotMouse]::SetCursorPos(${Math.round(x)}, ${Math.round(y)})
Start-Sleep -Milliseconds 40
[RobotMouse]::mouse_event([RobotMouse]::WHEEL, 0, 0, ${Math.round(delta * 120)}, 0)`);
  return { ok: true };
});

ipcMain.handle('robot:move', async (_e, x, y) => {
  await runPS(`${MOUSE_TYPE_DEF}
[RobotMouse]::SetCursorPos(${Math.round(x)}, ${Math.round(y)})`);
  return { ok: true };
});

// ── IPC: Keyboard control ──────────────────────────────────────────────────────
const KEY_MAP = {
  enter: '{ENTER}', return: '{ENTER}', tab: '{TAB}', escape: '{ESC}', esc: '{ESC}',
  backspace: '{BACKSPACE}', delete: '{DELETE}', home: '{HOME}', end: '{END}',
  pageup: '{PGUP}', pagedown: '{PGDN}',
  arrowup: '{UP}', arrowdown: '{DOWN}', arrowleft: '{LEFT}', arrowright: '{RIGHT}',
  up: '{UP}', down: '{DOWN}', left: '{LEFT}', right: '{RIGHT}',
  f1: '{F1}', f2: '{F2}', f3: '{F3}', f4: '{F4}', f5: '{F5}',
  f6: '{F6}', f7: '{F7}', f8: '{F8}', f9: '{F9}', f10: '{F10}',
  f11: '{F11}', f12: '{F12}',
  // Combos
  'ctrl+c': '^c', 'ctrl+v': '^v', 'ctrl+x': '^x', 'ctrl+z': '^z', 'ctrl+y': '^y',
  'ctrl+a': '^a', 'ctrl+s': '^s', 'ctrl+f': '^f', 'ctrl+p': '^p', 'ctrl+w': '^w',
  'ctrl+t': '^t', 'ctrl+n': '^n', 'ctrl+r': '^r',
  'alt+f4': '%{F4}', 'alt+tab': '%{TAB}', 'win': '{LWIN}',
};

ipcMain.handle('robot:key', async (_e, key) => {
  const k       = (key || '').toLowerCase();
  const sendKey = KEY_MAP[k] || `{${key.toUpperCase()}}`;
  await runPS(`Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait(${JSON.stringify(sendKey)})`);
  return { ok: true };
});

ipcMain.handle('robot:type', async (_e, text) => {
  if (!text) return { ok: true };
  // Escape special SendKeys chars: + ^ % ~ ( ) { } [ ]
  const escaped = String(text).replace(/([+^%~(){}[\]])/g, '{$1}');
  await runPS(`Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait(${JSON.stringify(escaped)})`);
  return { ok: true };
});

// ── IPC: Open URL in default browser ──────────────────────────────────────────
ipcMain.handle('shell:openUrl', async (_e, url) => {
  // Only allow http/https to avoid arbitrary protocol abuse
  if (!/^https?:\/\//i.test(url)) throw new Error('Only http/https URLs are allowed');
  await shell.openExternal(url);
  return { ok: true, url };
});

// ── IPC: Shell execution ───────────────────────────────────────────────────────
ipcMain.handle('shell:exec', (_e, command) => new Promise((resolve) => {
  exec(command, {
    shell: true,
    timeout: 30_000,
    maxBuffer: 5 * 1024 * 1024,
    windowsHide: true,
    encoding: 'buffer',
  }, (err, stdout, stderr) => {
    const dec = (b) => { try { return b.toString('utf-8'); } catch { return b.toString('binary'); } };
    resolve({
      ok:       !err || err.code === 0,
      stdout:   dec(stdout),
      stderr:   dec(stderr),
      exitCode: err?.code ?? 0,
    });
  });
}));

// ── IPC: action log ────────────────────────────────────────────────────────────
const LOG_PATH    = dataPath('agent.log');
const MAX_LINES   = 500;

ipcMain.handle('log:append', async (_e, entry) => {
  const line = JSON.stringify({ ...entry, ts: new Date().toISOString() }) + '\n';
  await fs.promises.appendFile(LOG_PATH, line);
  return true;
});

ipcMain.handle('log:read', async () => {
  try {
    const raw = await fs.promises.readFile(LOG_PATH, 'utf-8');
    const lines = raw.trim().split('\n').filter(Boolean);
    return lines.slice(-MAX_LINES).map((l) => {
      try { return JSON.parse(l); } catch { return null; }
    }).filter(Boolean);
  } catch { return []; }
});
