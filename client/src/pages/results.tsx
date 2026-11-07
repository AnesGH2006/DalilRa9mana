import { useState, useEffect, useCallback, useRef } from "react";
import { useLanguage } from "@/contexts/language-provider";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Pencil, ClipboardList, Search, Upload, CheckCircle2, AlertCircle,
  X, FileSpreadsheet, Loader2, Printer, Trophy, TrendingUp, TrendingDown,
  BarChart3, Users, Target, GraduationCap, XCircle, ArrowUpDown, Star,
  Trash2,
} from "lucide-react";
import { getSubjectsForLevel, calcWeightedAvg } from "@shared/subjects";
import type { StudentResult } from "@shared/types";
import type { Niveau } from "@shared/types";
import { SCHOOL_STAGE } from "@/lib/deployment";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, ReferenceLine, Legend,
  RadialBarChart, RadialBar, AreaChart, Area, ScatterChart, Scatter,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from "recharts";
import { CountUp } from "@/components/count-up";

const BASE = import.meta.env.BASE_URL;
const LEVELS: Niveau[] = ["1AM", "2AM", "3AM", "4AM", "1AS", "2AS", "3AS"];
const STAGE_LEVELS: Record<typeof SCHOOL_STAGE, Niveau[]> = {
  moyen: ["1AM", "2AM", "3AM", "4AM"],
  lycee: ["1AS", "2AS", "3AS"],
};
const LEVEL_LABELS: Record<Niveau, string> = {
  "1AM": "1ère AM", "2AM": "2ème AM", "3AM": "3ème AM", "4AM": "4ème AM",
  "1AS": "1ère AS", "2AS": "2ème AS", "3AS": "3ème AS",
};
const LEVEL_COLORS = ["#6366f1", "#8b5cf6", "#a855f7", "#d946ef"];
const ACADEMIC_YEARS = ["2026-2027", "2025-2026", "2024-2025", "2023-2024", "2022-2023"];
const DEFAULT_YEAR = "2026-2027";

// ─── Animation presets ────────────────────────────────────────────────────────
const pageVariants = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" as const } },
  exit:    { opacity: 0, y: -8, transition: { duration: 0.2 } },
};
const cardAnim = {
  initial: { opacity: 0, y: 20, scale: 0.96 },
  animate: { opacity: 1, y: 0, scale: 1, transition: { type: "spring" as const, stiffness: 260, damping: 22 } },
};
const stagger = { animate: { transition: { staggerChildren: 0.06 } } };

// ─── Colors ───────────────────────────────────────────────────────────────────
const PASS_COLOR   = "#16a34a";
const FAIL_COLOR   = "#ef4444";
const MALE_COLOR   = "#3b82f6";
const FEMALE_COLOR = "#ec4899";
const PRIMARY      = "#2563eb";

// ─── Analytics tabs config ───────────────────────────────────────────────────
const ANALYTICS_TABS = [
  { id: "general",    label: "تحليل عام",         icon: BarChart3    },
  { id: "subjects",   label: "تحليل المواد",       icon: Target       },
  { id: "groups",     label: "مقارنة الأفواج",     icon: Users        },
  { id: "trend",      label: "تطور الفصول",        icon: TrendingUp   },
  { id: "progress",   label: "تحسن وتراجع",        icon: TrendingDown },
  { id: "passed",     label: "الناجحون",           icon: CheckCircle2 },
  { id: "failed",     label: "الراسبون",           icon: XCircle      },
  { id: "gender",     label: "تحليل الجنس",        icon: ArrowUpDown  },
  { id: "repeaters",  label: "المعيدون",           icon: Star         },
  { id: "failedlist", label: "قائمة الراسبين",     icon: Printer      },
  { id: "top",        label: "أوائل التلاميذ",     icon: Trophy       },
] as const;
type AnalyticsTabId = typeof ANALYTICS_TABS[number]["id"];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function avg2(v: number | null) {
  if (v === null) return "—";
  return v.toFixed(2);
}

function gradeLabel(avg: number | null): { label: string; color: string } {
  if (avg == null) return { label: "—", color: "text-muted-foreground" };
  if (avg >= 18) return { label: "ممتاز",   color: "text-amber-500"   };
  if (avg >= 16) return { label: "جيد جداً", color: "text-emerald-600" };
  if (avg >= 14) return { label: "جيد",      color: "text-blue-600"    };
  if (avg >= 10) return { label: "مقبول",    color: "text-violet-600"  };
  return           { label: "راسب",      color: "text-red-500"     };
}

function MiniTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-background/95 border rounded-xl shadow-xl p-3 text-xs">
      {label && <p className="font-bold mb-1">{label}</p>}
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color || p.fill }} className="font-semibold">
          {p.name}: {typeof p.value === "number" ? p.value.toFixed?.(2) ?? p.value : p.value}
        </p>
      ))}
    </div>
  );
}

function InsightCard({
  label,
  value,
  accent,
  icon: Icon,
}: {
  label: string;
  value: string;
  accent: string;
  icon: React.ElementType;
}) {
  return (
    <motion.div whileHover={{ y: -3 }} className="surface-panel p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
          <p className={`mt-2 text-2xl font-black ${accent}`}>{value}</p>
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${accent.includes("blue") ? "bg-blue-500/10 text-blue-600" : accent.includes("emerald") ? "bg-emerald-500/10 text-emerald-600" : accent.includes("red") ? "bg-red-500/10 text-red-600" : "bg-violet-500/10 text-violet-600"}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </motion.div>
  );
}

// ─── Trimestre-filter helpers ─────────────────────────────────────────────────
type TriFilter = "" | "1" | "2" | "1+2" | "3" | "1+2+3";

const TRI_OPTIONS: Array<{ value: TriFilter; label: string }> = [
  { value: "",      label: "كل الفصول"   },
  { value: "1",     label: "الفصل 1"    },
  { value: "2",     label: "الفصل 2"    },
  { value: "1+2",   label: "ف1 + ف2"   },
  { value: "3",     label: "الفصل 3"    },
  { value: "1+2+3", label: "السنة كاملة" },
];

/** Return the relevant average for the given tri selection. */
function getTriAvg(r: StudentResult, tri: TriFilter): number | null {
  if (!tri || tri === "1+2+3") return r.annualAvg;
  if (tri === "1") return r.t1Avg ?? null;
  if (tri === "2") return r.t2Avg ?? null;
  if (tri === "3") return r.t3Avg ?? null;
  if (tri === "1+2") {
    const t1 = r.t1Avg, t2 = r.t2Avg;
    if (t1 == null && t2 == null) return null;
    if (t1 == null) return t2;
    if (t2 == null) return t1;
    return Math.round(((t1 + t2) / 2) * 100) / 100;
  }
  return r.annualAvg;
}

/** Derive pass/fail from a filtered average (or fall back to server value). */
function getTriPassed(r: StudentResult, tri: TriFilter): boolean | null {
  if (!tri || tri === "1+2+3") return r.passed;
  const avg = getTriAvg(r, tri);
  return avg == null ? null : avg >= 10;
}

/**
 * For 4AM, "راسب" → "معيد" (they re-sit the year, not the generic "failed").
 * After BEM: pass → ثانوي, fail → معيد 4AM.
 */
