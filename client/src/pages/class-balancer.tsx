import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users, Shuffle, ChevronDown, AlertCircle, CheckCircle2,
  Loader2, Save, RotateCcw, BarChart3, UserCheck, User, TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL;

const NIVEAUX = ["1AM", "2AM", "3AM", "4AM"];
const YEARS   = ["2023-2024", "2024-2025", "2026-2027", "2026-2027"];
const CLASS_COLORS = [
  "from-blue-500 to-indigo-600",
  "from-violet-500 to-purple-600",
  "from-emerald-500 to-green-600",
  "from-amber-500 to-orange-600",
  "from-cyan-500 to-blue-500",
  "from-rose-500 to-red-600",
  "from-fuchsia-500 to-pink-600",
  "from-teal-500 to-emerald-600",
  "from-sky-500 to-cyan-600",
  "from-lime-500 to-green-600",
];

interface StudentInput {
  id: string;
  nomPrenom: string;
  sexe: "M" | "F";
  statut: "nouveau" | "redoublant";
  averageGrade: number | null;
}

interface BalancedClass {
  label: string;
  students: StudentInput[];
  stats: {
    count: number;
    males: number;
    females: number;
    redoublants: number;
    averageGrade: number | null;
    genderRatioPct: number;
    redoublantPct: number;
  };
}

interface BalancerResult {
  classes: BalancedClass[];
  summary: {
    totalStudents: number;
    classCount: number;
    globalAvgGrade: number | null;
    gradeStdDev: number | null;
    genderBalance: string;
    redoublantBalance: string;
  };
}

function buildStats(students: StudentInput[]): BalancedClass["stats"] {
  const males = students.filter(s => s.sexe === "M").length;
  const redoublants = students.filter(s => s.statut === "redoublant").length;
  const grades = students.map(s => s.averageGrade).filter((g): g is number => g != null);
  const avg = grades.length ? grades.reduce((a, b) => a + b, 0) / grades.length : null;
  return {
    count: students.length,
    males,
    females: students.length - males,
    redoublants,
    averageGrade: avg !== null ? Math.round(avg * 100) / 100 : null,
    genderRatioPct: students.length > 0 ? Math.round((males / students.length) * 100) : 0,
    redoublantPct:  students.length > 0 ? Math.round((redoublants / students.length) * 100) : 0,
  };
}

