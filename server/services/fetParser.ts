import { TIMETABLE_PERIODS } from "../../shared/timetable-curriculum.js";

export interface FetTeacher { name: string; shortName?: string }
export interface FetClassName { name: string }
export interface FetRoom { name: string }
export interface FetTimeslot { index: number; day: number; startTime: string; endTime: string; durationMinutes: number; period: number }
export interface FetActivity { index: number; teacher: string; subject: string; classes: string[]; split: number; activityTag: string }
export interface FetSlotAssignment { activityIndex: number; day: number; period: number; timeslotIndex?: number }
export interface FetParseResult {
  teachers: FetTeacher[];
  classes: FetClassName[];
  rooms: FetRoom[];
  timeslots: FetTimeslot[];
  activities: FetActivity[];
  slots: FetSlotAssignment[];
  warnings: string[];
  stats: { teachers: number; classes: number; activities: number; timeslots: number; slots: number };
}

function decodeEntities(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function blocks(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}\\s*>`, "gi");
  const out: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml))) out.push(match[1] ?? "");
  return out;
}

function block(xml: string, tag: string): string {
  return blocks(xml, tag)[0] ?? "";
}

function text(blockXml: string, tag: string): string {
  const inner = block(blockXml, tag);
  return decodeEntities(inner.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
}

function texts(blockXml: string, tag: string): string[] {
  return blocks(blockXml, tag).map(item => text(item, tag)).filter(Boolean);
}

function section(xml: string, tag: string): string {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}\\s*>`, "i");
  return re.exec(xml)?.[1] ?? "";
}

