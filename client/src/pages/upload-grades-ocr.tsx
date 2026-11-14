import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { flushDailyAttendance, queueDailyAttendance } from "@/lib/attendance-outbox";
import { SCHOOL_LEVELS, SCHOOL_STAGE } from "@/lib/deployment";
import {
  getSubjectsForLevel, LYCEE_BAC_FILIERES, LYCEE_BAC_FILIERE_LABELS,
  type LyceeBacFiliere,
} from "@shared/subjects";
import type { Niveau } from "@shared/types";
import {
  ScanLine, Upload, Loader2, CheckCircle2, AlertCircle, AlertTriangle,
  Pencil, Save, RotateCcw, FileImage, Clock, BookOpen, ClipboardCheck, Download,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL;

const ACADEMIC_YEARS = ["2026-2027", "2025-2026", "2024-2025", "2023-2024"];
const TRIMESTERS     = ["1", "2", "3"];
const GRADE_TYPES     = [
  { value: "continuous", label: "تقويم مستمر" },
  { value: "test", label: "فرض" },
  { value: "exam", label: "اختبار" },
] as const;
const NIVEAUX = SCHOOL_LEVELS;

type OcrMode = "grades" | "absences" | "daily_register";

interface OcrRow {
  rowNumber: number;
  studentName: string;
  grade?: number | null;
  justifiedHours?: number;
  unjustifiedHours?: number;
  status?: string;
  isAbsent?: boolean | null;
  note?: string;
  confidence: number;
  lowConfidence: boolean;
  editedName?: string;
  editedGrade?: string;
  editedJustified?: string;
  editedUnjustified?: string;
  editedStatus?: string;
  editedAbsent?: boolean | null;
  saved?: boolean;
  saveError?: string;
}

interface SaveState {
  phase: "idle" | "saving" | "done";
  saved: number;
  failed: number;
  errors: string[];
}

const pageVariants = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.4 } },
  exit:    { opacity: 0, y: -8, transition: { duration: 0.2 } },
};

function normArabic(s: string): string {
  return String(s ?? "")
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/\u200B|\u200C|\u200D|\uFEFF/g, "")
    .replace(/[أإآا]/g, "ا")
    .replace(/[ةه]/g, "ه")
    .replace(/ى/g, "ي")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i]![j] = a[i - 1] === b[j - 1]
        ? dp[i - 1]![j - 1]!
        : 1 + Math.min(dp[i - 1]![j]!, dp[i]![j - 1]!, dp[i - 1]![j - 1]!);
  return dp[m]![n]!;
}

function nameMatches(a: string, b: string): boolean {
  const na = normArabic(a);
  const nb = normArabic(b);
  if (!na || !nb) return false;
  if (na === nb || na.includes(nb) || nb.includes(na)) return true;
  const wa = na.split(" ").filter(Boolean);
  const wb = nb.split(" ").filter(Boolean);
  const [shorter, longer] = wa.length <= wb.length ? [wa, wb] : [wb, wa];
  if (shorter.length > 0 && shorter.every(w => longer.some(lw => lw.includes(w)))) return true;
  const maxDist = Math.min(3, Math.max(1, Math.floor(Math.min(na.length, nb.length) * 0.2)));
  return levenshtein(na, nb) <= maxDist;
}

