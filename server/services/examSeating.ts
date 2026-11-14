export interface SeatingStudent {
  id: string;
  nomPrenom?: string | null;
  raqm?: number | null;
  classe?: string | null;
  niveau?: string | null;
  sexe?: string | null;
}

export interface SeatingHall {
  id: string;
  name: string;
  capacity: number;
  building?: string | null;
  floor?: string | null;
}

export interface SeatingAssignmentPlan {
  studentId: string;
  studentName: string;
  classe: string | null;
  hallId: string;
  hallName: string;
  seatNumber: number;
  organizationNumber: string;
  rowNumber: number;
  columnNumber: number;
}

export interface SeatingPlanResult {
  assignments: SeatingAssignmentPlan[];
  unassigned: Array<{ studentId: string; studentName: string; reason: string }>;
  halls: Array<{ hallId: string; hallName: string; capacity: number; used: number; remaining: number }>;
}

export interface SeatingOptions {
  columnsPerRow?: number;
  organizationPrefix?: string;
  keepClassesTogether?: boolean;
}

function normalizeClass(value: string | null | undefined): string {
  return String(value ?? "").trim() || "بدون قسم";
}

function studentSortKey(student: SeatingStudent): string {
  const raqm = Number(student.raqm);
  const numeric = Number.isFinite(raqm) && raqm > 0 ? String(raqm).padStart(10, "0") : "";
  return `${normalizeClass(student.classe)}|${numeric}|${String(student.nomPrenom ?? "").trim()}`;
}

function layoutForSeat(seatNumber: number, columnsPerRow: number): { rowNumber: number; columnNumber: number } {
  const safeColumns = Math.max(1, columnsPerRow);
  return {
    rowNumber: Math.floor((seatNumber - 1) / safeColumns) + 1,
    columnNumber: ((seatNumber - 1) % safeColumns) + 1,
  };
}

export function assignExamSeating(input: {
  sessionId: string;
  annee?: string | null;
  students: SeatingStudent[];
  halls: SeatingHall[];
  options?: SeatingOptions;
}): SeatingPlanResult {
  const options = input.options ?? {};
  const columnsPerRow = Math.max(1, options.columnsPerRow ?? 8);
  const keepClassesTogether = options.keepClassesTogether !== false;
  const prefix = (options.organizationPrefix ?? input.sessionId.slice(0, 8)).toUpperCase();

  const halls = input.halls
    .map(hall => ({ ...hall, capacity: Math.max(0, Number(hall.capacity) || 0) }))
    .filter(hall => hall.capacity > 0)
    .sort((a, b) => a.name.localeCompare(b.name, "ar") || a.id.localeCompare(b.id));
  const remaining = new Map(halls.map(hall => [hall.id, hall.capacity]));
  const usedByClassInHall = new Map<string, number>();

  const students = [...input.students].sort((a, b) => studentSortKey(a).localeCompare(studentSortKey(b), "ar"));
  const byClass = new Map<string, SeatingStudent[]>();
  for (const student of students) {
    const key = normalizeClass(student.classe);
    const list = byClass.get(key) ?? [];
    list.push(student);
    byClass.set(key, list);
  }
  const classes = [...byClass.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], "ar"));

  const pending: SeatingStudent[] = [];
  const assignments: SeatingAssignmentPlan[] = [];

  const pickHall = (classe: string): SeatingHall | null => {
    const candidates = halls
      .map(hall => ({
        hall,
        remaining: remaining.get(hall.id) ?? 0,
        classSeats: usedByClassInHall.get(`${hall.id}:${classe}`) ?? 0,
      }))
      .filter(item => item.remaining > 0)
      .sort((a, b) => {
        if (keepClassesTogether) {
          const aUsed = a.classSeats > 0 ? 0 : 1;
          const bUsed = b.classSeats > 0 ? 0 : 1;
          if (aUsed !== bUsed) return aUsed - bUsed;
        }
        return b.remaining - a.remaining || a.hall.name.localeCompare(b.hall.name, "ar");
      });
    return candidates[0]?.hall ?? null;
  };

  for (const [classe, classStudents] of classes) {
    let queue = [...classStudents];
    while (queue.length > 0) {
      const hall = pickHall(classe);
      if (!hall) {
        pending.push(...queue);
        queue = [];
        break;
      }
      const space = remaining.get(hall.id) ?? 0;
      const chunk = queue.slice(0, space);
      const startSeat = hall.capacity - space + 1;
      chunk.forEach((student, index) => {
        const seatNumber = startSeat + index;
        const layout = layoutForSeat(seatNumber, columnsPerRow);
        assignments.push({
          studentId: student.id,
          studentName: student.nomPrenom ?? "",
          classe: student.classe ?? null,
          hallId: hall.id,
          hallName: hall.name,
          seatNumber,
          organizationNumber: `${prefix}-${String(assignments.length + 1).padStart(4, "0")}`,
          rowNumber: layout.rowNumber,
          columnNumber: layout.columnNumber,
        });
      });
      remaining.set(hall.id, space - chunk.length);
      usedByClassInHall.set(`${hall.id}:${classe}`, (usedByClassInHall.get(`${hall.id}:${classe}`) ?? 0) + chunk.length);
      queue = queue.slice(chunk.length);
    }
  }

  assignments.sort((a, b) => a.hallName.localeCompare(b.hallName, "ar") || a.seatNumber - b.seatNumber || a.organizationNumber.localeCompare(b.organizationNumber));

  return {
    assignments,
    unassigned: pending.map(student => ({
      studentId: student.id,
      studentName: student.nomPrenom ?? "",
      reason: "سعة القاعات غير كافية",
    })),
    halls: halls.map(hall => {
      const used = hall.capacity - (remaining.get(hall.id) ?? 0);
      return { hallId: hall.id, hallName: hall.name, capacity: hall.capacity, used, remaining: remaining.get(hall.id) ?? 0 };
    }),
  };
}
