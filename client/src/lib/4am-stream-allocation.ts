import type { StudentResult } from "@shared/types";

export type FourAMStream = "science" | "arts";
export interface FourAMStreamCapacities {
  science: number;
  arts: number;
}

export const FOUR_AM_CAPACITY_STORAGE_KEY = "orientation-track-capacities";
export const DEFAULT_FOUR_AM_CAPACITIES: FourAMStreamCapacities = { science: 30, arts: 30 };

export function getFourAMCapacities(year: string): FourAMStreamCapacities {
  if (typeof window === "undefined") return DEFAULT_FOUR_AM_CAPACITIES;
  try {
    const saved = JSON.parse(window.localStorage.getItem(FOUR_AM_CAPACITY_STORAGE_KEY) ?? "{}") as Record<string, Partial<FourAMStreamCapacities>>;
    const capacities = saved[year];
    return {
      science: validCapacity(capacities?.science, DEFAULT_FOUR_AM_CAPACITIES.science),
      arts: validCapacity(capacities?.arts, DEFAULT_FOUR_AM_CAPACITIES.arts),
    };
  } catch {
    return DEFAULT_FOUR_AM_CAPACITIES;
  }
}

function validCapacity(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(500, Math.floor(value)))
    : fallback;
}

function subjectAnnualAverage(result: StudentResult, key: string): number | null {
  const values = [1, 2, 3]
    .map(term => result.scores[String(term)]?.[key])
    .filter((score): score is number => typeof score === "number" && Number.isFinite(score) && score >= 0);
  return values.length > 0 ? values.reduce((sum, score) => sum + score, 0) / values.length : null;
}

export function getFourAMScienceWeightedScore(result: StudentResult): number | null {
  if (result.annualAvg === null) return null;
  const math = subjectAnnualAverage(result, "maths");
  const physics = subjectAnnualAverage(result, "physique");
  const naturalScience = subjectAnnualAverage(result, "svt");
  if (math === null || physics === null || naturalScience === null) return null;
  return (math * 4 + physics * 3 + naturalScience * 3 + result.annualAvg * 2) / 12;
}

export function getFourAMArtsAverage(result: StudentResult): number | null {
  const values = ["arabe", "francais", "anglais"]
    .map(key => subjectAnnualAverage(result, key))
    .filter((score): score is number => score !== null);
  return values.length > 0 ? values.reduce((sum, score) => sum + score, 0) / values.length : null;
}

export function getFourAMPreferredStream(choices: string[] | undefined): FourAMStream | null {
  const firstChoice = choices?.[0]
    ?.replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآا]/g, "ا")
    .replace(/[ةه]/g, "ه")
    .replace(/ى/g, "ي")
    .toLowerCase();
  if (!firstChoice) return null;
  if (firstChoice.includes("علوم")) return "science";
  if (firstChoice.includes("اداب")) return "arts";
  return null;
}

export function rankFourAMScienceApplicants(
  results: StudentResult[],
  wishes: Map<string, string[]> = new Map(),
): StudentResult[] {
  return results
    .filter(result => getFourAMPreferredStream(wishes.get(result.student.id)) !== "arts")
    .map(result => ({ result, score: getFourAMScienceWeightedScore(result) }))
    .filter((entry): entry is { result: StudentResult; score: number } => entry.score !== null)
    .sort((a, b) => b.score - a.score || (b.result.annualAvg ?? 0) - (a.result.annualAvg ?? 0))
    .map(entry => entry.result);
}

export function rankFourAMArtsApplicants(
  results: StudentResult[],
  scienceIds: Set<string>,
  wishes: Map<string, string[]> = new Map(),
): StudentResult[] {
  return results
    .filter(result => !scienceIds.has(result.student.id))
    .map(result => ({
      result,
      score: getFourAMArtsAverage(result),
      preferred: getFourAMPreferredStream(wishes.get(result.student.id)) === "arts",
    }))
    .filter((entry): entry is { result: StudentResult; score: number; preferred: boolean } => entry.score !== null && entry.score >= 10)
    .sort((a, b) => Number(b.preferred) - Number(a.preferred) || b.score - a.score || (b.result.annualAvg ?? 0) - (a.result.annualAvg ?? 0))
    .map(entry => entry.result);
}

export function allocateFourAMStreams(
  results: StudentResult[],
  capacities: FourAMStreamCapacities,
  wishes: Map<string, string[]> = new Map(),
): Map<string, FourAMStream> {
  const eligible = results.filter(result => result.passed === true && result.annualAvg !== null);
  const scienceRanking = rankFourAMScienceApplicants(eligible, wishes);
  const scienceIds = new Set(scienceRanking.slice(0, validCapacity(capacities.science, 0)).map(result => result.student.id));
  const artsRanking = rankFourAMArtsApplicants(eligible, scienceIds, wishes);
  const artsIds = new Set(artsRanking.slice(0, validCapacity(capacities.arts, 0)).map(result => result.student.id));

  const assignments = new Map<string, FourAMStream>();
  for (const result of eligible) {
    if (scienceIds.has(result.student.id)) assignments.set(result.student.id, "science");
    else if (artsIds.has(result.student.id)) assignments.set(result.student.id, "arts");
  }
  return assignments;
}
