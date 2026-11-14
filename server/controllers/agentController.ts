import type { Request, Response } from "express";
import multer from "multer";
import { randomUUID } from "crypto";
import * as agentService from "../services/agentService.js";
import { agentAuthMiddleware, type AgentRequest } from "../middlewares/agentAuth.js";
import { db, agentLogsTable } from "../../shared/db.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

const EXCEL_MIMES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
]);

// POST /api/agent/token  (requires user session)
export async function createToken(req: Request, res: Response): Promise<void> {
  const user = (req as any).user;
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { deviceName } = req.body as { deviceName?: string };
  if (!deviceName?.trim()) {
    res.status(400).json({ error: "deviceName is required" });
    return;
  }

  const token = await agentService.generateAgentToken(user.id, deviceName.trim());
  res.json({ token, deviceName });
}

// GET /api/agent/tokens  (requires user session)
export async function listTokens(req: Request, res: Response): Promise<void> {
  const user = (req as any).user;
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const tokens = await agentService.getAgentTokens(user.id);
  // Never expose raw token values
  const safe = tokens.map(({ token: _t, ...rest }) => rest);
  res.json(safe);
}

// DELETE /api/agent/tokens/:id  (requires user session)
export async function revokeToken(req: Request, res: Response): Promise<void> {
  const user = (req as any).user;
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  await agentService.revokeAgentToken(String(req.params.id));
  res.json({ ok: true });
}

// GET /api/agent/status  (agent token auth)
export async function getStatus(req: Request, res: Response): Promise<void> {
  const agentToken = (req as AgentRequest).agentToken;
  const logs = await agentService.getAgentLogs(agentToken.id, 20);
  res.json({
    ok: true,
    agentId: agentToken.id,
    deviceName: agentToken.deviceName,
    allowedFolders: agentToken.allowedFolders ?? [],
    lastSeenAt: agentToken.lastSeenAt,
    recentLogs: logs,
  });
}

// POST /api/agent/upload-excel  (agent token auth)
export const uploadExcel = [
  upload.single("file"),
  async (req: Request, res: Response): Promise<void> => {
    const agentToken = (req as AgentRequest).agentToken;
    if (!req.file) { res.status(400).json({ error: "No file provided" }); return; }

    const { originalname, mimetype, size } = req.file;
    if (!EXCEL_MIMES.has(mimetype) && !/\.(xlsx|xls)$/i.test(originalname)) {
      res.status(400).json({ error: "Only Excel files (.xlsx/.xls) are accepted" });
      return;
    }

    await db.insert(agentLogsTable).values({
      id: randomUUID(),
      agentTokenId: agentToken.id,
      userId: agentToken.userId,
      action: "upload_excel",
      status: "success",
      details: { fileName: originalname, size },
    });

    // File is in req.file.buffer — hand off to your existing grade import logic here
    res.json({ ok: true, fileName: originalname, size });
  },
] as const;

// POST /api/agent/folders  (agent token auth)
export async function updateFolders(req: Request, res: Response): Promise<void> {
  const agentToken = (req as AgentRequest).agentToken;
  const { folders } = req.body as { folders?: unknown };
  if (!Array.isArray(folders) || !folders.every((f) => typeof f === "string")) {
    res.status(400).json({ error: "folders must be an array of strings" });
    return;
  }
  await agentService.updateAllowedFolders(agentToken.id, folders);
  res.json({ ok: true, folders });
}

// GET /api/agent/logs  (agent token auth)
export async function getLogs(req: Request, res: Response): Promise<void> {
  const agentToken = (req as AgentRequest).agentToken;
  const limit = Math.min(parseInt((req.query.limit as string) ?? "50", 10), 200);
  const logs = await agentService.getAgentLogs(agentToken.id, limit);
  res.json(logs);
}