export default function ClassBalancerPage() {
  const { toast } = useToast();

  // Config
  const [niveau, setNiveau]     = useState("1AM");
  const [annee, setAnnee]       = useState("2026-2027");
  const [classCount, setClassCount] = useState(3);
  const [weightGrade, setWeightGrade]     = useState(60);
  const [weightGender, setWeightGender]   = useState(25);
  const [weightRepeat, setWeightRepeat]   = useState(15);
  const [rules, setRules] = useState("");

  // State
  const [loading, setLoading]   = useState(false);
  const [saving,  setSaving]    = useState(false);
  const [result,  setResult]    = useState<BalancerResult | null>(null);
  const [classes, setClasses]   = useState<BalancedClass[]>([]);

  // Drag state
  const dragStudent = useRef<{ classIdx: number; studentIdx: number } | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  // ── Run balancer ─────────────────────────────────────────────────────────────
  const run = async () => {
    setLoading(true);
    setResult(null);
    setClasses([]);
    try {
      const res = await fetch(`${BASE}api/class-balancer/balance-niveau`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          niveau, annee, classCount,
          weights: {
            grade:     weightGrade     / 100,
            gender:    weightGender    / 100,
            repeating: weightRepeat    / 100,
          },
          rules,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast({ title: "خطأ", description: err.error ?? "فشل التوزيع", variant: "destructive" });
        return;
      }
      const data: BalancerResult = await res.json();
      setResult(data);
      setClasses(data.classes);
    } catch {
      toast({ title: "خطأ", description: "تعذّر الاتصال بالخادم", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // ── Apply to DB ───────────────────────────────────────────────────────────────
  const apply = async () => {
    if (!classes.length) return;
    setSaving(true);
    try {
      const assignments = classes.flatMap((cls, i) =>
        cls.students.map(s => ({
          studentId: s.id,
                          classe: `${niveau}${i + 1}`,
        }))
      );
      const res = await fetch(`${BASE}api/class-balancer/apply`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignments }),
      });
      if (res.ok) {
        const data = await res.json();
        toast({ title: "✅ تم التطبيق", description: `تم تحديث ${data.updated} تلميذ في قاعدة البيانات` });
      } else {
        const err = await res.json();
        toast({ title: "خطأ", description: err.error ?? "فشل التطبيق", variant: "destructive" });
      }
    } catch {
      toast({ title: "خطأ", description: "تعذّر الاتصال بالخادم", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // ── Drag helpers ─────────────────────────────────────────────────────────────
  const onDragStart = (classIdx: number, studentIdx: number) => {
    dragStudent.current = { classIdx, studentIdx };
  };

  const onDrop = (targetClassIdx: number) => {
    const src = dragStudent.current;
    if (!src || src.classIdx === targetClassIdx) { setDragOver(null); return; }
    setClasses(prev => {
      const next = prev.map(c => ({ ...c, students: [...c.students] }));
      const [moved] = next[src.classIdx]!.students.splice(src.studentIdx, 1);
      next[targetClassIdx]!.students.push(moved!);
      // Rebuild stats
      for (const cls of next) cls.stats = buildStats(cls.students);
      return next;
    });
    dragStudent.current = null;
    setDragOver(null);
  };

  return (
    <motion.div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6"
      initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>

      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center shadow-lg shadow-violet-500/30 shrink-0">
          <Shuffle className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-extrabold">التوزيع التلقائي للأقسام</h1>
          <p className="text-xs text-muted-foreground mt-0.5">توزيع التلاميذ بشكل متوازن حسب المعدل، الجنس، والوضعية</p>
        </div>
      </div>

      {/* Config Card */}
      <Card className="border-0 shadow-md overflow-hidden">
        <div className="bg-gradient-to-br from-violet-500 to-purple-700 px-5 py-3 flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-white/80" />
          <h2 className="text-white font-bold text-sm">إعدادات التوزيع</h2>
        </div>
        <CardContent className="pt-4 pb-5 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {/* Niveau */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">المستوى</label>
              <select value={niveau} onChange={e => setNiveau(e.target.value)}
                className="w-full text-sm px-3 py-2 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-violet-500/30">
                {NIVEAUX.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            {/* Year */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">السنة الدراسية</label>
              <select value={annee} onChange={e => setAnnee(e.target.value)}
                className="w-full text-sm px-3 py-2 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-violet-500/30">
                {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            {/* Class count */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">عدد الأقسام</label>
              <select value={classCount} onChange={e => setClassCount(+e.target.value)}
                className="w-full text-sm px-3 py-2 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-violet-500/30">
                {[2,3,4,5,6,7,8,9,10].map(n => <option key={n} value={n}>{n} أقسام</option>)}
              </select>
            </div>
            {/* Run button */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground opacity-0">تشغيل</label>
              <motion.button
                onClick={run} disabled={loading}
                whileHover={{ scale: loading ? 1 : 1.02 }} whileTap={{ scale: loading ? 1 : 0.97 }}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-gradient-to-r from-violet-500 to-purple-600 text-white text-sm font-bold disabled:opacity-60 shadow-sm shadow-violet-500/25"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shuffle className="w-4 h-4" />}
                {loading ? "جارٍ التوزيع…" : "توزيع تلقائي"}
              </motion.button>
            </div>
          </div>

          {/* Weights */}
          <div className="border rounded-xl p-3 space-y-3 bg-muted/20">
            <p className="text-xs font-bold text-muted-foreground">أوزان عوامل التوزيع</p>
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: "المعدل", key: "grade", value: weightGrade, set: setWeightGrade, color: "text-blue-500" },
                { label: "الجنس", key: "gender", value: weightGender, set: setWeightGender, color: "text-violet-500" },
                { label: "المعيدون", key: "repeat", value: weightRepeat, set: setWeightRepeat, color: "text-amber-500" },
              ].map(w => (
                <div key={w.key} className="space-y-1.5">
                  <div className="flex justify-between">
                    <span className={`text-xs font-semibold ${w.color}`}>{w.label}</span>
                    <span className="text-xs text-muted-foreground">{w.value}%</span>
                  </div>
                  <input type="range" min="0" max="100" value={w.value}
                    onChange={e => w.set(+e.target.value)}
                    className="w-full accent-violet-500 h-1.5" />
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">شروط إضافية للتوزيع</label>
            <textarea
              value={rules}
              onChange={e => setRules(e.target.value)}
              placeholder="مثال: أريد توازناً أكبر بين الذكور والإناث، مع توزيع المعيدين بالتساوي"
              className="w-full min-h-20 resize-y text-sm px-3 py-2 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-violet-500/30"
            />
            <p className="text-[11px] text-muted-foreground">يفهم النظام حالياً أولوية المعدل والجنس والمعيدين، ويمكنك ضبط النتيجة يدوياً قبل الحفظ.</p>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      <AnimatePresence>
        {result && classes.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }} className="space-y-4">

            {/* Summary strip */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "إجمالي التلاميذ",  value: result.summary.totalStudents,      icon: Users },
                { label: "عدد الأقسام",      value: result.summary.classCount,         icon: BarChart3 },
                { label: "المعدل العام",      value: result.summary.globalAvgGrade?.toFixed(2) ?? "—", icon: TrendingUp },
                { label: "انحراف المعدلات",   value: result.summary.gradeStdDev?.toFixed(3) ?? "—", icon: BarChart3 },
              ].map((s, i) => (
                <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
                  <Card className="border-0 shadow-sm">
                    <CardContent className="p-3 flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500/15 to-purple-500/10 flex items-center justify-center">
                        <s.icon className="w-4 h-4 text-violet-500" />
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground leading-none">{s.label}</p>
                        <p className="text-lg font-extrabold leading-tight">{s.value}</p>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>

            {/* Balance info */}
            <div className="flex flex-wrap gap-2">
              <span className="text-xs px-3 py-1.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium">
                {result.summary.genderBalance}
              </span>
              <span className="text-xs px-3 py-1.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium">
                {result.summary.redoublantBalance}
              </span>
            </div>

            {/* Class columns */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {classes.map((cls, ci) => (
                <motion.div key={ci}
                  initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: ci * 0.05 }}
                  onDragOver={e => { e.preventDefault(); setDragOver(ci); }}
                  onDragLeave={() => setDragOver(d => d === ci ? null : d)}
                  onDrop={() => onDrop(ci)}
                  className={`rounded-2xl border-2 transition-colors duration-150 overflow-hidden ${
                    dragOver === ci ? "border-violet-400 bg-violet-50 dark:bg-violet-950/20" : "border-transparent"
                  }`}
                >
                  <Card className="border-0 shadow-md h-full">
                    {/* Class header */}
                    <div className={`bg-gradient-to-br ${CLASS_COLORS[ci % CLASS_COLORS.length]} p-3`}>
                      <div className="flex items-center justify-between mb-1">
                        <h3 className="text-white font-extrabold text-lg">
                          {niveau}{ci + 1}
                        </h3>
                        <span className="text-white/80 text-sm font-bold">{cls.stats.count} تلميذ</span>
                      </div>
                      <div className="flex gap-3 text-xs text-white/75">
                        <span>♂ {cls.stats.males} ذكور</span>
                        <span>♀ {cls.stats.females} إناث</span>
                        <span>↺ {cls.stats.redoublants} معيدون</span>
                        {cls.stats.averageGrade !== null && (
                          <span>معدل {cls.stats.averageGrade}</span>
                        )}
                      </div>
                      {/* Balance bars */}
                      <div className="mt-2 grid grid-cols-2 gap-1.5">
                        <div>
                          <div className="flex justify-between text-[9px] text-white/60 mb-0.5">
                            <span>ذكور/إناث</span><span>{cls.stats.genderRatioPct}%</span>
                          </div>
                          <div className="h-1 bg-white/20 rounded-full overflow-hidden">
                            <div className="h-full bg-white/70 rounded-full transition-all" style={{ width: `${cls.stats.genderRatioPct}%` }} />
                          </div>
                        </div>
                        <div>
                          <div className="flex justify-between text-[9px] text-white/60 mb-0.5">
                            <span>معيدون</span><span>{cls.stats.redoublantPct}%</span>
                          </div>
                          <div className="h-1 bg-white/20 rounded-full overflow-hidden">
                            <div className="h-full bg-amber-300/80 rounded-full transition-all" style={{ width: `${cls.stats.redoublantPct}%` }} />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Student list */}
                    <CardContent className="p-2 max-h-64 overflow-y-auto space-y-0.5 scrollbar-thin">
                      {cls.students.map((s, si) => (
                        <div
                          key={s.id}
                          draggable
                          onDragStart={() => onDragStart(ci, si)}
                          className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted/50 cursor-grab active:cursor-grabbing select-none group"
                        >
                          <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-[9px] font-bold text-white ${s.sexe === "M" ? "bg-blue-500" : "bg-rose-400"}`}>
                            {s.sexe}
                          </div>
                          <span className="flex-1 text-xs truncate">{s.nomPrenom}</span>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {s.statut === "redoublant" && (
                              <span className="text-[9px] px-1 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 font-bold">↺</span>
                            )}
                            {s.averageGrade !== null && (
                              <span className="text-[9px] text-muted-foreground">{s.averageGrade?.toFixed(1)}</span>
                            )}
                          </div>
                        </div>
                      ))}
                      {cls.students.length === 0 && (
                        <div className="py-4 text-center text-xs text-muted-foreground">اسحب تلاميذ إلى هنا</div>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>

            {/* Drag hint */}
            <p className="text-center text-xs text-muted-foreground">
              اسحب أي تلميذ وأسقطه في قسم آخر لضبط التوزيع يدوياً
            </p>

            {/* Action buttons */}
            <div className="flex items-center justify-center gap-3 pt-2">
              <Button variant="outline" onClick={() => { setResult(null); setClasses([]); }} className="gap-2">
                <RotateCcw className="w-4 h-4" /> إعادة التوزيع
              </Button>
              <motion.button
                onClick={apply} disabled={saving}
                whileHover={{ scale: saving ? 1 : 1.02 }} whileTap={{ scale: saving ? 1 : 0.97 }}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 text-white text-sm font-bold disabled:opacity-60 shadow-md shadow-emerald-500/25"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {saving ? "جارٍ الحفظ…" : "تطبيق التوزيع وحفظه"}
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Empty state */}
      {!result && !loading && (
        <motion.div className="flex flex-col items-center justify-center py-16 text-center"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-100 to-purple-100 dark:from-violet-950/30 dark:to-purple-950/30 flex items-center justify-center mb-4 shadow-lg">
            <Shuffle className="w-8 h-8 text-violet-400" />
          </div>
          <h2 className="text-lg font-bold mb-1">اختر المستوى وابدأ التوزيع</h2>
          <p className="text-sm text-muted-foreground max-w-xs">
            سيقوم النظام بتوزيع التلاميذ تلقائياً في أقسام متوازنة، ثم يمكنك التعديل يدوياً بالسحب والإفلات.
          </p>
        </motion.div>
      )}
    </motion.div>
  );
}