function splitNames(value: string): string[] {
  return decodeEntities(value)
    .split(/[;,&،\n]+/)
    .map(item => item.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function toMinutes(value: string): number | null {
  const match = value.trim().match(/^(\d{1,2})[:：](\d{2})/);
  if (!match) return null;
  const h = Number(match[1]); const m = Number(match[2]);
  return h * 60 + m;
}

function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function periodForTimeslot(startTime: string, endTime: string): number {
  const start = toMinutes(startTime); const end = toMinutes(endTime);
  if (start !== null && end !== null) {
    const found = TIMETABLE_PERIODS.find(period => toMinutes(period.start) === start && toMinutes(period.end) === end);
    if (found) return found.period;
  }
  return -1;
}

function clampDay(day: number, dayOffset = 0): number {
  const idx = dayOffset ? ((day - 1 + dayOffset) % 5 + 5) % 5 : (day >= 1 && day <= 5 ? day - 1 : day);
  return Math.max(0, Math.min(4, idx));
}

function resolveActivityIndex(raw: string, activities: FetActivity[]): number | null {
  const n = Number(raw.trim());
  if (!Number.isFinite(n)) return null;
  const direct = activities.find(activity => activity.index === n);
  if (direct) return direct.index;
  const plusOne = activities.find(activity => activity.index === n + 1);
  if (plusOne) return plusOne.index;
  const minusOne = activities.find(activity => activity.index === n - 1);
  return minusOne?.index ?? null;
}

export function parseFetXml(xml: string, options: { dayOffset?: number } = {}): FetParseResult {
  const warnings: string[] = [];
  const dayOffset = Number.isFinite(Number(options.dayOffset)) ? Number(options.dayOffset) : 0;

  const teacherSection = section(xml, "Teachers") || xml;
  const teacherBlocks = blocks(teacherSection, "Teacher");
  const teachers: FetTeacher[] = teacherBlocks.map(item => ({
    name: text(item, "Name") || text(item, "SName") || text(item, "Teacher"),
    shortName: text(item, "SName") || undefined,
  })).filter(teacher => teacher.name);

  const classNames = new Set<string>();
  const studentsSection = section(xml, "Students");
  if (studentsSection) {
    for (const student of blocks(studentsSection, "Student")) {
      const name = text(student, "Name") || text(student, "Class") || text(student, "Students");
      for (const cls of splitNames(name)) classNames.add(cls);
    }
  }
  const classesSection = section(xml, "Classes");
  if (classesSection) {
    for (const cls of blocks(classesSection, "Class")) {
      const name = text(cls, "Name") || text(cls, "Class");
      for (const item of splitNames(name)) classNames.add(item);
    }
  }

  const roomSection = section(xml, "Rooms");
  const rooms: FetRoom[] = roomSection
    ? blocks(roomSection, "Room").map(item => ({ name: text(item, "Name") || text(item, "Room") })).filter(room => room.name)
    : [];

  const rawTimeslots = blocks(xml, "TimeSlot");
  const timeslots: FetTimeslot[] = rawTimeslots.map((item, index) => {
    const day = Number(text(item, "Day") || text(item, "day") || "1");
    const startTime = text(item, "StartTime") || text(item, "startTime") || "";
    const duration = Number(text(item, "Duration") || text(item, "duration") || "60") || 60;
    let endTime = text(item, "EndTime") || text(item, "endTime") || "";
    const startMin = toMinutes(startTime);
    if (!endTime && startMin !== null) endTime = formatMinutes(startMin + duration);
    return {
      index: index + 1,
      day: clampDay(day, dayOffset),
      startTime,
      endTime,
      durationMinutes: duration,
      period: periodForTimeslot(startTime, endTime),
    };
  }).filter(slot => slot.startTime && slot.endTime)
    .sort((a, b) => a.day - b.day || a.startTime.localeCompare(b.startTime));

  timeslots.forEach((slot, index) => {
    if (slot.period < 0) {
      const sameDay = timeslots.filter(item => item.day === slot.day).sort((a, b) => a.startTime.localeCompare(b.startTime));
      slot.period = sameDay.findIndex(item => item.index === slot.index);
      if (slot.period < 0) slot.period = index;
    }
  });

  const activitySection = section(xml, "Activities") || xml;
  const activityBlocks = blocks(activitySection, "Activity");
  const activities: FetActivity[] = activityBlocks.map((item, index) => {
    const studentsRaw = text(item, "Students") || text(item, "Student") || text(item, "Class") || "";
    const classes = splitNames(studentsRaw);
    for (const cls of classes) classNames.add(cls);
    return {
      index: index + 1,
      teacher: text(item, "Teacher") || text(item, "Teachers") || "",
      subject: text(item, "Subject") || text(item, "subject") || "",
      classes,
      split: Number(text(item, "Split") || "1") || 1,
      activityTag: text(item, "Activity_Tag") || text(item, "ActivityTag") || "",
    };
  }).filter(activity => activity.teacher || activity.subject || activity.classes.length);

  const slots: FetSlotAssignment[] = [];
  for (const slotBlock of blocks(xml, "Slot")) {
    const activityRaw = text(slotBlock, "Activity") || text(slotBlock, "activity") || "";
    const activityIndex = resolveActivityIndex(activityRaw, activities);
    if (!activityIndex) { warnings.push(`Slot references unknown activity "${activityRaw}"`); continue; }

    const dayRaw = Number(text(slotBlock, "Day") || text(slotBlock, "day") || "1");
    const periodRaw = text(slotBlock, "Period") || text(slotBlock, "period") || "";
    const timeSlotRaw = text(slotBlock, "TimeSlot") || text(slotBlock, "timeslot") || "";
    const timeSlot = timeslots.find(slot => String(slot.index) === timeSlotRaw) ?? timeslots[Number(timeSlotRaw) - 1];

    let day = Number.isFinite(dayRaw) ? clampDay(dayRaw, dayOffset) : timeSlot?.day ?? clampDay(1, dayOffset);
    let period = periodRaw ? Math.max(0, Number(periodRaw) - 1) : timeSlot?.period ?? -1;
    if (period < 0 && Number.isFinite(dayRaw)) period = 0;
    if (day < 0 || period < 0) { warnings.push(`Slot for activity ${activityIndex} has unresolved day/period`); continue; }
    slots.push({ activityIndex, day, period, timeslotIndex: timeSlot?.index });
  }

  if (!slots.length && activities.length) warnings.push("No explicit FET slot assignments found; imported teachers/classes only.");
  if (!teachers.length) warnings.push("No FET teachers found.");
  if (!activities.length) warnings.push("No FET activities found.");

  return {
    teachers,
    classes: [...classNames].sort((a, b) => a.localeCompare(b, "ar")).map(name => ({ name })),
    rooms,
    timeslots,
    activities,
    slots,
    warnings,
    stats: { teachers: teachers.length, classes: classNames.size, activities: activities.length, timeslots: timeslots.length, slots: slots.length },
  };
}
