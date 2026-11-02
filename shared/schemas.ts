import * as zod from "zod";
import { STAFF_PERMISSIONS } from "./member-permissions.js";

export const HealthCheckResponse = zod.object({ status: zod.string() });

const MemberContextSchema = zod.object({
  memberId: zod.string(),
  schoolUserId: zod.string(),
  role: zod.enum(["teacher", "parent", "supervisor", "counselor"]),
  permissions: zod.array(zod.enum(STAFF_PERMISSIONS)).default([]),
  assignedClasses: zod.array(zod.string()),
  linkedStudentId: zod.string().nullable(),
  name: zod.string(),
  schoolSubscriptionPlan: zod.enum(["free", "basic", "pro"]).optional(),
  schoolSubscriptionStatus: zod.enum(["pending", "active", "suspended"]).optional(),
});

export const GetCurrentAuthUserResponse = zod.object({
  user: zod.union([
    zod.object({
      id: zod.string(),
      email: zod.string().email().nullable(),
      firstName: zod.string().nullable(),
      lastName: zod.string().nullable(),
      profileImageUrl: zod.string().nullable(),
      role: zod.enum(["user", "admin"]),
      subscriptionStatus: zod.enum(["pending", "active", "suspended"]),
      subscriptionPlan: zod.enum(["free", "basic", "pro", "staff", "parent"]).optional(),
      subscriptionExpiresAt: zod.string().nullable().optional(),
      memberContext: MemberContextSchema.nullable().optional(),
    }),
    zod.null(),
  ]),
});

export const ExchangeMobileAuthorizationCodeBody = zod.object({
  code: zod.string().min(1),
  code_verifier: zod.string().min(1),
  redirect_uri: zod.string().url().min(1),
  state: zod.string().min(1),
  nonce: zod.string().min(1).optional(),
});

export const ExchangeMobileAuthorizationCodeResponse = zod.object({ token: zod.string() });
export const LogoutMobileSessionResponse = zod.object({ success: zod.boolean() });

export const SchoolInfoSchema = zod.object({
  id: zod.string(),
  userId: zod.string(),
  nom: zod.string(),
  wilaya: zod.string(),
  commune: zod.string(),
  annee: zod.string(),
  directeur: zod.string().nullable().optional(),
  phone: zod.string().nullable().optional(),
  smsGatewayUrl: zod.string().nullable().optional(),
  smsGatewayApiKey: zod.string().nullable().optional(),
});

export const UpsertSchoolInfoBody = zod.object({
  nom: zod.string().min(1),
  wilaya: zod.string().min(1),
  commune: zod.string().min(1),
  annee: zod.string().min(1),
  directeur: zod.string().optional(),
  phone: zod.string().optional(),
  smsGatewayUrl: zod.string().optional(),
  smsGatewayApiKey: zod.string().optional(),
  supportPhone: zod.string().optional(),
});

export const NiveauEnum = zod.enum(["1AM", "2AM", "3AM", "4AM", "1AS", "2AS", "3AS"]);
export const SexeEnum = zod.enum(["M", "F"]);
export const StatutEnum = zod.enum(["nouveau", "redoublant"]);
export const ResultatEnum = zod.enum(["admis", "non_admis", "mustarrak"]);

export const StudentSchema = zod.object({
  id: zod.string(),
  userId: zod.string(),
  nomPrenom: zod.string(),
  dateNaissance: zod.string().nullable(),
  parentPhone: zod.string().nullable(),
  niveau: NiveauEnum,
  classe: zod.string(),
  sexe: SexeEnum,
  statut: StatutEnum,
  resultat: ResultatEnum.nullable(),
  annee: zod.string(),
});

export const ListStudentsResponse = zod.object({
  students: zod.array(StudentSchema),
  total: zod.number(),
});

export const ImportStudentsResponse = zod.object({
  imported: zod.number(),
  skipped: zod.number(),
  errors: zod.array(zod.string()),
});

