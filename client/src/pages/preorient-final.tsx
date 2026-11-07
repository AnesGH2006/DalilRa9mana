import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Trophy, Printer, CheckCircle2, Users, GraduationCap } from "lucide-react";
import { allocateFourAMStreams, getFourAMCapacities } from "@/lib/4am-stream-allocation";
import { useOrientationWishes } from "@/hooks/use-orientation-wishes";
import type { StudentResult } from "@shared/types";

const BASE = import.meta.env.BASE_URL;
const YEARS = ["2026-2027", "2025-2026", "2024-2025", "2023-2024"];

const TRACKS = [
  { key: "science", label: "جذع مشترك علوم وتكنولوجيا", badge: "bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300", gradient: "from-blue-600 to-blue-800" },
  { key: "arts", label: "جذع مشترك آداب", badge: "bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300", gradient: "from-violet-600 to-purple-800" },
];

function getTrack(stream: "science" | "arts" | undefined) {
  return TRACKS.find(track => track.key === stream) ?? null;
}

export default function PreOrientFinalPage() {
  const [year, setYear] = useState(() => localStorage.getItem("cem-selected-year") || "2026-2027");
  const [results, setResults] = useState<StudentResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>("all");

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
  }));

  const displayStudents = activeTab === "all"
    ? eligible
    : eligible.filter(r => getTrack(assignedStreams.get(r.student.id))?.label === activeTab);

  const today = new Date().toLocaleDateString("ar-DZ", { year: "numeric", month: "long", day: "numeric" });

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }} className="p-6 space-y-6 max-w-6xl mx-auto">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 no-print">
        <div>
          <h1 className="text-2xl font-black bg-gradient-to-r from-amber-600 to-orange-500 bg-clip-text text-transparent flex items-center gap-2.5">
            <span className="inline-flex w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 items-center justify-center shadow-lg shadow-amber-500/30">
              <Trophy className="w-4.5 h-4.5 text-white" />
            </span>
            التوجيه النهائي
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5 ms-11">توزيع مقترح حسب المعدل الموزون وسعة المقاعد — {year}</p>
        </div>
        <div className="flex items-center gap-2 no-print">
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger className="w-36 h-9 bg-gradient-to-r from-amber-600 to-orange-600 text-white border-0 shadow-lg font-semibold text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>{YEARS.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
          </Select>
          <Button size="sm"
            className="gap-1.5 h-9 text-xs bg-gradient-to-r from-emerald-500 to-green-600 text-white border-0"
            onClick={() => window.print()}>
            <Printer className="w-3.5 h-3.5" /> طباعة القائمة النهائية
          </Button>
        </div>
      </div>

      {/* Print header */}
      <div className="hidden print-only border-b pb-3 mb-2">
        <h1 className="text-2xl font-black">قائمة التوجيه النهائي</h1>
        <p className="text-sm text-gray-600">السنة الدراسية: {year} | تاريخ: {today}</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <motion.div className="w-10 h-10 rounded-full border-2 border-amber-500 border-t-transparent"
            animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} />
        </div>
      ) : eligible.length === 0 ? (
        <div className="text-center py-20">
          <GraduationCap className="w-14 h-14 mx-auto mb-4 text-muted-foreground/30" />
          <p className="text-muted-foreground">لا توجد بيانات لهذه السنة الدراسية</p>
        </div>
      ) : (
        <>
          {/* Track KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {byTrack.filter(t => t.students.length > 0).map((t, i) => (
              <motion.div key={t.label} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
                <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${t.gradient} p-4 shadow-lg`}>
                  <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "radial-gradient(circle at 80% 20%, rgba(255,255,255,0.4) 0%, transparent 60%)" }} />
                  <p className="text-white/80 text-xs font-semibold mb-1 relative leading-tight">{t.label}</p>
                  <p className="text-white font-black text-3xl relative">{t.students.length}</p>
                  <div className="flex items-center gap-1 mt-1 relative">
                    <CheckCircle2 className="w-3 h-3 text-white/60" />
                    <p className="text-white/60 text-[10px]">
                      {Math.round((t.students.length / eligible.length) * 100)}%
                    </p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Tabs */}
          <div className="flex flex-wrap gap-2 no-print">
            <button onClick={() => setActiveTab("all")}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all ${activeTab === "all" ? "bg-amber-500 text-white shadow-md" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
              الكل ({eligible.length})
            </button>
            {byTrack.filter(t => t.students.length > 0).map(t => (
              <button key={t.label} onClick={() => setActiveTab(t.label)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all ${activeTab === t.label ? "bg-amber-500 text-white shadow-md" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
                {t.label} ({t.students.length})
              </button>
            ))}
          </div>

          {/* Table */}
          <Card className="border-0 bg-card/80 shadow-md overflow-hidden print-section">
            <CardHeader className="pb-2 border-b">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Users className="w-4 h-4 text-amber-500" />
                {activeTab === "all" ? "جميع التلاميذ الموجَّهين" : activeTab} ({displayStudents.length})
              </CardTitle>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 border-b text-muted-foreground text-xs">
                    <th className="p-3 text-center w-10">الرتبة</th>
                    <th className="p-3 text-right">الاسم الكامل</th>
                    <th className="p-3 text-center">الجنس</th>
                    <th className="p-3 text-center">القسم</th>
                    <th className="p-3 text-center">المعدل</th>
                    <th className="p-3 text-center">المسار النهائي</th>
                    <th className="p-3 text-center">الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {displayStudents.map((r, i) => {
                    const track = getTrack(assignedStreams.get(r.student.id));
                    return (
                      <motion.tr key={r.student.id}
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.01 }}
                        className={`border-b last:border-0 hover:bg-muted/20 transition-colors ${i % 2 !== 0 ? "bg-muted/10" : ""}`}>
                        <td className="p-3 text-center font-mono text-xs text-muted-foreground">
                          {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
                        </td>
                        <td className="p-3 font-bold">{r.student.nomPrenom}</td>
                        <td className="p-3 text-center">
                          <Badge variant="outline" className={`text-xs ${r.student.sexe === "M" ? "border-blue-300 text-blue-600" : "border-pink-300 text-pink-600"}`}>
                            {r.student.sexe === "M" ? "ذكر" : "أنثى"}
                          </Badge>
                        </td>
                        <td className="p-3 text-center"><Badge variant="outline" className="text-xs">{r.student.classe}</Badge></td>
                        <td className="p-3 text-center">
                          <span className="font-black text-emerald-600 text-base">{r.annualAvg?.toFixed(2)}</span>
                          <span className="text-muted-foreground text-xs">/20</span>
                        </td>
                        <td className="p-3 text-center">
                          {track && <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${track.badge}`}>{track.label}</span>}
                        </td>
                        <td className="p-3 text-center">
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full">
                            <CheckCircle2 className="w-3 h-3" /> مُوجَّه
                          </span>
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Print footer */}
          <div className="hidden print-only border-t pt-3 mt-4 text-xs text-gray-500 flex justify-between">
            <p>CEM Manager — مدير المتوسطة</p>
            <p>السنة الدراسية: {year} | تاريخ: {today}</p>
          </div>
        </>
      )}
    </motion.div>
  );
}
