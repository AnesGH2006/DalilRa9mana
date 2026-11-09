import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calendar, Users, Building2, Plus, Trash2, Edit3, X, Check,
  AlertTriangle, Printer, Loader2, ChevronDown, Grid3X3, BookMarked, Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  DEFAULT_CONSECUTIVE_PERIODS,
  DEFAULT_SUBJECT_ROOM_TYPES,
  DEFAULT_WEEKLY_PERIODS,
  LYCEE_PROGRAMS,
  LYCEE_SUBJECTS,
  MOYEN_SUBJECTS,
} from "@shared/timetable-curriculum";

const BASE = import.meta.env.BASE_URL;

// ── Constants ─────────────────────────────────────────────────────────────────
const DAYS_AR  = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس"];
const DAYS_EN  = ["Sun", "Mon", "Tue", "Wed", "Thu"];
const PERIODS  = [
  { label: "ح1",  time: "08:00 - 09:00" },
  { label: "ح2",  time: "09:00 - 10:00" },
  { label: "ح3",  time: "10:15 - 11:15" },
  { label: "ح4",  time: "11:15 - 12:15" },
  { label: "ح5",  time: "14:00 - 15:00" },
  { label: "ح6",  time: "15:00 - 16:00" },
  { label: "ح7",  time: "16:00 - 17:00" },
];
const YEARS = ["2023-2024", "2024-2025", "2025-2026", "2026-2027"];

const TEACHER_COLORS = [
  "#3b82f6","#8b5cf6","#10b981","#f59e0b","#ef4444",
  "#06b6d4","#ec4899","#84cc16","#f97316","#6366f1",
];

