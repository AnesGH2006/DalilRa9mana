import { useState, useRef, useEffect, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  FileSpreadsheet, RotateCcw, Printer, BarChart3, TrendingUp,
  Award, Users, Target, Zap, BookOpen, ArrowUpRight, ArrowDownRight,
  ChevronUp, ChevronDown, Minus, Search, Filter, Clock, ChevronRight,
  LineChart, GraduationCap, CheckCircle2, XCircle, ArrowUpCircle,
  Repeat, ListChecks, UsersRound, CalendarRange, type LucideIcon,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  AreaChart, Area, ComposedChart, Line,
} from "recharts";

const BASE = import.meta.env.BASE_URL;

// ── Types ─────────────────────────────────────────────────────────────────────
interface BEMSubjectDef { key: string; arLabel: string; coef: number }
interface BEMStudent {
  name: string; gender: "male" | "female" | "unknown";
  scores: Record<string, number | null>;
  average: number | null; passed: boolean | null; rank: number;
  classGroup?: string; repeater?: boolean;
}
interface BEMSummary {
  total: number; withAvg: number; passCount: number; failCount: number;
  passRate: number; classAvg: number | null;
  first: BEMStudent | null; last: BEMStudent | null;
}
interface GenderStats {
  males: number; females: number; unknown: number;
  malePass: number; maleFail: number; femalePass: number; femaleFail: number;
  malePassRate: number; femalePassRate: number;
}
interface SubjectStat {
  key: string; arLabel: string; coef: number;
  avg: number | null; passCount: number; total: number; passRate: number;
}
interface ClassGroupStat {
  name: string; total: number; passCount: number; failCount: number;
  passRate: number; avg: number | null;
}
interface BEMResult {
  students: BEMStudent[]; summary: BEMSummary; genderStats: GenderStats;
  subjectStats: SubjectStat[]; scoreDistribution: { range: string; count: number }[];
  detectedSubjects: BEMSubjectDef[]; fileName: string;
  classGroups?: ClassGroupStat[];
  annualAvgComparison?: { name: string; bemAvg: number; annualAvg: number }[];
}

// ── Animations ────────────────────────────────────────────────────────────────
const fadeUp = { initial: { opacity: 0, y: 24 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -12 } };
const cardAnim = {
  initial: { opacity: 0, y: 20, scale: 0.96 },
  animate: { opacity: 1, y: 0, scale: 1, transition: { type: "spring" as const, stiffness: 260, damping: 22 } },
};

