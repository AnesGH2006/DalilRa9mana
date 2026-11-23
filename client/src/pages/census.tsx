import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import {
  FileSpreadsheet, Printer, Loader2, Users, X, ChevronRight, ChevronLeft,
  ClipboardList, BarChart3, CalendarDays, GraduationCap, School, Layers,
  MousePointerClick, FileText,
} from "lucide-react";

const CURRENT_YEAR = "2026-2027";
const NIVEAUX = ["", "1AM", "2AM", "3AM", "4AM", "1AS", "2AS", "3AS"];
const SEXES = ["", "M", "F"];
const STATUTS = ["", "nouveau", "redoublant"];
const RESULTATS = ["", "admis", "non_admis", "mustarrak"];

type Sheet = { name: string; headers: string[]; rows: Array<Array<string | number | null>> };
type Report = { title?: string; generatedAt?: string; sheets?: Sheet[] };
type StudentRow = { id: string; raqm: number | null; nomPrenom: string; dateNaissance: string | null; niveau: string; classe: string; filiere: string | null; sexe: string; statut: string; resultat: string | null };
type StudentsPage = { page: number; pageSize: number; total: number; items: StudentRow[] };

async function readJson<T>(res: Response): Promise<T> { const data = await res.json().catch(() => ({})); if (!res.ok) throw new Error((data as any)?.error ?? "Request failed"); return data as T; }

function sheetIcon(name: string) {
  if (name.includes("مستوى")) return Layers;
  if (name.includes("قسم") || name.includes("شعبة")) return School;
  if (name.includes("جنس")) return Users;
  if (name.includes("عمر") || name.includes("فئة")) return CalendarDays;
  if (name.includes("نتيجة")) return GraduationCap;
  if (name.includes("وضعية") || name.includes("فئة")) return BarChart3;
  return ClipboardList;
}

const fadeUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4 },
};