function getCurrentTrimester(): number {
  const month = new Date().getMonth();
  if (month >= 8) return 1;
  if (month <= 2) return 2;
  return 3;
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export default function UploadGradesOcrPage() {
  const { toast } = useToast();

  const [mode, setMode] = useState<OcrMode>("grades");

  const [annee,     setAnnee]     = useState("2026-2027");
  const [reportDate, setReportDate] = useState("");
  const [niveau,    setNiveau]    = useState("");
  const [classe,    setClasse]    = useState("");
  const [trimestre, setTrimestre] = useState("1");
  const [filiere, setFiliere] = useState<LyceeBacFiliere | "">("");
  const [subject,   setSubject]   = useState("");
  const [gradeType, setGradeType] = useState("test");

  const [phase,    setPhase]    = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [rows,     setRows]     = useState<OcrRow[]>([]);
  const [preview,  setPreview]  = useState<string | null>(null);
  const [overallConf, setOverallConf] = useState<number | null>(null);
  const [errMsg,   setErrMsg]   = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);

  const [saveState, setSaveState] = useState<SaveState>({ phase: "idle", saved: 0, failed: 0, errors: [] });
  const availableSubjects = useMemo(
    () => niveau ? getSubjectsForLevel(niveau as Niveau, filiere || undefined) : [],
    [filiere, niveau],
  );

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const syncPending = () => {
      void flushDailyAttendance(BASE).then(synced => {
        if (synced > 0) toast({ title: `تمت مزامنة ${synced} سجلات حضور محفوظة محلياً` });
      }).catch(() => undefined);
    };
    window.addEventListener("online", syncPending);
    syncPending();
    return () => window.removeEventListener("online", syncPending);
  }, [toast]);

  const canUpload = mode !== "grades" || Boolean(niveau && classe);

  const switchMode = (m: OcrMode) => {
    setMode(m);
    setPhase("idle");
    setRows([]);
    setPreview(null);
    setErrMsg("");
    setSuggestions([]);
    setSaveState({ phase: "idle", saved: 0, failed: 0, errors: [] });
    setReportDate("");
    if (m === "absences") setSubject("");
  };

  const handleFile = useCallback(async (file: File) => {
    if (mode === "grades" && (!niveau || !classe)) {
      toast({
        variant: "destructive",
        title: "بيانات ناقصة",
        description: "يجب ملء المستوى والفوج قبل بدء المعالجة",
      });
      return;
    }

    const MAX_SIZE = 15 * 1024 * 1024;
    const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/bmp"];

    if (!ALLOWED_TYPES.includes(file.type)) {
      toast({
        variant: "destructive",
        title: "نوع ملف غير صحيح",
        description: `الملفات المدعومة: JPEG, PNG, WebP, BMP`
      });
      return;
    }

    if (file.size > MAX_SIZE) {
      toast({
        variant: "destructive",
        title: "الملف كبير جداً",
        description: `الحد الأقصى: 15 MB (الملف الحالي: ${(file.size / 1024 / 1024).toFixed(1)} MB)`
      });
      return;
    }

    if (mode === "grades" && !subject) {
      toast({
        variant: "default",
        title: "تنبيه",
        description: "لم يتم اختيار المادة بعد؛ يمكنك رفع الصورة الآن ثم اختيار المادة قبل الحفظ",
      });
    }

    const reader = new FileReader();
    reader.onload = e => setPreview(e.target?.result as string);
    reader.readAsDataURL(file);

    setPhase("uploading");
    setRows([]);
    setErrMsg("");
    setSuggestions([]);
    setSaveState({ phase: "idle", saved: 0, failed: 0, errors: [] });

    const form = new FormData();
    form.append("image", file);

    try {
      const res = await fetch(
        `${BASE}api/ocr/parse-grades?type=${mode}`,
        { method: "POST", body: form, credentials: "include" },
      );
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setErrMsg(data.error ?? "فشل معالجة الصورة");
        setSuggestions(data.suggestions ?? []);
        setPhase("error");
        return;
      }

      if (!data.rows || data.rows.length === 0) {
        setErrMsg("لم يتم العثور على أي بيانات في الصورة. جرّب صورة أخرى بجودة أفضل.");
        setSuggestions([
          "تأكد من وضوح الصورة وخلوها من الظلال",
          "حاول صورة بإضاءة أفضل",
          "جرّب تقريب الصورة أو أخذ صورة جديدة",
          "إذا استمرت المشكلة، جرّب محرك OCR الآخر"
        ]);
        setPhase("error");
        return;
      }

      setRows(data.rows.map((r: OcrRow) => ({ ...r })));
      if (mode === "daily_register") setReportDate(data.reportDate ?? "");
      setOverallConf(data.overallConfidence ?? null);
      setSuggestions([]);
      setPhase("done");
    } catch (e: any) {
      setErrMsg(e?.message ?? "حدث خطأ غير متوقع");
      setSuggestions(["جرّب مرة أخرى", "تحقق من اتصال الإنترنت"]);
      setPhase("error");
    }
  }, [toast, mode, niveau, classe, subject]);

  const handleDropzoneClick = () => {
    if (!canUpload) {
      toast({
        variant: "destructive",
        title: "بيانات ناقصة",
        description: "يجب ملء المستوى والفوج قبل رفع الصورة",
      });
      return;
    }
    if (phase === "idle") fileInputRef.current?.click();
  };

  const onDragOver  = (e: React.DragEvent) => {
    e.preventDefault();
    if (canUpload) setDragging(true);
  };
  const onDragLeave = () => setDragging(false);
  const onDrop      = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (!canUpload) {
      toast({
        variant: "destructive",
        title: "بيانات ناقصة",
        description: "يجب ملء المستوى والفوج قبل رفع الصورة",
      });
      return;
    }
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const updateRow    = (idx: number, patch: Partial<OcrRow>) =>
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, ...patch } : r));
  const effectiveName       = (r: OcrRow) => r.editedName ?? r.studentName;
  const effectiveGrade      = (r: OcrRow) => r.editedGrade !== undefined ? r.editedGrade : String(r.grade ?? "");
  const effectiveJustified  = (r: OcrRow) => r.editedJustified  !== undefined ? r.editedJustified  : String(r.justifiedHours  ?? 0);
  const effectiveUnjustified= (r: OcrRow) => r.editedUnjustified !== undefined ? r.editedUnjustified : String(r.unjustifiedHours ?? 0);
  const effectiveStatus     = (r: OcrRow) => r.editedStatus ?? r.status ?? "";
  const effectiveAbsent     = (r: OcrRow) => r.editedAbsent !== undefined ? r.editedAbsent : r.isAbsent ?? null;

  // Sends the reviewed rows (matched or not) to the server, which returns a CSV that Excel opens.
  // The server checks the paid "Excel export" feature and answers 402 when it is not unlocked.
  async function exportToExcel() {
    try {
      const res = await fetch(`${BASE}api/ocr/export`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: rows.map(r => ({
            studentName: effectiveName(r),
            grade: effectiveGrade(r),
            status: effectiveStatus(r),
            note: r.note ?? "",
            justifiedHours: effectiveJustified(r),
            unjustifiedHours: effectiveUnjustified(r),
          })),
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast({
          variant: "destructive",
          title: res.status === 402 ? "ميزة مدفوعة" : "تعذر التصدير",
          description: d.error ?? "حاول مرة أخرى",
        });
        return;
      }
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `ocr-${mode}-${reportDate || new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast({ variant: "destructive", title: "تعذر التصدير", description: e?.message ?? "حاول مرة أخرى" });
    }
  }

  async function fetchStudents(): Promise<Array<{ id: string; nomPrenom: string }>> {
    if ((mode !== "daily_register" && !classe) || (mode === "grades" && !niveau)) return [];
    const params = new URLSearchParams({ annee });
    if (classe) params.set("classe", classe);
    if (mode === "grades") {
      params.set("niveau", niveau);
      if (SCHOOL_STAGE === "lycee" && filiere) params.set("filiere", filiere);
    }
    try {
      const res = await fetch(
        `${BASE}api/students?${params}`,
        { credentials: "include" },
      );
      if (!res.ok) return [];
      const d = await res.json();
      return d.students ?? [];
    } catch { return []; }
  }

  const handleSave = async () => {
    if ((mode !== "daily_register" && !classe) || (mode === "grades" && !niveau)) {
      toast({ variant: "destructive", title: "خطأ", description: mode === "grades" ? "يرجى تحديد المستوى والفوج قبل الحفظ" : "يرجى تحديد الفوج قبل الحفظ" });
      return;
    }
    if (mode === "grades" && !subject) {
      toast({ variant: "destructive", title: "خطأ", description: "يرجى تحديد المادة قبل الحفظ" });
      return;
    }
    if (mode === "grades" && SCHOOL_STAGE === "lycee" && niveau === "3AS" && !filiere) {
      toast({ variant: "destructive", title: "بيانات ناقصة", description: "حدد شعبة البكالوريا قبل حفظ العلامات" });
      return;
    }
    if (mode === "daily_register" && !isIsoDate(reportDate)) {
      toast({ variant: "destructive", title: "تاريخ غير صالح", description: "أدخل تاريخ التقرير قبل الحفظ" });
      return;
    }
    if (mode === "daily_register" && rows.some(row => effectiveAbsent(row) === null || !effectiveStatus(row))) {
      toast({ variant: "destructive", title: "مراجعة مطلوبة", description: "حدد حالة كل تلميذ وتأكد من علامة الحضور قبل الحفظ" });
      return;
    }

    setSaveState({ phase: "saving", saved: 0, failed: 0, errors: [] });

    const students = await fetchStudents();

    if (students.length === 0) {
      // No student list to match against: keep every extracted row on screen so it can be edited or exported.
      const msg = mode === "grades"
        ? `لم يتم العثور على أي تلميذ في ${niveau} — الفوج ${classe} — سنة ${annee}. تحقق من صحة المستوى والفوج المحددين أو تأكد من استيراد القائمة أولاً.`
        : classe
          ? `لم يتم العثور على أي تلميذ في الفوج ${classe} — سنة ${annee}. تحقق من الفوج أو تأكد من استيراد القائمة أولاً.`
          : `لم يتم العثور على تلاميذ في سنة ${annee}. تأكد من استيراد القائمة أولاً.`;
      setSaveState({ phase: "done", saved: 0, failed: rows.length, errors: [msg] });
      setRows(prev => prev.map(r => ({ ...r, saveError: "غير مطابق: عدّل الاسم أو صدّر الملف" })));
      toast({
        title: "لم تتم مطابقة الأسماء مع قائمة التلاميذ",
        description: "الأسماء المستخرجة بقيت في الجدول: عدّلها هنا أو صدّرها إلى Excel.",
      });
      return;
    }

    const findStudents = (name: string) => students.filter(s => nameMatches(s.nomPrenom, name));

    if (mode === "daily_register") {
      const updatedRows = [...rows];
      const entries: Array<{ studentId: string; status: string; isAbsent: boolean }> = [];
      const matchedRows: number[] = [];
      const seenStudentIds = new Set<string>();
      const errors: string[] = [];
      const attendancePayload = { attendanceDate: reportDate, annee, entries };

      rows.forEach((row, index) => {
        const matches = findStudents(effectiveName(row));
        if (matches.length !== 1) {
          const message = matches.length > 1
            ? classe ? "الاسم مطابق لأكثر من تلميذ في الفوج" : "الاسم مطابق لأكثر من تلميذ؛ حدد الفوج لتضييق البحث"
            : "لم يُعثر على التلميذ في القائمة";
          errors.push(`صف ${row.rowNumber}: ${message}`);
          updatedRows[index] = { ...row, saveError: message };
          return;
        }
        const student = matches[0]!;
        if (seenStudentIds.has(student.id)) {
          const message = "ظهر التلميذ أكثر من مرة في الصورة";
          errors.push(`صف ${row.rowNumber}: ${message}`);
          updatedRows[index] = { ...row, saveError: message };
          return;
        }
        seenStudentIds.add(student.id);
        matchedRows.push(index);
        entries.push({ studentId: student.id, status: effectiveStatus(row), isAbsent: effectiveAbsent(row) === true });
      });

      if (entries.length === 0) {
        setRows(updatedRows);
        setSaveState({ phase: "done", saved: 0, failed: rows.length, errors });
        toast({
          title: "لم تتم مطابقة أي اسم",
          description: "الصفوف باقية في الجدول للتعديل أو التصدير إلى Excel.",
        });
        return;
      }

      try {
        if (!navigator.onLine) {
          await queueDailyAttendance(attendancePayload);
          for (const index of matchedRows) updatedRows[index] = { ...updatedRows[index]!, saved: true, saveError: undefined };
          setRows(updatedRows);
          setSaveState({ phase: "done", saved: entries.length, failed: errors.length, errors });
          toast({ title: `تم حفظ ${entries.length} سجل محلياً`, description: "ستتم المزامنة تلقائياً عند عودة الاتصال" });
          return;
        }
        const response = await fetch(`${BASE}api/absences/daily-students`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ attendanceDate: reportDate, annee, entries }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error ?? "فشل حفظ السجل اليومي");

        for (const index of matchedRows) {
          updatedRows[index] = { ...updatedRows[index]!, saved: true, saveError: undefined };
        }
        setRows(updatedRows);
        setSaveState({ phase: "done", saved: entries.length, failed: errors.length, errors });
        toast({
          title: `تم حفظ ${entries.length} سجل ليوم ${reportDate}`,
          description: errors.length > 0 ? `تعذر مطابقة ${errors.length} صف` : undefined,
        });
      } catch (error: any) {
        if (error instanceof TypeError || !navigator.onLine) {
          try {
            await queueDailyAttendance(attendancePayload);
            for (const index of matchedRows) updatedRows[index] = { ...updatedRows[index]!, saved: true, saveError: undefined };
            setRows(updatedRows);
            setSaveState({ phase: "done", saved: entries.length, failed: errors.length, errors });
            toast({ title: `تم حفظ ${entries.length} سجل محلياً`, description: "ستتم المزامنة تلقائياً عند عودة الاتصال" });
            return;
          } catch (queueError: any) {
            error = queueError;
          }
        }
        setRows(rows.map(row => ({ ...row, saveError: error?.message ?? "فشل الحفظ" })));
        setSaveState({ phase: "done", saved: 0, failed: rows.length, errors: [error?.message ?? "فشل الحفظ"] });
        toast({ variant: "destructive", title: "فشل الحفظ", description: error?.message ?? "فشل حفظ السجل اليومي" });
      }
      return;
    }

    let saved = 0, failed = 0;
    const errors: string[] = [];
    const updatedRows = [...rows];

    for (let i = 0; i < rows.length; i++) {
      const row  = rows[i]!;
      const name = effectiveName(row);
      const matches = findStudents(name);
      const student = mode === "grades" ? matches[0] : matches.length === 1 ? matches[0] : undefined;

      if (!student) {
        failed++;
        const message = matches.length > 1
          ? "الاسم مطابق لأكثر من تلميذ؛ يلزم التحقق من المستوى"
          : "لم يُعثر على التلميذ في الفوج";
        errors.push(`صف ${row.rowNumber}: ${message} (${name})`);
        updatedRows[i] = { ...updatedRows[i]!, saveError: message };
        continue;
      }

      try {
        let res: Response;

        if (mode === "grades") {
          const grStr = effectiveGrade(row);
          const grade = parseFloat(grStr);
          if (isNaN(grade) || grade < 0 || grade > 20) {
            failed++;
            errors.push(`صف ${row.rowNumber}: درجة غير صالحة "${grStr}"`);
            updatedRows[i] = { ...updatedRows[i]!, saveError: "درجة غير صالحة" };
            continue;
          }
          res = await fetch(`${BASE}api/grades`, {
            method: "POST", credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              studentId: student.id, annee,
              trimestre: parseInt(trimestre),
              subject, score: grade, gradeType,
            }),
          });
        } else {
          const justified   = parseInt(effectiveJustified(row))   || 0;
          const unjustified = parseInt(effectiveUnjustified(row)) || 0;
          res = await fetch(`${BASE}api/absences`, {
            method: "POST", credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              studentId: student.id, annee,
              trimestre: getCurrentTrimester(),
              justifiedHours: justified,
              unjustifiedHours: unjustified,
            }),
          });
        }

        if (res.ok) {
          saved++;
          updatedRows[i] = { ...updatedRows[i]!, saved: true, saveError: undefined };
        } else {
          const d = await res.json().catch(() => ({}));
          failed++;
          const msg = d.error ?? "فشل الحفظ";
          errors.push(`${name}: ${msg}`);
          updatedRows[i] = { ...updatedRows[i]!, saveError: msg };
        }
      } catch (e: any) {
        failed++;
        errors.push(`${name}: ${e?.message ?? "خطأ"}`);
        updatedRows[i] = { ...updatedRows[i]!, saveError: e?.message ?? "خطأ" };
      }
    }

    setRows(updatedRows);
    setSaveState({ phase: "done", saved, failed, errors });

    if (saved > 0) {
      toast({
        title: `✅ تم حفظ ${saved} ${mode === "grades" ? "درجة" : "سجل غياب"} بنجاح`,
        description: failed > 0 ? `فشل ${failed} صف — راجع الجدول` : undefined,
      });
    } else {
      toast({ variant: "destructive", title: "فشل الحفظ", description: "لم يتم حفظ أي سجل — تحقق من الأخطاء" });
    }
  };

  const lowConfCount = rows.filter(r => r.lowConfidence).length;
  const canSave = mode === "grades"
    ? !!(niveau && classe && subject)
    : mode === "daily_register"
      ? isIsoDate(reportDate) && rows.length > 0 && rows.every(row => effectiveAbsent(row) !== null && Boolean(effectiveStatus(row)))
      : !!classe;

  return (
    <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit"
      className="p-6 space-y-6 max-w-5xl mx-auto" dir="rtl">

      <div className="flex items-center gap-3">
        <span className="inline-flex w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-700 items-center justify-center shadow-lg shadow-violet-500/30">
          <ScanLine className="w-5 h-5 text-white" />
        </span>
        <div>
          <h1 className="text-xl font-bold">استخراج البيانات بالـ OCR</h1>
          <p className="text-xs text-muted-foreground">ارفع صورة الكشف المطبوع وراجع النتائج قبل الحفظ</p>
        </div>
      </div>

      <div className="flex gap-2 p-1 bg-muted/50 rounded-xl w-fit">
        <button
          onClick={() => switchMode("grades")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
            mode === "grades"
              ? "bg-background text-violet-600 dark:text-violet-400 shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <BookOpen className="w-3.5 h-3.5" />
          درجات
        </button>
        <button
          onClick={() => switchMode("absences")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
            mode === "absences"
              ? "bg-background text-amber-600 dark:text-amber-400 shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          غيابات
        </button>
        <button
          onClick={() => switchMode("daily_register")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
            mode === "daily_register"
              ? "bg-background text-emerald-600 dark:text-emerald-400 shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <ClipboardCheck className="w-3.5 h-3.5" />
          سجل يومي
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
        <Select value={annee} onValueChange={setAnnee}>
          <SelectTrigger><SelectValue placeholder="السنة" /></SelectTrigger>
          <SelectContent>{ACADEMIC_YEARS.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
        </Select>
        {mode === "grades" && (
          <Select value={niveau} onValueChange={value => {
            setNiveau(value);
            setFiliere("");
            setSubject("");
          }}>
            <SelectTrigger><SelectValue placeholder="المستوى" /></SelectTrigger>
            <SelectContent>{NIVEAUX.map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}</SelectContent>
          </Select>
        )}
        {mode === "grades" && SCHOOL_STAGE === "lycee" && niveau !== "1AS" && niveau !== "" && (
          <Select value={filiere || "__none__"} onValueChange={value => {
            setFiliere(LYCEE_BAC_FILIERES.find(stream => stream === value) ?? "");
            setSubject("");
          }}>
            <SelectTrigger><SelectValue placeholder="الشعبة" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">اختر الشعبة</SelectItem>
              {LYCEE_BAC_FILIERES.map(stream => (
                <SelectItem key={stream} value={stream}>{LYCEE_BAC_FILIERE_LABELS[stream]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Input
          placeholder={mode === "grades" ? "الفوج (مثال: 1 أو A)" : mode === "daily_register" ? "الفوج (اختياري لتسهيل المطابقة)" : "الفوج (للحفظ، اختياري أثناء القراءة)"}
          value={classe}
          onChange={e => setClasse(e.target.value)}
        />
        {mode === "daily_register" && (
          <Input type="date" aria-label="تاريخ سجل الغياب" value={reportDate} onChange={e => setReportDate(e.target.value)} />
        )}
        {mode === "grades" && (
          <Select value={trimestre} onValueChange={setTrimestre}>
            <SelectTrigger><SelectValue placeholder="الفصل" /></SelectTrigger>
            <SelectContent>{TRIMESTERS.map(t => <SelectItem key={t} value={t}>الفصل {t}</SelectItem>)}</SelectContent>
          </Select>
        )}
        {mode === "grades" ? (
          <>
            <Select value={subject} onValueChange={setSubject}>
              <SelectTrigger><SelectValue placeholder="المادة" /></SelectTrigger>
              <SelectContent>{availableSubjects.map(item => <SelectItem key={item.key} value={item.key}>{item.arLabel}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={gradeType} onValueChange={setGradeType}>
              <SelectTrigger><SelectValue placeholder="نوع الدرجة" /></SelectTrigger>
              <SelectContent>{GRADE_TYPES.map(type => <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>)}</SelectContent>
            </Select>
          </>
        ) : mode === "daily_register" ? (
          <div className="flex items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200/50 text-xs text-emerald-700 dark:text-emerald-400 font-medium gap-1.5">
            <ClipboardCheck className="w-3.5 h-3.5" />
            سجل يومي · الفوج اختياري · راجع العلامات قبل الحفظ
          </div>
        ) : (
          <div className="flex items-center justify-center rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200/50 text-xs text-amber-700 dark:text-amber-400 font-medium gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            وضع الغيابات · الفصل {getCurrentTrimester()} تلقائيًا
          </div>
        )}
      </div>

      {!canUpload && phase === "idle" && (
        <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-900/40 rounded-lg px-3 py-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          حدد المستوى والفوج أعلاه أولاً — منطقة رفع الصورة معطّلة حتى تُعبّأ الحقلين
        </div>
      )}

      {phase !== "done" && (
        <motion.div
          className={`rounded-2xl border-2 border-dashed transition-all flex flex-col items-center justify-center gap-4 py-14 px-6 text-center
            ${!canUpload
              ? "opacity-50 cursor-not-allowed border-muted-foreground/15"
              : dragging
                ? "border-violet-400 bg-violet-50/40 dark:bg-violet-950/20 cursor-pointer"
                : "border-muted-foreground/25 hover:border-violet-400/50 hover:bg-violet-50/20 dark:hover:bg-violet-950/10 cursor-pointer"}`}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={handleDropzoneClick}
          whileHover={{ scale: canUpload ? 1.01 : 1 }}
          whileTap={{ scale: canUpload ? 0.99 : 1 }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            disabled={!canUpload}
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = "";
            }}
          />

          {phase === "idle" && (
            <>
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-100 to-purple-100 dark:from-violet-950/40 dark:to-purple-950/40 flex items-center justify-center">
                <FileImage className="w-8 h-8 text-violet-500" />
              </div>
              <div>
                <p className="font-semibold text-base">
                  {mode === "grades" ? "أسقط صورة كشف الدرجات هنا" : mode === "daily_register" ? "أسقط صورة سجل الغياب اليومي هنا" : "أسقط صورة كشف الغياب هنا"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">JPEG · PNG · WebP · BMP — حجم أقصى 15 MB</p>
              </div>
              <Button
                size="sm"
                disabled={!canUpload}
                className="gap-2 bg-gradient-to-r from-violet-500 to-purple-600 text-white border-0 shadow disabled:opacity-60"
              >
                <Upload className="w-4 h-4" />
                اختيار صورة
              </Button>
            </>
          )}

          {phase === "uploading" && (
            <div className="flex flex-col items-center gap-3">
              {preview && (
                <img src={preview} alt="" className="max-h-32 rounded-xl object-contain shadow border border-border opacity-60" />
              )}
              <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
              <p className="text-sm text-muted-foreground">جاري معالجة الصورة بالـ OCR… قد يستغرق بضع ثوانٍ</p>
            </div>
          )}

          {phase === "error" && (
            <div className="flex flex-col items-center gap-4">
              <AlertCircle className="w-10 h-10 text-red-500" />
              <div className="text-center">
                <p className="text-sm font-semibold text-red-600 dark:text-red-400">{errMsg}</p>
                {suggestions.length > 0 && (
                  <div className="mt-2 text-xs text-muted-foreground">
                    <p className="font-medium mb-1">جرّب:</p>
                    <ul className="space-y-0.5">
                      {suggestions.map((s, i) => (
                        <li key={i} className="flex items-center gap-2">
                          <span className="text-violet-500">•</span> {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              <Button size="sm" variant="outline" className="gap-2"
                onClick={e => { e.stopPropagation(); setPhase("idle"); setPreview(null); setErrMsg(""); setSuggestions([]); }}>
                <RotateCcw className="w-4 h-4" />
                حاول مرة أخرى
              </Button>
            </div>
          )}
        </motion.div>
      )}

      <AnimatePresence>
        {phase === "done" && rows.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="space-y-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <h2 className="font-bold text-base">نتائج الاستخراج</h2>
                <span className="text-xs px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 font-semibold">
                  {rows.length} صف
                </span>
                {lowConfCount > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 font-semibold flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />{lowConfCount} ثقة منخفضة
                  </span>
                )}
                {overallConf !== null && (
                  <span className="text-xs text-muted-foreground">دقة OCR: {overallConf}%</span>
                )}
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="gap-1.5 text-xs h-8"
                  onClick={() => { setPhase("idle"); setRows([]); setPreview(null); setSaveState({ phase: "idle", saved: 0, failed: 0, errors: [] }); }}>
                  <RotateCcw className="w-3.5 h-3.5" />
                  صورة جديدة
                </Button>
                <Button size="sm" variant="outline" className="gap-1.5 text-xs h-8"
                  onClick={() => void exportToExcel()}>
                  <Download className="w-3.5 h-3.5" />
                  تصدير Excel
                </Button>
                <Button
                  size="sm"
                  className="gap-1.5 text-xs h-8 bg-gradient-to-r from-emerald-500 to-teal-600 text-white border-0 shadow-sm"
                  onClick={handleSave}
                  disabled={saveState.phase === "saving" || !canSave}
                >
                  {saveState.phase === "saving" ? (
                    <><Loader2 className="w-3.5 h-3.5 animate-spin" /> جاري الحفظ…</>
                  ) : (
                    <><Save className="w-3.5 h-3.5" /> حفظ في قاعدة البيانات</>
                  )}
                </Button>
              </div>
            </div>

            {saveState.phase === "done" && (
              <motion.div
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                className={`rounded-xl border p-3 flex items-start gap-3 text-sm ${
                  saveState.failed === 0
                    ? "border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950/30"
                    : "border-amber-500/30 bg-amber-50 dark:bg-amber-950/30"
                }`}
              >
                {saveState.failed === 0
                  ? <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                  : <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />}
                <div>
                  <span className="font-semibold block">
                    تم حفظ {saveState.saved} {mode === "grades" ? "درجة" : "سجل غياب"}
                    {saveState.failed > 0 && ` · فشل ${saveState.failed} صف`}
                  </span>
                  {saveState.errors.length > 0 && saveState.saved === 0 && (
                    <span className="text-xs text-muted-foreground mt-1 block">{saveState.errors[0]}</span>
                  )}
                </div>
              </motion.div>
            )}

            <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-amber-100 border border-amber-400" />
                ثقة OCR منخفضة
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-emerald-100 border border-emerald-400" />
                تم الحفظ
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-red-100 border border-red-400" />
                غير مطابق / خطأ في الحفظ
              </span>
            </div>

            <div className="rounded-xl border overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/60 sticky top-0 z-10">
                    <tr>
                      {mode === "grades" ? (
                        <>
                          {["#", "اسم التلميذ (قابل للتعديل)", "الدرجة / 20", "الثقة", "الحالة"].map(h => (
                            <th key={h} className="px-4 py-2.5 text-start text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{h}</th>
                          ))}
                        </>
                      ) : mode === "daily_register" ? (
                        <>
                          {["#", "اسم التلميذ (قابل للتعديل)", "العلامة في السجل", "الحالة المراجعة", "ملاحظة", "الثقة", "الحالة"].map(h => (
                            <th key={h} className="px-4 py-2.5 text-start text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{h}</th>
                          ))}
                        </>
                      ) : (
                        <>
                          {["#", "اسم التلميذ (قابل للتعديل)", "مبرر (ساعة)", "غير مبرر (ساعة)", "المجموع", "الحالة"].map(h => (
                            <th key={h} className="px-4 py-2.5 text-start text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{h}</th>
                          ))}
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, idx) => (
                      <motion.tr
                        key={row.rowNumber}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: Math.min(idx * 0.02, 0.4) }}
                        className={`border-t transition-colors ${
                          row.saved      ? "bg-emerald-50/50 dark:bg-emerald-950/20"
                          : row.saveError ? "bg-red-50/50 dark:bg-red-950/20"
                          : row.lowConfidence ? "bg-amber-50/60 dark:bg-amber-950/20"
                          : idx % 2 === 0 ? "" : "bg-muted/20"
                        }`}
                      >
                        <td className="px-4 py-2.5 text-xs text-muted-foreground font-mono w-10">
                          {row.rowNumber}
                        </td>

                        <td className="px-4 py-2 min-w-[180px]">
                          <div className="flex items-center gap-1.5">
                            <Input
                              value={effectiveName(row)}
                              onChange={e => updateRow(idx, { editedName: e.target.value })}
                              className="h-7 text-xs font-medium border-transparent hover:border-border focus:border-border bg-transparent px-1.5"
                              dir="rtl"
                            />
                            <Pencil className="w-3 h-3 text-muted-foreground/40 shrink-0" />
                          </div>
                        </td>

                        {mode === "grades" ? (
                          <>
                            <td className="px-4 py-2 w-24">
                              <Input
                                value={effectiveGrade(row)}
                                onChange={e => updateRow(idx, { editedGrade: e.target.value })}
                                type="number" min={0} max={20} step={0.25}
                                className="h-7 text-xs font-bold text-center border-transparent hover:border-border focus:border-border bg-transparent"
                                dir="ltr"
                              />
                            </td>
                            <td className="px-4 py-2 w-20">
                              <span className={`text-xs font-mono ${
                                row.confidence >= 85 ? "text-emerald-600" :
                                row.confidence >= 70 ? "text-amber-600"   : "text-red-500"
                              }`}>{row.confidence}%</span>
                            </td>
                          </>
                        ) : mode === "daily_register" ? (
                          <>
                            <td className="px-4 py-2 w-32">
                              <Input
                                value={effectiveStatus(row)}
                                onChange={e => updateRow(idx, { editedStatus: e.target.value })}
                                className="h-7 text-xs text-center"
                                aria-label="علامة الحضور في السجل"
                              />
                            </td>
                            <td className="px-4 py-2 min-w-40">
                              <div className="flex gap-1">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={effectiveAbsent(row) === false ? "default" : "outline"}
                                  className={`h-7 px-2 text-xs ${effectiveAbsent(row) === false ? "bg-emerald-600 hover:bg-emerald-700" : ""}`}
                                  onClick={() => updateRow(idx, { editedAbsent: false })}
                                >حاضر</Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={effectiveAbsent(row) === true ? "default" : "outline"}
                                  className={`h-7 px-2 text-xs ${effectiveAbsent(row) === true ? "bg-rose-600 hover:bg-rose-700" : ""}`}
                                  onClick={() => updateRow(idx, { editedAbsent: true })}
                                >غائب</Button>
                              </div>
                            </td>
                            <td className="px-4 py-2 min-w-32 text-xs text-muted-foreground">
                              {row.note || "—"}
                            </td>
                            <td className="px-4 py-2 w-20">
                              <span className={`text-xs font-mono ${row.confidence >= 85 ? "text-emerald-600" : row.confidence >= 70 ? "text-amber-600" : "text-red-500"}`}>{row.confidence}%</span>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-4 py-2 w-24">
                              <Input
                                value={effectiveJustified(row)}
                                onChange={e => updateRow(idx, { editedJustified: e.target.value })}
                                type="number" min={0} max={500} step={1}
                                className="h-7 text-xs font-bold text-center border-transparent hover:border-border focus:border-border bg-transparent"
                                dir="ltr"
                              />
                            </td>
                            <td className="px-4 py-2 w-24">
                              <Input
                                value={effectiveUnjustified(row)}
                                onChange={e => updateRow(idx, { editedUnjustified: e.target.value })}
                                type="number" min={0} max={500} step={1}
                                className="h-7 text-xs font-bold text-center border-transparent hover:border-border focus:border-border bg-transparent"
                                dir="ltr"
                              />
                            </td>
                            <td className="px-4 py-2 w-20 text-xs font-mono text-center text-muted-foreground">
                              {(parseInt(effectiveJustified(row)) || 0) + (parseInt(effectiveUnjustified(row)) || 0)}
                            </td>
                          </>
                        )}

                        <td className="px-4 py-2 w-36">
                          {row.saved ? (
                            <span className="flex items-center gap-1 text-xs text-emerald-600 font-semibold">
                              <CheckCircle2 className="w-3.5 h-3.5" /> تم الحفظ
                            </span>
                          ) : row.saveError ? (
                            <span className="flex items-center gap-1 text-xs text-red-500" title={row.saveError}>
                              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                              <span className="truncate max-w-[120px]">{row.saveError}</span>
                            </span>
                          ) : row.lowConfidence ? (
                            <span className="flex items-center gap-1 text-xs text-amber-600">
                              <AlertTriangle className="w-3.5 h-3.5" /> تحقق يدويًا
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">جاهز</span>
                          )}
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {!canSave && (
              <p className="text-xs text-amber-600 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />
                {mode === "grades"
                  ? "حدد المستوى والفوج والمادة أعلاه لتفعيل زر الحفظ"
                  : mode === "daily_register"
                    ? "أدخل تاريخ السجل وراجع حالة كل تلميذ لتفعيل الحفظ؛ الفوج اختياري"
                    : "حدد الفوج أعلاه لتفعيل زر الحفظ"}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}