/**
 * Canonical result-count math shared by dashboard, analytics and reports.
 *
 * "نسبة النجاح" is always computed over evaluated students only:
 *   admis + non_admis + mustarrak
 * Students without a recorded result are excluded from the denominator.
 */

export interface ResultCounts {
  admis: number;
  nonAdmis: number;
  mustarrak?: number | null;
}

export function evaluatedCount(r: ResultCounts): number {
  return r.admis + r.nonAdmis + (r.mustarrak ?? 0);
}

/** Success rate in percent (0-100), or null when nobody has a result yet. */
export function successRatePercent(r: ResultCounts): number | null {
  const denom = evaluatedCount(r);
  return denom > 0 ? Math.round((r.admis / denom) * 100) : null;
}
