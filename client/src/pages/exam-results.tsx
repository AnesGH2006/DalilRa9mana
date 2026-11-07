import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "@/contexts/language-provider";
import { motion, AnimatePresence } from "framer-motion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { BarChart2, TrendingUp, TrendingDown, Star, Award } from "lucide-react";
import type { SubjectAverage } from "@shared/types";
import type { Niveau } from "@shared/types";
import { SCHOOL_LEVELS } from "@/lib/deployment";

const BASE = import.meta.env.BASE_URL;
const LEVELS: Niveau[] = SCHOOL_LEVELS;
const ACADEMIC_YEARS = ["2026-2027", "2025-2026", "2024-2025", "2023-2024", "2022-2023"];
const DEFAULT_YEAR  = "2026-2027";

const TRIMESTRE_COLORS = [
  { bar: "bg-blue-500",   text: "text-blue-600 dark:text-blue-400",   light: "bg-blue-100 dark:bg-blue-950/50",   label: "الفصل 1" },
  { bar: "bg-violet-500", text: "text-violet-600 dark:text-violet-400", light: "bg-violet-100 dark:bg-violet-950/50", label: "الفصل 2" },
  { bar: "bg-emerald-500",text: "text-emerald-600 dark:text-emerald-400",light: "bg-emerald-100 dark:bg-emerald-950/50",label: "الفصل 3" },
];

const CHART_H = 140;

// ── Single animated vertical bar ─────────────────────────────────────────────
function VBar({ value, color, delay }: { value: number; color: string; delay: number }) {
  const pct = Math.min(100, (value / 20) * 100);
  return (
    <div className="flex flex-col items-end" style={{ height: CHART_H }}>
      <div className="relative w-9 flex-1 rounded-t-lg overflow-hidden bg-muted/50">
        {/* Reference line at 10/20 */}
        <div className="absolute w-full border-t-2 border-dashed border-muted-foreground/25 pointer-events-none"
          style={{ bottom: "50%" }} />
        <motion.div
          className={`absolute bottom-0 w-full rounded-t-lg ${color} shadow-sm`}
          initial={{ height: 0 }}
          animate={{ height: `${pct}%` }}
          transition={{ delay, duration: 0.7, ease: [0.34, 1.15, 0.64, 1] }}
        />
      </div>
    </div>
  );
}

