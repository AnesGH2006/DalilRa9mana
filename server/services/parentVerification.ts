/**
 * Checks used when a parent links their account to a child:
 *  - the phone number the parent types must match a number in the school's students file
 *    (formats like 0550 12 34 56, +213 550 12 34 56 and 00213550123456 all count as the same number)
 *  - the child's name the parent types must be similar to the name in the school's records
 *    (word order, hamza/alef variants, ta marbuta and one-letter typos are tolerated)
 *  - repeated failed attempts are limited, so nobody can guess names and numbers
 */

const ARABIC_INDIC = "٠١٢٣٤٥٦٧٨٩";

export function normalizeText(value: string): string {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[\u200B-\u200F\uFEFF]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i]![j] = a[i - 1] === b[j - 1]
        ? dp[i - 1]![j - 1]!
        : 1 + Math.min(dp[i - 1]![j]!, dp[i]![j - 1]!, dp[i - 1]![j - 1]!);
    }
  }
  return dp[m]![n]!;
}

/** 0..1: how well the typed name matches the recorded name. */
export function nameScore(typed: string, recorded: string): number {
  const na = normalizeText(typed);
  const nb = normalizeText(recorded);
  if (!na || !nb) return 0;
  if (na === nb) return 1;

  const wa = na.split(" ");
  const wb = nb.split(" ");
  const [shorter, longer] = wa.length <= wb.length ? [wa, wb] : [wb, wa];
  // A single word is not enough to identify a child.
  if (shorter.length < 2 && longer.length >= 2) return 0;

  const used = new Set<number>();
  let matched = 0;
  for (const word of shorter) {
    const index = longer.findIndex((other, i) =>
      !used.has(i) && (other === word || (word.length >= 4 && other.length >= 4 && levenshtein(other, word) <= 1)),
    );
    if (index >= 0) {
      used.add(index);
      matched += 1;
    }
  }
  const coverage = matched / shorter.length;
  const balance = shorter.length / longer.length;
  return coverage * (0.6 + 0.4 * balance);
}

export const NAME_MATCH_THRESHOLD = 0.7;

const PHONE_RE = /(?:\+?\s*213|00\s*213|0)[\s.\-()]*[2-7](?:[\s.\-()]*\d){7,8}/g;

/** Comparable keys (the last 9 digits) of every phone number found in a text. */
export function phoneKeys(raw: string | null | undefined): string[] {
  const text = String(raw ?? "").replace(/[٠-٩]/g, digit => String(ARABIC_INDIC.indexOf(digit)));
  const keys = new Set<string>();

  for (const match of text.matchAll(PHONE_RE)) {
    const digits = match[0].replace(/\D/g, "");
    const local = digits.startsWith("00213")
      ? digits.slice(5)
      : digits.startsWith("213")
        ? digits.slice(3)
        : digits.replace(/^0/, "");
    if (local.length >= 8 && local.length <= 9) keys.add(local.slice(-9));
  }

  if (keys.size === 0) {
    const digits = text.replace(/\D/g, "");
    if (digits.length >= 9) keys.add(digits.slice(-9));
  }
  return [...keys];
}

export function phonesMatch(typed: string, recorded: string | null | undefined): boolean {
  const typedKeys = phoneKeys(typed);
  if (typedKeys.length === 0) return false;
  const recordedKeys = new Set(phoneKeys(recorded));
  return typedKeys.some(key => recordedKeys.has(key));
}

/** Cleaned number to store on the parent's membership (0XXXXXXXXX). */
export function cleanPhone(raw: string): string {
  const key = phoneKeys(raw)[0];
  return key ? `0${key}` : String(raw ?? "").replace(/\s+/g, "").slice(0, 30);
}

// ── Limit failed attempts (kept in memory; resets when the server restarts) ────────────────────
const failures = new Map<string, number[]>();
const WINDOW_MS = 15 * 60 * 1000;

export function tooManyAttempts(key: string, limit: number): boolean {
  const now = Date.now();
  const recent = (failures.get(key) ?? []).filter(time => now - time < WINDOW_MS);
  failures.set(key, recent);
  return recent.length >= limit;
}

export function recordFailure(key: string): void {
  if (failures.size > 5000) failures.clear();
  const now = Date.now();
  const recent = (failures.get(key) ?? []).filter(time => now - time < WINDOW_MS);
  recent.push(now);
  failures.set(key, recent);
}