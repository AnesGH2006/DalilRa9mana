import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "@/contexts/language-provider";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, RadialBarChart, RadialBar,
  LineChart, Line,
} from "recharts";
import {
  TrendingUp, Users, UserCheck, UserX, Award, BarChart3,
  GitCompare, ChevronDown, ChevronUp, Printer,
} from "lucide-react";
import { CountUp } from "@/components/count-up";
import type { DashboardStats } from "@shared/types";
import { successRatePercent, evaluatedCount } from "@shared/schoolStats";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { SCHOOL_STAGE } from "@/lib/deployment";

const BASE = import.meta.env.BASE_URL;

function getAcademicYears(): string[] {
  const years: string[] = [];
  for (let start = 2018; start <= 2025; start++) {
    years.push(`${start}-${start + 1}`);
  }
  return years.reverse();
}

const LEVEL_LABELS: Record<string, string> = {
  "1AM": "1 AM", "2AM": "2 AM", "3AM": "3 AM", "4AM": "4 AM",
  "1AS": "1 AS", "2AS": "2 AS", "3AS": "3 AS",
};

const SCHOOL_STAGE_LABELS = {
  moyen: "المتوسطة",
  lycee: "الثانوي / lycée",
} as const;

const GENDER_COLORS = ["#3b82f6", "#ec4899"];
const LEVEL_COLORS = ["#6366f1", "#8b5cf6", "#a855f7", "#d946ef"];
const SUCCESS_COLORS = { pass: "#10b981", fail: "#f43f5e" };
const YEAR_A_COLOR = "#6366f1";
const YEAR_B_COLOR = "#f59e0b";

const pageVariants = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" as const } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.2 } },
};
const cardVariants = {
  initial: { opacity: 0, y: 24, scale: 0.97 },
  animate: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.45, ease: "easeOut" as const } },
};

function SkeletonCard({ h = 64 }: { h?: number }) {
  return (
    <motion.div
      className={`h-${h} rounded-2xl bg-muted`}
      animate={{ opacity: [0.4, 0.7, 0.4] }}
      transition={{ duration: 1.5, repeat: Infinity }}
    />
  );
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}
function CustomTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-background/95 backdrop-blur border rounded-xl shadow-xl p-3 text-xs">
      {label && <p className="font-bold mb-1.5 text-foreground">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }} className="font-semibold">{p.name}: {p.value}</p>
      ))}
    </div>
  );
}

function useStats(year: string) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetch_ = useCallback(async (y: string) => {
    setLoading(true);
    try {
      const res = await fetch(`${BASE}api/stats?annee=${y}`, { credentials: "include" });
      setStats(res.ok ? await res.json() : null);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetch_(year); }, [year, fetch_]);
  return { stats, loading };
}

