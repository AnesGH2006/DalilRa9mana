import { TIMETABLE_PERIODS } from "../../shared/timetable-curriculum.js";

export interface ExamSessionLike {
  id: string;
  annee?: string | null;
  title?: string | null;
  kind?: string | null;
  classe?: string | null;
  subject?: string | null;
  examDate: string;
  startTime?: string | null;
  endTime?: string | null;
  durationMinutes?: number | null;
}

export interface InvigilatorCandidate {
  id: string;
  name: string;
  teacherId?: string | null;
  memberId?: string | null;
  subjects?: string[] | null;
}

export interface TimetableSlotLike {
  day: number;
  period: number;
  subject?: string | null;
  classe?: string | null;
  teacherId?: string | null;
  alternateTeacherId?: string | null;
}

export interface PlannedInvigilator {
  sessionId: string;
  candidateId: string;
  teacherId: string | null;
  memberId: string | null;
  name: string;
  subject: string | null;
  role: "chief" | "invigilator";
  score: number;
}

export interface InvigilationPlanResult {
  assignments: PlannedInvigilator[];
  unassigned: Array<{ sessionId: string; needed: number; available: number; title: string }>;
}

export interface InvigilationOptions {
  studentsPerInvigilator?: number;
  minInvigilators?: number;
  maxInvigilators?: number;
  includeChief?: boolean;
}

const DEFAULT_PERIOD_MINUTES = 60;

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, " ");
}

