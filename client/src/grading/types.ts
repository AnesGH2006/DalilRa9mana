export interface Subject {
  name: string;
  coef: number;
}

export interface GradeValues {
  [subjectName: string]: string;
}

export interface GradeStats {
  avg: string;
  totalPoints: string;
  totalCoef: number;
  passCount: number;
  failCount: number;
}

export type ResultBadgeType = "admis" | "recalage" | "refuse";

export interface ResultBadge {
  cls: ResultBadgeType;
  icon: string;
  text: string;
}

export type LyceeFiliere =
  | "science"
  | "math"
  | "technique"
  | "lettres"
  | "gestion";

export type TrimNiveau = "moyen" | "lycee";
