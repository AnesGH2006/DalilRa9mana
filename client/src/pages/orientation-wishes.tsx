import { useState, useEffect, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  ClipboardList, Upload, Search, CheckCircle2, XCircle, HelpCircle, Users, Printer,
} from "lucide-react";
import { allocateFourAMStreams, getFourAMCapacities, getFourAMPreferredStream } from "@/lib/4am-stream-allocation";
import type { OrientationWish, StudentResult } from "@shared/types";

const BASE = import.meta.env.BASE_URL;
const YEARS = ["2026-2027", "2025-2026", "2024-2025", "2023-2024"];

export default function OrientationWishesPage() {
  const [year, setYear] = useState(() => localStorage.getItem("cem-selected-year") || "2026-2027");
  const [wishes, setWishes] = useState<OrientationWish[]>([]);
  const [results, setResults] = useState<StudentResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [q, setQ] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const fetchData = useCallback(async (y: string) => {
    setLoading(true);
    try {
      const [wishesResponse, resultsResponse] = await Promise.all([
        fetch(`${BASE}api/orientation/wishes?annee=${y}`, { credentials: "include" }),
        fetch(`${BASE}api/results?annee=${y}&niveau=4AM`, { credentials: "include" }),
      ]);
      const [wishesData, resultsData] = await Promise.all([
        wishesResponse.ok ? wishesResponse.json() as Promise<OrientationWish[]> : [],
        resultsResponse.ok ? resultsResponse.json() as Promise<StudentResult[]> : [],
      ]);
      setWishes(wishesData);
      setResults(resultsData);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(year); localStorage.setItem("cem-selected-year", year); }, [year, fetchData]);

  const handleUpload = async (files: FileList | null) => {
    if (!files || !files.length) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("annee", year);
      Array.from(files).forEach(f => form.append("files", f));
      const res = await fetch(`${BASE}api/orientation/wishes/import`, {
        method: "POST",
        credentials: "include",
        body: form,
      });
      const data = await res.json();
      if (res.ok) {
        toast({
          title: "تم استيراد الرغبات",
          description: `تم استيراد ${data.imported} تلميذاً، تمت مطابقة ${data.matched} منهم مع سجل التلاميذ${data.unmatched.length ? `، لم تتم مطابقة ${data.unmatched.length}` : ""}.`,
        });
        fetchData(year);
      } else {
        toast({ title: "فشل الاستيراد", description: data.error ?? "خطأ غير متوقع", variant: "destructive" });
      }
    } catch {
      toast({ title: "فشل الاستيراد", description: "تعذّر الاتصال بالخادم", variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const filtered = wishes.filter(w =>
    !q || `${w.lastName} ${w.firstName}`.toLowerCase().includes(q.toLowerCase())
  );

  const wishesByStudent = new Map(wishes.flatMap(wish => wish.studentId ? [[wish.studentId, wish.choices] as const] : []));
  const assignedStreams = allocateFourAMStreams(results, getFourAMCapacities(year), wishesByStudent);
  const getSuggestion = (wish: OrientationWish) => {
    const stream = wish.studentId ? assignedStreams.get(wish.studentId) : undefined;
    if (stream === "science") return "جذع مشترك علوم وتكنولوجيا";
    if (stream === "arts") return "جذع مشترك آداب";
    return null;
  };
  const firstChoiceMatches = (wish: OrientationWish) => {
    const preferred = getFourAMPreferredStream(wish.choices);
    const assigned = wish.studentId ? assignedStreams.get(wish.studentId) : undefined;
    return preferred && assigned ? preferred === assigned : null;
  };
  const matchedCount = wishes.filter(wish => firstChoiceMatches(wish) === true).length;
  const mismatchCount = wishes.filter(wish => firstChoiceMatches(wish) === false).length;
  const unmatchedStudentCount = wishes.filter(w => !w.studentId).length;

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.45, ease: "easeOut" }} className="p-6 space-y-6 max-w-6xl mx-auto">

      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: "easeOut" }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 no-print">
        <div>
          <h1 className="text-2xl font-black bg-gradient-to-r from-amber-600 to-orange-500 bg-clip-text text-transparent flex items-center gap-2.5">
            <motion.span
              initial={{ scale: 0.6, rotate: -8, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="inline-flex w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 items-center justify-center shadow-lg shadow-amber-500/30">
              <ClipboardList className="w-4.5 h-4.5 text-white" />
            </motion.span>
            رغبات التوجيه المسبق
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5 ms-11">مقارنة الرغبة الأولى بالتوزيع المقترح حسب المعدل الموزون وسعة المقاعد</p>
        </div>
        <div className="flex items-center gap-2 no-print flex-wrap">
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger className="w-36 h-9 bg-gradient-to-r from-amber-600 to-orange-600 text-white border-0 shadow-lg font-semibold text-xs transition-transform duration-200 hover:scale-[1.03] active:scale-[0.97]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>{YEARS.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
          </Select>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            multiple
            className="hidden"
            onChange={(e) => handleUpload(e.target.files)}
          />
          <Button size="sm" variant="outline" className="gap-1.5 h-9 text-xs transition-all duration-200 hover:scale-[1.03] hover:shadow-md active:scale-[0.97]" disabled={uploading}
            onClick={() => fileInputRef.current?.click()}>
            {uploading
              ? <motion.span animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}>
                  <Upload className="w-3.5 h-3.5" />
                </motion.span>
              : <Upload className="w-3.5 h-3.5" />}
            {uploading ? "جارِ الاستيراد..." : "استيراد ملفات الرغبات"}
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5 h-9 text-xs transition-all duration-200 hover:scale-[1.03] hover:shadow-md active:scale-[0.97]" onClick={() => window.print()}>
            <Printer className="w-3.5 h-3.5" /> طباعة
          </Button>
        </div>
      </motion.div>

      {loading ? (
        <div className="flex flex-col items-center justify-center gap-3 py-24">
          <motion.div className="w-10 h-10 rounded-full border-2 border-amber-500 border-t-transparent"
            animate={{ rotate: 360 }} transition={{ duration: 0.9, repeat: Infinity, ease: "linear" }} />
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
            className="text-xs text-muted-foreground">جارِ التحميل...</motion.p>
        </div>
      ) : wishes.length === 0 ? (
        <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4, ease: "easeOut" }}
          className="text-center py-20 rounded-2xl border border-dashed border-muted-foreground/20 bg-muted/10">
          <motion.div animate={{ y: [0, -6, 0] }} transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}>
            <ClipboardList className="w-14 h-14 mx-auto mb-4 text-muted-foreground/30" />
          </motion.div>
          <p className="text-muted-foreground mb-3">لا توجد رغبات مستوردة لهذه السنة الدراسية</p>
          <Button size="sm" className="gap-1.5 transition-transform duration-200 hover:scale-105 active:scale-95" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
            <Upload className="w-3.5 h-3.5" /> استيراد ملفات الرغبات
          </Button>
        </motion.div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "الإجمالي", value: wishes.length, from: "from-slate-600", to: "to-slate-800" },
              { label: "رغبة 1 = الاقتراح", value: matchedCount, from: "from-emerald-500", to: "to-green-700" },
              { label: "رغبة 1 ≠ الاقتراح", value: mismatchCount, from: "from-orange-500", to: "to-amber-700" },
              { label: "غير مطابق لسجل التلاميذ", value: unmatchedStudentCount, from: "from-red-500", to: "to-rose-700" },
            ].map((card, idx) => (
              <motion.div key={card.label}
                initial={{ opacity: 0, y: 16, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ delay: idx * 0.06, duration: 0.4, ease: "easeOut" }}
                whileHover={{ y: -3, scale: 1.02 }}
                className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${card.from} ${card.to} p-4 shadow-lg transition-shadow duration-300 hover:shadow-xl cursor-default`}>
                <div className="absolute -top-6 -end-6 w-24 h-24 rounded-full bg-white/10 blur-xl" />
                <p className="relative text-white/80 text-xs font-semibold mb-1">{card.label}</p>
                <motion.p key={card.value} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                  className="relative text-white font-black text-3xl tabular-nums">{card.value}</motion.p>
              </motion.div>
            ))}
          </div>

          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
            className="relative no-print">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input value={q} onChange={e => setQ(e.target.value)} placeholder="بحث بالاسم..."
              className="ps-9 h-10 transition-shadow duration-200 focus-visible:shadow-md" />
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.4, ease: "easeOut" }}>
            <Card className="border-0 bg-card/80 shadow-md overflow-hidden">
              <CardHeader className="pb-2 border-b">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <Users className="w-4 h-4 text-amber-500" />
                  قائمة الرغبات ({filtered.length})
                </CardTitle>
              </CardHeader>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 border-b text-muted-foreground text-xs">
                      <th className="p-3 text-right">الاسم</th>
                      <th className="p-3 text-center">المعدل</th>
                      <th className="p-3 text-right">الرغبات المرتّبة</th>
                      <th className="p-3 text-center">المسار المقترح آلياً</th>
                      <th className="p-3 text-center">التطابق</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((w, i) => (
                      <motion.tr key={w.id}
                        initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: Math.min(i * 0.015, 0.4), duration: 0.3, ease: "easeOut" }}
                        className={`border-b last:border-0 transition-colors duration-150 hover:bg-amber-50/60 dark:hover:bg-amber-950/20 ${i % 2 !== 0 ? "bg-muted/10" : ""}`}>
                        <td className="p-3 font-semibold">
                          {w.lastName} {w.firstName}
                          {!w.studentId && (
                            <Badge variant="outline" className="ms-2 text-[10px] border-red-300 text-red-600">غير موجود في سجل التلاميذ</Badge>
                          )}
                        </td>
                        <td className="p-3 text-center font-black text-emerald-600 tabular-nums">
                          {w.annualAvg !== null ? w.annualAvg.toFixed(2) : "—"}
                        </td>
                        <td className="p-3">
                          <div className="flex flex-wrap gap-1.5">
                            {w.choices.map((c, idx) => (
                              <span key={idx} className={`text-[11px] font-bold px-2 py-0.5 rounded-full border transition-transform duration-150 hover:scale-105 ${
                                idx === 0 ? "bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300" : "bg-muted text-muted-foreground"
                              }`}>
                                {idx + 1}. {c}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="p-3 text-center">
                          {getSuggestion(w)
                            ? <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">{getSuggestion(w)}</span>
                            : <span className="text-xs text-muted-foreground">—</span>}
                        </td>
                        <td className="p-3 text-center">
                          {firstChoiceMatches(w) === true && (
                            <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 300, damping: 18 }} className="inline-flex">
                              <CheckCircle2 className="w-4.5 h-4.5 text-emerald-500 mx-auto" />
                            </motion.span>
                          )}
                          {firstChoiceMatches(w) === false && (
                            <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 300, damping: 18 }} className="inline-flex">
                              <XCircle className="w-4.5 h-4.5 text-orange-500 mx-auto" />
                            </motion.span>
                          )}
                          {firstChoiceMatches(w) === null && <HelpCircle className="w-4.5 h-4.5 text-muted-foreground/40 mx-auto" />}
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </motion.div>
        </>
      )}
    </motion.div>
  );
}
