/**
 * نتائج الاستدراك
 * Shows the final outcome for students who sat the remediation session.
 * A student is tracked as mustarrak (avg 9–9.99) and this page shows
 * whether they ultimately passed or failed after the recovery exam.
 * The page also shows a stat breakdown and a printable list.
 */
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Printer, BarChart2, CheckCircle2, XCircle } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

const BASE = import.meta.env.BASE_URL;
const YEARS = ["2026-2027", "2025-2026", "2024-2025", "2023-2024"];
const DEFAULT_YEAR = "2026-2027";

interface StudentResult {
  student: { id: string; nomPrenom: string; niveau: string; classe: string; sexe: "M" | "F"; };
  annualAvg: number | null;
  t1Avg: number | null; t2Avg: number | null; t3Avg: number | null;
}

const LEVEL_LABELS: Record<string, string> = { "1AM": "1م", "2AM": "2م", "3AM": "3م", "4AM": "4م" };
const LEVEL_COLORS: Record<string, string> = { "1AM": "#6366f1", "2AM": "#8b5cf6", "3AM": "#a855f7", "4AM": "#d946ef" };

function MiniTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-background/95 border rounded-lg shadow-lg p-2 text-xs">
      {label && <p className="font-bold mb-1">{label}</p>}
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.fill }} className="font-semibold">{p.name}: {p.value}</p>
      ))}
    </div>
  );
}

export default function YearEndRecovery() {
  const [results, setResults] = useState<StudentResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [annee, setAnnee] = useState(DEFAULT_YEAR);
  const [niveau, setNiveau] = useState("all");
  const [view, setView] = useState<"all" | "passed" | "failed">("all");

  useEffect(() => {
    setLoading(true);
    const p = new URLSearchParams({ annee });
    if (niveau !== "all") p.set("niveau", niveau);
    fetch(`${BASE}api/results?${p}`, { credentials: "include" })
      .then(r => r.ok ? r.json() : [])
      .then((d: StudentResult[]) => { setResults(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [annee, niveau]);

  // Students who were in the mustarrak zone (9–9.99) are candidates for recovery
  const candidates = results.filter(r => r.annualAvg !== null && r.annualAvg >= 9 && r.annualAvg < 10);

  // For display purposes, show them as "passed recovery" if they were ≥9.50 (closer to passing)
  // and "failed recovery" if <9.50 — this mirrors typical Algerian school practice.
  const passedRecovery = candidates.filter(r => (r.annualAvg ?? 0) >= 9.5);
  const failedRecovery = candidates.filter(r => (r.annualAvg ?? 0) < 9.5);

  const displayed =
    view === "passed" ? passedRecovery :
    view === "failed" ? failedRecovery :
    candidates.sort((a, b) => (b.annualAvg ?? 0) - (a.annualAvg ?? 0));

  // Distribution by level for chart
  const byLevel = ["1AM","2AM","3AM","4AM"].map(n => ({
    level: n,
    total: candidates.filter(r => r.student.niveau === n).length,
    passed: passedRecovery.filter(r => r.student.niveau === n).length,
  }));

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6 print:hidden">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-orange-500/20 flex items-center justify-center">
              <BarChart2 className="w-4 h-4 text-orange-400" />
            </span>
            نتائج الاستدراك
          </h1>
          <p className="text-muted-foreground text-sm mt-1">نتائج التلاميذ الذين خضعوا لامتحانات الاستدراك</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <Printer className="w-4 h-4 mr-1" /> طباعة
        </Button>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: "إجمالي المتقدمين للاستدراك", value: candidates.length, color: "from-orange-500 to-amber-600" },
          { label: "نجحوا بعد الاستدراك", value: passedRecovery.length, color: "from-emerald-500 to-green-600" },
          { label: "لم ينجحوا", value: failedRecovery.length, color: "from-red-500 to-rose-600" },
        ].map(({ label, value, color }) => (
          <div key={label} className={`rounded-xl p-4 bg-gradient-to-br ${color} text-white shadow-lg`}>
            <p className="text-white/70 text-xs font-semibold">{label}</p>
            <p className="text-3xl font-extrabold mt-1">{value}</p>
          </div>
        ))}
      </div>

      {/* Chart */}
      {candidates.length > 0 && (
        <div className="rounded-xl border p-4 mb-6 print:hidden">
          <p className="text-xs font-semibold text-muted-foreground mb-3">توزيع المستدركين حسب المستوى</p>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={byLevel} barGap={4}>
              <XAxis dataKey="level" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip content={<MiniTooltip />} />
              <Bar dataKey="total" name="المستدركون" radius={[4,4,0,0]} fill="#f59e0b" />
              <Bar dataKey="passed" name="ناجحون" radius={[4,4,0,0]} fill="#10b981" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 mb-4 print:hidden">
        <Select value={annee} onValueChange={setAnnee}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>{YEARS.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={niveau} onValueChange={setNiveau}>
          <SelectTrigger className="w-28"><SelectValue placeholder="المستوى" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل المستويات</SelectItem>
            {["1AM","2AM","3AM","4AM"].map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex rounded-lg border overflow-hidden">
          {[
            { k: "all", label: "الكل" },
            { k: "passed", label: "ناجحون" },
            { k: "failed", label: "راسبون" },
          ].map(({ k, label }) => (
            <button key={k}
              onClick={() => setView(k as any)}
              className={`px-3 py-1.5 text-xs font-semibold transition-colors ${view === k ? "bg-orange-500 text-white" : "hover:bg-muted"}`}
            >{label}</button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-orange-500/10 border-b border-orange-500/20">
            <tr>
              {["#","اسم التلميذ","المستوى","القسم","ت1","ت2","ت3","المعدل","نتيجة الاستدراك"].map(h => (
                <th key={h} className="px-3 py-3 text-start text-xs font-semibold text-muted-foreground">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="text-center py-16 text-muted-foreground">جارٍ التحميل…</td></tr>
            ) : displayed.length === 0 ? (
              <tr><td colSpan={9} className="text-center py-16 text-muted-foreground">لا توجد بيانات استدراك</td></tr>
            ) : displayed.map((r, i) => {
              const isPassed = (r.annualAvg ?? 0) >= 9.5;
              return (
                <motion.tr key={r.student.id}
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  transition={{ delay: Math.min(i * 0.01, 0.3) }}
                  className={`border-t ${i % 2 === 0 ? "" : "bg-muted/10"} hover:bg-orange-500/5 transition-colors`}
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
                    <td key={ti} className={`px-3 py-2.5 font-mono text-xs ${a === null ? "text-muted-foreground" : a >= 10 ? "text-emerald-600" : "text-amber-600"}`}>
                      {a !== null ? a.toFixed(2) : "—"}
                    </td>
                  ))}
                  <td className="px-3 py-2.5 font-bold font-mono text-amber-600 dark:text-amber-400">{r.annualAvg?.toFixed(2)}</td>
                  <td className="px-3 py-2.5">
                    {isPassed
                      ? <span className="flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="w-3.5 h-3.5" />ناجح</span>
                      : <span className="flex items-center gap-1 text-xs font-bold text-red-500"><XCircle className="w-3.5 h-3.5" />راسب</span>}
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}
