import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { CircleArrowRight, Printer, Users, GraduationCap } from "lucide-react";
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { allocateFourAMStreams, getFourAMCapacities } from "@/lib/4am-stream-allocation";
import { useOrientationWishes } from "@/hooks/use-orientation-wishes";
import type { StudentResult } from "@shared/types";

const BASE = import.meta.env.BASE_URL;
const YEARS = ["2026-2027", "2025-2026", "2024-2025", "2023-2024"];

const TRACKS = [
  { key: "science", label: "جذع مشترك علوم وتكنولوجيا", color: "from-blue-500 to-blue-700", badge: "bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300", pie: "#3b82f6" },
  { key: "arts", label: "جذع مشترك آداب", color: "from-violet-500 to-purple-700", badge: "bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300", pie: "#8b5cf6" },
];

function getTrack(stream: "science" | "arts" | undefined) {
  return TRACKS.find(track => track.key === stream) ?? null;
}

function MiniTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-background border rounded-lg shadow-xl p-2.5 text-xs">
      <p className="font-bold">{payload[0].name}: {payload[0].value} تلميذ</p>
    </div>
  );
}

export default function PreOrientFirstPage() {
  const [year, setYear] = useState(() => localStorage.getItem("cem-selected-year") || "2026-2027");
  const [results, setResults] = useState<StudentResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTrack, setActiveTrack] = useState<string | null>(null);

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
  const eligible = results
    .filter(r => assignedStreams.has(r.student.id))
    .sort((a, b) => (b.annualAvg ?? 0) - (a.annualAvg ?? 0));

  const byTrack = TRACKS.map(t => ({
    ...t,
    students: eligible.filter(r => assignedStreams.get(r.student.id) === t.key),
  })).filter(t => t.students.length > 0);

  const pieData = byTrack.map(t => ({ name: t.label, value: t.students.length, fill: t.pie }));

  const displayStudents = activeTrack
    ? eligible.filter(r => getTrack(assignedStreams.get(r.student.id))?.label === activeTrack)
    : eligible;

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }} className="p-6 space-y-6 max-w-6xl mx-auto">

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 no-print">
        <div>
          <h1 className="text-2xl font-black bg-gradient-to-r from-blue-600 to-violet-500 bg-clip-text text-transparent flex items-center gap-2.5">
            <span className="inline-flex w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 items-center justify-center shadow-lg shadow-blue-500/30">
              <CircleArrowRight className="w-4.5 h-4.5 text-white" />
            </span>
            التوجيه المسبق الأول
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5 ms-11">توزيع تلاميذ 4AM الناجحين حسب المعدل العلمي الموزون وسعة المقاعد</p>
        </div>
        <div className="flex items-center gap-2 no-print">
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger className="w-36 h-9 bg-gradient-to-r from-blue-600 to-violet-600 text-white border-0 shadow-lg font-semibold text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>{YEARS.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
          </Select>
          <Button size="sm" variant="outline" className="gap-1.5 h-9 text-xs" onClick={() => window.print()}>
            <Printer className="w-3.5 h-3.5" /> طباعة
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <motion.div className="w-10 h-10 rounded-full border-2 border-blue-500 border-t-transparent"
            animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} />
        </div>
      ) : eligible.length === 0 ? (
        <div className="text-center py-20">
          <GraduationCap className="w-14 h-14 mx-auto mb-4 text-muted-foreground/30" />
          <p className="text-muted-foreground">لا توجد بيانات لتلاميذ 4AM لهذه السنة الدراسية</p>
        </div>
      ) : (
        <>
          {/* Track summary cards + pie chart */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2 grid grid-cols-2 sm:grid-cols-3 gap-3">
              {byTrack.map((t, i) => (
                <motion.button key={t.label}
                  initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
                  onClick={() => setActiveTrack(activeTrack === t.label ? null : t.label)}
                  className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${t.color} p-4 shadow-lg text-right transition-all hover:scale-105
                    ${activeTrack === t.label ? "ring-2 ring-white/50 scale-105" : ""}`}>
                  <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "radial-gradient(circle at 80% 20%, rgba(255,255,255,0.4) 0%, transparent 60%)" }} />
                  <p className="text-white/80 text-xs font-semibold mb-1 relative">{t.label}</p>
                  <p className="text-white font-black text-3xl relative">{t.students.length}</p>
                  <p className="text-white/60 text-[10px] relative mt-0.5">تلميذ</p>
                </motion.button>
              ))}
              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: byTrack.length * 0.07 }}
                className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-600 to-slate-800 p-4 shadow-lg">
                <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "radial-gradient(circle at 80% 20%, rgba(255,255,255,0.4) 0%, transparent 60%)" }} />
                <p className="text-white/80 text-xs font-semibold mb-1 relative">الإجمالي</p>
                <p className="text-white font-black text-3xl relative">{eligible.length}</p>
                <p className="text-white/60 text-[10px] relative mt-0.5">مؤهل للتوجيه</p>
              </motion.div>
            </div>
            <Card className="border-0 bg-card/80 shadow-md">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-500" />توزيع المسارات
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3} dataKey="value">
                      {pieData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                    </Pie>
                    <Tooltip content={<MiniTooltip />} />
                    <Legend iconType="circle" iconSize={8} formatter={(v) => <span className="text-xs">{v}</span>} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Active track filter chip */}
          {activeTrack && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">عرض:</span>
              <button onClick={() => setActiveTrack(null)}
                className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 text-xs font-bold hover:bg-blue-200 transition-colors">
                {activeTrack} ({displayStudents.length}) ✕
              </button>
            </div>
          )}

          {/* Students table */}
          <Card className="border-0 bg-card/80 shadow-md overflow-hidden">
            <CardHeader className="pb-2 border-b">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-500" />
                {activeTrack ? `تلاميذ ${activeTrack}` : "جميع التلاميذ المؤهلين"} ({displayStudents.length})
              </CardTitle>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 border-b text-muted-foreground text-xs">
                    <th className="p-3 text-center w-10">الرتبة</th>
                    <th className="p-3 text-right">الاسم</th>
                    <th className="p-3 text-center">الجنس</th>
                    <th className="p-3 text-center">القسم</th>
                    <th className="p-3 text-center">المعدل</th>
                    <th className="p-3 text-center">المسار</th>
                  </tr>
                </thead>
                <tbody>
                  {displayStudents.map((r, i) => {
                    const track = getTrack(assignedStreams.get(r.student.id));
                    return (
                      <motion.tr key={r.student.id}
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.01 }}
                        className={`border-b last:border-0 hover:bg-muted/30 transition-colors ${i % 2 !== 0 ? "bg-muted/10" : ""}`}>
                        <td className="p-3 text-center font-mono text-xs text-muted-foreground">
                          {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
                        </td>
                        <td className="p-3 font-semibold">{r.student.nomPrenom}</td>
                        <td className="p-3 text-center">
                          <Badge variant="outline" className={`text-xs ${r.student.sexe === "M" ? "border-blue-300 text-blue-600" : "border-pink-300 text-pink-600"}`}>
                            {r.student.sexe === "M" ? "ذكر" : "أنثى"}
                          </Badge>
                        </td>
                        <td className="p-3 text-center"><Badge variant="outline" className="text-xs">{r.student.classe}</Badge></td>
                        <td className="p-3 text-center font-black text-emerald-600">{r.annualAvg?.toFixed(2)}</td>
                        <td className="p-3 text-center">
                          {track && <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${track.badge}`}>{track.label}</span>}
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </motion.div>
  );
}
