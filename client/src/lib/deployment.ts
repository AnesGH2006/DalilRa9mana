import type { SchoolStage } from "@shared/school-stage";
import { SCHOOL_STAGE_LEVELS, isSchoolStage } from "@shared/school-stage";

declare const __SCHOOL_STAGE__: SchoolStage;

export let SCHOOL_STAGE: SchoolStage = isSchoolStage(__SCHOOL_STAGE__) ? __SCHOOL_STAGE__ : "moyen";
export const SCHOOL_LEVELS: Array<(typeof SCHOOL_STAGE_LEVELS)[SchoolStage][number]> = [
  ...SCHOOL_STAGE_LEVELS[SCHOOL_STAGE],
];

export function setSchoolStage(stage: SchoolStage): void {
  SCHOOL_STAGE = stage;
  SCHOOL_LEVELS.splice(0, SCHOOL_LEVELS.length, ...SCHOOL_STAGE_LEVELS[stage]);
}
