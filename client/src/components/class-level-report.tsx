import { useState, useEffect, useCallback } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Printer, TrendingUp, TrendingDown, Minus, Users, UserCheck,
  UserX, FileText, AlertTriangle, RefreshCw,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { SCHOOL_STAGE } from "@/lib/deployment";
import type { StudentResult, SchoolInfo, SubjectAverage } from "@shared/types";

const BASE = import.meta.env.BASE_URL;

const LEVEL_LABELS: Record<string, string> = {
  "1AM": "السنة الأولى متوسط",
  "2AM": "السنة الثانية متوسط",
  "3AM": "السنة الثالثة متوسط",
  "4AM": "السنة الرابعة متوسط",
  "1AS": "السنة الأولى ثانوي",
  "2AS": "السنة الثانية ثانوي",
  "3AS": "السنة الثالثة ثانوي",
};
const LEVEL_SHORT: Record<string, string> = {
  "1AM": "1 م.م", "2AM": "2 م.م", "3AM": "3 م.م", "4AM": "4 م.م",
  "1AS": "1 ثانوي", "2AS": "2 ثانوي", "3AS": "3 ثانوي",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(v: number | null | undefined, dec = 2) {
  if (v == null) return "—";
  return v.toFixed(dec);
}
function pct(num: number, den: number) {
  if (!den) return "—";
  return `${Math.round((num / den) * 100)}%`;
}
function delta(a: number | null, b: number | null): number | null {
  if (a == null || b == null) return null;
  return Math.round((b - a) * 100) / 100;
}
function trendLabel(d: number | null, thr = 0.25): "up" | "down" | "flat" {
  if (d == null) return "flat";
  if (d > thr) return "up";
  if (d < -thr) return "down";
  return "flat";
}
function splitName(full: string) {
  const i = full.indexOf(" ");
  if (i < 0) return { nom: full, prenom: "" };
  return { nom: full.slice(0, i), prenom: full.slice(i + 1) };
}

// ─── Sub-stat type ────────────────────────────────────────────────────────────
interface SubjectStat extends SubjectAverage {
  t1ClassAvg: number | null;
  t2ClassAvg: number | null;
  t3ClassAvg: number | null;
}

// ─── Derived data builder ─────────────────────────────────────────────────────
function buildReportData(
  filtered: StudentResult[],
  subjectRows: SubjectAverage[],
) {
  const withAvg = filtered.filter(r => r.annualAvg !== null);
  const boys = filtered.filter(r => r.student.sexe === "M");
  const girls = filtered.filter(r => r.student.sexe === "F");
  const boysWithAvg = boys.filter(r => r.annualAvg !== null);
  const girlsWithAvg = girls.filter(r => r.annualAvg !== null);
  const passed = withAvg.filter(r => r.passed);
  const failed = withAvg.filter(r => r.passed === false);
  const boysPassed = boysWithAvg.filter(r => r.passed);
  const girlsPassed = girlsWithAvg.filter(r => r.passed);

  // Per-trimester subject class averages from student scores
  const subTriMap: Record<string, { t1: number[]; t2: number[]; t3: number[] }> = {};
  for (const r of filtered) {
    for (const [tri, subs] of Object.entries(r.scores)) {
      for (const [subj, score] of Object.entries(subs as Record<string, number>)) {
        subTriMap[subj] ??= { t1: [], t2: [], t3: [] };
        if (tri === "1") subTriMap[subj]!.t1.push(score);
        else if (tri === "2") subTriMap[subj]!.t2.push(score);
        else if (tri === "3") subTriMap[subj]!.t3.push(score);
      }
    }
  }
  const avg = (arr: number[]) => arr.length
    ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 100) / 100
    : null;

  const enrichedSubjects: SubjectStat[] = subjectRows.map(s => ({
    ...s,
    t1ClassAvg: avg(subTriMap[s.subject]?.t1 ?? []),
    t2ClassAvg: avg(subTriMap[s.subject]?.t2 ?? []),
    t3ClassAvg: avg(subTriMap[s.subject]?.t3 ?? []),
  }));

  // Trimester progress per student (sorted best→worst by annual avg)
  const progressRows = withAvg
    .filter(r => r.t1Avg !== null || r.t2Avg !== null || r.t3Avg !== null)
    .map(r => ({
      ...r,
      d12: delta(r.t1Avg, r.t2Avg),
      d23: delta(r.t2Avg, r.t3Avg),
      d13: delta(r.t1Avg, r.t3Avg),
    }))
    .sort((a, b) => (b.annualAvg ?? 0) - (a.annualAvg ?? 0));

  // Failing students sorted by gap to 10 (closest = smallest gap first)
  const failingRows = failed
    .map(r => ({ ...r, gap: Math.round((10 - (r.annualAvg ?? 0)) * 100) / 100 }))
    .sort((a, b) => a.gap - b.gap);

  return {
    withAvg, passed, failed, boys, girls, boysWithAvg, girlsWithAvg,
    boysPassed, girlsPassed, progressRows, failingRows, enrichedSubjects,
    successRate: withAvg.length ? Math.round((passed.length / withAvg.length) * 100) : null,
    boysRate: boysWithAvg.length ? Math.round((boysPassed.length / boysWithAvg.length) * 100) : null,
    girlsRate: girlsWithAvg.length ? Math.round((girlsPassed.length / girlsWithAvg.length) * 100) : null,
  };
}

// ─── Main component ───────────────────────────────────────────────────────────
interface Props {
  annee: string;
  school: SchoolInfo | null;
  allResults: StudentResult[];
}

