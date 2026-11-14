import crypto from "crypto";
import { randomUUID } from "crypto";
import { db, agentTokensTable, agentLogsTable } from "../../shared/db.js";
import { eq, desc } from "drizzle-orm";

export async function generateAgentToken(
  userId: string,
  deviceName: string,
): Promise<string> {
  const token = crypto.randomBytes(48).toString("hex");
  const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 1 year

  await db.insert(agentTokensTable).values({
    id: randomUUID(),
    userId,
    token,
    deviceName,
    allowedFolders: [],
    expiresAt,
  });

  return token;
}

export async function revokeAgentToken(tokenId: string): Promise<void> {
  await db.delete(agentTokensTable).where(eq(agentTokensTable.id, tokenId));
}

export async function getAgentTokens(userId: string) {
  return db
    .select()
    .from(agentTokensTable)
    .where(eq(agentTokensTable.userId, userId))
    .orderBy(desc(agentTokensTable.createdAt));
}

export async function getAgentLogs(agentTokenId: string, limit = 50) {
  return db
    .select()
    .from(agentLogsTable)
    .where(eq(agentLogsTable.agentTokenId, agentTokenId))
    .orderBy(desc(agentLogsTable.createdAt))
    .limit(limit);
}

export async function updateAllowedFolders(
  tokenId: string,
  folders: string[],
): Promise<void> {
  await db
    .update(agentTokensTable)
    .set({ allowedFolders: folders })
    .where(eq(agentTokensTable.id, tokenId));
}
