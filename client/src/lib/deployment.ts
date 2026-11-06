import type { SchoolStage } from "@shared/school-stage";
import { SCHOOL_STAGE_LEVELS, isSchoolStage } from "@shared/school-stage";

declare const __SCHOOL_STAGE__: SchoolStage;

export const SCHOOL_STAGE = isSchoolStage(__SCHOOL_STAGE__) ? __SCHOOL_STAGE__ : "moyen";
export const SCHOOL_LEVELS = SCHOOL_STAGE_LEVELS[SCHOOL_STAGE];
