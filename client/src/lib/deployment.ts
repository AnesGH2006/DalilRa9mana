import type { SchoolStage } from "@shared/school-stage";
import { SCHOOL_STAGE_LEVELS, isSchoolStage } from "@shared/school-stage";

declare const __SCHOOL_STAGE__: SchoolStage;

export const SCHOOL_STAGE_STORAGE_KEY = "rafik-school-stage";

function storedSchoolStage(): SchoolStage | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(SCHOOL_STAGE_STORAGE_KEY);
    return isSchoolStage(stored) ? stored : null;
  } catch {
    return null;
  }
}

export const SCHOOL_STAGE = storedSchoolStage() ?? __SCHOOL_STAGE__;
export const SCHOOL_LEVELS = SCHOOL_STAGE_LEVELS[SCHOOL_STAGE];

export function setSchoolStage(stage: SchoolStage): void {
  try {
    window.localStorage.setItem(SCHOOL_STAGE_STORAGE_KEY, stage);
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${SCHOOL_STAGE_STORAGE_KEY}=${stage}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
  } catch {
    throw new Error("تعذر حفظ اختيار المرحلة على هذا الجهاز.");
  }
}