function resultBadgeLabel(passed: boolean | null, niveau: string): string {
  if (passed === null) return "—";
  if (passed) return "ناجح";
  return niveau === "4AM" ? "معيد" : "راسب";
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KPICard({ label, value, sub, gradient, icon: Icon }: {
  label: string; value: React.ReactNode; sub?: string;
  gradient: string; icon: React.ElementType;
}) {
  return (
    <motion.div variants={cardAnim} whileHover={{ y: -3, scale: 1.02 }}>
      <Card className="border-0 overflow-hidden shadow-md rounded-2xl">
        <div className={`bg-gradient-to-br ${gradient} p-4 relative overflow-hidden`}>
          <div className="absolute -top-6 -right-6 w-20 h-20 rounded-full bg-white/10 blur-2xl" />
          <div className="flex items-start justify-between">
            <div>
              <p className="text-white/70 text-xs font-semibold mb-1">{label}</p>
              <p className="text-3xl font-extrabold text-white tabular-nums">{value}</p>
              {sub && <p className="text-white/60 text-xs mt-0.5">{sub}</p>}
            </div>
            <Icon className="w-5 h-5 text-white/40 shrink-0" />
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// ANALYTICS TABS
// ════════════════════════════════════════════════════════════════════════════════

// ─── TAB 1: General ───────────────────────────────────────────────────────────
function TabGeneral({ results }: { results: StudentResult[] }) {
  const withAvg  = results.filter(r => r.annualAvg !== null);
  const passed   = withAvg.filter(r => r.passed === true);
  const failed   = withAvg.filter(r => r.passed === false);
  const passRate = withAvg.length > 0 ? Math.round((passed.length / withAvg.length) * 100) : 0;
  const classAvg = withAvg.length > 0
    ? withAvg.reduce((s, r) => s + (r.annualAvg ?? 0), 0) / withAvg.length : 0;
  const top  = [...withAvg].sort((a, b) => (b.annualAvg ?? 0) - (a.annualAvg ?? 0));
  const best = top[0];

  // ── Grade categories
  const GRADE_CATS = [
    { label: "امتياز",    min: 18,  max: 20, color: "#f59e0b" },
    { label: "تهنئة", min: 16,  max: 18,   color: "#10b981" },
    { label: "تشجيع",      min: 14,  max: 16,   color: "#3b82f6" },
    { label: "لوحة شرف",    min: 10,  max: 14,   color: "#8b5cf6" },
    { label: "راسب",     min: 0,   max: 10,   color: "#ef4444" },
  ];
  const catData = GRADE_CATS.map(c => ({
    name:  c.label,
    value: withAvg.filter(r => (r.annualAvg ?? -1) >= c.min && (r.annualAvg ?? -1) < c.max).length,
    fill:  c.color,
  })).filter(d => d.value > 0);

  // ── Statistical metrics
  const sortedByAvg = [...withAvg].sort((a, b) => (a.annualAvg ?? 0) - (b.annualAvg ?? 0));
  const median = sortedByAvg.length === 0 ? 0 :
    sortedByAvg.length % 2 === 0
      ? ((sortedByAvg[sortedByAvg.length / 2 - 1].annualAvg ?? 0) + (sortedByAvg[sortedByAvg.length / 2].annualAvg ?? 0)) / 2
      : (sortedByAvg[Math.floor(sortedByAvg.length / 2)].annualAvg ?? 0);
  const variance = withAvg.length > 0
    ? withAvg.reduce((s, r) => s + ((r.annualAvg ?? 0) - classAvg) ** 2, 0) / withAvg.length
    : 0;
  const stdDev  = Math.sqrt(variance);
  const below5  = withAvg.filter(r => (r.annualAvg ?? 20) < 5).length;
  const above15 = withAvg.filter(r => (r.annualAvg ?? 0) >= 15).length;

  // ── T1 → T3 scatter data
  const scatterData = withAvg
    .filter(r => r.t1Avg != null && r.t3Avg != null)
    .map(r => ({ x: +(r.t1Avg!).toFixed(2), y: +(r.t3Avg!).toFixed(2), name: r.student.nomPrenom }));

  const BUCKETS = [
    { label: "0–5",   min: 0,  max: 5    },
    { label: "5–7",   min: 5,  max: 7    },
    { label: "7–9",   min: 7,  max: 9    },
    { label: "9–10",  min: 9,  max: 10   },
    { label: "10–12", min: 10, max: 12   },
    { label: "12–15", min: 12, max: 15   },
    { label: "15–18", min: 15, max: 18   },
    { label: "18–20", min: 18, max: 20.1 },
  ];
  const histData = BUCKETS.map(b => ({
    label:   b.label,
    ناجح: passed.filter(r => (r.annualAvg ?? 0) >= b.min && (r.annualAvg ?? 0) < b.max).length,
    راسب: failed.filter(r => (r.annualAvg ?? 0) >= b.min && (r.annualAvg ?? 0) < b.max).length,
  }));

  const freqData = Array.from({ length: 20 }, (_, i) => ({
    range: `${i}–${i + 1}`,
    count: withAvg.filter(r => Math.floor(r.annualAvg ?? -1) === i).length,
  }));

  const donutData = [
    { name: "ناجح", value: passed.length, color: PASS_COLOR },
    { name: "راسب", value: failed.length, color: FAIL_COLOR },
  ];

  return (
    <motion.div variants={stagger} initial="initial" animate="animate" className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KPICard label="إجمالي النتائج" value={<CountUp to={withAvg.length} />}      icon={Users}       gradient="from-blue-500 to-indigo-600"    />
        <KPICard label="ناجح"           value={<CountUp to={passed.length} />}        icon={TrendingUp}  gradient="from-emerald-500 to-green-600"  />
        <KPICard label="راسب"           value={<CountUp to={failed.length} />}        icon={TrendingDown} gradient="from-red-500 to-rose-600"      />
        <KPICard label="نسبة النجاح"   value={`${passRate}%`}                         icon={BarChart3}   gradient="from-violet-500 to-purple-600"  />
        <KPICard label="المعدل العام"  value={classAvg.toFixed(2)} sub="/20"          icon={Target}      gradient="from-cyan-500 to-blue-600"      />
        <KPICard label="أعلى معدل"    value={(best?.annualAvg ?? 0).toFixed(2)} sub="/20" icon={Trophy} gradient="from-amber-500 to-orange-500"  />
      </div>

      {/* Histogram + Donut */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <motion.div variants={cardAnim} className="md:col-span-2">
          <Card className="rounded-2xl border bg-card shadow-sm">
            <CardHeader className="pb-1"><CardTitle className="text-xs font-bold text-muted-foreground">توزيع المعدلات السنوية</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={histData} barSize={18} margin={{ left: -15 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.08} />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 9 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip content={<MiniTooltip />} cursor={{ fill: "transparent" }} />
                  <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="ناجح" fill={PASS_COLOR} radius={[4, 4, 0, 0]} stackId="a" />
                  <Bar dataKey="راسب" fill={FAIL_COLOR}  radius={[4, 4, 0, 0]} stackId="a" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={cardAnim}>
          <Card className="rounded-2xl border bg-card shadow-sm h-full">
            <CardHeader className="pb-1"><CardTitle className="text-xs font-bold text-muted-foreground">نسبة النجاح</CardTitle></CardHeader>
            <CardContent className="flex flex-col items-center justify-center">
              <div className="relative">
                <ResponsiveContainer width={150} height={140}>
                  <RadialBarChart cx="50%" cy="55%" innerRadius={42} outerRadius={62}
                    barSize={12} data={[{ value: passRate, fill: passRate >= 50 ? PASS_COLOR : FAIL_COLOR }]}
                    startAngle={90} endAngle={-270}>
                    <RadialBar background={{ fill: "#e5e7eb" }} dataKey="value" cornerRadius={8} />
                  </RadialBarChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pb-2">
                  <span className={`text-3xl font-extrabold ${passRate >= 50 ? "text-emerald-500" : "text-red-500"}`}>{passRate}%</span>
                  <span className="text-[10px] text-muted-foreground">ناجح</span>
                </div>
              </div>
              <div className="flex gap-4 text-xs mt-1">
                <span className="text-emerald-600 font-bold">{passed.length} ناجح</span>
                <span className="text-red-500 font-bold">{failed.length} راسب</span>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Frequency curve */}
      <motion.div variants={cardAnim}>
        <Card className="rounded-2xl border bg-card shadow-sm">
          <CardHeader className="pb-1"><CardTitle className="text-xs font-bold text-muted-foreground">منحنى توزيع التكرار</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={freqData} margin={{ left: -15, right: 5 }}>
                <defs>
                  <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={PRIMARY} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={PRIMARY} stopOpacity={0}   />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" opacity={0.08} />
                <XAxis dataKey="range" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 9 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<MiniTooltip />} cursor={{ fill: "transparent" }} />
                <Area type="monotone" dataKey="count" name="عدد التلاميذ"
                  stroke={PRIMARY} strokeWidth={2} fill="url(#areaGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </motion.div>

      {/* Grade categories breakdown */}
      {catData.length > 0 && (
        <motion.div variants={cardAnim}>
          <Card className="rounded-2xl border bg-card shadow-sm">
            <CardHeader className="pb-1"><CardTitle className="text-xs font-bold text-muted-foreground">توزيع التقديرات</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={catData} cx="50%" cy="50%" innerRadius={46} outerRadius={72}
                      paddingAngle={2} dataKey="value">
                      {catData.map((c, i) => <Cell key={i} fill={c.fill} />)}
                    </Pie>
                    <Tooltip content={<MiniTooltip />} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2.5">
                  {GRADE_CATS.map(c => {
                    const count = withAvg.filter(r => (r.annualAvg ?? -1) >= c.min && (r.annualAvg ?? -1) < c.max).length;
                    const pct = withAvg.length > 0 ? (count / withAvg.length) * 100 : 0;
                    return (
                      <div key={c.label} className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: c.color }} />
                        <span className="text-xs font-semibold w-14 shrink-0">{c.label}</span>
                        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                          <motion.div className="h-full rounded-full"
                            style={{ background: c.color }}
                            initial={{ width: 0 }} animate={{ width: `${pct}%` }}
                            transition={{ duration: 0.7 }} />
                        </div>
                        <span className="text-[10px] text-muted-foreground font-mono w-16 text-left shrink-0">
                          {count} ({pct.toFixed(0)}%)
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Statistical insight row */}
      {withAvg.length > 1 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KPICard label="الوسيط"             value={median.toFixed(2)}    sub="/20" icon={BarChart3}   gradient="from-sky-500 to-cyan-600"    />
          <KPICard label="الانحراف المعياري" value={stdDev.toFixed(2)}    sub="σ"   icon={TrendingUp}  gradient="from-slate-500 to-slate-700" />
          <KPICard label="دون 5"              value={<CountUp to={below5} />}        icon={XCircle}    gradient="from-rose-600 to-red-700"    />
          <KPICard label="15 فأكثر"           value={<CountUp to={above15} />}       icon={Star}       gradient="from-amber-500 to-yellow-600" />
        </div>
      )}

      {/* Spotlight top 3 + worst */}
      <motion.div variants={cardAnim}>
        <Card className="rounded-2xl border bg-card shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold text-muted-foreground flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-500" /> أبرز التلاميذ
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {top.slice(0, 3).map((r, i) => {
                const gl = gradeLabel(r.annualAvg);
                return (
                  <div key={i} className="flex items-center gap-3 bg-muted/40 rounded-xl p-3">
                    <span className="text-2xl">{["🥇","🥈","🥉"][i]}</span>
                    <div className="min-w-0">
                      <p className="font-bold text-sm truncate">{r.student.nomPrenom}</p>
                      <p className={`text-xs font-semibold ${gl.color}`}>{avg2(r.annualAvg)}/20 — {gl.label}</p>
                      <p className="text-xs text-muted-foreground">{LEVEL_LABELS[r.student.niveau as Niveau]} — {r.student.classe}</p>
                    </div>
                  </div>
                );
              })}
              {(() => {
                const worst = [...withAvg].sort((a, b) => (a.annualAvg ?? 99) - (b.annualAvg ?? 99))[0];
                return worst ? (
                  <div className="flex items-center gap-3 bg-red-50/30 dark:bg-red-950/20 rounded-xl p-3 border border-red-200/30">
                    <span className="text-2xl">⚠️</span>
                    <div className="min-w-0">
                      <p className="font-bold text-sm truncate text-red-600">{worst.student.nomPrenom}</p>
                      <p className="text-xs text-red-500">أدنى معدل: {avg2(worst.annualAvg)}/20</p>
                    </div>
                  </div>
                ) : null;
              })()}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* T1 → T3 trajectory scatter */}
      {scatterData.length >= 4 && (
        <motion.div variants={cardAnim}>
          <Card className="rounded-2xl border bg-card shadow-sm">
            <CardHeader className="pb-1">
              <CardTitle className="text-xs font-bold text-muted-foreground">مسار التلاميذ: الفصل 1 مقابل الفصل 3</CardTitle>
              <p className="text-[10px] text-muted-foreground mt-0.5">كل نقطة = تلميذ — الخطان الأصفران عند 10 — المنطقة العلوية اليمنى: نجح في الفصلين</p>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <ScatterChart margin={{ left: -10, right: 10, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.07} />
                  <XAxis type="number" dataKey="x" name="ف1" domain={[0, 20]}
                    tick={{ fontSize: 9 }} axisLine={false} tickLine={false}
                    label={{ value: "ف1", position: "insideBottomRight", offset: -2, fontSize: 10 }} />
                  <YAxis type="number" dataKey="y" name="ف3" domain={[0, 20]}
                    tick={{ fontSize: 9 }} axisLine={false} tickLine={false}
                    label={{ value: "ف3", angle: -90, position: "insideLeft", fontSize: 10 }} />
                  <ReferenceLine x={10} stroke="#f59e0b" strokeDasharray="4 3" strokeWidth={1.2} />
                  <ReferenceLine y={10} stroke="#f59e0b" strokeDasharray="4 3" strokeWidth={1.2} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0]?.payload as { x: number; y: number; name: string };
                      return (
                        <div className="bg-background/95 border rounded-xl shadow-xl p-2.5 text-xs">
                          <p className="font-bold mb-1">{d.name}</p>
                          <p className="text-muted-foreground">ف1: <span className={`font-bold ${d.x >= 10 ? "text-emerald-600" : "text-red-500"}`}>{d.x}</span></p>
                          <p className="text-muted-foreground">ف3: <span className={`font-bold ${d.y >= 10 ? "text-emerald-600" : "text-red-500"}`}>{d.y}</span></p>
                        </div>
                      );
                    }}
                  />
                  <Scatter data={scatterData} fill={PRIMARY} opacity={0.6} />
                </ScatterChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </motion.div>
  );
}

// ─── TAB 2: Subjects ──────────────────────────────────────────────────────────
function TabSubjects({ results }: { results: StudentResult[] }) {
  const withAvg = results.filter(r => r.annualAvg !== null);

  const subjects = Array.from(new Map(withAvg.flatMap(result =>
    getSubjectsWithCorrectCoefs(result.student.niveau as Niveau, result.student.filiere ?? undefined)
      .map(subject => [subject.key, subject] as const),
  )).values());

  const subjectStats = subjects.map(s => {
    // Collect each student's annual average for this subject
    // (average of their T1+T2+T3 scores for this subject)
    const studentSubjectAvgs: number[] = [];
    withAvg.forEach(r => {
      const triScores: number[] = [];
      for (const t of [1, 2, 3] as const) {
        const v = (r.scores as any)?.[t]?.[s.key];
        if (typeof v === "number" && v >= 0) triScores.push(v);
      }
      if (triScores.length > 0) {
        const subAvg = triScores.reduce((a, b) => a + b, 0) / triScores.length;
        studentSubjectAvgs.push(subAvg);
      }
    });
    const avg = studentSubjectAvgs.length
      ? studentSubjectAvgs.reduce((a, b) => a + b, 0) / studentSubjectAvgs.length
      : null;
    const pass = studentSubjectAvgs.filter(v => v >= 10).length;
    const total = studentSubjectAvgs.length;
    return {
      ...s,
      avg,
      passCount: pass,
      total,
      passRate: total > 0 ? (pass / total) * 100 : 0,
    };
  }).filter(s => s.total > 0);

  const top = [...withAvg].sort((a, b) => (b.annualAvg ?? 0) - (a.annualAvg ?? 0))[0];
  const radarData = subjectStats.map(s => {
    const topTriScores: number[] = [];
    for (const t of [1, 2, 3] as const) {
      const v = (top?.scores as any)?.[t]?.[s.key];
      if (typeof v === "number" && v >= 0) topTriScores.push(v);
    }
    const topScore = topTriScores.length ? topTriScores.reduce((a, b) => a + b, 0) / topTriScores.length : 0;
    return { subject: s.arLabel, "أعلى تلميذ": +topScore.toFixed(2), "معدل القسم": +(s.avg ?? 0).toFixed(2) };
  });

  // Gender breakdown per subject
  const genderSubjectData = subjectStats.map(s => {
    const maleScores: number[] = [], femaleScores: number[] = [];
    withAvg.forEach(r => {
      const triScores: number[] = [];
      for (const t of [1, 2, 3] as const) {
        const v = (r.scores as any)?.[t]?.[s.key];
        if (typeof v === "number" && v >= 0) triScores.push(v);
      }
      if (triScores.length === 0) return;
      const subAvg = triScores.reduce((a, b) => a + b, 0) / triScores.length;
      if (r.student.sexe === "M") maleScores.push(subAvg);
      else femaleScores.push(subAvg);
    });
    const maleAvg   = maleScores.length   ? maleScores.reduce((a, b) => a + b, 0) / maleScores.length   : null;
    const femaleAvg = femaleScores.length ? femaleScores.reduce((a, b) => a + b, 0) / femaleScores.length : null;
    const shortLabel = s.arLabel.split(" ").slice(-1)[0] ?? s.arLabel;
    return { shortLabel, ذكور: maleAvg !== null ? +maleAvg.toFixed(2) : 0, إناث: femaleAvg !== null ? +femaleAvg.toFixed(2) : 0 };
  });

  // Trimester evolution per subject (avg across students for each trimester)
  const triSubjectData = subjectStats.slice(0, 8).map(s => {
    const scores: Record<number, number[]> = { 1: [], 2: [], 3: [] };
    withAvg.forEach(r => {
      for (const t of [1, 2, 3] as const) {
        const v = (r.scores as any)?.[t]?.[s.key];
        if (typeof v === "number" && v >= 0) scores[t].push(v);
      }
    });
    const shortLabel = s.arLabel.split(" ").slice(-1)[0] ?? s.arLabel;
    return {
      shortLabel,
      ف1: scores[1].length ? +(scores[1].reduce((a, b) => a + b, 0) / scores[1].length).toFixed(2) : null,
      ف2: scores[2].length ? +(scores[2].reduce((a, b) => a + b, 0) / scores[2].length).toFixed(2) : null,
      ف3: scores[3].length ? +(scores[3].reduce((a, b) => a + b, 0) / scores[3].length).toFixed(2) : null,
    };
  });

  return (
    <motion.div variants={stagger} initial="initial" animate="animate" className="space-y-5">
      {/* Row 1: avg + pass rate */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <motion.div variants={cardAnim}>
          <Card className="rounded-2xl border bg-card shadow-sm">
            <CardHeader className="pb-1"><CardTitle className="text-xs font-bold text-muted-foreground">متوسط النقاط حسب المادة</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={Math.max(220, subjectStats.length * 28)}>
                <BarChart data={[...subjectStats].sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0))} margin={{ left: -10, right: 5, bottom: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.08} />
                  <XAxis dataKey="arLabel" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} angle={-40} textAnchor="end" interval={0} />
                  <YAxis type="number" domain={[0, 20]} tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<MiniTooltip />} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
                  <Bar dataKey="avg" name="المتوسط" radius={[4, 4, 0, 0]} fill={PRIMARY} barSize={22} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={cardAnim}>
          <Card className="rounded-2xl border bg-card shadow-sm">
            <CardHeader className="pb-1"><CardTitle className="text-xs font-bold text-muted-foreground">نسبة النجاح حسب المادة</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={Math.max(220, subjectStats.length * 28)}>
                <BarChart data={[...subjectStats].sort((a, b) => b.passRate - a.passRate)} margin={{ left: -10, right: 5, bottom: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.08} />
                  <XAxis dataKey="arLabel" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} angle={-40} textAnchor="end" interval={0} />
                  <YAxis type="number" domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<MiniTooltip />} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
                  <Bar dataKey="passRate" name="نسبة النجاح %" radius={[4, 4, 0, 0]} fill={PASS_COLOR} barSize={22} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Row 2: gender breakdown per subject */}
      {genderSubjectData.length > 0 && (
        <motion.div variants={cardAnim}>
          <Card className="rounded-2xl border bg-card shadow-sm">
            <CardHeader className="pb-1"><CardTitle className="text-xs font-bold text-muted-foreground">متوسط المادة حسب الجنس</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={Math.max(200, genderSubjectData.length * 22)}>
                <BarChart data={genderSubjectData} margin={{ left: -10, right: 5, bottom: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.08} />
                  <XAxis dataKey="shortLabel" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} angle={-35} textAnchor="end" interval={0} />
                  <YAxis domain={[0, 20]} tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<MiniTooltip />} />
                  <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="ذكور" fill={MALE_COLOR}   radius={[3, 3, 0, 0]} barSize={12} />
                  <Bar dataKey="إناث" fill={FEMALE_COLOR} radius={[3, 3, 0, 0]} barSize={12} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Row 3: Trimester evolution per subject */}
      {triSubjectData.length > 0 && (
        <motion.div variants={cardAnim}>
          <Card className="rounded-2xl border bg-card shadow-sm">
            <CardHeader className="pb-1"><CardTitle className="text-xs font-bold text-muted-foreground">تطور نقاط المواد عبر الفصول الثلاثة</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={Math.max(200, triSubjectData.length * 22)}>
                <BarChart data={triSubjectData} margin={{ left: -10, right: 5, bottom: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.08} />
                  <XAxis dataKey="shortLabel" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} angle={-35} textAnchor="end" interval={0} />
                  <YAxis domain={[0, 20]} tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<MiniTooltip />} />
                  <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="ف1" fill="#6366f1" radius={[3, 3, 0, 0]} barSize={10} />
                  <Bar dataKey="ف2" fill="#8b5cf6" radius={[3, 3, 0, 0]} barSize={10} />
                  <Bar dataKey="ف3" fill="#a855f7" radius={[3, 3, 0, 0]} barSize={10} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Radar: top student vs class avg */}
      {top && radarData.length > 0 && (
        <motion.div variants={cardAnim}>
          <Card className="rounded-2xl border bg-card shadow-sm">
            <CardHeader className="pb-1"><CardTitle className="text-xs font-bold text-muted-foreground">مقارنة أعلى تلميذ مع معدل القسم</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <RadarChart data={radarData} cx="50%" cy="50%" outerRadius={100}>
                  <PolarGrid />
                  <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10 }} />
                  <PolarRadiusAxis domain={[0, 20]} tick={{ fontSize: 8 }} />
                  <Radar name="أعلى تلميذ" dataKey="أعلى تلميذ" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.25} />
                  <Radar name="معدل القسم" dataKey="معدل القسم" stroke={PRIMARY} fill={PRIMARY} fillOpacity={0.15} />
                  <Tooltip content={<MiniTooltip />} cursor={{ fill: "transparent" }} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                </RadarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Subject performance table */}
      <motion.div variants={cardAnim}>
        <Card className="rounded-2xl border bg-card shadow-sm">
          <CardHeader className="pb-1"><CardTitle className="text-xs font-bold text-muted-foreground">جدول أداء المواد</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-right pb-2 text-xs text-muted-foreground font-semibold pr-2">المادة</th>
                    <th className="text-center pb-2 text-xs text-muted-foreground font-semibold">م</th>
                    <th className="text-center pb-2 text-xs text-muted-foreground font-semibold">المتوسط</th>
                    <th className="text-center pb-2 text-xs text-muted-foreground font-semibold">الناجحون</th>
                    <th className="text-center pb-2 text-xs text-muted-foreground font-semibold min-w-[120px]">نسبة النجاح</th>
                  </tr>
                </thead>
                <tbody>
                  {subjectStats.map((s, i) => (
                    <tr key={i} className={`border-b ${i % 2 === 0 ? "" : "bg-muted/20"}`}>
                      <td className="py-2 pr-2 font-medium">{s.arLabel}</td>
                      <td className="py-2 text-center text-muted-foreground font-mono font-semibold">{s.coef}</td>
                      <td className={`py-2 text-center font-mono font-bold ${(s.avg ?? 0) >= 10 ? "text-emerald-600" : "text-red-500"}`}>{avg2(s.avg)}</td>
                      <td className="py-2 text-center text-xs">{s.passCount}/{s.total}</td>
                      <td className="py-2 text-center">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                            <motion.div className="h-full rounded-full bg-emerald-500"
                              initial={{ width: 0 }} animate={{ width: `${s.passRate}%` }}
                              transition={{ duration: 0.8, delay: i * 0.05 }} />
                          </div>
                          <span className="text-xs font-semibold w-10 text-right">{s.passRate.toFixed(0)}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}

// ─── TAB 3: Groups ────────────────────────────────────────────────────────────
function TabGroups({ results }: { results: StudentResult[] }) {
  const withAvg = results.filter(r => r.annualAvg !== null);
  // Group by niveau+classe composite to avoid merging same-named classes across levels
  const grouped = withAvg.reduce<Record<string, StudentResult[]>>((acc, r) => {
    const c = `${r.student.niveau}__${r.student.classe || "غير محدد"}`;
    if (!acc[c]) acc[c] = [];
    acc[c].push(r);
    return acc;
  }, {});

  const stats = Object.entries(grouped).map(([key, rs]) => {
    const [niv, classe] = key.split("__") as [string, string];
    const pass  = rs.filter(r => r.passed === true).length;
    const avgs  = rs.map(r => r.annualAvg).filter((a): a is number => a != null);
    const avg   = avgs.length ? avgs.reduce((a, b) => a + b, 0) / avgs.length : 0;
    const boys  = rs.filter(r => r.student.sexe === "M");
    const girls = rs.filter(r => r.student.sexe === "F");
    const boyPass  = boys.filter(r => r.passed === true).length;
    const girlPass = girls.filter(r => r.passed === true).length;
    const label = `${LEVEL_LABELS[niv as Niveau] ?? niv} — ${classe}`;
    return {
      classe, niv, label, total: rs.length, pass, fail: rs.length - pass,
      passRate: rs.length > 0 ? (pass / rs.length) * 100 : 0,
      avg: +avg.toFixed(2),
      boys: boys.length, girls: girls.length, boyPass, girlPass,
    };
  }).sort((a, b) => b.passRate - a.passRate);

  const best  = stats[0];
  const worst = stats.at(-1);

  return (
    <motion.div variants={stagger} initial="initial" animate="animate" className="space-y-5">
      {stats.length > 0 && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {best && (
              <motion.div variants={cardAnim}>
                <Card className="rounded-2xl border bg-emerald-50/30 dark:bg-emerald-950/20 border-emerald-200/50 shadow-sm">
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-emerald-500 flex items-center justify-center shrink-0">
                      <Trophy className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">أفضل قسم</p>
                      <p className="font-bold text-lg">{best.label}</p>
                      <p className="text-emerald-600 font-semibold text-sm">{best.passRate.toFixed(1)}% نجاح — معدل {best.avg}/20</p>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}
            {worst && worst !== best && (
              <motion.div variants={cardAnim}>
                <Card className="rounded-2xl border bg-red-50/30 dark:bg-red-950/20 border-red-200/50 shadow-sm">
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-red-500 flex items-center justify-center shrink-0">
                      <TrendingDown className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">أضعف قسم</p>
                      <p className="font-bold text-lg">{worst.label}</p>
                      <p className="text-red-500 font-semibold text-sm">{worst.passRate.toFixed(1)}% نجاح — معدل {worst.avg}/20</p>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </div>

          <motion.div variants={cardAnim}>
            <Card className="rounded-2xl border bg-card shadow-sm">
              <CardHeader className="pb-1"><CardTitle className="text-xs font-bold text-muted-foreground">مقارنة الأقسام</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={stats} margin={{ left: -10 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.08} />
                    <XAxis dataKey="classe" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} interval={0} />
                    <YAxis tick={{ fontSize: 9 }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip content={<MiniTooltip />} cursor={{ fill: "transparent" }} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="pass" name="ناجح" radius={[4, 4, 0, 0]} fill={PASS_COLOR} stackId="a" />
                    <Bar dataKey="fail" name="راسب" radius={[4, 4, 0, 0]} fill={FAIL_COLOR}  stackId="a" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </motion.div>

          {/* Average per class */}
          <motion.div variants={cardAnim}>
            <Card className="rounded-2xl border bg-card shadow-sm">
              <CardHeader className="pb-1"><CardTitle className="text-xs font-bold text-muted-foreground">متوسط المعدل حسب القسم</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={[...stats].sort((a, b) => b.avg - a.avg)} margin={{ left: -10 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.08} />
                    <XAxis dataKey="classe" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} interval={0} />
                    <YAxis domain={[0, 20]} tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
                    <ReferenceLine y={10} stroke="#f59e0b" strokeDasharray="4 3" strokeWidth={1.5}
                      label={{ value: "10", position: "insideTopRight", fontSize: 9, fill: "#f59e0b" }} />
                    <Tooltip content={<MiniTooltip />} cursor={{ fill: "transparent" }} />
                    <Bar dataKey="avg" name="المعدل /20" radius={[6, 6, 0, 0]}>
                      {[...stats].sort((a, b) => b.avg - a.avg).map((g, i) => (
                        <Cell key={i} fill={g.avg >= 10 ? PASS_COLOR : FAIL_COLOR}
                          opacity={Math.max(0.55, 1 - i * 0.05)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div variants={cardAnim}>
            <Card className="rounded-2xl border bg-card shadow-sm">
              <CardHeader className="pb-1"><CardTitle className="text-xs font-bold text-muted-foreground">ترتيب الأقسام حسب نسبة النجاح</CardTitle></CardHeader>
              <CardContent>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      {["الرتبة","القسم","الإجمالي","♂ ذكور","ناجح ♂","♀ إناث","ناجح ♀","ناجح","راسب","المعدل","نسبة النجاح"].map((h, i) => (
                        <th key={i} className="pb-2 text-center text-xs text-muted-foreground font-semibold first:text-right whitespace-nowrap px-2">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {stats.map((g, i) => (
                      <tr key={`${g.niv}__${g.classe}`} className={`border-b ${i % 2 === 0 ? "" : "bg-muted/20"}`}>
                        <td className="py-2 font-bold text-muted-foreground">{i + 1}</td>
                        <td className="py-2 text-center font-semibold whitespace-nowrap">{g.label}</td>
                        <td className="py-2 text-center">{g.total}</td>
                        <td className="py-2 text-center text-blue-500 font-semibold">{g.boys}</td>
                        <td className="py-2 text-center text-blue-400 text-xs">{g.boyPass}</td>
                        <td className="py-2 text-center text-pink-500 font-semibold">{g.girls}</td>
                        <td className="py-2 text-center text-pink-400 text-xs">{g.girlPass}</td>
                        <td className="py-2 text-center text-emerald-600 font-semibold">{g.pass}</td>
                        <td className="py-2 text-center text-red-500 font-semibold">{g.fail}</td>
                        <td className="py-2 text-center font-mono font-bold">{g.avg}</td>
                        <td className="py-2 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${g.passRate >= 75 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : g.passRate >= 50 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"}`}>
                            {g.passRate.toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </motion.div>
        </>
      )}
    </motion.div>
  );
}

// ─── TAB 4: Trimester Trend ───────────────────────────────────────────────────
function TabTrend({ results }: { results: StudentResult[] }) {
  const withAvg = results.filter(r => r.annualAvg !== null);

  const t1s = withAvg.map(r => r.t1Avg).filter((v): v is number => v != null);
  const t2s = withAvg.map(r => r.t2Avg).filter((v): v is number => v != null);
  const t3s = withAvg.map(r => r.t3Avg).filter((v): v is number => v != null);
  const avg = (arr: number[]) => arr.length ? +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2) : null;

  const trendData = [
    { name: "الفصل 1", avg: avg(t1s) },
    { name: "الفصل 2", avg: avg(t2s) },
    { name: "الفصل 3", avg: avg(t3s) },
  ].filter(d => d.avg !== null);

  // Pass rates per trimester
  const passPerTri = [
    { name: "الفصل 1", rate: t1s.length ? +((t1s.filter(v => v >= 10).length / t1s.length) * 100).toFixed(1) : null },
    { name: "الفصل 2", rate: t2s.length ? +((t2s.filter(v => v >= 10).length / t2s.length) * 100).toFixed(1) : null },
    { name: "الفصل 3", rate: t3s.length ? +((t3s.filter(v => v >= 10).length / t3s.length) * 100).toFixed(1) : null },
  ].filter(d => d.rate !== null);

  // Level breakdown
  const levelData = LEVELS.map((lvl, i) => {
    const lvlAll  = withAvg.filter(r => r.student.niveau === lvl);
    const lvlPass = lvlAll.filter(r => r.passed === true);
    return {
      name: LEVEL_LABELS[lvl],
      ناجح: lvlPass.length,
      راسب: lvlAll.length - lvlPass.length,
      rate: lvlAll.length > 0 ? Math.round((lvlPass.length / lvlAll.length) * 100) : 0,
      fill: LEVEL_COLORS[i],
      total: lvlAll.length,
    };
  }).filter(d => d.total > 0);

  return (
    <motion.div variants={stagger} initial="initial" animate="animate" className="space-y-5">
      {trendData.length >= 2 && (
        <motion.div variants={cardAnim}>
          <Card className="rounded-2xl border bg-card shadow-sm">
            <CardHeader className="pb-1"><CardTitle className="text-xs font-bold text-muted-foreground">تطور المعدل العام عبر الفصول</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={trendData} margin={{ left: -20, right: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.08} />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 20]} tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
                  <ReferenceLine y={10} stroke="#f59e0b" strokeDasharray="4 3" strokeWidth={1.5} />
                  <Tooltip content={<MiniTooltip />} cursor={{ fill: "transparent" }} />
                  <Line type="monotone" dataKey="avg" name="المعدل" stroke="#06b6d4"
                    strokeWidth={2.5} dot={{ fill: "#06b6d4", r: 5 }} activeDot={{ r: 7 }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {passPerTri.length >= 2 && (
        <motion.div variants={cardAnim}>
          <Card className="rounded-2xl border bg-card shadow-sm">
            <CardHeader className="pb-1"><CardTitle className="text-xs font-bold text-muted-foreground">نسبة النجاح حسب الفصل</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={passPerTri} margin={{ left: -10 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.08} />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<MiniTooltip />} cursor={{ fill: "transparent" }} />
                  <Bar dataKey="rate" name="نسبة النجاح %" radius={[8, 8, 0, 0]} fill={PRIMARY} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {levelData.length > 0 && (
        <motion.div variants={cardAnim}>
          <Card className="rounded-2xl border bg-card shadow-sm">
            <CardHeader className="pb-1"><CardTitle className="text-xs font-bold text-muted-foreground">نسبة النجاح التفصيلية حسب المستوى</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {levelData.map((l, i) => (
                <div key={l.name} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold" style={{ color: l.fill }}>{l.name}</span>
                    <span className="flex gap-3">
                      <span className="text-muted-foreground">{l.total} تلميذ</span>
                      <span className={`font-bold ${l.rate >= 75 ? "text-emerald-600" : l.rate >= 50 ? "text-amber-600" : "text-red-500"}`}>{l.rate}%</span>
                    </span>
                  </div>
                  <div className="h-2.5 rounded-full bg-muted overflow-hidden flex gap-0.5">
                    <motion.div className="h-full bg-emerald-500 rounded-s-full"
                      initial={{ width: 0 }} animate={{ width: `${(l.ناجح / l.total) * 100}%` }}
                      transition={{ duration: 0.8, delay: i * 0.1 }} />
                    <motion.div className="h-full bg-red-400 rounded-e-full"
                      initial={{ width: 0 }} animate={{ width: `${(l.راسب / l.total) * 100}%` }}
                      transition={{ duration: 0.8, delay: i * 0.1 + 0.05 }} />
                  </div>
                  <div className="flex gap-3 text-[10px] text-muted-foreground">
                    <span className="text-emerald-600">{l.ناجح} ناجح</span>
                    <span className="text-red-500">{l.راسب} راسب</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </motion.div>
      )}
    </motion.div>
  );
}

// ─── TAB 5: Progress (improvement / regression) ───────────────────────────────
function TabProgress({ results }: { results: StudentResult[] }) {
  // Need at least 2 trimester averages per student
  const withMulti = results.filter(r =>
    [r.t1Avg, r.t2Avg, r.t3Avg].filter(v => v != null).length >= 2
  );

  // Per-student trend: delta = last available tri avg − first available tri avg
  const studentTrends = withMulti.map(r => {
    const vals = ([r.t1Avg, r.t2Avg, r.t3Avg] as (number | null)[])
      .map((v, i) => v != null ? { tri: i + 1, v } : null)
      .filter((x): x is { tri: number; v: number } => x !== null);
    const delta = +(vals[vals.length - 1]!.v - vals[0]!.v).toFixed(2);
    const trend: "up" | "stable" | "down" =
      delta >= 0.01 ? "up" : delta <= -0.01 ? "down" : "stable";
    return { ...r, delta, trend };
  });

  const improved = studentTrends.filter(s => s.trend === "up");
  const stable   = studentTrends.filter(s => s.trend === "stable");
  const declined = studentTrends.filter(s => s.trend === "down");
  const total    = studentTrends.length;
  const pct = (n: number) => total ? Math.round((n / total) * 100) : 0;

  const trendPie = [
    { name: "تحسّن", value: improved.length, fill: "#16a34a" },
    { name: "مستقر",  value: stable.length,   fill: "#f59e0b" },
    { name: "تراجع",  value: declined.length,  fill: "#ef4444" },
  ].filter(d => d.value > 0);

  // Per-subject trend: class average per trimester
  const subjects = Array.from(new Map(withMulti.flatMap(result =>
    getSubjectsWithCorrectCoefs(result.student.niveau as Niveau, result.student.filiere ?? undefined)
      .map(subject => [subject.key, subject] as const),
  )).values());
  const subjectTrends = subjects.map(s => {
    const byTri: Record<1 | 2 | 3, number[]> = { 1: [], 2: [], 3: [] };
    withMulti.forEach(r => {
      for (const t of [1, 2, 3] as const) {
        const v = (r.scores as any)?.[t]?.[s.key];
        if (typeof v === "number" && v >= 0) byTri[t].push(v);
      }
    });
    const avg = (arr: number[]) =>
      arr.length ? +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2) : null;
    const t1 = avg(byTri[1]); const t2 = avg(byTri[2]); const t3 = avg(byTri[3]);
    const vals = [t1, t2, t3].filter((v): v is number => v != null);
    const delta = vals.length >= 2 ? +(vals[vals.length - 1]! - vals[0]!).toFixed(2) : null;
    return { ...s, t1, t2, t3, delta };
  }).filter(s => [s.t1, s.t2, s.t3].some(v => v != null));

  if (total === 0) return (
    <div className="flex flex-col items-center py-16 gap-3 text-muted-foreground">
      <TrendingUp className="w-10 h-10 opacity-20" />
      <p className="text-sm">لا توجد بيانات كافية — يلزم وجود فصلين على الأقل لكل تلميذ</p>
    </div>
  );

  return (
    <motion.div variants={stagger} initial="initial" animate="animate" className="space-y-5">

      {/* KPI cards */}
      <motion.div variants={cardAnim} className="grid grid-cols-3 gap-3">
        {[
          { label: "تحسّن", count: improved.length, color: "emerald", Icon: TrendingUp,   dir: "↑" },
          { label: "مستقر",  count: stable.length,   color: "amber",   Icon: ArrowUpDown, dir: "→" },
          { label: "تراجع",  count: declined.length,  color: "red",     Icon: TrendingDown, dir: "↓" },
        ].map(({ label, count, color, Icon, dir }) => (
          <Card key={label} className="rounded-2xl border bg-card shadow-sm">
            <CardContent className="pt-4 pb-3 text-center">
              <Icon className={`w-5 h-5 mx-auto mb-1 text-${color}-500`} />
              <p className={`text-2xl font-bold text-${color}-600`}>{pct(count)}%</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{label} {dir} · {count} تلميذ</p>
            </CardContent>
          </Card>
        ))}
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Donut */}
        <motion.div variants={cardAnim}>
          <Card className="rounded-2xl border bg-card shadow-sm">
            <CardHeader className="pb-1"><CardTitle className="text-xs font-bold text-muted-foreground">توزيع اتجاه التلاميذ</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={trendPie} cx="50%" cy="50%" innerRadius={52} outerRadius={78}
                    paddingAngle={3} dataKey="value" label={({ name, value }) => `${name} (${value})`}
                    labelLine={false} fontSize={10}>
                    {trendPie.map((e, i) => <Cell key={i} fill={e.fill} />)}
                  </Pie>
                  <Tooltip content={<MiniTooltip />} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </motion.div>

        {/* Top/worst 3 */}
        <motion.div variants={cardAnim}>
          <Card className="rounded-2xl border bg-card shadow-sm h-full">
            <CardHeader className="pb-1"><CardTitle className="text-xs font-bold text-muted-foreground">أعلى تحسن / أكبر تراجع</CardTitle></CardHeader>
            <CardContent className="space-y-1.5">
              <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wide mb-1">أعلى 3 تحسناً</p>
              {[...improved].sort((a, b) => b.delta - a.delta).slice(0, 3).map((r, i) => (
                <div key={i} className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium truncate">{r.student.nomPrenom}</span>
                  <span className="text-xs font-bold text-emerald-600 shrink-0">+{r.delta.toFixed(2)}</span>
                </div>
              ))}
              {improved.length === 0 && <p className="text-xs text-muted-foreground">—</p>}
              <div className="border-t my-2" />
              <p className="text-[10px] font-bold text-red-500 uppercase tracking-wide mb-1">أكبر 3 تراجعاً</p>
              {[...declined].sort((a, b) => a.delta - b.delta).slice(0, 3).map((r, i) => (
                <div key={i} className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium truncate">{r.student.nomPrenom}</span>
                  <span className="text-xs font-bold text-red-500 shrink-0">{r.delta.toFixed(2)}</span>
                </div>
              ))}
              {declined.length === 0 && <p className="text-xs text-muted-foreground">—</p>}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Subject trend table */}
      {subjectTrends.length > 0 && (
        <motion.div variants={cardAnim}>
          <Card className="rounded-2xl border bg-card shadow-sm">
            <CardHeader className="pb-1"><CardTitle className="text-xs font-bold text-muted-foreground">تطور أداء المواد عبر الفصول</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      {["المادة","ف1","ف2","ف3","التغير الكلي","الاتجاه"].map((h, i) => (
                        <th key={i} className={`pb-2 text-xs text-muted-foreground font-semibold ${i === 0 ? "text-right pr-2" : "text-center"}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {subjectTrends.map((s, i) => {
                      const up = s.delta != null && s.delta >= 0.01;
                      const dn = s.delta != null && s.delta <= -0.01;
                      return (
                        <tr key={i} className={`border-b ${i % 2 === 0 ? "" : "bg-muted/20"}`}>
                          <td className="py-2 pr-2 font-medium">{s.arLabel}</td>
                          {[s.t1, s.t2, s.t3].map((v, ti) => (
                            <td key={ti} className={`py-2 text-center font-mono text-xs ${v == null ? "text-muted-foreground" : v >= 10 ? "text-emerald-600" : "text-red-500"}`}>
                              {v != null ? v.toFixed(2) : "—"}
                            </td>
                          ))}
                          <td className={`py-2 text-center font-mono font-bold text-xs ${up ? "text-emerald-600" : dn ? "text-red-500" : "text-muted-foreground"}`}>
                            {s.delta != null ? (s.delta >= 0 ? "+" : "") + s.delta.toFixed(2) : "—"}
                          </td>
                          <td className="py-2 text-center">
                            {s.delta == null ? <span className="text-muted-foreground text-xs">—</span>
                              : up ? <span className="inline-flex items-center gap-0.5 text-emerald-600 text-[10px] font-bold"><TrendingUp className="w-3 h-3" />تحسن</span>
                              : dn ? <span className="inline-flex items-center gap-0.5 text-red-500 text-[10px] font-bold"><TrendingDown className="w-3 h-3" />تراجع</span>
                              : <span className="text-amber-600 text-[10px] font-semibold">مستقر</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Per-student detail table sorted by delta */}
      <motion.div variants={cardAnim}>
        <Card className="rounded-2xl border bg-card shadow-sm">
          <CardHeader className="pb-1"><CardTitle className="text-xs font-bold text-muted-foreground">تفاصيل تطور كل تلميذ (مرتّب حسب التحسن)</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto max-h-72 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/60 sticky top-0 z-10">
                  <tr>
                    {["الاسم","ف1","ف2","ف3","التغير","الاتجاه"].map((h, i) => (
                      <th key={i} className={`py-2 text-muted-foreground font-semibold ${i === 0 ? "text-right pr-2" : "text-center"}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...studentTrends].sort((a, b) => b.delta - a.delta).map((r, i) => (
                    <tr key={i} className={`border-b ${i % 2 === 0 ? "" : "bg-muted/20"}`}>
                      <td className="py-1.5 pr-2 font-medium">{r.student.nomPrenom}</td>
                      {[r.t1Avg, r.t2Avg, r.t3Avg].map((a, ti) => (
                        <td key={ti} className={`py-1.5 text-center font-mono ${a == null ? "text-muted-foreground" : a >= 10 ? "text-emerald-600" : "text-red-500"}`}>
                          {a != null ? a.toFixed(2) : "—"}
                        </td>
                      ))}
                      <td className={`py-1.5 text-center font-mono font-bold ${r.trend === "up" ? "text-emerald-600" : r.trend === "down" ? "text-red-500" : "text-amber-600"}`}>
                        {r.delta >= 0 ? "+" : ""}{r.delta.toFixed(2)}
                      </td>
                      <td className="py-1.5 text-center">
                        <span className={`px-1.5 py-0.5 rounded-full font-bold text-[10px] ${
                          r.trend === "up"   ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" :
                          r.trend === "down" ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" :
                                              "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                        }`}>
                          {r.trend === "up" ? "تحسّن ↑" : r.trend === "down" ? "تراجع ↓" : "مستقر →"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}

// ─── TAB 5: Passed ────────────────────────────────────────────────────────────
function TabPassed({ results }: { results: StudentResult[] }) {
  const [q, setQ] = useState("");
  const [filterGrade, setFilterGrade] = useState("all");
  const passed = results.filter(r => r.annualAvg !== null && r.annualAvg >= 10)
    .sort((a, b) => (b.annualAvg ?? 0) - (a.annualAvg ?? 0));
  const GRADES = ["all", "ممتاز", "جيد جداً", "جيد", "مقبول"];
  const filtered = passed.filter(r => {
    const gl = gradeLabel(r.annualAvg).label;
    return (filterGrade === "all" || gl === filterGrade) && (!q || r.student.nomPrenom.includes(q));
  });

  const handlePrint = () => {
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>قائمة الناجحين</title>
<style>body{font-family:Tahoma,Arial,sans-serif;direction:rtl;padding:24px;color:#111}h1{text-align:center;margin-bottom:16px;font-size:20px}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #999;padding:6px 8px;text-align:center}th{background:#e8e8e8;font-weight:700}td.name{text-align:right}tr:nth-child(even){background:#f7f7f7}@media print{@page{size:A4;margin:12mm}}</style>
</head><body><h1>قائمة الناجحين</h1><p style="text-align:center;font-size:12px;color:#555">عدد الناجحين: ${filtered.length}</p>
<table><thead><tr><th>الرتبة</th><th>الاسم واللقب</th><th>ف1</th><th>ف2</th><th>ف3</th><th>المعدل السنوي</th><th>التقدير</th></tr></thead><tbody>
${filtered.map((r, i) => `<tr><td>${i + 1}</td><td class="name">${r.student.nomPrenom}</td><td>${avg2(r.t1Avg)}</td><td>${avg2(r.t2Avg)}</td><td>${avg2(r.t3Avg)}</td><td>${avg2(r.annualAvg)}</td><td>${gradeLabel(r.annualAvg).label}</td></tr>`).join("")}
</tbody></table></body></html>`);
    win.document.close();
    setTimeout(() => win.print(), 300);
  };

  return (
    <motion.div variants={stagger} initial="initial" animate="animate" className="space-y-4">
      <motion.div variants={cardAnim} className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="ps-9" placeholder="بحث…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <div className="flex gap-1 flex-wrap">
          {GRADES.map(g => (
            <button key={g} onClick={() => setFilterGrade(g)}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${filterGrade === g ? "bg-blue-600 text-white" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
              {g === "all" ? "الكل" : g}
            </button>
          ))}
        </div>
        <Button onClick={handlePrint} variant="outline" size="sm" className="gap-2"><Printer className="w-4 h-4" /> طباعة</Button>
      </motion.div>
      <motion.div variants={cardAnim}>
        <Card className="rounded-2xl border bg-card shadow-sm">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/60">
                  <tr>
                    {["#","الاسم واللقب","المستوى","القسم","ف1","ف2","ف3","المعدل السنوي","التقدير"].map((h, i) => (
                      <th key={i} className="px-3 py-2.5 text-xs text-muted-foreground font-semibold whitespace-nowrap text-center first:text-right">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r, i) => {
                    const gl = gradeLabel(r.annualAvg);
                    return (
                      <tr key={r.student.id} className={`border-t ${i % 2 === 0 ? "" : "bg-muted/15"}`}>
                        <td className="px-3 py-2 text-muted-foreground font-mono text-xs">{i + 1}</td>
                        <td className="px-3 py-2 font-semibold">{r.student.nomPrenom}</td>
                        <td className="px-3 py-2 text-center"><Badge variant="secondary" className="text-xs">{LEVEL_LABELS[r.student.niveau as Niveau]}</Badge></td>
                        <td className="px-3 py-2 text-center"><Badge variant="outline" className="font-bold">{r.student.classe}</Badge></td>
                        {[r.t1Avg, r.t2Avg, r.t3Avg].map((a, ti) => (
                          <td key={ti} className={`px-3 py-2 text-center font-mono text-xs ${a == null ? "text-muted-foreground" : a >= 10 ? "text-emerald-600" : "text-red-500"}`}>{avg2(a)}</td>
                        ))}
                        <td className="px-3 py-2 text-center font-mono font-bold text-emerald-600">{avg2(r.annualAvg)}</td>
                        <td className="px-3 py-2 text-center"><span className={`text-xs font-semibold ${gl.color}`}>{gl.label}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-2 border-t text-xs text-muted-foreground">عرض {filtered.length} من {passed.length} ناجح</div>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}

// ─── TAB 6: Failed ────────────────────────────────────────────────────────────
function TabFailed({ results }: { results: StudentResult[] }) {
  const failed = results
    .filter(r => r.annualAvg !== null && r.annualAvg < 10)
    .map(r => ({ ...r, needed: r.annualAvg != null ? Math.max(0, 10 - r.annualAvg) : null }))
    .sort((a, b) => (a.needed ?? 999) - (b.needed ?? 999));

  return (
    <motion.div variants={stagger} initial="initial" animate="animate" className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <motion.div variants={cardAnim}>
          <Card className="rounded-2xl border bg-red-50/30 dark:bg-red-950/20 border-red-200/50 shadow-sm">
            <CardContent className="p-4 text-center">
              <p className="text-5xl font-extrabold text-red-500">{failed.length}</p>
              <p className="text-xs text-muted-foreground mt-1">إجمالي الراسبين</p>
            </CardContent>
          </Card>
        </motion.div>
        <motion.div variants={cardAnim}>
          <Card className="rounded-2xl border bg-card shadow-sm">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground mb-2">توزيع الجنس بين الراسبين</p>
              <div className="flex justify-between text-xs mb-2">
                <span className="text-blue-500 font-semibold">ذكور: {failed.filter(r => r.student.sexe === "M").length}</span>
                <span className="text-pink-500 font-semibold">إناث: {failed.filter(r => r.student.sexe === "F").length}</span>
              </div>
              <ResponsiveContainer width="100%" height={80}>
                <PieChart>
                  <Pie data={[
                    { name: "ذكور", value: failed.filter(r => r.student.sexe === "M").length },
                    { name: "إناث", value: failed.filter(r => r.student.sexe === "F").length },
                  ]} cx="50%" cy="50%" outerRadius={35} dataKey="value">
                    <Cell fill={MALE_COLOR} />
                    <Cell fill={FEMALE_COLOR} />
                  </Pie>
                  <Tooltip content={<MiniTooltip />} cursor={{ fill: "transparent" }} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </motion.div>
        <motion.div variants={cardAnim}>
          <Card className="rounded-2xl border bg-card shadow-sm">
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-extrabold text-amber-500">
                {failed[0]?.needed != null ? `+${failed[0].needed.toFixed(2)}` : "—"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">أقل نقص للنجاح</p>
              <p className="text-xs font-medium mt-0.5 truncate">{failed[0]?.student.nomPrenom}</p>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Gap distribution chart */}
      {failed.length > 0 && (() => {
        const GAP_BUCKETS = [
          { label: "0–2",  min: 0,  max: 2   },
          { label: "2–4",  min: 2,  max: 4   },
          { label: "4–6",  min: 4,  max: 6   },
          { label: "6–8",  min: 6,  max: 8   },
          { label: "8–10", min: 8,  max: 10  },
          { label: ">10",  min: 10, max: 100 },
        ];
        const gapData = GAP_BUCKETS.map((b, bi) => ({
          label: b.label,
          عدد: failed.filter(r => r.needed != null && r.needed >= b.min && r.needed < b.max).length,
          fill: `rgba(239,68,68,${1 - bi * 0.12})`,
        })).filter(d => d.عدد > 0);
        if (gapData.length === 0) return null;
        return (
          <motion.div variants={cardAnim}>
            <Card className="rounded-2xl border bg-card shadow-sm">
              <CardHeader className="pb-1">
                <CardTitle className="text-xs font-bold text-muted-foreground">توزيع الفجوة عن النجاح (النقاط الناقصة)</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={gapData} barSize={32} margin={{ left: -15 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.08} />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 9 }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip content={<MiniTooltip />} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
                    <Bar dataKey="عدد" name="عدد الراسبين" radius={[6, 6, 0, 0]}>
                      {gapData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </motion.div>
        );
      })()}

      <motion.div variants={cardAnim}>
        <Card className="rounded-2xl border bg-card shadow-sm">
          <CardHeader className="pb-1"><CardTitle className="text-xs font-bold text-muted-foreground">الراسبون — مرتبون من الأقرب للنجاح</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/60">
                  <tr>
                    {["الاسم واللقب","المستوى","القسم","المعدل السنوي","النقص للنجاح"].map((h, i) => (
                      <th key={i} className="px-3 py-2.5 text-xs text-muted-foreground font-semibold text-center first:text-right">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {failed.map((r, i) => (
                    <tr key={r.student.id} className={`border-t ${i % 2 === 0 ? "" : "bg-muted/15"}`}>
                      <td className="px-3 py-2 font-medium">{r.student.nomPrenom}</td>
                      <td className="px-3 py-2 text-center"><Badge variant="secondary" className="text-xs">{LEVEL_LABELS[r.student.niveau as Niveau]}</Badge></td>
                      <td className="px-3 py-2 text-center"><Badge variant="outline">{r.student.classe}</Badge></td>
                      <td className="px-3 py-2 text-center font-mono font-bold text-red-500">{avg2(r.annualAvg)}</td>
                      <td className="px-3 py-2 text-center font-mono text-amber-600 font-bold">
                        {r.needed != null ? `+${r.needed.toFixed(2)}` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}

// ─── TAB 7: Gender Analysis ───────────────────────────────────────────────────
function TabGender({ results }: { results: StudentResult[] }) {
  const withAvg = results.filter(r => r.annualAvg !== null);
  const boys  = withAvg.filter(r => r.student.sexe === "M");
  const girls = withAvg.filter(r => r.student.sexe === "F");
  const boyPass  = boys.filter(r => r.passed === true).length;
  const girlPass = girls.filter(r => r.passed === true).length;
  const boyRate  = boys.length  > 0 ? (boyPass  / boys.length)  * 100 : 0;
  const girlRate = girls.length > 0 ? (girlPass / girls.length) * 100 : 0;
  const boyAvg  = boys.length  > 0 ? boys.reduce((s, r)  => s + (r.annualAvg ?? 0), 0) / boys.length  : 0;
  const girlAvg = girls.length > 0 ? girls.reduce((s, r) => s + (r.annualAvg ?? 0), 0) / girls.length : 0;

  const barData = [
    { name: "ذكور",  rate: +boyRate.toFixed(1),  avg: +boyAvg.toFixed(2),  total: boys.length,  pass: boyPass,  fill: MALE_COLOR   },
    { name: "إناث", rate: +girlRate.toFixed(1), avg: +girlAvg.toFixed(2), total: girls.length, pass: girlPass, fill: FEMALE_COLOR },
  ];

  // Per-class gender breakdown — key by niveau+classe so identically named classes in different levels are separate
  const classKeys = [...new Set(withAvg.map(r => `${r.student.niveau}__${r.student.classe}`))].sort();
  const perClassGender = classKeys.map(key => {
    const [niv, cls] = key.split("__") as [string, string];
    const rs = withAvg.filter(r => r.student.niveau === niv && r.student.classe === cls);
    const b  = rs.filter(r => r.student.sexe === "M");
    const g  = rs.filter(r => r.student.sexe === "F");
    const bPass = b.filter(r => r.passed === true).length;
    const gPass = g.filter(r => r.passed === true).length;
    const bRate = b.length > 0 ? (bPass / b.length) * 100 : null;
    const gRate = g.length > 0 ? (gPass / g.length) * 100 : null;
    const bAvg  = b.length > 0 ? b.reduce((s, r) => s + (r.annualAvg ?? 0), 0) / b.length : null;
    const gAvg  = g.length > 0 ? g.reduce((s, r) => s + (r.annualAvg ?? 0), 0) / g.length : null;
    const label = `${LEVEL_LABELS[niv as Niveau] ?? niv} — ${cls}`;
    return { cls, niv, label, total: rs.length, boys: b.length, girls: g.length, bPass, gPass, bRate, gRate, bAvg, gAvg };
  });

  return (
    <motion.div variants={stagger} initial="initial" animate="animate" className="space-y-5">
      {/* Overview cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {barData.map((d, i) => (
          <motion.div key={i} variants={cardAnim}>
            <Card className="rounded-2xl border bg-card shadow-sm">
              <CardContent className="p-5 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-xl font-bold"
                    style={{ background: d.fill }}>
                    {d.name === "ذكور" ? "♂" : "♀"}
                  </div>
                  <div>
                    <p className="font-bold">{d.name}</p>
                    <p className="text-xs text-muted-foreground">{d.total} تلميذ</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 text-center">
                  <div className="bg-muted/30 rounded-xl p-2">
                    <p className="text-2xl font-extrabold" style={{ color: d.fill }}>{d.rate.toFixed(1)}%</p>
                    <p className="text-xs text-muted-foreground">نسبة النجاح</p>
                  </div>
                  <div className="bg-muted/30 rounded-xl p-2">
                    <p className="text-2xl font-extrabold" style={{ color: d.fill }}>{d.avg}</p>
                    <p className="text-xs text-muted-foreground">المعدل العام</p>
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span>نسبة النجاح</span>
                    <span className="font-bold" style={{ color: d.fill }}>{d.rate.toFixed(1)}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <motion.div className="h-full rounded-full" style={{ background: d.fill }}
                      initial={{ width: 0 }} animate={{ width: `${d.rate}%` }}
                      transition={{ duration: 0.9, delay: i * 0.1 }} />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Comparison chart */}
      <motion.div variants={cardAnim}>
        <Card className="rounded-2xl border bg-card shadow-sm">
          <CardHeader className="pb-1"><CardTitle className="text-xs font-bold text-muted-foreground">مقارنة الجنسين</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={barData} margin={{ left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.08} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="left" domain={[0, 20]} tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
                <Tooltip content={<MiniTooltip />} cursor={{ fill: "transparent" }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                <Bar yAxisId="left"  dataKey="avg"  name="المعدل العام" radius={[6, 6, 0, 0]}>
                  {barData.map((d, i) => <Cell key={i} fill={d.fill} fillOpacity={0.7} />)}
                </Bar>
                <Bar yAxisId="right" dataKey="rate" name="نسبة النجاح %" radius={[6, 6, 0, 0]}>
                  {barData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <p className={`text-sm text-center font-semibold mt-2 ${girlRate > boyRate ? "text-pink-500" : boyRate > girlRate ? "text-blue-500" : "text-muted-foreground"}`}>
              {girlRate > boyRate ? `الإناث أفضل أداءً بفارق ${(girlRate - boyRate).toFixed(1)}%` :
               boyRate  > girlRate ? `الذكور أفضل أداءً بفارق ${(boyRate - girlRate).toFixed(1)}%` : "أداء متساوٍ"}
            </p>
          </CardContent>
        </Card>
      </motion.div>

      {/* Per-class gender breakdown */}
      {perClassGender.length > 0 && (
        <motion.div variants={cardAnim}>
          <Card className="rounded-2xl border bg-card shadow-sm">
            <CardHeader className="pb-1">
              <CardTitle className="text-xs font-bold text-muted-foreground">تحليل الجنس حسب القسم</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/60">
                    <tr>
                      {["القسم","المجموع",
                        "♂ ذكور","ناجح ♂","نسبة ♂","معدل ♂",
                        "♀ إناث","ناجح ♀","نسبة ♀","معدل ♀",
                        "الأفضل"].map((h, i) => (
                        <th key={i} className="px-3 py-2.5 text-xs text-muted-foreground font-semibold text-center whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {perClassGender.map((c, i) => {
                      const winner = c.bRate !== null && c.gRate !== null
                        ? c.bRate > c.gRate ? <span className="text-blue-500 font-bold">♂</span>
                          : c.gRate > c.bRate ? <span className="text-pink-500 font-bold">♀</span>
                          : <span className="text-muted-foreground">—</span>
                        : <span className="text-muted-foreground">—</span>;
                      return (
                        <tr key={c.cls} className={`border-t ${i % 2 === 0 ? "" : "bg-muted/15"}`}>
                          <td className="px-3 py-2 text-center font-bold">{c.cls}</td>
                          <td className="px-3 py-2 text-center text-muted-foreground">{c.total}</td>
                          <td className="px-3 py-2 text-center text-blue-500 font-semibold">{c.boys}</td>
                          <td className="px-3 py-2 text-center text-emerald-600">{c.bPass}</td>
                          <td className="px-3 py-2 text-center font-mono text-xs">
                            {c.bRate !== null ? <span className={c.bRate >= 50 ? "text-emerald-600 font-bold" : "text-red-500 font-bold"}>{c.bRate.toFixed(1)}%</span> : "—"}
                          </td>
                          <td className="px-3 py-2 text-center font-mono text-xs text-blue-500">
                            {c.bAvg !== null ? c.bAvg.toFixed(2) : "—"}
                          </td>
                          <td className="px-3 py-2 text-center text-pink-500 font-semibold">{c.girls}</td>
                          <td className="px-3 py-2 text-center text-emerald-600">{c.gPass}</td>
                          <td className="px-3 py-2 text-center font-mono text-xs">
                            {c.gRate !== null ? <span className={c.gRate >= 50 ? "text-emerald-600 font-bold" : "text-red-500 font-bold"}>{c.gRate.toFixed(1)}%</span> : "—"}
                          </td>
                          <td className="px-3 py-2 text-center font-mono text-xs text-pink-500">
                            {c.gAvg !== null ? c.gAvg.toFixed(2) : "—"}
                          </td>
                          <td className="px-3 py-2 text-center">{winner}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Per-class gender chart */}
      {perClassGender.length > 1 && (
        <motion.div variants={cardAnim}>
          <Card className="rounded-2xl border bg-card shadow-sm">
            <CardHeader className="pb-1"><CardTitle className="text-xs font-bold text-muted-foreground">نسبة نجاح الذكور والإناث حسب القسم</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart
                  data={perClassGender.map(c => ({
                    name: c.cls,
                    "ذكور %":  c.bRate !== null ? +c.bRate.toFixed(1) : 0,
                    "إناث %": c.gRate !== null ? +c.gRate.toFixed(1) : 0,
                  }))}
                  margin={{ left: -10, right: 5 }}
                  barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.08} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis type="number" domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<MiniTooltip />} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="ذكور %" fill={MALE_COLOR}   radius={[5, 5, 0, 0]} barSize={18} />
                  <Bar dataKey="إناث %" fill={FEMALE_COLOR} radius={[5, 5, 0, 0]} barSize={18} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </motion.div>
  );
}

// ─── TAB 8: Repeaters ────────────────────────────────────────────────────────
function TabRepeaters({ results }: { results: StudentResult[] }) {
  const withAvg = results.filter(r => r.annualAvg !== null);
  const repeaters = withAvg.filter(r => (r.student as any).statut === "redoublant");
  const newcomers = withAvg.filter(r => (r.student as any).statut !== "redoublant");
  const hasStatutData = repeaters.length > 0;

  // ── Fallback: analyse failed students (المتوقع إعادتهم) ────────────────────
  if (!hasStatutData) {
    const failed = withAvg.filter(r => r.passed === false)
      .sort((a, b) => (b.annualAvg ?? 0) - (a.annualAvg ?? 0));

    // Group failed by class for chart
    const classKeys = [...new Set(failed.map(r => `${r.student.niveau}__${r.student.classe}`))].sort();
    const perClassData = classKeys.map(key => {
      const [niv, cls] = key.split("__") as [string, string];
      const rs = failed.filter(r => r.student.niveau === niv && r.student.classe === cls);
      const allInClass = withAvg.filter(r => r.student.niveau === niv && r.student.classe === cls);
      return {
        name: `${cls}`,
        label: `${LEVEL_LABELS[niv as Niveau] ?? niv} — ${cls}`,
        failCount: rs.length,
        total: allInClass.length,
        rate: allInClass.length > 0 ? +(rs.length / allInClass.length * 100).toFixed(1) : 0,
      };
    });

    const totalFailed = failed.length;
    const avgDeficit = failed.length > 0
      ? failed.reduce((s, r) => s + (10 - (r.annualAvg ?? 0)), 0) / failed.length
      : 0;

    return (
      <motion.div variants={stagger} initial="initial" animate="animate" className="space-y-5">
        {/* Info banner */}
        <motion.div variants={cardAnim}>
          <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
            <Star className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
              لم يتم رصد تلاميذ بوضعية <strong>معيد</strong> في البيانات الحالية. يعرض هذا التحليل التلاميذ <strong>الراسبين المتوقع إعادتهم</strong> بناءً على المعدل السنوي.
            </p>
          </div>
        </motion.div>

        {/* KPI cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: "متوقع إعادتهم", value: totalFailed, sub: `من ${withAvg.length} تلميذ`, color: "text-red-500", bg: "bg-red-500/10" },
            { label: "نسبة الرسوب", value: `${withAvg.length > 0 ? (totalFailed / withAvg.length * 100).toFixed(1) : 0}%`, sub: "من إجمالي التلاميذ", color: "text-amber-600", bg: "bg-amber-500/10" },
            { label: "متوسط النقص للنجاح", value: `${avgDeficit.toFixed(2)}`, sub: "نقطة للوصول إلى 10/20", color: "text-blue-500", bg: "bg-blue-500/10" },
          ].map((d, i) => (
            <motion.div key={i} variants={cardAnim}>
              <Card className="rounded-2xl border bg-card shadow-sm">
                <CardContent className="p-5 text-center">
                  <div className={`w-10 h-10 rounded-xl ${d.bg} flex items-center justify-center mx-auto mb-3`}>
                    <Star className={`w-5 h-5 ${d.color}`} />
                  </div>
                  <p className={`text-3xl font-extrabold ${d.color}`}>{d.value}</p>
                  <p className="text-xs font-semibold mt-1">{d.label}</p>
                  <p className="text-xs text-muted-foreground">{d.sub}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Failed per class chart */}
        {perClassData.length > 0 && (
          <motion.div variants={cardAnim}>
            <Card className="rounded-2xl border bg-card shadow-sm">
              <CardHeader className="pb-1">
                <CardTitle className="text-xs font-bold text-muted-foreground">عدد الراسبين المتوقع إعادتهم حسب القسم</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={Math.max(200, perClassData.length * 36)}>
                  <BarChart data={perClassData} margin={{ left: -10, right: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.08} />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 9 }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip content={<MiniTooltip />} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
                    <Bar dataKey="failCount" name="الراسبون" radius={[5, 5, 0, 0]} fill="#ef4444" barSize={24} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Failed students table */}
        {failed.length > 0 && (
          <motion.div variants={cardAnim}>
            <Card className="rounded-2xl border bg-card shadow-sm">
              <CardHeader className="pb-1">
                <CardTitle className="text-xs font-bold text-muted-foreground">
                  قائمة التلاميذ المتوقع إعادتهم — مرتبة من الأقرب للنجاح
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/60">
                      <tr>
                        {["#", "الاسم واللقب", "المستوى", "القسم", "ف1", "ف2", "ف3", "المعدل السنوي", "النقص"].map((h, i) => (
                          <th key={i} className="px-3 py-2.5 text-xs text-muted-foreground font-semibold text-center whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {failed.map((r, i) => (
                        <tr key={r.student.id} className={`border-t ${i % 2 === 0 ? "" : "bg-muted/15"}`}>
                          <td className="px-3 py-2 text-center text-muted-foreground font-mono text-xs">{i + 1}</td>
                          <td className="px-3 py-2 font-medium">{r.student.nomPrenom}</td>
                          <td className="px-3 py-2 text-center"><Badge variant="secondary" className="text-xs">{LEVEL_LABELS[r.student.niveau as Niveau]}</Badge></td>
                          <td className="px-3 py-2 text-center"><Badge variant="outline">{r.student.classe}</Badge></td>
                          {[r.t1Avg, r.t2Avg, r.t3Avg].map((a, ti) => (
                            <td key={ti} className={`px-3 py-2 text-center font-mono text-xs ${a == null ? "text-muted-foreground" : a >= 10 ? "text-emerald-600" : "text-red-500"}`}>{avg2(a)}</td>
                          ))}
                          <td className="px-3 py-2 text-center font-mono font-bold text-red-500">{avg2(r.annualAvg)}</td>
                          <td className="px-3 py-2 text-center font-mono text-amber-600 font-bold text-xs">
                            +{r.annualAvg != null ? (10 - r.annualAvg).toFixed(2) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </motion.div>
    );
  }

  // ── With statut data: compare repeaters vs newcomers ──────────────────────
  const repPass  = repeaters.filter(r => r.passed).length;
  const newPass  = newcomers.filter(r => r.passed).length;
  const repRate  = repeaters.length > 0 ? (repPass / repeaters.length) * 100 : 0;
  const newRate  = newcomers.length > 0 ? (newPass / newcomers.length) * 100 : 0;
  const cmpData  = [
    { name: "الجدد",     rate: +newRate.toFixed(1), pass: newPass, total: newcomers.length, fill: PRIMARY   },
    { name: "المعيدون", rate: +repRate.toFixed(1), pass: repPass, total: repeaters.length, fill: "#f59e0b" },
  ];

  return (
    <motion.div variants={stagger} initial="initial" animate="animate" className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {cmpData.map((d, i) => (
          <motion.div key={i} variants={cardAnim}>
            <Card className="rounded-2xl border bg-card shadow-sm">
              <CardContent className="p-5 text-center">
                <p className="text-xs text-muted-foreground mb-1">{d.name}</p>
                <p className="text-5xl font-extrabold" style={{ color: d.fill }}>{d.rate}%</p>
                <p className="text-xs text-muted-foreground mt-1">{d.pass} ناجح من {d.total}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>
      <motion.div variants={cardAnim}>
        <Card className="rounded-2xl border bg-card shadow-sm">
          <CardHeader className="pb-1"><CardTitle className="text-xs font-bold text-muted-foreground">هل ساعدت الإعادة؟</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={cmpData} margin={{ left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.08} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
                <Tooltip content={<MiniTooltip />} cursor={{ fill: "transparent" }} />
                <Bar dataKey="rate" name="نسبة النجاح %" radius={[8, 8, 0, 0]}>
                  {cmpData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <p className={`text-sm text-center font-semibold mt-2 ${repRate > newRate ? "text-amber-600" : "text-blue-600"}`}>
              {repRate > newRate ? `✓ نعم، الإعادة ساعدت (+${(repRate - newRate).toFixed(1)}%)` : `✗ الجدد أفضل (+${(newRate - repRate).toFixed(1)}%)`}
            </p>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}

// ─── TAB 9: Failed List (Printable) ──────────────────────────────────────────
function TabFailedList({ results }: { results: StudentResult[] }) {
  const failed = results
    .filter(r => r.passed === false && r.annualAvg !== null)
    .sort((a, b) => (b.annualAvg ?? 0) - (a.annualAvg ?? 0));

  const handlePrint = () => {
    const win = window.open("", "_blank");
    if (!win) return;
    const dateStr = new Date().toLocaleDateString("ar-DZ", { year: "numeric", month: "long", day: "numeric" });
    win.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>قائمة الراسبين</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Tahoma,Arial,sans-serif;direction:rtl;color:#1a1a1a;padding:24px}.header{text-align:center;margin-bottom:20px;border-bottom:2px solid #1a1a1a;padding-bottom:12px}.header h1{font-size:20px;font-weight:700;margin-bottom:4px}.meta{display:flex;justify-content:space-between;font-size:13px;margin:16px 0;color:#333}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #999;padding:6px 8px;text-align:center}th{background:#e8e8e8;font-weight:700}td.name{text-align:right;font-weight:600}tr:nth-child(even){background:#f7f7f7}.stamp{margin-top:60px;display:flex;justify-content:space-between}.stamp .box{text-align:center}.stamp .line{margin-top:50px;border-top:1px solid #999;width:160px}@media print{body{padding:0}@page{size:A4 landscape;margin:12mm}}</style>
</head><body>
<div class="header"><h1>قائمة الراسبين</h1></div>
<div class="meta"><span>عدد الراسبين: ${failed.length}</span><span>تاريخ الطباعة: ${dateStr}</span></div>
<table><thead><tr><th>الرتبة</th><th>الاسم واللقب</th><th>المستوى</th><th>القسم</th><th>ف1</th><th>ف2</th><th>ف3</th><th>المعدل السنوي</th><th>النقص للنجاح</th></tr></thead><tbody>
${failed.map((r, i) => `<tr><td>${i + 1}</td><td class="name">${r.student.nomPrenom}</td><td>${LEVEL_LABELS[r.student.niveau as Niveau]}</td><td>${r.student.classe}</td><td>${avg2(r.t1Avg)}</td><td>${avg2(r.t2Avg)}</td><td>${avg2(r.t3Avg)}</td><td>${avg2(r.annualAvg)}</td><td>${r.annualAvg != null ? `+${(10 - r.annualAvg).toFixed(2)}` : "—"}</td></tr>`).join("")}
</tbody></table>
<div class="stamp"><div class="box"><div>توقيع الأستاذ (ة)</div><div class="line"></div></div><div class="box"><div>ختم وتوقيع الإدارة</div><div class="line"></div></div></div>
</body></html>`);
    win.document.close();
    setTimeout(() => win.print(), 300);
  };

  return (
    <motion.div variants={stagger} initial="initial" animate="animate" className="space-y-4">
      <motion.div variants={cardAnim} className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">إجمالي الراسبين: <span className="font-bold text-foreground">{failed.length}</span></p>
        <Button onClick={handlePrint} variant="outline" size="sm" className="gap-2"><Printer className="w-4 h-4" /> طباعة القائمة الرسمية</Button>
      </motion.div>
      <motion.div variants={cardAnim}>
        <Card className="rounded-2xl border bg-card shadow-sm">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/60">
                  <tr>
                    {["#","الاسم واللقب","المستوى","القسم","ف1","ف2","ف3","المعدل السنوي","النقص للنجاح"].map((h, i) => (
                      <th key={i} className="px-3 py-2.5 text-xs text-muted-foreground font-semibold whitespace-nowrap text-center first:text-right">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {failed.map((r, i) => (
                    <tr key={r.student.id} className={`border-t ${i % 2 === 0 ? "" : "bg-muted/15"}`}>
                      <td className="px-3 py-2 text-muted-foreground font-mono text-xs">{i + 1}</td>
                      <td className="px-3 py-2 font-medium">{r.student.nomPrenom}</td>
                      <td className="px-3 py-2 text-center"><Badge variant="secondary" className="text-xs">{LEVEL_LABELS[r.student.niveau as Niveau]}</Badge></td>
                      <td className="px-3 py-2 text-center"><Badge variant="outline">{r.student.classe}</Badge></td>
                      {[r.t1Avg, r.t2Avg, r.t3Avg].map((a, ti) => (
                        <td key={ti} className={`px-3 py-2 text-center font-mono text-xs ${a == null ? "text-muted-foreground" : a >= 10 ? "text-emerald-600" : "text-red-500"}`}>{avg2(a)}</td>
                      ))}
                      <td className="px-3 py-2 text-center font-mono font-bold text-red-500">{avg2(r.annualAvg)}</td>
                      <td className="px-3 py-2 text-center font-mono text-amber-600 font-bold">
                        {r.annualAvg != null ? `+${(10 - r.annualAvg).toFixed(2)}` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}

// ─── TAB 10: Top Students ─────────────────────────────────────────────────────
function TabTop({ results }: { results: StudentResult[] }) {
  const top = results
    .filter(r => r.annualAvg !== null && r.passed === true)
    .sort((a, b) => (b.annualAvg ?? 0) - (a.annualAvg ?? 0))
    .slice(0, 20);

  const podiumColors = ["#f59e0b", "#94a3b8", "#d97706", "#6366f1", "#8b5cf6"];

  return (
    <motion.div variants={stagger} initial="initial" animate="animate" className="space-y-5">
      {/* Podium top 3 */}
      {top.length >= 3 && (
        <motion.div variants={cardAnim}>
          <Card className="rounded-2xl border bg-card shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-bold text-muted-foreground flex items-center gap-2">
                <Trophy className="w-4 h-4 text-amber-500" /> منصة التتويج
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-end justify-center gap-6 mt-2">
                {/* 2nd */}
                <div className="flex flex-col items-center gap-2">
                  <span className="text-3xl">🥈</span>
                  <div className="text-center">
                    <p className="font-bold text-sm max-w-[120px] truncate">{top[1].student.nomPrenom}</p>
                    <p className="text-silver-500 font-extrabold">{avg2(top[1].annualAvg)}</p>
                  </div>
                  <div className="w-24 h-16 bg-slate-200 dark:bg-slate-700 rounded-t-xl flex items-center justify-center">
                    <span className="font-black text-2xl text-slate-500">2</span>
                  </div>
                </div>
                {/* 1st */}
                <div className="flex flex-col items-center gap-2">
                  <span className="text-4xl">🥇</span>
                  <div className="text-center">
                    <p className="font-bold text-base max-w-[140px] truncate">{top[0].student.nomPrenom}</p>
                    <p className="text-amber-500 font-extrabold text-lg">{avg2(top[0].annualAvg)}</p>
                  </div>
                  <div className="w-28 h-24 bg-amber-100 dark:bg-amber-900/30 rounded-t-xl flex items-center justify-center border-2 border-amber-400">
                    <span className="font-black text-3xl text-amber-500">1</span>
                  </div>
                </div>
                {/* 3rd */}
                <div className="flex flex-col items-center gap-2">
                  <span className="text-3xl">🥉</span>
                  <div className="text-center">
                    <p className="font-bold text-sm max-w-[120px] truncate">{top[2].student.nomPrenom}</p>
                    <p className="text-orange-500 font-extrabold">{avg2(top[2].annualAvg)}</p>
                  </div>
                  <div className="w-24 h-12 bg-orange-100 dark:bg-orange-900/30 rounded-t-xl flex items-center justify-center">
                    <span className="font-black text-2xl text-orange-500">3</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Full top 20 */}
      <motion.div variants={cardAnim}>
        <Card className="rounded-2xl border bg-card shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold text-muted-foreground">أوائل التلاميذ (أعلى 20)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {top.map((r, i) => {
              const gl = gradeLabel(r.annualAvg);
              return (
                <motion.div key={r.student.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="flex items-center gap-3 p-2 rounded-xl hover:bg-muted/40 transition-colors">
                  <span className="text-lg font-black w-8 text-center shrink-0" style={{ color: podiumColors[Math.min(i, 4)] }}>
                    {i < 3 ? ["🥇","🥈","🥉"][i] : `${i + 1}`}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{r.student.nomPrenom}</p>
                    <p className="text-xs text-muted-foreground">{LEVEL_LABELS[r.student.niveau as Niveau]} — {r.student.classe}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-lg font-extrabold tabular-nums ${gl.color}`}>{avg2(r.annualAvg)}</p>
                    <p className={`text-xs font-semibold ${gl.color}`}>{gl.label}</p>
                  </div>
                </motion.div>
              );
            })}
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// ANALYTICS DASHBOARD (wrapper with tab bar)
// ════════════════════════════════════════════════════════════════════════════════
function ResultsAnalyticsDashboard({ results, onTabChange }: { results: StudentResult[]; onTabChange?: (tab: AnalyticsTabId) => void }) {
  const [activeTab, setActiveTab] = useState<AnalyticsTabId>("general");
  const withAvg = results.filter(r => r.annualAvg !== null);
  if (withAvg.length === 0) return null;

  const handleTabChange = (tab: AnalyticsTabId) => {
    setActiveTab(tab);
    onTabChange?.(tab);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.05 }} className="space-y-3">

      {/* Tab bar */}
      <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
        <div className="flex overflow-x-auto scrollbar-hide border-b">
          {ANALYTICS_TABS.map(tab => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button key={tab.id} onClick={() => handleTabChange(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold whitespace-nowrap border-b-2 transition-all shrink-0 ${
                  active
                    ? "border-blue-600 text-blue-600 bg-blue-50/50 dark:bg-blue-950/20"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/30"
                }`}>
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="p-4">
          <AnimatePresence mode="wait">
            <motion.div key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2 }}>
              {activeTab === "general"    && <TabGeneral    results={results} />}
              {activeTab === "subjects"   && <TabSubjects   results={results} />}
              {activeTab === "groups"     && <TabGroups     results={results} />}
              {activeTab === "trend"      && <TabTrend      results={results} />}
              {activeTab === "progress"   && <TabProgress   results={results} />}
              {activeTab === "passed"     && <TabPassed     results={results} />}
              {activeTab === "failed"     && <TabFailed     results={results} />}
              {activeTab === "gender"     && <TabGender     results={results} />}
              {activeTab === "repeaters"  && <TabRepeaters  results={results} />}
              {activeTab === "failedlist" && <TabFailedList results={results} />}
              {activeTab === "top"        && <TabTop        results={results} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <style>{`
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </motion.div>
  );
}

// ─── 4AM coefficient override (Algerian Ministry official values) ─────────────
const COEF_OVERRIDE_4AM: Record<string, number> = {
  arabe:       5,
  maths:       4,
  francais:    3,
  histoire_geo:3,
  anglais:     2,
  physique:    2,
  svt:         2,
  islam:       2,
  civique:     1,
  musique:     1,
  eps:         1,
};

// Returns subjects with overridden coefficients for 4AM
function getSubjectsWithCorrectCoefs(niveau: Niveau, filiere?: import("@shared/subjects").LyceeBacFiliere) {
  const base = getSubjectsForLevel(niveau, filiere);
  if (niveau !== "4AM") return base;
  return base.map(s => ({
    ...s,
    coef: COEF_OVERRIDE_4AM[s.key] ?? s.coef,
  }));
}



const SUBJECT_HEADER_MAP: Record<string, string> = {
  "اللغة العربية":              "arabe",
  "اللغة الفرنسية":             "francais",
  "اللغة الإنجليزية":           "anglais",
  "اللغة اﻷمازيغية":           "amazigh",
  "التربية الإسلامية":           "islam",
  "التربية المدنية":             "civique",
  "التاريخ والجغرافيا":          "histoire_geo",
  "الرياضيات":                   "maths",
  "ع الطبيعة و الحياة":         "svt",
  "ع الفيزيائية والتكنولوجيا":  "physique",
  "المعلوماتية":                  "informatique",
  "التربية التشكيلية":            "plastique",
  "التربية الموسيقية":            "musique",
  "ت البدنية و الرياضية":       "eps",
};

interface ParsedStudent {
  raqm: number;
  nomPrenom: string;
  gender: string;
  sexe: "M" | "F";
  niveau: string | null;
  classe: string | null;
  grades: { 1: Record<string, number>; 2: Record<string, number>; 3: Record<string, number> };
  t1Avg: number | null;
  t2Avg: number | null;
  t3Avg: number | null;
  annualAvg: number | null;
  passed: boolean | null;
}

function extractNiveauClasseFromText(text: string): { niveau: string | null; classe: string | null } {
  let niveau: string | null = null;
  let classe: string | null = null;

  // Niveau detection — order matters (longer/more specific first)
  const digitMatch = text.match(/(\d)\s*متوسط/);
  if (digitMatch) {
    niveau = `${digitMatch[1]}AM`;
  } else if (/رابع\s*متوسط|السنة\s*الرابعة|4\s*ème/.test(text)) niveau = "4AM";
  else if (/ثالث\s*متوسط|السنة\s*الثالثة|3\s*ème/.test(text)) niveau = "3AM";
  else if (/ثاني\s*متوسط|السنة\s*الثانية|2\s*ème/.test(text)) niveau = "2AM";
  else if (/أول\s*متوسط|اول\s*متوسط|الأولى\s*متوسط|الاولى\s*متوسط|1\s*ème/.test(text)) niveau = "1AM";
  // Filename / short codes: "4AM", "3AM", "2AM", "1AM" (case-insensitive)
  if (!niveau) {
    const amCode = text.match(/\b([1-4])\s*AM\b/i);
    if (amCode) niveau = `${amCode[1]}AM`;
  }

  // Classe/foj detection — Arabic keywords first, then Latin, then filename patterns
  const classeMatch =
    text.match(/(?:الفوج|فوج|القسم|قسم|الشعبة)\s*[:\s]?\s*0*(\d+)/) ??
    text.match(/0*(\d+)\s*(?:الفوج|فوج)/) ??
    text.match(/[Cc]lasse\s*[:\s]?\s*0*(\d+)/) ??
    text.match(/\b(?:foj|Foj|FOJ)\s*[_\-]?\s*0*(\d+)\b/) ??
    // Filename patterns like "3AM2", "3AM_2", "3AM-2" (digit after AM code = classe)
    text.match(/\b[1-4]AM[_\-\s]?0*(\d+)\b/i);
  if (classeMatch) classe = String(parseInt(classeMatch[1]!, 10));

  return { niveau, classe };
}

function extractNiveauClasse(tableRows: Element[]): { niveau: string | null; classe: string | null } {
  let niveau: string | null = null;
  let classe: string | null = null;
  for (const row of tableRows) {
    const text = (row.textContent ?? "").replace(/\s+/g, " ");
    const { niveau: n, classe: c } = extractNiveauClasseFromText(text);
    if (!niveau && n) niveau = n;
    if (!classe && c) classe = c;
    if (niveau && classe) break;
  }
  return { niveau, classe };
}

function normalizeGenderStr(g: string): "M" | "F" {
  const v = g.trim();
  if (/أنثى|انثى|انثي|f|female|fille/i.test(v)) return "F";
  return "M";
}

interface ColMeta {
  type: "raqm" | "name" | "gender" | "subject" | "avg" | "skip";
  subjectKey?: string; tri?: 1 | 2 | 3;
}

function buildColMeta(headers: string[]): ColMeta[] {
  return headers.map(h => {
    const hNorm = h.replace(/\s+/g, " ").trim();
    if (hNorm === "الرقم") return { type: "raqm" };
    if (/^(اللقب\s*و\s*الاسم|الاسم\s*واللقب)$/.test(hNorm)) return { type: "name" };
    if (hNorm === "الجنس") return { type: "gender" };
    for (const [arLabel, key] of Object.entries(SUBJECT_HEADER_MAP)) {
      for (const tri of [1, 2, 3] as const) {
        if (hNorm === `${arLabel} ف ${tri}` || hNorm === `${arLabel} ف${tri}`) {
          return { type: "subject", subjectKey: key, tri };
        }
      }
    }
    for (const tri of [1, 2, 3] as const) {
      if (hNorm === `معدل الفصل ${tri}` || hNorm === `معدل الفصل${tri}`) {
        return { type: "avg", tri };
      }
    }
    return { type: "skip" };
  });
}

function parseHTMLExcel(text: string, filename?: string): ParsedStudent[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, "text/html");
  const tableRows = Array.from(doc.querySelectorAll("tr"));

  // Broad fallbacks: full document text and filename
  const fullDocText = (doc.body?.textContent ?? "").replace(/\s+/g, " ");
  const fromDoc = extractNiveauClasseFromText(fullDocText);
  const fromFilename = filename
    ? extractNiveauClasseFromText(filename.replace(/[_\-\.]/g, " "))
    : { niveau: null, classe: null };

  // Find ALL header rows (rows containing "الرقم" cell) — handles multi-table files
  const headerIndices: number[] = [];
  for (let i = 0; i < tableRows.length; i++) {
    const cells = Array.from(tableRows[i].querySelectorAll("td,th")).map(c =>
      (c.textContent ?? "").replace(/\s+/g, " ").trim()
    );
    if (cells.some(c => c === "الرقم")) headerIndices.push(i);
  }
  if (headerIndices.length === 0) throw new Error("لم يتم العثور على صف العناوين (الرقم)");

  const allStudents: ParsedStudent[] = [];

  for (let hi = 0; hi < headerIndices.length; hi++) {
    const headerRowIdx = headerIndices[hi]!;
    const nextHeaderIdx = headerIndices[hi + 1] ?? tableRows.length;

    // Metadata rows = rows before this header (since previous header end or file start)
    const metaStart = hi === 0 ? 0 : headerIndices[hi - 1]! + 1;
    const { niveau: tableNiveau, classe: tableClasse } =
      extractNiveauClasse(tableRows.slice(metaStart, headerRowIdx));

    // Fallback cascade: per-table metadata → full doc → filename
    const resolvedNiveau = tableNiveau ?? fromDoc.niveau ?? fromFilename.niveau;
    const resolvedClasse = tableClasse ?? fromDoc.classe ?? fromFilename.classe;

    const headers = Array.from(tableRows[headerRowIdx]!.querySelectorAll("td,th")).map(c =>
      (c.textContent ?? "").replace(/\s+/g, " ").trim()
    );
    const colMeta = buildColMeta(headers);
    const iRaqm   = colMeta.findIndex(c => c.type === "raqm");
    const iName   = colMeta.findIndex(c => c.type === "name");
    const iGender = colMeta.findIndex(c => c.type === "gender");

    for (let i = headerRowIdx + 1; i < nextHeaderIdx; i++) {
      const cells = Array.from(tableRows[i]!.querySelectorAll("td,th")).map(c =>
        (c.textContent ?? "").replace(/\s+/g, " ").trim()
      );
      const raqmRaw = cells[iRaqm];
      if (!raqmRaw || isNaN(Number(raqmRaw))) continue;

      const grades: ParsedStudent["grades"] = { 1: {}, 2: {}, 3: {} };
      const triAvgs: Record<number, number | null> = { 1: null, 2: null, 3: null };

      cells.forEach((val, ci) => {
        const meta = colMeta[ci];
        if (!meta) return;
        const normalized = val.replace(/,/g, ".").trim();
        const n = parseFloat(normalized);
        if (meta.type === "subject" && meta.subjectKey && meta.tri && !isNaN(n) && n >= 0)
          grades[meta.tri][meta.subjectKey] = Math.max(0, Math.min(20, n));
        if (meta.type === "avg" && meta.tri && !isNaN(n) && normalized !== "")
          triAvgs[meta.tri] = Math.max(0, Math.min(20, n));
      });

      const available = ([1, 2, 3] as const).map(t => triAvgs[t]).filter((v): v is number => v !== null);
      const annualAvg = available.length > 0
        ? Math.round((available.reduce((a, b) => a + b, 0) / available.length) * 100) / 100
        : null;

      const genderStr = cells[iGender] ?? "";
      allStudents.push({
        raqm: Number(raqmRaw),
        nomPrenom: cells[iName] ?? "",
        gender: genderStr,
        sexe: normalizeGenderStr(genderStr),
        niveau: resolvedNiveau,
        classe: resolvedClasse,
        grades, t1Avg: triAvgs[1], t2Avg: triAvgs[2], t3Avg: triAvgs[3],
        annualAvg,
        passed: annualAvg !== null ? annualAvg >= 10 : null,
      });
    }
  }

  if (allStudents.length === 0) throw new Error("لم يتم العثور على بيانات تلاميذ في الملف");
  return allStudents;
}

function printResults(results: StudentResult[], niveauLabel: string, _classeLabel: string, _t: (k: string) => string) {
  const win = window.open("", "_blank");
  if (!win) return;
  const dateStr = new Date().toLocaleDateString("ar-DZ", { year: "numeric", month: "long", day: "numeric" });

  // Group results by niveau+classe so every class gets its own table
  const classMap = new Map<string, StudentResult[]>();
  for (const r of results) {
    const key = `${r.student.niveau}__${r.student.classe}`;
    if (!classMap.has(key)) classMap.set(key, []);
    classMap.get(key)!.push(r);
  }
  // Sort groups: by niveau then classe
  const groups = [...classMap.entries()].sort(([a], [b]) => a.localeCompare(b));

  const classBlocksHtml = groups.map(([, rs], gi) => {
    const sample = rs[0]!.student;
    const niv = LEVEL_LABELS[sample.niveau as Niveau] ?? sample.niveau;
    const cls = sample.classe;
    const passed = rs.filter(r => r.passed === true).length;
    const failed = rs.filter(r => r.passed === false).length;
    const boys  = rs.filter(r => r.student.sexe === "M").length;
    const girls = rs.filter(r => r.student.sexe === "F").length;
    const avgs  = rs.map(r => r.annualAvg).filter((v): v is number => v != null);
    const classAvg = avgs.length ? (avgs.reduce((a, b) => a + b, 0) / avgs.length).toFixed(2) : "—";

    const rowsHtml = [...rs]
      .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999))
      .map((r, i) => {
        const passClass = r.passed === true ? "pass" : r.passed === false ? "fail" : "";
        const passLabel = r.passed === null ? "—" : r.passed ? "ناجح" : "راسب";
        const sexLabel  = r.student.sexe === "M" ? "ذ" : r.student.sexe === "F" ? "أ" : "—";
        return `<tr><td>${r.rank ?? i + 1}</td><td class="name">${r.student.nomPrenom}</td><td>${sexLabel}</td><td>${avg2(r.t1Avg)}</td><td>${avg2(r.t2Avg)}</td><td>${avg2(r.t3Avg)}</td><td class="bold">${avg2(r.annualAvg)}</td><td class="${passClass}">${passLabel}</td></tr>`;
      }).join("");

    return `
<div class="class-block${gi > 0 ? " page-break" : ""}">
  <div class="class-header">
    <span class="class-title">قسم ${cls} — ${niv}</span>
    <span class="class-meta">المجموع: ${rs.length} | ذكور: ${boys} | إناث: ${girls} | ناجح: ${passed} | راسب: ${failed} | معدل القسم: ${classAvg}/20</span>
  </div>
  <table>
    <thead><tr><th>الرتبة</th><th>اللقب والاسم</th><th>ج</th><th>معدل ف1</th><th>معدل ف2</th><th>معدل ف3</th><th>المعدل السنوي</th><th>النتيجة</th></tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  <div class="stamp">
    <div class="box"><div>توقيع الأستاذ (ة)</div><div class="line"></div></div>
    <div class="box"><div>ختم وتوقيع الإدارة</div><div class="line"></div></div>
  </div>
</div>`;
  }).join("\n");

  const passTotal  = results.filter(r => r.passed === true).length;
  const failTotal  = results.filter(r => r.passed === false).length;
  const boysTotal  = results.filter(r => r.student.sexe === "M").length;
  const girlsTotal = results.filter(r => r.student.sexe === "F").length;

  win.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"/><title>نتائج التلاميذ</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:"Segoe UI",Tahoma,Arial,sans-serif;direction:rtl;color:#1a1a1a;padding:20px}
.main-header{text-align:center;margin-bottom:16px;border-bottom:3px solid #1a1a1a;padding-bottom:12px}
.main-header h1{font-size:22px;font-weight:700;margin-bottom:4px}
.main-header .sub{font-size:13px;color:#555}
.summary{display:flex;gap:24px;justify-content:center;font-size:12px;margin:10px 0 18px;color:#333;flex-wrap:wrap}
.summary span{background:#f3f4f6;padding:4px 10px;border-radius:6px;font-weight:600}
.class-block{margin-bottom:32px}
.page-break{page-break-before:always;padding-top:16px}
.class-header{background:#1a1a1a;color:#fff;padding:7px 12px;border-radius:6px 6px 0 0;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px}
.class-title{font-size:14px;font-weight:700}
.class-meta{font-size:11px;opacity:.85}
table{width:100%;border-collapse:collapse;font-size:12px}
th,td{border:1px solid #ccc;padding:5px 7px;text-align:center}
th{background:#e8e8e8;font-weight:700}
td.name{text-align:right;font-weight:600}
td.bold{font-weight:700}
td.pass{color:#0a7a3d;font-weight:700}
td.fail{color:#c0392b;font-weight:700}
tr:nth-child(even){background:#f9f9f9}
.stamp{margin-top:28px;display:flex;justify-content:space-between;margin-bottom:8px}
.stamp .box{text-align:center;font-size:12px}
.stamp .line{margin-top:40px;border-top:1px solid #999;width:150px}
@media print{body{padding:0}@page{size:A4 landscape;margin:10mm}.page-break{page-break-before:always}}
</style>
</head><body>
<div class="main-header">
  <h1>نتائج التلاميذ</h1>
  <div class="sub">${niveauLabel}</div>
</div>
<div class="summary">
  <span>الإجمالي: ${results.length} تلميذ</span>
  <span>ذكور: ${boysTotal}</span>
  <span>إناث: ${girlsTotal}</span>
  <span style="color:#0a7a3d">ناجح: ${passTotal}</span>
  <span style="color:#c0392b">راسب: ${failTotal}</span>
  <span>تاريخ الطباعة: ${dateStr}</span>
</div>
${classBlocksHtml}
</body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 400);
}

// ─── Import Modal ─────────────────────────────────────────────────────────────
function ImportModal({ annee, onClose, onDone }: { annee: string; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<"idle" | "parsing" | "preview" | "importing" | "done" | "error">("idle");
  const [students, setStudents] = useState<ParsedStudent[]>([]);
  const [fileCount, setFileCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  const handleFiles = async (files: FileList | File[]) => {
    const arr = Array.from(files).filter(f => /\.(xls|xlsx|html?|htm)$/i.test(f.name));
    if (arr.length === 0) { setError("لم يتم اختيار ملفات صحيحة"); setStatus("error"); return; }
    setStatus("parsing"); setError(null);
    const all: ParsedStudent[] = [];
    const errs: string[] = [];
    for (const file of arr) {
      try {
        const text = await file.text();
        const parsed = parseHTMLExcel(text, file.name);
        all.push(...parsed);
      } catch (e: any) {
        errs.push(file.name);
      }
    }
    if (all.length === 0) {
      setError(errs.length > 0 ? `خطأ في قراءة: ${errs.join("، ")}` : "لم يتم العثور على بيانات");
      setStatus("error"); return;
    }
    // Deduplicate by (name + niveau + classe) — same name can appear in different classes
    const byKey = new Map<string, ParsedStudent>();
    for (const s of all) {
      const key = `${s.nomPrenom.trim()}||${s.niveau ?? ""}||${s.classe ?? ""}`;
      byKey.set(key, s);
    }
    const deduped = [...byKey.values()];
    setStudents(deduped);
    setFileCount(arr.length);
    setStatus("preview");
  };

  const handleImport = async () => {
    setStatus("importing"); setProgress({ done: 0, total: students.length });
    try {
      // Send all students in a single batch request instead of N×3 sequential calls
      const payload = {
        annee,
        students: students.map(s => ({
          studentName: s.nomPrenom,
          raqm: s.raqm,
          niveau: s.niveau ?? undefined,
          classe: s.classe ?? undefined,
          sexe: s.sexe,
          annualPassed: s.passed,
          trimesters: {
            ...(Object.keys(s.grades[1]).length > 0 ? { "1": s.grades[1] } : {}),
            ...(Object.keys(s.grades[2]).length > 0 ? { "2": s.grades[2] } : {}),
            ...(Object.keys(s.grades[3]).length > 0 ? { "3": s.grades[3] } : {}),
          },
          triAvgs: {
            ...(s.t1Avg !== null ? { "1": s.t1Avg } : {}),
            ...(s.t2Avg !== null ? { "2": s.t2Avg } : {}),
            ...(s.t3Avg !== null ? { "3": s.t3Avg } : {}),
          },
        })),
      };
      const res = await fetch(`${BASE}api/grades/batch-import`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await res.json() as { saved: number; notFound?: string[]; autoCreated?: number };
      setProgress({ done: students.length, total: students.length });
      const autoCreatedCount = result.autoCreated ?? 0;
      if (result.notFound && result.notFound.length > 0) {
        toast({
          title: `✓ تم استيراد نتائج ${result.saved} تلميذ${autoCreatedCount > 0 ? ` (${autoCreatedCount} تلميذ جديد تم إنشاؤه)` : ""}`,
          description: `لم يتم التعرف على: ${result.notFound.slice(0, 3).join("، ")}${result.notFound.length > 3 ? "…" : ""}`,
        });
      } else {
        toast({
          title: `✓ تم استيراد نتائج ${result.saved} تلميذ`,
          description: autoCreatedCount > 0 ? `تم إنشاء ${autoCreatedCount} تلميذ جديد تلقائياً` : undefined,
        });
      }
    } catch {
      toast({ variant: "destructive", title: "خطأ في الاستيراد" });
    }
    setStatus("done"); onDone();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <FileSpreadsheet className="w-5 h-5 text-emerald-500" />
            استيراد وحساب المعدلات من Excel
          </DialogTitle>
        </DialogHeader>
        <AnimatePresence mode="wait">
          {(status === "idle" || status === "parsing") && (
            <motion.div key="drop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div
                onDrop={e => { e.preventDefault(); if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files); }}
                onDragOver={e => e.preventDefault()} onClick={() => fileRef.current?.click()}
                className="mt-1 border-2 border-dashed border-muted-foreground/25 rounded-xl p-12 text-center cursor-pointer hover:border-emerald-500/50 hover:bg-emerald-50/5 transition-all">
                {status === "parsing"
                  ? <Loader2 className="w-8 h-8 mx-auto mb-3 text-emerald-500 animate-spin" />
                  : <Upload className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />}
                <p className="text-sm font-medium">
                  {status === "parsing" ? "جارٍ تحليل الملفات…" : "اسحب ملفات Excel هنا أو انقر للاختيار"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">يمكنك اختيار أكثر من ملف دفعة واحدة — يدعم ملفات تحليل النتائج (.xls)</p>
              </div>
              <input ref={fileRef} type="file" accept=".xls,.xlsx,.html,.htm" multiple className="hidden"
                onChange={e => e.target.files && handleFiles(e.target.files)} />
            </motion.div>
          )}
          {status === "error" && (
            <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="flex flex-col items-center gap-3 py-8 text-center">
              <AlertCircle className="w-10 h-10 text-red-500" />
              <p className="text-sm font-medium text-red-500">{error}</p>
              <Button variant="outline" onClick={() => setStatus("idle")}>حاول مجدداً</Button>
            </motion.div>
          )}
          {status === "preview" && (
            <motion.div key="preview" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              <div className="flex items-center justify-between my-3">
                <div>
                  <p className="text-sm text-muted-foreground">
                    {fileCount > 1 && <span className="font-semibold text-blue-500 me-1">{fileCount} ملفات ·</span>}
                    تم تحليل <span className="font-bold text-foreground">{students.length}</span> تلميذ
                  </p>
                </div>
                <div className="flex gap-2 text-xs text-muted-foreground">
                  <span className="text-emerald-500 font-semibold">{students.filter(s => s.passed).length} ناجح</span>
                  <span>·</span>
                  <span className="text-red-500 font-semibold">{students.filter(s => s.passed === false).length} راسب</span>
                </div>
              </div>

              <div className="rounded-lg border overflow-hidden max-h-72 overflow-y-auto text-sm">
                <table className="w-full">
                  <thead className="bg-muted/60 sticky top-0 z-10">
                    <tr>
                      {["#","الاسم","ف1","ف2","ف3","المعدل السنوي","النتيجة"].map((h, i) => (
                        <th key={i} className="px-3 py-2 text-xs text-muted-foreground font-semibold text-start">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((s, i) => (
                      <tr key={i} className={`border-t ${i % 2 === 0 ? "" : "bg-muted/20"}`}>
                        <td className="px-3 py-2 text-muted-foreground font-mono text-xs">{s.raqm}</td>
                        <td className="px-3 py-2 font-medium text-xs">{s.nomPrenom}</td>
                        {[s.t1Avg, s.t2Avg, s.t3Avg].map((a, ti) => (
                          <td key={ti} className={`px-3 py-2 text-center font-mono text-xs ${a === null ? "text-muted-foreground" : a >= 10 ? "text-emerald-600" : "text-red-500"}`}>{a !== null ? a.toFixed(2) : "—"}</td>
                        ))}
                        <td className={`px-3 py-2 text-center font-mono font-bold text-xs ${s.annualAvg === null ? "text-muted-foreground" : s.annualAvg >= 10 ? "text-emerald-600" : s.annualAvg >= 9 ? "text-amber-600" : "text-red-500"}`}>{s.annualAvg !== null ? s.annualAvg.toFixed(2) : "—"}</td>
                        <td className="px-3 py-2 text-center">
                          {s.annualAvg === null ? "—" : s.annualAvg >= 10
                            ? <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 font-semibold">ناجح</span>
                            : s.annualAvg >= 9
                            ? <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 font-semibold">استدراك</span>
                            : <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300 font-semibold">راسب</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex gap-2 justify-end mt-4">
                <Button variant="outline" onClick={() => { setStudents([]); setStatus("idle"); }}><X className="w-4 h-4 me-1" /> إلغاء</Button>
                <Button
                  onClick={handleImport}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2">
                  <Upload className="w-4 h-4" /> حفظ نتائج {students.length} تلميذ
                </Button>
              </div>
            </motion.div>
          )}
          {status === "importing" && (
            <motion.div key="importing" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="flex flex-col items-center gap-4 py-10">
              <Loader2 className="w-10 h-10 text-emerald-500 animate-spin" />
              <p className="text-sm text-muted-foreground">جارٍ حفظ نتائج {progress.total} تلميذ…</p>
              <div className="w-48 h-1.5 bg-muted rounded-full overflow-hidden">
                <motion.div className="h-full bg-emerald-500 rounded-full"
                  animate={{ width: ["0%", "80%"] }}
                  transition={{ duration: 2, ease: "easeOut" }} />
              </div>
            </motion.div>
          )}
          {status === "done" && (
            <motion.div key="done" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center gap-3 py-8 text-center">
              <CheckCircle2 className="w-12 h-12 text-emerald-500" />
              <p className="text-base font-semibold">تم الاستيراد وحساب المعدلات بنجاح</p>
              <p className="text-sm text-muted-foreground">تم حفظ نتائج {students.length} تلميذ</p>
              <Button onClick={onClose} className="mt-2">إغلاق</Button>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}

// ─── Subject Breakdown Modal (click average to see subject scores) ────────────
function SubjectBreakdownModal({ result, onClose }: { result: StudentResult; onClose: () => void }) {
  const niveau = result.student.niveau as Niveau;
  const subjects = getSubjectsWithCorrectCoefs(niveau, result.student.filiere ?? undefined);

  // Per-subject: compute T1/T2/T3 scores + annual avg
  const subjectRows = subjects.map(s => {
    const t1 = (result.scores as any)?.[1]?.[s.key] as number | undefined;
    const t2 = (result.scores as any)?.[2]?.[s.key] as number | undefined;
    const t3 = (result.scores as any)?.[3]?.[s.key] as number | undefined;
    const vals = [t1, t2, t3].filter((v): v is number => v !== undefined && v >= 0);
    const avg  = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    return { ...s, t1, t2, t3, avg };
  }).filter(s => s.t1 !== undefined || s.t2 !== undefined || s.t3 !== undefined);

  // Bar chart data: subject averages
  const barData = subjectRows
    .filter(s => s.avg !== null)
    .map(s => ({ subject: s.arLabel, avg: +s.avg!.toFixed(2), fill: s.avg! >= 10 ? "#16a34a" : "#ef4444" }));

  // Tri comparison data
  const triData = subjectRows.slice(0, 8).map(s => ({
    subject: s.arLabel.split(" ").slice(-1)[0]!,
    ف1: s.t1 ?? null,
    ف2: s.t2 ?? null,
    ف3: s.t3 ?? null,
  }));

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Target className="w-5 h-5 text-violet-500" />
            <span>{result.student.nomPrenom}</span>
            <span className="text-sm font-normal text-muted-foreground">
              — {LEVEL_LABELS[niveau]} · قسم {result.student.classe}
            </span>
          </DialogTitle>
        </DialogHeader>

        {/* Annual avg headline */}
        <div className="flex items-center gap-4 pb-3 border-b">
          {[
            { label: "المعدل السنوي", val: result.annualAvg, big: true },
            { label: "ف1", val: result.t1Avg },
            { label: "ف2", val: result.t2Avg },
            { label: "ف3", val: result.t3Avg },
          ].map(({ label, val, big }) => (
            <div key={label} className="text-center">
              <p className="text-[10px] text-muted-foreground">{label}</p>
              <p className={`${big ? "text-3xl font-extrabold" : "text-lg font-bold"} font-mono ${val === null ? "text-muted-foreground" : val >= 10 ? "text-emerald-600" : "text-red-500"}`}>
                {val !== null ? val.toFixed(2) : "—"}
              </p>
            </div>
          ))}
          <div className="ms-auto">
            {result.passed === true
              ? <span className="text-sm font-bold px-3 py-1.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">ناجح ✓</span>
              : result.passed === false
              ? <span className="text-sm font-bold px-3 py-1.5 rounded-full bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300">راسب ✗</span>
              : null}
          </div>
        </div>

        {/* Subject avg bar chart */}
        {barData.length > 0 && (
          <div>
            <p className="text-xs font-bold text-muted-foreground mb-2">متوسط كل مادة (عبر الفصول)</p>
            <ResponsiveContainer width="100%" height={Math.max(160, barData.length * 26)}>
              <BarChart data={barData} layout="vertical" margin={{ left: 110, right: 40 }} barSize={14}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.07} horizontal={false} />
                <XAxis type="number" domain={[0, 20]} tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="subject" tick={{ fontSize: 10 }} width={105} axisLine={false} tickLine={false} />
                <Tooltip content={<MiniTooltip />} />
                <Bar dataKey="avg" name="المتوسط" radius={[0, 4, 4, 0]}>
                  {barData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Tri comparison chart */}
        {triData.length > 0 && (
          <div>
            <p className="text-xs font-bold text-muted-foreground mb-2">مقارنة الفصول الثلاثة</p>
            <ResponsiveContainer width="100%" height={Math.max(160, triData.length * 26)}>
              <BarChart data={triData} layout="vertical" margin={{ left: 60, right: 10 }} barSize={10}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.07} horizontal={false} />
                <XAxis type="number" domain={[0, 20]} tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="subject" tick={{ fontSize: 10 }} width={55} axisLine={false} tickLine={false} />
                <Tooltip content={<MiniTooltip />} />
                <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="ف1" fill="#6366f1" radius={[0, 3, 3, 0]} />
                <Bar dataKey="ف2" fill="#8b5cf6" radius={[0, 3, 3, 0]} />
                <Bar dataKey="ف3" fill="#a855f7" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Subject scores table */}
        <div className="rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/60">
              <tr>
                {["المادة", "م", "ف1", "ف2", "ف3", "المتوسط"].map((h, i) => (
                  <th key={i} className="px-3 py-2 text-xs font-semibold text-muted-foreground text-start">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {subjectRows.map((s, i) => (
                <tr key={s.key} className={`border-t ${i % 2 === 0 ? "" : "bg-muted/15"}`}>
                  <td className="px-3 py-2 font-medium">{s.arLabel}</td>
                  <td className="px-3 py-2 text-muted-foreground text-xs font-mono">{s.coef}</td>
                  {[s.t1, s.t2, s.t3].map((v, ti) => (
                    <td key={ti} className={`px-3 py-2 font-mono text-sm ${v === undefined ? "text-muted-foreground" : v >= 10 ? "text-emerald-600" : "text-red-500"}`}>
                      {v !== undefined ? v.toFixed(2) : "—"}
                    </td>
                  ))}
                  <td className={`px-3 py-2 font-bold font-mono ${s.avg === null ? "text-muted-foreground" : s.avg >= 10 ? "text-emerald-600" : "text-red-500"}`}>
                    {s.avg !== null ? s.avg.toFixed(2) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end">
          <Button variant="outline" onClick={onClose}>إغلاق</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Grade Modal ──────────────────────────────────────────────────────────────
function GradeModal({ result, annee, onClose, onSaved }: {
  result: StudentResult; annee: string; onClose: () => void; onSaved: () => void;
}) {
  const { toast } = useToast();
  const [tri, setTri] = useState<1 | 2 | 3>(1);
  const [grades, setGrades] = useState<Record<string, Record<string, string>>>({ "1": {}, "2": {}, "3": {} });
  const [saving, setSaving] = useState(false);
  const subjects = getSubjectsWithCorrectCoefs(result.student.niveau as Niveau);

  useEffect(() => {
    const g: Record<string, Record<string, string>> = { "1": {}, "2": {}, "3": {} };
    for (const [t, subs] of Object.entries(result.scores)) {
      g[t] = {};
      for (const [sub, score] of Object.entries(subs)) g[t]![sub] = String(score);
    }
    setGrades(g);
  }, [result]);

  const setScore = (subject: string, val: string) =>
    setGrades(prev => ({ ...prev, [String(tri)]: { ...prev[String(tri)], [subject]: val } }));

  const numericGrades = (t: number) => {
    const parsed: Record<string, number> = {};
    for (const [s, v] of Object.entries(grades[String(t)] ?? {})) {
      const n = parseFloat(v);
      if (!isNaN(n)) parsed[s] = Math.max(0, Math.min(20, n));
    }
    return parsed;
  };
  const triAvg = calcWeightedAvg(numericGrades(tri), subjects);

  const handleSave = async () => {
    setSaving(true);
    try {
      for (const t of [1, 2, 3] as const) {
        const g = numericGrades(t);
        if (Object.keys(g).length === 0) continue;
        const res = await fetch(`${BASE}api/grades/bulk`, {
          method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ studentId: result.student.id, annee, trimestre: t, grades: g }),
        });
        if (!res.ok) throw new Error("Failed");
      }
      toast({ title: "تم حفظ النقاط ✓" });
      onSaved(); onClose();
    } catch { toast({ variant: "destructive", title: "خطأ في الحفظ" }); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg">
            {result.student.nomPrenom}
            <span className="text-sm font-normal text-muted-foreground ms-2">
              {LEVEL_LABELS[result.student.niveau as Niveau]} — {result.student.classe}
            </span>
          </DialogTitle>
        </DialogHeader>
        <div className="flex gap-2 border-b pb-3">
          {([1, 2, 3] as const).map(t => {
            const a = calcWeightedAvg(numericGrades(t), subjects);
            return (
              <motion.button key={t} onClick={() => setTri(t)} whileTap={{ scale: 0.96 }}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${tri === t ? "bg-blue-600 text-white shadow" : "bg-muted hover:bg-muted/80 text-muted-foreground"}`}>
                الفصل {t}
                {a !== null && <span className={`block text-xs font-normal mt-0.5 ${a >= 10 ? "text-emerald-300" : "text-red-300"}`}>{a.toFixed(2)}</span>}
              </motion.button>
            );
          })}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {subjects.map((s, i) => (
            <motion.div key={s.key} className="flex items-center gap-3"
              initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}>
              <div className="flex-1">
                <p className="text-xs text-muted-foreground mb-1">{s.arLabel}</p>
                <p className="text-xs text-muted-foreground">معامل {s.coef}</p>
              </div>
              <Input type="number" min={0} max={20} step={0.25} placeholder="— /20"
                className="w-20 text-center font-mono text-base"
                value={grades[String(tri)]?.[s.key] ?? ""}
                onChange={e => setScore(s.key, e.target.value)} />
            </motion.div>
          ))}
        </div>
        <div className="flex items-center justify-between border-t pt-3 mt-1">
          <div className="text-sm text-muted-foreground">
            معدل الفصل {tri}:
            <span className={`ms-2 text-xl font-extrabold ${triAvg === null ? "text-muted-foreground" : triAvg >= 10 ? "text-emerald-600" : "text-red-500"}`}>
              {triAvg !== null ? triAvg.toFixed(2) : "—"}
            </span>
            {triAvg !== null && <span className="text-muted-foreground text-xs ms-1">/20</span>}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>إلغاء</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "حفظ النقاط"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// MAIN PAGE (unchanged structure, dashboard injected above table)
// ════════════════════════════════════════════════════════════════════════════════
export default function Results() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [results, setResults] = useState<StudentResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected]       = useState<StudentResult | null>(null);
  const [subjectDetail, setSubjectDetail] = useState<StudentResult | null>(null);
  const [showImport, setShowImport]   = useState(false);
  const [annee, setAnnee]             = useState(DEFAULT_YEAR);
  const [filters, setFilters]         = useState({ niveau: "", classe: "", sexe: "", q: "", tri: "" as TriFilter });
  const [listKey, setListKey]         = useState(0);
  const [analyticsTab, setAnalyticsTab] = useState<AnalyticsTabId>("general");

  const fetchResults = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ annee });
      if (filters.niveau) p.set("niveau", filters.niveau);
      // ✅ FIX: Do NOT pass filters.classe to the API.
      // If we let the API filter by classe, the returned results only contain
      // students in that one class, so the classes dropdown loses all other
      // options and the user must first select "كل الأقسام" before switching
      // to another class. By always fetching all classes for the selected
      // niveau and filtering client-side, the dropdown stays fully populated.
      if (filters.sexe)   p.set("sexe",   filters.sexe);
      const res = await fetch(`${BASE}api/results?${p}`, { credentials: "include" });
      if (res.ok) { setResults(await res.json()); setListKey(k => k + 1); }
    } finally { setLoading(false); }
  }, [filters, annee]);

  useEffect(() => { fetchResults(); }, [fetchResults]);

  const stageResults = results.filter(r => STAGE_LEVELS[SCHOOL_STAGE].includes(r.student.niveau));
  const classes  = [...new Set(stageResults.map(r => r.student.classe))].sort();
  // ✅ FIX: apply classe filter client-side; also sort by selected trimestre avg.
  const displayed = stageResults
    .filter(r => {
      if (filters.niveau && r.student.niveau !== filters.niveau) return false;
      if (filters.classe && r.student.classe !== filters.classe) return false;
      if (filters.q && !r.student.nomPrenom.toLowerCase().includes(filters.q.toLowerCase())) return false;
      return true;
    })
    .sort((a, b) => {
      if (!filters.tri) return 0; // keep original API order (annual avg desc)
      const avgA = getTriAvg(a, filters.tri as any) ?? -1;
      const avgB = getTriAvg(b, filters.tri as any) ?? -1;
      return avgB - avgA;
    });

  const niveauLabel = filters.niveau ? LEVEL_LABELS[filters.niveau as Niveau] : "جميع المستويات";
  const passCount = displayed.filter(r => getTriPassed(r, filters.tri) === true).length;
  const failCount = displayed.filter(r => getTriPassed(r, filters.tri) === false).length;
  const classifiedCount = passCount + failCount;
  const avgScore = displayed.length
    ? displayed.reduce((sum, r) => sum + (getTriAvg(r, filters.tri) ?? r.annualAvg ?? 0), 0) / displayed.length
    : 0;

  const handlePrint = () => {
    // Always print ALL loaded results (all classes), organised per class
    if (results.length === 0) return;
    printResults(results, niveauLabel, filters.classe, t);
  };

  const handleDeleteStudent = async (studentId: string) => {
    if (!window.confirm("هل تريد حذف هذا التلميذ؟")) return;
    try {
      const res = await fetch(`${BASE}api/students/${studentId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error("Failed to delete student");
      }
      setResults(prev => prev.filter(r => r.student.id !== studentId));
      setSelected(null);
      setSubjectDetail(null);
      toast({ title: "تم حذف التلميذ" });
    } catch {
      toast({ variant: "destructive", title: "فشل حذف التلميذ" });
    }
  };

  return (
    <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit"
      className="p-6 space-y-5 max-w-7xl mx-auto">

      <div className="rounded-[22px] border border-sky-400/20 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.18),_transparent_35%),linear-gradient(135deg,#0b1326_0%,#0f1d35_35%,#0b1326_100%)] p-4 shadow-[0_20px_60px_rgba(15,23,42,0.5)]">
        {/* Header */}
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <motion.h1 className="text-3xl font-black text-white" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
            {t("results.title")}
          </motion.h1>
          <motion.div className="flex flex-wrap items-center gap-2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
            <Button variant="outline" className="gap-2 rounded-xl border-amber-400/40 bg-white/5 text-amber-300 hover:bg-amber-400/10 hover:text-amber-200" onClick={handlePrint} disabled={results.length === 0}>
              <Printer className="w-4 h-4" /> طباعة
            </Button>
            <Button
              variant="outline"
              className="gap-2 rounded-xl border-emerald-400/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/15 hover:text-emerald-200"
              onClick={() => setShowImport(true)}>
              <FileSpreadsheet className="w-4 h-4" /> استيراد Excel
            </Button>
          </motion.div>
        </div>

        {!loading && results.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <InsightCard label="إجمالي النتائج" value={String(classifiedCount)} accent="text-violet-300" icon={ClipboardList} />
            <InsightCard label="الناجحون" value={String(passCount)} accent="text-emerald-300" icon={CheckCircle2} />
            <InsightCard label="الراسبون" value={String(failCount)} accent="text-red-300" icon={XCircle} />
            <InsightCard label="المعدل" value={avgScore.toFixed(2)} accent="text-sky-300" icon={BarChart3} />
          </div>
        )}
      </div>

      {/* Filters */}
      <motion.div className="rounded-[20px] border border-sky-400/20 bg-slate-900/60 p-3 shadow-[0_12px_30px_rgba(15,23,42,0.45)]" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <Input className="ps-9 border-slate-700 bg-slate-950/40 text-white placeholder:text-slate-400" placeholder={t("students.search")} value={filters.q}
              onChange={e => setFilters(p => ({ ...p, q: e.target.value }))} />
          </div>
          <Select value={annee} onValueChange={setAnnee}>
            <SelectTrigger className="w-36 font-semibold border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 bg-blue-50/50 dark:bg-blue-950/30">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ACADEMIC_YEARS.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filters.niveau || "__all__"}
            onValueChange={v => setFilters(p => ({ ...p, niveau: v === "__all__" ? "" : v }))}>
            <SelectTrigger className="w-36"><SelectValue placeholder={t("students.filterLevel")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">{t("students.allLevels")}</SelectItem>
              {STAGE_LEVELS[SCHOOL_STAGE].map(l => <SelectItem key={l} value={l}>{LEVEL_LABELS[l]}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filters.classe || "__all__"}
            onValueChange={v => setFilters(p => ({ ...p, classe: v === "__all__" ? "" : v }))}>
            <SelectTrigger className="w-32"><SelectValue placeholder={t("students.filterClass")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">{t("students.allClasses")}</SelectItem>
              {classes.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filters.sexe || "__all__"}
            onValueChange={v => setFilters(p => ({ ...p, sexe: v === "__all__" ? "" : v }))}>
            <SelectTrigger className="w-28">
              <SelectValue placeholder="الجنس" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">كل الجنسين</SelectItem>
              <SelectItem value="M">ذكور</SelectItem>
              <SelectItem value="F">إناث</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filters.tri || "__all__"}
            onValueChange={v => setFilters(p => ({ ...p, tri: (v === "__all__" ? "" : v) as TriFilter }))}>
            <SelectTrigger className={`w-32 transition-all ${filters.tri ? "border-violet-400 dark:border-violet-600 text-violet-700 dark:text-violet-300 bg-violet-50/50 dark:bg-violet-950/30 font-semibold" : ""}`}>
              <SelectValue placeholder="الفصل" />
            </SelectTrigger>
            <SelectContent>
              {TRI_OPTIONS.map(o => (
                <SelectItem key={o.value || "__all__"} value={o.value || "__all__"}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </motion.div>

      {/* ── ANALYTICS DASHBOARD ── */}
      {!loading && results.length > 0 && (
        <ResultsAnalyticsDashboard results={results} onTabChange={setAnalyticsTab} />
      )}

      {/* ── STUDENT LIST — always visible ── */}
      <div className="space-y-2">
        {/* Section header */}
        {!loading && results.length > 0 && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="inline-flex w-6 h-6 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 items-center justify-center shadow">
                <ClipboardList className="w-3.5 h-3.5 text-white" />
              </span>
              <span className="text-sm font-bold">قائمة التلاميذ</span>
              <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full font-mono">
                {displayed.length}
              </span>
              {displayed.filter(r => getTriPassed(r, filters.tri) === true).length > 0 && (
                <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 px-2 py-0.5 rounded-full">
                  {displayed.filter(r => getTriPassed(r, filters.tri) === true).length} ناجح
                </span>
              )}
              {displayed.filter(r => getTriPassed(r, filters.tri) === false).length > 0 && (
                <span className="text-xs font-semibold text-red-600 bg-red-50 dark:bg-red-950/30 px-2 py-0.5 rounded-full">
                  {displayed.filter(r => getTriPassed(r, filters.tri) === false).length} {filters.niveau === "4AM" ? "معيد" : "راسب"}
                </span>
              )}
            </div>
          </div>
        )}

        <AnimatePresence mode="wait">
          {loading ? (
            <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-2">
              {[...Array(6)].map((_, i) => (
                <motion.div key={i} className="h-12 rounded-lg bg-muted"
                  animate={{ opacity: [0.4, 0.7, 0.4] }} transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.1 }} />
              ))}
            </motion.div>
          ) : displayed.length === 0 ? (
            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="text-center py-16 text-muted-foreground">
              <motion.div animate={{ y: [0, -8, 0] }} transition={{ duration: 3, repeat: Infinity }}>
                <ClipboardList className="w-12 h-12 mx-auto mb-3 opacity-20" />
              </motion.div>
              <p>{t("results.empty")}</p>
            </motion.div>
          ) : (
            <motion.div key={`table-${listKey}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="rounded-xl border overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/60 sticky top-0">
                    <tr>
                      {([
                          "#", t("col.name"), t("col.level"), t("col.class"), t("col.t1"), t("col.t2"), t("col.t3"),
                          filters.tri ? `م.${TRI_OPTIONS.find(o => o.value === filters.tri)?.label ?? ""}` : t("col.avg"),
                          t("col.result"), "",
                        ] as string[]).map((h, i) => (
                        <th key={i} className={`px-3 py-3 text-start text-xs font-semibold uppercase whitespace-nowrap ${i === 7 && filters.tri ? "text-violet-500 dark:text-violet-400" : "text-muted-foreground"}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {displayed.map((r, i) => (
                      <motion.tr key={r.student.id}
                        initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: Math.min(i * 0.02, 0.4) }}
                        className={`border-t hover:bg-muted/30 transition-colors cursor-pointer ${i % 2 === 0 ? "" : "bg-muted/15"}`}
                        onClick={() => setSelected(r)}>
                        <td className="px-3 py-3 text-muted-foreground text-xs font-mono">
                          {r.rank !== null ? (
                            <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${r.rank === 1 ? "bg-amber-100 text-amber-700" : r.rank === 2 ? "bg-slate-100 text-slate-600" : r.rank === 3 ? "bg-orange-100 text-orange-600" : "text-muted-foreground"}`}>{r.rank}</span>
                          ) : "—"}
                        </td>
                        <td className="px-3 py-3 font-medium">{r.student.nomPrenom}</td>
                        <td className="px-3 py-3"><Badge variant="secondary" className="text-xs">{LEVEL_LABELS[r.student.niveau as Niveau]}</Badge></td>
                        <td className="px-3 py-3"><Badge variant="outline" className="font-bold">{r.student.classe}</Badge></td>
                        {[r.t1Avg, r.t2Avg, r.t3Avg].map((a, ti) => {
                           const triIdx = filters.tri === "1" ? 0 : filters.tri === "2" ? 1 : filters.tri === "3" ? 2 : -1;
                           const inRange = filters.tri === "1+2" ? ti < 2 : filters.tri === "1+2+3" ? true : ti === triIdx;
                           return (
                             <td key={ti} className={`px-3 py-3 font-mono text-sm ${a === null ? "text-muted-foreground" : a >= 10 ? "text-emerald-600" : "text-red-500"}${inRange && filters.tri ? " bg-violet-50/40 dark:bg-violet-950/20" : ""}`}>
                               {avg2(a)}
                             </td>
                           );
                         })}
                        {(() => {
                           const dispAvg = getTriAvg(r, filters.tri);
                           return (
                             <td className={`px-3 py-3 font-bold font-mono cursor-pointer underline-offset-2 hover:underline ${dispAvg === null ? "text-muted-foreground" : dispAvg >= 10 ? "text-emerald-600 hover:text-emerald-700" : "text-red-500 hover:text-red-600"}`}
                               title="انقر لعرض تفاصيل المواد"
                               onClick={e => { e.stopPropagation(); setSubjectDetail(r); }}>
                               {avg2(dispAvg)}
                             </td>
                           );
                         })()}
                        {(() => {
                           const triPassed = getTriPassed(r, filters.tri);
                           const lbl = resultBadgeLabel(triPassed, r.student.niveau);
                           return (
                             <td className="px-3 py-3">
                               {triPassed === null
                                 ? <span className="text-muted-foreground text-xs">—</span>
                                 : triPassed
                                   ? <span className="text-xs font-bold px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">ناجح</span>
                                   : <span className={`text-xs font-bold px-2 py-1 rounded-full ${r.student.niveau === "4AM" ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" : "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"}`}>{lbl}</span>}
                             </td>
                           );
                         })()}
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-1">
                            <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0"
                                onClick={e => { e.stopPropagation(); setSelected(r); }}>
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                            </motion.div>
                            <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                                onClick={e => { e.stopPropagation(); void handleDeleteStudent(r.student.id); }}>
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </motion.div>
                          </div>
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {selected      && <GradeModal result={selected} annee={annee} onClose={() => setSelected(null)} onSaved={fetchResults} />}
      {subjectDetail && <SubjectBreakdownModal result={subjectDetail} onClose={() => setSubjectDetail(null)} />}
      {showImport    && <ImportModal annee={annee} onClose={() => setShowImport(false)} onDone={fetchResults} />}

    </motion.div>
  );
}