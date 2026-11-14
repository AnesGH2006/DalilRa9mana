import { Router, type Request, type Response, type NextFunction } from "express";
import { existsSync } from "fs";
import { resolve } from "path";
import * as ctrl from "../controllers/agentController.js";
import { agentAuthMiddleware } from "../middlewares/agentAuth.js";
import { getIO } from "../socket/index.js";

const router = Router();

// ── CORS for agent endpoints (Electron app uses Bearer token, not cookies) ────
// Allow any origin so the desktop agent (file:// origin) can reach these routes.
function agentCors(req: Request, res: Response, next: NextFunction) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  if (req.method === "OPTIONS") { res.sendStatus(204); return; }
  next();
}

// ── Installer download ────────────────────────────────────────────────────────
router.get("/agent/download", (req, res) => {
  // Serve pre-built installer from agent/dist/ if it exists
  const candidates = [
    resolve(process.cwd(), "agent/dist/DalilRa9manaAgent-Setup.exe"),
    resolve(process.cwd(), "agent/dist/Dalil Ra9mana Agent Setup.exe"),
    resolve(process.cwd(), "agent/dist/SchoolManagerAgent-Setup.exe"),
    resolve(process.cwd(), "agent/dist/SchoolManagerAgent Setup.exe"),
  ];
  const found = candidates.find(p => existsSync(p));
  if (found) {
    res.download(found, "DalilRa9manaAgent-Setup.exe");
  } else {
    res.status(503).json({
      error: "installer_not_built",
      message: "المثبّت غير متوفر بعد. يجب بناؤه من جهاز Windows أولاً عبر: cd agent && npm install && npm run build:win",
    });
  }
});

// ── Session-authenticated (school admin via web app) ──────────────────────────
router.post("/agent/token", ctrl.createToken);
router.get("/agent/tokens", ctrl.listTokens);
router.delete("/agent/tokens/:id", ctrl.revokeToken);

// ── Agent-token-authenticated (desktop agent) — CORS open, Bearer token guards ─
// Preflight OPTIONS for each endpoint (bare wildcard * is invalid in path-to-regexp v8)
router.options("/agent/status",        agentCors);
router.options("/agent/upload-excel",  agentCors);
router.options("/agent/folders",       agentCors);
router.options("/agent/logs",          agentCors);

router.get("/agent/status",        agentCors, agentAuthMiddleware, ctrl.getStatus);
router.post("/agent/upload-excel", agentCors, agentAuthMiddleware, ...ctrl.uploadExcel);
router.post("/agent/folders",      agentCors, agentAuthMiddleware, ctrl.updateFolders);
router.get("/agent/logs",          agentCors, agentAuthMiddleware, ctrl.getLogs);

// ── Send a command to a connected desktop agent (session-auth from web UI) ────
const ALLOWED_COMMANDS = new Set([
  // File / folder / app operations
  "openFolder", "openFile", "openApp", "backupReports",
  "monitorFolder", "syncData", "printReport",
  // Open any URL in the default browser (e.g. YouTube)
  "openUrl",
  // Screen control
  "screenCapture", "startStream", "stopStream",
  // Mouse control
  "mouseClick", "mouseDoubleClick", "mouseScroll", "mouseMove",
  // Keyboard control
  "typeText", "pressKey",
  // Shell execution
  "shellExec",
]);

router.options("/agent/command", agentCors);
router.post("/agent/command", async (req: Request, res: Response) => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { agentTokenId, action, payload } = req.body ?? {};
  if (!agentTokenId || !action) {
    res.status(400).json({ error: "agentTokenId and action are required" }); return;
  }
  if (!ALLOWED_COMMANDS.has(action)) {
    res.status(400).json({ error: `Unknown action: ${action}` }); return;
  }

  try {
    const io = getIO();
    let sent = false;
    for (const [, socket] of io.sockets.sockets) {
      const tok = (socket as any).agentToken;
      if (tok?.id === agentTokenId && tok?.userId === (req.user as any)?.id) {
        socket.emit("agent:command", { action, payload: payload ?? {} });
        sent = true;
        break;
      }
    }
    if (!sent) {
      res.status(404).json({ error: "agent_offline", message: "الوكيل غير متصل حالياً" });
    } else {
      res.json({ ok: true, action });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
