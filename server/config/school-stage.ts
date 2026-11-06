import type { Request } from "express";
import { isSchoolStage, SCHOOL_STAGE_LEVELS } from "../../shared/school-stage.js";
import type { SchoolStage } from "../../shared/school-stage.js";

const configuredStage = process.env.SCHOOL_STAGE ?? "moyen";

if (!isSchoolStage(configuredStage)) {
  throw new Error(`Invalid SCHOOL_STAGE "${configuredStage}". Expected "moyen" or "lycee".`);
}

export const SCHOOL_STAGE = configuredStage;
export const SCHOOL_LEVELS = SCHOOL_STAGE_LEVELS[SCHOOL_STAGE];

export function getSchoolStageForRequest(_req: Request): SchoolStage {
  return SCHOOL_STAGE;
}

export function getSchoolLevelsForRequest(req: Request) {
  return SCHOOL_STAGE_LEVELS[getSchoolStageForRequest(req)];
}
