import { eq } from "drizzle-orm";
import { db, siteSettingsTable } from "../../shared/db.js";
import { DEFAULT_GEMINI_OCR_MODEL, isGeminiOcrModel } from "../../shared/ai-models.js";

/**
 * Global site settings stored in the `site_settings` table.
 * Values are cached in-memory for a short TTL so hot paths (e.g. /payments/me)
 * don't hit the DB on every request, while admin toggles still propagate
 * quickly across the process.
 */

const CACHE_TTL_MS = 15_000;
const cache = new Map<string, { value: string; expiresAt: number }>();

export async function getSiteSetting(key: string, fallback = ""): Promise<string> {
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value;
  try {
    const [row] = await db.select({ value: siteSettingsTable.value })
      .from(siteSettingsTable)
      .where(eq(siteSettingsTable.key, key))
      .limit(1);
    const value = row?.value ?? fallback;
    cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
    return value;
  } catch {
    return fallback;
  }
}

export async function setSiteSetting(key: string, value: string): Promise<void> {
  await db.insert(siteSettingsTable)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: siteSettingsTable.key,
      set: { value, updatedAt: new Date() },
    });
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

export const TRIAL_ENABLED_KEY = "free_trial_enabled";
export const GEMINI_OCR_MODEL_KEY = "gemini_ocr_model";
export const CHARGILY_ENABLED_KEY = "chargily_enabled";

export async function isFreeTrialEnabled(): Promise<boolean> {
  const value = await getSiteSetting(TRIAL_ENABLED_KEY, "true");
  return value !== "false";
}

/**
 * Gemini model used for all OCR vision calls. Admin-selectable via
 * /api/assistant/gemini-model; falls back to the shared default when unset
 * or when the stored value is not in the allowlist.
 */
export async function getGeminiOcrModel(): Promise<string> {
  const value = await getSiteSetting(GEMINI_OCR_MODEL_KEY, DEFAULT_GEMINI_OCR_MODEL);
  return isGeminiOcrModel(value) ? value : DEFAULT_GEMINI_OCR_MODEL;
}

/**
 * Chargily card payments. Disabled by default — manual CCP payment is the
 * primary channel. Admin can re-enable via /api/payments/admin/chargily-setting.
 * The webhook stays active so payments already in-flight still settle.
 */
export async function isChargilyEnabled(): Promise<boolean> {
  const value = await getSiteSetting(CHARGILY_ENABLED_KEY, "false");
  return value === "true";
}
