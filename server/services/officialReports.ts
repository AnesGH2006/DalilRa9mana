import * as XLSX from "xlsx";

export type OfficialReportType =
  | "student_roster"
  | "census"
  | "monthly"
  | "invigilation_plan"
  | "seating_plan";

export interface ReportSheet {
  name: string;
  headers: string[];
  rows: Array<Array<string | number | null>>;
}

export interface OfficialReport {
  type: OfficialReportType;
  title: string;
  generatedAt: string;
  params: Record<string, unknown>;
  sheets: ReportSheet[];
}

export interface ReportStudent {
  id: string;
  raqm?: number | null;
  nomPrenom?: string | null;
  dateNaissance?: string | null;
  niveau?: string | null;
  classe?: string | null;
  filiere?: string | null;
  sexe?: string | null;
  statut?: string | null;
  resultat?: string | null;
}

export interface ReportAttendanceDay {
  studentId: string;
  attendanceDate: string;
  isAbsent: boolean;
  status?: string | null;
}

export interface ReportExamSession {
  id: string;
  title?: string | null;
  kind?: string | null;
  classe?: string | null;
  subject?: string | null;
  examDate: string;
  startTime?: string | null;
  endTime?: string | null;
}

export interface ReportInvigilator {
  sessionId: string;
  name: string;
  role?: string | null;
  subject?: string | null;
}

export interface ReportSeatingAssignment {
  studentId: string;
  hallId?: string | null;
  hallName: string;
  seatNumber: number;
  organizationNumber: string;
  rowNumber?: number | null;
  columnNumber?: number | null;
}

export interface ReportHall {
  id: string;
  name: string;
  capacity: number;
  building?: string | null;
  floor?: string | null;
}

function safeCell(value: string | number | null | undefined): string | number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const text = String(value);
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function sheet(name: string, headers: string[], rows: Array<Array<string | number | null | undefined>>): ReportSheet {
  return {
    name: name.slice(0, 31),
    headers,
    rows: rows.map(row => row.map(safeCell)),
  };
}

function arSexe(value: string | null | undefined): string {
  return value === "M" ? "ذكر" : value === "F" ? "أنثى" : String(value ?? "");
}

function arStatut(value: string | null | undefined): string {
  if (value === "nouveau") return "جديد";
  if (value === "redoublant") return "معيد";
  return String(value ?? "");
}

function arResultat(value: string | null | undefined): string {
  if (value === "admis") return "ناجح";
  if (value === "non_admis") return "راسب";
  if (value === "mustarrak") return "مسترك";
  return String(value ?? "");
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k) ?? [];
    list.push(item);
    map.set(k, list);
  }
  return map;
}

export function buildStudentRosterReport(input: {
  schoolName?: string | null;
  annee: string;
  students: ReportStudent[];
}): OfficialReport {
  const students = [...input.students].sort((a, b) =>
    String(a.classe ?? "").localeCompare(String(b.classe ?? ""), "ar")
    || (Number(a.raqm) || 0) - (Number(b.raqm) || 0)
    || String(a.nomPrenom ?? "").localeCompare(String(b.nomPrenom ?? ""), "ar"),
  );
  return {
    type: "student_roster",
    title: "القائمة الأولية للتلاميذ",
    generatedAt: new Date().toISOString(),
    params: { annee: input.annee, count: students.length },
    sheets: [sheet("القائمة الأولية",
      ["رقم التسجيل", "اللقب والاسم", "تاريخ الميلاد", "الجنس", "القسم", "المستوى", "الشعبة", "الحالة", "النتيجة"],
      students.map(student => [
        student.raqm ?? student.id,
        student.nomPrenom ?? "",
        student.dateNaissance ?? "",
        arSexe(student.sexe),
        student.classe ?? "",
        student.niveau ?? "",
        student.filiere ?? "",
        arStatut(student.statut),
        arResultat(student.resultat),
      ]),
    )],
  };
}

