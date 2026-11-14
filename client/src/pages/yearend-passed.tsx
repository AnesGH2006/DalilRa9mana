import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Printer, Users, Trophy, TrendingUp, Medal } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";
import { getFinalAvg } from "@/lib/year-end-result";

const BASE = import.meta.env.BASE_URL;
const YEARS = ["2026-2027", "2025-2026", "2024-2025", "2023-2024"];
const DEFAULT_YEAR = "2026-2027";

interface StudentResult {
  student: { id: string; nomPrenom: string; niveau: string; classe: string; sexe: "M" | "F"; };
  annualAvg: number | null;
  bemAvg?: number | null;
  finalAvg?: number | null;
  t1Avg: number | null; t2Avg: number | null; t3Avg: number | null;
}

const LEVEL_LABELS: Record<string, string> = { "1AM": "1م", "2AM": "2م", "3AM": "3م", "4AM": "4م" };
const LEVEL_COLORS: Record<string, string> = { "1AM": "#6366f1", "2AM": "#8b5cf6", "3AM": "#a855f7", "4AM": "#d946ef" };
const LEVEL_COLOR_ARR = ["#6366f1", "#8b5cf6", "#a855f7", "#d946ef"];
const GENDER_COLORS = ["#3b82f6", "#ec4899"];

function rankMedal(rank: number) {
  if (rank === 1) return <Trophy className="w-4 h-4 text-amber-400" />;
  if (rank === 2) return <Medal className="w-4 h-4 text-slate-400" />;
  if (rank === 3) return <Medal className="w-4 h-4 text-orange-500" />;
  return <span className="text-xs text-muted-foreground font-bold">{rank}</span>;
}

function MiniTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-background/95 border rounded-lg shadow-xl p-2.5 text-xs backdrop-blur-sm">
      {label && <p className="font-bold mb-1">{label}</p>}
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color || p.fill }} className="font-semibold">{p.name}: {p.value}</p>
      ))}
    </div>
  );
}