// ── Comparison section ────────────────────────────────────────────────────────
function ComparisonSection({ yearA, yearB }: { yearA: string; yearB: string }) {
  const { stats: sA, loading: lA } = useStats(yearA);
  const { stats: sB, loading: lB } = useStats(yearB);
  const loading = lA || lB;

  const hasData = !loading && (sA?.total || sB?.total);

  const levels = SCHOOL_STAGE === "lycee" ? ["1AS", "2AS", "3AS"] : ["1AM", "2AM", "3AM", "4AM"];
  const levelCompare = levels.map(lvl => {
    const la = sA?.byLevel.find(l => l.niveau === lvl);
    const lb = sB?.byLevel.find(l => l.niveau === lvl);
    return {
      name: LEVEL_LABELS[lvl],
      [yearA]: la?.total ?? 0,
      [yearB]: lb?.total ?? 0,
    };
  }).filter(d => (d[yearA] as number) > 0 || (d[yearB] as number) > 0);

  const successCompare = levels.map(lvl => {
    const la = sA?.byLevel.find(l => l.niveau === lvl);
    const lb = sB?.byLevel.find(l => l.niveau === lvl);
    return {
      name: LEVEL_LABELS[lvl],
      [yearA]: la ? successRatePercent(la) ?? 0 : 0,
      [yearB]: lb ? successRatePercent(lb) ?? 0 : 0,
    };
  }).filter(d => (d[yearA] as number) > 0 || (d[yearB] as number) > 0);

  // Trend line: total + success rate per year
  const rateA = sA ? successRatePercent(sA) : null;
  const rateB = sB ? successRatePercent(sB) : null;

  const trendData = [
    { year: yearA, total: sA?.total ?? 0, rate: rateA ?? 0, boys: sA?.boys ?? 0, girls: sA?.girls ?? 0 },
    { year: yearB, total: sB?.total ?? 0, rate: rateB ?? 0, boys: sB?.boys ?? 0, girls: sB?.girls ?? 0 },
  ];

  if (loading) return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
      {[...Array(4)].map((_, i) => <SkeletonCard key={i} h={48} />)}
    </div>
  );

  if (!hasData) return (
    <div className="text-center py-8 text-muted-foreground text-sm">
      لا توجد بيانات كافية لإجراء المقارنة
    </div>
  );

  return (
    <div className="space-y-5 mt-2">
      {/* KPI diff row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          {
            label: "إجمالي التلاميذ",
            a: sA?.total ?? 0, b: sB?.total ?? 0,
            icon: Users, color: "from-blue-500 to-indigo-600",
          },
          {
            label: "ذكور",
            a: sA?.boys ?? 0, b: sB?.boys ?? 0,
            icon: Users, color: "from-sky-500 to-cyan-600",
          },
          {
            label: "إناث",
            a: sA?.girls ?? 0, b: sB?.girls ?? 0,
            icon: Users, color: "from-pink-500 to-rose-600",
          },
          {
            label: "نسبة النجاح",
            a: rateA ?? 0, b: rateB ?? 0,
            icon: Award, color: "from-emerald-500 to-green-600",
            suffix: "%",
          },
        ].map((item, i) => {
          const diff = item.b - item.a;
          return (
            <motion.div
              key={i} variants={cardVariants} initial="initial" animate="animate"
              whileHover={{ y: -3 }} transition={{ type: "spring", stiffness: 260, delay: i * 0.06 }}
            >
              <Card className="border-0 shadow-md overflow-hidden">
                <div className={`bg-gradient-to-br ${item.color} p-3 relative overflow-hidden`}>
                  <div className="absolute -top-4 -right-4 w-14 h-14 rounded-full bg-white/10 blur-xl" />
                  <p className="text-white/75 text-[10px] font-semibold mb-1.5">{item.label}</p>
                  <div className="flex items-end justify-between gap-1">
                    <div>
                      <p className="text-[10px] text-white/60 font-medium">{yearA}</p>
                      <p className="text-xl font-extrabold text-white leading-none">
                        {item.a}{item.suffix ?? ""}
                      </p>
                    </div>
                    <div className="text-end">
                      <p className="text-[10px] text-white/60 font-medium">{yearB}</p>
                      <p className="text-xl font-extrabold text-white leading-none">
                        {item.b}{item.suffix ?? ""}
                      </p>
                    </div>
                  </div>
                  {item.a > 0 && (
                    <div className={`mt-2 flex items-center gap-1 text-[10px] font-bold ${diff > 0 ? "text-emerald-200" : diff < 0 ? "text-red-200" : "text-white/50"}`}>
                      {diff > 0 ? <ChevronUp className="w-3 h-3" /> : diff < 0 ? <ChevronDown className="w-3 h-3" /> : null}
                      {diff !== 0 ? `${diff > 0 ? "+" : ""}${diff}${item.suffix ?? ""}` : "لا تغيير"}
                    </div>
                  )}
                </div>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Students per level comparison */}
      {levelCompare.length > 0 && (
        <motion.div variants={cardVariants} initial="initial" animate="animate" whileHover={{ y: -2 }} transition={{ type: "spring", stiffness: 200 }}>
          <Card className="shadow-md border-0 bg-gradient-to-br from-card to-muted/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-indigo-500" />
                التلاميذ حسب المستوى — مقارنة
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={460}>
                <BarChart data={levelCompare} barSize={40} barGap={6}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.12} />
                  <XAxis dataKey="name" tick={{ fontSize: 14, fontWeight: "bold" }} />
                  <YAxis tick={{ fontSize: 14, fontWeight: "bold" }} width={38} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend iconType="circle" iconSize={8} />
                  <Bar dataKey={yearA} fill={YEAR_A_COLOR} radius={[4, 4, 0, 0]} />
                  <Bar dataKey={yearB} fill={YEAR_B_COLOR} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Success rate by level comparison */}
      {successCompare.length > 0 && (
        <motion.div variants={cardVariants} initial="initial" animate="animate" whileHover={{ y: -2 }} transition={{ type: "spring", stiffness: 200 }}>
          <Card className="shadow-md border-0 bg-gradient-to-br from-card to-muted/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                نسبة النجاح حسب المستوى — مقارنة %
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={460}>
                <BarChart data={successCompare} barSize={40} barGap={6}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.12} />
                  <XAxis dataKey="name" tick={{ fontSize: 14, fontWeight: "bold" }} />
                  <YAxis tick={{ fontSize: 14, fontWeight: "bold" }} domain={[0, 100]} unit="%" width={44} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend iconType="circle" iconSize={8} />
                  <Bar dataKey={yearA} fill={YEAR_A_COLOR} radius={[4, 4, 0, 0]} />
                  <Bar dataKey={yearB} fill={YEAR_B_COLOR} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Trend line */}
      {(trendData[0].total > 0 || trendData[1].total > 0) && (
        <motion.div variants={cardVariants} initial="initial" animate="animate" whileHover={{ y: -2 }} transition={{ type: "spring", stiffness: 200 }}>
          <Card className="shadow-md border-0 bg-gradient-to-br from-card to-muted/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-cyan-500" />
                الاتجاه العام — إجمالي التلاميذ ونسبة النجاح
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={480}>
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.12} />
                  <XAxis dataKey="year" tick={{ fontSize: 14, fontWeight: "bold" }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 14, fontWeight: "bold" }} width={38} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 14, fontWeight: "bold" }} domain={[0, 100]} unit="%" width={44} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend iconType="circle" iconSize={8} />
                  <Line yAxisId="left" type="monotone" dataKey="total" name="إجمالي التلاميذ"
                    stroke={YEAR_A_COLOR} strokeWidth={2.5} dot={{ r: 5, fill: YEAR_A_COLOR }} />
                  <Line yAxisId="right" type="monotone" dataKey="rate" name="نسبة النجاح %"
                    stroke="#10b981" strokeWidth={2.5} dot={{ r: 5, fill: "#10b981" }} strokeDasharray="5 3" />
                  <Line yAxisId="left" type="monotone" dataKey="boys" name="ذكور"
                    stroke="#3b82f6" strokeWidth={1.5} dot={{ r: 4 }} />
                  <Line yAxisId="left" type="monotone" dataKey="girls" name="إناث"
                    stroke="#ec4899" strokeWidth={1.5} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AnalyticsPage() {
  const { t } = useLanguage();
  const years = getAcademicYears();

  const [year, setYear] = useState(() => localStorage.getItem("cem-selected-year") || "2026-2027");
  const [compareMode, setCompareMode] = useState(false);
  const [compareYear, setCompareYear] = useState(() => {
    const stored = localStorage.getItem("cem-selected-year") || "2026-2027";
    const idx = years.indexOf(stored);
    return years[idx + 1] || years[1] || stored;
  });

  const { stats, loading } = useStats(year);

  useEffect(() => { localStorage.setItem("cem-selected-year", year); }, [year]);
  const visibleLevels = SCHOOL_STAGE === "lycee" ? ["1AS", "2AS", "3AS"] : ["1AM", "2AM", "3AM", "4AM"];
  const stageStats = stats?.byLevel.filter(l => visibleLevels.includes(l.niveau)) ?? [];

  const genderData = stats ? [
    { name: t("analytics.boys"), value: stats.boys },
    { name: t("analytics.girls"), value: stats.girls },
  ] : [];

  const levelData = stageStats.map((l, i) => ({
    name: LEVEL_LABELS[l.niveau] || l.niveau,
    [t("analytics.boys")]: l.boys,
    [t("analytics.girls")]: l.girls,
    color: LEVEL_COLORS[i % LEVEL_COLORS.length],
  }));

  const successData = stageStats.filter(l => l.admis > 0 || l.nonAdmis > 0).map(l => ({
    name: LEVEL_LABELS[l.niveau] || l.niveau,
    [t("analytics.passed")]: l.admis,
    [t("analytics.failed")]: l.nonAdmis,
  }));

  const stageTotal = stageStats.reduce((sum, l) => sum + l.total, 0);
  const stageCounts = stageStats.reduce(
    (acc, l) => ({
      admis: acc.admis + l.admis,
      nonAdmis: acc.nonAdmis + l.nonAdmis,
      mustarrak: acc.mustarrak + l.mustarrak,
    }),
    { admis: 0, nonAdmis: 0, mustarrak: 0 },
  );
  const stageEvaluated = evaluatedCount(stageCounts);
  const successRate = stageEvaluated > 0 ? successRatePercent(stageCounts) : null;
  const schoolAverage = stageStats.length > 0
    ? (stageStats.reduce((sum, l) => sum + (l.avgAge ?? 0), 0) / stageStats.length).toFixed(1)
    : "0.0";
  const absenceData = stageStats.map(level => ({
    name: LEVEL_LABELS[level.niveau] || level.niveau,
    [t("analytics.justifiedAbsences")]: level.justifiedHours,
    [t("analytics.unjustifiedAbsences")]: level.unjustifiedHours,
  }));
  const hasAbsenceData = stageStats.some(level =>
    level.justifiedHours > 0 || level.unjustifiedHours > 0,
  );

  // ── Age distribution aggregated across levels ──
  const ageDistMap = new Map<number, number>();
  for (const l of stageStats) {
    for (const a of l.ageDist) ageDistMap.set(a.age, (ageDistMap.get(a.age) ?? 0) + a.count);
  }
  const ageDistData = [...ageDistMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([age, count]) => ({ age: String(age), count }));

  // ── Trimester grade trend ──
  const trimesterNames: Record<number, string> = { 1: "الفصل الأول", 2: "الفصل الثاني", 3: "الفصل الثالث" };
  const trimesterData = [1, 2, 3]
    .map(n => {
      const t = stats?.gradesByTrimester.find(x => x.trimestre === n);
      return { name: trimesterNames[n], average: t?.average ?? 0, count: t?.count ?? 0 };
    })
    .filter(d => d.count > 0);

  // ── Subject pass rate (grade rows ≥ 10) ──
  const subjectPassData = (stats?.gradesBySubject ?? [])
    .map(s => ({ ...s, passRate: s.count > 0 ? Math.round((s.passed / s.count) * 100) : 0 }))
    .filter(s => s.count > 0);

  // ── Internat analytics ──
  const INTERNAT_CATS = ["داخلي", "نصف داخلي", "خارجي", "غير محدد"];
  const INTERNAT_COLORS: Record<string, string> = {
    "داخلي": "#3b82f6",
    "نصف داخلي": "#f59e0b",
    "خارجي": "#10b981",
    "غير محدد": "#94a3b8",
  };
  const internatPresent = INTERNAT_CATS.filter(cat =>
    stats?.internatByLevel?.some(x => x.internat === cat && x.total > 0)
    || stats?.byInternat?.some(x => x.internat === cat && x.total > 0),
  );
  const internatLevelData = visibleLevels.map(n => {
    const row: Record<string, string | number> = { name: LEVEL_LABELS[n] || n };
    for (const cat of internatPresent) {
      row[cat] = stats?.internatByLevel?.find(x => x.niveau === n && x.internat === cat)?.total ?? 0;
    }
    return row;
  }).filter(d => internatPresent.some(cat => (d[cat] as number) > 0));
  const internatSuccessData = internatPresent
    .map(cat => {
      const rows = stats?.internatByLevel?.filter(x => x.internat === cat) ?? [];
      const total = rows.reduce((s, r) => s + r.total, 0);
      const admis = rows.reduce((s, r) => s + r.admis, 0);
      const nonAdmis = rows.reduce((s, r) => s + r.nonAdmis, 0);
      const mustarrak = rows.reduce((s, r) => s + r.mustarrak, 0);
      return {
        name: cat,
        total,
        rate: successRatePercent({ admis, nonAdmis, mustarrak }),
      };
    })
    .filter(d => d.total > 0);

  // ── Result distribution (admis / mustarrak / non_admis) ──
  const resultData = [
    { name: "ناجح", value: stageCounts.admis || stats?.admis || 0, fill: "#10b981" },
    { name: "مستدرك", value: stageCounts.mustarrak || stats?.mustarrak || 0, fill: "#f59e0b" },
    { name: "راسب", value: stageCounts.nonAdmis || stats?.nonAdmis || 0, fill: "#f43f5e" },
  ].filter(d => d.value > 0);

  // ── Class size extremes ──
  const classSizes = (stats?.byClass ?? []).filter(c => c.total > 0);
  const largestClass = classSizes.length ? classSizes.reduce((a, b) => (b.total > a.total ? b : a)) : null;
  const smallestClass = classSizes.length ? classSizes.reduce((a, b) => (b.total < a.total ? b : a)) : null;
  const avgClassSize = classSizes.length
    ? Math.round((classSizes.reduce((s, c) => s + c.total, 0) / classSizes.length) * 10) / 10
    : null;

  const radialData = successRate !== null
    ? [{ name: t("analytics.passed"), value: successRate, fill: "#10b981" }]
    : [];

  return (
    <motion.div
      variants={pageVariants} initial="initial" animate="animate" exit="exit"
      className="p-6 space-y-6 max-w-6xl mx-auto"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4 }}>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <span className="inline-flex w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-purple-700 items-center justify-center shadow-lg shadow-violet-500/30">
              <BarChart3 className="w-5 h-5 text-white" />
            </span>
            {t("analytics.title")}
          </h1>
          <p className="text-xs text-muted-foreground mt-1 ms-11">{SCHOOL_STAGE_LABELS[SCHOOL_STAGE]} · {t("analytics.overview")}</p>
        </motion.div>

        <motion.div
          className="flex flex-wrap items-center gap-2"
          initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4, delay: 0.1 }}
        >
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger className="w-40 bg-gradient-to-r from-violet-500 to-purple-600 text-white border-0 shadow-lg shadow-violet-500/25 font-semibold text-xs h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
            </SelectContent>
          </Select>

          <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}>
            <Button
              size="sm" variant="outline"
              onClick={() => window.print()}
              className="gap-2 h-9 font-semibold text-xs no-print"
              data-testid="button-print-analytics"
            >
              <Printer className="w-3.5 h-3.5" />
              طباعة
            </Button>
          </motion.div>

          <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}>
            <Button
              size="sm"
              onClick={() => setCompareMode(m => !m)}
              className={`gap-2 h-9 font-semibold text-xs shadow-md transition-all ${
                compareMode
                  ? "bg-gradient-to-r from-amber-500 to-orange-600 text-white border-0 shadow-amber-500/30"
                  : "bg-gradient-to-r from-slate-600 to-slate-800 text-white border-0 hover:from-amber-500 hover:to-orange-600"
              }`}
            >
              <GitCompare className="w-3.5 h-3.5" />
              {compareMode ? "إلغاء المقارنة" : "مقارنة السنوات"}
            </Button>
          </motion.div>

          <AnimatePresence>
            {compareMode && (
              <motion.div
                initial={{ opacity: 0, width: 0, x: -8 }}
                animate={{ opacity: 1, width: "auto", x: 0 }}
                exit={{ opacity: 0, width: 0, x: -8 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <Select value={compareYear} onValueChange={setCompareYear}>
                  <SelectTrigger className="w-40 bg-gradient-to-r from-amber-500 to-orange-600 text-white border-0 shadow-lg shadow-amber-500/25 font-semibold text-xs h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {years.filter(y => y !== year).map(y => (
                      <SelectItem key={y} value={y}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      {/* ── Compare mode ── */}
      <AnimatePresence mode="wait">
        {compareMode && (
          <motion.div
            key="compare"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.35 }}
          >
            <Card className="border-0 shadow-lg bg-gradient-to-br from-indigo-50/80 to-amber-50/60 dark:from-indigo-950/40 dark:to-amber-950/30 overflow-hidden">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <GitCompare className="w-4 h-4 text-indigo-500" />
                  <span className="text-indigo-600 dark:text-indigo-300 font-extrabold">{year}</span>
                  <span className="text-muted-foreground">مقابل</span>
                  <span className="text-amber-600 dark:text-amber-300 font-extrabold">{compareYear}</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ComparisonSection yearA={year} yearB={compareYear} />
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Single year stats ── */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : !stats || stats.total === 0 ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4 }}
          className="text-center py-20"
        >
          <motion.div
            animate={{ y: [0, -8, 0] }} transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            className="w-20 h-20 rounded-2xl bg-violet-100 dark:bg-violet-950/40 flex items-center justify-center mx-auto mb-4"
          >
            <BarChart3 className="w-10 h-10 text-violet-400 opacity-60" />
          </motion.div>
          <p className="text-muted-foreground text-lg font-medium">{t("analytics.noData")}</p>
        </motion.div>
      ) : (
        <>
          {/* KPI cards */}
          <motion.div
            className="grid grid-cols-2 md:grid-cols-4 gap-4"
            initial="initial" animate="animate"
            variants={{ animate: { transition: { staggerChildren: 0.07 } } }}
          >
            {[
              { label: t("stats.total"), value: stageTotal || stats.total, icon: Users, bg: "from-blue-500 to-blue-700", shadow: "shadow-blue-500/30" },
              { label: t("analytics.boys"), value: stageStats.reduce((sum, l) => sum + l.boys, 0) || stats.boys, icon: Users, bg: "from-sky-500 to-cyan-600", shadow: "shadow-sky-500/30" },
              { label: t("analytics.girls"), value: stageStats.reduce((sum, l) => sum + l.girls, 0) || stats.girls, icon: Users, bg: "from-pink-500 to-rose-600", shadow: "shadow-pink-500/30" },
              ...(successRate !== null ? [{
                label: t("analytics.successRate"), value: successRate, icon: Award,
                bg: "from-emerald-500 to-green-700", shadow: "shadow-emerald-500/30", suffix: "%",
              }] : []),
              ...(stats.averageGrade !== null ? [{
                label: t("analytics.averageGrade"), value: stats.averageGrade, icon: TrendingUp,
                bg: "from-amber-500 to-orange-600", shadow: "shadow-amber-500/30", suffix: "/20",
              }] : []),
              ...(stats.justifiedHours + stats.unjustifiedHours > 0 ? [{
                label: t("analytics.absenceHours"), value: stats.justifiedHours + stats.unjustifiedHours, icon: UserX,
                bg: "from-rose-500 to-red-600", shadow: "shadow-rose-500/30", suffix: "",
              }] : []),
            ].map((item, i) => (
              <motion.div key={i} variants={cardVariants} whileHover={{ y: -4, scale: 1.03 }} transition={{ type: "spring", stiffness: 300 }}>
                <Card className={`border-0 shadow-lg ${item.shadow} overflow-hidden`}>
                  <div className={`bg-gradient-to-br ${item.bg} p-4 relative overflow-hidden`}>
                    <div className="absolute -top-6 -right-6 w-20 h-20 rounded-full bg-white/10 blur-xl" />
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-white/80 text-xs font-semibold">{item.label}</p>
                      <item.icon className="w-4 h-4 text-white/60" />
                    </div>
                    <p className="text-3xl font-extrabold text-white tracking-tight">
                      <CountUp to={item.value} />{(item as any).suffix ?? ""}
                    </p>
                  </div>
                </Card>
              </motion.div>
            ))}
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {/* Gender Pie */}
            <motion.div variants={cardVariants} initial="initial" animate="animate" whileHover={{ y: -3 }} transition={{ type: "spring", stiffness: 200 }}>
              <Card className="shadow-md border-0 bg-gradient-to-br from-card to-muted/30 h-full">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-blue-500" />
                    {t("analytics.genderPie")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={460}>
                    <PieChart>
                      <Pie data={genderData} cx="50%" cy="50%" innerRadius={95} outerRadius={135}
                        paddingAngle={4} dataKey="value" animationDuration={800}>
                        {genderData.map((_, i) => (
                          <Cell key={i} fill={GENDER_COLORS[i % GENDER_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip content={<CustomTooltip />} />
                      <Legend iconType="circle" iconSize={8} />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </motion.div>

            {/* Radial success */}
            {successRate !== null && (
              <motion.div variants={cardVariants} initial="initial" animate="animate" whileHover={{ y: -3 }} transition={{ type: "spring", stiffness: 200 }}>
                <Card className="shadow-md border-0 bg-gradient-to-br from-card to-muted/30 h-full">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-bold flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      {t("analytics.successRate")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col items-center">
                    <div className="relative">
                      <ResponsiveContainer width={180} height={180}>
                        <RadialBarChart cx="50%" cy="50%" innerRadius={55} outerRadius={80}
                          barSize={14} data={radialData} startAngle={90} endAngle={-270}>
                          <RadialBar background={{ fill: "#e5e7eb" }} dataKey="value" cornerRadius={8} />
                        </RadialBarChart>
                      </ResponsiveContainer>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-3xl font-extrabold text-emerald-500">{successRate}%</span>
                        <span className="text-xs text-muted-foreground">{t("analytics.passed")}</span>
                      </div>
                    </div>
                    <div className="flex gap-4 text-xs mt-1">
                      <span className="flex items-center gap-1.5 text-emerald-600 font-semibold">
                        <UserCheck className="w-3.5 h-3.5" />{stageCounts.admis || stats.admis}
                      </span>
                      {(stageCounts.mustarrak || stats.mustarrak) > 0 && (
                        <span className="flex items-center gap-1.5 text-amber-600 font-semibold">
                          <TrendingUp className="w-3.5 h-3.5" />{stageCounts.mustarrak || stats.mustarrak}
                        </span>
                      )}
                      <span className="flex items-center gap-1.5 text-red-500 font-semibold">
                        <UserX className="w-3.5 h-3.5" />{stageCounts.nonAdmis || stats.nonAdmis}
                      </span>
                    </div>
                    <div className="mt-3 rounded-xl bg-muted/60 px-3 py-2 text-center text-[11px] text-muted-foreground">
                      متوسط العمر في {SCHOOL_STAGE_LABELS[SCHOOL_STAGE]}: <span className="font-bold text-foreground">{schoolAverage} سنة</span>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Level bar */}
            <motion.div variants={cardVariants} initial="initial" animate="animate" whileHover={{ y: -3 }}
              transition={{ type: "spring", stiffness: 200 }}
              className={successRate !== null ? "" : "md:col-span-2 xl:col-span-1"}>
              <Card className="shadow-md border-0 bg-gradient-to-br from-card to-muted/30 h-full">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-violet-500" />
                    {t("analytics.levelBar")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={460}>
                    <BarChart data={levelData} barSize={40}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                      <XAxis dataKey="name" tick={{ fontSize: 14, fontWeight: "bold" }} />
                      <YAxis tick={{ fontSize: 14, fontWeight: "bold" }} width={36} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey={t("analytics.boys")} fill="#3b82f6" radius={[4, 4, 0, 0]} />
                      <Bar dataKey={t("analytics.girls")} fill="#ec4899" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </motion.div>

            {/* Success by level */}
            {successData.length > 0 && (
              <motion.div variants={cardVariants} initial="initial" animate="animate" whileHover={{ y: -3 }}
                transition={{ type: "spring", stiffness: 200 }} className="md:col-span-2 xl:col-span-3">
                <Card className="shadow-md border-0 bg-gradient-to-br from-card to-muted/30">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-bold flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      {t("analytics.successBar")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={460}>
                      <BarChart data={successData} barSize={44}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                        <XAxis dataKey="name" tick={{ fontSize: 14, fontWeight: "bold" }} />
                        <YAxis tick={{ fontSize: 14, fontWeight: "bold" }} width={36} />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend iconType="circle" iconSize={8} />
                        <Bar dataKey={t("analytics.passed")} fill={SUCCESS_COLORS.pass} radius={[6, 6, 0, 0]} />
                        <Bar dataKey={t("analytics.failed")} fill={SUCCESS_COLORS.fail} radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {stats.gradesBySubject.length > 0 && (
              <motion.div variants={cardVariants} initial="initial" animate="animate" whileHover={{ y: -3 }}
                transition={{ type: "spring", stiffness: 200 }} className="md:col-span-2 xl:col-span-3">
                <Card className="shadow-md border-0 bg-gradient-to-br from-card to-muted/30">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-bold flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-amber-500" />
                      {t("analytics.averageGradeBySubject")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={320}>
                      <BarChart data={stats.gradesBySubject}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                        <XAxis dataKey="subject" tick={{ fontSize: 12 }} />
                        <YAxis domain={[0, 20]} tick={{ fontSize: 12 }} width={36} />
                        <Tooltip content={<CustomTooltip />} />
                        <Bar dataKey="average" name={t("analytics.averageGrade")} fill="#f59e0b" radius={[5, 5, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {hasAbsenceData && (
              <motion.div variants={cardVariants} initial="initial" animate="animate" whileHover={{ y: -3 }}
                transition={{ type: "spring", stiffness: 200 }} className="md:col-span-2 xl:col-span-3">
                <Card className="shadow-md border-0 bg-gradient-to-br from-card to-muted/30">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-bold flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-rose-500" />
                      {t("analytics.absencesByLevel")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={320}>
                      <BarChart data={absenceData}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                        <YAxis tick={{ fontSize: 12 }} width={36} />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend iconType="circle" iconSize={8} />
                        <Bar dataKey={t("analytics.justifiedAbsences")} fill="#14b8a6" radius={[4, 4, 0, 0]} />
                        <Bar dataKey={t("analytics.unjustifiedAbsences")} fill="#f43f5e" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Age distribution */}
            {ageDistData.length > 0 && (
              <motion.div variants={cardVariants} initial="initial" animate="animate" whileHover={{ y: -3 }}
                transition={{ type: "spring", stiffness: 200 }} className="md:col-span-1 xl:col-span-1">
                <Card className="shadow-md border-0 bg-gradient-to-br from-card to-muted/30 h-full">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-bold flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-cyan-500" />
                      توزيع الأعمار
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={ageDistData} barSize={18}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                        <XAxis dataKey="age" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} width={30} allowDecimals={false} />
                        <Tooltip content={<CustomTooltip />} />
                        <Bar dataKey="count" name="التلاميذ" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Trimester grade trend */}
            {trimesterData.length > 0 && (
              <motion.div variants={cardVariants} initial="initial" animate="animate" whileHover={{ y: -3 }}
                transition={{ type: "spring", stiffness: 200 }} className="md:col-span-1 xl:col-span-2">
                <Card className="shadow-md border-0 bg-gradient-to-br from-card to-muted/30 h-full">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-bold flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-indigo-500" />
                      تطور المعدل العام حسب الفصل /20
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={trimesterData}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                        <XAxis dataKey="name" tick={{ fontSize: 12, fontWeight: "bold" }} />
                        <YAxis domain={[0, 20]} tick={{ fontSize: 11 }} width={34} />
                        <Tooltip content={<CustomTooltip />} />
                        <Line type="monotone" dataKey="average" name="المعدل"
                          stroke="#6366f1" strokeWidth={3} dot={{ r: 6, fill: "#6366f1" }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Result distribution pie */}
            {resultData.length > 0 && (
              <motion.div variants={cardVariants} initial="initial" animate="animate" whileHover={{ y: -3 }}
                transition={{ type: "spring", stiffness: 200 }} className="md:col-span-1 xl:col-span-1">
                <Card className="shadow-md border-0 bg-gradient-to-br from-card to-muted/30 h-full">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-bold flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      توزيع النتائج
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie data={resultData} cx="50%" cy="50%" innerRadius={60} outerRadius={90}
                          paddingAngle={4} dataKey="value" animationDuration={800}>
                          {resultData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                        </Pie>
                        <Tooltip content={<CustomTooltip />} />
                        <Legend iconType="circle" iconSize={8} />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Subject pass rate */}
            {subjectPassData.length > 0 && (
              <motion.div variants={cardVariants} initial="initial" animate="animate" whileHover={{ y: -3 }}
                transition={{ type: "spring", stiffness: 200 }} className="md:col-span-2 xl:col-span-3">
                <Card className="shadow-md border-0 bg-gradient-to-br from-card to-muted/30">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-bold flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-teal-500" />
                      نسبة النجاح لكل مادة (علامات ≥ 10)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {subjectPassData.map((s, i) => (
                        <div key={s.subject} className="rounded-xl border bg-muted/20 p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-bold text-foreground truncate">{s.subject}</span>
                            <span className={`text-xs font-extrabold px-2 py-0.5 rounded-full ${
                              s.passRate >= 75 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400"
                              : s.passRate >= 50 ? "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400"
                              : "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400"
                            }`}>{s.passRate}%</span>
                          </div>
                          <div className="h-2 rounded-full bg-muted overflow-hidden">
                            <motion.div
                              className={`h-full rounded-full ${
                                s.passRate >= 75 ? "bg-emerald-500"
                                : s.passRate >= 50 ? "bg-amber-500"
                                : "bg-red-500"
                              }`}
                              initial={{ width: 0 }}
                              animate={{ width: `${s.passRate}%` }}
                              transition={{ duration: 0.8, delay: i * 0.05 }}
                            />
                          </div>
                          <div className="flex justify-between text-[11px] text-muted-foreground">
                            <span>معدل: <b className="text-foreground">{s.average}/20</b></span>
                            <span>{s.passed}/{s.count} علامة ≥10</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Class size extremes */}
            {classSizes.length > 0 && avgClassSize !== null && (
              <motion.div variants={cardVariants} initial="initial" animate="animate"
                className="md:col-span-2 xl:col-span-3">
                <Card className="shadow-md border-0">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-bold flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-violet-500" />
                      حجم الأقسام
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      {[
                        { label: "أكبر قسم", value: largestClass ? `${LEVEL_LABELS[largestClass.niveau] || largestClass.niveau} — ${largestClass.classe}` : "—", count: largestClass?.total ?? 0, icon: "📈", color: "border-blue-200 dark:border-blue-900/50" },
                        { label: "أصغر قسم", value: smallestClass ? `${LEVEL_LABELS[smallestClass.niveau] || smallestClass.niveau} — ${smallestClass.classe}` : "—", count: smallestClass?.total ?? 0, icon: "📉", color: "border-emerald-200 dark:border-emerald-900/50" },
                        { label: "متوسط حجم القسم", value: `${avgClassSize} تلميذ`, count: classSizes.length, icon: "📊", color: "border-violet-200 dark:border-violet-900/50" },
                      ].map((item, i) => (
                        <div key={i} className={`rounded-xl border ${item.color} bg-muted/20 p-4 text-center space-y-1`}>
                          <p className="text-2xl">{item.icon}</p>
                          <p className="text-xs text-muted-foreground font-semibold">{item.label}</p>
                          <p className="text-sm font-extrabold text-foreground truncate">{item.value}</p>
                          {item.label !== "متوسط حجم القسم" && (
                            <p className="text-lg font-extrabold text-blue-600"><CountUp to={item.count} /></p>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Level table */}
            <motion.div variants={cardVariants} initial="initial" animate="animate"
              className="md:col-span-2 xl:col-span-3">
              <Card className="shadow-md border-0">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-violet-500" />
                    {t("stats.byLevel")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-muted-foreground text-xs uppercase">
                          <th className="pb-2 text-start font-semibold">{t("stats.level")}</th>
                          <th className="pb-2 text-center font-semibold">{t("stats.total_col")}</th>
                          <th className="pb-2 text-center font-semibold text-blue-500">{t("analytics.boys")}</th>
                          <th className="pb-2 text-center font-semibold text-pink-500">{t("analytics.girls")}</th>
                          <th className="pb-2 text-center font-semibold text-emerald-500">{t("analytics.passed")}</th>
                          <th className="pb-2 text-center font-semibold text-red-500">{t("analytics.failed")}</th>
                          <th className="pb-2 text-center font-semibold">{t("analytics.rate")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stats.byLevel.map((l, i) => {
                          const rate = successRatePercent(l);
                          return (
                            <motion.tr key={l.niveau}
                              initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: i * 0.06 }}
                              className={`border-b last:border-0 hover:bg-muted/30 transition-colors ${i % 2 === 0 ? "" : "bg-muted/15"}`}
                            >
                              <td className="py-3 font-bold text-foreground">
                                <span className="inline-flex items-center gap-2">
                                  <span className="w-2.5 h-2.5 rounded-full"
                                    style={{ backgroundColor: LEVEL_COLORS[i % LEVEL_COLORS.length] }} />
                                  {LEVEL_LABELS[l.niveau] || l.niveau}
                                </span>
                              </td>
                              <td className="py-3 text-center font-bold"><CountUp to={l.total} /></td>
                              <td className="py-3 text-center text-blue-600 dark:text-blue-400 font-semibold"><CountUp to={l.boys} /></td>
                              <td className="py-3 text-center text-pink-600 dark:text-pink-400 font-semibold"><CountUp to={l.girls} /></td>
                              <td className="py-3 text-center text-emerald-600 font-semibold">{l.admis ? <CountUp to={l.admis} /> : "—"}</td>
                              <td className="py-3 text-center text-red-500 font-semibold">{l.nonAdmis ? <CountUp to={l.nonAdmis} /> : "—"}</td>
                              <td className="py-3 text-center">
                                {rate !== null ? (
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${
                                    rate >= 75 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400"
                                    : rate >= 50 ? "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400"
                                    : "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400"
                                  }`}>
                                    {rate}%
                                  </span>
                                ) : "—"}
                              </td>
                            </motion.tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* ── New analytics: Repeater breakdown ── */}
            {stats.redoublant > 0 && (() => {
              const repeaterData = [
                { name: "جدد", value: stats.nouveau, fill: "#6366f1" },
                { name: "معيدون", value: stats.redoublant, fill: "#f59e0b" },
              ];
              const repeaterRate = stats.total > 0 ? Math.round((stats.redoublant / stats.total) * 100) : 0;
              const repeaterByLevel = stats.byLevel
                .filter(l => l.total > 0)
                .map(l => ({
                  name: LEVEL_LABELS[l.niveau] || l.niveau,
                  جدد: l.nouveau,
                  معيدون: l.redoublant,
                  "نسبة الإعادة": l.total > 0 ? Math.round((l.redoublant / l.total) * 100) : 0,
                }));

              return (
                <>
                  {/* Repeater KPI banner */}
                  <motion.div variants={cardVariants} initial="initial" animate="animate"
                    className="md:col-span-2 xl:col-span-3">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {[
                        { label: "إجمالي جدد", value: stats.nouveau, bg: "from-indigo-500 to-violet-600", suffix: "" },
                        { label: "إجمالي معيدين", value: stats.redoublant, bg: "from-amber-500 to-orange-600", suffix: "" },
                        { label: "نسبة الإعادة", value: repeaterRate, bg: "from-rose-500 to-red-600", suffix: "%" },
                        {
                          label: "ذكور معيدون",
                          value: stats.byLevel.reduce((s, l) => {
                            const redoublantTotal = l.redoublant;
                            const mRatio = l.total > 0 ? l.boys / l.total : 0.5;
                            return s + Math.round(redoublantTotal * mRatio);
                          }, 0),
                          bg: "from-sky-500 to-cyan-600",
                          suffix: "",
                        },
                      ].map((item, i) => (
                        <motion.div key={i} whileHover={{ y: -3 }} transition={{ type: "spring", stiffness: 300 }}>
                          <Card className="border-0 shadow-md overflow-hidden">
                            <div className={`bg-gradient-to-br ${item.bg} p-4 relative overflow-hidden`}>
                              <div className="absolute -top-5 -right-5 w-16 h-16 rounded-full bg-white/10 blur-xl" />
                              <p className="text-white/75 text-xs font-semibold mb-1">{item.label}</p>
                              <p className="text-2xl font-extrabold text-white">
                                <CountUp to={item.value} />{item.suffix}
                              </p>
                            </div>
                          </Card>
                        </motion.div>
                      ))}
                    </div>
                  </motion.div>

                  {/* Pie: new vs repeater */}
                  <motion.div variants={cardVariants} initial="initial" animate="animate" whileHover={{ y: -3 }} transition={{ type: "spring", stiffness: 200 }}>
                    <Card className="shadow-md border-0 bg-gradient-to-br from-card to-muted/30 h-full">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-bold flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-amber-500" />
                          توزيع جدد / معيدون
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ResponsiveContainer width="100%" height={460}>
                          <PieChart>
                            <Pie data={repeaterData} cx="50%" cy="50%" innerRadius={80} outerRadius={115}
                              paddingAngle={4} dataKey="value" animationDuration={800}>
                              {repeaterData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                            </Pie>
                            <Tooltip content={<CustomTooltip />} />
                            <Legend iconType="circle" iconSize={8} />
                          </PieChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>
                  </motion.div>

                  {/* Bar: new vs repeater by level */}
                  <motion.div variants={cardVariants} initial="initial" animate="animate" whileHover={{ y: -3 }}
                    transition={{ type: "spring", stiffness: 200 }} className="md:col-span-1 xl:col-span-2">
                    <Card className="shadow-md border-0 bg-gradient-to-br from-card to-muted/30 h-full">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-bold flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-indigo-500" />
                          جدد مقابل معيدين حسب المستوى
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ResponsiveContainer width="100%" height={460}>
                          <BarChart data={repeaterByLevel} barSize={40} barGap={6}>
                            <CartesianGrid strokeDasharray="3 3" opacity={0.12} />
                            <XAxis dataKey="name" tick={{ fontSize: 14, fontWeight: "bold" }} />
                            <YAxis tick={{ fontSize: 14, fontWeight: "bold" }} width={36} />
                            <Tooltip content={<CustomTooltip />} />
                            <Legend iconType="circle" iconSize={8} />
                            <Bar dataKey="جدد" fill="#6366f1" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="معيدون" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>
                  </motion.div>

                  {/* Repeater rate by level */}
                  <motion.div variants={cardVariants} initial="initial" animate="animate" whileHover={{ y: -3 }}
                    transition={{ type: "spring", stiffness: 200 }} className="md:col-span-2 xl:col-span-3">
                    <Card className="shadow-md border-0 bg-gradient-to-br from-card to-muted/30">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-bold flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-rose-500" />
                          نسبة الإعادة حسب المستوى %
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          {repeaterByLevel.map((l, i) => (
                            <div key={i} className="space-y-1">
                              <div className="flex items-center justify-between text-xs">
                                <span className="font-semibold text-foreground">{l.name}</span>
                                <span className={`font-bold ${
                                  l["نسبة الإعادة"] >= 30 ? "text-red-500"
                                  : l["نسبة الإعادة"] >= 15 ? "text-amber-500"
                                  : "text-emerald-500"
                                }`}>{l["نسبة الإعادة"]}%</span>
                              </div>
                              <div className="h-2 rounded-full bg-muted overflow-hidden">
                                <motion.div
                                  className={`h-full rounded-full ${
                                    l["نسبة الإعادة"] >= 30 ? "bg-red-500"
                                    : l["نسبة الإعادة"] >= 15 ? "bg-amber-500"
                                    : "bg-emerald-500"
                                  }`}
                                  initial={{ width: 0 }}
                                  animate={{ width: `${l["نسبة الإعادة"]}%` }}
                                  transition={{ duration: 0.8, delay: i * 0.1 }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                </>
              );
            })()}

            {/* ── Gender average grade (real per-gender grade data) ── */}
            {(stats.boysAvgGrade !== null || stats.girlsAvgGrade !== null) && (
              <motion.div variants={cardVariants} initial="initial" animate="animate" whileHover={{ y: -2 }}
                transition={{ type: "spring", stiffness: 200 }} className="md:col-span-2 xl:col-span-3">
                <Card className="shadow-md border-0 bg-gradient-to-br from-card to-muted/20">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-bold flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-cyan-500" />
                      متوسط الدرجة حسب الجنس /20
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={Math.max(220, Math.min(460, (stats.gradesBySubject.length || 4) * 40))}>
                      <BarChart
                        data={[
                          { name: t("analytics.boys"), avg: stats.boysAvgGrade ?? 0 },
                          { name: t("analytics.girls"), avg: stats.girlsAvgGrade ?? 0 },
                        ]}
                        barSize={80}
                      >
                        <CartesianGrid strokeDasharray="3 3" opacity={0.12} />
                        <XAxis dataKey="name" tick={{ fontSize: 14, fontWeight: "bold" }} />
                        <YAxis domain={[0, 20]} tick={{ fontSize: 14, fontWeight: "bold" }} width={40} />
                        <Tooltip content={<CustomTooltip />} />
                        <Bar dataKey="avg" name="المتوسط" radius={[6, 6, 0, 0]}>
                          <Cell fill="#3b82f6" />
                          <Cell fill="#ec4899" />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                    <div className="flex justify-center gap-8 text-sm mt-2">
                      <span className="font-bold text-blue-600 dark:text-blue-400">{t("analytics.boys")}: {stats.boysAvgGrade ?? "—"}/20</span>
                      <span className="font-bold text-pink-600 dark:text-pink-400">{t("analytics.girls")}: {stats.girlsAvgGrade ?? "—"}/20</span>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* ── Internat (نظام التمدرس) breakdown ── */}
            {(stats.byInternat?.length ?? 0) > 0 && stats.byInternat.some(i => i.total > 0) && (
              <motion.div variants={cardVariants} initial="initial" animate="animate"
                className="md:col-span-2 xl:col-span-3">
                <Card className="shadow-md border-0">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-bold flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-teal-500" />
                      نظام التمدرس — داخلي / نصف داخلي / خارجي
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      {stats.byInternat.filter(i => i.total > 0).map((i, idx) => {
                        const rate = successRatePercent(i);
                        const colors = ["from-blue-500 to-indigo-600", "from-amber-500 to-orange-600", "from-emerald-500 to-teal-600", "from-slate-500 to-slate-600"];
                        return (
                          <motion.div key={i.internat}
                            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.07 }}
                            className="rounded-xl border bg-muted/20 p-4 space-y-2"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-bold text-foreground">{i.internat}</span>
                              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                                rate === null ? "bg-muted text-muted-foreground"
                                : rate >= 75 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400"
                                : rate >= 50 ? "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400"
                                : "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400"
                              }`}>{rate !== null ? `${rate}%` : "—"}</span>
                            </div>
                            <div className="grid grid-cols-3 gap-2 text-center">
                              <div><p className="text-lg font-extrabold text-foreground"><CountUp to={i.total} /></p><p className="text-[10px] text-muted-foreground">المجموع</p></div>
                              <div><p className="text-lg font-extrabold text-blue-600"><CountUp to={i.boys} /></p><p className="text-[10px] text-muted-foreground">ذكور</p></div>
                              <div><p className="text-lg font-extrabold text-pink-600"><CountUp to={i.girls} /></p><p className="text-[10px] text-muted-foreground">إناث</p></div>
                            </div>
                            <div className="flex justify-between text-[11px] text-muted-foreground border-t pt-2">
                              <span>ناجح: <b className="text-emerald-600">{i.admis}</b></span>
                              <span>مستدرك: <b className="text-amber-600">{i.mustarrak}</b></span>
                              <span>راسب: <b className="text-red-500">{i.nonAdmis}</b></span>
                              {i.averageGrade !== null && <span>معدل: <b className="text-foreground">{i.averageGrade}/20</b></span>}
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>

                    {/* Internat × level stacked bar */}
                    {internatLevelData.length > 0 && (
                      <div className="mt-6 pt-5 border-t">
                        <p className="text-xs font-bold text-muted-foreground mb-3 flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-teal-500" />
                          توزيع التلاميذ حسب نظام التمدرس والمستوى
                        </p>
                        <ResponsiveContainer width="100%" height={280}>
                          <BarChart data={internatLevelData} barSize={26}>
                            <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                            <XAxis dataKey="name" tick={{ fontSize: 12, fontWeight: "bold" }} />
                            <YAxis tick={{ fontSize: 11 }} width={34} allowDecimals={false} />
                            <Tooltip content={<CustomTooltip />} />
                            <Legend iconType="circle" iconSize={8} />
                            {internatPresent.map(cat => (
                              <Bar key={cat} dataKey={cat} stackId="internat" fill={INTERNAT_COLORS[cat] ?? "#94a3b8"} />
                            ))}
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}

                    {/* Success rate per internat category */}
                    {internatSuccessData.length > 0 && (
                      <div className="mt-6 pt-5 border-t">
                        <p className="text-xs font-bold text-muted-foreground mb-3 flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-emerald-500" />
                          نسبة النجاح حسب نظام التمدرس %
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {internatSuccessData.map((d, i) => (
                            <div key={d.name} className="rounded-xl border bg-muted/20 p-3 space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-bold flex items-center gap-2">
                                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: INTERNAT_COLORS[d.name] ?? "#94a3b8" }} />
                                  {d.name}
                                </span>
                                <span className={`text-xs font-extrabold px-2 py-0.5 rounded-full ${
                                  d.rate === null ? "bg-muted text-muted-foreground"
                                  : d.rate >= 75 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400"
                                  : d.rate >= 50 ? "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400"
                                  : "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400"
                                }`}>{d.rate !== null ? `${d.rate}%` : "—"}</span>
                              </div>
                              <div className="h-2 rounded-full bg-muted overflow-hidden">
                                <motion.div
                                  className={`h-full rounded-full ${
                                    (d.rate ?? 0) >= 75 ? "bg-emerald-500"
                                    : (d.rate ?? 0) >= 50 ? "bg-amber-500"
                                    : "bg-red-500"
                                  }`}
                                  initial={{ width: 0 }}
                                  animate={{ width: `${d.rate ?? 0}%` }}
                                  transition={{ duration: 0.8, delay: i * 0.08 }}
                                />
                              </div>
                              <p className="text-[11px] text-muted-foreground">إجمالي: <b className="text-foreground">{d.total}</b> تلميذ</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Internat × level detail table */}
                    {(stats.internatByLevel?.length ?? 0) > 0 && (
                      <div className="mt-6 pt-5 border-t">
                        <p className="text-xs font-bold text-muted-foreground mb-3">تفاصيل نظام التمدرس حسب المستوى</p>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b text-muted-foreground text-xs uppercase">
                                <th className="pb-2 text-start font-semibold">نظام التمدرس</th>
                                <th className="pb-2 text-start font-semibold">المستوى</th>
                                <th className="pb-2 text-center font-semibold">المجموع</th>
                                <th className="pb-2 text-center font-semibold text-blue-500">ذكور</th>
                                <th className="pb-2 text-center font-semibold text-pink-500">إناث</th>
                                <th className="pb-2 text-center font-semibold text-emerald-500">ناجح</th>
                                <th className="pb-2 text-center font-semibold text-amber-500">مستدرك</th>
                                <th className="pb-2 text-center font-semibold text-red-500">راسب</th>
                                <th className="pb-2 text-center font-semibold">المعدل</th>
                              </tr>
                            </thead>
                            <tbody>
                              {stats.internatByLevel
                                .slice()
                                .sort((a, b) => {
                                  const ic = INTERNAT_CATS.indexOf(a.internat);
                                  const jc = INTERNAT_CATS.indexOf(b.internat);
                                  const ai = ic === -1 ? 99 : ic;
                                  const bi = jc === -1 ? 99 : jc;
                                  if (ai !== bi) return ai - bi;
                                  return visibleLevels.indexOf(a.niveau as any) - visibleLevels.indexOf(b.niveau as any);
                                })
                                .map((r, i) => {
                                  const rate = successRatePercent(r);
                                  return (
                                    <motion.tr key={`${r.internat}-${r.niveau}`}
                                      initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                                      transition={{ delay: Math.min(i * 0.03, 0.6) }}
                                      className={`border-b last:border-0 hover:bg-muted/30 transition-colors ${i % 2 === 0 ? "" : "bg-muted/15"}`}
                                    >
                                      <td className="py-2 font-semibold">
                                        <span className="inline-flex items-center gap-1.5">
                                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: INTERNAT_COLORS[r.internat] ?? "#94a3b8" }} />
                                          {r.internat}
                                        </span>
                                      </td>
                                      <td className="py-2 font-semibold">{LEVEL_LABELS[r.niveau] || r.niveau}</td>
                                      <td className="py-2 text-center font-bold"><CountUp to={r.total} /></td>
                                      <td className="py-2 text-center text-blue-600 dark:text-blue-400 font-semibold"><CountUp to={r.boys} /></td>
                                      <td className="py-2 text-center text-pink-600 dark:text-pink-400 font-semibold"><CountUp to={r.girls} /></td>
                                      <td className="py-2 text-center text-emerald-600 font-semibold">{r.admis ? <CountUp to={r.admis} /> : "—"}</td>
                                      <td className="py-2 text-center text-amber-600 font-semibold">{r.mustarrak ? <CountUp to={r.mustarrak} /> : "—"}</td>
                                      <td className="py-2 text-center text-red-500 font-semibold">{r.nonAdmis ? <CountUp to={r.nonAdmis} /> : "—"}</td>
                                      <td className="py-2 text-center">
                                        {rate !== null ? (
                                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${
                                            rate >= 75 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400"
                                            : rate >= 50 ? "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400"
                                            : "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400"
                                          }`}>{rate}%</span>
                                        ) : "—"}
                                      </td>
                                      <td className="py-2 text-center font-bold text-foreground">
                                        {r.averageGrade !== null ? `${r.averageGrade}/20` : "—"}
                                      </td>
                                    </motion.tr>
                                  );
                                })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* ── Top absent students ── */}
            {(stats.topAbsentStudents?.length ?? 0) > 0 && (
              <motion.div variants={cardVariants} initial="initial" animate="animate"
                className="md:col-span-2 xl:col-span-3">
                <Card className="shadow-md border-0">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-bold flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-rose-500" />
                      أكثر التلاميذ غياباً (ساعات)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b text-muted-foreground text-xs uppercase">
                            <th className="pb-2 text-start font-semibold">#</th>
                            <th className="pb-2 text-start font-semibold">التلميذ</th>
                            <th className="pb-2 text-start font-semibold">القسم</th>
                            <th className="pb-2 text-center font-semibold text-teal-600">مبرر</th>
                            <th className="pb-2 text-center font-semibold text-red-500">غير مبرر</th>
                            <th className="pb-2 text-center font-semibold">المجموع</th>
                          </tr>
                        </thead>
                        <tbody>
                          {stats.topAbsentStudents.map((s, i) => (
                            <motion.tr key={s.id}
                              initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: Math.min(i * 0.05, 0.6) }}
                              className={`border-b last:border-0 hover:bg-muted/30 transition-colors ${i % 2 === 0 ? "" : "bg-muted/15"}`}
                            >
                              <td className="py-2.5">
                                <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-extrabold ${
                                  i === 0 ? "bg-red-100 text-red-600 dark:bg-red-950/50 dark:text-red-400"
                                  : i === 1 ? "bg-amber-100 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400"
                                  : i === 2 ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-950/50"
                                  : "bg-muted text-muted-foreground"
                                }`}>{i + 1}</span>
                              </td>
                              <td className="py-2.5 font-semibold text-foreground">{s.nomPrenom}</td>
                              <td className="py-2.5 text-muted-foreground whitespace-nowrap">
                                {LEVEL_LABELS[s.niveau] || s.niveau} — {s.classe}
                              </td>
                              <td className="py-2.5 text-center text-teal-600 font-semibold">{s.justifiedHours || "—"}</td>
                              <td className="py-2.5 text-center text-red-500 font-semibold">{s.unjustifiedHours || "—"}</td>
                              <td className="py-2.5 text-center">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-extrabold ${
                                  s.totalHours >= 20 ? "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400"
                                  : s.totalHours >= 10 ? "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400"
                                  : "bg-muted text-muted-foreground"
                                }`}>{s.totalHours}h</span>
                              </td>
                            </motion.tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* ── Per-class breakdown ── */}
            {(stats.byClass?.length ?? 0) > 0 && (
              <motion.div variants={cardVariants} initial="initial" animate="animate"
                className="md:col-span-2 xl:col-span-3">
                <Card className="shadow-md border-0">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-bold flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-indigo-500" />
                      إحصائيات الأقسام / الفصول
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b text-muted-foreground text-xs uppercase">
                            <th className="pb-2 text-start font-semibold">القسم</th>
                            <th className="pb-2 text-center font-semibold">{t("stats.total_col")}</th>
                            <th className="pb-2 text-center font-semibold text-blue-500">{t("analytics.boys")}</th>
                            <th className="pb-2 text-center font-semibold text-pink-500">{t("analytics.girls")}</th>
                            <th className="pb-2 text-center font-semibold text-emerald-500">{t("analytics.passed")}</th>
                            <th className="pb-2 text-center font-semibold text-amber-500">مستدرك</th>
                            <th className="pb-2 text-center font-semibold text-red-500">{t("analytics.failed")}</th>
                            <th className="pb-2 text-center font-semibold">{t("analytics.rate")}</th>
                            <th className="pb-2 text-center font-semibold">المعدل</th>
                          </tr>
                        </thead>
                        <tbody>
                          {stats.byClass.map((c, i) => {
                            const rate = successRatePercent(c);
                            return (
                              <motion.tr key={`${c.niveau}-${c.classe}`}
                                initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: Math.min(i * 0.03, 0.6) }}
                                className={`border-b last:border-0 hover:bg-muted/30 transition-colors ${i % 2 === 0 ? "" : "bg-muted/15"}`}
                              >
                                <td className="py-2.5 font-semibold text-foreground whitespace-nowrap">
                                  {LEVEL_LABELS[c.niveau] || c.niveau} — {c.classe}
                                </td>
                                <td className="py-2.5 text-center font-bold"><CountUp to={c.total} /></td>
                                <td className="py-2.5 text-center text-blue-600 dark:text-blue-400 font-semibold"><CountUp to={c.boys} /></td>
                                <td className="py-2.5 text-center text-pink-600 dark:text-pink-400 font-semibold"><CountUp to={c.girls} /></td>
                                <td className="py-2.5 text-center text-emerald-600 font-semibold">{c.admis ? <CountUp to={c.admis} /> : "—"}</td>
                                <td className="py-2.5 text-center text-amber-600 font-semibold">{c.mustarrak ? <CountUp to={c.mustarrak} /> : "—"}</td>
                                <td className="py-2.5 text-center text-red-500 font-semibold">{c.nonAdmis ? <CountUp to={c.nonAdmis} /> : "—"}</td>
                                <td className="py-2.5 text-center">
                                  {rate !== null ? (
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${
                                      rate >= 75 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400"
                                      : rate >= 50 ? "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400"
                                      : "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400"
                                    }`}>{rate}%</span>
                                  ) : "—"}
                                </td>
                                <td className="py-2.5 text-center font-bold text-foreground">
                                  {c.averageGrade !== null ? `${c.averageGrade}/20` : "—"}
                                </td>
                              </motion.tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </div>
        </>
      )}
    </motion.div>
  );
}