const ROOM_TYPES: Record<string, { label: string; icon: string; color: string }> = {
  classroom: { label: "قاعة دراسية", icon: "🏫", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
  lab:       { label: "مخبر",       icon: "🔬", color: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300" },
  computer:  { label: "قاعة إعلام آلي", icon: "💻", color: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300" },
  sports:    { label: "قاعة رياضة", icon: "⚽", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" },
  library:   { label: "مكتبة",      icon: "📚", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
  other:     { label: "أخرى",       icon: "🏢", color: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
};

const DEFAULT_SUBJECTS = [...MOYEN_SUBJECTS, ...LYCEE_SUBJECTS];

const parseClassList = (raw: string): string[] => {
  const cleaned = raw
    .replace(/[\r\n]+/g, " ")
    .replace(/[،;]+/g, " ")
    .trim();

  if (!cleaned) return [];

  return Array.from(new Set(
    cleaned
      .split(/\s+/)
      .map(value => value.trim())
      .filter(Boolean)
      .map(value => value.replace(/^["'“”]+|["'“”]+$/g, ""))
      .filter(value => /^[0-9]+[A-Za-z]+[0-9]+$/.test(value))
      .map(value => value.toUpperCase())
  ));
};

// ── Types ─────────────────────────────────────────────────────────────────────
interface Teacher {
  id: string;
  name: string;
  subjects: string[];
  phone: string | null;
  color: string;
}

interface Room {
  id: string;
  name: string;
  type: string;
  capacity: number | null;
}

interface Slot {
  id: string;
  classe: string;
  subject: string;
  alternateSubject?: string | null;
  teacherId: string | null;
  alternateTeacherId?: string | null;
  roomId: string | null;
  day: number;
  period: number;
  notes: string | null;
}

// ── Inline editable field ─────────────────────────────────────────────────────
function EditableField({ value, onSave, placeholder = "", className = "" }: {
  value: string; onSave: (v: string) => void; placeholder?: string; className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) ref.current?.select(); }, [editing]);

  const commit = () => { setEditing(false); if (draft.trim() !== value) onSave(draft.trim()); };
  return editing
    ? <input ref={ref} value={draft} onChange={e => setDraft(e.target.value)}
        onBlur={commit} onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
        className={`border-b border-current bg-transparent focus:outline-none text-sm ${className}`} />
    : <span className={`cursor-pointer hover:opacity-70 transition-opacity ${!value ? "text-muted-foreground italic" : ""} ${className}`}
        onClick={() => { setDraft(value); setEditing(true); }}>
        {value || placeholder}
      </span>;
}

// ── Timetable Generator Panel ───────────────────────────────────────────────
// Generates for ALL classes across ALL levels in a single backend call, so
// teacher/room consistency is guaranteed across the whole school (the
// generator tracks busy slots globally, not per-class).
//
//   • Each level (1AM, 2AM, 3AM, 4AM, ...) gets its own curriculum
//     (subject → periods/week), since levels don't share the same program.
//   • Each subject is auto-matched to the first teacher qualified to teach
//     it (via Teacher.subjects); unmatched subjects are flagged before
//     generating.
//   • Each teacher can be marked unavailable on specific day/period cells —
//     this is the "director's instructions" layer — which is sent as
//     rules.teacherAvailability and enforced by the generator.
const getLevel = (classe: string): string => {
  const match = classe.match(/^([0-9]+[A-Za-z]+)/);
  return match ? match[1]!.toUpperCase() : classe;
};

const getProgramSubjects = (programId: string, knownSubjects: string[]): string[] => {
  const program = LYCEE_PROGRAMS.find(item => item.id === programId);
  const standardSubjects = program?.subjects ?? MOYEN_SUBJECTS;
  const customSubjects = knownSubjects.filter(subject => !DEFAULT_SUBJECTS.includes(subject));
  return [...new Set([...standardSubjects, ...customSubjects])];
};

const inferProgramId = (classe: string): string => {
  const level = getLevel(classe);
  const normalizedClass = classe.trim().toLocaleLowerCase();
  return LYCEE_PROGRAMS.find(program =>
    program.level === level && (
      normalizedClass.includes(program.id.toLocaleLowerCase()) ||
      normalizedClass.includes(program.label.toLocaleLowerCase()) ||
      program.aliases.some(alias => normalizedClass.includes(alias.toLocaleLowerCase()))
    ),
  )?.id ?? "";
};

const getProgrammedClassName = (classe: string, programId: string): string => {
  const program = LYCEE_PROGRAMS.find(item => item.id === programId);
  if (!program || inferProgramId(classe) === programId) return classe;
  return `${classe} [${program.label}]`;
};

function TimetableGeneratorPanel({ classes, subjects, roomIds, rooms, teachers, annee, onClose, onDone }: {
  classes: string[];
  subjects: string[];
  roomIds: string[];
  rooms: Room[];
  teachers: Teacher[];
  annee: string;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const { toast } = useToast();

  const levels = useMemo(
    () => Array.from(new Set(classes.map(getLevel))).sort(),
    [classes],
  );
  const programs = useMemo(() => levels.flatMap(level =>
    level.endsWith("AM")
      ? [{ id: level, level, label: level }]
      : LYCEE_PROGRAMS.filter(program => program.level === level),
  ), [levels]);
  const [selectedLevels, setSelectedLevels] = useState<string[]>(levels);
  const [activeProgramId, setActiveProgramId] = useState("");
  const [classPrograms, setClassPrograms] = useState<Record<string, string>>({});

  useEffect(() => {
    setSelectedLevels(current => current.filter(level => levels.includes(level)));
    setClassPrograms(current => Object.fromEntries(classes.map(classe => [
      classe,
      current[classe] ?? (getLevel(classe).endsWith("AM") ? getLevel(classe) : inferProgramId(classe)),
    ])));
  }, [classes, levels]);

  useEffect(() => {
    if (!programs.some(program => program.id === activeProgramId)) {
      setActiveProgramId(programs[0]?.id ?? "");
    }
  }, [programs, activeProgramId]);

  const [periods, setPeriods] = useState(6);
  const [maxDaily, setMaxDaily] = useState(6);
  const [selectedDays, setSelectedDays] = useState([0, 1, 2, 3, 4]);
  const [blocked, setBlocked] = useState("");
  const [spread, setSpread] = useState(true);
  const [spreadAcrossDays, setSpreadAcrossDays] = useState(true);
  const [preferHeavyEarly, setPreferHeavyEarly] = useState(true);
  const [avoidHeavyConsecutive, setAvoidHeavyConsecutive] = useState(true);
  const [minimizeGaps, setMinimizeGaps] = useState(true);
  const [generating, setGenerating] = useState(false);

  const [programTargets, setProgramTargets] = useState<Record<string, Record<string, number>>>({});
  const [programConsecutivePeriods, setProgramConsecutivePeriods] = useState<Record<string, Record<string, number>>>({});
  const [programRoomIds, setProgramRoomIds] = useState<Record<string, Record<string, string>>>({});
  const [directedWorkPairs, setDirectedWorkPairs] = useState<Record<string, { subjectA: string; subjectB: string }>>({});

  useEffect(() => {
    setProgramTargets(current => {
      const next = { ...current };
      for (const program of programs) {
        const existing = next[program.id] ?? {};
        const curriculum = DEFAULT_WEEKLY_PERIODS[program.id] ?? {};
        next[program.id] = Object.fromEntries(
          getProgramSubjects(program.id, subjects).map(subject => [
            subject,
            existing[subject] ?? curriculum[subject] ?? 0,
          ]),
        );
      }
      return next;
    });
    setProgramConsecutivePeriods(current => {
      const next = { ...current };
      for (const program of programs) {
        const existing = next[program.id] ?? {};
        const defaults = DEFAULT_CONSECUTIVE_PERIODS[program.id] ?? {};
        next[program.id] = Object.fromEntries(getProgramSubjects(program.id, subjects).map(subject => [
          subject,
          existing[subject] ?? defaults[subject] ?? 1,
        ]));
      }
      return next;
    });
    setProgramRoomIds(current => {
      const next = { ...current };
      for (const program of programs) {
        const existing = next[program.id] ?? {};
        next[program.id] = Object.fromEntries(getProgramSubjects(program.id, subjects).map(subject => [
          subject,
          existing[subject] ?? "",
        ]));
      }
      return next;
    });
  }, [programs, subjects]);

  const toggleLevel = (level: string) => setSelectedLevels(current =>
    current.includes(level) ? current.filter(l => l !== level) : [...current, level],
  );
  const toggleDay = (day: number) => setSelectedDays(current =>
    current.includes(day) ? current.filter(item => item !== day) : [...current, day].sort(),
  );

  const updateProgramTarget = (programId: string, subject: string, value: number) =>
    setProgramTargets(current => ({
      ...current,
      [programId]: { ...current[programId], [subject]: Math.max(0, value) },
    }));

  // ── Teacher availability ────────────────────────────────────────────────
  // Default: fully available. Only teachers with at least one cell marked
  // unavailable get a constraint sent to the backend.
  const [expandedTeacherId, setExpandedTeacherId] = useState<string | null>(null);
  const [teacherUnavailable, setTeacherUnavailable] = useState<Record<string, Set<string>>>({});

  const toggleTeacherSlot = (teacherId: string, day: number, period: number) => {
    setTeacherUnavailable(current => {
      const key = `${day}:${period}`;
      const set = new Set(current[teacherId] ?? []);
      if (set.has(key)) set.delete(key); else set.add(key);
      return { ...current, [teacherId]: set };
    });
  };

  // subject → teacherId (first qualified teacher, regardless of level)
  const teacherForSubject = useMemo(() => {
    const map: Record<string, string> = {};
    for (const t of teachers) {
      for (const subj of t.subjects) {
        if (!map[subj]) map[subj] = t.id;
      }
    }
    return map;
  }, [teachers]);

  const subjectsWithoutTeacher = useMemo(() => {
    const set = new Set<string>();
    const activeProgramIds = new Set(classes
      .filter(classe => selectedLevels.includes(getLevel(classe)))
      .map(classe => classPrograms[classe])
      .filter(Boolean));
    for (const programId of activeProgramIds) {
      for (const [subject, count] of Object.entries(programTargets[programId] ?? {})) {
        if (count > 0 && !teacherForSubject[subject]) set.add(subject);
      }
    }
    return [...set];
  }, [classes, classPrograms, programTargets, selectedLevels, teacherForSubject]);

  const selectedClasses = classes.filter(classe => selectedLevels.includes(getLevel(classe)));
  const classesWithoutProgram = selectedClasses.filter(classe => !classPrograms[classe]);
  const selectedProgramIds = [...new Set(selectedClasses.map(classe => classPrograms[classe]).filter(Boolean))];
  const programsWithNoSubjects = selectedProgramIds.filter(programId =>
    !Object.values(programTargets[programId] ?? {}).some(count => count > 0),
  );
  const activeProgramWeeklyTotal = Object.values(programTargets[activeProgramId] ?? {})
    .reduce((total, count) => total + count, 0);
  const overCapacityPrograms = selectedProgramIds.filter(programId =>
    Object.values(programTargets[programId] ?? {}).reduce((total, count) => total + count, 0) >
      selectedDays.length * Math.min(periods, maxDaily),
  );

  // Validation checks
  const hasEmptyFormFields = !selectedLevels.length || !selectedDays.length;
  const hasInvalidHourly = programsWithNoSubjects.length > 0 || overCapacityPrograms.length > 0;
  const canGenerate = !hasEmptyFormFields && !hasInvalidHourly && classesWithoutProgram.length === 0;

  const generate = async () => {
    const includedClasses = classes.filter(c => selectedLevels.includes(getLevel(c)));
    if (includedClasses.some(classe => !classPrograms[classe])) {
      toast({
        title: "حدد الشعبة لكل قسم",
        description: `اختر البرنامج الدراسي للأقسام: ${includedClasses.filter(classe => !classPrograms[classe]).join("، ")}`,
        variant: "destructive",
      });
      return;
    }
    const classesPayload = includedClasses.map(classe => {
      const programId = classPrograms[classe]!;
      const activeSubjects = Object.entries(programTargets[programId] ?? {})
        .filter(([, count]) => count > 0)
        .map(([subject, count]) => ({
          subject,
          periods: count,
          teacherId: teacherForSubject[subject] ?? null,
          consecutivePeriods: programConsecutivePeriods[programId]?.[subject] ?? 1,
          roomId: programRoomIds[programId]?.[subject] || null,
          requiredRoomType: programRoomIds[programId]?.[subject]
            ? undefined
            : DEFAULT_SUBJECT_ROOM_TYPES[programId]?.[subject],
        }));
      const pair = directedWorkPairs[programId];
      return {
        classe: getProgrammedClassName(classe, programId),
        subjects: activeSubjects,
        ...(pair?.subjectA && pair.subjectB && pair.subjectA !== pair.subjectB ? {
          directedWork: {
            subjectA: pair.subjectA,
            teacherA: teacherForSubject[pair.subjectA] ?? null,
            subjectB: pair.subjectB,
            teacherB: teacherForSubject[pair.subjectB] ?? null,
          },
        } : {}),
      };
    }).filter(entry => entry.subjects.length > 0);

    if (!classesPayload.length || !selectedDays.length || programsWithNoSubjects.length > 0 || overCapacityPrograms.length > 0) {
      toast({ title: "شروط ناقصة", description: "حدد حجماً ساعياً لمادة واحدة على الأقل في مستوى واحد على الأقل، ويوماً واحداً على الأقل", variant: "destructive" });
      return;
    }
    if (subjectsWithoutTeacher.length > 0) {
      toast({ title: "تنبيه", description: `لا يوجد أستاذ مطابق لـ: ${subjectsWithoutTeacher.join("، ")} — ستُجدول بدون أستاذ` });
    }

    const blockedSlots = blocked.split(/[\s,;]+/).filter(Boolean).map(value => {
      const [day, period] = value.split(":").map(Number);
      return { day, period };
    }).filter(slot => Number.isInteger(slot.day) && Number.isInteger(slot.period));

    // Invert "marked unavailable" cells into the allowed-slots list the
    // backend expects. Teachers with no marked cells are omitted entirely,
    // which the generator treats as "always available".
    const teacherAvailability: Record<string, Array<{ day: number; period: number }>> = {};
    for (const [teacherId, unavailable] of Object.entries(teacherUnavailable)) {
      if (unavailable.size === 0) continue;
      const allowed: Array<{ day: number; period: number }> = [];
      for (const day of selectedDays) {
        for (let period = 0; period < periods; period += 1) {
          if (!unavailable.has(`${day}:${period}`)) allowed.push({ day, period });
        }
      }
      teacherAvailability[teacherId] = allowed;
    }

    setGenerating(true);
    try {
      const res = await fetch(`${BASE}api/timetable/generate`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          annee,
          classes: classesPayload,
          roomIds,
          replace: true,
          rules: {
            workingDays: selectedDays,
            periodsPerDay: periods,
            maxDailyPeriodsPerClass: maxDaily,
            avoidConsecutiveSameSubject: spread,
            avoidSameSubjectAdjacentDays: spreadAcrossDays,
            preferHeavySubjectsEarly: preferHeavyEarly,
            avoidConsecutiveHeavySubjects: avoidHeavyConsecutive,
            minimizeTeacherGaps: minimizeGaps,
            roomTypes: Object.fromEntries(rooms.map(room => [room.id, room.type])),
            blockedSlots,
            ...(Object.keys(teacherAvailability).length > 0 ? { teacherAvailability } : {}),
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok && res.status !== 207) throw new Error(data.error ?? "فشل التوليد");
      
      const successMessage = data.unscheduled?.length > 0
        ? `✓ تم توليد ${data.generated?.length ?? 0} حصة. لم يتمكن النظام من جدولة ${data.unscheduled.length} حصة بسبب تعارضات`
        : `✓ تم توليد ${data.generated?.length ?? 0} حصة بنجاح!`;
      
      toast({
        title: "نجح التوليد",
        description: successMessage,
      });
      await onDone();
    } catch (error) {
      toast({ 
        title: "فشل التوليد", 
        description: error instanceof Error ? error.message : "تعذر إنشاء الجدول. تحقق من الشروط وحاول مجدداً",
        variant: "destructive" 
      });
    } finally { setGenerating(false); }
  };

  return (
    <Card className="border-cyan-200 dark:border-cyan-900">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-bold">توليد جدول شامل لكل الأقسام والمستويات</h2>
            <p className="text-xs text-muted-foreground">سيتم استبدال جدول السنة {annee} لكل الأقسام المختارة أدناه، بشكل متناسق (بدون تعارض أستاذ أو قاعة بين الأقسام)</p>
          </div>
          <button onClick={onClose} aria-label="إغلاق"><X className="w-4 h-4" /></button>
        </div>

        {/* Levels */}
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-muted-foreground">المستويات المشمولة بالتوليد</label>
          <div className="flex flex-wrap gap-2">
            {levels.map(level => (
              <button key={level} onClick={() => toggleLevel(level)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold border ${selectedLevels.includes(level) ? "bg-cyan-500 text-white border-cyan-500" : "bg-background"}`}>
                {level} ({classes.filter(c => getLevel(c) === level).length} أقسام)
              </button>
            ))}
          </div>
        </div>

        {/* Global rules */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <label>حصص/يوم<input type="number" min="1" max="10" value={periods} onChange={e => setPeriods(Number(e.target.value) || 1)} className="mt-1 w-full rounded-lg border px-2 py-1.5 bg-background" /></label>
          <label>الحد الأقصى للقسم/يوم<input type="number" min="1" max="10" value={maxDaily} onChange={e => setMaxDaily(Number(e.target.value) || 1)} className="mt-1 w-full rounded-lg border px-2 py-1.5 bg-background" /></label>
          <label className="col-span-2">خانات ممنوعة على الجميع (اليوم:الحصة)<input value={blocked} onChange={e => setBlocked(e.target.value)} placeholder="0:5, 2:0" className="mt-1 w-full rounded-lg border px-2 py-1.5 bg-background" dir="ltr" /></label>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="font-semibold">أيام العمل:</span>
          {["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس"].map((day, index) => <label key={day} className="flex items-center gap-1"><input type="checkbox" checked={selectedDays.includes(index)} onChange={() => toggleDay(index)} />{day}</label>)}
          <label className="flex items-center gap-1 ms-auto"><input type="checkbox" checked={spread} onChange={e => setSpread(e.target.checked)} />تجنب تكرار المادة متتالياً</label>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs">
          <label className="flex items-center gap-1"><input type="checkbox" checked={preferHeavyEarly} onChange={e => setPreferHeavyEarly(e.target.checked)} />تفضيل المواد الثقيلة صباحاً</label>
          <label className="flex items-center gap-1"><input type="checkbox" checked={avoidHeavyConsecutive} onChange={e => setAvoidHeavyConsecutive(e.target.checked)} />تجنب مادتين ثقيلتين متتاليتين</label>
          <label className="flex items-center gap-1"><input type="checkbox" checked={spreadAcrossDays} onChange={e => setSpreadAcrossDays(e.target.checked)} />توزيع المادة على أيام متباعدة</label>
          <label className="flex items-center gap-1"><input type="checkbox" checked={minimizeGaps} onChange={e => setMinimizeGaps(e.target.checked)} />تقليل فراغات الأساتذة</label>
        </div>

        {selectedClasses.some(classe => !getLevel(classe).endsWith("AM")) && (
          <div className="space-y-2 rounded-lg border p-3">
            <label className="block text-xs font-semibold text-muted-foreground">الشعبة لكل قسم ثانوي</label>
            <div className="grid gap-2 sm:grid-cols-2">
              {selectedClasses.filter(classe => !getLevel(classe).endsWith("AM")).map(classe => (
                <label key={classe} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate" title={classe}>{classe}</span>
                  <select
                    value={classPrograms[classe] ?? ""}
                    onChange={event => setClassPrograms(current => ({ ...current, [classe]: event.target.value }))}
                    className="max-w-56 rounded border px-2 py-1.5 bg-background"
                  >
                    <option value="">اختر الشعبة</option>
                    {programs.filter(program => program.level === getLevel(classe)).map(program => (
                      <option key={program.id} value={program.id}>{program.label}</option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            {classesWithoutProgram.length > 0 && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400">
                اختر الشعبة للأقسام: {classesWithoutProgram.join("، ")}
              </p>
            )}
          </div>
        )}

        {/* Per-program curriculum */}
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-muted-foreground">المنهاج حسب المستوى والشعبة (حصة/أسبوع)</label>
          <div className="flex gap-1 p-1 bg-muted/50 rounded-lg w-fit flex-wrap">
            {programs.map(program => (
              <button key={program.id} onClick={() => setActiveProgramId(program.id)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  activeProgramId === program.id ? "bg-background shadow-sm" : "text-muted-foreground"
                } ${programsWithNoSubjects.includes(program.id) ? "ring-1 ring-amber-400" : ""}`}>
                {program.label}
              </button>
            ))}
          </div>
          {activeProgramId && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 max-h-40 overflow-y-auto border rounded-lg p-2">
                {getProgramSubjects(activeProgramId, subjects).map(subject => {
                  const target = programTargets[activeProgramId]?.[subject] ?? 0;
                  const missingTeacher = target > 0 && !teacherForSubject[subject];
                  const defaultRoomType = DEFAULT_SUBJECT_ROOM_TYPES[activeProgramId]?.[subject];
                  const requiresConsecutivePair = subject.includes("الاستدراك") || subject.includes("البدنية");
                  return (
                    <div key={subject} className="text-xs flex items-center gap-2 min-w-0">
                      <span className={`truncate flex-1 ${missingTeacher ? "text-amber-600 dark:text-amber-400" : ""}`} title={missingTeacher ? "لا يوجد أستاذ مطابق" : undefined}>
                        {subject}{missingTeacher && " ⚠️"}
                      </span>
                      <input type="number" min="0" max="30" value={target}
                        onChange={e => updateProgramTarget(activeProgramId, subject, Number(e.target.value) || 0)}
                        className="w-14 rounded border px-1.5 py-1 bg-background" />
                      <select
                        aria-label={`قاعة ${subject}`}
                        value={programRoomIds[activeProgramId]?.[subject] ?? ""}
                        onChange={event => setProgramRoomIds(current => ({
                          ...current,
                          [activeProgramId]: { ...current[activeProgramId], [subject]: event.target.value },
                        }))}
                        className="max-w-24 rounded border px-1 py-1 bg-background"
                        title="تحديد قاعة المادة أو ترك الاختيار تلقائياً"
                      >
                        <option value="">{defaultRoomType ? `تلقائي (${ROOM_TYPES[defaultRoomType]?.label ?? defaultRoomType})` : "قاعة تلقائية"}</option>
                        {rooms.map(room => (
                          <option key={room.id} value={room.id}>{room.name} ({ROOM_TYPES[room.type]?.label ?? room.type})</option>
                        ))}
                      </select>
                      <select
                        aria-label={`مدة حصة ${subject}`}
                        value={requiresConsecutivePair ? 2 : programConsecutivePeriods[activeProgramId]?.[subject] ?? 1}
                        onChange={event => setProgramConsecutivePeriods(current => ({
                          ...current,
                          [activeProgramId]: { ...current[activeProgramId], [subject]: Number(event.target.value) },
                        }))}
                        className="w-16 rounded border px-1 py-1 bg-background"
                        title="عدد الحصص المتتالية عند تجميع هذه المادة"
                      >
                        <option value={1} disabled={requiresConsecutivePair}>مفردة</option>
                        <option value={2}>مزدوجة</option>
                      </select>
                    </div>
                  );
                })}
              </div>
              <p className="text-[11px] text-muted-foreground">
                مجموع {programs.find(program => program.id === activeProgramId)?.label}: {activeProgramWeeklyTotal} حصة أسبوعياً من أصل {selectedDays.length * Math.min(periods, maxDaily)} متاحة.
                القوالب مبنية على مواد ملفات التحليل، وساعات الشعب التي لم يحدد لها حجم ساعي موثوق تبدأ بصفر؛ أدخل الحجم الرسمي قبل التوليد.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-lg border p-2">
                <p className="sm:col-span-2 text-xs font-semibold">الأعمال الموجّهة: حصتان متتاليتان بالتناوب أسبوعاً بعد أسبوع (اختياري)</p>
                {["subjectA", "subjectB"].map((key, index) => {
                  const pair = directedWorkPairs[activeProgramId] ?? { subjectA: "", subjectB: "" };
                  const field = key as "subjectA" | "subjectB";
                  const other = field === "subjectA" ? "subjectB" : "subjectA";
                  return (
                    <label key={key} className="text-xs">
                      {index === 0 ? "مادة أسبوع أ" : "مادة أسبوع ب"}
                      <select
                        value={pair[field]}
                        onChange={event => setDirectedWorkPairs(current => ({
                          ...current,
                          [activeProgramId]: { ...pair, [field]: event.target.value },
                        }))}
                        className="mt-1 w-full rounded border px-2 py-1.5 bg-background"
                      >
                        <option value="">بدون أعمال موجّهة</option>
                        {getProgramSubjects(activeProgramId, subjects).filter(subject => subject !== pair[other])
                          .map(subject => <option key={subject} value={subject}>{subject}</option>)}
                      </select>
                    </label>
                  );
                })}
              </div>
            </>
          )}
          {programsWithNoSubjects.length > 0 && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400">
              أدخل الحجم الساعي للشعب المختارة قبل التوليد: {programsWithNoSubjects.map(id => programs.find(program => program.id === id)?.label ?? id).join("، ")}
            </p>
          )}
        </div>

        {/* Teacher availability — "director's instructions" per teacher */}
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-muted-foreground">توفر الأساتذة (تعليمات المدير الخاصة بكل أستاذ)</label>
          <div className="border rounded-lg divide-y max-h-52 overflow-y-auto">
            {teachers.map(t => {
              const unavailable = teacherUnavailable[t.id] ?? new Set<string>();
              const isExpanded = expandedTeacherId === t.id;
              return (
                <div key={t.id}>
                  <button onClick={() => setExpandedTeacherId(isExpanded ? null : t.id)}
                    className="w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-muted/30">
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: t.color }} />
                      {t.name}
                      {unavailable.size > 0 && <span className="text-amber-600 dark:text-amber-400">({unavailable.size} خانة محظورة)</span>}
                    </span>
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                  </button>
                  {isExpanded && (
                    <div className="p-2 bg-muted/20 overflow-x-auto">
                      <table className="text-[10px] border-collapse mx-auto">
                        <thead>
                          <tr>
                            <th className="px-1"></th>
                            {selectedDays.map(day => <th key={day} className="px-1.5 py-1 font-semibold">{DAYS_AR[day]}</th>)}
                          </tr>
                        </thead>
                        <tbody>
                          {Array.from({ length: periods }, (_, period) => (
                            <tr key={period}>
                              <td className="px-1 font-semibold text-muted-foreground">{PERIODS[period]?.label ?? period + 1}</td>
                              {selectedDays.map(day => {
                                const key = `${day}:${period}`;
                                const isUnavailable = unavailable.has(key);
                                return (
                                  <td key={day} className="p-0.5">
                                    <button onClick={() => toggleTeacherSlot(t.id, day, period)}
                                      className={`w-6 h-6 rounded ${isUnavailable ? "bg-red-400 dark:bg-red-700" : "bg-emerald-200 dark:bg-emerald-900"}`}
                                      title={isUnavailable ? "غير متاح" : "متاح"} />
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <p className="text-[10px] text-muted-foreground text-center mt-1">اضغط لتبديل: أخضر = متاح، أحمر = غير متاح</p>
                    </div>
                  )}
                </div>
              );
            })}
            {teachers.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">لا يوجد أساتذة مضافون بعد</p>
            )}
          </div>
        </div>

        {subjectsWithoutTeacher.length > 0 && (
          <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200/50 text-amber-700 dark:text-amber-400 text-xs">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>لا يوجد أستاذ مطابق لـ: {subjectsWithoutTeacher.join("، ")} عبر كل المستويات — تحقق من صفحة الأساتذة أو ستُجدول الحصص بدون أستاذ</span>
          </div>
        )}

        {hasEmptyFormFields && (
          <div className="text-[12px] text-amber-600 dark:text-amber-400 flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200/50">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>يجب اختيار مستوى واحد على الأقل ويوم واحد على الأقل</span>
          </div>
        )}

        {hasInvalidHourly && (
          <div className="text-[12px] text-amber-600 dark:text-amber-400 flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200/50">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>{overCapacityPrograms.length
              ? `الحجم الساعي يتجاوز السعة المتاحة للشعب: ${overCapacityPrograms.map(id => programs.find(program => program.id === id)?.label ?? id).join("، ")}`
              : "كل شعبة مختارة يجب أن تحتوي على مادة واحدة على الأقل مع حصص"}</span>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={generating}>إلغاء</Button>
          <Button 
            size="sm" 
            onClick={generate} 
            disabled={generating || !canGenerate}
            className="gap-2"
            title={!canGenerate ? "تحقق من الشروط المطلوبة أعلاه" : ""}
          >
            {generating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> جارٍ التوليد...
              </>
            ) : (
              <>
                <Wand2 className="w-4 h-4" /> توليد الجدول
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
type Tab = "teachers" | "rooms" | "schedule" | "print" | "hourly";

export default function TimetablePage() {
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("schedule");

  // Data
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [rooms,    setRooms]    = useState<Room[]>([]);
  const [slots,    setSlots]    = useState<Slot[]>([]);
  const [classes,  setClasses]  = useState<string[]>([]);
  const [availableSubjects, setAvailableSubjects] = useState<string[]>(DEFAULT_SUBJECTS);
  const [conflictIds, setConflictIds] = useState<Set<string>>(new Set());

  // Filters
  const [annee,       setAnnee]       = useState("2026-2027");
  const [activeClasse, setActiveClasse] = useState("");
  const [generatorOpen, setGeneratorOpen] = useState(false);
  const [quickGenerating, setQuickGenerating] = useState(false);

  // Loading
  const [loadingTeachers, setLoadingTeachers] = useState(false);
  const [loadingRooms,    setLoadingRooms]    = useState(false);
  const [loadingSlots,    setLoadingSlots]    = useState(false);

  // Modal for slot editing
  const [slotModal, setSlotModal] = useState<{
    day: number; period: number; slot?: Slot;
  } | null>(null);

  // ── Fetch helpers ─────────────────────────────────────────────────────────────
  const fetchTeachers = useCallback(async () => {
    setLoadingTeachers(true);
    try {
      const res = await fetch(`${BASE}api/timetable/teachers`, { credentials: "include" });
      if (res.ok) {
        const loadedTeachers: Teacher[] = await res.json();
        setTeachers(loadedTeachers);
        setAvailableSubjects(current => [...new Set([
          ...DEFAULT_SUBJECTS,
          ...current,
          ...loadedTeachers.flatMap(teacher => teacher.subjects).filter(Boolean),
        ])]);
      }
    } finally { setLoadingTeachers(false); }
  }, []);

  const fetchRooms = useCallback(async () => {
    setLoadingRooms(true);
    try {
      const res = await fetch(`${BASE}api/timetable/rooms`, { credentials: "include" });
      if (res.ok) setRooms(await res.json());
    } finally { setLoadingRooms(false); }
  }, []);

  const fetchClasses = useCallback(async () => {
    const res = await fetch(`${BASE}api/timetable/classes?annee=${encodeURIComponent(annee)}`, { credentials: "include" });
    if (res.ok) {
      const list: string[] = await res.json();
      setClasses(list);
      setActiveClasse(current => list.includes(current) ? current : list[0] ?? "");
    }
  }, [annee, activeClasse]);

  const fetchSlots = useCallback(async (classe = activeClasse) => {
    if (!classe) return;
    setLoadingSlots(true);
    try {
      const res = await fetch(`${BASE}api/timetable/slots?annee=${encodeURIComponent(annee)}&classe=${encodeURIComponent(classe)}`, { credentials: "include" });
      if (res.ok) {
        const loadedSlots: Slot[] = await res.json();
        setSlots(loadedSlots);
        setAvailableSubjects(current => [...new Set([
          ...DEFAULT_SUBJECTS,
          ...current,
          ...loadedSlots.map(slot => slot.subject).filter(Boolean),
        ])]);
      }
      // Fetch conflicts
      const cr = await fetch(`${BASE}api/timetable/conflicts?annee=${encodeURIComponent(annee)}`, { credentials: "include" });
      if (cr.ok) {
        const cd = await cr.json();
        setConflictIds(new Set(cd.conflictingSlotIds as string[]));
      }
    } finally { setLoadingSlots(false); }
  }, [annee, activeClasse]);

  const generateAllTimetables = async () => {
    if (!classes.length) return;
    const unsupportedClasses = classes.filter(classe => !DEFAULT_WEEKLY_PERIODS[getLevel(classe)]);
    if (unsupportedClasses.length > 0) {
      toast({
        title: "تحتاج هذه الأقسام إلى منهاج مخصص",
        description: `التوليد السريع مخصص للمتوسط (1AM إلى 4AM). اختر الشعبة واضبط حجمها الساعي من تخصيص التوليد: ${unsupportedClasses.join("، ")}`,
        variant: "destructive",
      });
      return;
    }
    try {
      const existingResponse = await fetch(`${BASE}api/timetable/slots?annee=${encodeURIComponent(annee)}`, { credentials: "include" });
      const existingSlots: Slot[] = existingResponse.ok ? await existingResponse.json() : [];
      if (existingSlots.length > 0 && !window.confirm(`سيتم استبدال ${existingSlots.length} حصة موجودة في جداول سنة ${annee}. هل تريد المتابعة؟`)) return;

      const classesPayload = classes.map(classe => {
        const level = getLevel(classe);
        const curriculum = DEFAULT_WEEKLY_PERIODS[level]!;
        return {
          classe,
          subjects: Object.entries(curriculum).map(([subject, periods]) => ({
            subject,
            periods,
            teacherId: teachers.find(teacher => teacher.subjects.includes(subject))?.id ?? null,
            consecutivePeriods: DEFAULT_CONSECUTIVE_PERIODS[level]?.[subject] ?? 1,
            requiredRoomType: DEFAULT_SUBJECT_ROOM_TYPES[level]?.[subject],
          })),
        };
      });
      const unassignedLessons = classesPayload.reduce((count, entry) =>
        count + entry.subjects.filter(subject => !subject.teacherId).length,
      0);

      setQuickGenerating(true);
      const response = await fetch(`${BASE}api/timetable/generate`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          annee,
          classes: classesPayload,
          roomIds: rooms.map(room => room.id),
          replace: true,
          rules: {
            workingDays: [0, 1, 2, 3, 4],
            periodsPerDay: 6,
            maxDailyPeriodsPerClass: 6,
            avoidConsecutiveSameSubject: true,
            preferHeavySubjectsEarly: true,
            avoidConsecutiveHeavySubjects: true,
            minimizeTeacherGaps: true,
            roomTypes: Object.fromEntries(rooms.map(room => [room.id, room.type])),
          },
        }),
      });
      const result = await response.json().catch(() => ({})) as { error?: string; generated?: Slot[]; unscheduled?: unknown[] };
      if (!response.ok && response.status !== 207) throw new Error(result.error ?? "تعذر توليد الجداول");
      const unscheduledCount = result.unscheduled?.length ?? 0;
      toast({
        title: unscheduledCount ? "تم التوليد مع حصص غير مجدولة" : "تم توليد الجداول",
        description: `تم إنشاء ${result.generated?.length ?? 0} حصة لـ ${classes.length} قسم${unscheduledCount ? `، وتعذر جدولة ${unscheduledCount} حصة بسبب القيود` : ""}${unassignedLessons ? `، وهناك ${unassignedLessons} نوع مادة بلا أستاذ مطابق` : ""}. راجع الجدول وأكمل التعديلات عند الحاجة.`,
        variant: unscheduledCount ? "destructive" : "default",
      });
      await fetchClasses();
      await fetchSlots();
    } catch (error) {
      toast({ title: "فشل توليد الجداول", description: error instanceof Error ? error.message : "تعذر الاتصال بالخادم", variant: "destructive" });
    } finally {
      setQuickGenerating(false);
    }
  };

  useEffect(() => { fetchTeachers(); fetchRooms(); fetchClasses(); }, []);
  useEffect(() => { fetchClasses(); }, [annee]);
  useEffect(() => { fetchSlots(); }, [activeClasse, annee]);

  // ── Slot helpers ──────────────────────────────────────────────────────────────
  const getSlot = (day: number, period: number) =>
    slots.find(s => s.day === day && s.period === period) ?? null;

  const deleteSlot = async (id: string) => {
    await fetch(`${BASE}api/timetable/slots/${id}`, { method: "DELETE", credentials: "include" });
    setSlots(p => p.filter(s => s.id !== id));
    setTimeout(fetchSlots, 300);
  };

  // ── Drag-and-drop for grid cells ──────────────────────────────────────────────
  const dragSlot = useRef<Slot | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);

  const onCellDrop = async (day: number, period: number) => {
    setDragOver(null);
    const src = dragSlot.current;
    if (!src || (src.day === day && src.period === period)) return;
    // Move slot to new cell (if empty)
    if (getSlot(day, period)) { toast({ title: "الخلية مشغولة", variant: "destructive" }); return; }
    const res = await fetch(`${BASE}api/timetable/slots/${src.id}`, {
      method: "PUT", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ day, period }),
    });
    if (res.ok) {
      setSlots(p => p.map(s => s.id === src.id ? { ...s, day, period } : s));
      setTimeout(fetchSlots, 300);
    }
    dragSlot.current = null;
  };

  // ── Render ────────────────────────────────────────────────────────────────────
  const tabs: { id: Tab; label: string; icon: typeof Calendar }[] = [
    { id: "schedule", label: "جدول الأوقات",   icon: Grid3X3 },
    { id: "teachers", label: "الأساتذة",       icon: Users },
    { id: "rooms",    label: "القاعات والمخابر", icon: Building2 },
    { id: "hourly",   label: "الحجم الساعي",   icon: BookMarked },
    { id: "print",    label: "طباعة",           icon: Printer },
  ];

  return (
    <motion.div className="p-4 md:p-6 max-w-7xl mx-auto space-y-5"
      initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>

      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/30 shrink-0">
          <Calendar className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-extrabold">جدول الأوقات وتنظيم الأساتذة</h1>
          <p className="text-xs text-muted-foreground mt-0.5">بناء الجداول الزمنية، توزيع الأساتذة والقاعات، كشف التعارضات</p>
        </div>
        <div className="ms-auto">
          <select value={annee} onChange={e => setAnnee(e.target.value)}
            className="text-xs px-2.5 py-1.5 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-cyan-500/30">
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-muted/50 rounded-xl w-fit">
        {tabs.map(t => (
          <motion.button key={t.id} onClick={() => setTab(t.id)}
            whileTap={{ scale: 0.96 }}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
              tab === t.id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}>
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
          </motion.button>
        ))}
      </div>

      {/* ── SCHEDULE TAB ────────────────────────────────────────────────────────── */}
      {tab === "schedule" && (
        <div className="space-y-4">
          {/* Class selector */}
          {classes.length > 0 ? (
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-xs text-muted-foreground font-semibold">القسم:</span>
              {classes.map(cls => (
                <motion.button key={cls} onClick={() => setActiveClasse(cls)}
                  whileTap={{ scale: 0.95 }}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                    activeClasse === cls
                      ? "bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-sm"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}>
                  {cls}
                </motion.button>
              ))}
              <div className="ms-auto flex flex-wrap gap-2">
                {classes.every(classe => getLevel(classe).endsWith("AM")) && (
                  <Button size="sm" onClick={generateAllTimetables} disabled={quickGenerating || loadingTeachers || loadingRooms} className="gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white border-0">
                    {quickGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                    {quickGenerating ? "جارٍ توليد كل الأقسام…" : "توليد كل الجداول بضغطة"}
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => setGeneratorOpen(true)} className="gap-2">
                  <Calendar className="w-4 h-4" /> تخصيص التوليد
                </Button>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200/50 text-amber-700 dark:text-amber-400 text-sm flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              لا توجد أقسام لهذه السنة. استورد بيانات التلاميذ أولاً.
            </div>
          )}

          {generatorOpen && (
            <TimetableGeneratorPanel
              classes={classes}
              subjects={availableSubjects}
              roomIds={rooms.map(room => room.id)}
              rooms={rooms}
              teachers={teachers}
              annee={annee}
              onClose={() => setGeneratorOpen(false)}
              onDone={async () => { setGeneratorOpen(false); await fetchClasses(); await fetchSlots(); }}
            />
          )}

          {/* Conflict badge */}
          {conflictIds.size > 0 && (
            <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-200/50">
              <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
              <span className="text-sm text-red-700 dark:text-red-400 font-medium">
                تعارض مكتشف: {conflictIds.size} حصص متعارضة (أستاذ أو قاعة مزدوجة)
              </span>
            </motion.div>
          )}

          {/* Grid */}
          {activeClasse && (
            <div className="overflow-x-auto rounded-2xl border shadow-md bg-card">
              {loadingSlots ? (
                <div className="flex items-center justify-center h-48">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <table className="w-full min-w-[600px] border-collapse">
                  <thead>
                    <tr>
                      <th className="w-20 px-3 py-2 text-xs font-bold text-muted-foreground bg-muted/40 border-b">الحصة</th>
                      {DAYS_AR.map((d, i) => (
                        <th key={i} className="px-2 py-2 text-xs font-bold text-center bg-muted/40 border-b border-s">
                          <div className="text-foreground">{d}</div>
                          <div className="text-[9px] text-muted-foreground font-normal">{DAYS_EN[i]}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {PERIODS.map((p, pi) => (
                      <tr key={pi} className="border-b last:border-0">
                        <td className="px-3 py-1.5 bg-muted/20 border-e">
                          <div className="text-xs font-bold text-muted-foreground">{p.label}</div>
                          <div className="text-[9px] text-muted-foreground/60">{p.time}</div>
                        </td>
                        {DAYS_AR.map((_, di) => {
                          const slot = getSlot(di, pi);
                          const hasConflict = slot ? conflictIds.has(slot.id) : false;
                          const teacher = slot?.teacherId ? teachers.find(t => t.id === slot.teacherId) : null;
                          const alternateTeacher = slot?.alternateTeacherId ? teachers.find(t => t.id === slot.alternateTeacherId) : null;
                          const room    = slot?.roomId    ? rooms.find(r => r.id === slot.roomId) : null;
                          const cellKey = `${di}:${pi}`;
                          return (
                            <td key={di}
                              className={`border-s p-1 align-top min-w-[110px] transition-colors ${
                                dragOver === cellKey ? "bg-cyan-50 dark:bg-cyan-950/20" : "hover:bg-muted/30"
                              }`}
                              onDragOver={e => { e.preventDefault(); setDragOver(cellKey); }}
                              onDragLeave={() => setDragOver(d => d === cellKey ? null : d)}
                              onDrop={() => onCellDrop(di, pi)}
                            >
                              {slot ? (
                                <motion.div
                                  draggable
                                  onDragStart={() => { dragSlot.current = slot; }}
                                  initial={{ opacity: 0, scale: 0.9 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  className={`rounded-lg p-1.5 cursor-grab active:cursor-grabbing relative group select-none ${
                                    hasConflict
                                      ? "bg-red-50 dark:bg-red-950/30 border border-red-300 dark:border-red-700"
                                      : "border"
                                  }`}
                                  style={!hasConflict && teacher ? {
                                    backgroundColor: `${teacher.color}18`,
                                    borderColor: `${teacher.color}50`,
                                  } : {}}
                                  onClick={() => setSlotModal({ day: di, period: pi, slot })}
                                >
                                  {hasConflict && (
                                    <AlertTriangle className="w-3 h-3 text-red-500 absolute top-1 end-1" />
                                  )}
                                  <p className="text-[11px] font-bold leading-tight truncate">{slot.subject}</p>
                                  {slot.alternateSubject && (
                                    <p className="text-[9px] font-semibold text-cyan-700 dark:text-cyan-300 truncate">أسبوع ب: {slot.alternateSubject}</p>
                                  )}
                                  {teacher && (
                                    <p className="text-[9px] truncate mt-0.5" style={{ color: teacher.color }}>
                                      {teacher.name}
                                    </p>
                                  )}
                                  {alternateTeacher && (
                                    <p className="text-[9px] truncate mt-0.5" style={{ color: alternateTeacher.color }}>
                                      {alternateTeacher.name} (أسبوع ب)
                                    </p>
                                  )}
                                  {room && (
                                    <p className="text-[9px] text-muted-foreground truncate">
                                      {ROOM_TYPES[room.type]?.icon} {room.name}
                                    </p>
                                  )}
                                  <button
                                    onClick={e => { e.stopPropagation(); deleteSlot(slot.id); }}
                                    className="absolute top-0.5 start-0.5 w-4 h-4 rounded flex items-center justify-center bg-red-500 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                                  >
                                    <X className="w-2.5 h-2.5" />
                                  </button>
                                </motion.div>
                              ) : (
                                <motion.button
                                  whileHover={{ scale: 1.05 }}
                                  onClick={() => setSlotModal({ day: di, period: pi })}
                                  className="w-full h-14 rounded-lg border border-dashed border-muted-foreground/20 text-muted-foreground/40 hover:text-muted-foreground hover:border-muted-foreground/40 transition-all flex items-center justify-center"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                </motion.button>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── TEACHERS TAB ────────────────────────────────────────────────────────── */}
      {tab === "teachers" && (
        <TeachersPanel
          teachers={teachers} loading={loadingTeachers}
          onRefresh={fetchTeachers}
          toast={toast}
        />
      )}

      {/* ── ROOMS TAB ───────────────────────────────────────────────────────────── */}
      {tab === "rooms" && (
        <RoomsPanel
          rooms={rooms} loading={loadingRooms}
          onRefresh={fetchRooms}
          toast={toast}
        />
      )}

      {/* ── HOURLY VOLUME TAB ───────────────────────────────────────────────────── */}
      {tab === "hourly" && (
        <HourlyVolumePanel slots={slots} classes={classes} annee={annee} onFetchSlots={fetchSlots} />
      )}

      {/* ── PRINT TAB ───────────────────────────────────────────────────────────── */}
      {tab === "print" && (
        <PrintPanel
          classes={classes} annee={annee}
          teachers={teachers} rooms={rooms} slots={slots}
          activeClasse={activeClasse}
          onClassChange={setActiveClasse}
          onFetchSlots={fetchSlots}
        />
      )}

      {/* ── SLOT MODAL ──────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {slotModal && (
          <SlotModal
            day={slotModal.day}
            period={slotModal.period}
            slot={slotModal.slot}
            classe={activeClasse}
            annee={annee}
            teachers={teachers}
            rooms={rooms}
            subjects={availableSubjects}
            onClose={() => setSlotModal(null)}
            onSave={async (data) => {
              const method = slotModal.slot ? "PUT" : "POST";
              const url = slotModal.slot
                ? `${BASE}api/timetable/slots/${slotModal.slot.id}`
                : `${BASE}api/timetable/slots`;
              const res = await fetch(url, {
                method, credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  ...data, classe: activeClasse, annee,
                  day: slotModal.day, period: slotModal.period,
                }),
              });
              if (res.ok) {
                const saved: Slot = await res.json();
                setSlots(p => slotModal.slot
                  ? p.map(s => s.id === saved.id ? saved : s)
                  : [...p, saved]
                );
                setSlotModal(null);
                setTimeout(fetchSlots, 300);
              } else {
                const err = await res.json();
                toast({ title: "خطأ", description: err.error ?? "فشل الحفظ", variant: "destructive" });
              }
            }}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Teachers Panel ────────────────────────────────────────────────────────────
function TeachersPanel({ teachers, loading, onRefresh, toast }: {
  teachers: Teacher[]; loading: boolean;
  onRefresh: () => void;
  toast: any;
}) {
  const [form, setForm] = useState({ name: "", subjects: "" as string, phone: "", color: TEACHER_COLORS[0]! });
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const save = async () => {
    if (!form.name.trim()) { toast({ title: "الاسم مطلوب", variant: "destructive" }); return; }
    const subjectList = form.subjects.split(",").map(s => s.trim()).filter(Boolean);
    if (!subjectList.length) { toast({ title: "المواد مطلوبة", description: "يرجى إدخال مواد الأستاذ قبل الحفظ", variant: "destructive" }); return; }
    setSaving(true);
    const body = {
      name: form.name.trim(),
      subjects: subjectList,
      phone: form.phone.trim() || undefined,
      color: form.color,
    };
    const res = await fetch(
      editId ? `${BASE}api/timetable/teachers/${editId}` : `${BASE}api/timetable/teachers`,
      { method: editId ? "PATCH" : "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
    );
    setSaving(false);
    if (res.ok) {
      setForm({ name: "", subjects: "", phone: "", color: TEACHER_COLORS[0]! });
      setEditId(null);
      onRefresh();
    } else {
      toast({ title: "خطأ", description: "فشل الحفظ", variant: "destructive" });
    }
  };

  const del = async (id: string) => {
    await fetch(`${BASE}api/timetable/teachers/${id}`, { method: "DELETE", credentials: "include" });
    onRefresh();
  };

  const startEdit = (t: Teacher) => {
    setEditId(t.id);
    setForm({ name: t.name, subjects: t.subjects.join(", "), phone: t.phone ?? "", color: t.color });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      {/* Form */}
      <Card className="border-0 shadow-md overflow-hidden lg:col-span-1">
        <div className="bg-gradient-to-br from-violet-500 to-purple-700 px-4 py-3 flex items-center gap-2">
          <Users className="w-4 h-4 text-white/80" />
          <h2 className="text-white font-bold text-sm">{editId ? "تعديل أستاذ" : "إضافة أستاذ"}</h2>
        </div>
        <CardContent className="pt-4 pb-5 space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">الاسم الكامل *</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="مثال: أ. أحمد بلحوت"
              className="w-full text-sm px-3 py-2 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-violet-500/30" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">مواد الأستاذ (مطلوبة)</label>
            <input value={form.subjects} onChange={e => setForm(f => ({ ...f, subjects: e.target.value }))}
              placeholder="مثال: الرياضيات، العلوم، اللغة العربية"
              className="w-full text-sm px-3 py-2 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-violet-500/30" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">رقم الهاتف (اختياري)</label>
            <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
              placeholder="0555 000 000"
              className="w-full text-sm px-3 py-2 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-violet-500/30" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">لون الأستاذ في الجدول</label>
            <div className="flex flex-wrap gap-1.5">
              {TEACHER_COLORS.map(c => (
                <button key={c} onClick={() => setForm(f => ({ ...f, color: c }))}
                  className={`w-6 h-6 rounded-full transition-transform ${form.color === c ? "scale-125 ring-2 ring-offset-1 ring-current" : "hover:scale-110"}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            {editId && (
              <Button variant="outline" size="sm" className="flex-1" onClick={() => { setEditId(null); setForm({ name: "", subjects: "", phone: "", color: TEACHER_COLORS[0]! }); }}>
                إلغاء
              </Button>
            )}
            <motion.button onClick={save} disabled={saving}
              whileHover={{ scale: saving ? 1 : 1.01 }} whileTap={{ scale: saving ? 1 : 0.97 }}
              className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-gradient-to-r from-violet-500 to-purple-600 text-white text-sm font-bold disabled:opacity-60">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {editId ? "تحديث" : "إضافة"}
            </motion.button>
          </div>
        </CardContent>
      </Card>

      {/* List */}
      <Card className="border-0 shadow-md lg:col-span-2">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center h-32"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : teachers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground text-sm gap-2">
              <Users className="w-8 h-8 opacity-30" />
              لا يوجد أساتذة مضافون بعد
            </div>
          ) : (
            <div className="divide-y">
              {teachers.map((t, i) => (
                <motion.div key={t.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-colors">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                    style={{ backgroundColor: t.color }}>
                    {t.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{t.name}</p>
                    {t.subjects.length > 0 && (
                      <p className="text-xs text-muted-foreground truncate">{t.subjects.join(" · ")}</p>
                    )}
                    {t.phone && <p className="text-xs text-muted-foreground">{t.phone}</p>}
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground" onClick={() => startEdit(t)}>
                      <Edit3 className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-red-500" onClick={() => del(t.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Rooms Panel ───────────────────────────────────────────────────────────────
function RoomsPanel({ rooms, loading, onRefresh, toast }: {
  rooms: Room[]; loading: boolean; onRefresh: () => void; toast: any;
}) {
  const [form, setForm] = useState({ name: "", type: "classroom", capacity: "" });
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const save = async () => {
    if (!form.name.trim()) { toast({ title: "الاسم مطلوب", variant: "destructive" }); return; }
    setSaving(true);
    const body = { name: form.name.trim(), type: form.type, capacity: form.capacity ? +form.capacity : undefined };
    const res = await fetch(
      editId ? `${BASE}api/timetable/rooms/${editId}` : `${BASE}api/timetable/rooms`,
      { method: editId ? "PATCH" : "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
    );
    setSaving(false);
    if (res.ok) { setForm({ name: "", type: "classroom", capacity: "" }); setEditId(null); onRefresh(); }
    else toast({ title: "خطأ", variant: "destructive" });
  };

  const del = async (id: string) => {
    await fetch(`${BASE}api/timetable/rooms/${id}`, { method: "DELETE", credentials: "include" });
    onRefresh();
  };

  const startEdit = (r: Room) => {
    setEditId(r.id);
    setForm({ name: r.name, type: r.type, capacity: r.capacity?.toString() ?? "" });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <Card className="border-0 shadow-md overflow-hidden lg:col-span-1">
        <div className="bg-gradient-to-br from-cyan-500 to-blue-600 px-4 py-3 flex items-center gap-2">
          <Building2 className="w-4 h-4 text-white/80" />
          <h2 className="text-white font-bold text-sm">{editId ? "تعديل قاعة" : "إضافة قاعة / مخبر"}</h2>
        </div>
        <CardContent className="pt-4 pb-5 space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">الاسم *</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="مثال: قاعة 01، مخبر العلوم"
              className="w-full text-sm px-3 py-2 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-cyan-500/30" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">النوع</label>
            <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
              className="w-full text-sm px-3 py-2 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-cyan-500/30">
              {Object.entries(ROOM_TYPES).map(([k, v]) => (
                <option key={k} value={k}>{v.icon} {v.label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">الطاقة الاستيعابية</label>
            <input type="number" value={form.capacity} onChange={e => setForm(f => ({ ...f, capacity: e.target.value }))}
              placeholder="عدد الأماكن"
              className="w-full text-sm px-3 py-2 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-cyan-500/30" />
          </div>
          <div className="flex gap-2 pt-1">
            {editId && (
              <Button variant="outline" size="sm" className="flex-1" onClick={() => { setEditId(null); setForm({ name: "", type: "classroom", capacity: "" }); }}>
                إلغاء
              </Button>
            )}
            <motion.button onClick={save} disabled={saving}
              whileHover={{ scale: saving ? 1 : 1.01 }} whileTap={{ scale: saving ? 1 : 0.97 }}
              className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-sm font-bold disabled:opacity-60">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {editId ? "تحديث" : "إضافة"}
            </motion.button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-md lg:col-span-2">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center h-32"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : rooms.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground text-sm gap-2">
              <Building2 className="w-8 h-8 opacity-30" />
              لا توجد قاعات مضافة بعد
            </div>
          ) : (
            <div className="divide-y">
              {rooms.map((r, i) => {
                const rt = ROOM_TYPES[r.type] ?? ROOM_TYPES.other;
                return (
                  <motion.div key={r.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-colors">
                    <div className="text-xl shrink-0">{rt.icon}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{r.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${rt.color}`}>{rt.label}</span>
                        {r.capacity && <span className="text-xs text-muted-foreground">سعة {r.capacity}</span>}
                      </div>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground" onClick={() => startEdit(r)}>
                        <Edit3 className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-red-500" onClick={() => del(r.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Print Panel ───────────────────────────────────────────────────────────────
function PrintPanel({ classes, annee, teachers, rooms, slots, activeClasse, onClassChange, onFetchSlots }: {
  classes: string[]; annee: string;
  teachers: Teacher[]; rooms: Room[]; slots: Slot[];
  activeClasse: string;
  onClassChange: (c: string) => void;
  onFetchSlots: () => void;
}) {
  useEffect(() => { onFetchSlots(); }, [activeClasse]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm font-semibold">اطبع جدول:</span>
        <select value={activeClasse} onChange={e => onClassChange(e.target.value)}
          className="text-sm px-3 py-2 rounded-lg border bg-background focus:outline-none">
          {classes.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <Button onClick={() => window.print()} className="gap-2 bg-gradient-to-r from-slate-700 to-slate-900 text-white border-0">
          <Printer className="w-4 h-4" /> طباعة
        </Button>
      </div>

      {/* Printable timetable */}
      <div id="print-timetable" className="overflow-x-auto rounded-2xl border shadow-md bg-card print:shadow-none print:border-0">
        {/* School header (print only) */}
        <div className="hidden print:flex items-center justify-between p-4 border-b">
          <div className="text-right">
            <p className="text-sm font-bold">الجمهورية الجزائرية الديمقراطية الشعبية</p>
            <p className="text-xs text-muted-foreground">وزارة التربية الوطنية</p>
          </div>
          <div className="text-center">
            <p className="text-base font-extrabold">جدول الأوقات</p>
            <p className="text-sm">القسم: {activeClasse} — السنة الدراسية: {annee}</p>
          </div>
          <div className="w-16 h-16 rounded-full border-2 flex items-center justify-center text-xs text-muted-foreground">
            شعار المؤسسة
          </div>
        </div>

        <table className="w-full min-w-[600px] border-collapse text-sm">
          <thead>
            <tr>
              <th className="w-20 px-3 py-2 text-xs font-bold text-muted-foreground bg-muted/40 border-b text-center">الحصة</th>
              {DAYS_AR.map((d, i) => (
                <th key={i} className="px-2 py-2 text-xs font-bold text-center bg-muted/40 border-b border-s">
                  <div>{d}</div>
                  <div className="text-[9px] text-muted-foreground font-normal">{DAYS_EN[i]}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERIODS.map((p, pi) => (
              <tr key={pi} className="border-b last:border-0">
                <td className="px-3 py-2 bg-muted/20 border-e text-center">
                  <div className="text-xs font-bold">{p.label}</div>
                  <div className="text-[9px] text-muted-foreground">{p.time}</div>
                </td>
                {DAYS_AR.map((_, di) => {
                  const slot = slots.find(s => s.day === di && s.period === pi);
                  const teacher = slot?.teacherId ? teachers.find(t => t.id === slot.teacherId) : null;
                  const alternateTeacher = slot?.alternateTeacherId ? teachers.find(t => t.id === slot.alternateTeacherId) : null;
                  const room    = slot?.roomId    ? rooms.find(r => r.id === slot.roomId) : null;
                  return (
                    <td key={di} className="border-s p-2 align-middle min-w-[110px]">
                      {slot ? (
                        <div className="text-center">
                          <p className="text-xs font-bold leading-tight">{slot.subject}</p>
                          {teacher && <p className="text-[10px] text-muted-foreground">{teacher.name}</p>}
                          {slot.alternateSubject && <p className="text-[10px] font-semibold text-cyan-700">أسبوع ب: {slot.alternateSubject}</p>}
                          {alternateTeacher && <p className="text-[10px] text-muted-foreground">{alternateTeacher.name} (أسبوع ب)</p>}
                          {room && <p className="text-[10px] text-muted-foreground">{ROOM_TYPES[room.type]?.icon} {room.name}</p>}
                        </div>
                      ) : (
                        <div className="h-10" />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <style>{`
        @media print {
          body > * { display: none !important; }
          #print-timetable { display: block !important; }
          #root > * { display: none !important; }
        }
      `}</style>
    </div>
  );
}

// ── Slot Modal ────────────────────────────────────────────────────────────────
function SlotModal({ day, period, slot, classe, annee, teachers, rooms, subjects, onClose, onSave }: {
  day: number; period: number; slot?: Slot;
  classe: string; annee: string;
  teachers: Teacher[]; rooms: Room[];
  subjects: string[];
  onClose: () => void;
  onSave: (data: { subject: string; teacherId?: string; roomId?: string; notes?: string }) => void;
}) {
  const [subject,   setSubject]   = useState(slot?.subject   ?? "");
  const [teacherId, setTeacherId] = useState(slot?.teacherId ?? "");
  const [roomId,    setRoomId]    = useState(slot?.roomId    ?? "");
  const [notes,     setNotes]     = useState(slot?.notes     ?? "");
  const [saving,    setSaving]    = useState(false);

  const submit = async () => {
    if (!subject.trim()) return;
    setSaving(true);
    await onSave({ subject: subject.trim(), teacherId: teacherId || undefined, roomId: roomId || undefined, notes: notes || undefined });
    setSaving(false);
  };

  return (
    <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        className="relative bg-background rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
        initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
        transition={{ type: "spring", stiffness: 300, damping: 28 }}
      >
        <div className="bg-gradient-to-br from-cyan-500 to-blue-600 px-5 py-3 flex items-center justify-between">
          <h2 className="text-white font-bold text-sm">
            {slot ? "تعديل حصة" : "إضافة حصة"} — {DAYS_AR[day]} / {PERIODS[period]?.label}
          </h2>
          <button onClick={onClose} className="text-white/70 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">المادة *</label>
            <select value={subject} onChange={e => setSubject(e.target.value)}
              className="w-full text-sm px-3 py-2 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-cyan-500/30">
              <option value="">— اختر أو اكتب —</option>
              {subjects.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            {!DEFAULT_SUBJECTS.includes(subject) && (
              <input value={subject} onChange={e => setSubject(e.target.value)}
                placeholder="أو أدخل اسم المادة مباشرة"
                className="w-full text-sm px-3 py-1.5 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-cyan-500/30 mt-1" />
            )}
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">الأستاذ</label>
            <select value={teacherId} onChange={e => setTeacherId(e.target.value)}
              className="w-full text-sm px-3 py-2 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-cyan-500/30">
              <option value="">— بدون أستاذ —</option>
              {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">القاعة / المخبر</label>
            <select value={roomId} onChange={e => setRoomId(e.target.value)}
              className="w-full text-sm px-3 py-2 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-cyan-500/30">
              <option value="">— بدون قاعة —</option>
              {rooms.map(r => <option key={r.id} value={r.id}>{ROOM_TYPES[r.type]?.icon} {r.name}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">ملاحظات</label>
            <input value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="اختياري"
              className="w-full text-sm px-3 py-2 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-cyan-500/30" />
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={onClose}>إلغاء</Button>
            <motion.button onClick={submit} disabled={!subject.trim() || saving}
              whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.97 }}
              className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-sm font-bold disabled:opacity-50">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {slot ? "تحديث" : "إضافة"}
            </motion.button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HourlyVolumePanel — الحجم الساعي الأسبوعي
//
// Shows: per-subject target hours/week (editable, persisted in localStorage)
//        vs actual hours scheduled in the grid.
// "Auto-distribute" fills empty slots greedily to meet targets.
// ─────────────────────────────────────────────────────────────────────────────
const STORAGE_KEY = "cem_hourly_targets_v1";

interface HourlyVolumePanelProps {
  slots: Slot[];
  classes: string[];
  annee: string;
  onFetchSlots: (classe: string) => Promise<void>;
}

type SubjectTargets = Record<string, number>; // subject → target h/week

function HourlyVolumePanel({ slots, classes, annee, onFetchSlots }: HourlyVolumePanelProps) {
  const { toast } = useToast();

  const [selectedClass, setSelectedClass] = useState(classes[0] ?? "");
  const [targets, setTargets] = useState<SubjectTargets>(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}"); }
    catch { return {}; }
  });
  const [distributing, setDistributing] = useState(false);
  const [newSubject, setNewSubject] = useState("");

  useEffect(() => {
    setSelectedClass(current => classes.includes(current) ? current : classes[0] ?? "");
  }, [classes]);

  const saveTargets = (t: SubjectTargets) => {
    setTargets(t);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(t));
  };

  // Count actual hours per subject for the selected class
  const classSlots = slots.filter(s => s.classe === selectedClass);
  const actualMap: Record<string, number> = {};
  for (const s of classSlots) {
    if (s.subject) actualMap[s.subject] = (actualMap[s.subject] ?? 0) + 1;
  }

  // All subjects (from targets + actual)
  const allSubjects = [...new Set([...Object.keys(targets), ...Object.keys(actualMap)])].sort();

  const addSubject = () => {
    const s = newSubject.trim();
    if (!s) return;
    if (!targets[s]) saveTargets({ ...targets, [s]: 1 });
    setNewSubject("");
  };

  const removeSubject = (s: string) => {
    const t = { ...targets };
    delete t[s];
    saveTargets(t);
  };

  const updateTarget = (s: string, v: number) =>
    saveTargets({ ...targets, [s]: Math.max(0, v) });

  // ── Auto-distribute greedy fill ────────────────────────────────────────────
  const DAYS = [0, 1, 2, 3, 4];
  const PERIODS_PER_DAY = 7;

  const handleAutoDistribute = async () => {
    if (!selectedClass) return;
    setDistributing(true);

    // Build list of subjects that still need more slots
    const needs: Array<{ subject: string; remaining: number }> = allSubjects
      .filter(s => targets[s] !== undefined)
      .map(s => ({ subject: s, remaining: Math.max(0, (targets[s] ?? 0) - (actualMap[s] ?? 0)) }))
      .filter(n => n.remaining > 0)
      .sort((a, b) => b.remaining - a.remaining);

    if (needs.length === 0) {
      toast({ title: "لا حاجة لتوزيع", description: "جميع المواد وصلت للحجم المستهدف" });
      setDistributing(false);
      return;
    }

    // Find empty slots
    const occupiedSet = new Set(classSlots.map(s => `${s.day}-${s.period}`));
    const emptySlots: Array<{ day: number; period: number }> = [];
    for (const day of DAYS)
      for (let period = 0; period < PERIODS_PER_DAY; period += 1)
        if (!occupiedSet.has(`${day}-${period}`)) emptySlots.push({ day, period });

    let filled = 0;

    for (const empty of emptySlots) {
      const next = needs.find(n => n.remaining > 0);
      if (!next) break;

      try {
        const res = await fetch(`${BASE}api/timetable/slots`, {
          method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            annee, classe: selectedClass,
            day: empty.day, period: empty.period,
            subject: next.subject, notes: "",
          }),
        });
        if (res.ok) {
          next.remaining--;
          filled++;
        }
      } catch { /* continue */ }
    }

    await onFetchSlots(selectedClass);
    toast({
      title: `✅ تم توزيع ${filled} حصة تلقائياً`,
      description: needs.filter(n => n.remaining > 0).length > 0
        ? "بعض المواد لم تكتمل (لا توجد حصص فارغة كافية)"
        : "تم الوصول لجميع الأهداف",
    });
    setDistributing(false);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
      {/* Class selector */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={selectedClass} onValueChange={v => { setSelectedClass(v); onFetchSlots(v); }}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="اختر الفوج" />
          </SelectTrigger>
          <SelectContent>
            {classes.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button
          onClick={handleAutoDistribute}
          disabled={distributing || !selectedClass}
          className="gap-2 bg-gradient-to-r from-violet-500 to-purple-600 text-white border-0 shadow"
          size="sm"
        >
          {distributing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
          توزيع تلقائي
        </Button>
        <p className="text-xs text-muted-foreground">يملأ الحصص الفارغة تلقائياً حتى الوصول للأهداف المحددة</p>
      </div>

      {/* Add subject */}
      <div className="flex items-center gap-2">
        <input
          value={newSubject}
          onChange={e => setNewSubject(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") addSubject(); }}
          placeholder="أضف مادة جديدة…"
          className="flex-1 max-w-xs px-3 py-1.5 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
          dir="rtl"
        />
        <Button size="sm" variant="outline" onClick={addSubject} className="gap-1.5">
          <Plus className="w-4 h-4" /> إضافة
        </Button>
      </div>

      {/* Table */}
      {allSubjects.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          <BookMarked className="w-10 h-10 mx-auto mb-3 opacity-20" />
          <p>لا توجد مواد بعد. أضف مادة وحدد الحجم الساعي المستهدف.</p>
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-muted/60">
              <tr>
                {["المادة", "الهدف (حصة/أسبوع)", "الفعلي الآن", "المتبقي", "الحالة", ""].map(h => (
                  <th key={h} className="px-4 py-2.5 text-start text-xs font-semibold text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allSubjects.map((s, i) => {
                const target  = targets[s] ?? 0;
                const actual  = actualMap[s] ?? 0;
                const remaining = Math.max(0, target - actual);
                const pct = target > 0 ? Math.min(100, Math.round((actual / target) * 100)) : 100;
                return (
                  <tr key={s} className={`border-t ${i % 2 === 0 ? "" : "bg-muted/15"}`}>
                    <td className="px-4 py-2.5 font-semibold">{s}</td>
                    <td className="px-4 py-2.5 w-36">
                      <input
                        type="number" min={0} max={40} step={1}
                        value={targets[s] ?? 0}
                        onChange={e => updateTarget(s, parseInt(e.target.value) || 0)}
                        className="w-20 px-2 py-1 text-center rounded-lg border bg-background text-sm font-bold focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
                        dir="ltr"
                      />
                    </td>
                    <td className="px-4 py-2.5 font-mono font-bold text-cyan-600">{actual}</td>
                    <td className="px-4 py-2.5 font-mono font-bold text-amber-600">{remaining}</td>
                    <td className="px-4 py-2.5 w-40">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${pct >= 100 ? "bg-emerald-500" : pct >= 50 ? "bg-cyan-500" : "bg-amber-500"}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-xs font-mono text-muted-foreground w-8 shrink-0">{pct}%</span>
                      </div>
                    </td>
                    <td className="px-2 py-2.5 w-8">
                      {targets[s] !== undefined && (
                        <button onClick={() => removeSubject(s)}
                          className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-950/20 text-muted-foreground hover:text-red-500 transition-colors">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </motion.div>
  );
}