function timeToMinutes(value: string | null | undefined): number | null {
  const match = String(value ?? "").match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function sessionWindow(session: ExamSessionLike): { start: number; end: number } {
  const start = timeToMinutes(session.startTime) ?? 0;
  const explicitEnd = timeToMinutes(session.endTime);
  if (explicitEnd !== null) return { start, end: Math.max(explicitEnd, start + 30) };
  const duration = Number(session.durationMinutes);
  if (Number.isFinite(duration) && duration > 0) return { start, end: start + duration };
  return { start, end: start + DEFAULT_PERIOD_MINUTES };
}

function examWeekday(examDate: string): number | null {
  const parsed = new Date(`${examDate}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  const day = parsed.getUTCDay();
  return day >= 0 && day <= 4 ? day : null;
}

function intervalsOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

function periodWindow(period: number): { start: number; end: number } | null {
  const meta = TIMETABLE_PERIODS.find(item => item.period === period);
  if (!meta) return null;
  const start = timeToMinutes(meta.start);
  const end = timeToMinutes(meta.end);
  return start === null || end === null ? null : { start, end };
}

function candidateKey(candidate: InvigilatorCandidate): string {
  return candidate.teacherId ?? candidate.memberId ?? `name:${normalizeText(candidate.name)}`;
}

function candidateAlreadyUsed(
  candidate: InvigilatorCandidate,
  assigned: Map<string, Array<{ date: string; start: number; end: number }>>,
  session: ExamSessionLike,
  window: { start: number; end: number },
): boolean {
  const intervals = assigned.get(candidateKey(candidate)) ?? [];
  return intervals.some(interval => interval.date === session.examDate && intervalsOverlap(window.start, window.end, interval.start, interval.end));
}

function hasTimetableConflict(
  candidate: InvigilatorCandidate,
  session: ExamSessionLike,
  window: { start: number; end: number },
  slots: TimetableSlotLike[],
): boolean {
  if (!candidate.teacherId) return false;
  const weekday = examWeekday(session.examDate);
  if (weekday === null) return false;
  return slots.some(slot => {
    if (slot.day !== weekday) return false;
    if (slot.teacherId !== candidate.teacherId && slot.alternateTeacherId !== candidate.teacherId) return false;
    const period = periodWindow(slot.period);
    return period ? intervalsOverlap(window.start, window.end, period.start, period.end) : false;
  });
}

function teachesSessionSubject(candidate: InvigilatorCandidate, session: ExamSessionLike): boolean {
  const subject = normalizeText(session.subject);
  if (!subject) return false;
  return (candidate.subjects ?? []).some(item => {
    const normalized = normalizeText(item);
    return normalized && (normalized === subject || normalized.includes(subject) || subject.includes(normalized));
  });
}

function teachesSessionClass(candidate: InvigilatorCandidate, session: ExamSessionLike, slots: TimetableSlotLike[]): boolean {
  const classe = normalizeText(session.classe);
  if (!classe || !candidate.teacherId) return false;
  return slots.some(slot => slot.teacherId === candidate.teacherId && normalizeText(slot.classe) === classe);
}

function stableTieBreak(sessionId: string, candidateId: string): number {
  let hash = 0;
  const input = `${sessionId}:${candidateId}`;
  for (let i = 0; i < input.length; i += 1) hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  return hash / 0xffffffff;
}

export function buildInvigilationPlan(input: {
  sessions: ExamSessionLike[];
  candidates: InvigilatorCandidate[];
  studentCounts: Record<string, number>;
  slots?: TimetableSlotLike[];
  existingCounts?: Record<string, number>;
  options?: InvigilationOptions;
}): InvigilationPlanResult {
  const options = input.options ?? {};
  const studentsPerInvigilator = Math.max(1, options.studentsPerInvigilator ?? 25);
  const minInvigilators = Math.max(1, options.minInvigilators ?? 2);
  const maxInvigilators = Math.max(minInvigilators, options.maxInvigilators ?? 6);
  const includeChief = options.includeChief !== false;
  const slots = input.slots ?? [];
  const existingCounts = input.existingCounts ?? {};
  const sessions = [...input.sessions].sort((a, b) =>
    `${a.examDate}T${a.startTime ?? "00:00"}`.localeCompare(`${b.examDate}T${b.startTime ?? "00:00"}`) || a.id.localeCompare(b.id),
  );

  const load = new Map<string, number>();
  for (const candidate of input.candidates) load.set(candidateKey(candidate), existingCounts[candidateKey(candidate)] ?? 0);
  const assignedIntervals = new Map<string, Array<{ date: string; start: number; end: number }>>();
  const assignments: PlannedInvigilator[] = [];
  const unassigned: InvigilationPlanResult["unassigned"] = [];

  for (const session of sessions) {
    const window = sessionWindow(session);
    const count = Math.max(0, Number(input.studentCounts[session.id]) || 0);
    const needed = Math.min(maxInvigilators, Math.max(minInvigilators, Math.ceil(count / studentsPerInvigilator) || minInvigilators));

    const scored = input.candidates
      .map(candidate => {
        const key = candidateKey(candidate);
        const hardConflict = candidateAlreadyUsed(candidate, assignedIntervals, session, window)
          || hasTimetableConflict(candidate, session, window, slots);
        const ownSubject = teachesSessionSubject(candidate, session) ? 60 : 0;
        const ownClass = teachesSessionClass(candidate, session, slots) ? 35 : 0;
        const dayLoad = slots.some(slot => slot.day === examWeekday(session.examDate) && (slot.teacherId === candidate.teacherId || slot.alternateTeacherId === candidate.teacherId)) ? 8 : 0;
        const score = (load.get(key) ?? 0) * 1000 + ownSubject + ownClass + dayLoad + stableTieBreak(session.id, key) * 10;
        return { candidate, key, score, hardConflict };
      })
      .filter(item => !item.hardConflict)
      .sort((a, b) => a.score - b.score || a.key.localeCompare(b.key));

    const chosen = scored.slice(0, needed);
    if (chosen.length < needed) {
      unassigned.push({ sessionId: session.id, needed, available: chosen.length, title: session.title ?? session.id });
    }

    chosen.forEach((item, index) => {
      const role = includeChief && index === 0 ? "chief" : "invigilator";
      assignments.push({
        sessionId: session.id,
        candidateId: item.key,
        teacherId: item.candidate.teacherId ?? null,
        memberId: item.candidate.memberId ?? null,
        name: item.candidate.name,
        subject: session.subject ?? null,
        role,
        score: item.score,
      });
      load.set(item.key, (load.get(item.key) ?? 0) + 1);
      const intervals = assignedIntervals.get(item.key) ?? [];
      intervals.push({ date: session.examDate, start: window.start, end: window.end });
      assignedIntervals.set(item.key, intervals);
    });
  }

  return { assignments, unassigned };
}