// ── Subject group (3 bars) ────────────────────────────────────────────────────
function SubjectGroup({ subject, t1, t2, t3, index }: {
  subject: string; t1: number; t2: number; t3: number; index: number;
}) {
  const base = index * 0.06;
  const avg = [t1, t2, t3].filter(v => v > 0);
  const annualAvg = avg.length ? avg.reduce((a, b) => a + b, 0) / avg.length : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay: base, duration: 0.4 }}
      className="flex flex-col items-center gap-2 min-w-[100px]"
    >
      {/* Value labels */}
      <div className="flex gap-1 items-end h-5">
        {[t1, t2, t3].map((v, i) => (
          <motion.span key={i}
            className={`text-[11px] font-bold w-9 text-center tabular-nums ${TRIMESTRE_COLORS[i]!.text}`}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: base + 0.6 }}>
            {v > 0 ? v.toFixed(1) : "—"}
          </motion.span>
        ))}
      </div>

      {/* Bars */}
      <div className="flex gap-1 items-end">
        {[t1, t2, t3].map((v, i) => (
          <VBar key={i} value={v} color={TRIMESTRE_COLORS[i]!.bar} delay={base + i * 0.07} />
        ))}
      </div>

      {/* Annual avg chip */}
      <motion.div
        className={`text-[11px] font-extrabold px-2 py-0.5 rounded-full ${
          annualAvg >= 15 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" :
          annualAvg >= 10 ? "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300" :
          "bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400"
        }`}
        initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: base + 0.75 }}>
        {annualAvg > 0 ? annualAvg.toFixed(2) : "—"}
      </motion.div>

      {/* Subject label */}
      <p className="text-[11px] text-muted-foreground text-center leading-tight max-w-[90px] font-medium">
        {subject}
      </p>
    </motion.div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function ExamResultsPage() {
  const { t } = useLanguage();
  const [annee, setAnnee] = useState(DEFAULT_YEAR);
  const [niveau, setNiveau] = useState<string>("");
  const [classe, setClasse] = useState<string>("");
  const [data, setData] = useState<{ t1: SubjectAverage[]; t2: SubjectAverage[]; t3: SubjectAverage[] } | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setData(null);
    try {
      const p = new URLSearchParams({ annee });
      if (niveau) p.set("niveau", niveau);
      if (classe) p.set("classe", classe);

      const [r1, r2, r3] = await Promise.all([
        fetch(`${BASE}api/results/subjects?${p}&trimestre=1`, { credentials: "include" }),
        fetch(`${BASE}api/results/subjects?${p}&trimestre=2`, { credentials: "include" }),
        fetch(`${BASE}api/results/subjects?${p}&trimestre=3`, { credentials: "include" }),
      ]);
      const [t1, t2, t3] = await Promise.all([
        r1.ok ? r1.json() : [],
        r2.ok ? r2.json() : [],
        r3.ok ? r3.json() : [],
      ]);
      setData({ t1, t2, t3 });
    } finally { setLoading(false); }
  }, [niveau, classe, annee]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Merge subjects from all 3 trimesters
  const allSubjects = Array.from(new Set([
    ...(data?.t1 ?? []).map(s => s.subject),
    ...(data?.t2 ?? []).map(s => s.subject),
    ...(data?.t3 ?? []).map(s => s.subject),
  ]));

  const getAvg = (arr: SubjectAverage[], subj: string) =>
    arr.find(s => s.subject === subj)?.avg ?? 0;
  const getLabel = (arr: SubjectAverage[], subj: string) =>
    arr.find(s => s.subject === subj)?.arLabel ?? subj;

  const hasData = allSubjects.length > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
      className="p-6 space-y-6 max-w-7xl mx-auto"
    >
      {/* Header */}
      <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BarChart2 className="w-6 h-6 text-violet-500" />
          نتائج الفصول الثلاثة لكل مادة
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          مقارنة مرئية بالأعمدة البيانية — الفصل 1 / الفصل 2 / الفصل 3
        </p>
      </motion.div>

      {/* Filters */}
      <motion.div className="flex gap-3 flex-wrap items-center"
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
        <Select value={annee} onValueChange={v => { setAnnee(v); setNiveau(""); setClasse(""); }}>
          <SelectTrigger className="w-36 font-semibold border-violet-200 dark:border-violet-800 text-violet-700 dark:text-violet-300 bg-violet-50/50 dark:bg-violet-950/30">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ACADEMIC_YEARS.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={niveau || "__all__"} onValueChange={v => setNiveau(v === "__all__" ? "" : v)}>
          <SelectTrigger className="w-36"><SelectValue placeholder="كل المستويات" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">كل المستويات</SelectItem>
            {LEVELS.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={classe || "__all__"} onValueChange={v => setClasse(v === "__all__" ? "" : v)}>
          <SelectTrigger className="w-36"><SelectValue placeholder="كل الأقسام" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">كل الأقسام</SelectItem>
            {["أ", "ب", "ج", "د", "هـ"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>

        {/* Legend */}
        <div className="flex items-center gap-3 ms-auto">
          {TRIMESTRE_COLORS.map((c, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <div className={`w-3 h-3 rounded-sm ${c.bar}`} />
              <span className="text-xs text-muted-foreground">{c.label}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 border-t-2 border-dashed border-muted-foreground/50" />
            <span className="text-xs text-muted-foreground">10/20</span>
          </div>
        </div>
      </motion.div>

      {/* KPI summary cards — shown when data is available */}
      {hasData && (() => {
        const allSubjectAvgs = [...(data?.t1 ?? []), ...(data?.t2 ?? []), ...(data?.t3 ?? [])];
        const subjectMap = new Map<string, { label: string; avgs: number[] }>();
        for (const s of allSubjectAvgs) {
          if (!subjectMap.has(s.subject)) subjectMap.set(s.subject, { label: s.arLabel, avgs: [] });
          subjectMap.get(s.subject)!.avgs.push(s.avg);
        }
        const subjectOveralls = Array.from(subjectMap.entries()).map(([, v]) => ({
          label: v.label,
          avg: v.avgs.reduce((a, b) => a + b, 0) / v.avgs.length,
        }));
        const bestSubj  = subjectOveralls.reduce((b, s) => s.avg > b.avg ? s : b, subjectOveralls[0]);
        const worstSubj = subjectOveralls.reduce((b, s) => s.avg < b.avg ? s : b, subjectOveralls[0]);
        const overallAvg = subjectOveralls.length > 0
          ? subjectOveralls.reduce((a, b) => a + b.avg, 0) / subjectOveralls.length : 0;
        const abovePass = subjectOveralls.filter(s => s.avg >= 10).length;

        return (
          <motion.div
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className="grid grid-cols-2 sm:grid-cols-4 gap-3"
          >
            {[
              { label: "المعدل العام", value: overallAvg.toFixed(2), suffix: "/20", gradient: "from-blue-500 to-indigo-600", icon: BarChart2, color: overallAvg >= 10 ? "text-emerald-300" : "text-red-300" },
              { label: "أفضل مادة", value: bestSubj?.label ?? "—", suffix: "", gradient: "from-emerald-500 to-teal-600", icon: Award, color: "text-white" },
              { label: "أصعب مادة", value: worstSubj?.label ?? "—", suffix: "", gradient: "from-red-500 to-rose-600", icon: TrendingDown, color: "text-white" },
              { label: "مواد فوق 10", value: `${abovePass}`, suffix: `/${subjectOveralls.length}`, gradient: "from-violet-500 to-purple-600", icon: Star, color: "text-white" },
            ].map((c, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.07 }} whileHover={{ y: -2, scale: 1.02 }}>
                <Card className="border-0 overflow-hidden shadow-md">
                  <div className={`bg-gradient-to-br ${c.gradient} p-4 relative overflow-hidden`}>
                    <div className="absolute -top-3 -right-3 w-12 h-12 rounded-full bg-white/10 blur-xl" />
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-white/75 text-[10px] font-semibold">{c.label}</p>
                      <c.icon className="w-3.5 h-3.5 text-white/50" />
                    </div>
                    <p className={`text-lg font-extrabold ${c.color} truncate`}>{c.value}{c.suffix}</p>
                  </div>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        );
      })()}

      {/* Chart */}
      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div key="loading" className="flex items-end gap-6 h-64 p-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {[...Array(8)].map((_, i) => (
              <div key={i} className="flex gap-1 items-end">
                {[...Array(3)].map((_, j) => (
                  <motion.div key={j} className="w-9 bg-muted rounded-t-lg"
                    style={{ height: `${40 + Math.random() * 80}px` }}
                    animate={{ opacity: [0.3, 0.6, 0.3] }}
                    transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.1 + j * 0.05 }} />
                ))}
              </div>
            ))}
          </motion.div>
        ) : !hasData ? (
          <motion.div key="empty"
            initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
            className="rounded-2xl border border-dashed p-16 text-center text-muted-foreground">
            <motion.div animate={{ y: [0, -8, 0] }} transition={{ duration: 3, repeat: Infinity }}>
              <BarChart2 className="w-14 h-14 mx-auto mb-4 opacity-20" />
            </motion.div>
            <p className="font-semibold">لا توجد نتائج بعد</p>
            <p className="text-sm mt-1">أضف نتائج التلاميذ أولاً من صفحة النتائج</p>
          </motion.div>
        ) : (
          <motion.div key="chart"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="rounded-2xl border bg-card shadow-sm overflow-x-auto p-6">

            {/* Y-axis labels */}
            <div className="flex gap-8 items-stretch">
              <div className="flex flex-col justify-between text-right shrink-0 pb-16 pt-5" style={{ height: CHART_H + 60 }}>
                {[20, 15, 10, 5, 0].map(v => (
                  <span key={v} className={`text-[10px] tabular-nums ${v === 10 ? "text-amber-600 font-bold" : "text-muted-foreground"}`}>
                    {v}
                  </span>
                ))}
              </div>

              {/* Bars area */}
              <div className="flex-1 overflow-x-auto">
                <div className="flex gap-6 pb-2 min-w-max">
                  {allSubjects.map((subj, i) => (
                    <SubjectGroup key={subj} index={i}
                      subject={getLabel(data!.t1.length ? data!.t1 : data!.t2.length ? data!.t2 : data!.t3, subj)}
                      t1={getAvg(data!.t1, subj)}
                      t2={getAvg(data!.t2, subj)}
                      t3={getAvg(data!.t3, subj)}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Summary row */}
            <motion.div className="mt-6 pt-4 border-t flex flex-wrap gap-4"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }}>
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-500" />
                <span className="text-sm text-muted-foreground">
                  أفضل مادة:{" "}
                  <strong className="text-foreground">
                    {[...data!.t1, ...data!.t2, ...data!.t3]
                      .reduce((best, s) => s.avg > (best?.avg ?? 0) ? s : best, null as SubjectAverage | null)
                      ?.arLabel ?? "—"}
                  </strong>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  عدد المواد: <strong className="text-foreground">{allSubjects.length}</strong>
                </span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
