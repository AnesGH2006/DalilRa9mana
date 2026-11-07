import { sql } from "drizzle-orm";
import { index, uniqueIndex, jsonb, pgTable, timestamp, varchar, pgEnum, boolean, integer, numeric, doublePrecision, text } from "drizzle-orm/pg-core";
import { CURRENT_ACADEMIC_YEAR } from "./academic-year.js";

export const sessionsTable = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

export const subscriptionStatusEnum = pgEnum("subscription_status", ["pending", "active", "suspended"]);
export const roleEnum = pgEnum("user_role", ["user", "admin"]);

export const usersTable = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  role: roleEnum("role").notNull().default("user"),
  subscriptionStatus: subscriptionStatusEnum("subscription_status").notNull().default("pending"),
  subscriptionPlan: varchar("subscription_plan", { length: 20 }).notNull().default("free"),
  subscriptionExpiresAt: timestamp("subscription_expires_at", { withTimezone: true }),
  trialStartedAt: timestamp("trial_started_at", { withTimezone: true }),
    groqApiKey: varchar("groq_api_key", { length: 500 }),
  geminiApiKey: varchar("gemini_api_key", { length: 500 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type UpsertUser = typeof usersTable.$inferInsert;
export type User = typeof usersTable.$inferSelect;

export const schoolInfoTable = pgTable("school_info", {
  id: varchar("id", { length: 64 }).primaryKey(),
  userId: varchar("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  nom: varchar("nom", { length: 255 }).notNull().default(""),
  wilaya: varchar("wilaya", { length: 100 }).notNull().default(""),
  commune: varchar("commune", { length: 100 }).notNull().default(""),
  stage: varchar("stage", { length: 10 }).notNull().default("moyen"),
  annee: varchar("annee", { length: 20 }).notNull().default(CURRENT_ACADEMIC_YEAR),
  directeur: varchar("directeur", { length: 255 }).default(""),
  phone: varchar("phone", { length: 30 }).default(""),
  smsGatewayUrl: varchar("sms_gateway_url", { length: 500 }).default(""),
  smsGatewayApiKey: varchar("sms_gateway_api_key", { length: 500 }).default(""),
  /** Short join code shared with parents for self-registration (e.g. "A3X7K9") */
  joinCode: varchar("join_code", { length: 10 }).unique(),
  /** WhatsApp support number (international format without +, e.g. 213XXXXXXXXX) */
  supportPhone: varchar("support_phone", { length: 30 }).default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type SchoolInfo = typeof schoolInfoTable.$inferSelect;
export type InsertSchoolInfo = typeof schoolInfoTable.$inferInsert;

export const planTypeEnum = pgEnum("plan_type", ["TRIMESTER", "ANNUAL"]);
export const licenseStatusEnum = pgEnum("license_status", ["ACTIVE", "EXPIRED", "REVOKED"]);

export const schoolLicensesTable = pgTable("school_licenses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  schoolId: varchar("school_id").notNull().unique(),
  licenseKey: text("license_key").notNull(),
  planType: planTypeEnum("plan_type").notNull(),
  maxStudents: integer("max_students").notNull().default(500),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  status: licenseStatusEnum("status").notNull().default("ACTIVE"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type SchoolLicense = typeof schoolLicensesTable.$inferSelect;
export type InsertSchoolLicense = typeof schoolLicensesTable.$inferInsert;

export const paymentTransactionsTable = pgTable("payment_transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  schoolId: varchar("school_id").notNull(),
  chargilyId: varchar("chargily_id").notNull().unique(),
  amount: doublePrecision("amount").notNull(),
  currency: varchar("currency").notNull().default("dzd"),
  paymentMethod: varchar("payment_method").notNull(),
  status: varchar("status").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PaymentTransaction = typeof paymentTransactionsTable.$inferSelect;
export type InsertPaymentTransaction = typeof paymentTransactionsTable.$inferInsert;

export const niveauEnum = pgEnum("niveau", ["1AM", "2AM", "3AM", "4AM", "1AS", "2AS", "3AS"]);
export const sexeEnum = pgEnum("sexe", ["M", "F"]);
export const statutEnum = pgEnum("statut_eleve", ["nouveau", "redoublant"]);
export const resultatEnum = pgEnum("resultat_eleve", ["admis", "non_admis", "mustarrak"]);

export const studentsTable = pgTable("students", {
  id: varchar("id", { length: 64 }).primaryKey(),
  userId: varchar("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  nomPrenom: varchar("nom_prenom", { length: 255 }).notNull(),
  dateNaissance: varchar("date_naissance", { length: 30 }),
  niveau: niveauEnum("niveau").notNull(),
  classe: varchar("classe", { length: 10 }).notNull(),
  filiere: varchar("filiere", { length: 30 }),
  sexe: sexeEnum("sexe").notNull(),
  statut: statutEnum("statut").notNull().default("nouveau"),
  resultat: resultatEnum("resultat"),
  annee: varchar("annee", { length: 20 }).notNull().default(CURRENT_ACADEMIC_YEAR),
  raqm: integer("raqm"),
  parentPhone: varchar("parent_phone", { length: 30 }),
  /** Hashed token embedded in printable student QR cards */
  qrToken: varchar("qr_token", { length: 64 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Student = typeof studentsTable.$inferSelect;
export type InsertStudent = typeof studentsTable.$inferInsert;

export const gradesTable = pgTable("grades", {
  id: varchar("id", { length: 64 }).primaryKey(),
  userId: varchar("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  studentId: varchar("student_id", { length: 64 }).notNull().references(() => studentsTable.id, { onDelete: "cascade" }),
  annee: varchar("annee", { length: 20 }).notNull().default(CURRENT_ACADEMIC_YEAR),
  trimestre: integer("trimestre").notNull(),
  subject: varchar("subject", { length: 50 }).notNull(),
  gradeType: varchar("grade_type", { length: 20 }).notNull().default("general"),
  score: numeric("score", { precision: 5, scale: 2 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Grade = typeof gradesTable.$inferSelect;
export type InsertGrade = typeof gradesTable.$inferInsert;

export const absencesTable = pgTable("absences", {
  id: varchar("id", { length: 64 }).primaryKey(),
  userId: varchar("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  studentId: varchar("student_id", { length: 64 }).notNull().references(() => studentsTable.id, { onDelete: "cascade" }),
  annee: varchar("annee", { length: 20 }).notNull().default(CURRENT_ACADEMIC_YEAR),
  trimestre: integer("trimestre").notNull(),
  justifiedHours: integer("justified_hours").notNull().default(0),
  unjustifiedHours: integer("unjustified_hours").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Absence = typeof absencesTable.$inferSelect;
export type InsertAbsence = typeof absencesTable.$inferInsert;

export const studentDailyAttendanceTable = pgTable("student_daily_attendance", {
  id: varchar("id", { length: 64 }).primaryKey(),
  userId: varchar("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  studentId: varchar("student_id", { length: 64 }).notNull().references(() => studentsTable.id, { onDelete: "cascade" }),
  attendanceDate: varchar("attendance_date", { length: 10 }).notNull(),
  annee: varchar("annee", { length: 20 }).notNull().default(CURRENT_ACADEMIC_YEAR),
  status: varchar("status", { length: 100 }).notNull(),
  isAbsent: boolean("is_absent").notNull(),
  parentAbsenceReason: varchar("parent_absence_reason", { length: 500 }),
  parentAbsenceReasonAt: timestamp("parent_absence_reason_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("UQ_student_daily_attendance_user_student_date").on(table.userId, table.studentId, table.attendanceDate),
  index("IDX_student_daily_attendance_user_date").on(table.userId, table.attendanceDate),
]);

export type StudentDailyAttendance = typeof studentDailyAttendanceTable.$inferSelect;
export type InsertStudentDailyAttendance = typeof studentDailyAttendanceTable.$inferInsert;

export const bemSessionsTable = pgTable("bem_sessions", {
  id: varchar("id", { length: 64 }).primaryKey(),
  userId: varchar("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  fileName: varchar("file_name", { length: 255 }).notNull(),
  label: varchar("label", { length: 255 }),
  data: jsonb("data").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type BemSession = typeof bemSessionsTable.$inferSelect;
export type InsertBemSession = typeof bemSessionsTable.$inferInsert;

export const dailyAbsenceReportsTable = pgTable("daily_absence_reports", {
  id: varchar("id", { length: 64 }).primaryKey(),
  userId: varchar("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  reportDate: varchar("report_date", { length: 20 }).notNull(),
  studentsTotal: integer("students_total").notNull().default(0),
  studentsAbsent: integer("students_absent").notNull().default(0),
  teachersTotal: integer("teachers_total").notNull().default(0),
  teachersAbsent: integer("teachers_absent").notNull().default(0),
  adminTotal: integer("admin_total").notNull().default(0),
  adminAbsent: integer("admin_absent").notNull().default(0),
  workersTotal: integer("workers_total").notNull().default(0),
  workersAbsent: integer("workers_absent").notNull().default(0),
  cafeteriaSuspended: boolean("cafeteria_suspended"),
  fileName: varchar("file_name", { length: 255 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type DailyAbsenceReport = typeof dailyAbsenceReportsTable.$inferSelect;
export type InsertDailyAbsenceReport = typeof dailyAbsenceReportsTable.$inferInsert;

export const orientationWishesTable = pgTable("orientation_wishes", {
  id: varchar("id", { length: 64 }).primaryKey(),
  userId: varchar("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  annee: varchar("annee", { length: 20 }).notNull().default(CURRENT_ACADEMIC_YEAR),
  nationalId: varchar("national_id", { length: 40 }),
  lastName: varchar("last_name", { length: 255 }).notNull(),
  firstName: varchar("first_name", { length: 255 }).notNull(),
  birthDate: varchar("birth_date", { length: 30 }),
  choices: jsonb("choices").notNull().$type<string[]>(),
  studentId: varchar("student_id", { length: 64 }).references(() => studentsTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type OrientationWish = typeof orientationWishesTable.$inferSelect;
export type InsertOrientationWish = typeof orientationWishesTable.$inferInsert;

export const orientationPlansTable = pgTable("orientation_plans", {
  id: varchar("id", { length: 64 }).primaryKey(),
  userId: varchar("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  annee: varchar("annee", { length: 20 }).notNull(),
  destinations: jsonb("destinations").notNull().$type<Array<{
    name: string;
    schoolUserId: string;
    scienceSeats: number;
    artsSeats: number;
  }>>(),
  status: varchar("status", { length: 20 }).notNull().default("draft"),
  assignments: jsonb("assignments").notNull().$type<Array<{
    studentId: string;
    studentName: string;
    classe: string;
    annualAvg: number | null;
    stream: "science" | "arts";
    destinationName: string;
    destinationUserId: string;
  }>>().default([]),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex("orientation_plans_user_year_unique").on(table.userId, table.annee),
]);

export type OrientationPlan = typeof orientationPlansTable.$inferSelect;

export const feederSchoolsTable = pgTable("feeder_schools", {
  id: varchar("id", { length: 64 }).primaryKey(),
  middleSchoolUserId: varchar("middle_school_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  highSchoolUserId: varchar("high_school_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  annee: varchar("annee", { length: 20 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("feeder_schools_middle_high_year_unique").on(table.middleSchoolUserId, table.highSchoolUserId, table.annee),
  index("feeder_schools_high_school_idx").on(table.highSchoolUserId),
]);

export const orientationTransfersTable = pgTable("orientation_transfers", {
  id: varchar("id", { length: 64 }).primaryKey(),
  planId: varchar("plan_id", { length: 64 }).notNull().references(() => orientationPlansTable.id, { onDelete: "cascade" }),
  sourceUserId: varchar("source_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  destinationUserId: varchar("destination_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  sourceStudentId: varchar("source_student_id", { length: 64 }).notNull(),
  destinationStudentId: varchar("destination_student_id", { length: 64 }).notNull().references(() => studentsTable.id, { onDelete: "cascade" }),
  annee: varchar("annee", { length: 20 }).notNull(),
  studentName: varchar("student_name", { length: 255 }).notNull(),
  annualAvg: numeric("annual_avg", { precision: 5, scale: 2 }),
  stream: varchar("stream", { length: 20 }).notNull(),
  destinationName: varchar("destination_name", { length: 255 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("orientation_transfers_plan_student_unique").on(table.planId, table.sourceStudentId),
  index("orientation_transfers_destination_year_idx").on(table.destinationUserId, table.annee),
]);

// ─── Desktop Agent ─────────────────────────────────────────────────────────────
export const agentActionEnum = pgEnum("agent_action", [
  "upload_excel", "print_report", "open_folder", "open_file",
  "open_app", "backup_reports", "sync_data", "monitor_folder",
  "connect", "disconnect",
]);

export const agentTokensTable = pgTable("agent_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  token: varchar("token", { length: 128 }).notNull().unique(),
  deviceName: varchar("device_name", { length: 255 }),
  allowedFolders: jsonb("allowed_folders").$type<string[]>().default([]),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
});

export type AgentToken = typeof agentTokensTable.$inferSelect;
export type InsertAgentToken = typeof agentTokensTable.$inferInsert;

export const agentLogsTable = pgTable("agent_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agentTokenId: varchar("agent_token_id").notNull().references(() => agentTokensTable.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  action: agentActionEnum("action").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("success"),
  details: jsonb("details"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AgentLog = typeof agentLogsTable.$inferSelect;
export type InsertAgentLog = typeof agentLogsTable.$inferInsert;

// ─── Executive Assistant — Reminders & Notifications ──────────────────────────
export const reminderPriorityEnum = pgEnum("reminder_priority", ["low", "medium", "high"]);
export const reminderStatusEnum   = pgEnum("reminder_status",   ["pending", "completed", "dismissed"]);

export const remindersTable = pgTable("reminders", {
  id:          varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId:      varchar("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  title:       varchar("title",       { length: 500  }).notNull(),
  description: varchar("description", { length: 2000 }),
  dueDate:     timestamp("due_date",  { withTimezone: true }),
  priority:    reminderPriorityEnum("priority").notNull().default("medium"),
  status:      reminderStatusEnum("status").notNull().default("pending"),
  category:    varchar("category",    { length: 100  }),
  metadata:    jsonb("metadata"),
  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type Reminder       = typeof remindersTable.$inferSelect;
export type InsertReminder = typeof remindersTable.$inferInsert;

export const notificationsTable = pgTable("notifications", {
  id:        varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId:    varchar("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  title:     varchar("title", { length: 500  }).notNull(),
  body:      varchar("body",  { length: 2000 }),
  type:      varchar("type",  { length: 50   }).notNull().default("info"),
  read:      boolean("read").notNull().default(false),
  metadata:  jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Notification       = typeof notificationsTable.$inferSelect;
export type InsertNotification = typeof notificationsTable.$inferInsert;

// ─── Web Push subscriptions ──────────────────────────────────────────────────
export const pushSubscriptionsTable = pgTable("push_subscriptions", {
  id:        varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId:    varchar("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  endpoint:  varchar("endpoint", { length: 2000 }).notNull().unique(),
  p256dh:   varchar("p256dh", { length: 255 }).notNull(),
  auth:     varchar("auth", { length: 255 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type PushSubscription = typeof pushSubscriptionsTable.$inferSelect;
export type InsertPushSubscription = typeof pushSubscriptionsTable.$inferInsert;

// ─── SMS Dispatch Log ──────────────────────────────────────────────────────────
export const smsStatusEnum = pgEnum("sms_status", ["sent", "failed", "queued", "no_phone"]);
export const smsChannelEnum = pgEnum("sms_channel", ["twilio", "gateway", "modem", "socket", "none"]);

export const smsLogsTable = pgTable("sms_logs", {
  id:          varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  /** School owner user id (tenant scope) */
  userId:      varchar("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  studentId:   varchar("student_id", { length: 64 }).references(() => studentsTable.id, { onDelete: "set null" }),
  /** SMS recipient phone number */
  phone:       varchar("phone",   { length: 30 }),
  recipient:   varchar("recipient", { length: 30 }),
  message:     varchar("message", { length: 1000 }).notNull(),
  status:      smsStatusEnum("status").notNull().default("queued"),
  channel:     smsChannelEnum("channel"),
  gatewayRef:  varchar("gateway_ref", { length: 255 }),
  errorMsg:    varchar("error_msg",   { length: 500 }),
  sentAt:      timestamp("sent_at", { withTimezone: true }),
  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SmsLog       = typeof smsLogsTable.$inferSelect;
export type InsertSmsLog = typeof smsLogsTable.$inferInsert;

// ─── School SMS Subscription / Credits ───────────────────────────────────────
export const schoolSubscriptionsTable = pgTable("school_subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  /** School owner user id */
  schoolId: varchar("school_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }).unique(),
  smsCreditsRemaining: integer("sms_credits_remaining").notNull().default(100),
  subscriptionStatus: subscriptionStatusEnum("subscription_status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type SchoolSubscription       = typeof schoolSubscriptionsTable.$inferSelect;
export type InsertSchoolSubscription = typeof schoolSubscriptionsTable.$inferInsert;

// ─── QR Attendance Logs ────────────────────────────────────────────────────────
export const attendanceLogsTable = pgTable("attendance_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  studentId: varchar("student_id", { length: 64 }).notNull().references(() => studentsTable.id, { onDelete: "cascade" }),
  scannedAt: timestamp("scanned_at", { withTimezone: true }).notNull().defaultNow(),
  source: varchar("source", { length: 20 }).notNull().default("qr"),
  sig: varchar("sig", { length: 32 }),
});

export type AttendanceLog       = typeof attendanceLogsTable.$inferSelect;
export type InsertAttendanceLog = typeof attendanceLogsTable.$inferInsert;

// ─── OCR Upload Audit ──────────────────────────────────────────────────────────
export const ocrUploadsTable = pgTable("ocr_uploads", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 20 }).notNull(),
  engine: varchar("engine", { length: 20 }).notNull(),
  fileName: varchar("file_name", { length: 255 }),
  rows: jsonb("rows"),
  rowCount: integer("row_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type OcrUpload       = typeof ocrUploadsTable.$inferSelect;
export type InsertOcrUpload = typeof ocrUploadsTable.$inferInsert;

// ─── School Members (RBAC) ────────────────────────────────────────────────────
export const schoolMemberRoleEnum = pgEnum("school_member_role", ["teacher", "parent", "supervisor", "counselor"]);

export const schoolMembersTable = pgTable("school_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  /** The head-admin (owner) of the school — references users.id */
  schoolUserId: varchar("school_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  /** Set when the invited person first logs in via Replit OIDC */
  memberUserId: varchar("member_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  role: schoolMemberRoleEnum("role").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 30 }),
  /** For teachers: list of class names they can enter grades for */
  assignedClasses: jsonb("assigned_classes").$type<string[]>().default([]),
  /** Per-member access grants; null legacy rows fall back to role defaults. */
  permissions: jsonb("permissions").$type<string[]>(),
  /** For parents: the student they are the guardian of */
  linkedStudentId: varchar("linked_student_id", { length: 64 }).references(() => studentsTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SchoolMember       = typeof schoolMembersTable.$inferSelect;
export type InsertSchoolMember = typeof schoolMembersTable.$inferInsert;

// ─── Timetable ────────────────────────────────────────────────────────────────

export const timetableTeachersTable = pgTable("timetable_teachers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  subjects: jsonb("subjects").$type<string[]>().default([]),
  phone: varchar("phone", { length: 30 }),
  color: varchar("color", { length: 20 }).notNull().default("#3b82f6"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type TimetableTeacher       = typeof timetableTeachersTable.$inferSelect;
export type InsertTimetableTeacher = typeof timetableTeachersTable.$inferInsert;

export const timetableRoomsTable = pgTable("timetable_rooms", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 100 }).notNull(),
  /** classroom | lab | sports | library | other */
  type: varchar("type", { length: 30 }).notNull().default("classroom"),
  capacity: integer("capacity"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type TimetableRoom       = typeof timetableRoomsTable.$inferSelect;
export type InsertTimetableRoom = typeof timetableRoomsTable.$inferInsert;

export const timetableSlotsTable = pgTable("timetable_slots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  annee: varchar("annee", { length: 20 }).notNull().default(CURRENT_ACADEMIC_YEAR),
  /** The class this slot belongs to, e.g. "1AM-أ" */
  classe: varchar("classe", { length: 30 }).notNull(),
  subject: varchar("subject", { length: 100 }).notNull(),
  teacherId: varchar("teacher_id").references(() => timetableTeachersTable.id, { onDelete: "set null" }),
  roomId: varchar("room_id").references(() => timetableRoomsTable.id, { onDelete: "set null" }),
  /** 0 = Sunday, 1 = Monday … 4 = Thursday (Algerian school week) */
  day: integer("day").notNull(),
  /** 0-indexed period in the day (0 = first period) */
  period: integer("period").notNull(),
  notes: varchar("notes", { length: 500 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type TimetableSlot       = typeof timetableSlotsTable.$inferSelect;
export type InsertTimetableSlot = typeof timetableSlotsTable.$inferInsert;

// ─── Audit Log ────────────────────────────────────────────────────────────────
// Records every critical action performed by the head-admin or any sub-account member.
export const auditLogsTable = pgTable("audit_logs", {
  id:          varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  /** The head-admin (school owner) whose data was affected */
  userId:      varchar("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  /** Who actually performed the action (could be a member / teacher / etc.) */
  actorId:     varchar("actor_id"),
  actorName:   varchar("actor_name",  { length: 255 }),
  /** Short machine-readable action key, e.g. "grade_edit", "student_import" */
  action:      varchar("action",      { length: 80  }).notNull(),
  /** Human-readable Arabic description */
  description: varchar("description", { length: 500 }),
  /** Affected entity type: "student", "grade", "absence", "member", etc. */
  entity:      varchar("entity",      { length: 60  }),
  entityId:    varchar("entity_id",   { length: 64  }),
  /** Extra structured details (old/new values, counts, etc.) */
  details:     jsonb("details"),
  ipAddress:   varchar("ip_address",  { length: 60  }),
  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AuditLog       = typeof auditLogsTable.$inferSelect;
export type InsertAuditLog = typeof auditLogsTable.$inferInsert;

// ─── Activation codes and payments ──────────────────────────────────────────
export const activationCodeStatusEnum = pgEnum("activation_code_status", ["available", "redeemed", "revoked"]);

export const activationCodesTable = pgTable("activation_codes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  codeHash: varchar("code_hash", { length: 64 }).notNull().unique(),
  codeLast4: varchar("code_last4", { length: 4 }).notNull(),
  batchId: varchar("batch_id", { length: 64 }).notNull(),
  status: activationCodeStatusEnum("status").notNull().default("available"),
  redeemedBy: varchar("redeemed_by").references(() => usersTable.id, { onDelete: "set null" }),
  redeemedAt: timestamp("redeemed_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("UQ_activation_codes_hash").on(table.codeHash),
  index("IDX_activation_codes_batch").on(table.batchId),
  index("IDX_activation_codes_status").on(table.status),
]);

export type ActivationCode = typeof activationCodesTable.$inferSelect;
export type InsertActivationCode = typeof activationCodesTable.$inferInsert;

export const paymentStatusEnum = pgEnum("payment_status", ["pending", "paid", "failed", "refunded"]);
export const paymentProviderEnum = pgEnum("payment_provider", ["chargily", "activation_code"]);

export const paymentsTable = pgTable("payments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  provider: paymentProviderEnum("provider").notNull(),
  providerReference: varchar("provider_reference", { length: 255 }),
  amountDzd: integer("amount_dzd").notNull().default(1000),
  status: paymentStatusEnum("status").notNull().default("pending"),
  checkoutUrl: varchar("checkout_url", { length: 2000 }),
  metadata: jsonb("metadata"),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("IDX_payments_user_created").on(table.userId, table.createdAt),
  uniqueIndex("UQ_payments_provider_reference").on(table.provider, table.providerReference),
  index("IDX_payments_status").on(table.status),
]);

export type Payment = typeof paymentsTable.$inferSelect;
export type InsertPayment = typeof paymentsTable.$inferInsert;
export const studentDocumentsTable = pgTable("student_documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  studentId: varchar("student_id", { length: 64 }).notNull().references(() => studentsTable.id, { onDelete: "cascade" }),
  docType: varchar("doc_type", { length: 40 }).notNull(),
  fields: jsonb("fields").notNull().$type<Record<string, string>>(),
  createdBy: varchar("created_by"),
  createdByName: varchar("created_by_name", { length: 255 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("IDX_student_documents_student").on(table.studentId, table.createdAt)]);

export type StudentDocument = typeof studentDocumentsTable.$inferSelect;