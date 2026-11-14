/**
 * Substitution Engine
 * -------------------
 * Given a time slot where a teacher is absent, finds and ranks available
 * replacement teachers from the provided weekly schedule.
 *
 * No DB table for teachers exists — callers supply the teacher roster and
 * their weekly time-slot occupancy.  The engine is pure algorithm logic;
 * persistence (if needed) lives at the route layer.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

/** A single occupied period in the week. */
export interface TimeSlot {
  /** Day index: 0 = Sunday … 6 = Saturday */
  day: number;
  /** Period index within the day (1-based, e.g. 1=08:00-09:00) */
  period: number;
}

/** A teacher record provided by the caller. */
export interface Teacher {
  id: string;
  name: string;
  /** Subjects the teacher can cover */
  subjects: string[];
  /** All slots already occupied this week */
  occupiedSlots: TimeSlot[];
  /** Contractual weekly hours (used to prefer under-scheduled teachers) */
  weeklyHours?: number;
}

/** The slot that needs to be covered. */
export interface AbsenceSlot {
  day: number;
  period: number;
  subject: string;
}

/** A single recommendation returned by the engine. */
export interface SubstitutionRecommendation {
  teacher: Omit<Teacher, "occupiedSlots">;
  /** Number of free periods remaining in the week */
  freePeriodsThisWeek: number;
  /** Hours already scheduled vs contractual limit */
  assignedHours: number;
  weeklyHours: number;
  /** True if the teacher can cover the requested subject */
  subjectMatch: boolean;
  /** Composite score — lower is better */
  score: number;
  reason: string;
}

export interface SubstitutionResult {
  absenceSlot: AbsenceSlot;
  absentTeacher: string;
  recommendations: SubstitutionRecommendation[];
  totalCandidates: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Number of teaching periods per day in an Algerian middle school timetable */
const PERIODS_PER_DAY = 6;
/** School week spans Sunday–Thursday (5 days) */
const SCHOOL_DAYS = 5;
const TOTAL_WEEKLY_PERIODS = PERIODS_PER_DAY * SCHOOL_DAYS;

// ── Helpers ───────────────────────────────────────────────────────────────────

function slotKey(s: TimeSlot): string {
  return `${s.day}-${s.period}`;
}

function isBusy(teacher: Teacher, slot: AbsenceSlot): boolean {
  const key = slotKey(slot);
  return teacher.occupiedSlots.some((s) => slotKey(s) === key);
}

function subjectMatch(teacher: Teacher, subject: string): boolean {
  if (!subject) return true;
  const q = subject.toLowerCase();
  return teacher.subjects.some((s) => s.toLowerCase() === q);
}

/**
 * Score a candidate teacher for a substitution slot.
 * Lower score = better candidate.
 *
 * Scoring factors:
 *   +0    — exact subject match (bonus, subtracted below)
 *   +100  — no subject match
 *   +assigned hours ratio × 50  — prefers under-scheduled teachers
 *   −free periods × 0.5          — prefers teachers with many open slots
 */
function scoreTeacher(
  teacher: Teacher,
  slot: AbsenceSlot,
  assignedHours: number,
): number {
  const weekly = teacher.weeklyHours ?? TOTAL_WEEKLY_PERIODS;
  const hourRatio = weekly > 0 ? assignedHours / weekly : 1;
  const freePeriods = TOTAL_WEEKLY_PERIODS - teacher.occupiedSlots.length;
  const subjectPenalty = subjectMatch(teacher, slot.subject) ? 0 : 100;

  return Math.round(subjectPenalty + hourRatio * 50 - freePeriods * 0.5);
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Find and rank replacement teachers for a given absence slot.
 *
 * @param absentTeacherId  - ID of the absent teacher (excluded from results)
 * @param slot             - The period that needs coverage
 * @param teachers         - Full teacher roster with their weekly schedules
 * @param limit            - Maximum number of recommendations (default 5)
 */
export function findSubstitutes(
  absentTeacherId: string,
  slot: AbsenceSlot,
  teachers: Teacher[],
  limit = 5,
): SubstitutionResult {
  const absentTeacher =
    teachers.find((t) => t.id === absentTeacherId)?.name ?? absentTeacherId;

  const candidates: SubstitutionRecommendation[] = [];

  for (const teacher of teachers) {
    // Skip the absent teacher themselves
    if (teacher.id === absentTeacherId) continue;
    // Skip anyone already busy at that slot
    if (isBusy(teacher, slot)) continue;

    const assignedHours = teacher.occupiedSlots.length;
    const freePeriods = TOTAL_WEEKLY_PERIODS - assignedHours;
    const weekly = teacher.weeklyHours ?? TOTAL_WEEKLY_PERIODS;
    const matched = subjectMatch(teacher, slot.subject);
    const score = scoreTeacher(teacher, slot, assignedHours);

    const reasons: string[] = [];
    if (matched) reasons.push(`يُدرّس ${slot.subject}`);
    if (freePeriods > PERIODS_PER_DAY) reasons.push("حصص متاحة كافية");
    if (assignedHours < weekly * 0.7) reasons.push("ساعاته أقل من الحد الأسبوعي");

    candidates.push({
      teacher: {
        id: teacher.id,
        name: teacher.name,
        subjects: teacher.subjects,
        weeklyHours: teacher.weeklyHours,
      },
      freePeriodsThisWeek: freePeriods,
      assignedHours,
      weeklyHours: weekly,
      subjectMatch: matched,
      score,
      reason: reasons.join(" · ") || "متاح في الوقت المطلوب",
    });
  }

  // Sort ascending by score (lower = better), break ties by free periods desc
  candidates.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    return b.freePeriodsThisWeek - a.freePeriodsThisWeek;
  });

  return {
    absenceSlot: slot,
    absentTeacher,
    recommendations: candidates.slice(0, limit),
    totalCandidates: candidates.length,
  };
}
