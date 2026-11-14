import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClipboardList, Users, TrendingUp, Award } from "lucide-react";

const BASE = import.meta.env.BASE_URL;
const CURRENT_YEAR = "2024-2025";
const LEVELS = ["1AM", "2AM", "3AM", "4AM"] as const;

interface ResultRow {
  student: { id: string; firstName: string; lastName: string; niveau: string; classe: string; };
  annualAvg: number | null;
  t1Avg: number | null;
  t2Avg: number | null;
  t3Avg: number | null;
  passed: boolean;
  rank: number | null;
}

// Group results by class
function groupByClass(results: ResultRow[]) {
  const map: Record<string, ResultRow[]> = {};
  for (const r of results) {
    const key = `${r.student.niveau}-${r.student.classe}`;
    map[key] ??= [];
    map[key]!.push(r);
  }
  return map;
}

function ClassCouncilCard({ classKey, rows, trimestre, index }: {
  classKey: string; rows: ResultRow[]; trimestre: string; index: number;
}) {
  const [niveau, classe] = classKey.split("-");
  const withAvg = rows.filter(r => r.annualAvg !== null);
  const passed = rows.filter(r => r.passed).length;
  const avg = withAvg.length
    ? withAvg.reduce((s, r) => s + (r.annualAvg ?? 0), 0) / withAvg.length
    : null;
  const top = withAvg.sort((a, b) => (b.annualAvg ?? 0) - (a.annualAvg ?? 0))[0];
  const passRate = withAvg.length ? Math.round((passed / withAvg.length) * 100) : 0;

  const getTrimAvg = (r: ResultRow) => {
    if (trimestre === "1") return r.t1Avg;
    if (trimestre === "2") return r.t2Avg;
    if (trimestre === "3") return r.t3Avg;
    return r.annualAvg;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: index * 0.08, duration: 0.4 }}
      whileHover={{ y: -4, boxShadow: "0 8px 30px rgba(0,0,0,0.1)" }}
      className="rounded-2xl border bg-card overflow-hidden shadow-sm"
    >
      {/* Header */}
      <div className="bg-gradient-to-l from-violet-50 to-indigo-50 dark:from-violet-950/30 dark:to-indigo-950/20 px-5 py-4 border-b flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-500 flex items-center justify-center shadow-md shadow-violet-200 dark:shadow-violet-900">
            <ClipboardList className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="font-bold text-foreground">قسم {classe}</p>
            <p className="text-xs text-muted-foreground">{niveau}</p>
          </div>
        </div>
        <motion.div
          className={`text-2xl font-extrabold ${avg !== null && avg >= 10 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}
          initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: index * 0.08 + 0.3, type: "spring", stiffness: 300 }}>
          {avg !== null ? avg.toFixed(2) : "—"}
        </motion.div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 divide-x rtl:divide-x-reverse divide-border p-0">
        {[
          { icon: Users, label: "عدد التلاميذ", value: rows.length, color: "text-blue-600" },
          { icon: Award, label: "نسبة النجاح",  value: `${passRate}%`, color: passRate >= 50 ? "text-emerald-600" : "text-red-500" },
          { icon: TrendingUp, label: "المتفوق", value: top ? `${top.student.firstName}` : "—", color: "text-amber-600" },
        ].map((s, i) => (
          <motion.div key={i} className="p-3 text-center"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: index * 0.08 + 0.4 + i * 0.05 }}>
            <s.icon className={`w-4 h-4 mx-auto mb-1 ${s.color}`} />
            <p className={`font-bold text-sm ${s.color}`}>{s.value}</p>
            <p className="text-[10px] text-muted-foreground">{s.label}</p>
          </motion.div>
        ))}
      </div>

      {/* Mini results */}
      <div className="p-4 space-y-1.5 border-t max-h-48 overflow-y-auto">
        {rows
          .map(r => ({ ...r, tAvg: getTrimAvg(r) }))
          .sort((a, b) => (b.tAvg ?? 0) - (a.tAvg ?? 0))
          .slice(0, 8)
          .map((r, i) => (
            <div key={r.student.id} className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground w-4 tabular-nums text-center">{i + 1}</span>
              <span className="flex-1 truncate font-medium">{r.student.firstName} {r.student.lastName}</span>
              <span className={`tabular-nums font-bold ${(r.tAvg ?? 0) >= 10 ? "text-emerald-600" : "text-red-500"}`}>
                {r.tAvg !== null ? r.tAvg.toFixed(2) : "—"}
              </span>
            </div>
          ))}
      </div>
    </motion.div>
  );
}

export default function CouncilsPage() {
  const [results, setResults] = useState<ResultRow[]>([]);
  const [niveau, setNiveau] = useState<string>("");
  const [trimestre, setTrimestre] = useState<string>("3");
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ annee: CURRENT_YEAR });
      if (niveau) p.set("niveau", niveau);
      const res = await fetch(`${BASE}api/results?${p}`, { credentials: "include" });
      if (res.ok) setResults(await res.json());
    } finally { setLoading(false); }
  }, [niveau]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const groups = groupByClass(results);
  const classKeys = Object.keys(groups).sort();

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
      className="p-6 space-y-6 max-w-6xl mx-auto"
    >
      <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ClipboardList className="w-6 h-6 text-violet-500" />
          مجالس الأقسام
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          ملخص كل قسم — النتائج والإحصائيات لكل مجلس
        </p>
      </motion.div>

      <div className="flex gap-3 flex-wrap">
        <Select value={niveau || "__all__"} onValueChange={v => setNiveau(v === "__all__" ? "" : v)}>
          <SelectTrigger className="w-36"><SelectValue placeholder="كل المستويات" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">كل المستويات</SelectItem>
            {LEVELS.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={trimestre} onValueChange={setTrimestre}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="1">الفصل الأول</SelectItem>
            <SelectItem value="2">الفصل الثاني</SelectItem>
            <SelectItem value="3">الفصل الثالث</SelectItem>
            <SelectItem value="annual">السنوي</SelectItem>
          </SelectContent>
        </Select>
        {!loading && <span className="ms-auto text-sm text-muted-foreground self-center">{classKeys.length} قسم</span>}
      </div>

      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div key="loading" className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[...Array(4)].map((_, i) => (
              <motion.div key={i} className="h-64 rounded-2xl bg-muted"
                animate={{ opacity: [0.3, 0.6, 0.3] }} transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.15 }} />
            ))}
          </motion.div>
        ) : classKeys.length === 0 ? (
          <motion.div key="empty"
            initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
            className="rounded-2xl border border-dashed p-16 text-center text-muted-foreground">
            <motion.div animate={{ y: [0, -8, 0] }} transition={{ duration: 3, repeat: Infinity }}>
              <ClipboardList className="w-14 h-14 mx-auto mb-4 opacity-20" />
            </motion.div>
            <p className="font-semibold">لا توجد أقسام</p>
            <p className="text-sm mt-1">أضف تلاميذ وأدخل نتائجهم أولاً</p>
          </motion.div>
        ) : (
          <motion.div key="grid" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {classKeys.map((key, i) => (
              <ClassCouncilCard key={key} classKey={key} rows={groups[key]!}
                trimestre={trimestre} index={i} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