export function ClassLevelReport({ annee, school, allResults }: Props) {
  const [reportType, setReportType] = useState<"classe" | "niveau">("classe");
  const [selectedValue, setSelectedValue] = useState("");
  const [subjects, setSubjects] = useState<SubjectAverage[]>([]);
  const [subLoading, setSubLoading] = useState(false);

  // Derive options from allResults
  const classOptions = [...new Set(
    allResults.map(r => `${r.student.niveau}|${r.student.classe}`)
  )].sort().map(k => {
    const [n, c] = k.split("|");
    return { value: k, label: `قسم ${c} — ${LEVEL_SHORT[n!] || n}`, niveau: n!, classe: c! };
  });
  const niveauOptions = [...new Set(allResults.map(r => r.student.niveau))].sort()
    .map(n => ({ value: n, label: LEVEL_LABELS[n] || n }));

  // Reset selection when type changes
  const handleTypeChange = (t: "classe" | "niveau") => {
    setReportType(t); setSelectedValue("");
  };

  // Filter results
  const filtered = selectedValue ? allResults.filter(r => {
    if (reportType === "classe") {
      const [n, c] = selectedValue.split("|");
      return r.student.niveau === n && r.student.classe === c;
    }
    return r.student.niveau === selectedValue;
  }) : [];

  // Fetch subjects for this filter
  const fetchSubjects = useCallback(async () => {
    if (!selectedValue) { setSubjects([]); return; }
    setSubLoading(true);
    try {
      const params = new URLSearchParams({ annee });
      if (reportType === "classe") {
        const [n, c] = selectedValue.split("|");
        params.set("niveau", n!); params.set("classe", c!);
      } else {
        params.set("niveau", selectedValue);
      }
      const res = await fetch(`${BASE}api/results/subjects?${params}`, { credentials: "include" });
      if (res.ok) setSubjects(await res.json());
    } finally { setSubLoading(false); }
  }, [selectedValue, reportType, annee]);

  useEffect(() => { fetchSubjects(); }, [fetchSubjects]);

  // Build derived data
  const data = selectedValue ? buildReportData(filtered, subjects) : null;

  // Report title
  const reportTitle = selectedValue
    ? reportType === "classe"
      ? `قسم ${selectedValue.split("|")[1]} — ${LEVEL_LABELS[selectedValue.split("|")[0]!] || selectedValue.split("|")[0]}`
      : LEVEL_LABELS[selectedValue] || selectedValue
    : "";

  const today = new Date().toLocaleDateString("ar-DZ", { year: "numeric", month: "long", day: "numeric" });

  const handlePrint = () => {
    if (!data) return;
    const html = buildPrintHTML(reportTitle, annee, school, today, data);
    const win = window.open("", "_blank", "width=1100,height=800");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    setTimeout(() => { win.focus(); win.print(); }, 500);
  };

  // ─── JSX ──
  return (
    <div className="space-y-5">
      {/* Selector bar */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex rounded-xl overflow-hidden border border-violet-200 dark:border-violet-800 shadow-sm">
          {(["classe", "niveau"] as const).map(t => (
            <button
              key={t}
              onClick={() => handleTypeChange(t)}
              className={`px-4 py-2 text-xs font-bold transition-all ${
                reportType === t
                  ? "bg-gradient-to-r from-violet-600 to-purple-600 text-white"
                  : "bg-card text-muted-foreground hover:bg-muted/50"
              }`}
            >
              {t === "classe" ? "تقرير القسم" : "تقرير المستوى"}
            </button>
          ))}
        </div>

        <Select
          value={selectedValue || "__none__"}
          onValueChange={v => setSelectedValue(v === "__none__" ? "" : v)}
        >
          <SelectTrigger className="w-72 font-semibold text-sm h-10">
            <SelectValue placeholder={reportType === "classe" ? "اختر القسم..." : "اختر المستوى..."} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__" className="text-muted-foreground">
              {reportType === "classe" ? "— اختر القسم —" : "— اختر المستوى —"}
            </SelectItem>
            {(reportType === "classe" ? classOptions : niveauOptions).map(o => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {data && (
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
            <Button
              onClick={handlePrint}
              className="gap-2 h-10 font-bold text-sm bg-gradient-to-r from-indigo-600 to-violet-600 text-white border-0 shadow-lg shadow-indigo-500/30 hover:from-indigo-700 hover:to-violet-700"
            >
              <Printer className="w-4 h-4" />
              طباعة / تصدير PDF
            </Button>
          </motion.div>
        )}
        {subLoading && (
          <RefreshCw className="w-4 h-4 text-violet-500 animate-spin" />
        )}
      </div>

      {/* Empty state */}
      {!selectedValue && (
        <div className="flex flex-col items-center justify-center py-14 text-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500/15 to-purple-500/10 flex items-center justify-center mb-4 border border-violet-200 dark:border-violet-800">
            <FileText className="w-8 h-8 text-violet-400" />
          </div>
          <p className="font-bold text-muted-foreground">اختر القسم أو المستوى لعرض التقرير</p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            يمكنك بعدها طباعة التقرير أو تصديره كـ PDF
          </p>
        </div>
      )}

      {/* Report preview */}
      <AnimatePresence mode="wait">
        {data && selectedValue && (
          <motion.div
            key={selectedValue + reportType}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3 }}
            className="space-y-5"
          >
            {/* Title bar */}
            <div className="flex items-center justify-between bg-gradient-to-r from-violet-600/10 to-purple-600/5 border border-violet-200 dark:border-violet-800 rounded-2xl px-5 py-3">
              <div>
                <p className="font-black text-lg text-violet-700 dark:text-violet-300">{reportTitle}</p>
                <p className="text-xs text-muted-foreground">السنة الدراسية: {annee} — {today}</p>
              </div>
              {school && (
                <p className="text-xs text-muted-foreground text-left">{school.nom}<br/>{school.wilaya}</p>
              )}
            </div>

            {/* ── KPI row ── */}
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
              {[
                { label: "المجموع", val: filtered.length, cls: "from-violet-600 to-purple-700" },
                { label: "ذكور",    val: data.boys.length,       cls: "from-blue-600 to-sky-700" },
                { label: "إناث",   val: data.girls.length,      cls: "from-pink-600 to-rose-700" },
                { label: "ناجحون", val: data.passed.length,     cls: "from-emerald-500 to-green-600" },
                { label: "راسبون", val: data.failed.length,     cls: "from-red-500 to-rose-600" },
                { label: "نسبة النجاح", val: data.successRate != null ? `${data.successRate}%` : "—", cls: "from-amber-500 to-orange-500" },
              ].map(k => (
                <div key={k.label} className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${k.cls} p-3 shadow-md`}>
                  <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "radial-gradient(circle at 80% 20%, rgba(255,255,255,.4) 0%, transparent 60%)" }} />
                  <p className="relative text-white/80 text-[10px] font-semibold">{k.label}</p>
                  <p className="relative text-white font-black text-2xl leading-none mt-1">{k.val}</p>
                </div>
              ))}
            </div>

            {/* ── Success breakdown ── */}
            <Card className="border-0 bg-card/80 shadow-md">
              <CardContent className="p-5">
                <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
                  <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-sm">
                    <UserCheck className="w-3.5 h-3.5 text-white" />
                  </span>
                  نسبة النجاح التفصيلية
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: "إجمالي", rate: data.successRate, cnt: data.passed.length, den: data.withAvg.length, color: "text-violet-600 dark:text-violet-400", border: "border-violet-200 dark:border-violet-800" },
                    { label: "ذكور",  rate: data.boysRate, cnt: data.boysPassed.length, den: data.boysWithAvg.length, color: "text-blue-600 dark:text-blue-400", border: "border-blue-200 dark:border-blue-800" },
                    { label: "إناث", rate: data.girlsRate, cnt: data.girlsPassed.length, den: data.girlsWithAvg.length, color: "text-pink-600 dark:text-pink-400", border: "border-pink-200 dark:border-pink-800" },
                    { label: "الراسبون", rate: data.withAvg.length ? Math.round((data.failed.length / data.withAvg.length) * 100) : null, cnt: data.failed.length, den: data.withAvg.length, color: "text-red-600 dark:text-red-400", border: "border-red-200 dark:border-red-800" },
                  ].map(item => (
                    <div key={item.label} className={`border ${item.border} rounded-xl p-4 text-center`}>
                      <p className={`text-3xl font-black ${item.color}`}>{item.rate != null ? `${item.rate}%` : "—"}</p>
                      <p className="text-xs font-bold text-foreground mt-1">{item.label}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{item.cnt} من {item.den} تلميذ</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* ── Failing students ── */}
            <Card className="border-0 bg-card/80 shadow-md overflow-hidden">
              <CardContent className="p-0">
                <div className="flex items-center gap-2 px-5 py-3 border-b bg-red-50/50 dark:bg-red-950/20">
                  <AlertTriangle className="w-4 h-4 text-red-500" />
                  <h3 className="text-sm font-bold text-red-700 dark:text-red-400">
                    الراسبون وكم باقي لهم للمعدل 10
                  </h3>
                  <Badge variant="outline" className="border-red-300 text-red-600 text-xs ms-auto">
                    {data.failingRows.length} تلميذ
                  </Badge>
                </div>
                {data.failingRows.length === 0 ? (
                  <p className="text-center py-8 text-emerald-600 font-bold text-sm">
                    🎉 لا يوجد تلاميذ راسبون في هذا التحديد
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-muted/40 border-b text-muted-foreground">
                          <th className="p-3 text-center w-10">#</th>
                          <th className="p-3 text-right">الاسم واللقب</th>
                          <th className="p-3 text-center">القسم</th>
                          <th className="p-3 text-center">م.ف1</th>
                          <th className="p-3 text-center">م.ف2</th>
                          <th className="p-3 text-center">م.ف3</th>
                          <th className="p-3 text-center font-bold">المعدل السنوي</th>
                          <th className="p-3 text-center font-bold">باقي للـ10</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.failingRows.map((r, i) => {
                          const { nom, prenom } = splitName(r.student.nomPrenom);
                          const gapColor = r.gap <= 1
                            ? "text-amber-600 bg-amber-50 dark:bg-amber-950/30"
                            : r.gap <= 2
                            ? "text-red-500 bg-red-50 dark:bg-red-950/30"
                            : "text-red-700 bg-red-100/50 dark:bg-red-950/50";
                          return (
                            <tr key={r.student.id} className={`border-b last:border-0 hover:bg-muted/20 ${i % 2 !== 0 ? "bg-muted/10" : ""}`}>
                              <td className="p-3 text-center text-muted-foreground font-semibold">{i + 1}</td>
                              <td className="p-3">
                                <span className="font-bold">{nom}</span>{" "}
                                <span className="text-muted-foreground">{prenom}</span>
                              </td>
                              <td className="p-3 text-center">
                                <Badge variant="secondary" className="text-[10px]">{r.student.classe}</Badge>
                              </td>
                              <td className={`p-3 text-center font-semibold ${r.t1Avg != null && r.t1Avg < 10 ? "text-red-500" : ""}`}>{fmt(r.t1Avg)}</td>
                              <td className={`p-3 text-center font-semibold ${r.t2Avg != null && r.t2Avg < 10 ? "text-red-500" : ""}`}>{fmt(r.t2Avg)}</td>
                              <td className={`p-3 text-center font-semibold ${r.t3Avg != null && r.t3Avg < 10 ? "text-red-500" : ""}`}>{fmt(r.t3Avg)}</td>
                              <td className="p-3 text-center">
                                <span className="font-black text-red-600 text-base">{fmt(r.annualAvg)}</span>
                              </td>
                              <td className="p-3 text-center">
                                <span className={`font-black text-sm px-2 py-0.5 rounded-lg ${gapColor}`}>
                                  −{r.gap.toFixed(2)}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ── Trimester progress ── */}
            <Card className="border-0 bg-card/80 shadow-md overflow-hidden">
              <CardContent className="p-0">
                <div className="flex items-center gap-2 px-5 py-3 border-b bg-blue-50/50 dark:bg-blue-950/20">
                  <TrendingUp className="w-4 h-4 text-blue-500" />
                  <h3 className="text-sm font-bold text-blue-700 dark:text-blue-300">
                    تحسنات وتراجعات المعدل الفصلي لكل تلميذ
                  </h3>
                </div>
                {data.progressRows.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground text-sm">لا توجد بيانات كافية</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-muted/40 border-b text-muted-foreground">
                          <th className="p-3 text-right">الاسم واللقب</th>
                          <th className="p-3 text-center">القسم</th>
                          <th className="p-3 text-center">م.ف1</th>
                          <th className="p-3 text-center">م.ف2</th>
                          <th className="p-3 text-center">م.ف3</th>
                          <th className="p-3 text-center">ف1→ف2</th>
                          <th className="p-3 text-center">ف2→ف3</th>
                          <th className="p-3 text-center">ف1→ف3</th>
                          <th className="p-3 text-center font-bold">المعدل</th>
                          <th className="p-3 text-center">النتيجة</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.progressRows.map((r, i) => {
                          const { nom, prenom } = splitName(r.student.nomPrenom);
                          const DeltaCell = ({ d }: { d: number | null }) => {
                            const t = trendLabel(d);
                            return (
                              <td className="p-3 text-center">
                                <span className={`inline-flex items-center gap-1 font-bold text-[11px] ${
                                  t === "up" ? "text-emerald-600" : t === "down" ? "text-red-500" : "text-muted-foreground"
                                }`}>
                                  {t === "up" ? <TrendingUp className="w-3 h-3" />
                                    : t === "down" ? <TrendingDown className="w-3 h-3" />
                                    : <Minus className="w-3 h-3" />}
                                  {d != null ? (d >= 0 ? "+" : "") + d.toFixed(2) : "—"}
                                </span>
                              </td>
                            );
                          };
                          return (
                            <tr key={r.student.id} className={`border-b last:border-0 hover:bg-muted/20 ${i % 2 !== 0 ? "bg-muted/10" : ""}`}>
                              <td className="p-3">
                                <span className="font-bold">{nom}</span>{" "}
                                <span className="text-muted-foreground">{prenom}</span>
                              </td>
                              <td className="p-3 text-center">
                                <Badge variant="secondary" className="text-[10px]">{r.student.classe}</Badge>
                              </td>
                              <td className="p-3 text-center font-semibold">{fmt(r.t1Avg)}</td>
                              <td className="p-3 text-center font-semibold">{fmt(r.t2Avg)}</td>
                              <td className="p-3 text-center font-semibold">{fmt(r.t3Avg)}</td>
                              <DeltaCell d={r.d12} />
                              <DeltaCell d={r.d23} />
                              <DeltaCell d={r.d13} />
                              <td className="p-3 text-center">
                                <span className="font-black text-base">{fmt(r.annualAvg)}</span>
                              </td>
                              <td className="p-3 text-center">
                                {r.passed === true
                                  ? <span className="text-emerald-600 font-bold flex items-center gap-1 justify-center"><UserCheck className="w-3 h-3" />ناجح</span>
                                  : r.passed === false
                                  ? <span className="text-red-500 font-bold flex items-center gap-1 justify-center"><UserX className="w-3 h-3" />راسب</span>
                                  : <span className="text-muted-foreground">—</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ── Subject analysis ── */}
            <Card className="border-0 bg-card/80 shadow-md overflow-hidden">
              <CardContent className="p-0">
                <div className="flex items-center gap-2 px-5 py-3 border-b bg-amber-50/50 dark:bg-amber-950/20">
                  <Users className="w-4 h-4 text-amber-600" />
                  <h3 className="text-sm font-bold text-amber-700 dark:text-amber-300">
                    تحسنات وتراجعات كل مادة (معدل القسم / المستوى)
                  </h3>
                </div>
                {data.enrichedSubjects.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground text-sm">لا توجد بيانات مواد</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-muted/40 border-b text-muted-foreground">
                          <th className="p-3 text-right">المادة</th>
                          <th className="p-3 text-center">م.ف1</th>
                          <th className="p-3 text-center">م.ف2</th>
                          <th className="p-3 text-center">م.ف3</th>
                          <th className="p-3 text-center">التطور ف1→ف3</th>
                          <th className="p-3 text-center text-emerald-600">ناجح</th>
                          <th className="p-3 text-center text-red-500">راسب</th>
                          <th className="p-3 text-center">نسبة الرسوب</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.enrichedSubjects.map((s, i) => {
                          const d = delta(s.t1ClassAvg, s.t3ClassAvg);
                          const t = trendLabel(d, 0.3);
                          return (
                            <tr key={s.subject} className={`border-b last:border-0 hover:bg-muted/20 ${i % 2 !== 0 ? "bg-muted/10" : ""}`}>
                              <td className="p-3 font-bold">{s.arLabel}</td>
                              <td className="p-3 text-center font-semibold">{fmt(s.t1ClassAvg)}</td>
                              <td className="p-3 text-center font-semibold">{fmt(s.t2ClassAvg)}</td>
                              <td className="p-3 text-center font-semibold">{fmt(s.t3ClassAvg)}</td>
                              <td className="p-3 text-center">
                                <span className={`inline-flex items-center gap-1 font-bold text-[11px] ${
                                  t === "up" ? "text-emerald-600" : t === "down" ? "text-red-500" : "text-muted-foreground"
                                }`}>
                                  {t === "up" ? <TrendingUp className="w-3 h-3" />
                                    : t === "down" ? <TrendingDown className="w-3 h-3" />
                                    : <Minus className="w-3 h-3" />}
                                  {d != null ? (d >= 0 ? "+" : "") + d.toFixed(2) : "—"}
                                </span>
                              </td>
                              <td className="p-3 text-center text-emerald-600 font-bold">{s.passCount}</td>
                              <td className="p-3 text-center text-red-500 font-bold">{s.failCount}</td>
                              <td className="p-3 text-center">
                                <Badge variant="outline" className={`text-[10px] ${
                                  s.failRate > 50 ? "border-red-300 text-red-600 bg-red-50 dark:bg-red-950/30"
                                    : s.failRate > 25 ? "border-amber-300 text-amber-600 bg-amber-50 dark:bg-amber-950/30"
                                    : "border-emerald-300 text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30"
                                }`}>
                                  {s.failRate}%
                                </Badge>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── SVG chart helpers (used inside buildPrintHTML) ───────────────────────────

/** Vertical bar chart. values 0..maxVal. */
function svgVBars(
  items: { label: string; value: number | null; color: string; unit?: string }[],
  opts: { W?: number; H?: number; maxVal?: number; unit?: string } = {},
): string {
  const { W = 420, H = 160, unit = "" } = opts;
  const maxVal = opts.maxVal ?? Math.max(...items.map(it => it.value ?? 0), 1);
  const pL = 34, pR = 12, pT = 26, pB = 44;
  const cW = W - pL - pR, cH = H - pT - pB;
  const slot = cW / items.length;
  const bw = Math.min(44, slot * 0.55);

  const ticks = maxVal <= 20 ? [0, 5, 10, 15, 20].filter(v => v <= maxVal)
    : [0, 25, 50, 75, 100].filter(v => v <= maxVal);

  const grid = ticks.map(v => {
    const y = pT + cH - (v / maxVal) * cH;
    return `<line x1="${pL}" y1="${y.toFixed(1)}" x2="${W - pR}" y2="${y.toFixed(1)}" stroke="#e5e7eb" stroke-width="1"/>
            <text x="${pL - 4}" y="${(y + 4).toFixed(1)}" text-anchor="end" fill="#9ca3af" font-size="9">${v}${unit}</text>`;
  }).join("");

  const bars = items.map((it, i) => {
    const val = it.value ?? 0;
    const bh = Math.max((val / maxVal) * cH, 1);
    const x = pL + slot * i + slot / 2 - bw / 2;
    const y = pT + cH - bh;
    const lbl = it.label.length > 7 ? it.label.slice(0, 6) + "…" : it.label;
    const u = it.unit ?? unit;
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw}" height="${bh.toFixed(1)}" fill="${it.color}" rx="4" opacity="0.9"/>
            <text x="${(x + bw / 2).toFixed(1)}" y="${(y - 4).toFixed(1)}" text-anchor="middle" fill="${it.color}" font-size="10" font-weight="700">${val}${u}</text>
            <text x="${(x + bw / 2).toFixed(1)}" y="${(pT + cH + 14).toFixed(1)}" text-anchor="middle" fill="#374151" font-size="9">${lbl}</text>`;
  }).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" style="display:block">
    ${grid}
    <line x1="${pL}" y1="${pT}" x2="${pL}" y2="${pT + cH}" stroke="#d1d5db" stroke-width="1.5"/>
    <line x1="${pL}" y1="${pT + cH}" x2="${W - pR}" y2="${pT + cH}" stroke="#d1d5db" stroke-width="1.5"/>
    ${bars}
  </svg>`;
}

/** Horizontal bar chart. */
function svgHBars(
  items: { label: string; value: number; color: string }[],
  opts: { W?: number; barH?: number; maxVal?: number; unit?: string } = {},
): string {
  const { W = 460, barH = 20, unit = "" } = opts;
  const maxVal = opts.maxVal ?? Math.max(...items.map(it => it.value), 1);
  const pL = 110, pR = 48, pT = 6, gap = 6;
  const rowH = barH + gap;
  const H = pT * 2 + rowH * items.length;
  const cW = W - pL - pR;

  const rows = items.map((it, i) => {
    const bw = Math.max((it.value / maxVal) * cW, 2);
    const y = pT + i * rowH;
    const lbl = it.label.length > 14 ? it.label.slice(0, 14) + "…" : it.label;
    return `<rect x="${pL}" y="${y}" width="${bw.toFixed(1)}" height="${barH}" fill="${it.color}" rx="3" opacity="0.88"/>
            <text x="${(pL + bw + 5).toFixed(1)}" y="${(y + barH / 2 + 4).toFixed(1)}" fill="${it.color}" font-size="10" font-weight="700">${it.value}${unit}</text>
            <text x="${pL - 6}" y="${(y + barH / 2 + 4).toFixed(1)}" text-anchor="end" fill="#374151" font-size="10">${lbl}</text>`;
  }).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" style="display:block">
    ${rows}
  </svg>`;
}

/** Grouped vertical bar chart — multiple series per category. */
function svgGroupedVBars(
  groups: { label: string; values: (number | null)[] }[],
  seriesColors: string[],
  seriesLabels: string[],
  opts: { W?: number; H?: number; maxVal?: number; unit?: string } = {},
): string {
  const { W = 500, H = 210, unit = "" } = opts;
  const maxVal = opts.maxVal ?? Math.max(...groups.flatMap(g => g.values.map(v => v ?? 0)), 1);
  const pL = 34, pR = 16, pT = 34, pB = 50;
  const cW = W - pL - pR, cH = H - pT - pB;
  const n = seriesColors.length;
  const slot = cW / groups.length;
  const bw = Math.min(16, slot / (n + 1));

  // legend
  const legend = seriesLabels.map((lbl, i) =>
    `<rect x="${pL + i * 85}" y="6" width="11" height="11" fill="${seriesColors[i]}" rx="2"/>
     <text x="${pL + i * 85 + 15}" y="15" fill="#374151" font-size="10">${lbl}</text>`
  ).join("");

  const ticks = [0, 5, 10, 15, 20].filter(v => v <= maxVal);
  const grid = ticks.map(v => {
    const y = pT + cH - (v / maxVal) * cH;
    return `<line x1="${pL}" y1="${y.toFixed(1)}" x2="${W - pR}" y2="${y.toFixed(1)}" stroke="#e5e7eb" stroke-width="1"/>
            <text x="${pL - 4}" y="${(y + 4).toFixed(1)}" text-anchor="end" fill="#9ca3af" font-size="9">${v}</text>`;
  }).join("");

  const bars = groups.map((g, gi) => {
    const cx = pL + slot * gi + slot / 2;
    const startX = cx - (n * bw + (n - 1) * 2) / 2;
    const lbl = g.label.length > 9 ? g.label.slice(0, 8) + "…" : g.label;
    const rects = g.values.map((v, si) => {
      const val = v ?? 0;
      const bh = Math.max((val / maxVal) * cH, 1);
      const x = startX + si * (bw + 2);
      const y = pT + cH - bh;
      const valTxt = val > 0
        ? `<text x="${(x + bw / 2).toFixed(1)}" y="${(y - 2).toFixed(1)}" text-anchor="middle" fill="${seriesColors[si]}" font-size="8" font-weight="700">${val.toFixed(1)}</text>`
        : "";
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw}" height="${bh.toFixed(1)}" fill="${seriesColors[si]}" rx="2" opacity="0.85"/>
              ${valTxt}`;
    }).join("");
    return `${rects}
      <text x="${cx.toFixed(1)}" y="${(pT + cH + 15).toFixed(1)}" text-anchor="middle" fill="#374151" font-size="9">${lbl}</text>`;
  }).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" style="display:block">
    ${legend}
    ${grid}
    <line x1="${pL}" y1="${pT}" x2="${pL}" y2="${pT + cH}" stroke="#d1d5db" stroke-width="1.5"/>
    <line x1="${pL}" y1="${pT + cH}" x2="${W - pR}" y2="${pT + cH}" stroke="#d1d5db" stroke-width="1.5"/>
    ${bars}
  </svg>`;
}

// ─── Print HTML generator ─────────────────────────────────────────────────────
function buildPrintHTML(
  title: string,
  annee: string,
  school: SchoolInfo | null,
  today: string,
  data: ReturnType<typeof buildReportData>,
) {
  const {
    withAvg, passed, failed, boys, girls, boysWithAvg, girlsWithAvg,
    boysPassed, girlsPassed, progressRows, failingRows, enrichedSubjects,
    successRate, boysRate, girlsRate,
  } = data;

  const arrowUp = "▲"; const arrowDown = "▼"; const arrowFlat = "─";
  const numAvg = (arr: (number | null)[]) => {
    const v = arr.filter((x): x is number => x != null);
    return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 100) / 100 : null;
  };

  const trendArrow = (d: number | null, thr = 0.25) => {
    const t = trendLabel(d, thr);
    if (t === "up")   return `<span style="color:#059669;font-weight:700">${arrowUp} +${Math.abs(d!).toFixed(2)}</span>`;
    if (t === "down") return `<span style="color:#dc2626;font-weight:700">${arrowDown} ${d!.toFixed(2)}</span>`;
    return `<span style="color:#9ca3af">${arrowFlat} ${d != null ? (d >= 0 ? "+" : "") + d.toFixed(2) : "—"}</span>`;
  };

  const td = (v: string | number, center = false, extra = "") =>
    `<td style="padding:5px 8px;border:1px solid #e5e7eb;${center ? "text-align:center;" : ""}${extra}">${v}</td>`;
  const th = (v: string, center = false) =>
    `<th style="background:#f3f4f6;padding:6px 8px;border:1px solid #e5e7eb;font-weight:700;font-size:11px;${center ? "text-align:center;" : "text-align:right;"}">${v}</th>`;

  const kpiBox = (lbl: string, val: string | number, bg: string, color: string) =>
    `<div style="flex:1;background:${bg};border-radius:10px;padding:12px 8px;text-align:center;min-width:90px">
       <div style="font-size:11px;color:#6b7280;margin-bottom:4px">${lbl}</div>
       <div style="font-size:22px;font-weight:900;color:${color}">${val}</div>
     </div>`;

  // ── Chart 1: Success rate bar chart ─────────────────────────────────────────
  const failRate = withAvg.length ? Math.round((failed.length / withAvg.length) * 100) : null;
  const successChart = svgVBars([
    { label: "إجمالي",  value: successRate, color: "#6366f1", unit: "%" },
    { label: "ذكور",    value: boysRate,    color: "#3b82f6", unit: "%" },
    { label: "إناث",   value: girlsRate,   color: "#ec4899", unit: "%" },
    { label: "الرسوب", value: failRate,    color: "#ef4444", unit: "%" },
  ], { W: 320, H: 160, maxVal: 100, unit: "%" });

  // ── Chart 2: Class trimester progression bar chart ───────────────────────────
  const classT1 = numAvg(progressRows.map(r => r.t1Avg));
  const classT2 = numAvg(progressRows.map(r => r.t2Avg));
  const classT3 = numAvg(progressRows.map(r => r.t3Avg));
  const triColor = (v: number | null, prev: number | null) => {
    if (v == null || prev == null) return "#6366f1";
    return v >= prev ? "#059669" : "#ef4444";
  };
  const progressionChart = svgVBars([
    { label: "الفصل 1", value: classT1, color: "#6366f1" },
    { label: "الفصل 2", value: classT2, color: triColor(classT2, classT1) },
    { label: "الفصل 3", value: classT3, color: triColor(classT3, classT2) },
  ], { W: 280, H: 160, maxVal: 20 });

  // ── Chart 3: Score distribution histogram ────────────────────────────────────
  const BINS = [
    { label: "0 – 5",  min: 0,  max: 5,    color: "#b91c1c" },
    { label: "5 – 8",  min: 5,  max: 8,    color: "#ef4444" },
    { label: "8 – 10", min: 8,  max: 10,   color: "#f59e0b" },
    { label: "10 – 12",min: 10, max: 12,   color: "#10b981" },
    { label: "12 – 15",min: 12, max: 15,   color: "#059669" },
    { label: "15 – 20",min: 15, max: 20.1, color: "#065f46" },
  ];
  const distItems = BINS.map(b => ({
    label: b.label,
    value: progressRows.filter(r => r.annualAvg != null && r.annualAvg >= b.min && r.annualAvg < b.max).length,
    color: b.color,
  }));
  const distChart = svgVBars(distItems, { W: 420, H: 160 });

  // ── Chart 4: Subject grouped bar chart (T1/T2/T3 class avg) ──────────────────
  const subjGroups = enrichedSubjects.map(s => ({
    label: s.arLabel ?? s.subject,
    values: [s.t1ClassAvg, s.t2ClassAvg, s.t3ClassAvg],
  }));
  const subjectAvgChart = subjGroups.length > 0
    ? svgGroupedVBars(subjGroups, ["#6366f1", "#10b981", "#f59e0b"], ["ف1", "ف2", "ف3"],
        { W: Math.max(500, subjGroups.length * 55 + 60), H: 210, maxVal: 20 })
    : "";

  // ── Chart 5: Subject fail rate horizontal bars ────────────────────────────────
  const failRateItems = enrichedSubjects.map(s => ({
    label: s.arLabel ?? s.subject,
    value: s.failRate,
    color: s.failRate > 60 ? "#b91c1c" : s.failRate > 40 ? "#ef4444" : s.failRate > 20 ? "#f59e0b" : "#10b981",
  }));
  const failRateChart = failRateItems.length > 0
    ? svgHBars(failRateItems, { W: 480, maxVal: 100, unit: "%" })
    : "";

  // ── Tables ────────────────────────────────────────────────────────────────────
  const failingTable = failingRows.length === 0
    ? `<p style="color:#059669;font-weight:700;padding:12px 0">🎉 لا يوجد تلاميذ راسبون</p>`
    : `<table style="width:100%;border-collapse:collapse;font-size:11px">
        <thead><tr>
          ${th("#", true)}${th("الاسم واللقب")}${th("القسم", true)}
          ${th("م.ف1", true)}${th("م.ف2", true)}${th("م.ف3", true)}
          ${th("المعدل السنوي", true)}${th("باقي للـ10", true)}
        </tr></thead>
        <tbody>${failingRows.map((r, i) => {
          const { nom, prenom } = splitName(r.student.nomPrenom);
          const gapColor = r.gap <= 1 ? "#f59e0b" : r.gap <= 2 ? "#ef4444" : "#b91c1c";
          return `<tr style="${i % 2 === 0 ? "" : "background:#f9fafb"}">
            ${td(i + 1, true)}
            ${td(`<span style="font-weight:700">${nom}</span> <span style="color:#6b7280">${prenom}</span>`)}
            ${td(r.student.classe, true)}
            ${td(fmt(r.t1Avg), true, r.t1Avg != null && r.t1Avg < 10 ? "color:#dc2626" : "")}
            ${td(fmt(r.t2Avg), true, r.t2Avg != null && r.t2Avg < 10 ? "color:#dc2626" : "")}
            ${td(fmt(r.t3Avg), true, r.t3Avg != null && r.t3Avg < 10 ? "color:#dc2626" : "")}
            ${td(`<span style="font-weight:900;color:#dc2626">${fmt(r.annualAvg)}</span>`, true)}
            ${td(`<span style="font-weight:900;color:${gapColor}">−${r.gap.toFixed(2)}</span>`, true)}
          </tr>`;
        }).join("")}</tbody>
      </table>`;

  const progressTable = progressRows.length === 0
    ? `<p style="color:#9ca3af;padding:12px 0">لا توجد بيانات</p>`
    : `<table style="width:100%;border-collapse:collapse;font-size:11px">
        <thead><tr>
          ${th("الاسم واللقب")}${th("القسم", true)}
          ${th("م.ف1", true)}${th("م.ف2", true)}${th("م.ف3", true)}
          ${th("ف1→ف2", true)}${th("ف2→ف3", true)}${th("ف1→ف3", true)}
          ${th("المعدل", true)}${th("النتيجة", true)}
        </tr></thead>
        <tbody>${progressRows.map((r, i) => {
          const { nom, prenom } = splitName(r.student.nomPrenom);
          const passColor = r.passed ? "#059669" : "#dc2626";
          const passTxt = r.passed ? "ناجح ✓" : "راسب ✗";
          const d12 = delta(r.t1Avg, r.t2Avg);
          const d23 = delta(r.t2Avg, r.t3Avg);
          const d13 = delta(r.t1Avg, r.t3Avg);
          return `<tr style="${i % 2 === 0 ? "" : "background:#f9fafb"}">
            ${td(`<span style="font-weight:700">${nom}</span> <span style="color:#6b7280">${prenom}</span>`)}
            ${td(r.student.classe, true)}
            ${td(fmt(r.t1Avg), true)}${td(fmt(r.t2Avg), true)}${td(fmt(r.t3Avg), true)}
            ${td(trendArrow(d12), true)}${td(trendArrow(d23), true)}${td(trendArrow(d13, 0.5), true)}
            ${td(`<span style="font-weight:900">${fmt(r.annualAvg)}</span>`, true)}
            ${td(`<span style="font-weight:700;color:${passColor}">${passTxt}</span>`, true)}
          </tr>`;
        }).join("")}</tbody>
      </table>`;

  const subjectTable = enrichedSubjects.length === 0
    ? `<p style="color:#9ca3af;padding:12px 0">لا توجد بيانات مواد</p>`
    : `<table style="width:100%;border-collapse:collapse;font-size:11px">
        <thead><tr>
          ${th("المادة")}
          ${th("م.ف1", true)}${th("م.ف2", true)}${th("م.ف3", true)}
          ${th("التطور ف1→ف3", true)}
          ${th("ناجح", true)}${th("راسب", true)}${th("نسبة الرسوب", true)}
        </tr></thead>
        <tbody>${enrichedSubjects.map((s, i) => {
          const d = delta(s.t1ClassAvg, s.t3ClassAvg);
          return `<tr style="${i % 2 === 0 ? "" : "background:#f9fafb"}">
            ${td(`<span style="font-weight:700">${s.arLabel}</span>`)}
            ${td(fmt(s.t1ClassAvg), true)}${td(fmt(s.t2ClassAvg), true)}${td(fmt(s.t3ClassAvg), true)}
            ${td(trendArrow(d, 0.3), true)}
            ${td(`<span style="color:#059669;font-weight:700">${s.passCount}</span>`, true)}
            ${td(`<span style="color:#dc2626;font-weight:700">${s.failCount}</span>`, true)}
            ${td(`${s.failRate}%`, true, s.failRate > 50 ? "color:#dc2626;font-weight:700" : "")}
          </tr>`;
        }).join("")}</tbody>
      </table>`;

  // ── Full HTML ─────────────────────────────────────────────────────────────────
  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <title>تقرير — ${title}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Arial', 'Tahoma', sans-serif; direction: rtl; font-size: 12px;
           color: #111827; background: #fff; padding: 20px 24px; max-width: 960px; margin: 0 auto; }
    h2 { font-size: 13px; font-weight: 700; color: #4f46e5;
         border-bottom: 2px solid #e0e7ff; padding-bottom: 5px; margin-bottom: 12px; }
    .section { margin-bottom: 26px; }
    .chart-caption { font-size: 10px; color: #6b7280; margin-top: 5px; text-align: center; }
    .page-break { page-break-before: always; padding-top: 16px; }
    .chart-row { display: flex; gap: 24px; align-items: flex-start; flex-wrap: wrap; }
    .chart-row svg { flex-shrink: 0; }
    @media print {
      body { padding: 8px 12px; }
      .section { margin-bottom: 16px; }
    }
  </style>
</head>
<body>

  <!-- Header -->
  <div style="display:flex;justify-content:space-between;align-items:flex-start;
              border-bottom:3px solid #4f46e5;padding-bottom:12px;margin-bottom:20px">
    <div>
      <div style="font-size:20px;font-weight:900;color:#4f46e5">${title}</div>
      ${school ? `<div style="font-size:12px;color:#6b7280;margin-top:3px">${school.nom} — ${school.wilaya} / ${school.commune}</div>` : ""}
      <div style="font-size:12px;color:#6b7280">السنة الدراسية: ${annee}</div>
    </div>
    <div style="text-align:left;font-size:11px;color:#6b7280">
      <div>تاريخ التقرير: ${today}</div>
      ${school?.directeur ? `<div>المدير: ${school.directeur}</div>` : ""}
    </div>
  </div>

  <!-- KPI Bar -->
  <div class="section">
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      ${kpiBox("مجموع التلاميذ", boys.length + girls.length, "#ede9fe", "#6d28d9")}
      ${kpiBox("ذكور",   boys.length,    "#dbeafe", "#1d4ed8")}
      ${kpiBox("إناث",  girls.length,   "#fce7f3", "#be185d")}
      ${kpiBox("الناجحون", passed.length, "#d1fae5", "#065f46")}
      ${kpiBox("الراسبون", failed.length, "#fee2e2", "#b91c1c")}
      ${successRate != null ? kpiBox("نسبة النجاح", successRate + "%", "#fef9c3", "#92400e") : ""}
    </div>
  </div>

  <!-- Section 1: Success rates -->
  <div class="section">
    <h2>📊 نسبة النجاح التفصيلية</h2>
    <div class="chart-row">
      <div>
        ${successChart}
        <p class="chart-caption">مقارنة نسب النجاح (إجمالي — ذكور — إناث — نسبة الرسوب)</p>
      </div>
      <div style="flex:1;min-width:200px">
        <table style="width:100%;border-collapse:collapse;font-size:11px">
          <thead><tr>
            ${th("الفئة")}${th("ناجح", true)}${th("المجموع", true)}${th("النسبة", true)}
          </tr></thead>
          <tbody>
            <tr><td style="padding:5px 8px;border:1px solid #e5e7eb;font-weight:700">إجمالي</td>
              ${td(passed.length, true)}${td(withAvg.length, true)}
              ${td(`<span style="font-weight:900;color:#6366f1">${successRate ?? "—"}%</span>`, true)}
            </tr>
            <tr style="background:#f9fafb"><td style="padding:5px 8px;border:1px solid #e5e7eb;font-weight:700">ذكور</td>
              ${td(boysPassed.length, true)}${td(boysWithAvg.length, true)}
              ${td(`<span style="font-weight:900;color:#3b82f6">${boysRate ?? "—"}%</span>`, true)}
            </tr>
            <tr><td style="padding:5px 8px;border:1px solid #e5e7eb;font-weight:700">إناث</td>
              ${td(girlsPassed.length, true)}${td(girlsWithAvg.length, true)}
              ${td(`<span style="font-weight:900;color:#ec4899">${girlsRate ?? "—"}%</span>`, true)}
            </tr>
            <tr style="background:#fff5f5"><td style="padding:5px 8px;border:1px solid #e5e7eb;font-weight:700;color:#b91c1c">الراسبون</td>
              ${td(`<span style="color:#b91c1c;font-weight:700">${failed.length}</span>`, true)}${td(withAvg.length, true)}
              ${td(`<span style="font-weight:900;color:#ef4444">${failRate ?? "—"}%</span>`, true)}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <!-- Section 2: Failing students -->
  <div class="section">
    <h2>⚠️ الراسبون وكم باقي لهم للمعدل 10</h2>
    <p style="font-size:10px;color:#6b7280;margin-bottom:8px">مرتبون من الأقرب للنجاح إلى الأبعد</p>
    ${failingTable}
  </div>

  <!-- Section 3: Trimester progress per student + class avg chart -->
  <div class="section page-break">
    <h2>📈 تحسنات وتراجعات المعدل الفصلي لكل تلميذ</h2>
    <div class="chart-row" style="margin-bottom:14px">
      <div>
        ${progressionChart}
        <p class="chart-caption">معدل القسم الإجمالي لكل فصل</p>
      </div>
      <div style="flex:1;min-width:180px;align-self:center">
        <table style="width:100%;border-collapse:collapse;font-size:11px">
          <thead><tr>${th("الفصل")}${th("معدل القسم", true)}${th("التغير", true)}</tr></thead>
          <tbody>
            <tr>${td("الفصل الأول")}${td(fmt(classT1), true)}${td("—", true)}</tr>
            <tr style="background:#f9fafb">${td("الفصل الثاني")}${td(fmt(classT2), true)}${td(trendArrow(delta(classT1, classT2)), true)}</tr>
            <tr>${td("الفصل الثالث")}${td(fmt(classT3), true)}${td(trendArrow(delta(classT2, classT3)), true)}</tr>
          </tbody>
        </table>
      </div>
    </div>
    <p style="font-size:10px;color:#6b7280;margin-bottom:8px">م.ف = معدل الفصل | ف1→ف2/ف3 = التغير بين الفصول</p>
    ${progressTable}
  </div>

  <!-- Section 4: Score distribution -->
  <div class="section">
    <h2>📐 توزيع المعدلات السنوية</h2>
    ${distChart}
    <p class="chart-caption">عدد التلاميذ حسب شريحة المعدل السنوي</p>
  </div>

  <!-- Section 5: Subject analysis -->
  <div class="section page-break">
    <h2>📚 تحسنات وتراجعات كل مادة (معدل القسم)</h2>
    ${subjectAvgChart
      ? `<div style="overflow-x:auto;margin-bottom:12px">
           ${subjectAvgChart}
           <p class="chart-caption">معدل القسم في كل مادة لكل فصل (أعمدة: أزرق=ف1 — أخضر=ف2 — أصفر=ف3)</p>
         </div>`
      : ""}
    <p style="font-size:10px;color:#6b7280;margin-bottom:8px">م.ف1/2/3 = معدل القسم في المادة | التطور = الفرق بين ف1 و ف3</p>
    ${subjectTable}
  </div>

  <!-- Section 6: Subject fail rate -->
  ${failRateChart
    ? `<div class="section">
         <h2>🔴 نسبة الرسوب في كل مادة</h2>
         ${failRateChart}
         <p class="chart-caption">نسبة التلاميذ الراسبين في كل مادة (أخضر &lt;20% — أصفر &lt;40% — أحمر &gt;60%)</p>
       </div>`
    : ""}

  <!-- Footer -->
  <div style="border-top:1px solid #e5e7eb;padding-top:8px;margin-top:20px;
              display:flex;justify-content:space-between;font-size:10px;color:#9ca3af">
    <span>مدير {SCHOOL_STAGE === "lycee" ? "الثانوية" : "المتوسطة"} — رفيق الرقمنة</span>
    <span>${title} | ${annee}</span>
  </div>

</body>
</html>`;
}
