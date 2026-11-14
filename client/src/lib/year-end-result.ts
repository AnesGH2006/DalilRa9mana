export interface YearEndResult {
  student: { niveau: string };
  annualAvg: number | null;
  bemAvg?: number | null;
  finalAvg?: number | null;
  finalPassed?: boolean | null;
}

export function getFinalAvg(result: YearEndResult): number | null {
  if (result.student.niveau === "4AM") {
    if (result.finalAvg !== undefined) return result.finalAvg;
    const annualAvg = result.annualAvg;
    const bemAvg = result.bemAvg;
    if (bemAvg == null) return annualAvg ?? null;
    if (bemAvg >= 10) return bemAvg;
    if (annualAvg == null) return null;
    return Math.round(((annualAvg + bemAvg) / 2) * 100) / 100;
  }
  return result.annualAvg;
}

export function getFinalPassed(result: YearEndResult): boolean | null {
  const average = getFinalAvg(result);
  return average === null ? null : average >= 10;
}
