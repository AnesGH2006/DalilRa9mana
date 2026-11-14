import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { FileBarChart, Printer, Users, TrendingUp, Award, GraduationCap } from "lucide-react";
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";
import type { StudentResult } from "@shared/types";
import { CountUp } from "@/components/count-up";
import { allocateFourAMStreams, getFourAMCapacities } from "@/lib/4am-stream-allocation";
import { useOrientationWishes } from "@/hooks/use-orientation-wishes";

const BASE = import.meta.env.BASE_URL;
const YEARS = ["2026-2027", "2025-2026", "2024-2025", "2023-2024"];

const TRACKS = [
  { key: "science", label: "جذع مشترك علوم وتكنولوجيا", pie: "#3b82f6", gradient: "from-blue-600 to-blue-800" },
  { key: "arts", label: "جذع مشترك آداب", pie: "#8b5cf6", gradient: "from-violet-600 to-purple-800" },
];

function getTrack(stream: "science" | "arts" | undefined) {
  return TRACKS.find(track => track.key === stream) ?? null;
}

function MiniTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-background border rounded-xl shadow-xl p-2.5 text-xs">
      <p className="font-bold">{payload[0].name ?? payload[0].dataKey}: {payload[0].value}</p>
    </div>
  );
}

export default function PreOrientReportsPage() {
  const [year, setYear] = useState(() => localStorage.getItem("cem-selected-year") || "2026-2027");
  const [results, setResults] = useState<StudentResult[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async (y: string) => {
    setLoading(true);
    try {
      const res = await fetch(`${BASE}api/results?annee=${y}&niveau=4AM`, { credentials: "include" });
      if (res.ok) setResults(await res.json()); else setResults([]);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(year); localStorage.setItem("cem-selected-year", year); }, [year, fetchData]);

  const wishes = useOrientationWishes(year);
  const assignedStreams = allocateFourAMStreams(results, getFourAMCapacities(year), wishes);
  const eligible = results.filter(r => assignedStreams.has(r.student.id));
  const notEligible = results.filter(r => r.annualAvg !== null && r.annualAvg < 10);
  const noResult = results.filter(r => r.annualAvg === null);

  const byTrack = TRACKS.map(t => ({
    ...t,
    total:   eligible.filter(r => assignedStreams.get(r.student.id) === t.key).length,
    boys:    eligible.filter(r => assignedStreams.get(r.student.id) === t.key && r.student.sexe === "M").length,
    girls:   eligible.filter(r => assignedStreams.get(r.student.id) === t.key && r.student.sexe === "F").length,
  })).filter(t => t.total > 0);

  const pieData     = byTrack.map(t => ({ name: t.label, value: t.total, fill: t.pie }));
  const genderData  = byTrack.map(t => ({ name: t.label, ذكور: t.boys, إناث: t.girls }));
  const statusPie   = [
    { name: "مؤهلون للتوجيه", value: eligible.length, fill: "#10b981" },
    { name: "غير مؤهلين",     value: notEligible.length, fill: "#f43f5e" },
    { name: "بدون نتيجة",     value: noResult.length,    fill: "#94a3b8" },
  ].filter(d => d.value > 0);

  const successRate = results.length > 0 ? Math.round((eligible.length / results.length) * 100) : 0;
  const avgAvg = eligible.length > 0
    ? (eligible.reduce((s, r) => s + (r.annualAvg ?? 0), 0) / eligible.length).toFixed(2)
    : "—";
  const topStudent = [...eligible].sort((a, b) => (b.annualAvg ?? 0) - (a.annualAvg ?? 0))[0];

  const today = new Date().toLocaleDateString("ar-DZ", { year: "numeric", month: "long", day: "numeric" });

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }} className="p-6 space-y-6 max-w-6xl mx-auto">

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 no-print">
        <div>
          <h1 className="text-2xl font-black bg-gradient-to-r from-rose-600 to-pink-500 bg-clip-text text-transparent flex items-center gap-2.5">
            <span className="inline-flex w-9 h-9 rounded-xl bg-gradient-to-br from-rose-500 to-pink-600 items-center justify-center shadow-lg shadow-rose-500/30">
              <FileBarChart className="w-4.5 h-4.5 text-white" />
            </span>
            تقارير إعلامية — التوجيه المسبق
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5 ms-11">إحصائيات وتحليلات توجيه تلاميذ 4AM</p>
        </div>
        <div className="flex items-center gap-2 no-print">
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger className="w-36 h-9 bg-gradient-to-r from-rose-600 to-pink-600 text-white border-0 shadow-lg font-semibold text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>{YEARS.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
          </Select>
          <Button size="sm" className="gap-1.5 h-9 text-xs bg-gradient-to-r from-emerald-500 to-green-600 text-white border-0" onClick={() => window.print()}>
            <Printer className="w-3.5 h-3.5" /> طباعة
          </Button>
        </div>
      </div>

      <div className="hidden print-only border-b pb-3">
        <h1 className="text-xl font-black">التقرير الإعلامي للتوجيه المسبق — {year}</h1>
        <p className="text-sm text-gray-500">تاريخ: {today}</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <motion.div className="w-10 h-10 rounded-full border-2 border-rose-500 border-t-transparent"
            animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} />
        </div>
      ) : results.length === 0 ? (
        <div className="text-center py-20">
          <GraduationCap className="w-14 h-14 mx-auto mb-4 text-muted-foreground/30" />
          <p className="text-muted-foreground">لا توجد بيانات لهذه السنة الدراسية</p>
        </div>
      ) : (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 print-section">
            {[
              { label: "إجمالي تلاميذ 4AM", value: results.length, icon: Users,       gradient: "from-slate-600 to-slate-800",    isNum: true },
              { label: "مؤهلون للتوجيه",   value: eligible.length, icon: TrendingUp,  gradient: "from-emerald-600 to-green-800",  isNum: true },
              { label: "نسبة التأهيل",      value: successRate,     icon: Award,       gradient: "from-blue-600 to-indigo-800",    isNum: true, suffix: "%" },
              { label: "معدل الموجَّهين",   value: 0, icon: GraduationCap, gradient: "from-violet-600 to-purple-800", isNum: false, text: avgAvg },
            ].map((k, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
                <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${k.gradient} p-4 shadow-lg`}>
                  <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "radial-gradient(circle at 80% 20%, rgba(255,255,255,0.4) 0%, transparent 60%)" }} />
                  <div className="relative flex items-center justify-between mb-1">
                    <p className="text-white/80 text-xs font-semibold leading-tight">{k.label}</p>
                    <k.icon className="w-4 h-4 text-white/60 shrink-0" />
                  </div>
                  <p className="text-white font-black text-3xl relative">
                    {k.isNum ? <><CountUp to={k.value} />{k.suffix ?? ""}</> : k.text}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>

          {topStudent && (
            <div className="flex items-center gap-4 p-4 rounded-2xl bg-gradient-to-r from-amber-500/10 to-yellow-500/5 border border-amber-500/20 print-section">
              <div className="text-3xl">🏆</div>
              <div>
                <p className="text-xs text-muted-foreground">أعلى معدل في 4AM</p>
                <p className="font-black text-lg text-amber-700 dark:text-amber-300">{topStudent.student.nomPrenom}</p>
                <p className="text-sm font-bold text-muted-foreground">
                  {topStudent.annualAvg?.toFixed(2)}/20 — {getTrack(assignedStreams.get(topStudent.student.id))?.label} — {topStudent.student.classe}
                </p>
              </div>
            </div>
          )}

          {/* Charts row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 print-section">
            {/* Status pie */}
            <Card className="border-0 bg-card/80 shadow-md">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-rose-500" />وضعية التلاميذ
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={statusPie} cx="50%" cy="50%" innerRadius={45} outerRadius={68} paddingAngle={3} dataKey="value">
                      {statusPie.map((e, i) => <Cell key={i} fill={e.fill} />)}
                    </Pie>
                    <Tooltip content={<MiniTooltip />} />
                    <Legend iconType="circle" iconSize={8} formatter={v => <span className="text-xs">{v}</span>} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Track pie */}
            <Card className="border-0 bg-card/80 shadow-md">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-500" />توزيع المسارات
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={68} paddingAngle={3} dataKey="value">
                      {pieData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                    </Pie>
                    <Tooltip content={<MiniTooltip />} />
                    <Legend iconType="circle" iconSize={8} formatter={v => <span className="text-xs">{v}</span>} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Gender by track bar */}
            <Card className="border-0 bg-card/80 shadow-md">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-pink-500" />الجنس حسب المسار
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={genderData} barSize={12}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.08} />
                    <XAxis dataKey="name" tick={{ fontSize: 9 }} interval={0} angle={-30} textAnchor="end" height={45} />
                    <YAxis tick={{ fontSize: 9 }} />
                    <Tooltip content={<MiniTooltip />} />
                    <Bar dataKey="ذكور" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="إناث" fill="#ec4899" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Summary table */}
          <Card className="border-0 bg-card/80 shadow-md overflow-hidden print-section">
            <CardHeader className="pb-2 border-b">
              <CardTitle className="text-sm font-bold">ملخص إحصائي حسب المسار</CardTitle>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/60 border-b text-muted-foreground text-xs">
                    <th className="p-3 text-right">المسار</th>
                    <th className="p-3 text-center">العدد الإجمالي</th>
                    <th className="p-3 text-center text-blue-500">ذكور</th>
                    <th className="p-3 text-center text-pink-500">إناث</th>
                    <th className="p-3 text-center">النسبة</th>
                  </tr>
                </thead>
                <tbody>
                  {byTrack.map((t, i) => (
                    <tr key={t.label} className={`border-b last:border-0 hover:bg-muted/30 ${i % 2 !== 0 ? "bg-muted/10" : ""}`}>
                      <td className="p-3 font-bold">
                        <span className="inline-block w-2.5 h-2.5 rounded-full me-2" style={{ backgroundColor: t.pie }} />
                        {t.label}
                      </td>
                      <td className="p-3 text-center font-black text-lg">{t.total}</td>
                      <td className="p-3 text-center text-blue-600 font-semibold">{t.boys}</td>
                      <td className="p-3 text-center text-pink-600 font-semibold">{t.girls}</td>
                      <td className="p-3 text-center">
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-muted">
                          {eligible.length > 0 ? Math.round((t.total / eligible.length) * 100) : 0}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 font-bold bg-muted/40">
                    <td className="p-3">الإجمالي</td>
                    <td className="p-3 text-center">{eligible.length}</td>
                    <td className="p-3 text-center text-blue-600">{eligible.filter(r => r.student.sexe === "M").length}</td>
                    <td className="p-3 text-center text-pink-600">{eligible.filter(r => r.student.sexe === "F").length}</td>
                    <td className="p-3 text-center">100%</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>
        </>
      )}
    </motion.div>
  );
}
