/**
 * قوائم التلاميذ النهائية
 * Complete final roster for all students with their final decision:
 * Admis (passed) / Mustarrak (remediation) / Non-admis (failed).
 * Printable per class — official-looking layout for school records.
 */
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Printer, ClipboardList, CheckSquare } from "lucide-react";
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

const LEVEL_LABELS: Record<string, string> = { "1AM": "1ère AM", "2AM": "2ème AM", "3AM": "3ème AM", "4AM": "4ème AM" };
const LEVEL_COLORS: Record<string, string> = { "1AM": "#6366f1", "2AM": "#8b5cf6", "3AM": "#a855f7", "4AM": "#d946ef" };

function verdict(avg: number | null) {
  if (avg === null) return { label: "لم تُحسب", cls: "bg-muted text-muted-foreground" };
  if (avg >= 10) return { label: "ناجح", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" };
  if (avg >= 9)  return { label: "مستدرك", cls: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" };
  return { label: "راسب", cls: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" };
}

export default function YearEndFinal() {
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

  const filtered = results
    .filter(r => classe === "all" || r.student.classe === classe)
    .sort((a, b) => (getFinalAvg(b) ?? -1) - (getFinalAvg(a) ?? -1));

  const classes = [...new Set(results.map(r => r.student.classe))].sort();

  const withAvg = filtered.filter(r => getFinalAvg(r) !== null);
  const passed    = withAvg.filter(r => (getFinalAvg(r) ?? 0) >= 10).length;
  const mustarrak = withAvg.filter(r => (getFinalAvg(r) ?? 0) >= 9 && (getFinalAvg(r) ?? 0) < 10).length;
  const failed    = withAvg.filter(r => (getFinalAvg(r) ?? 0) < 9).length;
  const successRate = withAvg.length > 0 ? Math.round((passed / withAvg.length) * 100) : null;

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 print:hidden">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-sky-500/20 flex items-center justify-center">
              <ClipboardList className="w-4 h-4 text-sky-400" />
            </span>
            القوائم النهائية للتلاميذ
          </h1>
          <p className="text-muted-foreground text-sm mt-1">الكشوف الرسمية الشاملة بنتائج نهاية السنة الدراسية</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <Printer className="w-4 h-4 mr-1" /> طباعة
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: "الإجمالي", value: withAvg.length, color: "from-sky-500 to-blue-600" },
          { label: "ناجحون", value: passed, color: "from-emerald-500 to-green-600" },
          { label: "مستدركون", value: mustarrak, color: "from-amber-500 to-orange-600" },
          { label: "راسبون", value: failed, color: "from-red-500 to-rose-600" },
        ].map(({ label, value, color }) => (
          <div key={label} className={`rounded-xl p-4 bg-gradient-to-br ${color} text-white shadow-lg`}>
            <p className="text-white/70 text-xs font-semibold">{label}</p>
            <p className="text-3xl font-extrabold mt-1">{value}</p>
            {label === "الإجمالي" && successRate !== null && (
              <p className="text-white/70 text-xs mt-1">نسبة النجاح {successRate}%</p>
            )}
          </div>
        ))}
      </div>

      {/* Filters */}
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

      {/* Table */}
      <div className="rounded-xl border overflow-hidden shadow-sm print:border-0 print:shadow-none">
        <table className="w-full text-sm">
          <thead className="bg-sky-500/10 border-b border-sky-500/20 print:bg-gray-100">
            <tr>
              {["الرتبة","اسم التلميذ","المستوى","القسم","الحالة","ت1","ت2","ت3","المعدل السنوي","القرار"].map(h => (
                <th key={h} className="px-3 py-3 text-start text-xs font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} className="text-center py-16 text-muted-foreground">جارٍ التحميل…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={10} className="text-center py-16 text-muted-foreground">لا توجد بيانات — استورد النقاط أولاً</td></tr>
            ) : filtered.map((r, i) => {
              const v = verdict(getFinalAvg(r));
              return (
                <motion.tr key={r.student.id}
                  initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: Math.min(i * 0.008, 0.3) }}
                  className={`border-t ${i % 2 === 0 ? "" : "bg-muted/10"} hover:bg-sky-500/5 transition-colors`}
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
                  <td className={`px-3 py-2.5 font-bold font-mono ${(getFinalAvg(r) ?? 0) >= 10 ? "text-emerald-600 dark:text-emerald-400" : (getFinalAvg(r) ?? 0) >= 9 ? "text-amber-600" : "text-red-500"}`}>
                    {getFinalAvg(r)?.toFixed(2) ?? "—"}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${v.cls}`}>{v.label}</span>
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {filtered.length > 0 && (
        <p className="text-xs text-muted-foreground mt-3 text-end">الإجمالي: {filtered.length} تلميذ · نسبة النجاح: {successRate ?? "—"}%</p>
      )}
    </motion.div>
  );
}
