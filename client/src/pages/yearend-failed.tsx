import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Printer, AlertCircle, Users, TrendingDown } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";
import { getFinalAvg } from "@/lib/year-end-result";

const BASE = import.meta.env.BASE_URL;
const YEARS = ["2026-2027", "2025-2026", "2024-2025", "2023-2024"];
const DEFAULT_YEAR = "2026-2027";

interface StudentResult {
  student: { id: string; nomPrenom: string; niveau: string; classe: string; sexe: "M" | "F"; statut: "nouveau" | "redoublant"; };
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

export default function YearEndFailed() {
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

  const failed = results
    .filter(r => getFinalAvg(r) !== null && getFinalAvg(r)! < 10)
    .filter(r => classe === "all" || r.student.classe === classe)
    .sort((a, b) => (getFinalAvg(b) ?? 0) - (getFinalAvg(a) ?? 0));

  const classes = [...new Set(results.map(r => r.student.classe))].sort();
  const redoublants = failed.filter(r => r.student.statut === "redoublant").length;
  const males   = failed.filter(r => r.student.sexe === "M").length;
  const females = failed.length - males;

  // Charts
  const byLevel = ["1AM","2AM","3AM","4AM"]
    .map((niv, i) => ({
      name: LEVEL_LABELS[niv] ?? niv,
      راسب: failed.filter(r => r.student.niveau === niv).length,
      fill: LEVEL_COLOR_ARR[i],
    }))
    .filter(d => d.راسب > 0);

  const statutData = [
    { name: "جديد", value: failed.length - redoublants, fill: "#64748b" },
    { name: "معيد", value: redoublants, fill: "#f97316" },
  ].filter(d => d.value > 0);

  const genderData = [
    { name: "ذكور", value: males, fill: "#3b82f6" },
    { name: "إناث", value: females, fill: "#ec4899" },
  ].filter(d => d.value > 0);

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6 print:hidden">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-red-500/20 flex items-center justify-center">
              <AlertCircle className="w-4 h-4 text-red-400" />
            </span>
            قوائم التلاميذ الراسبين
          </h1>
          <p className="text-muted-foreground text-sm mt-1">التلاميذ الذين لم يبلغ معدلهم السنوي 10/20</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <Printer className="w-4 h-4 mr-1" /> طباعة
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: "إجمالي الراسبين", value: failed.length, color: "from-red-500 to-rose-600", icon: Users },
          { label: "معيدون", value: redoublants, color: "from-orange-500 to-amber-600", icon: TrendingDown },
          { label: "جدد", value: failed.length - redoublants, color: "from-slate-500 to-slate-600", icon: AlertCircle },
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
      {failed.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 print:hidden">
          {/* By level */}
          {byLevel.length > 0 && (
            <Card className="border-0 bg-card/80 shadow-md">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-red-500" />الراسبون حسب المستوى
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={byLevel} barSize={28}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.08} />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip content={<MiniTooltip />} />
                    <Bar dataKey="راسب" radius={[6, 6, 0, 0]}>
                      {byLevel.map((e, i) => <Cell key={i} fill={e.fill} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Statut pie */}
          {statutData.length > 0 && (
            <Card className="border-0 bg-card/80 shadow-md">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-orange-500" />جديد / معيد
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie data={statutData} cx="50%" cy="50%" innerRadius={42} outerRadius={64}
                      paddingAngle={4} dataKey="value" animationDuration={600}>
                      {statutData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                    </Pie>
                    <Tooltip content={<MiniTooltip />} />
                    <Legend iconType="circle" iconSize={8} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Gender pie */}
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
          <thead className="bg-red-500/10 border-b border-red-500/20">
            <tr>
              {["#","اسم التلميذ","المستوى","القسم","الحالة","ت1","ت2","ت3","المعدل السنوي"].map(h => (
                <th key={h} className="px-3 py-3 text-start text-xs font-semibold text-muted-foreground">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="text-center py-16 text-muted-foreground">جارٍ التحميل…</td></tr>
            ) : failed.length === 0 ? (
              <tr><td colSpan={9} className="text-center py-16 text-muted-foreground">لا يوجد تلاميذ راسبون</td></tr>
            ) : failed.map((r, i) => (
              <motion.tr key={r.student.id}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                transition={{ delay: Math.min(i * 0.01, 0.3) }}
                className={`border-t ${i % 2 === 0 ? "" : "bg-muted/10"} hover:bg-red-500/5 transition-colors`}
              >
                <td className="px-3 py-2.5 text-xs text-muted-foreground font-bold">{i + 1}</td>
                <td className="px-3 py-2.5 font-medium">{r.student.nomPrenom}</td>
                <td className="px-3 py-2.5">
                  <Badge style={{ background: LEVEL_COLORS[r.student.niveau] + "33", color: LEVEL_COLORS[r.student.niveau] }}>
                    {LEVEL_LABELS[r.student.niveau] ?? r.student.niveau}
                  </Badge>
                </td>
                <td className="px-3 py-2.5"><Badge variant="outline">{r.student.classe}</Badge></td>
                <td className="px-3 py-2.5">
                  <Badge variant={r.student.statut === "redoublant" ? "destructive" : "secondary"} className="text-xs">
                    {r.student.statut === "redoublant" ? "معيد" : "جديد"}
                  </Badge>
                </td>
                {[r.t1Avg, r.t2Avg, r.t3Avg].map((a, ti) => (
                  <td key={ti} className={`px-3 py-2.5 font-mono text-xs ${a === null ? "text-muted-foreground" : a >= 10 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>
                    {a !== null ? a.toFixed(2) : "—"}
                  </td>
                ))}
                <td className="px-3 py-2.5">
                  <span className="font-bold font-mono text-red-500 text-base">{getFinalAvg(r)?.toFixed(2)}</span>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
      {failed.length > 0 && <p className="text-xs text-muted-foreground mt-3 text-end">إجمالي: {failed.length} تلميذ راسب</p>}
    </motion.div>
  );
}