export default function YearEndPassed() {
  const [results, setResults] = useState<StudentResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [annee, setAnnee] = useState(DEFAULT_YEAR);
  const [niveau, setNiveau] = useState("all");
  const [classe, setClasse] = useState("all");

  useEffect(() => {
    setLoading(true);
    const p = new URLSearchParams({ annee });
    if (niveau !== "all") p.set("niveau", niveau);
    fetch(`${BASE}api/results?${p}`, { credentials: "include" })
      .then(r => r.ok ? r.json() : [])
      .then((d: StudentResult[]) => { setResults(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [annee, niveau]);

  const passed = results
    .filter(r => getFinalAvg(r) !== null && getFinalAvg(r)! >= 10)
    .filter(r => classe === "all" || r.student.classe === classe)
    .sort((a, b) => (getFinalAvg(b) ?? 0) - (getFinalAvg(a) ?? 0));

  const classes = [...new Set(results.map(r => r.student.classe))].sort();
  const males = passed.filter(r => r.student.sexe === "M").length;
  const females = passed.length - males;

  // Chart data
  const byLevel = ["1AM", "2AM", "3AM", "4AM"]
    .map((niv, i) => ({
      name: LEVEL_LABELS[niv] ?? niv,
      ناجح: passed.filter(r => r.student.niveau === niv).length,
      fill: LEVEL_COLOR_ARR[i],
    }))
    .filter(d => d.ناجح > 0);

  const genderData = [
    { name: "ذكور", value: males, fill: GENDER_COLORS[0] },
    { name: "إناث", value: females, fill: GENDER_COLORS[1] },
  ].filter(d => d.value > 0);

  // Average distribution buckets
  const avgBuckets = [
    { name: "10-12", count: passed.filter(r => (r.annualAvg ?? 0) >= 10 && (r.annualAvg ?? 0) < 12).length, fill: "#10b981" },
    { name: "12-14", count: passed.filter(r => (r.annualAvg ?? 0) >= 12 && (r.annualAvg ?? 0) < 14).length, fill: "#3b82f6" },
    { name: "14-16", count: passed.filter(r => (r.annualAvg ?? 0) >= 14 && (r.annualAvg ?? 0) < 16).length, fill: "#8b5cf6" },
    { name: "16-18", count: passed.filter(r => (r.annualAvg ?? 0) >= 16 && (r.annualAvg ?? 0) < 18).length, fill: "#f59e0b" },
    { name: "18-20", count: passed.filter(r => (r.annualAvg ?? 0) >= 18).length, fill: "#ef4444" },
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 print:hidden">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
              <Users className="w-4 h-4 text-emerald-400" />
            </span>
            قوائم التلاميذ الناجحين
          </h1>
          <p className="text-muted-foreground text-sm mt-1">التلاميذ الذين حققوا معدل سنوي 10 فأكثر</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="w-4 h-4 mr-1" /> طباعة
          </Button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: "إجمالي الناجحين", value: passed.length, color: "from-emerald-500 to-green-600", icon: Users },
          { label: "ذكور", value: males, color: "from-blue-500 to-blue-600", icon: TrendingUp },
          { label: "إناث", value: females, color: "from-pink-500 to-rose-600", icon: TrendingUp },
        ].map(({ label, value, color, icon: Icon }) => (
          <div key={label} className={`rounded-xl p-4 bg-gradient-to-br ${color} text-white shadow-lg`}>
            <div className="flex items-center justify-between mb-1">
              <p className="text-white/70 text-xs font-semibold">{label}</p>
              <Icon className="w-4 h-4 text-white/60" />
            </div>
            <p className="text-3xl font-extrabold">{value}</p>
          </div>
        ))}
      </div>

      {/* Charts row */}
      {passed.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 print:hidden">
          {/* By level bar chart */}
          {byLevel.length > 0 && (
            <Card className="border-0 bg-card/80 shadow-md col-span-1">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-violet-500" />الناجحون حسب المستوى
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={460}>
                  <BarChart data={byLevel} barSize={44}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.08} />
                    <XAxis dataKey="name" tick={{ fontSize: 14, fontWeight: "bold" }} />
                    <YAxis tick={{ fontSize: 14, fontWeight: "bold" }} width={36} />
                    <Tooltip content={<MiniTooltip />} />
                    <Bar dataKey="ناجح" radius={[6, 6, 0, 0]}>
                      {byLevel.map((e, i) => <Cell key={i} fill={e.fill} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Gender pie */}
          {genderData.length > 0 && (
            <Card className="border-0 bg-card/80 shadow-md col-span-1">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-500" />توزيع الجنس
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie data={genderData} cx="50%" cy="50%" innerRadius={42} outerRadius={64}
                      paddingAngle={4} dataKey="value" animationDuration={600}>
                      {genderData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                    </Pie>
                    <Tooltip content={<MiniTooltip />} />
                    <Legend iconType="circle" iconSize={8} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Average distribution */}
          <Card className="border-0 bg-card/80 shadow-md col-span-1">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />توزيع المعدلات
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={460}>
                <BarChart data={avgBuckets} barSize={40}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.08} />
                  <XAxis dataKey="name" tick={{ fontSize: 14, fontWeight: "bold" }} />
                  <YAxis tick={{ fontSize: 14, fontWeight: "bold" }} width={36} />
                  <Tooltip content={<MiniTooltip />} />
                  <Bar dataKey="count" name="عدد التلاميذ" radius={[4, 4, 0, 0]}>
                    {avgBuckets.map((e, i) => <Cell key={i} fill={e.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 mb-4 print:hidden">
        <Select value={annee} onValueChange={setAnnee}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>{YEARS.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={niveau} onValueChange={v => { setNiveau(v); setClasse("all"); }}>
          <SelectTrigger className="w-28"><SelectValue placeholder="المستوى" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل المستويات</SelectItem>
            {["1AM","2AM","3AM","4AM"].map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={classe} onValueChange={setClasse}>
          <SelectTrigger className="w-28"><SelectValue placeholder="القسم" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الأقسام</SelectItem>
            {classes.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-xl border overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-emerald-500/10 border-b border-emerald-500/20">
            <tr>
              {["الرتبة","اسم التلميذ","المستوى","القسم","ت1","ت2","ت3","المعدل السنوي","الجنس"].map(h => (
                <th key={h} className="px-3 py-3 text-start text-xs font-semibold text-muted-foreground">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="text-center py-16 text-muted-foreground">جارٍ التحميل…</td></tr>
            ) : passed.length === 0 ? (
              <tr><td colSpan={9} className="text-center py-16 text-muted-foreground">لا يوجد تلاميذ ناجحون بعد</td></tr>
            ) : passed.map((r, i) => (
              <motion.tr key={r.student.id}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                transition={{ delay: Math.min(i * 0.01, 0.3) }}
                className={`border-t ${i % 2 === 0 ? "" : "bg-muted/10"} hover:bg-emerald-500/5 transition-colors`}
              >
                <td className="px-3 py-2.5"><div className="flex items-center justify-center w-6 h-6">{rankMedal(i + 1)}</div></td>
                <td className="px-3 py-2.5 font-medium">{r.student.nomPrenom}</td>
                <td className="px-3 py-2.5">
                  <Badge style={{ background: LEVEL_COLORS[r.student.niveau] + "33", color: LEVEL_COLORS[r.student.niveau] }}>
                    {LEVEL_LABELS[r.student.niveau] ?? r.student.niveau}
                  </Badge>
                </td>
                <td className="px-3 py-2.5"><Badge variant="outline">{r.student.classe}</Badge></td>
                {[r.t1Avg, r.t2Avg, r.t3Avg].map((a, ti) => (
                  <td key={ti} className={`px-3 py-2.5 font-mono text-xs ${a === null ? "text-muted-foreground" : a >= 10 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>
                    {a !== null ? a.toFixed(2) : "—"}
                  </td>
                ))}
                <td className="px-3 py-2.5">
                  <span className="font-bold font-mono text-emerald-600 dark:text-emerald-400 text-base">
                    {r.annualAvg?.toFixed(2)}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <Badge variant={r.student.sexe === "M" ? "default" : "secondary"} className="text-xs">
                    {r.student.sexe === "M" ? "ذكر" : "أنثى"}
                  </Badge>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
      {passed.length > 0 && (
        <p className="text-xs text-muted-foreground mt-3 text-end">إجمالي: {passed.length} تلميذ ناجح</p>
      )}
    </motion.div>
  );
}
