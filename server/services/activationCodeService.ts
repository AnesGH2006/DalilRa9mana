import { createHash, randomInt, randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db, activationCodesTable, paymentsTable, usersTable } from "../../shared/db.js";

const CODE_LENGTH = 16;
const CODE_ALPHABET = "0123456789";

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

function generateCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

export async function generateActivationBatch(count: number, expiresAt?: Date) {
  if (!Number.isInteger(count) || count < 1 || count > 10000) {
    throw new Error("count must be an integer between 1 and 10000");
  }

  const batchId = randomUUID();
  const plainCodes: string[] = [];
  const rows: Array<typeof activationCodesTable.$inferInsert> = [];
  const hashes = new Set<string>();

  while (plainCodes.length < count) {
    const code = generateCode();
    const codeHash = hashCode(code);
    if (hashes.has(codeHash)) continue;
    hashes.add(codeHash);
    plainCodes.push(code);
    rows.push({
      batchId,
      codeHash,
      codeLast4: code.slice(-4),
      expiresAt: expiresAt ?? null,
    });
  }

  await db.insert(activationCodesTable).values(rows);
  return { batchId, count: plainCodes.length, codes: plainCodes };
}

export async function redeemActivationCode(code: string, userId: string) {
  const normalized = code.replace(/\s+/g, "");
  if (!/^\d{16}$/.test(normalized)) throw new Error("Activation code must contain 16 digits");

  const codeHash = hashCode(normalized);
  const now = new Date();
  const redeemed = await db.transaction(async (tx) => {
    const [row] = await tx.update(activationCodesTable)
      .set({ status: "redeemed", redeemedBy: userId, redeemedAt: now })
      .where(and(
        eq(activationCodesTable.codeHash, codeHash),
        eq(activationCodesTable.status, "available"),
        sql`(${activationCodesTable.expiresAt} IS NULL OR ${activationCodesTable.expiresAt} > ${now})`,
      ))
      .returning({ id: activationCodesTable.id });

    if (!row) return false;

    await tx.insert(paymentsTable).values({
      userId,
      provider: "activation_code",
      providerReference: codeHash,
      amountDzd: 1000,
      status: "paid",
      paidAt: now,
      metadata: { activationCodeId: row.id },
    });

    await tx.update(usersTable).set({
      subscriptionStatus: "active",
      subscriptionPlan: "pro",
      subscriptionExpiresAt: new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000),
      updatedAt: now,
    }).where(eq(usersTable.id, userId));
    return true;
  });

  if (!redeemed) throw new Error("Code is invalid, expired, revoked, or already redeemed");
  return { redeemed: true, subscriptionStatus: "active" as const };
}
