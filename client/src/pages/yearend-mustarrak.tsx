import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Printer, RefreshCw, Users, TrendingUp } from "lucide-react";
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

export default function YearEndMustarrak() {
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

  // مستدرك = 9.00 ≤ avg < 10.00
  const mustarrak = results
    .filter(r => getFinalAvg(r) !== null && getFinalAvg(r)! >= 9 && getFinalAvg(r)! < 10)
    .filter(r => classe === "all" || r.student.classe === classe)
    .sort((a, b) => (getFinalAvg(b) ?? 0) - (getFinalAvg(a) ?? 0));

  const classes = [...new Set(results.map(r => r.student.classe))].sort();

  const avgGap = mustarrak.length > 0
    ? (mustarrak.reduce((s, r) => s + (10 - (r.annualAvg ?? 0)), 0) / mustarrak.length).toFixed(2)
    : null;

  const males   = mustarrak.filter(r => r.student.sexe === "M").length;
  const females = mustarrak.length - males;

  // Charts
  const byLevel = ["1AM","2AM","3AM","4AM"]
    .map((niv, i) => ({
      name: LEVEL_LABELS[niv] ?? niv,
      مستدرك: mustarrak.filter(r => r.student.niveau === niv).length,
      fill: LEVEL_COLOR_ARR[i],
    }))
    .filter(d => d.مستدرك > 0);

  const genderData = [
    { name: "ذكور", value: males, fill: "#3b82f6" },
    { name: "إناث", value: females, fill: "#ec4899" },
  ].filter(d => d.value > 0);

  // Gap distribution
  const gapBuckets = [
    { name: "0.01-0.25", count: mustarrak.filter(r => (10-(r.annualAvg??0)) <= 0.25).length, fill: "#f59e0b" },
    { name: "0.25-0.5",  count: mustarrak.filter(r => (10-(r.annualAvg??0)) > 0.25 && (10-(r.annualAvg??0)) <= 0.5).length, fill: "#f97316" },
    { name: "0.5-0.75",  count: mustarrak.filter(r => (10-(r.annualAvg??0)) > 0.5  && (10-(r.annualAvg??0)) <= 0.75).length, fill: "#ef4444" },
    { name: "0.75-1",    count: mustarrak.filter(r => (10-(r.annualAvg??0)) > 0.75).length, fill: "#dc2626" },
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6 print:hidden">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center">
              <RefreshCw className="w-4 h-4 text-amber-400" />
            </span>
            قوائم التلاميذ المستدركين
          </h1>
          <p className="text-muted-foreground text-sm mt-1">التلاميذ بمعدل سنوي بين 9.00 و 9.99 — مؤهلون للاستدراك</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <Printer className="w-4 h-4 mr-1" /> طباعة
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: "إجمالي المستدركين", value: mustarrak.length, color: "from-amber-500 to-orange-600", icon: Users },
          { label: "ذكور", value: males, color: "from-blue-500 to-blue-600", icon: TrendingUp },
          { label: "متوسط الفجوة عن 10", value: avgGap ? `${avgGap} نقطة` : "—", color: "from-slate-500 to-slate-600", icon: RefreshCw },
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

      {/* Charts */}
      {mustarrak.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 print:hidden">
          {byLevel.length > 0 && (
            <Card className="border-0 bg-card/80 shadow-md">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />المستدركون حسب المستوى
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={byLevel} barSize={28}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.08} />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip content={<MiniTooltip />} />
                    <Bar dataKey="مستدرك" radius={[6, 6, 0, 0]}>
                      {byLevel.map((e, i) => <Cell key={i} fill={e.fill} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {genderData.length > 0 && (
            <Card className="border-0 bg-card/80 shadow-md">
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

          <Card className="border-0 bg-card/80 shadow-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-orange-500" />توزيع الفجوة عن 10
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={gapBuckets} barSize={24}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.08} />
                  <XAxis dataKey="name" tick={{ fontSize: 9 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip content={<MiniTooltip />} />
                  <Bar dataKey="count" name="تلاميذ" radius={[4, 4, 0, 0]}>
                    {gapBuckets.map((e, i) => <Cell key={i} fill={e.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}

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

      <div className="rounded-xl border overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-amber-500/10 border-b border-amber-500/20">
            <tr>
              {["#","اسم التلميذ","المستوى","القسم","ت1","ت2","ت3","المعدل","الفجوة عن 10"].map(h => (
                <th key={h} className="px-3 py-3 text-start text-xs font-semibold text-muted-foreground">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="text-center py-16 text-muted-foreground">جارٍ التحميل…</td></tr>
            ) : mustarrak.length === 0 ? (
              <tr><td colSpan={9} className="text-center py-16 text-muted-foreground">لا يوجد تلاميذ مستدركون</td></tr>
            ) : mustarrak.map((r, i) => {
              const gap = (10 - (r.annualAvg ?? 0)).toFixed(2);
              return (
                <motion.tr key={r.student.id}
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  transition={{ delay: Math.min(i * 0.01, 0.3) }}
                  className={`border-t ${i % 2 === 0 ? "" : "bg-muted/10"} hover:bg-amber-500/5 transition-colors`}
                >
                  <td className="px-3 py-2.5 text-xs text-muted-foreground font-bold">{i + 1}</td>
                  <td className="px-3 py-2.5 font-medium">{r.student.nomPrenom}</td>
                  <td className="px-3 py-2.5">
                    <Badge style={{ background: LEVEL_COLORS[r.student.niveau] + "33", color: LEVEL_COLORS[r.student.niveau] }}>
                      {LEVEL_LABELS[r.student.niveau] ?? r.student.niveau}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5"><Badge variant="outline">{r.student.classe}</Badge></td>
                  {[r.t1Avg, r.t2Avg, r.t3Avg].map((a, ti) => (
                    <td key={ti} className={`px-3 py-2.5 font-mono text-xs ${a === null ? "text-muted-foreground" : a >= 10 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600"}`}>
                      {a !== null ? a.toFixed(2) : "—"}
                    </td>
                  ))}
                  <td className="px-3 py-2.5">
                    <span className="font-bold font-mono text-amber-500 text-base">{r.annualAvg?.toFixed(2)}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge variant="outline" className="text-xs font-mono border-amber-500/40 text-amber-500">
                      -{gap}
                    </Badge>
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {mustarrak.length > 0 && (
        <p className="text-xs text-muted-foreground mt-3 text-end">إجمالي: {mustarrak.length} تلميذ مستدرك</p>
      )}
    </motion.div>
  );
}
