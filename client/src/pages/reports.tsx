import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "@/contexts/language-provider";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  FileText, Printer, Users, UserCheck, UserX, Award, TrendingUp,
  BarChart3, School, Calendar, GraduationCap, Activity,
  CalendarOff, Target, AlertTriangle, Trophy, Repeat2,
  UserPlus, Settings2, BookOpen, ClipboardList,
} from "lucide-react";
import { ClassLevelReport } from "@/components/class-level-report";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, RadialBarChart, RadialBar,
} from "recharts";
import { CountUp } from "@/components/count-up";
import { SCHOOL_STAGE } from "@/lib/deployment";
import type { DashboardStats, SchoolInfo, StudentResult } from "@shared/types";

const BASE = import.meta.env.BASE_URL;
const ACADEMIC_YEARS = ["2026-2027", "2025-2026", "2024-2025", "2023-2024", "2022-2023"];
const LEVEL_LABELS: Record<string, string> = {
  "1AM": "1 AM", "2AM": "2 AM", "3AM": "3 AM", "4AM": "4 AM",
  "1AS": "1 AS", "2AS": "2 AS", "3AS": "3 AS",
};
const LEVEL_COLORS = ["#6366f1", "#8b5cf6", "#a855f7", "#d946ef"];
const GENDER_COLORS = ["#3b82f6", "#ec4899"];

// ─── Section configuration ──────────────────────────────────────────────────
const ALL_SECTIONS = [
  { id: "school",      label: "معلومات المؤسسة",        icon: School,         color: "from-blue-500 to-cyan-600" },
  { id: "students",    label: "إحصائيات التلاميذ",      icon: Users,          color: "from-violet-500 to-purple-600" },
  { id: "results",     label: "النتائج الإجمالية",      icon: Award,          color: "from-emerald-500 to-teal-600" },
  { id: "progress",    label: "شريط التقدم",            icon: TrendingUp,     color: "from-sky-500 to-blue-600" },
  { id: "charts",      label: "الرسوم البيانية",        icon: BarChart3,      color: "from-fuchsia-500 to-pink-600" },
  { id: "levels",      label: "تفصيل حسب المستوى",      icon: GraduationCap,  color: "from-orange-500 to-amber-600" },
  { id: "success_lvl", label: "نسبة النجاح بالمستوى",  icon: Target,         color: "from-lime-500 to-green-600" },
  { id: "top",         label: "أفضل التلاميذ",          icon: Trophy,         color: "from-yellow-500 to-orange-500" },
  { id: "dist",        label: "توزيع المعدلات",         icon: Activity,       color: "from-rose-500 to-red-600" },
  { id: "absences",    label: "الغيابات",               icon: CalendarOff,    color: "from-amber-500 to-orange-600" },
  { id: "classreport", label: "تقرير القسم / المستوى",  icon: ClipboardList,  color: "from-indigo-500 to-violet-600" },
] as const;

type SectionId = typeof ALL_SECTIONS[number]["id"];
const DEFAULT_SECTIONS = new Set<SectionId>(ALL_SECTIONS.map(s => s.id));

// ─── Helpers ─────────────────────────────────────────────────────────────────
function MiniTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-background/95 border rounded-lg shadow-xl p-2.5 text-xs backdrop-blur-sm">
      {label && <p className="font-bold mb-1 text-foreground">{label}</p>}
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color || p.fill }} className="font-semibold">
          {p.name}: {p.value}
        </p>
      ))}
    </div>
  );
}

function KpiCard({ label, value, icon: Icon, gradient, suffix = "", big = false }: {
  label: string; value: number; icon: any; gradient: string; suffix?: string; big?: boolean;
}) {
  return (
    <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${gradient} p-4 shadow-lg print-section`}>
      <div className="absolute inset-0 opacity-20" style={{
        backgroundImage: "radial-gradient(circle at 80% 20%, rgba(255,255,255,0.4) 0%, transparent 60%)",
      }} />
      <div className="relative flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <p className="text-white/80 text-xs font-semibold leading-tight">{label}</p>
          <div className="w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center">
            <Icon className="w-3.5 h-3.5 text-white" />
          </div>
        </div>
        <p className={`text-white font-black ${big ? "text-4xl" : "text-3xl"} leading-none mt-1`}>
          <CountUp to={value} />{suffix}
        </p>
      </div>
    </div>
  );
}

function SectionHeader({ icon: Icon, title, color }: { icon: any; title: string; color: string }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center shadow-md`}>
        <Icon className="w-4.5 h-4.5 text-white" />
      </div>
      <h2 className="text-base font-bold text-foreground">{title}</h2>
      <div className="flex-1 h-px bg-gradient-to-r from-border to-transparent" />
    </div>
  );
}