export function buildCensusReport(input: {
  schoolName?: string | null;
  annee: string;
  students: ReportStudent[];
}): OfficialReport {
  const byClass = groupBy(input.students, student => `${student.niveau ?? ""}|${student.classe ?? ""}`);
  const rows = [...byClass.entries()]
    .map(([key, list]) => {
      const [niveau, classe] = key.split("|");
      return {
        niveau,
        classe,
        total: list.length,
        boys: list.filter(s => s.sexe === "M").length,
        girls: list.filter(s => s.sexe === "F").length,
        nouveau: list.filter(s => s.statut === "nouveau").length,
        redoublant: list.filter(s => s.statut === "redoublant").length,
        admis: list.filter(s => s.resultat === "admis").length,
        nonAdmis: list.filter(s => s.resultat === "non_admis").length,
        mustarrak: list.filter(s => s.resultat === "mustarrak").length,
      };
    })
    .sort((a, b) => a.niveau.localeCompare(b.niveau, "ar") || a.classe.localeCompare(b.classe, "ar"));

  const total = rows.reduce((acc, row) => ({
    total: acc.total + row.total,
    boys: acc.boys + row.boys,
    girls: acc.girls + row.girls,
    nouveau: acc.nouveau + row.nouveau,
    redoublant: acc.redoublant + row.redoublant,
  }), { total: 0, boys: 0, girls: 0, nouveau: 0, redoublant: 0 });

  return {
    type: "census",
    title: "إحصائيات تعداد التلاميذ",
    generatedAt: new Date().toISOString(),
    params: { annee: input.annee, classes: rows.length },
    sheets: [
      sheet("التعداد حسب القسم",
        ["المستوى", "القسم", "المجموع", "ذكور", "إناث", "جدد", "معيدون", "ناجحون", "راسبون", "مستركون"],
        [...rows.map(row => [row.niveau, row.classe, row.total, row.boys, row.girls, row.nouveau, row.redoublant, row.admis, row.nonAdmis, row.mustarrak]),
          ["المجموع العام", "", total.total, total.boys, total.girls, total.nouveau, total.redoublant, "", "", ""]],
      ),
      sheet("التعداد حسب المستوى",
        ["المستوى", "المجموع", "ذكور", "إناث", "جدد", "معيدون"],
        [...groupBy(input.students, s => s.niveau ?? "").entries()]
          .map(([niveau, list]) => [
            niveau,
            list.length,
            list.filter(s => s.sexe === "M").length,
            list.filter(s => s.sexe === "F").length,
            list.filter(s => s.statut === "nouveau").length,
            list.filter(s => s.statut === "redoublant").length,
          ])
          .sort((a, b) => String(a[0]).localeCompare(String(b[0]), "ar")),
      ),
    ],
  };
}

