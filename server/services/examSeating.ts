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
  adjacencyViolations: number;
}

export interface SeatingOptions {
  columnsPerRow?: number;
  organizationPrefix?: string;
  keepClassesTogether?: boolean;
  /** Default true: avoid placing students of the same class in adjacent seats when possible. */
  separateSameClass?: boolean;
}

interface SeatSlot {
  hall: SeatingHall;
  seatNumber: number;
  rowNumber: number;
  columnNumber: number;
}

interface Placement {
  student: SeatingStudent;
  classe: string;
  slot: SeatSlot;
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

function buildClassQueues(students: SeatingStudent[]): Map<string, SeatingStudent[]> {
  const byClass = new Map<string, SeatingStudent[]>();
  for (const student of [...students].sort((a, b) => studentSortKey(a).localeCompare(studentSortKey(b), "ar"))) {
    const key = normalizeClass(student.classe);
    const list = byClass.get(key) ?? [];
    list.push(student);
    byClass.set(key, list);
  }
  return byClass;
}

function buildSlots(halls: SeatingHall[], columnsPerRow: number): SeatSlot[] {
  return halls.flatMap(hall =>
    Array.from({ length: hall.capacity }, (_, index) => {
      const seatNumber = index + 1;
      const layout = layoutForSeat(seatNumber, columnsPerRow);
      return { hall, seatNumber, ...layout };
    }),
  );
}

function countAdjacencyViolations(placements: Placement[]): number {
  const byRow = new Map<string, Placement[]>();
  for (const placement of placements) {
    const key = `${placement.slot.hall.id}|${placement.slot.rowNumber}`;
    const list = byRow.get(key) ?? [];
    list.push(placement);
    byRow.set(key, list);
  }
  let violations = 0;
  for (const row of byRow.values()) {
    row.sort((a, b) => a.slot.columnNumber - b.slot.columnNumber);
    for (let i = 1; i < row.length; i++) {
      if (row[i]!.classe === row[i - 1]!.classe && row[i]!.slot.columnNumber === row[i - 1]!.slot.columnNumber + 1) {
        violations++;
      }
    }
  }
  return violations;
}

function finalizePlan(input: {
  placements: Placement[];
  halls: SeatingHall[];
  prefix: string;
  columnsPerRow: number;
  leftoverStudents: SeatingStudent[];
}): SeatingPlanResult {
  const sorted = [...input.placements].sort((a, b) =>
    a.slot.hall.name.localeCompare(b.slot.hall.name, "ar") ||
    a.slot.hall.id.localeCompare(b.slot.hall.id) ||
    a.slot.seatNumber - b.slot.seatNumber,
  );

  const assignments = sorted.map((placement, index) => ({
    studentId: placement.student.id,
    studentName: placement.student.nomPrenom ?? "",
    classe: placement.student.classe ?? null,
    hallId: placement.slot.hall.id,
    hallName: placement.slot.hall.name,
    seatNumber: placement.slot.seatNumber,
    organizationNumber: `${input.prefix}-${String(index + 1).padStart(4, "0")}`,
    rowNumber: placement.slot.rowNumber,
    columnNumber: placement.slot.columnNumber,
  }));

  const usedByHall = new Map<string, number>();
  for (const placement of input.placements) {
    usedByHall.set(placement.slot.hall.id, (usedByHall.get(placement.slot.hall.id) ?? 0) + 1);
  }

  return {
    assignments,
    adjacencyViolations: countAdjacencyViolations(input.placements),
    unassigned: input.leftoverStudents
      .sort((a, b) => studentSortKey(a).localeCompare(studentSortKey(b), "ar"))
      .map(student => ({
        studentId: student.id,
        studentName: student.nomPrenom ?? "",
        reason: "سعة القاعات غير كافية",
      })),
    halls: input.halls.map(hall => {
      const used = usedByHall.get(hall.id) ?? 0;
      return { hallId: hall.id, hallName: hall.name, capacity: hall.capacity, used, remaining: Math.max(0, hall.capacity - used) };
    }),
  };
}

/** Mixed seating: fills seats while avoiding the previous same-class neighbor in each row. */
function assignMixedSeating(input: {
  students: SeatingStudent[];
  halls: SeatingHall[];
  columnsPerRow: number;
  prefix: string;
}): SeatingPlanResult {
  const classQueues = buildClassQueues(input.students);
  const classOrder = [...classQueues.keys()].sort((a, b) =>
    (classQueues.get(b)?.length ?? 0) - (classQueues.get(a)?.length ?? 0) || a.localeCompare(b, "ar"),
  );
  const slots = buildSlots(input.halls, input.columnsPerRow);
  const placements: Placement[] = [];
  const lastClassByRow = new Map<string, string>();
  const leftover: SeatingStudent[] = [];

  for (const slot of slots) {
    const rowKey = `${slot.hall.id}|${slot.rowNumber}`;
    const forbiddenClass = lastClassByRow.get(rowKey) ?? null;
    let chosenClass: string | null = null;
    let chosenRemaining = -1;

    for (const classe of classOrder) {
      const queue = classQueues.get(classe);
      if (!queue?.length || classe === forbiddenClass) continue;
      if (queue.length > chosenRemaining) {
        chosenClass = classe;
        chosenRemaining = queue.length;
      }
    }

    // If every remaining student belongs to the forbidden class, place them anyway and count the violation.
    if (!chosenClass) {
      chosenClass = classOrder.find(classe => (classQueues.get(classe)?.length ?? 0) > 0) ?? null;
    }
    if (!chosenClass) break;

    const student = classQueues.get(chosenClass)!.shift()!;
    placements.push({ student, classe: chosenClass, slot });
    lastClassByRow.set(rowKey, chosenClass);
  }

  for (const queue of classQueues.values()) leftover.push(...queue);
  return finalizePlan({ placements, halls: input.halls, prefix: input.prefix, columnsPerRow: input.columnsPerRow, leftoverStudents: leftover });
}

/** Grouped seating: keeps each class together inside the largest available hall. */
function assignGroupedSeating(input: {
  students: SeatingStudent[];
  halls: SeatingHall[];
  columnsPerRow: number;
  prefix: string;
}): SeatingPlanResult {
  const classQueues = buildClassQueues(input.students);
  const classes = [...classQueues.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], "ar"));
  const remaining = new Map(input.halls.map(hall => [hall.id, hall.capacity]));
  const usedByClassInHall = new Map<string, number>();
  const placements: Placement[] = [];
  const leftover: SeatingStudent[] = [];

  for (const [classe, classStudents] of classes) {
    let queue = [...classStudents];
    while (queue.length > 0) {
      const candidates = input.halls
        .map(hall => ({
          hall,
          remaining: remaining.get(hall.id) ?? 0,
          classSeats: usedByClassInHall.get(`${hall.id}:${classe}`) ?? 0,
        }))
        .filter(item => item.remaining > 0)
        .sort((a, b) => {
          const aUsed = a.classSeats > 0 ? 0 : 1;
          const bUsed = b.classSeats > 0 ? 0 : 1;
          if (aUsed !== bUsed) return aUsed - bUsed;
          return b.remaining - a.remaining || a.hall.name.localeCompare(b.hall.name, "ar");
        });
      const hall = candidates[0]?.hall;
      if (!hall) {
        leftover.push(...queue);
        break;
      }
      const space = remaining.get(hall.id) ?? 0;
      const chunk = queue.slice(0, space);
      const startSeat = hall.capacity - space + 1;
      chunk.forEach((student, index) => {
        const seatNumber = startSeat + index;
        const layout = layoutForSeat(seatNumber, input.columnsPerRow);
        placements.push({
          student,
          classe,
          slot: { hall, seatNumber, rowNumber: layout.rowNumber, columnNumber: layout.columnNumber },
        });
      });
      remaining.set(hall.id, space - chunk.length);
      usedByClassInHall.set(`${hall.id}:${classe}`, (usedByClassInHall.get(`${hall.id}:${classe}`) ?? 0) + chunk.length);
      queue = queue.slice(chunk.length);
    }
  }

  return finalizePlan({ placements, halls: input.halls, prefix: input.prefix, columnsPerRow: input.columnsPerRow, leftoverStudents: leftover });
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
  const separateSameClass = options.separateSameClass !== false && options.keepClassesTogether !== true;
  const keepClassesTogether = options.keepClassesTogether === true;
  const prefix = (options.organizationPrefix ?? input.sessionId.slice(0, 8)).toUpperCase();

  const halls = input.halls
    .map(hall => ({ ...hall, capacity: Math.max(0, Number(hall.capacity) || 0) }))
    .filter(hall => hall.capacity > 0)
    .sort((a, b) => a.name.localeCompare(b.name, "ar") || a.id.localeCompare(b.id));

  const students = [...input.students].sort((a, b) => studentSortKey(a).localeCompare(studentSortKey(b), "ar"));
  const planInput = { students, halls, columnsPerRow, prefix };

  if (keepClassesTogether) return assignGroupedSeating(planInput);
  if (separateSameClass) return assignMixedSeating(planInput);
  return assignGroupedSeating(planInput);
}
