export interface TimetableRequestSubject {
  subject: string;
  teacherId?: string | null;
  periods?: number;
  roomId?: string | null;
}

export interface TimetableRequestClass {
  classe: string;
  subjects: TimetableRequestSubject[];
  directedWork?: {
    subjectA: string;
    teacherA?: string | null;
    subjectB: string;
    teacherB?: string | null;
  };
}

export interface TimetableGenerationRules {
  workingDays?: number[];
  periodsPerDay?: number;
  blockedSlots?: Array<{ day: number; period: number }>;
  maxDailyPeriodsPerClass?: number;
  avoidConsecutiveSameSubject?: boolean;
  teacherAvailability?: Record<string, Array<{ day: number; period: number }>>;
}

export interface GeneratedTimetableSlot {
  classe: string;
  subject: string;
  alternateSubject?: string | null;
  teacherId: string | null;
  alternateTeacherId?: string | null;
  roomId: string | null;
  day: number;
  period: number;
}

export interface UnscheduledTimetableItem {
  classe: string;
  subject: string;
  alternateSubject?: string | null;
  teacherId: string | null;
  reason: string;
}

export interface TimetableGenerationResult {
  slots: GeneratedTimetableSlot[];
  unscheduled: UnscheduledTimetableItem[];
}

const SCHOOL_DAYS = 5;
const PERIODS_PER_DAY = 6;

function slotKey(day: number, period: number): string {
  return `${day}:${period}`;
}

interface PendingLesson {
  classe: string;
  subject: string;
  teacherId: string | null;
  roomId: string | null;
  alternateSubject?: string;
  alternateTeacherId?: string | null;
  duration: number;
  invalidReason?: string;
}

function requiresConsecutivePair(subject: string): boolean {
  return subject.includes("الاستدراك") || subject.includes("البدنية");
}

/**
 * Builds the ordered list of individual lesson placements, interleaving
 * subjects round-robin WITHIN each class (one period of subject A, one of
 * subject B, one of subject C, then back to A, ...) instead of scheduling
 * one subject to completion before starting the next.
 *
 * This matters when total requested periods exceed available capacity: with
 * a subject-by-subject ordering, the first subjects in the input list would
 * consume all available slots and later subjects would get none at all.
 * Round-robin spreads any shortage evenly across every subject instead.
 */
function buildLessonQueue(classes: TimetableRequestClass[]): PendingLesson[] {
  const lessons: PendingLesson[] = [];

  for (const entry of classes) {
    const classe = entry.classe.trim();
    const queues = entry.subjects.map((subject) => ({
      subject: subject.subject.trim(),
      teacherId: subject.teacherId ?? null,
      roomId: subject.roomId ?? null,
      remaining: Math.max(0, Math.min(30, Math.floor(subject.periods ?? (requiresConsecutivePair(subject.subject) ? 2 : 1)))),
    }));

    let anyRemaining = queues.some((q) => q.remaining > 0);
    while (anyRemaining) {
      anyRemaining = false;
      for (const q of queues) {
        if (q.remaining <= 0) continue;
        const duration = requiresConsecutivePair(q.subject) ? 2 : 1;
        if (q.remaining < duration) {
          lessons.push({
            classe,
            subject: q.subject,
            teacherId: q.teacherId,
            roomId: q.roomId,
            duration,
            invalidReason: `${q.subject} must be scheduled in consecutive pairs`,
          });
          q.remaining = 0;
          continue;
        }
        lessons.push({ classe, subject: q.subject, teacherId: q.teacherId, roomId: q.roomId, duration });
        q.remaining -= duration;
        if (q.remaining > 0) anyRemaining = true;
      }
    }

    const directedWork = entry.directedWork;
    if (directedWork?.subjectA?.trim() && directedWork.subjectB?.trim() &&
        directedWork.subjectA.trim() !== directedWork.subjectB.trim()) {
      lessons.push({
        classe,
        subject: directedWork.subjectA.trim(),
        teacherId: directedWork.teacherA ?? null,
        alternateSubject: directedWork.subjectB.trim(),
        alternateTeacherId: directedWork.teacherB ?? null,
        roomId: null,
        duration: 2,
      });
    }
  }

  return lessons;
}

/**
 * Greedily places the most constrained lessons first. A lesson is accepted
 * only when its class, teacher, and room are all free at the same slot.
 */
