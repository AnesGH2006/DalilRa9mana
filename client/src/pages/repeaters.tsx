import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UserCheck, AlertCircle, Users, TrendingDown } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Cell, PieChart, Pie, Legend,
} from "recharts";

const BASE = import.meta.env.BASE_URL;
const ACADEMIC_YEARS = ["2026-2027", "2025-2026", "2024-2025", "2023-2024", "2022-2023"];
const DEFAULT_YEAR = "2026-2027";
const LEVEL_COLORS: Record<string, string> = {
  "1AM": "#6366f1", "2AM": "#8b5cf6", "3AM": "#a855f7", "4AM": "#d946ef",
};

// Max normal age at school year start (September 1st) per level
const MAX_NORMAL_AGE: Record<string, number> = {
  "1AM": 11, "2AM": 12, "3AM": 13, "4AM": 15,
};

interface ResultRow {
  student: {
    id: string;
    nomPrenom: string;
    niveau: string;
    classe: string;
    sexe: "M" | "F";
    statut: "nouveau" | "redoublant";
    dateNaissance: string | null;
  };
  annualAvg: number | null;
  passed: boolean | null;
  rank: number | null;
}

function calcAgeAtSchoolStart(dateNaissance: string | null, annee: string): number | null {
  if (!dateNaissance) return null;
  const birth = new Date(dateNaissance);
  if (isNaN(birth.getTime())) return null;
  const startYear = parseInt(annee.split("-")[0]);
  if (isNaN(startYear)) return null;
  const sep1 = new Date(startYear, 8, 1); // September 1
  return Math.floor((sep1.getTime() - birth.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
}

function isAgeBasedRepeater(dateNaissance: string | null, niveau: string, annee: string): boolean {
  const age = calcAgeAtSchoolStart(dateNaissance, annee);
  if (age === null) return false;
  return age > (MAX_NORMAL_AGE[niveau] ?? 99);
}

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

function KpiCard({ value, label, sub, color }: { value: number; label: string; sub?: string; color: string }) {
  return (
    <Card className={`border-0 shadow-lg overflow-hidden`} style={{ boxShadow: `0 8px 24px ${color}33` }}>
      <div className="p-5 relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${color}cc, ${color}99)` }}>
        <div className="absolute -top-4 -right-4 w-16 h-16 rounded-full bg-white/10 blur-xl" />
        <p className="text-white/70 text-xs font-semibold mb-1">{label}</p>
        <p className="text-4xl font-extrabold text-white">{value}</p>
        {sub && <p className="text-white/70 text-xs mt-1.5">{sub}</p>}
      </div>
    </Card>
  );
}

export default function RepeatersPage() {
  const [results, setResults] = useState<ResultRow[]>([]);
  const [annee, setAnnee] = useState(DEFAULT_YEAR);
  const [niveau, setNiveau] = useState<string>("");
  const [genderFilter, setGenderFilter] = useState<string>("");
  const [tab, setTab] = useState<"failed" | "repeaters">("failed");
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ annee });
      if (niveau) p.set("niveau", niveau);
      const res = await fetch(`${BASE}api/results?${p}`, { credentials: "include" });
      if (res.ok) setResults(await res.json());
    } finally { setLoading(false); }
  }, [niveau, annee]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Datasets ────────────────────────────────────────────────────────────────
  const withAvg = results.filter(r => r.annualAvg !== null);

  // Failed: annual average < 10 or passed === false
  const failedAll = results.filter(r => r.passed === false || (r.annualAvg !== null && r.annualAvg < 10));
  const failed = genderFilter
    ? failedAll.filter(r => r.student.sexe === genderFilter)
    : failedAll;

  // Repeaters: confirmed (statut=redoublant) OR age-detected
  const repeatersAll = results.filter(r =>
    r.student.statut === "redoublant" ||
    isAgeBasedRepeater(r.student.dateNaissance, r.student.niveau, annee)
  );
  const repeaters = genderFilter
    ? repeatersAll.filter(r => r.student.sexe === genderFilter)
    : repeatersAll;

  const activeList = tab === "failed" ? failed : repeaters;
  const activeAll  = tab === "failed" ? failedAll : repeatersAll;

  // ── Analytics – Failed ───────────────────────────────────────────────────
  const failedBoys  = failedAll.filter(r => r.student.sexe === "M").length;
  const failedGirls = failedAll.filter(r => r.student.sexe === "F").length;

  const LEVELS = ["1AM", "2AM", "3AM", "4AM"];
  const failedByLevel = LEVELS.map(lvl => ({
    name: lvl,
    راسبون: failedAll.filter(r => r.student.niveau === lvl).length,
    fill: LEVEL_COLORS[lvl],
  })).filter(d => d.راسبون > 0);

  // Failed by class
  const classMap = new Map<string, number>();
  for (const r of failedAll) {
    const key = `${r.student.niveau}-${r.student.classe}`;
    classMap.set(key, (classMap.get(key) ?? 0) + 1);
  }
  const failedByClass = [...classMap.entries()]
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([name, count]) => ({ name, راسبون: count }));

  // Gender pie for failed
  const genderPieData = [
    { name: "ذكور", value: failedBoys,  fill: "#6366f1" },
    { name: "إناث", value: failedGirls, fill: "#ec4899" },
  ].filter(d => d.value > 0);

  // Grade histogram
  const buckets = [
    { label: "< 5",  min: 0, max: 5  },
    { label: "5–7",  min: 5, max: 7  },
    { label: "7–8",  min: 7, max: 8  },
    { label: "8–9",  min: 8, max: 9  },
    { label: "9–10", min: 9, max: 10 },
  ];
  const histData = buckets.map(b => ({
    name: b.label,
    count: failedAll.filter(r => r.annualAvg !== null && r.annualAvg >= b.min && r.annualAvg < b.max).length,
  }));

  // ── Analytics – Repeaters ────────────────────────────────────────────────
  const confirmedRepeaters = repeatersAll.filter(r => r.student.statut === "redoublant");
  const probableByAge = repeatersAll.filter(
    r => r.student.statut !== "redoublant" &&
         isAgeBasedRepeater(r.student.dateNaissance, r.student.niveau, annee)
  );

  const repeaterBoys  = repeatersAll.filter(r => r.student.sexe === "M").length;
  const repeaterGirls = repeatersAll.filter(r => r.student.sexe === "F").length;

  const repeaterByLevel = LEVELS.map(lvl => ({
    name: lvl,
    مؤكدون: repeatersAll.filter(r => r.student.niveau === lvl && r.student.statut === "redoublant").length,
    محتملون: repeatersAll.filter(r => r.student.niveau === lvl && r.student.statut !== "redoublant" && isAgeBasedRepeater(r.student.dateNaissance, r.student.niveau, annee)).length,
    fill: LEVEL_COLORS[lvl],
  })).filter(d => d.مؤكدون + d.محتملون > 0);

  const repeaterByClass = new Map<string, number>();
  for (const r of repeatersAll) {
    const key = `${r.student.niveau}-${r.student.classe}`;
    repeaterByClass.set(key, (repeaterByClass.get(key) ?? 0) + 1);
  }
  const repeaterByClassData = [...repeaterByClass.entries()]
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([name, count]) => ({ name, معيدون: count }));

  const repeaterGenderPie = [
    { name: "ذكور", value: repeaterBoys,  fill: "#8b5cf6" },
    { name: "إناث", value: repeaterGirls, fill: "#f59e0b" },
  ].filter(d => d.value > 0);

  const repeatRate = withAvg.length > 0
    ? Math.round((repeatersAll.length / results.length) * 100)
    : 0;
  const failRate = results.length > 0
    ? Math.round((failedAll.length / results.length) * 100)
    : 0;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
      className="p-6 space-y-6 max-w-5xl mx-auto"
    >
      {/* Header */}
      <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-3">
        <span className="inline-flex w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 items-center justify-center shadow-lg shadow-orange-500/30">
          <UserCheck className="w-5 h-5 text-white" />
        </span>
        <div>
          <h1 className="text-2xl font-bold">التلاميذ الراسبون والمعيدون</h1>
          <p className="text-sm text-muted-foreground">تحليل شامل للراسبين والمعيدين حسب الجنس والقسم والمستوى</p>
        </div>
      </motion.div>

      {/* Tabs */}
      <div className="flex gap-2 p-1 rounded-xl bg-muted/50 w-fit">
        {[
          { id: "failed", label: "الراسبون", icon: TrendingDown },
          { id: "repeaters", label: "المعيدون", icon: Users },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as any)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              tab === t.id
                ? "bg-background shadow text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* KPI Cards */}
      {!loading && (
        <motion.div
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="grid grid-cols-2 sm:grid-cols-4 gap-4"
        >
          {tab === "failed" ? (
            <>
              <KpiCard value={failedAll.length}  label="إجمالي الراسبين"  sub={`${failRate}% من التلاميذ`}  color="#f97316" />
              <KpiCard value={failedBoys}         label="ذكور راسبون"       color="#6366f1" />
              <KpiCard value={failedGirls}        label="إناث راسبات"       color="#ec4899" />
              <KpiCard value={failedByLevel.length > 0 ? Math.max(...failedByLevel.map(d => d.راسبون)) : 0}
                label="أعلى نسبة في مستوى"  color="#ef4444" />
            </>
          ) : (
            <>
              <KpiCard value={repeatersAll.length}       label="إجمالي المعيدون"   sub={`${repeatRate}% من التلاميذ`} color="#f97316" />
              <KpiCard value={confirmedRepeaters.length} label="معيدون مؤكدون"     sub="statut = معيد"                 color="#8b5cf6" />
              <KpiCard value={probableByAge.length}      label="محتملون بالسن"     sub="تجاوزوا السن الطبيعي"          color="#f59e0b" />
              <KpiCard value={repeaterBoys + repeaterGirls > 0 ? Math.round(repeaterBoys / (repeaterBoys + repeaterGirls) * 100) : 0}
                label="نسبة الذكور"        sub="من إجمالي المعيدين"            color="#6366f1" />
            </>
          )}
        </motion.div>
      )}

      {/* Charts */}
      {!loading && activeAll.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="space-y-4"
        >
          {/* Row 1: by level, gender pie, histogram */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* By level */}
            <Card className="border-0 shadow-md bg-gradient-to-br from-card to-muted/20">
              <CardHeader className="pb-1 pt-3 px-4">
                <CardTitle className="text-xs font-bold text-muted-foreground">
                  {tab === "failed" ? "الراسبون حسب المستوى" : "المعيدون حسب المستوى"}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 pb-3 px-2">
                {tab === "failed" ? (
                  <ResponsiveContainer width="100%" height={130}>
                    <BarChart data={failedByLevel} barSize={24} margin={{ left: -20 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 9 }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <Tooltip content={<MiniTooltip />} />
                      <Bar dataKey="راسبون" radius={[5, 5, 0, 0]}>
                        {failedByLevel.map((d, i) => <Cell key={i} fill={d.fill} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <ResponsiveContainer width="100%" height={130}>
                    <BarChart data={repeaterByLevel} barSize={14} margin={{ left: -20 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 9 }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <Tooltip content={<MiniTooltip />} />
                      <Bar dataKey="مؤكدون" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="محتملون" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Gender pie */}
            <Card className="border-0 shadow-md bg-gradient-to-br from-card to-muted/20">
              <CardHeader className="pb-1 pt-3 px-4">
                <CardTitle className="text-xs font-bold text-muted-foreground">توزيع الجنس</CardTitle>
              </CardHeader>
              <CardContent className="p-0 pb-1">
                <ResponsiveContainer width="100%" height={130}>
                  <PieChart>
                    <Pie
                      data={tab === "failed" ? genderPieData : repeaterGenderPie}
                      dataKey="value" nameKey="name"
                      cx="50%" cy="50%" outerRadius={45}
                    >
                      {(tab === "failed" ? genderPieData : repeaterGenderPie).map((d, i) => (
                        <Cell key={i} fill={d.fill} />
                      ))}
                    </Pie>
                    <Tooltip content={<MiniTooltip />} />
                    <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Grade histogram (failed only) / Confirmed vs probable (repeaters) */}
            <Card className="border-0 shadow-md bg-gradient-to-br from-card to-muted/20">
              <CardHeader className="pb-1 pt-3 px-4">
                <CardTitle className="text-xs font-bold text-muted-foreground">
                  {tab === "failed" ? "توزيع المعدلات" : "مؤكد مقابل محتمل بالسن"}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 pb-3 px-2">
                {tab === "failed" ? (
                  <ResponsiveContainer width="100%" height={130}>
                    <BarChart data={histData} barSize={20} margin={{ left: -20 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 9 }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <Tooltip content={<MiniTooltip />} />
                      <Bar dataKey="count" name="تلاميذ" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <ResponsiveContainer width="100%" height={130}>
                    <PieChart>
                      <Pie
                        data={[
                          { name: "مؤكدون (معيد)", value: confirmedRepeaters.length, fill: "#8b5cf6" },
                          { name: "محتمل بالسن",    value: probableByAge.length,      fill: "#f59e0b" },
                        ].filter(d => d.value > 0)}
                        dataKey="value" nameKey="name"
                        cx="50%" cy="50%" outerRadius={45}
                      >
                        <Cell fill="#8b5cf6" />
                        <Cell fill="#f59e0b" />
                      </Pie>
                      <Tooltip content={<MiniTooltip />} />
                      <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Row 2: by class */}
          {(tab === "failed" ? failedByClass : repeaterByClassData).length > 0 && (
            <Card className="border-0 shadow-md bg-gradient-to-br from-card to-muted/20">
              <CardHeader className="pb-1 pt-3 px-4">
                <CardTitle className="text-xs font-bold text-muted-foreground">
                  {tab === "failed" ? "الراسبون حسب القسم (أعلى 10)" : "المعيدون حسب القسم (أعلى 10)"}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 pb-3 px-2">
                <ResponsiveContainer width="100%" height={150}>
                  <BarChart
                    data={tab === "failed" ? failedByClass : repeaterByClassData}
                    barSize={22} margin={{ left: -10 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 9 }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip content={<MiniTooltip />} />
                    <Bar
                      dataKey={tab === "failed" ? "راسبون" : "معيدون"}
                      fill={tab === "failed" ? "#f43f5e" : "#8b5cf6"}
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </motion.div>
      )}

      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-center">
        <Select value={annee} onValueChange={v => { setAnnee(v); setNiveau(""); setGenderFilter(""); }}>
          <SelectTrigger className="w-36 font-semibold border-orange-200 dark:border-orange-800 text-orange-700 dark:text-orange-300 bg-orange-50/50 dark:bg-orange-950/30 text-xs h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ACADEMIC_YEARS.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={niveau || "__all__"} onValueChange={v => setNiveau(v === "__all__" ? "" : v)}>
          <SelectTrigger className="w-40 bg-gradient-to-r from-orange-500 to-amber-600 text-white border-0 font-semibold text-xs h-9">
            <SelectValue placeholder="كل المستويات" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">كل المستويات</SelectItem>
            {["1AM", "2AM", "3AM", "4AM"].map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={genderFilter || "__all__"} onValueChange={v => setGenderFilter(v === "__all__" ? "" : v)}>
          <SelectTrigger className="w-32 font-semibold text-xs h-9">
            <SelectValue placeholder="كل الجنسين" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">كل الجنسين</SelectItem>
            <SelectItem value="M">ذكور</SelectItem>
            <SelectItem value="F">إناث</SelectItem>
          </SelectContent>
        </Select>

        {!loading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="ms-auto px-3 py-1.5 rounded-lg bg-orange-100 dark:bg-orange-950/40 text-orange-700 dark:text-orange-400 text-sm font-bold">
            {activeList.length} تلميذ
          </motion.div>
        )}
      </div>

      {/* Student list */}
      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div key="loading" className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <motion.div key={i} className="h-16 rounded-xl bg-muted"
                animate={{ opacity: [0.3, 0.6, 0.3] }}
                transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.1 }} />
            ))}
          </motion.div>
        ) : activeList.length === 0 ? (
          <motion.div key="empty"
            initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
            className="rounded-2xl border border-dashed p-16 text-center text-muted-foreground">
            <motion.div animate={{ y: [0, -8, 0] }} transition={{ duration: 3, repeat: Infinity }}>
              <UserCheck className="w-14 h-14 mx-auto mb-4 opacity-20" />
            </motion.div>
            <p className="font-semibold text-emerald-600 dark:text-emerald-400">لا يوجد تلاميذ في هذه الفئة!</p>
            <p className="text-sm mt-1">جميع التلاميذ نجحوا أو لا توجد نتائج بعد</p>
          </motion.div>
        ) : (
          <motion.div key="list" className="space-y-2">
            {activeList.map((r, i) => {
              const age = calcAgeAtSchoolStart(r.student.dateNaissance, annee);
              const isAgeSuspect = isAgeBasedRepeater(r.student.dateNaissance, r.student.niveau, annee);
              const isConfirmed  = r.student.statut === "redoublant";

              return (
                <motion.div key={r.student.id}
                  initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04 }}
                  whileHover={{ x: 4 }}
                  className="flex items-center gap-4 bg-card border rounded-xl p-4 hover:border-orange-300 dark:hover:border-orange-700 transition-colors"
                >
                  {/* Gender icon */}
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-white text-xs font-bold shadow ${
                    r.student.sexe === "M"
                      ? "bg-gradient-to-br from-indigo-500 to-blue-600"
                      : "bg-gradient-to-br from-pink-500 to-rose-600"
                  }`}>
                    {r.student.sexe === "M" ? "ذ" : "أ"}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold">{r.student.nomPrenom}</p>
                      {isConfirmed && (
                        <Badge className="text-[10px] h-5 bg-purple-500/20 text-purple-400 border-purple-500/30 hover:bg-purple-500/20">
                          معيد مؤكد
                        </Badge>
                      )}
                      {isAgeSuspect && !isConfirmed && (
                        <Badge className="text-[10px] h-5 bg-amber-500/20 text-amber-400 border-amber-500/30 hover:bg-amber-500/20">
                          معيد محتمل بالسن
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {r.student.niveau} — قسم {r.student.classe}
                      {age !== null && (
                        <span className={`ms-2 ${isAgeSuspect ? "text-amber-500 font-semibold" : ""}`}>
                          · العمر: {age} سنة
                        </span>
                      )}
                    </p>
                  </div>

                  {/* Grade bar */}
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="w-20 h-2 bg-muted rounded-full overflow-hidden hidden sm:block">
                      <motion.div
                        className="h-full rounded-full"
                        style={{ background: (r.annualAvg ?? 0) >= 10 ? "#22c55e" : "#ef4444" }}
                        initial={{ width: 0 }}
                        animate={{ width: `${((r.annualAvg ?? 0) / 20) * 100}%` }}
                        transition={{ delay: i * 0.04 + 0.3, duration: 0.6 }}
                      />
                    </div>
                    <span className={`text-lg font-black tabular-nums w-12 text-end ${
                      (r.annualAvg ?? 0) >= 10
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-red-600 dark:text-red-400"
                    }`}>
                      {r.annualAvg !== null ? r.annualAvg.toFixed(2) : "—"}
                    </span>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