// ── Tooltip style ─────────────────────────────────────────────────────────────
const TT = {
  contentStyle: {
    background: "var(--background,#fff)", border: "1px solid var(--border,#e2e8f0)",
    borderRadius: "10px", fontSize: "12px", direction: "rtl" as const,
    boxShadow: "0 4px 20px rgba(0,0,0,0.08)", padding: "8px 12px",
  },
  cursor: { fill: "transparent" },
  wrapperStyle: { outline: "none" },
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function medalColor(r: number) {
  return r === 1 ? "text-amber-500" : r === 2 ? "text-slate-400" : r === 3 ? "text-orange-400" : "text-muted-foreground";
}
function medalEmoji(r: number) { return r === 1 ? "🥇" : r === 2 ? "🥈" : r === 3 ? "🥉" : null; }
function gradeLabel(avg: number) {
  if (avg >= 18) return { label: "ممتاز رفيع", cls: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300" };
  if (avg >= 16) return { label: "ممتاز",      cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" };
  if (avg >= 14) return { label: "جيد جداً",   cls: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300" };
  if (avg >= 12) return { label: "جيد",        cls: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300" };
  if (avg >= 10) return { label: "مقبول",      cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" };
  return              { label: "راسب",         cls: "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300" };
}

// ── Chart Card ────────────────────────────────────────────────────────────────
function CC({ title, icon, sub, children, delay = 0 }: {
  title: string; icon: React.ReactNode; sub?: string; children: React.ReactNode; delay?: number;
}) {
  return (
    <motion.div variants={cardAnim} initial="initial" animate="animate" transition={{ delay }}
      whileHover={{ y: -2, boxShadow: "0 8px 30px rgba(0,0,0,0.10)" }}
      className="rounded-2xl border bg-card shadow-sm overflow-hidden transition-shadow duration-300">
      <div className="px-5 py-3.5 border-b bg-gradient-to-r from-muted/40 to-transparent flex items-center gap-2.5">
        <span className="text-blue-500">{icon}</span>
        <div>
          <span className="text-sm font-semibold text-foreground">{title}</span>
          {sub && <span className="text-xs text-muted-foreground ms-2">{sub}</span>}
        </div>
      </div>
      <div className="p-4">{children}</div>
    </motion.div>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KPI({ label, value, sub, icon, colorBg, colorText, colorLight, delay = 0 }: {
  label: string; value: string | number; sub?: string;
  icon: React.ReactNode; colorBg: string; colorText: string; colorLight: string; delay?: number;
}) {
  return (
    <motion.div variants={cardAnim} initial="initial" animate="animate" transition={{ delay }}
      whileHover={{ y: -4, scale: 1.02 }}
      className={`rounded-2xl ${colorLight} border-0 p-4 relative overflow-hidden`}>
      <div className={`absolute -top-3 -end-3 w-16 h-16 rounded-full opacity-10 ${colorBg}`} />
      <div className="flex items-start gap-3 relative">
        <div className={`w-9 h-9 rounded-xl ${colorBg} flex items-center justify-center shrink-0`}>
          <span className={`text-sm ${colorText}`}>{icon}</span>
        </div>
        <div>
          <p className="text-xs text-muted-foreground font-medium mb-0.5">{label}</p>
          <p className={`text-2xl font-extrabold leading-none ${colorText}`}>{value}</p>
          {sub && <p className="text-[10px] text-muted-foreground mt-1">{sub}</p>}
        </div>
      </div>
    </motion.div>
  );
}

// ── Pie label ─────────────────────────────────────────────────────────────────
function REND_LABEL({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) {
  if (percent < 0.06) return null;
  const RADIAN = Math.PI / 180;
  const r = innerRadius + (outerRadius - innerRadius) * 0.55;
  const x = cx + r * Math.cos(-midAngle * RADIAN);
  const y = cy + r * Math.sin(-midAngle * RADIAN);
  return <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={700}>{(percent * 100).toFixed(0)}%</text>;
}

// ── Student Table (generic) ───────────────────────────────────────────────────
function StudentTable({ students, subjects, showRank = true, emptyMsg = "لا توجد بيانات", highlightFirst = false }: {
  students: BEMStudent[]; subjects: BEMSubjectDef[]; showRank?: boolean;
  emptyMsg?: string; highlightFirst?: boolean;
}) {
  const [search, setSearch] = useState("");
  const filtered = students.filter(s => s.name.includes(search));

  if (students.length === 0)
    return <div className="text-center py-16 text-muted-foreground">{emptyMsg}</div>;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 px-1">
        <Search className="w-4 h-4 text-muted-foreground shrink-0" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="بحث عن تلميذ..."
          className="flex-1 text-sm bg-transparent border-b border-border pb-1 outline-none placeholder:text-muted-foreground/60 focus:border-blue-500 transition-colors" />
        {search && <button onClick={() => setSearch("")} className="text-xs text-muted-foreground hover:text-foreground">✕</button>}
        <Badge variant="secondary" className="text-xs">{filtered.length}</Badge>
      </div>
      <div className="rounded-2xl border overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 sticky top-0">
              <tr>
                {showRank && <th className="px-3 py-3 text-center text-xs font-semibold text-muted-foreground">الرتبة</th>}
                <th className="px-3 py-3 text-start text-xs font-semibold text-muted-foreground">الاسم واللقب</th>
                <th className="px-3 py-3 text-center text-xs font-semibold text-muted-foreground">الجنس</th>
                {subjects.map(s => (
                  <th key={s.key} className="px-2 py-3 text-center text-xs font-semibold text-muted-foreground whitespace-nowrap">
                    {s.arLabel.split(" ")[0] ?? ""}
                  </th>
                ))}
                <th className="px-3 py-3 text-center text-xs font-semibold text-muted-foreground">المعدل</th>
                <th className="px-3 py-3 text-center text-xs font-semibold text-muted-foreground">النتيجة</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s, i) => (
                <motion.tr key={s.name + i}
                  initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: Math.min(i * 0.01, 0.35) }}
                  className={`border-t transition-colors hover:bg-muted/25 ${
                    highlightFirst && i === 0 ? "bg-amber-50/60 dark:bg-amber-950/10" : i % 2 === 0 ? "" : "bg-muted/5"}`}>
                  {showRank && (
                    <td className="px-3 py-2.5 text-center">
                      {s.rank > 0
                        ? <span className={`font-bold ${medalColor(s.rank)}`}>{medalEmoji(s.rank) ?? s.rank}</span>
                        : <span className="text-muted-foreground text-xs">—</span>}
                    </td>
                  )}
                  <td className="px-3 py-2.5 font-medium min-w-[140px]">{s.name}</td>
                  <td className="px-3 py-2.5 text-center">
                    {s.gender === "male" ? "🔵" : s.gender === "female" ? "🔴" : "⚪"}
                  </td>
                  {subjects.map(subj => {
                    const sc = s.scores[subj.key];
                    return (
                      <td key={subj.key} className={`px-2 py-2.5 text-center font-mono text-sm ${
                        sc === null ? "text-muted-foreground" :
                        sc >= 16 ? "text-emerald-600 font-bold" :
                        sc >= 10 ? "text-foreground" : "text-red-500"}`}>
                        {sc !== null ? sc.toFixed(1) : "—"}
                      </td>
                    );
                  })}
                  <td className={`px-3 py-2.5 text-center font-bold font-mono ${
                    s.average === null ? "text-muted-foreground" :
                    s.average >= 16 ? "text-emerald-600" :
                    s.average >= 10 ? "text-blue-600 dark:text-blue-400" : "text-red-500"}`}>
                    {s.average?.toFixed(2) ?? "—"}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    {s.passed === null ? <span className="text-muted-foreground text-xs">—</span>
                      : s.passed
                        ? <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">ناجح ✓</span>
                        : <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300">راسب ✗</span>}
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Charts Section ────────────────────────────────────────────────────────────
function ChartsSection({ result }: { result: BEMResult }) {
  const { summary, genderStats, subjectStats, scoreDistribution } = result;

  const passPie = [
    { name: "ناجح", value: summary.passCount, color: "#16a34a" },
    { name: "راسب", value: summary.failCount, color: "#ef4444" },
  ];
  const gradeDist = [
    { label: "18–20", count: result.students.filter(s => (s.average ?? 0) >= 18).length, color: "#7c3aed" },
    { label: "16–18", count: result.students.filter(s => (s.average ?? 0) >= 16 && (s.average ?? 0) < 18).length, color: "#2563eb" },
    { label: "14–16", count: result.students.filter(s => (s.average ?? 0) >= 14 && (s.average ?? 0) < 16).length, color: "#0891b2" },
    { label: "12–14", count: result.students.filter(s => (s.average ?? 0) >= 12 && (s.average ?? 0) < 14).length, color: "#059669" },
    { label: "10–12", count: result.students.filter(s => (s.average ?? 0) >= 10 && (s.average ?? 0) < 12).length, color: "#d97706" },
    { label: "< 10",  count: result.students.filter(s => (s.average ?? 0) < 10).length, color: "#ef4444" },
  ];
  const genderBar = [
    { g: "ذكور",  ناجح: genderStats.malePass,  راسب: genderStats.maleFail },
    { g: "إناث", ناجح: genderStats.femalePass, راسب: genderStats.femaleFail },
  ];
  const genderPie = [
    { name: "ذكور",  value: genderStats.males,   color: "#3b82f6" },
    { name: "إناث", value: genderStats.females,  color: "#ec4899" },
    ...(genderStats.unknown > 0 ? [{ name: "غير محدد", value: genderStats.unknown, color: "#94a3b8" }] : []),
  ];
  const subAvg = [...subjectStats].sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0)).map(s => ({
    name: s.arLabel.replace("اللغة ","").replace("التربية ","ت.").replace("العلوم ","علوم ").replace("والجغرافيا","").trim(),
    full: s.arLabel, avg: s.avg ?? 0,
    fill: (s.avg ?? 0) >= 14 ? "#16a34a" : (s.avg ?? 0) >= 10 ? "#3b82f6" : "#ef4444",
  }));
  const subRate = [...subjectStats].sort((a, b) => b.passRate - a.passRate).map(s => ({
    name: s.arLabel.replace("اللغة ","").replace("التربية ","ت.").replace("العلوم ","علوم ").replace("والجغرافيا","").trim(),
    full: s.arLabel, rate: s.passRate,
    fill: s.passRate >= 70 ? "#16a34a" : s.passRate >= 50 ? "#d97706" : "#ef4444",
  }));
  const hist = scoreDistribution.map(d => ({ avg: parseInt(d.range), count: d.count }));
  const top1 = result.students.find(s => s.rank === 1);
  const radarData = subjectStats.slice(0, 8).map(s => ({
    sub: s.arLabel.split(" ").slice(-1)[0] ?? s.arLabel,
    class: s.avg ?? 0,
    top: top1 ? (top1.scores[s.key] ?? 0) : 0,
  }));
  const coefData = subjectStats.map(s => ({
    name: s.arLabel.replace("اللغة ","").replace("التربية ","ت.").trim().split(" ")[0],
    full: s.arLabel, coef: s.coef,
    weighted: parseFloat(((s.avg ?? 0) * s.coef / 25 * 20).toFixed(2)),
  })).sort((a, b) => b.weighted - a.weighted);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <CC title="نسبة النجاح والرسوب" icon={<Target className="w-4 h-4" />} delay={0}>
          <ResponsiveContainer width="100%" height={230}>
            <PieChart>
              <Pie data={passPie} cx="50%" cy="48%" innerRadius={62} outerRadius={95}
                paddingAngle={4} dataKey="value" labelLine={false} label={REND_LABEL}>
                {passPie.map((d, i) => <Cell key={i} fill={d.color} stroke="none" />)}
              </Pie>
              <Tooltip {...TT} formatter={(v: number, n: string) => [v + " تلميذ", n]} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex justify-center gap-5 mt-1">
            {passPie.map(d => (
              <div key={d.name} className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full" style={{ background: d.color }} />
                <span className="text-xs text-muted-foreground">{d.name}<strong className="text-foreground ms-1">{d.value}</strong></span>
              </div>
            ))}
          </div>
        </CC>
        <CC title="توزيع الجنس" icon={<Users className="w-4 h-4" />} delay={0.05}>
          <ResponsiveContainer width="100%" height={230}>
            <PieChart>
              <Pie data={genderPie} cx="50%" cy="48%" innerRadius={62} outerRadius={95}
                paddingAngle={4} dataKey="value" labelLine={false} label={REND_LABEL}>
                {genderPie.map((d, i) => <Cell key={i} fill={d.color} stroke="none" />)}
              </Pie>
              <Tooltip {...TT} formatter={(v: number, n: string) => [v + " تلميذ", n]} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex justify-center gap-5 mt-1">
            {genderPie.map(d => (
              <div key={d.name} className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full" style={{ background: d.color }} />
                <span className="text-xs text-muted-foreground">{d.name}<strong className="text-foreground ms-1">{d.value}</strong></span>
              </div>
            ))}
          </div>
        </CC>
      </div>

      <CC title="توزيع التقديرات" icon={<BarChart3 className="w-4 h-4" />} delay={0.08}>
        <ResponsiveContainer width="100%" height={190}>
          <BarChart data={gradeDist} barCategoryGap="22%">
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border,#e2e8f0)" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis allowDecimals={false} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
            <Tooltip {...TT} formatter={(v: number) => [v + " تلميذ", "العدد"]} />
            <Bar dataKey="count" radius={[6, 6, 0, 0]}>
              {gradeDist.map((d, i) => <Cell key={i} fill={d.color} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CC>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <CC title="النجاح والرسوب حسب الجنس" icon={<Users className="w-4 h-4" />} delay={0.1}>
          <ResponsiveContainer width="100%" height={195}>
            <BarChart data={genderBar} barCategoryGap="35%" barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border,#e2e8f0)" vertical={false} />
              <XAxis dataKey="g" tick={{ fontSize: 13, fontWeight: 600 }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip {...TT} formatter={(v: number, n: string) => [v + " تلميذ", n]} />
              <Legend iconType="circle" iconSize={8}
                formatter={v => <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>{v}</span>} />
              <Bar dataKey="ناجح" fill="#16a34a" radius={[5, 5, 0, 0]} />
              <Bar dataKey="راسب" fill="#ef4444" radius={[5, 5, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div className="flex items-center justify-between rounded-xl bg-blue-50 dark:bg-blue-950/30 px-3 py-2">
              <span className="text-xs text-blue-600 dark:text-blue-400">نجاح الذكور</span>
              <span className="text-sm font-bold text-blue-700 dark:text-blue-300">{genderStats.malePassRate}%</span>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-pink-50 dark:bg-pink-950/30 px-3 py-2">
              <span className="text-xs text-pink-600 dark:text-pink-400">نجاح الإناث</span>
              <span className="text-sm font-bold text-pink-700 dark:text-pink-300">{genderStats.femalePassRate}%</span>
            </div>
          </div>
        </CC>

        <CC title="منحنى توزيع المعدلات" icon={<TrendingUp className="w-4 h-4" />} delay={0.13}>
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={hist}>
              <defs>
                <linearGradient id="grad1" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border,#e2e8f0)" vertical={false} />
              <XAxis dataKey="avg" tick={{ fontSize: 10 }} axisLine={false} tickLine={false}
                tickFormatter={v => v % 2 === 0 ? `${v}` : ""} />
              <YAxis allowDecimals={false} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip {...TT} formatter={(v: number) => [v, "تلميذ"]} labelFormatter={l => `المعدل ${l}–${Number(l)+1}`} />
              <Area type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2.5}
                fill="url(#grad1)"
                dot={{ r: 3, fill: "#3b82f6", stroke: "white", strokeWidth: 1.5 }}
                activeDot={{ r: 6, fill: "#3b82f6", stroke: "white", strokeWidth: 2 }} />
            </ComposedChart>
          </ResponsiveContainer>
          <p className="text-xs text-muted-foreground text-center mt-1">النجاح ≥ 10/20</p>
        </CC>
      </div>

      <CC title="متوسط نقاط كل مادة" icon={<Award className="w-4 h-4" />} delay={0.15}>
        <ResponsiveContainer width="100%" height={Math.max(220, subAvg.length * 34)}>
          <BarChart data={subAvg} layout="vertical" barCategoryGap="20%">
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border,#e2e8f0)" horizontal={false} />
            <XAxis type="number" domain={[0, 20]} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={85} />
            <Tooltip {...TT} formatter={(v: number) => [`${v.toFixed(2)}/20`, "المتوسط"]}
              labelFormatter={l => subAvg.find(s => s.name === l)?.full ?? l} />
            <Bar dataKey="avg" radius={[0, 6, 6, 0]}>
              {subAvg.map((d, i) => <Cell key={i} fill={d.fill} fillOpacity={0.9} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div className="flex justify-center gap-4 mt-2 text-xs">
          {[{ l: "≥14 ممتاز", c: "#16a34a" }, { l: "10–14 مقبول", c: "#3b82f6" }, { l: "<10 ضعيف", c: "#ef4444" }].map(d => (
            <div key={d.l} className="flex items-center gap-1">
              <div className="w-2.5 h-2.5 rounded-sm" style={{ background: d.c }} />
              <span className="text-muted-foreground">{d.l}</span>
            </div>
          ))}
        </div>
      </CC>

      <CC title="نسبة النجاح في كل مادة" icon={<Zap className="w-4 h-4" />} delay={0.18}>
        <ResponsiveContainer width="100%" height={Math.max(220, subRate.length * 34)}>
          <BarChart data={subRate} layout="vertical" barCategoryGap="20%">
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border,#e2e8f0)" horizontal={false} />
            <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} axisLine={false} tickLine={false}
              tickFormatter={v => `${v}%`} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={85} />
            <Tooltip {...TT} formatter={(v: number) => [`${v.toFixed(1)}%`, "نسبة النجاح"]}
              labelFormatter={l => subRate.find(s => s.name === l)?.full ?? l} />
            <Bar dataKey="rate" radius={[0, 6, 6, 0]}>
              {subRate.map((d, i) => <Cell key={i} fill={d.fill} fillOpacity={0.9} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CC>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <CC title="الأول مقابل متوسط القسم" icon={<Award className="w-4 h-4" />}
          sub={top1 ? `— ${top1.name} (${top1.average?.toFixed(2)})` : ""} delay={0.2}>
          <ResponsiveContainer width="100%" height={260}>
            <RadarChart data={radarData} cx="50%" cy="50%" outerRadius={88}>
              <PolarGrid stroke="var(--border,#e2e8f0)" />
              <PolarAngleAxis dataKey="sub" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
              <PolarRadiusAxis domain={[0, 20]} tick={{ fontSize: 8 }} tickCount={5} />
              <Radar name="متوسط القسم" dataKey="class" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.12} strokeWidth={2} />
              <Radar name="الأول" dataKey="top" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.18} strokeWidth={2} />
              <Legend iconSize={8} formatter={v => <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{v}</span>} />
              <Tooltip {...TT} formatter={(v: number) => [`${v}/20`]} />
            </RadarChart>
          </ResponsiveContainer>
        </CC>

        <CC title="مساهمة كل مادة في المعدل النهائي" icon={<BarChart3 className="w-4 h-4" />} delay={0.22}>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={coefData} barCategoryGap="22%">
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border,#e2e8f0)" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip {...TT}
                formatter={(v: number, _n: string, p: any) => [`${v.toFixed(2)} (معامل ×${p.payload?.coef})`, p.payload?.full]} />
              <Bar dataKey="weighted" fill="#6366f1" radius={[5, 5, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <p className="text-xs text-muted-foreground text-center mt-1">كلما ارتفع العمود كلما أثّرت المادة أكثر في المعدل</p>
        </CC>
      </div>
    </div>
  );
}

// ── Subject Analysis Tab ──────────────────────────────────────────────────────
function SubjectAnalysis({ result }: { result: BEMResult }) {
  const [sortBy, setSortBy] = useState<"avg" | "pass" | "coef">("avg");
  const sorted = [...result.subjectStats].sort((a, b) =>
    sortBy === "avg" ? (b.avg ?? 0) - (a.avg ?? 0) :
    sortBy === "pass" ? b.passRate - a.passRate :
    b.coef - a.coef
  );

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {([["avg", "الأعلى معدلاً"], ["pass", "الأعلى نجاحاً"], ["coef", "حسب المعامل"]] as [typeof sortBy, string][]).map(([v, label]) => (
          <button key={v} onClick={() => setSortBy(v)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              sortBy === v ? "bg-blue-600 text-white border-blue-600" : "border-border hover:border-blue-400 text-muted-foreground"}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {sorted.map((s, i) => {
          const gl = s.avg !== null ? gradeLabel(s.avg) : null;
          return (
            <motion.div key={s.key}
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className="rounded-2xl border p-4 space-y-3 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-blue-500/10 flex items-center justify-center">
                    <BookOpen className="w-4 h-4 text-blue-500" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{s.arLabel}</p>
                    <p className="text-xs text-muted-foreground">معامل ×{s.coef}</p>
                  </div>
                </div>
                <div className="text-end">
                  <p className={`text-xl font-extrabold font-mono ${
                    (s.avg ?? 0) >= 14 ? "text-emerald-600" : (s.avg ?? 0) >= 10 ? "text-blue-600" : "text-red-500"}`}>
                    {s.avg?.toFixed(2) ?? "—"}
                  </p>
                  <p className="text-xs text-muted-foreground">/20</p>
                </div>
              </div>
              {gl && (
                <div className="flex items-center justify-between">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${gl.cls}`}>{gl.label}</span>
                  <span className="text-xs text-muted-foreground">{s.passCount}/{s.total} ناجح</span>
                </div>
              )}
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>نسبة النجاح</span>
                  <span className="font-semibold">{s.passRate.toFixed(1)}%</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <motion.div
                    className={`h-full rounded-full ${s.passRate >= 70 ? "bg-emerald-500" : s.passRate >= 50 ? "bg-amber-500" : "bg-red-400"}`}
                    initial={{ width: 0 }} animate={{ width: `${s.passRate}%` }}
                    transition={{ delay: i * 0.04 + 0.3, duration: 0.7, ease: "easeOut" }} />
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Best / Worst */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
        <div className="rounded-2xl border p-4 bg-emerald-50/50 dark:bg-emerald-950/10">
          <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400 mb-3 flex items-center gap-1.5">
            <ArrowUpRight className="w-3.5 h-3.5" /> أفضل 3 مواد
          </p>
          <div className="space-y-2">
            {[...result.subjectStats].sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0)).slice(0, 3).map((s, i) => (
              <div key={s.key} className="flex items-center justify-between">
                <span className="text-sm">{["🥇","🥈","🥉"][i]} {s.arLabel}</span>
                <span className="font-mono font-bold text-emerald-600">{s.avg?.toFixed(2)}/20</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border p-4 bg-red-50/50 dark:bg-red-950/10">
          <p className="text-xs font-bold text-red-600 dark:text-red-400 mb-3 flex items-center gap-1.5">
            <ArrowDownRight className="w-3.5 h-3.5" /> أضعف 3 مواد
          </p>
          <div className="space-y-2">
            {[...result.subjectStats].sort((a, b) => (a.avg ?? 0) - (b.avg ?? 0)).slice(0, 3).map((s, i) => (
              <div key={s.key} className="flex items-center justify-between">
                <span className="text-sm">{["🔴","🟠","🟡"][i]} {s.arLabel}</span>
                <span className="font-mono font-bold text-red-500">{s.avg?.toFixed(2)}/20</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Class Groups Tab ──────────────────────────────────────────────────────────
function ClassGroupsTab({ result }: { result: BEMResult }) {
  const groups = result.classGroups;
  if (!groups || groups.length === 0) {
    // Build from students if no classGroups provided
    const map = new Map<string, BEMStudent[]>();
    result.students.forEach(s => {
      const g = s.classGroup ?? "غير محدد";
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(s);
    });
    const built: ClassGroupStat[] = Array.from(map.entries()).map(([name, stds]) => {
      const withAvg = stds.filter(s => s.average !== null);
      return {
        name, total: stds.length,
        passCount: stds.filter(s => s.passed).length,
        failCount: stds.filter(s => s.passed === false).length,
        passRate: stds.length ? Math.round(stds.filter(s => s.passed).length / stds.length * 100) : 0,
        avg: withAvg.length ? parseFloat((withAvg.reduce((a, s) => a + (s.average ?? 0), 0) / withAvg.length).toFixed(2)) : null,
      };
    });
    return <ClassGroupsDisplay groups={built} result={result} />;
  }
  return <ClassGroupsDisplay groups={groups} result={result} />;
}

function ClassGroupsDisplay({ groups, result }: { groups: ClassGroupStat[]; result: BEMResult }) {
  const [selected, setSelected] = useState<string | null>(null);
  const chartData = groups.map(g => ({ name: g.name, ناجح: g.passCount, راسب: g.failCount, معدل: g.avg ?? 0 }));

  return (
    <div className="space-y-4">
      <CC title="مقارنة الأفواج" icon={<Users className="w-4 h-4" />}>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} barCategoryGap="30%" barGap={3}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border,#e2e8f0)" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis allowDecimals={false} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
            <Tooltip {...TT} formatter={(v: number, n: string) => [n === "معدل" ? `${v}/20` : `${v} تلميذ`, n]} />
            <Legend iconType="circle" iconSize={8}
              formatter={v => <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>{v}</span>} />
            <Bar dataKey="ناجح" fill="#16a34a" radius={[4, 4, 0, 0]} />
            <Bar dataKey="راسب" fill="#ef4444" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CC>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {groups.map((g, i) => (
          <motion.button key={g.name}
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            onClick={() => setSelected(selected === g.name ? null : g.name)}
            className={`rounded-2xl border p-4 text-start transition-all hover:shadow-md ${
              selected === g.name ? "border-blue-500 bg-blue-50/50 dark:bg-blue-950/20" : ""}`}>
            <div className="flex items-center justify-between mb-3">
              <span className="font-bold text-sm">{g.name}</span>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                g.passRate >= 70 ? "bg-emerald-100 text-emerald-700" :
                g.passRate >= 50 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-600"}`}>
                {g.passRate}%
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center mb-3">
              <div>
                <p className="text-lg font-extrabold text-foreground">{g.total}</p>
                <p className="text-[10px] text-muted-foreground">إجمالي</p>
              </div>
              <div>
                <p className="text-lg font-extrabold text-emerald-600">{g.passCount}</p>
                <p className="text-[10px] text-muted-foreground">ناجح</p>
              </div>
              <div>
                <p className="text-lg font-extrabold text-blue-600">{g.avg?.toFixed(1) ?? "—"}</p>
                <p className="text-[10px] text-muted-foreground">المعدل</p>
              </div>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <motion.div className={`h-full rounded-full ${
                g.passRate >= 70 ? "bg-emerald-500" : g.passRate >= 50 ? "bg-amber-500" : "bg-red-400"}`}
                initial={{ width: 0 }} animate={{ width: `${g.passRate}%` }}
                transition={{ delay: i * 0.05 + 0.3, duration: 0.6 }} />
            </div>
          </motion.button>
        ))}
      </div>

      {/* Students of selected group */}
      <AnimatePresence>
        {selected && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <StudentTable
              students={result.students.filter(s => (s.classGroup ?? "غير محدد") === selected)}
              subjects={result.detectedSubjects}
              emptyMsg={`لا يوجد تلاميذ في فوج ${selected}`}
              highlightFirst />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Annual Comparison Tab ─────────────────────────────────────────────────────
function AnnualComparisonTab({ result }: { result: BEMResult }) {
  const data = result.annualAvgComparison;
  if (!data || data.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed p-12 text-center text-muted-foreground space-y-2">
        <TrendingUp className="w-10 h-10 mx-auto opacity-30" />
        <p className="font-medium">لا توجد بيانات المعدل السنوي</p>
        <p className="text-sm">تأكد من أن الملف يحتوي على معدلات السنة الدراسية</p>
      </div>
    );
  }

  const sorted = [...data].sort((a, b) => (b.bemAvg - b.annualAvg) - (a.bemAvg - a.annualAvg));

  return (
    <div className="space-y-4">
      <CC title="مقارنة معدل BEM مع المعدل السنوي" icon={<TrendingUp className="w-4 h-4" />}>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data.slice(0, 20)} barCategoryGap="25%">
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 9 }} axisLine={false} tickLine={false}
              tickFormatter={n => n.split(" ").slice(-1)[0] ?? n} />
            <YAxis domain={[0, 20]} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
            <Tooltip {...TT} formatter={(v: number, n: string) => [`${v.toFixed(2)}/20`, n]} />
            <Legend iconType="circle" iconSize={8}
              formatter={v => <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{v}</span>} />
            <Bar dataKey="bemAvg" name="معدل BEM" fill="#6366f1" radius={[4, 4, 0, 0]} />
            <Bar dataKey="annualAvg" name="المعدل السنوي" fill="#f59e0b" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CC>

      <div className="rounded-2xl border overflow-hidden">
        <div className="px-4 py-3 border-b bg-muted/30 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-blue-500" />
          <span className="text-sm font-semibold">مقارنة فردية — التحسن والتراجع</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/20">
              <tr>
                {["الاسم","المعدل السنوي","معدل BEM","الفرق","الاتجاه"].map(h => (
                  <th key={h} className="px-3 py-2.5 text-center text-xs font-semibold text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((d, i) => {
                const diff = parseFloat((d.bemAvg - d.annualAvg).toFixed(2));
                const Icon = diff > 0.5 ? ChevronUp : diff < -0.5 ? ChevronDown : Minus;
                const diffColor = diff > 0.5 ? "text-emerald-600" : diff < -0.5 ? "text-red-500" : "text-muted-foreground";
                return (
                  <motion.tr key={d.name + i}
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    transition={{ delay: Math.min(i * 0.01, 0.3) }}
                    className="border-t hover:bg-muted/20">
                    <td className="px-3 py-2 font-medium">{d.name}</td>
                    <td className="px-3 py-2 text-center font-mono text-amber-600 font-bold">{d.annualAvg.toFixed(2)}</td>
                    <td className="px-3 py-2 text-center font-mono text-indigo-600 font-bold">{d.bemAvg.toFixed(2)}</td>
                    <td className={`px-3 py-2 text-center font-mono font-bold ${diffColor}`}>
                      {diff > 0 ? "+" : ""}{diff.toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <Icon className={`w-4 h-4 mx-auto ${diffColor}`} />
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Spotlight card ────────────────────────────────────────────────────────────
function SpotlightCard({ student, subjects, variant, delay }: {
  student: BEMStudent; subjects: BEMSubjectDef[]; variant: "first" | "last"; delay: number;
}) {
  const isFirst = variant === "first";
  const g = isFirst
    ? "from-amber-50 via-yellow-50/60 to-orange-50/30 dark:from-amber-950/40 dark:via-yellow-950/20 dark:to-orange-950/10 border-amber-200 dark:border-amber-800"
    : "from-slate-50 to-zinc-50/50 dark:from-slate-900/50 dark:to-zinc-900/30 border-slate-200 dark:border-slate-700";
  return (
    <motion.div
      initial={{ opacity: 0, y: 28, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay, type: "spring", stiffness: 220, damping: 20 }}
      whileHover={{ y: -5, boxShadow: "0 12px 40px rgba(0,0,0,0.12)" }}
      className={`rounded-2xl border p-5 relative overflow-hidden shadow-md bg-gradient-to-br ${g}`}>
      <div className={`absolute -top-8 -end-8 w-28 h-28 rounded-full opacity-10 ${isFirst ? "bg-amber-400" : "bg-slate-400"}`} />
      <div className="relative">
        <div className="flex items-center gap-3 mb-4">
          <motion.div
            className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shadow-lg ${
              isFirst ? "bg-gradient-to-br from-amber-400 to-orange-400" : "bg-gradient-to-br from-slate-300 to-slate-400 dark:from-slate-600 dark:to-slate-700"}`}
            animate={isFirst ? { scale: [1, 1.07, 1], rotate: [0, 3, -3, 0] } : {}}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}>
            {isFirst ? "🥇" : "🔻"}
          </motion.div>
          <div className="flex-1 min-w-0">
            <p className={`text-[10px] font-bold uppercase tracking-widest mb-0.5 ${isFirst ? "text-amber-600 dark:text-amber-400" : "text-slate-500"}`}>
              {isFirst ? "المتفوق الأول" : "الأخير في الترتيب"}
            </p>
            <p className="font-bold text-foreground truncate">{student.name}</p>
            <p className="text-xs text-muted-foreground">
              {student.gender === "male" ? "🔵 ذكر" : student.gender === "female" ? "🔴 أنثى" : ""}
              {student.average && ` · ${gradeLabel(student.average).label}`}
            </p>
          </div>
          <div className="text-end shrink-0">
            <p className={`text-3xl font-extrabold tabular-nums ${isFirst ? "text-amber-600 dark:text-amber-400" : "text-slate-500 dark:text-slate-400"}`}>
              {student.average?.toFixed(2) ?? "—"}
            </p>
            <p className="text-xs text-muted-foreground">/20</p>
          </div>
        </div>
        <div className="grid grid-cols-5 gap-1.5">
          {subjects.map((s, i) => {
            const sc = student.scores[s.key];
            return (
              <motion.div key={s.key}
                initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: delay + i * 0.03, type: "spring", stiffness: 300 }}
                className={`rounded-xl p-1.5 text-center border ${
                  sc === null ? "bg-muted/30 border-transparent" :
                  sc >= 16 ? "bg-emerald-100 border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-800" :
                  sc >= 10 ? "bg-blue-50 border-blue-100 dark:bg-blue-950/30 dark:border-blue-800" :
                  "bg-red-50 border-red-100 dark:bg-red-950/30 dark:border-red-800"}`}>
                <p className={`text-xs font-bold ${
                  sc === null ? "text-muted-foreground" :
                  sc >= 16 ? "text-emerald-700 dark:text-emerald-300" :
                  sc >= 10 ? "text-blue-700 dark:text-blue-300" : "text-red-600 dark:text-red-400"}`}>
                  {sc !== null ? sc.toFixed(1) : "—"}
                </p>
                <p className="text-[8px] text-muted-foreground leading-tight mt-0.5 truncate">
                  {s.arLabel.replace("اللغة ","").replace("التربية ","").split(" ")[0]}
                </p>
              </motion.div>
            );
          })}
        </div>
        {student.average && (
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-muted-foreground">المستوى</span>
              <span className={`font-bold px-2 py-0.5 rounded-full text-[10px] ${gradeLabel(student.average).cls}`}>
                {gradeLabel(student.average).label}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <motion.div
                className={`h-full rounded-full ${isFirst ? "bg-gradient-to-r from-amber-400 to-orange-500" : "bg-slate-400"}`}
                initial={{ width: 0 }} animate={{ width: `${(student.average / 20) * 100}%` }}
                transition={{ delay: delay + 0.4, duration: 0.8, ease: "easeOut" }} />
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ── Upload Zone ───────────────────────────────────────────────────────────────
function UploadZone({ onResult }: { onResult: (r: BEMResult) => void }) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [loading, setLoading] = useState(false);

  const doUpload = async (file: File) => {
    setLoading(true);
    const form = new FormData();
    form.append("file", file);
    try {
      const res  = await fetch(`${BASE}api/bem/analyze`, { method: "POST", body: form, credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error");
      onResult(data);
    } catch (e: any) {
      toast({ variant: "destructive", title: "خطأ في التحليل", description: e.message });
    } finally {
      setLoading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 240, damping: 22 }}
      className={`border-2 border-dashed rounded-2xl p-14 text-center cursor-pointer transition-all duration-300
        ${drag ? "border-violet-500 bg-violet-50/80 dark:bg-violet-950/20 scale-[1.015]"
               : "border-muted-foreground/20 hover:border-violet-400 hover:bg-muted/20"}`}
      onDragOver={e => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={e => {
        e.preventDefault(); setDrag(false);
        const f = e.dataTransfer.files[0];
        if (f && /\.(xlsx|xls)$/i.test(f.name)) doUpload(f);
        else toast({ variant: "destructive", title: "يجب أن يكون الملف بصيغة .xlsx أو .xls" });
      }}
      onClick={() => fileRef.current?.click()}>
      <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) doUpload(f); }} />
      <motion.div
        animate={loading ? { rotate: 360 } : drag ? { scale: 1.15, rotate: -5 } : { y: [0, -8, 0] }}
        transition={loading
          ? { duration: 0.8, repeat: Infinity, ease: "linear" }
          : drag ? { type: "spring", stiffness: 300 }
          : { duration: 2.8, repeat: Infinity, ease: "easeInOut" }}>
        {loading ? (
          <div className="w-16 h-16 border-4 border-violet-500 border-t-transparent rounded-full mx-auto mb-4" />
        ) : (
          <div className={`w-16 h-16 rounded-2xl ${drag ? "bg-violet-500" : "bg-violet-500/10"} flex items-center justify-center mx-auto mb-4 transition-colors duration-200`}>
            <FileSpreadsheet className={`w-8 h-8 ${drag ? "text-white" : "text-violet-500"}`} />
          </div>
        )}
      </motion.div>
      <p className="text-lg font-semibold text-foreground mb-1">
        {loading ? "جارٍ تحليل ملف BEM..." : "أسقط ملف نتائج BEM هنا"}
      </p>
      <p className="text-sm text-muted-foreground">
        {loading ? "يرجى الانتظار" : "أو انقر للاختيار — .xlsx / .xls"}
      </p>
    </motion.div>
  );
}

// ── Tab definitions ───────────────────────────────────────────────────────────
type TabId =
  | "overview"      // تحليل عام
  | "subjects"      // تحليل المواد
  | "passed"        // الناجحون بالشهادة
  | "failed"        // الراسبون في الشهادة
  | "transfer"      // الناجحون بالانتقال
  | "repeaters"     // نتائج المعيدين
  | "fail_list"     // قائمة الراسبين
  | "mentors"       // قائمة الموجهين
  | "charts"        // الرسوم البيانية
  | "class_groups"  // مقارنة الأفواج
  | "annual";       // مقارنة مع المعدل السنوي

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: "overview",     label: "تحليل عام",              icon: "📊" },
  { id: "charts",       label: "الرسوم البيانية",        icon: "📈" },
  { id: "subjects",     label: "تحليل المواد",           icon: "📚" },
  { id: "mentors",      label: "قائمة الموجهين",         icon: "🎓" },
  { id: "passed",       label: "الناجحون بالشهادة",      icon: "✅" },
  { id: "failed",       label: "الراسبون في الشهادة",    icon: "❌" },
  { id: "transfer",     label: "الناجحون بالانتقال",     icon: "⬆️" },
  { id: "repeaters",    label: "نتائج المعيدين",         icon: "🔁" },
  { id: "fail_list",    label: "قائمة الراسبين",         icon: "📋" },
  { id: "class_groups", label: "مقارنة الأفواج",         icon: "👥" },
  { id: "annual",       label: "مقارنة مع المعدل السنوي", icon: "📅" },
];

// ── Overview Tab ──────────────────────────────────────────────────────────────
function OverviewTab({ result }: { result: BEMResult }) {
  return (
    <div className="space-y-4">
      {(result.summary.first || result.summary.last) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {result.summary.first && (
            <SpotlightCard student={result.summary.first} subjects={result.detectedSubjects} variant="first" delay={0.05} />
          )}
          {result.summary.last && result.summary.last.name !== result.summary.first?.name && (
            <SpotlightCard student={result.summary.last} subjects={result.detectedSubjects} variant="last" delay={0.1} />
          )}
        </div>
      )}
      <motion.div variants={cardAnim} initial="initial" animate="animate" transition={{ delay: 0.15 }}
        className="rounded-2xl border overflow-hidden shadow-sm">
        <div className="px-5 py-3 border-b bg-gradient-to-r from-muted/40 to-transparent flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-blue-500" />
          <span className="text-sm font-semibold">ملخص المواد</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/30">
              <tr>{["المادة","المعامل","المتوسط","ناجح","نسبة النجاح"].map(h => (
                <th key={h} className="px-3 py-2.5 text-right font-semibold text-muted-foreground">{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {result.subjectStats.map((s, i) => (
                <motion.tr key={s.key}
                  initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.18 + i * 0.03 }}
                  className={`border-t hover:bg-muted/20 transition-colors ${i % 2 === 1 ? "bg-muted/10" : ""}`}>
                  <td className="px-3 py-2.5 font-medium">{s.arLabel}</td>
                  <td className="px-3 py-2.5 text-center text-muted-foreground">×{s.coef}</td>
                  <td className={`px-3 py-2.5 text-center font-bold font-mono ${(s.avg ?? 0) >= 14 ? "text-emerald-600" : (s.avg ?? 0) >= 10 ? "text-blue-600" : "text-red-500"}`}>
                    {s.avg?.toFixed(2) ?? "—"}
                  </td>
                  <td className="px-3 py-2.5 text-center text-emerald-600 font-semibold">{s.passCount}/{s.total}</td>
                  <td className="px-3 py-2.5 min-w-[120px]">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 bg-muted rounded-full overflow-hidden">
                        <motion.div
                          className={`h-full rounded-full ${s.passRate >= 70 ? "bg-emerald-500" : s.passRate >= 50 ? "bg-amber-500" : "bg-red-400"}`}
                          initial={{ width: 0 }} animate={{ width: `${s.passRate}%` }}
                          transition={{ delay: 0.3 + i * 0.04, duration: 0.7, ease: "easeOut" }} />
                      </div>
                      <span className="text-muted-foreground w-9 text-right tabular-nums">{s.passRate.toFixed(0)}%</span>
                    </div>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  );
}

// ── Mentors Tab ───────────────────────────────────────────────────────────────
function MentorsTab({ result }: { result: BEMResult }) {
  const passed = result.students.filter(s => s.passed);
  const top10 = passed.slice(0, 10);
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border p-5 bg-gradient-to-br from-amber-50/60 to-orange-50/30 dark:from-amber-950/20 dark:to-transparent">
        <p className="text-sm font-bold mb-4 flex items-center gap-2">🏆 أعلى 10 متفوقين</p>
        <div className="space-y-2">
          {top10.map((s, i) => {
            const gl = s.average !== null ? gradeLabel(s.average) : null;
            return (
              <motion.div key={s.name}
                initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 }}
                className="flex items-center gap-3 bg-white/70 dark:bg-white/5 rounded-xl px-3 py-2.5 border">
                <span className={`text-lg font-black w-8 text-center ${medalColor(s.rank)}`}>
                  {medalEmoji(s.rank) ?? <span className="text-sm">{s.rank}</span>}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">{s.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {s.gender === "male" ? "ذكر" : s.gender === "female" ? "أنثى" : ""}
                    {s.classGroup ? ` · ${s.classGroup}` : ""}
                  </p>
                </div>
                {gl && <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${gl.cls}`}>{gl.label}</span>}
                <span className={`font-extrabold font-mono text-lg ${
                  (s.average ?? 0) >= 16 ? "text-emerald-600" : "text-blue-600"}`}>
                  {s.average?.toFixed(2)}
                </span>
              </motion.div>
            );
          })}
        </div>
      </div>
      <StudentTable students={passed} subjects={result.detectedSubjects} emptyMsg="لا يوجد ناجحون" highlightFirst />
    </div>
  );
}

// ── Saved-sessions sidebar card ───────────────────────────────────────────────
interface SessionMeta { id: string; fileName: string; label: string | null; createdAt: string }

function SavedSessions({ onLoad }: { onLoad: (r: BEMResult) => void }) {
  const { toast } = useToast();
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [fetching, setFetching] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${BASE}api/bem/sessions`, { credentials: "include" })
      .then(r => r.ok ? r.json() : [])
      .then(setSessions)
      .catch(() => setSessions([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return null;
  if (sessions.length === 0) return null;

  const handleLoad = async (id: string) => {
    setFetching(id);
    try {
      const res = await fetch(`${BASE}api/bem/sessions/${id}`, { credentials: "include" });
      if (!res.ok) throw new Error("فشل تحميل الجلسة");
      const data = await res.json();
      onLoad(data);
    } catch (e: any) {
      toast({ variant: "destructive", title: "خطأ", description: e.message });
    } finally { setFetching(null); }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
      className="rounded-2xl border bg-card shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b bg-gradient-to-r from-muted/50 to-transparent flex items-center gap-2">
        <Clock className="w-4 h-4 text-violet-500" />
        <span className="text-sm font-semibold">الجلسات المحفوظة</span>
        <Badge variant="secondary" className="ms-auto text-[10px]">{sessions.length}</Badge>
      </div>
      <div className="divide-y max-h-52 overflow-y-auto">
        {sessions.map(s => (
          <motion.button key={s.id} whileHover={{ backgroundColor: "rgba(99,102,241,0.06)" }}
            onClick={() => handleLoad(s.id)} disabled={fetching === s.id}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-start transition-colors"
            data-testid={`button-load-bem-session-${s.id}`}>
            <FileSpreadsheet className="w-4 h-4 text-violet-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold truncate">{s.label || s.fileName}</p>
              <p className="text-[10px] text-muted-foreground">
                {new Date(s.createdAt).toLocaleDateString("ar-DZ", { year: "numeric", month: "short", day: "numeric" })}
              </p>
            </div>
            {fetching === s.id
              ? <motion.div className="w-3.5 h-3.5 border-2 border-violet-500 border-t-transparent rounded-full shrink-0"
                  animate={{ rotate: 360 }} transition={{ duration: 0.7, repeat: Infinity, ease: "linear" }} />
              : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
          </motion.button>
        ))}
      </div>
    </motion.div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function BEMPage() {
  const [result,    setResult]    = useState<BEMResult | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const reset = () => { setResult(null); setActiveTab("overview"); };

  const passed     = result?.students.filter(s => s.passed) ?? [];
  const failed     = result?.students.filter(s => s.passed === false) ?? [];
  // "Passed by transfer" = passed with avg between 10 and 11.99 (borderline)
  const transfer   = passed.filter(s => (s.average ?? 0) < 12);
  const repeaters  = result?.students.filter(s => s.repeater) ?? [];

  return (
    <motion.div variants={fadeUp} initial="initial" animate="animate" exit="exit"
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="p-6 space-y-5 max-w-6xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3 print:hidden">
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4 }}>
          <h1 className="text-2xl font-bold flex items-center gap-2.5">
            <span className="text-2xl">🎓</span> تحليل نتائج امتحان BEM
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            بريفيه التعليم المتوسط — يحلل ملف Excel ويصنف التلاميذ
          </p>
        </motion.div>
        {result && (
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 20 }} className="flex gap-2">
            <Button variant="outline" size="sm" className="gap-1.5 rounded-xl" onClick={() => window.print()}>
              <Printer className="w-4 h-4" /> طباعة
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 rounded-xl" onClick={reset}>
              <RotateCcw className="w-4 h-4" /> ملف جديد
            </Button>
          </motion.div>
        )}
      </div>

      <AnimatePresence mode="wait">
        {!result ? (
          <motion.div key="upload" exit={{ opacity: 0, y: -12, scale: 0.97 }}
            transition={{ duration: 0.25 }} className="max-w-2xl mx-auto space-y-5 print:hidden">
            <UploadZone onResult={setResult} />
            <SavedSessions onLoad={setResult} />
            <motion.div className="rounded-2xl bg-muted/40 border p-5 space-y-3"
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
              <p className="font-semibold text-sm">المواد المعتمدة في BEM وأوزانها:</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {[
                  { ar: "اللغة العربية",      coef: 5, c: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300" },
                  { ar: "الرياضيات",           coef: 4, c: "bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300" },
                  { ar: "اللغة الفرنسية",      coef: 3, c: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" },
                  { ar: "التاريخ والجغرافيا",  coef: 3, c: "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300" },
                  { ar: "التربية الإسلامية",   coef: 2, c: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300" },
                  { ar: "اللغة الإنجليزية",   coef: 2, c: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300" },
                  { ar: "علوم الطبيعة",        coef: 2, c: "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300" },
                  { ar: "العلوم الفيزيائية",   coef: 2, c: "bg-cyan-100 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300" },
                  { ar: "التربية المدنية",     coef: 1, c: "bg-slate-100 text-slate-600 dark:bg-slate-950/40 dark:text-slate-300" },
                  { ar: "التربية البدنية",     coef: 1, c: "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300" },
                ].map((s, i) => (
                  <motion.div key={i} className={`flex items-center justify-between rounded-xl px-3 py-2 ${s.c}`}
                    initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.04 + 0.2, type: "spring", stiffness: 300, damping: 25 }}>
                    <span className="text-xs font-medium">{s.ar}</span>
                    <span className="text-xs font-black ms-2 opacity-80">×{s.coef}</span>
                  </motion.div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">المجموع الكلي: <strong>25</strong> — العتبة: <strong>10/20</strong></p>
            </motion.div>
          </motion.div>
        ) : (
          <motion.div key="results" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            transition={{ duration: 0.35 }} className="space-y-5">

            {/* File badge */}
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 280, damping: 22 }} className="print:hidden">
              <Badge variant="secondary" className="text-xs gap-1.5 rounded-lg px-3 py-1">
                <FileSpreadsheet className="w-3 h-3" /> {result.fileName}
                <span className="text-muted-foreground ms-1">— {result.detectedSubjects.length} مادة</span>
              </Badge>
            </motion.div>

            {/* KPI grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 print:hidden">
              {[
                { label: "التلاميذ",    value: result.summary.total,                              icon: <Users className="w-4 h-4" />,      colorBg: "bg-blue-500",    colorText: "text-blue-600 dark:text-blue-400",     colorLight: "bg-blue-50 dark:bg-blue-950/30" },
                { label: "الناجحون",    value: result.summary.passCount,                          icon: "✅",                                colorBg: "bg-emerald-500", colorText: "text-emerald-600 dark:text-emerald-400", colorLight: "bg-emerald-50 dark:bg-emerald-950/30", sub: `${result.summary.passRate}%` },
                { label: "الراسبون",    value: result.summary.failCount,                          icon: "❌",                                colorBg: "bg-red-500",     colorText: "text-red-600 dark:text-red-400",       colorLight: "bg-red-50 dark:bg-red-950/30" },
                { label: "نسبة النجاح", value: `${result.summary.passRate}%`,                    icon: <Target className="w-4 h-4" />,     colorBg: "bg-violet-500",  colorText: "text-violet-600 dark:text-violet-400", colorLight: "bg-violet-50 dark:bg-violet-950/30" },
                { label: "معدل القسم",  value: result.summary.classAvg?.toFixed(2) ?? "—",       icon: <TrendingUp className="w-4 h-4" />, colorBg: "bg-amber-500",   colorText: "text-amber-600 dark:text-amber-400",   colorLight: "bg-amber-50 dark:bg-amber-950/30" },
                { label: "ذ / أ",       value: `${result.genderStats.males}/${result.genderStats.females}`, icon: <Users className="w-4 h-4" />, colorBg: "bg-sky-500", colorText: "text-sky-600 dark:text-sky-400", colorLight: "bg-sky-50 dark:bg-sky-950/30" },
              ].map((s, i) => <KPI key={i} {...s} delay={i * 0.06} />)}
            </div>

            {/* Tab bar — scrollable */}
            <div className="flex gap-0.5 border-b overflow-x-auto scrollbar-none print:hidden -mx-1 px-1">
              {TABS.map(tab => {
                const active = activeTab === tab.id;
                return (
                  <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                    className={`relative flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-medium border-b-2 transition-all duration-200 whitespace-nowrap -mb-px shrink-0
                      ${active ? "border-blue-600 text-blue-600 dark:text-blue-400" : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"}`}>
                    <span>{tab.icon}</span> {tab.label}
                    {active && (
                      <motion.div layoutId="tab-indicator"
                        className="absolute inset-0 bg-blue-50 dark:bg-blue-950/20 rounded-t-lg -z-10"
                        transition={{ type: "spring", stiffness: 380, damping: 30 }} />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Tab Content */}
            <AnimatePresence mode="wait">
              <motion.div key={activeTab}
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.22, ease: "easeOut" }}>

                {activeTab === "overview" && <OverviewTab result={result} />}
                {activeTab === "charts"   && <ChartsSection result={result} />}
                {activeTab === "subjects" && <SubjectAnalysis result={result} />}

                {activeTab === "mentors" && <MentorsTab result={result} />}

                {activeTab === "passed" && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-2xl">✅</span>
                      <div>
                        <p className="font-bold">الناجحون بالشهادة</p>
                        <p className="text-xs text-muted-foreground">{passed.length} تلميذ — معدل ≥ 10/20</p>
                      </div>
                    </div>
                    <StudentTable students={passed} subjects={result.detectedSubjects}
                      emptyMsg="لا يوجد ناجحون" highlightFirst />
                  </div>
                )}

                {activeTab === "failed" && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-2xl">❌</span>
                      <div>
                        <p className="font-bold">الراسبون في الشهادة</p>
                        <p className="text-xs text-muted-foreground">{failed.length} تلميذ — معدل &lt; 10/20</p>
                      </div>
                    </div>
                    <StudentTable students={failed} subjects={result.detectedSubjects}
                      emptyMsg="لا يوجد راسبون" showRank={false} />
                  </div>
                )}

                {activeTab === "transfer" && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-2xl">⬆️</span>
                      <div>
                        <p className="font-bold">الناجحون بالانتقال</p>
                        <p className="text-xs text-muted-foreground">{transfer.length} تلميذ — ناجح بمعدل 10 إلى 12 (مجازي)</p>
                      </div>
                    </div>
                    <StudentTable students={transfer} subjects={result.detectedSubjects}
                      emptyMsg="لا يوجد ناجحون بالانتقال" />
                  </div>
                )}

                {activeTab === "repeaters" && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-2xl">🔁</span>
                      <div>
                        <p className="font-bold">نتائج المعيدين</p>
                        <p className="text-xs text-muted-foreground">
                          {repeaters.length > 0 ? `${repeaters.length} معيد` : "لم يُحدَّد المعيدون في الملف"}
                        </p>
                      </div>
                    </div>
                    {repeaters.length > 0 ? (
                      <StudentTable students={repeaters} subjects={result.detectedSubjects} emptyMsg="لا يوجد معيدون" />
                    ) : (
                      <div className="rounded-2xl border border-dashed p-12 text-center text-muted-foreground space-y-2">
                        <span className="text-4xl block">🔁</span>
                        <p className="font-medium">لا توجد بيانات المعيدين</p>
                        <p className="text-sm">الملف لا يحتوي على حقل تمييز المعيد — يمكن إضافته في عمود منفصل</p>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === "fail_list" && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-2xl">📋</span>
                      <div>
                        <p className="font-bold">قائمة الراسبين الكاملة</p>
                        <p className="text-xs text-muted-foreground">{failed.length} راسب</p>
                      </div>
                    </div>
                    {/* Summary by subject failure */}
                    <div className="rounded-2xl border p-4 space-y-2">
                      <p className="text-sm font-semibold mb-3">الرسوب حسب المادة</p>
                      {result.subjectStats.map(s => {
                        const failInSubj = failed.filter(st => (st.scores[s.key] ?? 0) < 10).length;
                        const pct = failed.length ? Math.round(failInSubj / failed.length * 100) : 0;
                        return (
                          <div key={s.key} className="flex items-center gap-2">
                            <span className="text-xs w-32 truncate text-muted-foreground">{s.arLabel}</span>
                            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                              <motion.div className="h-full bg-red-400 rounded-full"
                                initial={{ width: 0 }} animate={{ width: `${pct}%` }}
                                transition={{ duration: 0.6 }} />
                            </div>
                            <span className="text-xs text-red-500 font-bold w-8 text-end">{failInSubj}</span>
                          </div>
                        );
                      })}
                    </div>
                    <StudentTable students={failed} subjects={result.detectedSubjects} showRank={false} emptyMsg="لا يوجد راسبون" />
                  </div>
                )}

                {activeTab === "class_groups" && <ClassGroupsTab result={result} />}
                {activeTab === "annual"        && <AnnualComparisonTab result={result} />}

              </motion.div>
            </AnimatePresence>

            {/* Print table */}
            <div className="hidden print:block" dir="rtl">
              <div style={{ textAlign: "center", marginBottom: "12px" }}>
                <h2 style={{ fontSize: "16pt", fontWeight: "bold", margin: "0 0 4px" }}>نتائج امتحان شهادة التعليم المتوسط</h2>
                <p style={{ fontSize: "10pt", color: "#555", margin: 0 }}>
                  إجمالي: {result.summary.total} | ناجح: {result.summary.passCount} | راسب: {result.summary.failCount} |
                  نسبة النجاح: {result.summary.passRate}% | معدل القسم: {result.summary.classAvg?.toFixed(2) ?? "—"} |
                  ذكور: {result.genderStats.males} / إناث: {result.genderStats.females}
                </p>
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10pt" }}>
                <thead>
                  <tr style={{ background: "#f0f0f0" }}>
                    {["الرتبة","الاسم","الجنس","المعدل","النتيجة"].map(h => (
                      <th key={h} style={{ border: "1px solid #999", padding: "5px 8px", textAlign: "center" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.students.map((s, i) => (
                    <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#f9f9f9" }}>
                      <td style={{ border: "1px solid #ccc", padding: "3px 8px", textAlign: "center" }}>{s.rank > 0 ? s.rank : "—"}</td>
                      <td style={{ border: "1px solid #ccc", padding: "3px 8px" }}>{s.name}</td>
                      <td style={{ border: "1px solid #ccc", padding: "3px 8px", textAlign: "center" }}>{s.gender === "male" ? "ذكر" : s.gender === "female" ? "أنثى" : "—"}</td>
                      <td style={{ border: "1px solid #ccc", padding: "3px 8px", textAlign: "center", fontWeight: "bold", color: (s.average ?? 0) >= 10 ? "#16a34a" : "#dc2626" }}>
                        {s.average?.toFixed(2) ?? "—"}
                      </td>
                      <td style={{ border: "1px solid #ccc", padding: "3px 8px", textAlign: "center", fontWeight: "bold", color: s.passed ? "#16a34a" : "#dc2626" }}>
                        {s.passed === true ? "ناجح ✓" : s.passed === false ? "راسب ✗" : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}