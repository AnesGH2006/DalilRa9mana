import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { CircleDot, Printer, Users, RefreshCw } from "lucide-react";
import { allocateFourAMStreams, getFourAMCapacities } from "@/lib/4am-stream-allocation";
import { useOrientationWishes } from "@/hooks/use-orientation-wishes";
import type { StudentResult } from "@shared/types";

const BASE = import.meta.env.BASE_URL;
const YEARS = ["2026-2027", "2025-2026", "2024-2025", "2023-2024"];

const TRACKS = [
  { key: "science", label: "جذع مشترك علوم وتكنولوجيا", badge: "bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300", gradient: "from-blue-500 to-blue-700" },
  { key: "arts", label: "جذع مشترك آداب", badge: "bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300", gradient: "from-violet-500 to-purple-700" },
];

function getTrack(stream: "science" | "arts" | undefined) {
  return TRACKS.find(track => track.key === stream) ?? null;
}

export default function PreOrientSecondPage() {
  const [year, setYear] = useState(() => localStorage.getItem("cem-selected-year") || "2026-2027");
  const [results, setResults] = useState<StudentResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [overrides, setOverrides] = useState<Record<string, string>>({});

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

  const changeCount = Object.keys(overrides).length;

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }} className="p-6 space-y-6 max-w-6xl mx-auto">

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black bg-gradient-to-r from-violet-600 to-fuchsia-500 bg-clip-text text-transparent flex items-center gap-2.5">
            <span className="inline-flex w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 items-center justify-center shadow-lg shadow-violet-500/30">
              <CircleDot className="w-4.5 h-4.5 text-white" />
            </span>
            التوجيه المسبق الثاني
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5 ms-11">مراجعة وتعديل التوجيه — الدورة الثانية</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger className="w-36 h-9 bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white border-0 shadow-lg font-semibold text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>{YEARS.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
          </Select>
          <Button size="sm" variant="outline" className="gap-1.5 h-9 text-xs" onClick={() => window.print()}>
            <Printer className="w-3.5 h-3.5" /> طباعة
          </Button>
        </div>
      </div>

      {/* Info banner */}
      <div className="flex items-center gap-3 p-4 rounded-xl bg-gradient-to-r from-violet-500/10 to-fuchsia-500/5 border border-violet-500/20">
        <RefreshCw className="w-5 h-5 text-violet-500 shrink-0" />
        <div>
          <p className="text-sm font-bold text-violet-700 dark:text-violet-300">مرحلة المراجعة</p>
          <p className="text-xs text-muted-foreground mt-0.5">يمكنك في هذه المرحلة تعديل مسار أي تلميذ بناءً على طلب الأسرة أو القرار البيداغوجي. التغييرات تُحفظ محلياً.</p>
        </div>
      </div>

      {changeCount > 0 && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
          <p className="text-sm font-bold text-amber-700 dark:text-amber-300">
            {changeCount} تغيير مسجّل في الدورة الثانية
          </p>
          <Button size="sm" variant="ghost" className="h-7 text-xs text-amber-600" onClick={() => setOverrides({})}>
            إلغاء الكل
          </Button>
        </motion.div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <motion.div className="w-10 h-10 rounded-full border-2 border-violet-500 border-t-transparent"
            animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} />
        </div>
      ) : eligible.length === 0 ? (
        <div className="text-center py-20">
          <CircleDot className="w-14 h-14 mx-auto mb-4 text-muted-foreground/30" />
          <p className="text-muted-foreground">لا توجد بيانات لتلاميذ 4AM لهذه السنة الدراسية</p>
        </div>
      ) : (
        <Card className="border-0 bg-card/80 shadow-md overflow-hidden">
          <CardHeader className="pb-2 border-b">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Users className="w-4 h-4 text-violet-500" />
              التلاميذ المؤهلون ({eligible.length})
              {changeCount > 0 && (
                <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border-0 ms-1 text-xs">
                  {changeCount} معدّل
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 border-b text-muted-foreground text-xs">
                  <th className="p-3 text-center w-10">#</th>
                  <th className="p-3 text-right">الاسم</th>
                  <th className="p-3 text-center">القسم</th>
                  <th className="p-3 text-center">المعدل</th>
                  <th className="p-3 text-center">المسار الأول</th>
                  <th className="p-3 text-center">المسار المعدّل</th>
                </tr>
              </thead>
              <tbody>
                {eligible.map((r, i) => {
                  const suggestedTrack = getTrack(assignedStreams.get(r.student.id));
                  const currentTrack = overrides[r.student.id] ?? suggestedTrack?.label ?? "";
                  const changed = overrides[r.student.id] && overrides[r.student.id] !== suggestedTrack?.label;
                  const trackObj = TRACKS.find(t => t.label === currentTrack);
                  return (
                    <tr key={r.student.id} className={`border-b last:border-0 hover:bg-muted/30 transition-colors ${i % 2 !== 0 ? "bg-muted/10" : ""} ${changed ? "bg-amber-50/50 dark:bg-amber-950/20" : ""}`}>
                      <td className="p-3 text-center font-mono text-xs text-muted-foreground">{i + 1}</td>
                      <td className="p-3 font-semibold">
                        {r.student.nomPrenom}
                        {changed && <span className="ms-2 text-[10px] px-1.5 py-0.5 rounded bg-amber-200 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300">معدّل</span>}
                      </td>
                      <td className="p-3 text-center"><Badge variant="outline" className="text-xs">{r.student.classe}</Badge></td>
                      <td className="p-3 text-center font-black text-emerald-600">{r.annualAvg?.toFixed(2)}</td>
                      <td className="p-3 text-center">
                        {suggestedTrack && (
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${suggestedTrack.badge}`}>{suggestedTrack.label}</span>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        <select
                          value={currentTrack}
                          onChange={e => {
                            const val = e.target.value;
                            setOverrides(prev => {
                              const next = { ...prev };
                              if (val === suggestedTrack?.label) delete next[r.student.id];
                              else next[r.student.id] = val;
                              return next;
                            });
                          }}
                          className={`text-xs font-semibold px-2 py-1 rounded-lg border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-violet-500 ${changed ? "border-amber-400" : "border-border"}`}
                        >
                          {TRACKS.map(t => (
                            <option key={t.label} value={t.label}>{t.label}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </motion.div>
  );
}
