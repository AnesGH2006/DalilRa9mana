export const SCHOOL_STAGE_LEVELS = {
  moyen: ["1AM", "2AM", "3AM", "4AM"],
  lycee: ["1AS", "2AS", "3AS"],
} as const;

export type SchoolStage = keyof typeof SCHOOL_STAGE_LEVELS;
export type SchoolLevel = typeof SCHOOL_STAGE_LEVELS[SchoolStage][number];

export function isSchoolStage(value: unknown): value is SchoolStage {
  return value === "moyen" || value === "lycee";
}