export function buildMonthlyReport(input: {
  schoolName?: string | null;
  annee: string;
  month: string;
  students: ReportStudent[];
  attendance: ReportAttendanceDay[];
}): OfficialReport {
  const studentById = new Map(input.students.map(student => [student.id, student]));
  const attendance = input.attendance.filter(day => day.attendanceDate.startsWith(input.month));
  const byClass = groupBy(attendance, day => {
    const student = studentById.get(day.studentId);
    return `${student?.niveau ?? ""}|${student?.classe ?? ""}`;
  });
  const summary = [...byClass.entries()]
    .map(([key, days]) => {
      const [niveau, classe] = key.split("|");
      const absentDays = days.filter(day => day.isAbsent).length;
      return {
        niveau,
        classe,
        records: days.length,
        absentDays,
        rate: days.length ? Math.round((absentDays / days.length) * 1000) / 10 : 0,
      };
    })
    .sort((a, b) => a.niveau.localeCompare(b.niveau, "ar") || a.classe.localeCompare(b.classe, "ar"));

  const absentStudents = attendance
    .filter(day => day.isAbsent)
    .map(day => {
      const student = studentById.get(day.studentId);
      return {
        date: day.attendanceDate,
        name: student?.nomPrenom ?? day.studentId,
        classe: student?.classe ?? "",
        niveau: student?.niveau ?? "",
        status: day.status ?? "",
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name, "ar"))
    .slice(0, 500);

  return {
    type: "monthly",
    title: `التقرير الشهري — ${input.month}`,
    generatedAt: new Date().toISOString(),
    params: { annee: input.annee, month: input.month },
    sheets: [
      sheet("الملخص الشهري",
        ["المستوى", "القسم", "سجلات الحضور", "أيام الغياب", "نسبة الغياب %"],
        summary.map(row => [row.niveau, row.classe, row.records, row.absentDays, row.rate]),
      ),
      sheet("سجل الغيابات",
        ["التاريخ", "اللقب والاسم", "القسم", "المستوى", "الحالة"],
        absentStudents.map(row => [row.date, row.name, row.classe, row.niveau, row.status]),
      ),
    ],
  };
}

export function buildInvigilationReport(input: {
  schoolName?: string | null;
  annee: string;
  sessions: ReportExamSession[];
  invigilators: ReportInvigilator[];
  halls?: ReportHall[];
}): OfficialReport {
  const sessionById = new Map(input.sessions.map(session => [session.id, session]));
  const invigilators = [...input.invigilators].sort((a, b) => {
    const sa = sessionById.get(a.sessionId);
    const sb = sessionById.get(b.sessionId);
    return `${sa?.examDate ?? ""}T${sa?.startTime ?? ""}`.localeCompare(`${sb?.examDate ?? ""}T${sb?.startTime ?? ""}`)
      || String(a.name).localeCompare(String(b.name), "ar");
  });
  return {
    type: "invigilation_plan",
    title: "جدول الحراسة والاختبارات",
    generatedAt: new Date().toISOString(),
    params: { annee: input.annee, sessions: input.sessions.length, invigilators: invigilators.length },
    sheets: [sheet("جدول الحراسة",
      ["الاختبار", "التاريخ", "البداية", "النهاية", "القسم", "المادة", "المراقب", "الدور"],
      invigilators.map(item => {
        const session = sessionById.get(item.sessionId);
        return [
          session?.title ?? item.sessionId,
          session?.examDate ?? "",
          session?.startTime ?? "",
          session?.endTime ?? "",
          session?.classe ?? "",
          session?.subject ?? item.subject ?? "",
          item.name,
          item.role === "chief" ? "رئيس لجنة" : "مراقب",
        ];
      }),
    ), sheet("القاعات",
      ["القاعة", "الطاقة", "العمارة", "الطابق"],
      (input.halls ?? []).map(hall => [hall.name, hall.capacity, hall.building ?? "", hall.floor ?? ""]),
    )],
  };
}

export function buildSeatingReport(input: {
  schoolName?: string | null;
  annee: string;
  session?: ReportExamSession | null;
  students: ReportStudent[];
  halls: ReportHall[];
  assignments: ReportSeatingAssignment[];
}): OfficialReport {
  const studentById = new Map(input.students.map(student => [student.id, student]));
  const hallById = new Map(input.halls.map(hall => [hall.id, hall]));
  const rows = [...input.assignments]
    .sort((a, b) => a.organizationNumber.localeCompare(b.organizationNumber) || a.seatNumber - b.seatNumber)
    .map(item => {
      const student = studentById.get(item.studentId);
      const hall = (item.hallId ? hallById.get(item.hallId) : undefined)
        ?? input.halls.find(h => h.name === item.hallName)
        ?? null;
      return [
        item.organizationNumber,
        item.hallName,
        item.seatNumber,
        item.rowNumber ?? "",
        item.columnNumber ?? "",
        student?.nomPrenom ?? item.studentId,
        student?.classe ?? "",
        student?.niveau ?? "",
        hall?.building ?? "",
        hall?.floor ?? "",
      ];
    });
  return {
    type: "seating_plan",
    title: `قوائم التفويج — ${input.session?.title ?? input.annee}`,
    generatedAt: new Date().toISOString(),
    params: { annee: input.annee, sessionId: input.session?.id ?? null, assignments: rows.length },
    sheets: [sheet("قوائم التفويج",
      ["الرقم التنظيمي", "القاعة", "رقم المقعد", "السطر", "العمود", "اللقب والاسم", "القسم", "المستوى", "العمارة", "الطابق"],
      rows,
    )],
  };
}

export function officialReportToXlsx(report: OfficialReport): Buffer {
  const workbook = XLSX.utils.book_new();
  for (const item of report.sheets) {
    const worksheet = XLSX.utils.aoa_to_sheet([item.headers, ...item.rows]);
    worksheet["!sheetViews"] = [{ rightToLeft: true } as any];
    worksheet["!cols"] = item.headers.map((_, index) => ({ wch: index === 1 ? 34 : 16 }));
    XLSX.utils.book_append_sheet(workbook, worksheet, item.name);
  }
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return Buffer.from(buffer);
}

export function buildOfficialReport(type: OfficialReportType, input: any): OfficialReport {
  switch (type) {
    case "student_roster": return buildStudentRosterReport(input);
    case "census": return buildCensusReport(input);
    case "monthly": return buildMonthlyReport(input);
    case "invigilation_plan": return buildInvigilationReport(input);
    case "seating_plan": return buildSeatingReport(input);
  }
  throw new Error(`Unsupported report type: ${type}`);
}
