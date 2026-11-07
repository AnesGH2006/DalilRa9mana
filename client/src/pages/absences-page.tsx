import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { connectAttendanceUpdates } from "@/lib/attendance-socket";
import { StudentHealthDialog } from "@/components/student-health-dialog";
import {
  CalendarOff, AlertTriangle, CheckCircle, Printer, Upload, FileSpreadsheet,
  Users, BookOpen, Briefcase, Hammer, UtensilsCrossed, Trash2, TrendingUp, ChevronDown, ChevronUp,
} from "lucide-react";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Legend, CartesianGrid, LineChart, Line,
} from "recharts";

const BASE = import.meta.env.BASE_URL;
const ACADEMIC_YEARS = ["2026-2027", "2025-2026", "2024-2025", "2023-2024", "2022-2023"];
const DEFAULT_YEAR  = "2026-2027";

// ── Types ─────────────────────────────────────────────────────────────────────
interface AbsenceRow {
  id: string; studentId: string; annee: string; trimestre: number;
  justifiedHours: number; unjustifiedHours: number;
}
interface StudentRow { id: string; firstName: string; lastName: string; niveau: string; classe: string; }

interface DailyReport {
  id: string; reportDate: string; fileName: string | null;
  studentsTotal: number; studentsAbsent: number;
  teachersTotal: number; teachersAbsent: number;
  adminTotal: number;   adminAbsent: number;
  workersTotal: number; workersAbsent: number;
  cafeteriaSuspended: boolean | null; createdAt: string;
}

interface DailyStudentAttendance {
  id: string;
  studentId: string;
  studentName: string;
  niveau: string;
  classe: string;
  attendanceDate: string;
  annee: string;
  status: string;
  isAbsent: boolean;
  parentAbsenceReason: string | null;
  parentAbsenceReasonAt: string | null;
}

const RISK_THRESHOLD = 10;

function MiniTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-background/95 border rounded-lg shadow-lg p-2 text-xs">
      {label && <p className="font-bold mb-1">{label}</p>}
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color || p.fill }} className="font-semibold">{p.name}: {p.value}</p>
      ))}
    </div>
  );
}

