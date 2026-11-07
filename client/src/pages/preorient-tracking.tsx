import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClipboardList, Search, Users, CheckCircle2, Clock, Filter } from "lucide-react";
import { allocateFourAMStreams, getFourAMCapacities } from "@/lib/4am-stream-allocation";
import { useOrientationWishes } from "@/hooks/use-orientation-wishes";
import type { StudentResult } from "@shared/types";

const BASE = import.meta.env.BASE_URL;
const YEARS = ["2026-2027", "2025-2026", "2024-2025", "2023-2024"];

const TRACKS = [
  { key: "science", label: "جذع مشترك علوم وتكنولوجيا", color: "bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300" },
  { key: "arts", label: "جذع مشترك آداب", color: "bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300" },
];

function getTrack(stream: "science" | "arts" | undefined) {
  return TRACKS.find(track => track.key === stream) ?? null;
}

export default function PreOrientTrackingPage() {
  const [year, setYear] = useState(() => localStorage.getItem("cem-selected-year") || "2026-2027");
  const [results, setResults] = useState<StudentResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [filterTrack, setFilterTrack] = useState("all");

  const fetchData = useCallback(async (y: string) => {
    setLoading(true);
    try {
      const res = await fetch(`${BASE}api/results?annee=${y}&niveau=4AM`, { credentials: "include" });
      if (res.ok) setResults(await res.json());
      else setResults([]);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(year); localStorage.setItem("cem-selected-year", year); }, [year, fetchData]);

  const wishes = useOrientationWishes(year);
  const assignedStreams = allocateFourAMStreams(results, getFourAMCapacities(year), wishes);
  const filtered = results.filter(r => {
    const matchQ = !q || r.student.nomPrenom.toLowerCase().includes(q.toLowerCase()) || r.student.classe.toLowerCase().includes(q.toLowerCase());
    const track = getTrack(assignedStreams.get(r.student.id));
    const matchT = filterTrack === "all" || track?.label === filterTrack;
    return matchQ && matchT;
  }).sort((a, b) => (b.annualAvg ?? 0) - (a.annualAvg ?? 0));

  const passed = results.filter(r => r.annualAvg !== null && r.annualAvg >= 10);
  const notPassed = results.filter(r => r.annualAvg !== null && r.annualAvg < 10);

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }} className="p-6 space-y-6 max-w-6xl mx-auto">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black bg-gradient-to-r from-teal-600 to-cyan-500 bg-clip-text text-transparent flex items-center gap-2.5">
            <span className="inline-flex w-9 h-9 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-600 items-center justify-center shadow-lg shadow-teal-500/30">
              <ClipboardList className="w-4.5 h-4.5 text-white" />
            </span>
            سجل المتابعة و التوجيه
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5 ms-11">قائمة تلاميذ 4 AM والمسار المقترح</p>
        </div>
        <Select value={year} onValueChange={setYear}>
          <SelectTrigger className="w-36 h-9 bg-gradient-to-r from-teal-600 to-cyan-600 text-white border-0 shadow-lg font-semibold text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>{YEARS.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "إجمالي 4AM", value: results.length, gradient: "from-slate-600 to-slate-800", icon: Users },
          { label: "مؤهلون للتوجيه", value: passed.length, gradient: "from-emerald-500 to-green-600", icon: CheckCircle2 },
          { label: "غير مؤهلين", value: notPassed.length, gradient: "from-red-500 to-rose-600", icon: Clock },
          { label: "بدون معدل", value: results.filter(r => r.annualAvg === null).length, gradient: "from-gray-500 to-gray-700", icon: Clock },
        ].map((k, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
            <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${k.gradient} p-4 shadow-lg`}>
              <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "radial-gradient(circle at 80% 20%, rgba(255,255,255,0.4) 0%, transparent 60%)" }} />
              <div className="relative flex items-center justify-between mb-1">
                <p className="text-white/80 text-xs font-semibold">{k.label}</p>
                <k.icon className="w-4 h-4 text-white/60" />
              </div>
              <p className="text-white font-black text-3xl relative">{k.value}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input className="ps-9 h-9 text-sm" placeholder="بحث باسم التلميذ أو القسم..." value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <Select value={filterTrack} onValueChange={setFilterTrack}>
          <SelectTrigger className="w-44 h-9 text-xs">
            <Filter className="w-3.5 h-3.5 me-1.5 text-muted-foreground" />
            <SelectValue placeholder="كل المسارات" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل المسارات</SelectItem>
            {TRACKS.map(t => <SelectItem key={t.label} value={t.label}>{t.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card className="border-0 bg-card/80 shadow-md overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <motion.div className="w-10 h-10 rounded-full border-3 border-teal-500 border-t-transparent mx-auto"
              animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <ClipboardList className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-muted-foreground">{results.length === 0 ? "لا توجد بيانات لتلاميذ 4AM لهذه السنة" : "لا توجد نتائج مطابقة"}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/60 border-b text-muted-foreground text-xs">
                  <th className="p-3 text-center w-10">#</th>
                  <th className="p-3 text-right">الاسم</th>
                  <th className="p-3 text-center">القسم</th>
                  <th className="p-3 text-center">المعدل السنوي</th>
                  <th className="p-3 text-center">المسار المقترح</th>
                  <th className="p-3 text-center">الوضعية</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => {
                  const track = getTrack(assignedStreams.get(r.student.id));
                  const eligible = r.annualAvg !== null && r.annualAvg >= 10;
                  return (
                    <motion.tr key={r.student.id}
                      initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.015, duration: 0.2 }}
                      className={`border-b last:border-0 hover:bg-muted/30 transition-colors ${i % 2 !== 0 ? "bg-muted/10" : ""}`}>
                      <td className="p-3 text-center text-muted-foreground text-xs font-mono">{i + 1}</td>
                      <td className="p-3 font-semibold">{r.student.nomPrenom}</td>
                      <td className="p-3 text-center"><Badge variant="outline" className="text-xs">{r.student.classe}</Badge></td>
                      <td className="p-3 text-center">
                        {r.annualAvg !== null ? (
                          <span className={`font-black text-base ${r.annualAvg >= 10 ? "text-emerald-600" : r.annualAvg >= 9 ? "text-amber-600" : "text-red-500"}`}>
                            {r.annualAvg.toFixed(2)}
                          </span>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="p-3 text-center">
                        {track && eligible ? (
                          <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${track.color}`}>{track.label}</span>
                        ) : <span className="text-muted-foreground text-xs">—</span>}
                      </td>
                      <td className="p-3 text-center">
                        {r.annualAvg === null
                          ? <Badge variant="outline" className="text-xs text-muted-foreground">بدون نتيجة</Badge>
                          : eligible
                          ? <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-0 text-xs">مؤهل</Badge>
                          : <Badge className="bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300 border-0 text-xs">غير مؤهل</Badge>}
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="text-xs text-muted-foreground text-center">{filtered.length} تلميذ معروض</p>
    </motion.div>
  );
}