export const LevelStatsSchema = zod.object({
  niveau: NiveauEnum,
  total: zod.number(),
  boys: zod.number(),
  girls: zod.number(),
  admis: zod.number(),
  nonAdmis: zod.number(),
  mustarrak: zod.number().default(0),
  nouveau: zod.number(),
  redoublant: zod.number(),
  averageGrade: zod.number().nullable(),
  justifiedHours: zod.number(),
  unjustifiedHours: zod.number(),
  avgAge: zod.number().nullable(),
  minAge: zod.number().nullable(),
  maxAge: zod.number().nullable(),
  ageDist: zod.array(zod.object({ age: zod.number(), count: zod.number() })),
});

export const DashboardStatsResponse = zod.object({
  total: zod.number(),
  boys: zod.number(),
  girls: zod.number(),
  admis: zod.number(),
  nonAdmis: zod.number(),
  mustarrak: zod.number().default(0),
  nouveau: zod.number(),
  redoublant: zod.number(),
  gradeCount: zod.number(),
  averageGrade: zod.number().nullable(),
  gradesBySubject: zod.array(zod.object({
    subject: zod.string(),
    average: zod.number(),
    count: zod.number(),
    passed: zod.number(),
  })),
  justifiedHours: zod.number(),
  unjustifiedHours: zod.number(),
  byLevel: zod.array(LevelStatsSchema),
});

export const GradeSchema = zod.object({
  id: zod.string(),
  studentId: zod.string(),
  annee: zod.string(),
  trimestre: zod.number().int().min(1).max(3),
  subject: zod.string(),
  gradeType: zod.enum(["general", "continuous", "test", "exam"]).default("general"),
  score: zod.number().min(0).max(20),
});

export const UpsertGradeBody = zod.object({
  studentId: zod.string(),
  annee: zod.string(),
  trimestre: zod.number().int().min(1).max(3),
  subject: zod.string(),
  gradeType: zod.enum(["general", "continuous", "test", "exam"]).optional().default("general"),
  score: zod.number().min(0).max(20),
});

export const UpsertGradesBulkBody = zod.object({
  studentId: zod.string(),
  annee: zod.string(),
  trimestre: zod.number().int().min(1).max(3),
  grades: zod.record(zod.string(), zod.number().min(0).max(20)),
});

export const AbsenceSchema = zod.object({
  id: zod.string(),
  studentId: zod.string(),
  annee: zod.string(),
  trimestre: zod.number(),
  justifiedHours: zod.number(),
  unjustifiedHours: zod.number(),
});

export const UpsertAbsenceBody = zod.object({
  studentId: zod.string(),
  annee: zod.string(),
  trimestre: zod.number().int().min(1).max(3),
  justifiedHours: zod.number().int().min(0),
  unjustifiedHours: zod.number().int().min(0),
});

export const AssistantChatBody = zod.object({
  messages: zod.array(zod.object({
    role: zod.enum(["user", "assistant"]),
    content: zod.string().min(1).max(4000),
  })).min(1).max(30),
});

export const AssistantChatResponse = zod.object({ reply: zod.string() });

export const ImportOrientationWishesResponse = zod.object({
  success: zod.boolean(),
  imported: zod.number(),
  matched: zod.number(),
  unmatched: zod.array(zod.string()),
});

// Legacy (kept for compat)
export const UploadGradesResponse = zod.object({
  students: zod.array(zod.object({
    name: zod.string(),
    subjects: zod.record(zod.number()),
    average: zod.number(),
    passed: zod.boolean(),
    rank: zod.number(),
  })),
  summary: zod.object({
    classAverage: zod.number(),
    highestAverage: zod.number(),
    lowestAverage: zod.number(),
    passRate: zod.number(),
    passCount: zod.number(),
    failCount: zod.number(),
    topStudent: zod.string(),
    weakestStudent: zod.string(),
  }),
  fileName: zod.string(),
  totalStudents: zod.number(),
  schoolMode: zod.string(),
  subjects: zod.array(zod.string()),
});
