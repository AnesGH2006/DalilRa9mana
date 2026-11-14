import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RefreshCw } from "lucide-react";

const BASE = import.meta.env.BASE_URL;
const CURRENT_YEAR = "2024-2025";

interface ResultRow {
  student: { id: string; firstName: string; lastName: string; niveau: string; classe: string; };
  annualAvg: number | null;
  passed: boolean;
  rank: number | null;
}

// Students who are in the transfer zone: avg 8-9.99 (could pass by remedial/council decision)
export default function TransferResultsPage() {
  const [results, setResults] = useState<ResultRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${BASE}api/results?annee=${CURRENT_YEAR}`, { credentials: "include" });
      if (res.ok) setResults(await res.json());
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Students in the "remedial zone": avg between 8 and 9.99
  const remedialZone = results
    .filter(r => r.annualAvg !== null && r.annualAvg >= 8 && r.annualAvg < 10)
    .sort((a, b) => (b.annualAvg ?? 0) - (a.annualAvg ?? 0));

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
      className="p-6 space-y-6 max-w-4xl mx-auto"
    >
      <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <RefreshCw className="w-6 h-6 text-cyan-500" />
          نتائج المنتقلين بالاستدراك
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          التلاميذ في منطقة الاستدراك — المعدل بين 8 و 9.99
        </p>
      </motion.div>

      {/* Info banner */}
      <motion.div
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        className="rounded-xl bg-cyan-50 dark:bg-cyan-950/30 border border-cyan-200 dark:border-cyan-800 p-4 flex gap-3 items-start"
      >
        <RefreshCw className="w-5 h-5 text-cyan-500 mt-0.5 shrink-0" />
        <div>
          <p className="font-semibold text-cyan-700 dark:text-cyan-400 text-sm">الانتقال بالاستدراك</p>
          <p className="text-xs text-cyan-600 dark:text-cyan-500 mt-0.5">
            التلاميذ الذين حصلوا على معدل بين 8 و 10 يمكن أن ينتقلوا إلى المستوى التالي بقرار من مجلس القسم.
          </p>
        </div>
      </motion.div>

      {!loading && (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-cyan-50 dark:bg-cyan-950/30 p-4 text-center">
            <p className="text-3xl font-extrabold text-cyan-600 dark:text-cyan-400">{remedialZone.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">في منطقة الاستدراك</p>
          </div>
          <div className="rounded-xl bg-muted/50 p-4 text-center">
            <p className="text-3xl font-extrabold text-foreground">
              {remedialZone.length > 0 ? remedialZone[0]!.annualAvg!.toFixed(2) : "—"}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">أعلى معدل (استدراك)</p>
          </div>
        </div>
      )}

      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div key="loading" className="space-y-2">
            {[...Array(4)].map((_, i) => (
              <motion.div key={i} className="h-16 rounded-xl bg-muted"
                animate={{ opacity: [0.3, 0.6, 0.3] }}
                transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.1 }} />
            ))}
          </motion.div>
        ) : remedialZone.length === 0 ? (
          <motion.div key="empty"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="rounded-2xl border border-dashed p-14 text-center text-muted-foreground">
            <RefreshCw className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p className="font-semibold">لا يوجد تلاميذ في منطقة الاستدراك</p>
          </motion.div>
        ) : (
          <motion.div key="list" className="space-y-2">
            {remedialZone.map((r, i) => {
              const pct = ((r.annualAvg! - 8) / 2) * 100; // 8–10 range
              return (
                <motion.div key={r.student.id}
                  initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="flex items-center gap-4 bg-card border border-cyan-200/60 dark:border-cyan-900/60 rounded-xl p-4"
                >
                  <div className="w-9 h-9 rounded-xl bg-cyan-100 dark:bg-cyan-950/50 flex items-center justify-center shrink-0">
                    <RefreshCw className="w-4 h-4 text-cyan-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm">{r.student.firstName} {r.student.lastName}</p>
                    <p className="text-xs text-muted-foreground">{r.student.niveau} — قسم {r.student.classe}</p>
                    {/* Bar showing proximity to 10 */}
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                        <motion.div className="h-full bg-cyan-500 rounded-full"
                          initial={{ width: 0 }} animate={{ width: `${pct}%` }}
                          transition={{ delay: i * 0.05 + 0.3, duration: 0.6 }} />
                      </div>
                      <span className="text-[10px] text-cyan-600 dark:text-cyan-400">
                        {(10 - r.annualAvg!).toFixed(2)} نقطة للنجاح
                      </span>
                    </div>
                  </div>
                  <span className="text-xl font-extrabold text-cyan-600 dark:text-cyan-400 tabular-nums shrink-0">
                    {r.annualAvg!.toFixed(2)}
                  </span>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
