import type { SchoolLevel } from "./school-stage.js";
import type { StaffPermission } from "./member-permissions.js";
export type { SchoolLevel, SchoolStage } from "./school-stage.js";

export type SubscriptionStatus = "pending" | "active" | "suspended";
export type SchoolSubscriptionPlan = "free" | "basic" | "pro";
export type SubscriptionPlan = SchoolSubscriptionPlan | "staff" | "parent";
export type UserRole = "user" | "admin";
export type MemberRole = "teacher" | "parent" | "supervisor" | "counselor";

export interface MemberContext {
  memberId: string;
  schoolUserId: string;
  role: MemberRole;
  permissions: StaffPermission[];
  /** Teachers: classes they may enter grades for. Parents: empty. */
  assignedClasses: string[];
  /** Parents: the student they can view. Teachers: null. */
  linkedStudentId: string | null;
  name: string;
  schoolSubscriptionPlan?: SchoolSubscriptionPlan;
  schoolSubscriptionStatus?: SubscriptionStatus;
}

export interface AuthUser {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  role: UserRole;
  subscriptionStatus: SubscriptionStatus;
  subscriptionPlan?: SubscriptionPlan;
  subscriptionExpiresAt?: string | null;
  /** Present when this user is a teacher or parent sub-account */
  memberContext?: MemberContext | null;
}

export interface SchoolInfo {
  id: string;
  userId: string;
  nom: string;
  wilaya: string;
  commune: string;
  stage?: "moyen" | "lycee";
  annee: string;
  directeur?: string | null;
  phone?: string | null;
  supportPhone?: string | null;
  smsGatewayUrl?: string | null;
  smsGatewayApiKey?: string | null;
}

export type Niveau = SchoolLevel;
export type Sexe = "M" | "F";
export type Statut = "nouveau" | "redoublant";
export type Resultat = "admis" | "non_admis" | null;

export interface Student {
  id: string;
  userId: string;
  nomPrenom: string;
  dateNaissance: string | null;
  parentPhone: string | null;
  niveau: Niveau;
  classe: string;
  sexe: Sexe;
  statut: Statut;
  resultat: Resultat;
  annee: string;
}

export interface LevelStats {
  niveau: Niveau;
  total: number;
  boys: number;
  girls: number;
  admis: number;
  nonAdmis: number;
  mustarrak: number;
  nouveau: number;
  redoublant: number;
  averageGrade: number | null;
  justifiedHours: number;
  unjustifiedHours: number;
  avgAge: number | null;
  minAge: number | null;
  maxAge: number | null;
  ageDist: { age: number; count: number }[];
}

export interface DashboardStats {
  total: number;
  boys: number;
  girls: number;
  admis: number;
  nonAdmis: number;
  mustarrak: number;
  nouveau: number;
  redoublant: number;
  gradeCount: number;
  averageGrade: number | null;
  gradesBySubject: { subject: string; average: number; count: number; passed: number }[];
  justifiedHours: number;
  unjustifiedHours: number;
  byLevel: LevelStats[];
}

export interface StudentsFilter {
  annee?: string;
  niveau?: Niveau;
  classe?: string;
  sexe?: Sexe;
  statut?: Statut;
  q?: string;
}

export interface Grade {
  id: string;
  studentId: string;
  annee: string;
  trimestre: number;
  subject: string;
  gradeType?: "general" | "continuous" | "test" | "exam";
  score: number;
}

export interface Absence {
  id: string;
  studentId: string;
  annee: string;
  trimestre: number;
  justifiedHours: number;
  unjustifiedHours: number;
}

export interface StudentResult {
  student: Student;
  scores: Record<string, Record<string, number>>;
  t1Avg: number | null;
  t2Avg: number | null;
  t3Avg: number | null;
  annualAvg: number | null;
  bemAvg: number | null;
  finalAvg: number | null;
  finalPassed: boolean | null;
  passed: boolean | null;
  rank: number | null;
  totalJustified: number;
  totalUnjustified: number;
}

export interface SubjectDef {
  key: string;
  arLabel: string;
  coef: number;
  levels?: Niveau[];
}

export interface OrientationWish {
  id: string;
  annee: string;
  nationalId: string | null;
  lastName: string;
  firstName: string;
  birthDate: string | null;
  choices: string[];
  studentId: string | null;
  matchedStudent: Student | null;
  annualAvg: number | null;
  suggestedTrack: string | null;
  firstChoiceMatchesSuggestion: boolean | null;
}

export interface GenderStats {
  avg: number;
  passCount: number;
  total: number;
}

export interface SubjectAverage {
  subject: string;
  arLabel: string;
  avg: number;
  min: number;
  max: number;
  passCount: number;
  failCount: number;
  total: number;
  failRate: number;
  boys: GenderStats;
  girls: GenderStats;
  improvement: number | null; // T3 avg − T1 avg
}