interface AbsenceRow {
  studentId: string; trimestre: number;
  justifiedHours: number; unjustifiedHours: number;
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function ReportsPage() {
  const { t } = useLanguage();
  const [year, setYear] = useState(() => localStorage.getItem("cem-selected-year") || "2026-2027");
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [school, setSchool] = useState<SchoolInfo | null>(null);
  const [absences, setAbsences] = useState<AbsenceRow[]>([]);
  const [results, setResults] = useState<StudentResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [sections, setSections] = useState<Set<SectionId>>(DEFAULT_SECTIONS);
  const [panelOpen, setPanelOpen] = useState(true);

  const fetchAll = useCallback(async (y: string) => {
    setLoading(true);
    try {
      const [sRes, schRes, aRes, rRes] = await Promise.all([
        fetch(`${BASE}api/stats?annee=${y}`, { credentials: "include" }),
        fetch(`${BASE}api/school`, { credentials: "include" }),
        fetch(`${BASE}api/absences?annee=${y}`, { credentials: "include" }),
        fetch(`${BASE}api/results?annee=${y}`, { credentials: "include" }),
      ]);
      if (sRes.ok) setStats(await sRes.json()); else setStats(null);
      if (schRes.ok) setSchool(await schRes.json());
      if (aRes.ok) setAbsences(await aRes.json());
      if (rRes.ok) setResults(await rRes.json());
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchAll(year);
    localStorage.setItem("cem-selected-year", year);
  }, [year, fetchAll]);

  const toggleSection = (id: SectionId) =>
    setSections(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const has = (id: SectionId) => sections.has(id);

  // ── Derived data ──
  const withAvg = results.filter(r => r.annualAvg !== null);
  const successRate = stats && (stats.admis + stats.nonAdmis) > 0
    ? Math.round((stats.admis / (stats.admis + stats.nonAdmis)) * 100) : null;

  const genderData = stats ? [
    { name: "ذكور", value: stats.boys, fill: GENDER_COLORS[0] },
    { name: "إناث", value: stats.girls, fill: GENDER_COLORS[1] },
  ] : [];

  const levelData = stats?.byLevel.map((l, i) => ({
    name: LEVEL_LABELS[l.niveau] || l.niveau,
    total: l.total, ذكور: l.boys, إناث: l.girls,
    fill: LEVEL_COLORS[i % LEVEL_COLORS.length],
  })) || [];

  const successByLevel = stats?.byLevel
    .filter(l => l.admis + l.nonAdmis > 0)
    .map((l, i) => ({
      name: LEVEL_LABELS[l.niveau] || l.niveau,
      "نسبة النجاح": Math.round((l.admis / (l.admis + l.nonAdmis)) * 100),
      fill: LEVEL_COLORS[i % LEVEL_COLORS.length],
    })) || [];

  const topStudents = [...withAvg]
    .sort((a, b) => (b.annualAvg ?? 0) - (a.annualAvg ?? 0))
    .slice(0, 10);

  // Grade distribution (buckets of 2)
  const gradeDist = Array.from({ length: 10 }, (_, i) => {
    const min = i * 2; const max = min + 2;
    return {
      name: `${min}-${max}`,
      count: withAvg.filter(r => (r.annualAvg ?? -1) >= min && (r.annualAvg ?? -1) < max).length,
    };
  });

  const totalAbsJust = absences.reduce((s, a) => s + a.justifiedHours, 0);
  const totalAbsUnjust = absences.reduce((s, a) => s + a.unjustifiedHours, 0);
  const atRisk = new Set(absences.filter(a => a.unjustifiedHours >= 10).map(a => a.studentId)).size;
  const absenceByTrim = [1, 2, 3].map(t => {
    const rows = absences.filter(a => a.trimestre === t);
    return {
      name: `ف${t}`,
      مبررة: rows.reduce((s, a) => s + a.justifiedHours, 0),
      "غير مبررة": rows.reduce((s, a) => s + a.unjustifiedHours, 0),
    };
  });

  const today = new Date().toLocaleDateString("ar-DZ", { year: "numeric", month: "long", day: "numeric" });

  // Per-level/class gender breakdown from results (for horizontal bar charts)
  const classByLevel: Record<string, { classe: string; ذكور: number; إناث: number }[]> = {};
  for (const r of results) {
    const { niveau, classe, sexe } = r.student;
    classByLevel[niveau] ??= [];
    const row = classByLevel[niveau]!.find(c => c.classe === classe);
    if (row) { if (sexe === "M") row["ذكور"]++; else row["إناث"]++; }
    else classByLevel[niveau]!.push({ classe, "ذكور": sexe === "M" ? 1 : 0, "إناث": sexe === "F" ? 1 : 0 });
  }
  for (const arr of Object.values(classByLevel)) arr.sort((a, b) => a.classe.localeCompare(b.classe));

  return (
    <div className="flex min-h-full bg-background">
      {/* ── Section selector panel ── */}
      <AnimatePresence initial={false}>
        {panelOpen && (
          <motion.aside
            key="panel"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 256, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="no-print shrink-0 overflow-hidden"
          >
            <div className="w-64 h-full border-l bg-card/70 backdrop-blur-sm flex flex-col">
              <div className="p-4 border-b">
                <div className="flex items-center gap-2 mb-1">
                  <Settings2 className="w-4 h-4 text-violet-500" />
                  <p className="font-bold text-sm">تخصيص التقرير</p>
                </div>
                <p className="text-[11px] text-muted-foreground">اختر الأقسام التي تريد تضمينها</p>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
                {ALL_SECTIONS.map(s => (
                  <button
                    key={s.id}
                    onClick={() => toggleSection(s.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-right transition-all duration-150
                      ${has(s.id)
                        ? "bg-gradient-to-r from-violet-500/10 to-purple-500/5 border border-violet-500/20 text-foreground"
                        : "text-muted-foreground hover:bg-muted/50 border border-transparent"
                      }`}
                  >
                    <div className={`w-6 h-6 rounded-lg bg-gradient-to-br ${s.color} flex items-center justify-center shrink-0 shadow-sm transition-opacity ${has(s.id) ? "opacity-100" : "opacity-40"}`}>
                      <s.icon className="w-3 h-3 text-white" />
                    </div>
                    <span className="flex-1 font-medium text-xs">{s.label}</span>
                    <div className={`w-4 h-4 rounded-full border-2 shrink-0 transition-all
                      ${has(s.id) ? "border-violet-500 bg-violet-500" : "border-muted-foreground/30"}`}>
                      {has(s.id) && <div className="w-full h-full rounded-full flex items-center justify-center">
                        <div className="w-1.5 h-1.5 rounded-full bg-white" />
                      </div>}
                    </div>
                  </button>
                ))}
              </div>
              <div className="p-3 border-t space-y-2">
                <Button size="sm" variant="outline" className="w-full text-xs h-8"
                  onClick={() => setSections(DEFAULT_SECTIONS)}>
                  تحديد الكل
                </Button>
                <Button size="sm" variant="ghost" className="w-full text-xs h-8 text-muted-foreground"
                  onClick={() => setSections(new Set())}>
                  إلغاء الكل
                </Button>
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* ── Main report area ── */}
      <div className="flex-1 min-w-0 overflow-auto">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="p-6 space-y-7 max-w-5xl mx-auto"
        >
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 no-print">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setPanelOpen(o => !o)}
                className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/30 hover:scale-105 transition-transform"
              >
                <Settings2 className="w-4.5 h-4.5 text-white" />
              </button>
              <div>
                <h1 className="text-2xl font-black bg-gradient-to-r from-violet-600 to-purple-500 bg-clip-text text-transparent flex items-center gap-2">
                  <FileText className="w-6 h-6 text-violet-500" />
                  التقارير الشاملة
                </h1>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {sections.size} قسم محدد من {ALL_SECTIONS.length}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Select value={year} onValueChange={setYear}>
                <SelectTrigger className="w-36 h-9 bg-gradient-to-r from-violet-600 to-purple-600 text-white border-0 shadow-lg shadow-violet-500/25 font-semibold text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACADEMIC_YEARS.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button
                onClick={() => window.print()}
                className="gap-2 h-9 font-semibold text-xs bg-gradient-to-r from-emerald-500 to-green-600 text-white border-0 shadow-md shadow-emerald-500/25 hover:from-emerald-600 hover:to-green-700"
                data-testid="button-print-report"
              >
                <Printer className="w-4 h-4" />
                طباعة PDF
              </Button>
            </div>
          </div>

          {/* Print-only header */}
          <div className="hidden print-only print-section border-b pb-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-black">التقرير السنوي الشامل</h1>
                <p className="text-sm text-gray-600">السنة الدراسية: {year}</p>
              </div>
              <p className="text-sm text-gray-500">تاريخ الطباعة: {today}</p>
            </div>
          </div>

          {loading ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[...Array(8)].map((_, i) => (
                <motion.div key={i} className="h-24 rounded-2xl bg-muted"
                  animate={{ opacity: [0.4, 0.7, 0.4] }}
                  transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.1 }} />
              ))}
            </div>
          ) : !stats || stats.total === 0 ? (
            <div className="text-center py-24">
              <motion.div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-violet-500/20 to-purple-500/10 flex items-center justify-center mx-auto mb-5 border border-violet-500/20"
                animate={{ y: [0, -10, 0] }} transition={{ duration: 3, repeat: Infinity }}>
                <FileText className="w-12 h-12 text-violet-400" />
              </motion.div>
              <p className="text-muted-foreground text-lg font-semibold">لا توجد بيانات لهذه السنة الدراسية</p>
              <p className="text-sm text-muted-foreground mt-1 opacity-70">استورد بيانات التلاميذ وأدخل النقاط لرؤية التقرير</p>
            </div>
          ) : (
            <div className="space-y-8">

              {/* ── School Info ── */}
              {has("school") && school && (
                <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="print-section">
                  <SectionHeader icon={School} title="معلومات المؤسسة" color="from-blue-500 to-cyan-600" />
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                      { label: "المؤسسة", value: school.nom, icon: School, gradient: "from-blue-600 to-blue-800" },
                      { label: "الولاية / البلدية", value: `${school.wilaya} / ${school.commune}`, icon: Target, gradient: "from-indigo-600 to-violet-700" },
                      { label: "السنة الدراسية", value: school.annee, icon: Calendar, gradient: "from-violet-600 to-purple-700" },
                      ...(school.directeur ? [{ label: "المدير", value: school.directeur, icon: GraduationCap, gradient: "from-cyan-600 to-blue-700" }] : []),
                    ].map((item, i) => (
                      <div key={i} className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${item.gradient} p-4 shadow-lg`}>
                        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "radial-gradient(circle at 80% 20%, rgba(255,255,255,0.4) 0%, transparent 60%)" }} />
                        <div className="relative">
                          <item.icon className="w-5 h-5 text-white/70 mb-2" />
                          <p className="text-white/70 text-[10px] font-semibold uppercase tracking-wide">{item.label}</p>
                          <p className="text-white font-bold text-sm mt-0.5 leading-snug">{item.value}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.section>
              )}

              {/* ── Student Stats ── */}
              {has("students") && (
                <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }} className="print-section">
                  <SectionHeader icon={Users} title={`إحصائيات التلاميذ — ${year}`} color="from-violet-500 to-purple-600" />
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                    <KpiCard label="مجموع التلاميذ" value={stats.total} icon={Users} gradient="from-violet-600 to-purple-700" big />
                    <KpiCard label="ذكور" value={stats.boys} icon={Users} gradient="from-blue-600 to-sky-700" />
                    <KpiCard label="إناث" value={stats.girls} icon={Users} gradient="from-pink-600 to-rose-700" />
                    <KpiCard label="جدد" value={stats.nouveau} icon={UserPlus} gradient="from-cyan-600 to-teal-700" />
                    <KpiCard label="معيدون" value={stats.redoublant} icon={Repeat2} gradient="from-orange-500 to-amber-600" />
                  </div>
                </motion.section>
              )}

              {/* ── Overall Results ── */}
              {has("results") && (stats.admis > 0 || stats.nonAdmis > 0) && (
                <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="print-section">
                  <SectionHeader icon={Award} title="النتائج الإجمالية" color="from-emerald-500 to-teal-600" />
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {successRate !== null && (
                      <KpiCard label="نسبة النجاح" value={successRate} suffix="%" icon={Award} gradient="from-emerald-500 to-green-600" big />
                    )}
                    <KpiCard label="الناجحون" value={stats.admis} icon={UserCheck} gradient="from-emerald-600 to-teal-700" />
                    <KpiCard label="المستدركون" value={stats.mustarrak ?? 0} icon={TrendingUp} gradient="from-amber-500 to-yellow-600" />
                    <KpiCard label="الراسبون" value={stats.nonAdmis} icon={UserX} gradient="from-red-600 to-rose-700" />
                  </div>
                </motion.section>
              )}

              {/* ── Progress bar ── */}
              {has("progress") && (stats.admis > 0 || stats.nonAdmis > 0) && (
                <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }} className="print-section">
                  <SectionHeader icon={TrendingUp} title="توزيع النتائج" color="from-sky-500 to-blue-600" />
                  <Card className="border-0 bg-card/80 shadow-md">
                    <CardContent className="pt-5 pb-4">
                      <div className="flex items-center justify-between mb-3 text-sm">
                        <span className="font-bold text-emerald-600 flex items-center gap-1.5">
                          <UserCheck className="w-3.5 h-3.5" /> ناجح: {stats.admis}
                        </span>
                        {(stats.mustarrak ?? 0) > 0 && (
                          <span className="font-bold text-amber-600 flex items-center gap-1.5">
                            <TrendingUp className="w-3.5 h-3.5" /> مستدرك: {stats.mustarrak}
                          </span>
                        )}
                        <span className="font-bold text-red-500 flex items-center gap-1.5">
                          <UserX className="w-3.5 h-3.5" /> راسب: {stats.nonAdmis}
                        </span>
                      </div>
                      <div className="h-6 rounded-full bg-muted overflow-hidden flex gap-0.5">
                        <motion.div className="h-full bg-gradient-to-r from-emerald-400 to-green-500 rounded-full"
                          initial={{ width: 0 }} animate={{ width: `${(stats.admis / stats.total) * 100}%` }}
                          transition={{ duration: 1.2, ease: "easeOut", delay: 0.3 }} />
                        {(stats.mustarrak ?? 0) > 0 && (
                          <motion.div className="h-full bg-gradient-to-r from-amber-400 to-yellow-500 rounded-full"
                            initial={{ width: 0 }} animate={{ width: `${((stats.mustarrak ?? 0) / stats.total) * 100}%` }}
                            transition={{ duration: 1.2, ease: "easeOut", delay: 0.4 }} />
                        )}
                        <motion.div className="h-full bg-gradient-to-r from-red-400 to-rose-500 rounded-full"
                          initial={{ width: 0 }} animate={{ width: `${(stats.nonAdmis / stats.total) * 100}%` }}
                          transition={{ duration: 1.2, ease: "easeOut", delay: 0.5 }} />
                      </div>
                      <div className="flex justify-center mt-2 text-xs text-muted-foreground">
                        {successRate !== null && `نسبة النجاح: ${successRate}%`}
                      </div>
                    </CardContent>
                  </Card>
                </motion.section>
              )}

              {/* ── Charts ── */}
              {has("charts") && (
                <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14 }} className="print-section">
                  <SectionHeader icon={BarChart3} title="الرسوم البيانية" color="from-fuchsia-500 to-pink-600" />
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {/* Gender pie */}
                    {(stats.boys > 0 || stats.girls > 0) && (
                      <Card className="border-0 bg-card/80 shadow-md">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-bold flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-blue-500" />توزيع الجنس
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <ResponsiveContainer width="100%" height={180}>
                            <PieChart>
                              <Pie data={genderData} cx="50%" cy="50%" innerRadius={48} outerRadius={72}
                                paddingAngle={4} dataKey="value" animationDuration={700}>
                                {genderData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                              </Pie>
                              <Tooltip content={<MiniTooltip />} />
                              <Legend iconType="circle" iconSize={8} />
                            </PieChart>
                          </ResponsiveContainer>
                        </CardContent>
                      </Card>
                    )}
                    {/* Level bar */}
                    {levelData.length > 0 && (
                      <Card className="border-0 bg-card/80 shadow-md">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-bold flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-violet-500" />التلاميذ حسب المستوى
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <ResponsiveContainer width="100%" height={180}>
                            <BarChart data={levelData} barSize={16}>
                              <CartesianGrid strokeDasharray="3 3" opacity={0.08} />
                              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                              <YAxis tick={{ fontSize: 10 }} />
                              <Tooltip content={<MiniTooltip />} />
                              <Bar dataKey="ذكور" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                              <Bar dataKey="إناث" fill="#ec4899" radius={[3, 3, 0, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </CardContent>
                      </Card>
                    )}
                    {/* Success radial */}
                    {successRate !== null && (
                      <Card className="border-0 bg-card/80 shadow-md">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-bold flex items-center gap-2">
                            <Award className="w-3.5 h-3.5 text-emerald-500" />نسبة النجاح الكلية
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="flex flex-col items-center">
                          <ResponsiveContainer width="100%" height={140}>
                            <RadialBarChart cx="50%" cy="80%" innerRadius="60%" outerRadius="90%"
                              startAngle={180} endAngle={0}
                              data={[{ value: successRate, fill: "#10b981" }]}>
                              <RadialBar dataKey="value" cornerRadius={6} />
                            </RadialBarChart>
                          </ResponsiveContainer>
                          <p className="text-3xl font-black text-emerald-600 -mt-6">{successRate}%</p>
                          <p className="text-xs text-muted-foreground mt-1">من {stats.admis + stats.nonAdmis} تلميذ لديهم نتيجة</p>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                </motion.section>
              )}

              {/* ── Per-level breakdown — horizontal bar charts ── */}
              {has("levels") && stats.byLevel.length > 0 && (
                <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }} className="print-section">
                  <SectionHeader icon={GraduationCap} title="تفصيل حسب المستوى" color="from-orange-500 to-amber-600" />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {stats.byLevel.map((lvl, li) => {
                      const dotColor = LEVEL_COLORS[li % LEVEL_COLORS.length];
                      const rows = (classByLevel[lvl.niveau] || []).map(c => ({
                        name: c.classe,
                        ذكور: c["ذكور"],
                        إناث: c["إناث"],
                      }));
                      const withRes = lvl.admis + lvl.nonAdmis;
                      const rate = withRes > 0 ? Math.round((lvl.admis / withRes) * 100) : null;
                      return (
                        <Card key={lvl.niveau} className="border-0 bg-card/80 shadow-md">
                          <CardHeader className="pb-1 pt-4 px-5">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: dotColor }} />
                                <span className="font-black text-sm">{LEVEL_LABELS[lvl.niveau] || lvl.niveau}</span>
                              </div>
                              <div className="flex items-center gap-3 text-xs font-semibold">
                                <span className="text-muted-foreground">إجمالي <span className="text-foreground font-bold">{lvl.total}</span></span>
                                <span className="text-blue-500">♂{lvl.boys}</span>
                                <span className="text-pink-500">♀{lvl.girls}</span>
                              </div>
                            </div>
                          </CardHeader>
                          <CardContent className="px-5 pb-3 pt-1">
                            {rows.length > 0 ? (
                              <ResponsiveContainer width="100%" height={rows.length * 46 + 36}>
                                <BarChart data={rows} layout="vertical" barSize={13} barGap={2}
                                  margin={{ top: 4, right: 44, left: 8, bottom: 8 }}>
                                  <CartesianGrid strokeDasharray="3 3" horizontal={false} opacity={0.07} />
                                  <XAxis type="number" tick={{ fontSize: 10 }} domain={[0, "auto"]} />
                                  <YAxis dataKey="name" type="category" tick={{ fontSize: 11, fontWeight: 600 }} width={24} />
                                  <Tooltip content={<MiniTooltip />} />
                                  <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
                                  <Bar dataKey="ذكور" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                                  <Bar dataKey="إناث" fill="#ec4899" radius={[0, 4, 4, 0]} />
                                </BarChart>
                              </ResponsiveContainer>
                            ) : (
                              <p className="text-xs text-muted-foreground text-center py-6">لا توجد بيانات قسم</p>
                            )}
                            <div className="flex flex-wrap gap-x-4 gap-y-1 pt-2 border-t text-[10px] text-muted-foreground">
                              {lvl.admis > 0 && <span>ناجح: <span className="text-emerald-600 font-bold">{lvl.admis}</span></span>}
                              {lvl.nonAdmis > 0 && <span>راسب: <span className="text-red-500 font-bold">{lvl.nonAdmis}</span></span>}
                              {(lvl.mustarrak ?? 0) > 0 && <span>مستدرك: <span className="text-amber-500 font-bold">{lvl.mustarrak}</span></span>}
                              {lvl.redoublant > 0 && <span>معيد: <span className="text-orange-500 font-bold">{lvl.redoublant}</span></span>}
                              {rate !== null && (
                                <span className="font-bold" style={{ color: dotColor }}>
                                  نسبة النجاح: {rate}%
                                </span>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </motion.section>
              )}

              {/* ── Success by level chart ── */}
              {has("success_lvl") && successByLevel.length > 0 && (
                <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }} className="print-section">
                  <SectionHeader icon={Target} title="نسبة النجاح حسب المستوى" color="from-lime-500 to-green-600" />
                  <Card className="border-0 bg-card/80 shadow-md">
                    <CardContent className="pt-4">
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={successByLevel} barSize={48}>
                          <CartesianGrid strokeDasharray="3 3" opacity={0.08} />
                          <XAxis dataKey="name" tick={{ fontSize: 13 }} />
                          <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} />
                          <Tooltip content={<MiniTooltip />} />
                          <Bar dataKey="نسبة النجاح" radius={[8, 8, 0, 0]}>
                            {successByLevel.map((e, i) => <Cell key={i} fill={e.fill} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </motion.section>
              )}

              {/* ── Top students ── */}
              {has("top") && topStudents.length > 0 && (
                <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="print-section">
                  <SectionHeader icon={Trophy} title="أفضل التلاميذ (أعلى 10)" color="from-yellow-500 to-orange-500" />
                  <Card className="border-0 bg-card/80 shadow-md overflow-hidden">
                    <CardContent className="p-0">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-muted/60 border-b text-muted-foreground text-xs">
                            <th className="p-3 text-center font-semibold w-12">الرتبة</th>
                            <th className="p-3 text-right font-semibold">الاسم</th>
                            <th className="p-3 text-center font-semibold">المستوى</th>
                            <th className="p-3 text-center font-semibold">القسم</th>
                            <th className="p-3 text-center font-semibold">المعدل السنوي</th>
                          </tr>
                        </thead>
                        <tbody>
                          {topStudents.map((r, i) => (
                            <motion.tr key={r.student.id}
                              initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: 0.02 * i }}
                              className={`border-b last:border-0 hover:bg-muted/30 transition-colors ${i % 2 !== 0 ? "bg-muted/15" : ""}`}>
                              <td className="p-3 text-center">
                                {i === 0 ? <span className="text-lg">🥇</span>
                                  : i === 1 ? <span className="text-lg">🥈</span>
                                  : i === 2 ? <span className="text-lg">🥉</span>
                                  : <span className="text-muted-foreground font-bold text-sm">{i + 1}</span>}
                              </td>
                              <td className="p-3 font-semibold">{r.student.nomPrenom}</td>
                              <td className="p-3 text-center">
                                <Badge variant="secondary" className="text-xs">{LEVEL_LABELS[r.student.niveau] || r.student.niveau}</Badge>
                              </td>
                              <td className="p-3 text-center text-muted-foreground">{r.student.classe}</td>
                              <td className="p-3 text-center">
                                <span className="font-black text-emerald-600 text-base">{r.annualAvg?.toFixed(2)}</span>
                                <span className="text-muted-foreground text-xs">/20</span>
                              </td>
                            </motion.tr>
                          ))}
                        </tbody>
                      </table>
                    </CardContent>
                  </Card>
                </motion.section>
              )}

              {/* ── Grade distribution ── */}
              {has("dist") && withAvg.length > 0 && (
                <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.22 }} className="print-section">
                  <SectionHeader icon={Activity} title="توزيع المعدلات" color="from-rose-500 to-red-600" />
                  <Card className="border-0 bg-card/80 shadow-md">
                    <CardContent className="pt-4">
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={gradeDist} barSize={28}>
                          <CartesianGrid strokeDasharray="3 3" opacity={0.08} />
                          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 10 }} />
                          <Tooltip content={<MiniTooltip />} />
                          <Bar dataKey="count" name="عدد التلاميذ" radius={[4, 4, 0, 0]}>
                            {gradeDist.map((_, i) => (
                              <Cell key={i} fill={i * 2 >= 10 ? "#10b981" : i * 2 >= 9 ? "#f59e0b" : "#f43f5e"} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                      <p className="text-xs text-center text-muted-foreground mt-2">توزيع {withAvg.length} تلميذ لديهم معدل سنوي</p>
                    </CardContent>
                  </Card>
                </motion.section>
              )}

              {/* ── Absences ── */}
              {has("absences") && absences.length > 0 && (
                <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.24 }} className="print-section">
                  <SectionHeader icon={CalendarOff} title="ملخص الغيابات" color="from-amber-500 to-orange-600" />
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                    <KpiCard label="ساعات مبررة" value={totalAbsJust} icon={BookOpen} gradient="from-blue-600 to-indigo-700" />
                    <KpiCard label="ساعات غير مبررة" value={totalAbsUnjust} icon={AlertTriangle} gradient="from-amber-500 to-orange-600" />
                    <KpiCard label="إجمالي الساعات" value={totalAbsJust + totalAbsUnjust} icon={CalendarOff} gradient="from-slate-600 to-slate-800" />
                    <KpiCard label="تلاميذ في خطر" value={atRisk} icon={AlertTriangle} gradient="from-red-600 to-rose-700" />
                  </div>
                  {absenceByTrim.some(t => t.مبررة > 0 || t["غير مبررة"] > 0) && (
                    <Card className="border-0 bg-card/80 shadow-md">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-bold flex items-center gap-2">
                          <Activity className="w-3.5 h-3.5 text-amber-500" />الغيابات حسب الفصل
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ResponsiveContainer width="100%" height={200}>
                          <BarChart data={absenceByTrim} barSize={32} barGap={4}>
                            <CartesianGrid strokeDasharray="3 3" opacity={0.08} />
                            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                            <YAxis tick={{ fontSize: 10 }} />
                            <Tooltip content={<MiniTooltip />} />
                            <Legend iconType="circle" iconSize={8} />
                            <Bar dataKey="مبررة" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="غير مبررة" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>
                  )}
                </motion.section>
              )}

              {/* ── Class / Level PDF Report ── */}
              {has("classreport") && (
                <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.26 }} className="no-print">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-md">
                      <ClipboardList className="w-4.5 h-4.5 text-white" />
                    </div>
                    <h2 className="text-base font-bold text-foreground">تقرير القسم / المستوى — PDF</h2>
                    <div className="flex-1 h-px bg-gradient-to-r from-border to-transparent" />
                  </div>
                  <ClassLevelReport annee={year} school={school} allResults={results} />
                </motion.section>
              )}

              {/* ── Print footer ── */}
              <div className="hidden print-only border-t pt-3 mt-4 flex items-center justify-between text-xs text-gray-500 print-section">
                <p>مدير {SCHOOL_STAGE === "lycee" ? "الثانوية" : "المتوسطة"} — دليل الرقمنة</p>
                <p>السنة الدراسية: {year} | تاريخ الطباعة: {today}</p>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