export default function CensusPage() {
  const [annee, setAnnee] = useState(CURRENT_YEAR);
  const [report, setReport] = useState<Report | null>(null);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [filters, setFilters] = useState({ niveau: "", classe: "", sexe: "", statut: "", resultat: "", q: "" });
  const [page, setPage] = useState(1);
  const [students, setStudents] = useState<StudentsPage | null>(null);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const pageSize = 25;
  const sheets = useMemo(() => report?.sheets ?? [], [report]);
  const sheet = sheets.length ? sheets[Math.min(sheetIndex, sheets.length - 1)] : null;
  const totalRows = useMemo(() => sheet?.rows.length ?? 0, [sheet]);
  const totalPages = Math.max(1, Math.ceil((students?.total ?? 0) / pageSize));

  async function loadReport() {
    setLoading(true);
    try { const res = await fetch(`/api/reports/census?annee=${encodeURIComponent(annee)}&format=json`, { credentials: "same-origin" }); setReport(await readJson<Report>(res)); setSheetIndex(0); toast({ title: "تم توليد الإحصاء الشامل" }); }
    catch (e: any) { toast({ title: "فشل توليد الإحصاء", description: e?.message, variant: "destructive" }); }
    finally { setLoading(false); }
  }

  async function loadStudents() {
    setLoadingStudents(true);
    try {
      const params = new URLSearchParams({ annee, page: String(page), pageSize: String(pageSize) });
      Object.entries(filters).forEach(([k, v]) => { if (v.trim()) params.set(k, v.trim()); });
      const res = await fetch(`/api/reports/census/students?${params}`, { credentials: "same-origin" });
      setStudents(await readJson<StudentsPage>(res));
    } catch (e: any) { toast({ title: "فشل تحميل الأسماء", description: e?.message, variant: "destructive" }); }
    finally { setLoadingStudents(false); }
  }

  useEffect(() => { if (open) loadStudents(); }, [open, page, filters]);

  function openFromSheet(s: Sheet, row: Array<string | number | null>) {
    const next = { niveau: "", classe: "", sexe: "", statut: "", resultat: "", q: "" };
    if (s.name.includes("المستوى") && row[0]) next.niveau = String(row[0]);
    if (s.name.includes("القسم") && row[0]) next.classe = String(row[0]);
    if (s.name.includes("الجنس") && row[0]) next.sexe = String(row[0]).includes("ذكر") ? "M" : String(row[0]).includes("أنثى") ? "F" : "";
    setFilters(next); setPage(1); setOpen(true);
  }

  function download(format: "xlsx" | "html") { window.open(`/api/reports/census?annee=${encodeURIComponent(annee)}&format=${format}`, "_blank"); }

  return (
    <div className="min-h-full bg-dot-grid p-4 md:p-6" dir="rtl">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header */}
        <motion.header
          initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
          className="relative overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-l from-emerald-600/10 via-teal-600/5 to-transparent p-6 shadow-sm"
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/30">
                <ClipboardList className="h-6 w-6 text-white" />
              </div>
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">Pro</Badge>
                  <Badge className="border-teal-500/30 bg-teal-500/15 text-teal-700 dark:text-teal-300">Official</Badge>
                </div>
                <h1 className="text-2xl font-black tracking-tight sm:text-3xl">الإحصاء الشامل</h1>
                <p className="max-w-2xl text-sm text-muted-foreground">
                  أعداد صافية حسب المستوى، القسم، الجنس، الفئة العمرية، الوضعية والنتيجة — بدون عرض أسماء إلا داخل النافذة المنبثقة.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card/80 px-4 py-2.5 shadow-sm">
                <CalendarDays className="h-5 w-5 text-emerald-500" />
                <div>
                  <label htmlFor="census-annee" className="block text-[11px] text-muted-foreground">السنة الدراسية</label>
                  <Input id="census-annee" value={annee} onChange={e => setAnnee(e.target.value)} className="mt-0.5 h-8 w-32 px-2 text-sm" />
                </div>
              </div>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button onClick={loadReport} disabled={loading} className="gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white border-0 shadow-sm hover:from-emerald-600 hover:to-teal-700">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardList className="h-4 w-4" />}
              توليد الإحصاء
            </Button>
            <Button variant="outline" onClick={() => download("xlsx")} className="gap-2">
              <FileSpreadsheet className="h-4 w-4 text-emerald-600" /> Excel
            </Button>
            <Button variant="outline" onClick={() => download("html")} className="gap-2">
              <Printer className="h-4 w-4 text-teal-600" /> HTML / PDF
            </Button>
            <Button variant="outline" onClick={() => setOpen(true)} className="gap-2">
              <Users className="h-4 w-4 text-blue-600" /> الأسماء
            </Button>
          </div>
        </motion.header>

        {report && (
          <motion.div {...fadeUp} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "الجداول", value: sheets.length, icon: Layers, cls: "text-emerald-500" },
              { label: "صفوف الجدول الحالي", value: totalRows, icon: BarChart3, cls: "text-teal-500" },
              { label: "تاريخ التوليد", value: report.generatedAt ? new Date(report.generatedAt).toLocaleDateString("ar-DZ") : "—", icon: CalendarDays, cls: "text-blue-500" },
              { label: "السنة", value: annee, icon: GraduationCap, cls: "text-violet-500" },
            ].map(stat => (
              <div key={stat.label} className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted ${stat.cls}`}>
                  <stat.icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] text-muted-foreground">{stat.label}</p>
                  <p className="truncate text-sm font-bold">{stat.value}</p>
                </div>
              </div>
            ))}
          </motion.div>
        )}

        {sheet ? (
          <motion.div {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.08 }}>
            <Card className="overflow-hidden shadow-md">
              <CardHeader className="border-b border-border/60 bg-gradient-to-l from-emerald-500/10 to-transparent">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-xl">
                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow">
                        {(() => { const Icon = sheetIcon(sheet.name); return <Icon className="h-4 w-4 text-white" />; })()}
                      </span>
                      {report?.title ?? sheet.name}
                    </CardTitle>
                    <CardDescription className="mt-1 flex items-center gap-1.5">
                      <MousePointerClick className="h-3.5 w-3.5" />
                      انقر على أي صف في جداول المستوى/القسم/الجنس لفتح الأسماء في النافذة المنبثقة.
                    </CardDescription>
                  </div>
                  <Badge variant="secondary" className="gap-1">
                    <FileText className="h-3 w-3" /> {sheet.rows.length} صف
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="flex flex-wrap gap-2 border-b border-border/60 p-3">
                  {sheets.map((s, i) => {
                    const Icon = sheetIcon(s.name);
                    const active = i === sheetIndex;
                    return (
                      <button key={s.name} onClick={() => setSheetIndex(i)}
                        className={`flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${active ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 shadow-sm" : "border-border/60 bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
                        <Icon className="h-3.5 w-3.5" />
                        {s.name}
                      </button>
                    );
                  })}
                </div>
                <div className="max-h-[560px] overflow-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 z-10">
                      <tr className="bg-muted/80 backdrop-blur">
                        {sheet.headers.map(h => (
                          <th key={h} className="border-b border-border/60 px-3 py-2.5 text-start font-bold text-foreground">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sheet.rows.map((row, ri) => (
                        <tr key={ri} onClick={() => openFromSheet(sheet, row)}
                          className="cursor-pointer border-b border-border/40 transition-colors odd:bg-muted/20 hover:bg-emerald-500/10">
                          {row.map((cell, ci) => (
                            <td key={ci} className={`px-3 py-2 ${ci === 0 ? "font-semibold text-foreground" : "text-muted-foreground"}`}>{cell ?? ""}</td>
                          ))}
                        </tr>
                      ))}
                      {sheet.rows.length === 0 && (
                        <tr><td colSpan={sheet.headers.length} className="p-10 text-center text-muted-foreground">لا توجد بيانات في هذا الجدول</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ) : (
          <motion.div {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.08 }}>
            <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-border/70 bg-card/60 p-14 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500/15 to-teal-500/15">
                <BarChart3 className="h-8 w-8 text-emerald-500" />
              </div>
              <div>
                <p className="font-bold">الإحصاء الشامل جاهز للتوليد</p>
                <p className="mt-1 text-sm text-muted-foreground">اختر السنة الدراسية واضغط «توليد الإحصاء» لعرض الجداول الرسمية.</p>
              </div>
              <Button onClick={loadReport} disabled={loading} className="mt-2 gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white border-0">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardList className="h-4 w-4" />}
                توليد الآن
              </Button>
            </div>
          </motion.div>
        )}
      </div>

      {/* Students modal */}
      <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={() => setOpen(false)}
        >
          <motion.div
            className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-border/60 bg-card shadow-2xl"
            initial={{ scale: 0.96, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96, y: 16 }}
            transition={{ type: "spring", stiffness: 300, damping: 28 }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border/60 bg-gradient-to-l from-emerald-500/10 to-transparent p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow">
                  <Users className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h2 className="font-bold">الأسماء للتحقق / الطباعة</h2>
                  <p className="text-xs text-muted-foreground">{students?.total ?? 0} تلميذ مطابق للفلاتر</p>
                </div>
              </div>
              <button onClick={() => setOpen(false)} className="rounded-lg p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground" aria-label="إغلاق">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid gap-2 border-b border-border/60 p-4 md:grid-cols-3 lg:grid-cols-6">
              <Select value={filters.niveau || "all"} onValueChange={v => setFilters(f => ({ ...f, niveau: v === "all" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="المستوى" /></SelectTrigger>
                <SelectContent>{NIVEAUX.map(n => <SelectItem key={n || "all"} value={n || "all"}>{n || "الكل"}</SelectItem>)}</SelectContent>
              </Select>
              <Input placeholder="القسم" value={filters.classe} onChange={e => setFilters(f => ({ ...f, classe: e.target.value }))} />
              <Select value={filters.sexe || "all"} onValueChange={v => setFilters(f => ({ ...f, sexe: v === "all" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="الجنس" /></SelectTrigger>
                <SelectContent>{SEXES.map(s => <SelectItem key={s || "all"} value={s || "all"}>{s === "M" ? "ذكر" : s === "F" ? "أنثى" : "الكل"}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={filters.statut || "all"} onValueChange={v => setFilters(f => ({ ...f, statut: v === "all" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="الوضعية" /></SelectTrigger>
                <SelectContent>{STATUTS.map(s => <SelectItem key={s || "all"} value={s || "all"}>{s === "nouveau" ? "جديد" : s === "redoublant" ? "معيد" : "الكل"}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={filters.resultat || "all"} onValueChange={v => setFilters(f => ({ ...f, resultat: v === "all" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="النتيجة" /></SelectTrigger>
                <SelectContent>{RESULTATS.map(s => <SelectItem key={s || "all"} value={s || "all"}>{s === "admis" ? "ناجح" : s === "non_admis" ? "راسب" : s === "mustarrak" ? "مسترك" : "الكل"}</SelectItem>)}</SelectContent>
              </Select>
              <Input placeholder="بحث بالاسم" value={filters.q} onChange={e => setFilters(f => ({ ...f, q: e.target.value }))} />
            </div>

            <div className="max-h-[55vh] flex-1 overflow-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-muted/80 backdrop-blur">
                    {["رقم القيد", "اللقب والاسم", "المستوى", "القسم", "الشعبة", "الجنس", "الوضعية", "النتيجة"].map(h => (
                      <th key={h} className="border-b border-border/60 px-3 py-2.5 text-start font-bold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loadingStudents ? (
                    <tr><td colSpan={8} className="p-10 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" /></td></tr>
                  ) : students?.items.length ? (
                    students.items.map(s => (
                      <tr key={s.id} className="border-b border-border/40 odd:bg-muted/20 hover:bg-emerald-500/10 transition-colors">
                        <td className="px-3 py-2 font-semibold">{s.raqm ?? ""}</td>
                        <td className="px-3 py-2 font-semibold">{s.nomPrenom}</td>
                        <td className="px-3 py-2 text-muted-foreground">{s.niveau}</td>
                        <td className="px-3 py-2 text-muted-foreground">{s.classe}</td>
                        <td className="px-3 py-2 text-muted-foreground">{s.filiere ?? ""}</td>
                        <td className="px-3 py-2 text-muted-foreground">{s.sexe === "M" ? "ذكر" : "أنثى"}</td>
                        <td className="px-3 py-2 text-muted-foreground">{s.statut === "nouveau" ? "جديد" : "معيد"}</td>
                        <td className="px-3 py-2 text-muted-foreground">{s.resultat ?? ""}</td>
                      </tr>
                    ))
                  ) : (
                    <tr><td colSpan={8} className="p-10 text-center text-muted-foreground">لا توجد نتائج مطابقة</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between border-t border-border/60 p-3 text-sm">
              <span className="text-muted-foreground">صفحة {students?.page ?? page} / {totalPages} — {students?.total ?? 0} نتيجة</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                  <ChevronRight className="h-4 w-4" /> السابق
                </Button>
                <Button size="sm" variant="outline" disabled={!students || page * pageSize >= students.total} onClick={() => setPage(p => p + 1)}>
                  التالي <ChevronLeft className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  );
}