export function generateTimetable(
  classes: TimetableRequestClass[],
  availableRoomIds: string[] = [],
  rules: TimetableGenerationRules = {},
): TimetableGenerationResult {
  const slots: GeneratedTimetableSlot[] = [];
  const unscheduled: UnscheduledTimetableItem[] = [];
  const classBusy = new Set<string>();
  const teacherBusyWeekA = new Set<string>();
  const teacherBusyWeekB = new Set<string>();
  const roomBusy = new Set<string>();
  const workingDays = [...new Set((rules.workingDays ?? [0, 1, 2, 3, 4])
    .filter(day => Number.isInteger(day) && day >= 0 && day <= 6))].sort((a, b) => a - b);
  const periodsPerDay = Math.max(1, Math.min(10, Math.floor(rules.periodsPerDay ?? 6)));
  const blocked = new Set((rules.blockedSlots ?? []).map(slot => slotKey(slot.day, slot.period)));
  const dailyPeriods = new Map<string, number>();
  const subjectAt = new Map<string, string>();
  const subjectDailyPeriods = new Map<string, number>();

  const teacherCanTeach = (teacherId: string | null | undefined, day: number, period: number) => {
    if (!teacherId || !rules.teacherAvailability?.[teacherId]) return true;
    return rules.teacherAvailability[teacherId]!.some(slot => slot.day === day && slot.period === period);
  };

  // Round-robin across subjects within each class, instead of exhausting
  // one subject before starting the next — see buildLessonQueue() above.
  const lessons = buildLessonQueue(classes).sort((a, b) => {
    if (a.duration !== b.duration) return b.duration - a.duration;
    if (Boolean(a.teacherId || a.alternateTeacherId) !== Boolean(b.teacherId || b.alternateTeacherId)) {
      return a.teacherId || a.alternateTeacherId ? -1 : 1;
    }
    if (a.roomId !== b.roomId) return a.roomId ? -1 : 1;
    return a.classe.localeCompare(b.classe);
  });

  for (const lesson of lessons) {
    if (lesson.invalidReason) {
      unscheduled.push({ ...lesson, reason: lesson.invalidReason });
      continue;
    }
    if (!lesson.classe || !lesson.subject) {
      unscheduled.push({ ...lesson, reason: "classe and subject are required" });
      continue;
    }

    let placed = false;
    let bestCandidate: { day: number; period: number; roomId: string | null; score: number } | null = null;
    for (const day of workingDays) {
      for (let period = 0; period <= periodsPerDay - lesson.duration; period += 1) {
        const block = Array.from({ length: lesson.duration }, (_, offset) => period + offset);
        if (block.some(blockPeriod => {
          const key = slotKey(day, blockPeriod);
          const teacherA = lesson.teacherId;
          const teacherB = lesson.alternateSubject ? (lesson.alternateTeacherId ?? null) : lesson.teacherId;
          return blocked.has(key) || classBusy.has(`${lesson.classe}:${key}`) ||
            Boolean(teacherA && teacherBusyWeekA.has(`${teacherA}:${key}`)) ||
            Boolean(teacherB && teacherBusyWeekB.has(`${teacherB}:${key}`)) ||
            !teacherCanTeach(teacherA, day, blockPeriod) || !teacherCanTeach(teacherB, day, blockPeriod);
        })) continue;
        const classDayKey = `${lesson.classe}:${day}`;
        if (rules.maxDailyPeriodsPerClass !== undefined &&
          (dailyPeriods.get(classDayKey) ?? 0) + lesson.duration > Math.max(1, Math.floor(rules.maxDailyPeriodsPerClass))) continue;
        if (rules.avoidConsecutiveSameSubject && lesson.duration === 1 &&
            (subjectAt.get(`${lesson.classe}:${day}:${period - 1}`) === lesson.subject ||
             subjectAt.get(`${lesson.classe}:${day}:${period + 1}`) === lesson.subject)) continue;

        const roomId = lesson.roomId ?? availableRoomIds.find(candidate =>
          block.every(blockPeriod => !roomBusy.has(`${candidate}:${slotKey(day, blockPeriod)}`)),
        ) ?? null;
        if (lesson.roomId && block.some(blockPeriod => roomBusy.has(`${lesson.roomId}:${slotKey(day, blockPeriod)}`))) continue;
        if (availableRoomIds.length > 0 && !roomId) continue;

        const subjectDayKey = `${lesson.classe}:${lesson.subject}:${day}`;
        const subjectDayCount = subjectDailyPeriods.get(subjectDayKey) ?? 0;
        const dayLoad = dailyPeriods.get(classDayKey) ?? 0;
        const score = subjectDayCount * 1000 + dayLoad * 10 + period;
        if (!bestCandidate || score < bestCandidate.score) {
          bestCandidate = { day, period, roomId, score };
        }
      }
    }

    if (bestCandidate) {
      const { day, period, roomId } = bestCandidate;
      const classDayKey = `${lesson.classe}:${day}`;
      const subjectDayKey = `${lesson.classe}:${lesson.subject}:${day}`;
      for (let offset = 0; offset < lesson.duration; offset += 1) {
        const blockPeriod = period + offset;
        const key = slotKey(day, blockPeriod);
        slots.push({
          classe: lesson.classe,
          subject: lesson.subject,
          alternateSubject: lesson.alternateSubject ?? null,
          teacherId: lesson.teacherId,
          alternateTeacherId: lesson.alternateTeacherId ?? null,
          roomId,
          day,
          period: blockPeriod,
        });
        classBusy.add(`${lesson.classe}:${key}`);
        subjectAt.set(`${lesson.classe}:${day}:${blockPeriod}`, lesson.subject);
        const teacherA = lesson.teacherId;
        const teacherB = lesson.alternateSubject ? (lesson.alternateTeacherId ?? null) : lesson.teacherId;
        if (teacherA) teacherBusyWeekA.add(`${teacherA}:${key}`);
        if (teacherB) teacherBusyWeekB.add(`${teacherB}:${key}`);
        if (roomId) roomBusy.add(`${roomId}:${key}`);
      }
      dailyPeriods.set(classDayKey, (dailyPeriods.get(classDayKey) ?? 0) + lesson.duration);
      subjectDailyPeriods.set(subjectDayKey, (subjectDailyPeriods.get(subjectDayKey) ?? 0) + lesson.duration);
      placed = true;
    }

    if (!placed) {
      unscheduled.push({ ...lesson, reason: "no conflict-free period is available" });
    }
  }

  return { slots, unscheduled };
}