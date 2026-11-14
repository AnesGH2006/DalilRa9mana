# Dalil Ra9mana Agent — الوكيل المكتبي

A secure Windows desktop agent for Dalil Ra9mana. It connects to the server via WebSocket (Socket.IO), executes only pre-approved tasks, and gives the school administrator a clean Arabic dashboard.

---

## Architecture

```
agent/                       ← Electron desktop app (Windows)
  src/
    main.js                  ← Electron main process (IPC, file system, tray)
    preload.js               ← contextBridge — exposes safe IPC to renderer
    config.js                ← server URL and endpoint config
    services/
      socketService.js       ← Socket.IO client wrapper
      taskService.js         ← task executor (no arbitrary shell commands)
    renderer/
      index.html             ← Arabic UI (frameless window)
      styles.css             ← dark theme
      app.js                 ← renderer logic

server/ (additions to the SaaS backend)
  socket/
    index.ts                 ← Socket.IO server, auth middleware
    agentHandler.ts          ← Socket event handlers
  routes/agent.ts            ← REST endpoints
  controllers/agentController.ts
  services/agentService.ts
  middlewares/agentAuth.ts
```

---

## Installation

### Prerequisites

- Node.js 18 or later
- Windows 10/11 (for the agent)

### 1. Configure server URL

Edit `agent/src/config.js` and set `SERVER_URL` to your deployed SaaS URL:

```js
SERVER_URL: 'https://dalilrakmana.onrender.com',
```

### 2. Install agent dependencies

```bash
cd agent
npm install
```

### 3. Run in development

```bash
npm run dev
```

### 4. Build Windows installer

```bash
npm run build:win
# Output: agent/dist/Dalil Ra9mana Agent Setup.exe
```

---

## Configuration

### Getting an Agent Token

1. Log in to the Dalil Ra9mana web app as an administrator.
2. Call `POST /api/agent/token` with `{ "deviceName": "حاسوب الإدارة" }` (this will be a settings screen in a future update).
3. Copy the returned token.
4. Paste the token into the agent's login screen.

The token is stored encrypted using Electron's `safeStorage` (OS-level credential store).

---

## Running the Agent

1. Launch the app (`.exe` or `npm run dev`).
2. Enter the **agent token** generated from the web dashboard.
3. The agent connects to the server via WebSocket.
4. Use **صلاحيات المجلدات** (Folder Permissions) to specify which folders the agent may access.
5. Enable **التشغيل مع بدء Windows** (Auto-start) in Settings if desired.

---

## Security Model

| Property | Implementation |
|---|---|
| Authentication | Bearer token validated server-side on every REST request and on every WebSocket connection |
| Token storage | `electron.safeStorage` — OS-level encryption (DPAPI on Windows) |
| File system access | Constrained to **admin-approved folders only** — any path outside is rejected in `main.js` |
| Allowed actions | Enum-based whitelist — `upload_excel`, `print_report`, `open_folder`, `open_file`, `open_app`, `backup_reports`, `sync_data`, `monitor_folder` |
| Arbitrary commands | **Never executed** — no `exec`, `spawn`, or `eval` |
| Transport | HTTPS + WSS enforced by using the server's production URL |
| Logging | Every action timestamped in `agent.log` and synced to the server's `agent_logs` table |

---

## Communication Flow

```
Admin (web)          Server (Express + Socket.IO)      Agent (Electron)
    │                            │                            │
    │  POST /api/agent/token     │                            │
    │ ─────────────────────────► │                            │
    │  ◄── { token }             │                            │
    │                            │                            │
    │                            │  ws connect + { token }    │
    │                            │ ◄──────────────────────────│
    │                            │  validate token            │
    │                            │ ──────────────────────────►│
    │                            │  agent:connected           │
    │                            │                            │
    │  trigger command           │                            │
    │ ─────────────────────────► │  agent:command             │
    │                            │ ──────────────────────────►│
    │                            │                            │ execute safe action
    │                            │  agent:taskResult          │
    │                            │ ◄──────────────────────────│
    │  ◄── log entry in DB       │                            │
```

---

## REST API Reference

All agent-token-authenticated endpoints require:
```
Authorization: Bearer <agent_token>
```

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/agent/token` | Session | Generate a new agent token |
| `GET` | `/api/agent/tokens` | Session | List tokens (no raw values) |
| `DELETE` | `/api/agent/tokens/:id` | Session | Revoke a token |
| `GET` | `/api/agent/status` | Token | Get agent status + recent logs |
| `POST` | `/api/agent/upload-excel` | Token | Upload an Excel file |
| `POST` | `/api/agent/folders` | Token | Update allowed folder list |
| `GET` | `/api/agent/logs` | Token | Get action log |

---

## Socket.IO Events

| Direction | Event | Payload |
|---|---|---|
| Agent → Server | `agent:ping` | — |
| Agent → Server | `agent:taskResult` | `{ action, status, details, taskId }` |
| Server → Agent | `agent:command` | `{ action, payload }` |
| Server → Agent | `server:syncData` | `{ year? }` |
| Server → Agent | `server:openFolder` | `{ path }` |
| Server → Agent | `server:backupReports` | `{ sourceFolder, destFolder }` |
