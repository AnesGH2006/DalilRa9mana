import type { Request, Response, NextFunction } from "express";
import { db, agentTokensTable } from "../../shared/db.js";
import { eq } from "drizzle-orm";
import type { AgentToken } from "../../shared/schema.js";

export interface AgentRequest extends Request {
  agentToken: AgentToken;
}

export async function agentAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers["authorization"];
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing agent token" });
    return;
  }
  const token = authHeader.slice(7);

  const [agentToken] = await db
    .select()
    .from(agentTokensTable)
    .where(eq(agentTokensTable.token, token));

  if (!agentToken) {
    res.status(401).json({ error: "Invalid agent token" });
    return;
  }
  if (agentToken.expiresAt && agentToken.expiresAt < new Date()) {
    res.status(401).json({ error: "Token expired" });
    return;
  }

  await db
    .update(agentTokensTable)
    .set({ lastSeenAt: new Date() })
    .where(eq(agentTokensTable.id, agentToken.id));

  (req as AgentRequest).agentToken = agentToken;
  next();
}
