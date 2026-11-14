export const STAFF_PERMISSIONS = [
  "dashboard",
  "students",
  "results",
  "absences",
  "yearend",
  "orientation",
  "analytics",
  "reports",
  "imports",
  "planning",
  "pedagogy",
] as const;

export type StaffPermission = (typeof STAFF_PERMISSIONS)[number];
export type StaffRole = "teacher" | "supervisor" | "counselor";

export const STAFF_PERMISSION_LABELS: Record<StaffPermission, string> = {
  dashboard: "لوحة التحكم",
  students: "إدارة التلاميذ",
  results: "النتائج والنقاط",
  absences: "الغيابات",
  yearend: "أعمال نهاية السنة",
  orientation: "التوجيه والمجالس",
  analytics: "التحليلات والإحصائيات",
  reports: "التقارير والطباعة",
  imports: "الاستيراد وOCR والأرشيف",
  planning: "الجداول والتخطيط",
  pedagogy: "المركز التربوي",
};

export const DEFAULT_STAFF_PERMISSIONS: Record<StaffRole, StaffPermission[]> = {
  teacher: ["dashboard", "results", "imports", "pedagogy"],
  supervisor: ["dashboard", "students", "absences", "imports", "reports"],
  counselor: ["dashboard", "students", "results", "absences", "imports", "orientation", "reports", "pedagogy"],
};

export function normalizeStaffPermissions(value: unknown, role: StaffRole): StaffPermission[] {
  if (!Array.isArray(value)) return [...DEFAULT_STAFF_PERMISSIONS[role]];
  const permissions = value.filter(
    (item): item is StaffPermission =>
      typeof item === "string" && STAFF_PERMISSIONS.includes(item as StaffPermission),
  );
  return permissions.length > 0 ? [...new Set(permissions)] : [];
}

export function permissionForAppPath(path: string): StaffPermission | undefined {
  if (path === "/") return "dashboard";
  if (path === "/students") return "students";
  if (["/results", "/subjects", "/exam-results", "/repeaters", "/failed", "/bem"].includes(path)) return "results";
  if (path === "/absences") return "absences";
  if (path === "/yearend" || path.startsWith("/yearend/")) return "yearend";
  if (["/orientation-results", "/transfer-results", "/councils", "/orientation"].includes(path)
    || path.startsWith("/preorient/")) return "orientation";
  if (path === "/analytics") return "analytics";
  if (path === "/reports") return "reports";
  if (["/import", "/excel-injection", "/upload-grades-ocr", "/archive"].includes(path)) return "imports";
  if (["/class-balancer", "/timetable"].includes(path)) return "planning";
  if (["/pedagogy-center", "/pedagogy"].includes(path)) return "pedagogy";
  return undefined;
}

export function appPathForPermission(permission: StaffPermission): string {
  const paths: Record<StaffPermission, string> = {
    dashboard: "/",
    students: "/students",
    results: "/results",
    absences: "/absences",
    yearend: "/yearend",
    orientation: "/orientation-results",
    analytics: "/analytics",
    reports: "/reports",
    imports: "/import",
    planning: "/timetable",
    pedagogy: "/pedagogy-center",
  };
  return paths[permission];
}