// ── Daily Upload Zone ─────────────────────────────────────────────────────────
function DailyUploadZone({ onUploaded }: { onUploaded: () => void }) {
  const { toast } = useToast();
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      toast({ variant: "destructive", title: "خطأ", description: "يجب رفع ملف Excel (.xlsx أو .xls)" });
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${BASE}api/absences/daily-upload`, { method: "POST", body: form, credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "فشل الرفع");
      toast({ title: "✅ تم الرفع بنجاح", description: `تاريخ التقرير: ${data.reportDate}` });
      onUploaded();
    } catch (e: any) {
      toast({ variant: "destructive", title: "خطأ في التحليل", description: e.message });
    } finally { setUploading(false); }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
      onClick={() => inputRef.current?.click()}
      className={`relative cursor-pointer rounded-2xl border-2 border-dashed p-8 text-center transition-all duration-200
        ${dragging ? "border-orange-400 bg-orange-50/60 dark:bg-orange-950/20 scale-[1.01]" : "border-muted-foreground/20 hover:border-orange-300 hover:bg-orange-50/30 dark:hover:bg-orange-950/10"}`}
      data-testid="upload-zone-daily-absence"
    >
      <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />

      <AnimatePresence mode="wait">
        {uploading ? (
          <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
            <motion.div className="w-10 h-10 mx-auto rounded-full border-4 border-orange-400 border-t-transparent"
              animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }} />
            <p className="text-sm font-semibold text-orange-600">جاري تحليل الملف...</p>
          </motion.div>
        ) : (
          <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-2">
            <motion.div animate={{ y: [0, -5, 0] }} transition={{ duration: 2.5, repeat: Infinity }}
              className="w-12 h-12 mx-auto rounded-2xl bg-gradient-to-br from-orange-400 to-red-500 flex items-center justify-center shadow-lg shadow-orange-500/25">
              <Upload className="w-5 h-5 text-white" />
            </motion.div>
            <p className="font-bold text-sm">ارفع ملف متابعة الغياب اليومي</p>
            <p className="text-xs text-muted-foreground">النموذج الرسمي — وضعية غيابات التلاميذ والمؤطرين</p>
            <p className="text-[10px] text-muted-foreground/60">Excel .xlsx / .xls</p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Daily Reports List ────────────────────────────────────────────────────────
function DailyReportsList({ reports, onDeleted }: { reports: DailyReport[]; onDeleted: (id: string) => void }) {
  const { toast } = useToast();
  const [deleting, setDeleting] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const handleDelete = async (id: string) => {
    setDeleting(id);
    try {
      await fetch(`${BASE}api/absences/daily/${id}`, { method: "DELETE", credentials: "include" });
      onDeleted(id);
      toast({ title: "تم الحذف" });
    } catch { toast({ variant: "destructive", title: "فشل الحذف" }); }
    finally { setDeleting(null); }
  };

  const shown = expanded ? reports : reports.slice(0, 5);

  if (reports.length === 0) return null;

  const pct = (absent: number, total: number) =>
    total > 0 ? ((absent / total) * 100).toFixed(1) + "%" : "—";

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold flex items-center gap-1.5">
          <FileSpreadsheet className="w-4 h-4 text-orange-500" />
          التقارير اليومية المرفوعة
          <Badge variant="secondary" className="text-[10px]">{reports.length}</Badge>
        </h3>
      </div>

      <div className="space-y-2">
        {shown.map((r, i) => (
          <motion.div key={r.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.04 }}
            className="rounded-xl border bg-card p-3 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs font-bold">{r.reportDate}</p>
                {r.fileName && <p className="text-[10px] text-muted-foreground truncate max-w-[200px]">{r.fileName}</p>}
              </div>
              <div className="flex items-center gap-2">
                {r.cafeteriaSuspended === true && (
                  <Badge variant="destructive" className="text-[9px] py-0.5 px-1.5">الإطعام موقوف</Badge>
                )}
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-red-500"
                  onClick={() => handleDelete(r.id)} disabled={deleting === r.id}
                  data-testid={`button-delete-daily-${r.id}`}>
                  {deleting === r.id
                    ? <motion.div className="w-3 h-3 border border-red-400 border-t-transparent rounded-full"
                        animate={{ rotate: 360 }} transition={{ duration: 0.7, repeat: Infinity, ease: "linear" }} />
                    : <Trash2 className="w-3.5 h-3.5" />}
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {[
                { icon: Users,           label: "التلاميذ",   total: r.studentsTotal, absent: r.studentsAbsent, color: "text-blue-500" },
                { icon: BookOpen,         label: "الأساتذة",   total: r.teachersTotal, absent: r.teachersAbsent, color: "text-violet-500" },
                { icon: Briefcase,        label: "الإداريون",  total: r.adminTotal,    absent: r.adminAbsent,    color: "text-amber-500" },
                { icon: Hammer,           label: "العمال",      total: r.workersTotal,  absent: r.workersAbsent,  color: "text-green-500" },
              ].map(({ icon: Icon, label, total, absent, color }) => (
                <div key={label} className="rounded-lg bg-muted/50 p-2 text-center">
                  <Icon className={`w-3 h-3 mx-auto mb-0.5 ${color}`} />
                  <p className="text-[9px] text-muted-foreground">{label}</p>
                  <p className="text-xs font-bold">{absent}<span className="font-normal text-muted-foreground">/{total}</span></p>
                  <p className={`text-[9px] font-semibold ${color}`}>{pct(absent, total)}</p>
                </div>
              ))}
            </div>
          </motion.div>
        ))}
      </div>

      {reports.length > 5 && (
        <Button variant="ghost" size="sm" className="w-full text-xs gap-1" onClick={() => setExpanded(v => !v)}>
          {expanded ? <><ChevronUp className="w-3 h-3" /> عرض أقل</> : <><ChevronDown className="w-3 h-3" /> عرض الكل ({reports.length})</>}
        </Button>
      )}
    </motion.div>
  );
}

// ── Daily Trend Chart ─────────────────────────────────────────────────────────
function DailyTrendChart({ reports }: { reports: DailyReport[] }) {
  if (reports.length < 2) return null;
  const data = [...reports].reverse().slice(-14).map(r => ({
    date: r.reportDate.slice(5), // MM-DD
    تلاميذ: r.studentsAbsent,
    أساتذة: r.teachersAbsent,
  }));
  return (
    <Card className="border-0 shadow-md bg-gradient-to-br from-card to-muted/20">
      <CardHeader className="pb-1 pt-3 px-4">
        <CardTitle className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
          <TrendingUp className="w-3.5 h-3.5 text-orange-500" /> منحنى الغياب اليومي (آخر 14 يوم)
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0 pb-3 px-2">
        <ResponsiveContainer width="100%" height={160}>
          <LineChart data={data} margin={{ left: -20, right: 10 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
            <XAxis dataKey="date" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
            <Tooltip content={<MiniTooltip />} />
            <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 10 }} />
            <Line type="monotone" dataKey="تلاميذ" stroke="#f97316" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="أساتذة"  stroke="#8b5cf6" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function AbsencesPage() {
  const [absences, setAbsences]   = useState<AbsenceRow[]>([]);
  const [students, setStudents]   = useState<StudentRow[]>([]);
  const [dailyReports, setDailyReports] = useState<DailyReport[]>([]);
  const [dailyStudentAttendance, setDailyStudentAttendance] = useState<DailyStudentAttendance[]>([]);
  const [annee, setAnnee]         = useState(DEFAULT_YEAR);
  const [trimestre, setTrimestre] = useState<string>("");
  const [loading, setLoading]     = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [aRes, sRes, dRes, studentAttendanceRes] = await Promise.all([
        fetch(`${BASE}api/absences?annee=${annee}`, { credentials: "include" }),
        fetch(`${BASE}api/students?annee=${annee}`, { credentials: "include" }),
        fetch(`${BASE}api/absences/daily`, { credentials: "include" }),
        fetch(`${BASE}api/absences/daily-students`, { credentials: "include" }),
      ]);
      if (aRes.ok) setAbsences(await aRes.json());
      if (sRes.ok) { const d = await sRes.json(); setStudents(d.students ?? d); }
      if (dRes.ok) setDailyReports(await dRes.json());
      if (studentAttendanceRes.ok) setDailyStudentAttendance(await studentAttendanceRes.json());
    } finally { setLoading(false); }
  }, [annee]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    let active = true;
    let disconnect = () => undefined;
    void connectAttendanceUpdates(() => { void fetchAll(); }).then(cleanup => {
      if (active) disconnect = cleanup;
      else cleanup();
    }).catch(() => undefined);
    return () => {
      active = false;
      disconnect();
    };
  }, [fetchAll]);

  const studentMap = Object.fromEntries(students.map(s => [s.id, s]));
  const dailyAbsenceReplies = dailyStudentAttendance
    .filter(record => record.annee === annee && record.isAbsent)
    .sort((a, b) => b.attendanceDate.localeCompare(a.attendanceDate));
  const filtered   = trimestre ? absences.filter(a => a.trimestre === parseInt(trimestre)) : absences;

  const totals: Record<string, { justified: number; unjustified: number; total: number }> = {};
  for (const a of filtered) {
    totals[a.studentId] ??= { justified: 0, unjustified: 0, total: 0 };
    totals[a.studentId]!.justified   += a.justifiedHours;
    totals[a.studentId]!.unjustified += a.unjustifiedHours;
    totals[a.studentId]!.total       += a.justifiedHours + a.unjustifiedHours;
  }

  const rows = Object.entries(totals)
    .map(([id, t]) => ({ id, ...t, student: studentMap[id] }))
    .filter(r => r.student)
    .sort((a, b) => b.total - a.total);

  const maxTotal = rows.reduce((m, r) => Math.max(m, r.total), 1);
  const atRisk   = rows.filter(r => r.unjustified >= RISK_THRESHOLD).length;
  const totalJ   = rows.reduce((s, r) => s + r.justified,   0);
  const totalU   = rows.reduce((s, r) => s + r.unjustified, 0);

  const pieData = [
    { name: "مبررة",     value: totalJ, fill: "#10b981" },
    { name: "غير مبررة", value: totalU, fill: "#f43f5e" },
  ].filter(d => d.value > 0);

  const top5 = rows.slice(0, 5).map(r => ({
    name: (r.student?.firstName ?? "") + " " + (r.student?.lastName ?? ""),
    justified: r.justified, unjustified: r.unjustified,
  }));

  const levelStats: Record<string, { justified: number; unjustified: number }> = {};
  for (const row of rows) {
    const lvl = row.student?.niveau ?? "?";
    levelStats[lvl] ??= { justified: 0, unjustified: 0 };
    levelStats[lvl]!.justified   += row.justified;
    levelStats[lvl]!.unjustified += row.unjustified;
  }
  const levelData = Object.entries(levelStats)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([lvl, d]) => ({ name: lvl, مبررة: d.justified, "غير مبررة": d.unjustified }));

  return (
    <>
    <motion.div
      initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
      className="p-6 space-y-6 max-w-5xl mx-auto"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <span className="inline-flex w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500 to-red-600 items-center justify-center shadow-lg shadow-orange-500/30">
              <CalendarOff className="w-5 h-5 text-white" />
            </span>
            متابعة الغياب
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5 ms-11">التقارير اليومية الرسمية وسجل غيابات التلاميذ</p>
        </motion.div>
        <div className="flex items-center gap-2">
          <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
            <Button variant="outline" size="sm" className="gap-2 h-9 text-xs font-semibold no-print" onClick={() => window.print()} data-testid="button-print-absences">
              <Printer className="w-3.5 h-3.5" /> طباعة PDF
            </Button>
          </motion.div>
        </div>
      </div>

      {/* ── SECTION 1: Daily Ministry Form Upload ──────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
        className="rounded-2xl border bg-gradient-to-br from-orange-50/60 to-red-50/30 dark:from-orange-950/20 dark:to-red-950/10 p-4 space-y-4">
        <div className="flex items-center gap-2">
          <UtensilsCrossed className="w-4 h-4 text-orange-500" />
          <h2 className="text-sm font-bold">وضعية الغيابات اليومية</h2>
          <span className="text-xs text-muted-foreground">— النموذج الرسمي لوزارة التربية</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <DailyUploadZone onUploaded={fetchAll} />
          <DailyReportsList
            reports={dailyReports}
            onDeleted={id => setDailyReports(r => r.filter(x => x.id !== id))}
          />
        </div>

        {dailyReports.length > 1 && (
          <DailyTrendChart reports={dailyReports} />
        )}
      </motion.div>

      <Card className="border-red-200/70 dark:border-red-900/50">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <div>
            <CardTitle className="text-sm">غيابات التلاميذ وردود الأولياء</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">سنة {annee}</p>
          </div>
          <Badge variant="secondary">{dailyAbsenceReplies.filter(record => record.parentAbsenceReason).length} رد</Badge>
        </CardHeader>
        <CardContent className="space-y-2">
          {dailyAbsenceReplies.length === 0 ? (
            <p className="rounded-lg border border-dashed p-5 text-center text-xs text-muted-foreground">لا توجد غيابات يومية مسجلة لهذه السنة.</p>
          ) : dailyAbsenceReplies.map(record => (
            <div key={record.id} className="grid gap-2 rounded-xl border bg-muted/20 p-3 sm:grid-cols-[1fr_auto] sm:items-center">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-bold">{record.studentName}</span>
                  <Badge variant="outline" className="text-[10px]">{record.niveau} · {record.classe}</Badge>
                  <span className="text-xs text-muted-foreground">{record.attendanceDate}</span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">رد ولي الأمر</p>
                <p className={`text-sm ${record.parentAbsenceReason ? "text-foreground" : "text-amber-600 dark:text-amber-400"}`}>
                  {record.parentAbsenceReason || "لم يرسل ولي الأمر سبب الغياب بعد"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {record.parentAbsenceReasonAt && <span className="text-[10px] text-muted-foreground">{new Date(record.parentAbsenceReasonAt).toLocaleString("ar-DZ")}</span>}
                <StudentHealthDialog
                  studentId={record.studentId}
                  studentName={record.studentName}
                  docType="absence_justification"
                />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* ── SECTION 2: Per-student absence tracker ─────────────────────────── */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-red-500" />
          <h2 className="text-sm font-bold">غيابات التلاميذ (بالساعات)</h2>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "إجمالي التلاميذ",    value: rows.length, bg: "from-blue-500 to-indigo-600",    shadow: "shadow-blue-500/25" },
            { label: "ساعات مبررة",         value: totalJ,      bg: "from-emerald-500 to-green-600",  shadow: "shadow-emerald-500/25", suffix: "h" },
            { label: "ساعات غير مبررة",     value: totalU,      bg: "from-red-500 to-rose-600",       shadow: "shadow-red-500/25", suffix: "h" },
            { label: "تلاميذ في خطر",       value: atRisk,      bg: "from-orange-500 to-amber-600",   shadow: "shadow-orange-500/25" },
          ].map((c, i) => (
            <motion.div key={i}
              initial={{ opacity: 0, y: 16, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: i * 0.07 }} whileHover={{ y: -3, scale: 1.02 }}>
              <Card className={`border-0 shadow-lg ${c.shadow} overflow-hidden`}>
                <div className={`bg-gradient-to-br ${c.bg} p-4 relative overflow-hidden`}>
                  <div className="absolute -top-4 -right-4 w-14 h-14 rounded-full bg-white/10 blur-xl" />
                  <p className="text-white/70 text-xs font-semibold mb-1">{c.label}</p>
                  <p className="text-3xl font-extrabold text-white">{c.value}{c.suffix ?? ""}</p>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Charts */}
        {!loading && rows.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
            className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="border-0 shadow-md bg-gradient-to-br from-card to-muted/20">
              <CardHeader className="pb-1 pt-3 px-4">
                <CardTitle className="text-xs font-bold text-muted-foreground">نسبة الغيابات</CardTitle>
              </CardHeader>
              <CardContent className="p-0 pb-3">
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={42} outerRadius={62}
                      paddingAngle={4} dataKey="value" animationDuration={800}>
                      {pieData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                    </Pie>
                    <Tooltip content={<MiniTooltip />} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {levelData.length > 0 && (
              <Card className="border-0 shadow-md bg-gradient-to-br from-card to-muted/20">
                <CardHeader className="pb-1 pt-3 px-4">
                  <CardTitle className="text-xs font-bold text-muted-foreground">الغيابات حسب المستوى</CardTitle>
                </CardHeader>
                <CardContent className="p-0 pb-3 px-2">
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={levelData} barSize={14} margin={{ left: -20 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
                      <Tooltip content={<MiniTooltip />} />
                      <Bar dataKey="مبررة"     fill="#10b981" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="غير مبررة" fill="#f43f5e" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {top5.length > 0 && (
              <Card className="border-0 shadow-md bg-gradient-to-br from-card to-muted/20">
                <CardHeader className="pb-1 pt-3 px-4">
                  <CardTitle className="text-xs font-bold text-muted-foreground">الأكثر غياباً (أول 5)</CardTitle>
                </CardHeader>
                <CardContent className="p-0 pb-3 px-2">
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={top5} layout="vertical" barSize={10} margin={{ left: 0, right: 10 }}>
                      <XAxis type="number" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} width={60}
                        axisLine={false} tickLine={false}
                        tickFormatter={(v: string) => v.split(" ").slice(0, 2).join(" ")} />
                      <Tooltip content={<MiniTooltip />} />
                      <Bar dataKey="justified"   name="مبررة"     fill="#10b981" radius={[0, 3, 3, 0]} stackId="a" />
                      <Bar dataKey="unjustified" name="غير مبررة" fill="#f43f5e" radius={[0, 3, 3, 0]} stackId="a" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}
          </motion.div>
        )}

        {/* Filters */}
        <motion.div className="flex gap-3 flex-wrap" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }}>
          <Select value={annee} onValueChange={v => { setAnnee(v); setTrimestre(""); }}>
            <SelectTrigger className="w-36 font-semibold border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 bg-red-50/50 dark:bg-red-950/30 text-xs h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ACADEMIC_YEARS.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={trimestre || "__all__"} onValueChange={v => setTrimestre(v === "__all__" ? "" : v)}>
            <SelectTrigger className="w-40 bg-gradient-to-r from-slate-600 to-slate-800 text-white border-0 font-semibold text-xs h-9">
              <SelectValue placeholder="كل الفصول" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">كل الفصول</SelectItem>
              <SelectItem value="1">الفصل 1</SelectItem>
              <SelectItem value="2">الفصل 2</SelectItem>
              <SelectItem value="3">الفصل 3</SelectItem>
            </SelectContent>
          </Select>
        </motion.div>

        {/* Student list */}
        <AnimatePresence mode="wait">
          {loading ? (
            <motion.div key="loading" className="space-y-2">
              {[...Array(4)].map((_, i) => (
                <motion.div key={i} className="h-14 rounded-xl bg-muted"
                  animate={{ opacity: [0.3, 0.6, 0.3] }} transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.1 }} />
              ))}
            </motion.div>
          ) : rows.length === 0 ? (
            <motion.div key="empty"
              initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
              className="rounded-2xl border border-dashed p-12 text-center text-muted-foreground">
              <motion.div animate={{ y: [0, -8, 0] }} transition={{ duration: 3, repeat: Infinity }}>
                <CalendarOff className="w-12 h-12 mx-auto mb-3 opacity-20" />
              </motion.div>
              <p className="font-semibold text-sm">لا توجد غيابات مسجلة بالساعات</p>
              <p className="text-xs mt-1">سجّل الغيابات من صفحة نتائج التلاميذ</p>
            </motion.div>
          ) : (
            <motion.div key="list" className="space-y-2">
              {rows.map((row, i) => {
                const risk = row.unjustified >= RISK_THRESHOLD;
                const jPct = (row.justified  / maxTotal) * 100;
                const uPct = (row.unjustified / maxTotal) * 100;
                return (
                  <motion.div key={row.id}
                    initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className={`rounded-xl border p-4 ${risk ? "border-red-200 dark:border-red-900 bg-red-50/40 dark:bg-red-950/10" : "bg-card"}`}>
                    <div className="flex items-center gap-3 mb-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${risk ? "bg-red-100 dark:bg-red-950" : "bg-muted"}`}>
                        {risk ? <AlertTriangle className="w-4 h-4 text-red-500" /> : <CheckCircle className="w-4 h-4 text-emerald-500" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate">{row.student!.firstName} {row.student!.lastName}</p>
                        <p className="text-xs text-muted-foreground">{row.student!.niveau} — {row.student!.classe}</p>
                      </div>
                      <div className="text-end shrink-0">
                        <p className={`text-lg font-black ${risk ? "text-red-600" : "text-foreground"}`}>{row.total}h</p>
                        <p className="text-[10px] text-muted-foreground">إجمالي</p>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-emerald-600 w-20 shrink-0">مبررة: {row.justified}h</span>
                        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                          <motion.div className="h-full bg-emerald-500 rounded-full"
                            initial={{ width: 0 }} animate={{ width: `${jPct}%` }}
                            transition={{ delay: i * 0.04 + 0.3, duration: 0.6, ease: "easeOut" }} />
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-red-500 w-20 shrink-0">غير مبررة: {row.unjustified}h</span>
                        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                          <motion.div className="h-full bg-red-500 rounded-full"
                            initial={{ width: 0 }} animate={{ width: `${uPct}%` }}
                            transition={{ delay: i * 0.04 + 0.4, duration: 0.6, ease: "easeOut" }} />
                        </div>
                      </div>
                    </div>
                    {risk && (
                      <motion.p className="text-xs text-red-600 dark:text-red-400 mt-2 font-medium"
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}>
                        ⚠ تجاوز حد الغيابات غير المبررة ({RISK_THRESHOLD} ساعات)
                      </motion.p>
                    )}
                  </motion.div>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
    </>
  );
}
