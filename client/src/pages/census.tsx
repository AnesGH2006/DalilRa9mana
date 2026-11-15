import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { FileSpreadsheet, Printer, Loader2, Users, X, ChevronRight, ChevronLeft } from "lucide-react";

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
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-6" dir="rtl">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="rounded-3xl border border-slate-800 bg-gradient-to-l from-slate-900 to-indigo-950 p-5 shadow-xl">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex gap-2"><Badge className="bg-cyan-500/20 text-cyan-100 border-cyan-500/30">Census</Badge><Badge className="bg-emerald-500/20 text-emerald-100 border-emerald-500/30">Средний + Вторичный</Badge></div>
              <h1 className="mt-2 text-2xl font-black">الإحصاء الشامل للمؤسسة</h1>
              <p className="text-sm text-slate-400">أعداد صافية حسب المستوى، القسم، الجنس، الفئة العمرية، الوضعية، والنتيجة — بدون عرض أسماء إلا داخل Modal.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Input value={annee} onChange={e => setAnnee(e.target.value)} className="w-32 border-slate-800 bg-slate-900" />
              <Button onClick={loadReport} disabled={loading} className="bg-cyan-500 text-slate-950 hover:bg-cyan-400">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "توليد"}</Button>
              <Button variant="outline" onClick={() => download("xlsx")} className="border-slate-700 bg-slate-900"><FileSpreadsheet className="h-4 w-4" /> Excel</Button>
              <Button variant="outline" onClick={() => download("html")} className="border-slate-700 bg-slate-900"><Printer className="h-4 w-4" /> HTML/PDF</Button>
              <Button variant="outline" onClick={() => setOpen(true)} className="border-slate-700 bg-slate-900"><Users className="h-4 w-4" /> الأسماء</Button>
            </div>
          </div>
        </header>

        {sheet ? (
          <Card className="border-slate-800 bg-slate-900/80">
            <CardHeader className="border-b border-slate-800"><CardTitle>{report?.title}</CardTitle><CardDescription>انقر على صف في جداول المستوى/القسم/الجنس لفتح الأسماء في Modal.</CardDescription></CardHeader>
            <CardContent className="p-0">
              <div className="flex flex-wrap gap-2 border-b border-slate-800 p-3">{sheets.map((s, i) => <button key={s.name} onClick={() => setSheetIndex(i)} className={`rounded-full border px-3 py-1 text-xs ${i === sheetIndex ? "border-cyan-400 bg-cyan-500/20 text-cyan-100" : "border-slate-800 bg-slate-950 text-slate-400"}`}>{s.name}</button>)}</div>
              <div className="max-h-[560px] overflow-auto"><table className="w-full text-xs"><thead className="sticky top-0 bg-slate-900"><tr>{sheet.headers.map(h => <th key={h} className="border-b border-slate-800 px-3 py-2 text-right">{h}</th>)}</tr></thead><tbody>{sheet.rows.map((row, ri) => <tr key={ri} onClick={() => openFromSheet(sheet, row)} className="cursor-pointer odd:bg-slate-950/40 hover:bg-cyan-500/10">{row.map((cell, ci) => <td key={ci} className="border-b border-slate-900 px-3 py-2">{cell ?? ""}</td>)}</tr>)}</tbody></table></div>
            </CardContent>
          </Card>
        ) : <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/50 p-10 text-center text-slate-500">اضغط “توليد” لبناء الإحصاء الشامل.</div>}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setOpen(false)}>
          <div className="max-h-[90vh] w-full max-w-6xl overflow-hidden rounded-2xl border border-slate-800 bg-slate-950" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-800 p-4"><h2 className="font-bold">الأسماء للتحقق / الطباعة ({students?.total ?? 0})</h2><button onClick={() => setOpen(false)}><X className="h-5 w-5" /></button></div>
            <div className="grid gap-2 border-b border-slate-800 p-4 md:grid-cols-6">
              <Select value={filters.niveau || "all"} onValueChange={v => setFilters(f => ({ ...f, niveau: v === "all" ? "" : v }))}><SelectTrigger className="bg-slate-900"><SelectValue placeholder="المستوى" /></SelectTrigger><SelectContent>{NIVEAUX.map(n => <SelectItem key={n || "all"} value={n || "all"}>{n || "الكل"}</SelectItem>)}</SelectContent></Select>
              <Input placeholder="القسم" value={filters.classe} onChange={e => setFilters(f => ({ ...f, classe: e.target.value }))} className="bg-slate-900" />
              <Select value={filters.sexe || "all"} onValueChange={v => setFilters(f => ({ ...f, sexe: v === "all" ? "" : v }))}><SelectTrigger className="bg-slate-900"><SelectValue placeholder="الجنس" /></SelectTrigger><SelectContent>{SEXES.map(s => <SelectItem key={s || "all"} value={s || "all"}>{s === "M" ? "ذكر" : s === "F" ? "أنثى" : "الكل"}</SelectItem>)}</SelectContent></Select>
              <Select value={filters.statut || "all"} onValueChange={v => setFilters(f => ({ ...f, statut: v === "all" ? "" : v }))}><SelectTrigger className="bg-slate-900"><SelectValue placeholder="الوضعية" /></SelectTrigger><SelectContent>{STATUTS.map(s => <SelectItem key={s || "all"} value={s || "all"}>{s === "nouveau" ? "جديد" : s === "redoublant" ? "معيد" : "الكل"}</SelectItem>)}</SelectContent></Select>
              <Select value={filters.resultat || "all"} onValueChange={v => setFilters(f => ({ ...f, resultat: v === "all" ? "" : v }))}><SelectTrigger className="bg-slate-900"><SelectValue placeholder="النتيجة" /></SelectTrigger><SelectContent>{RESULTATS.map(s => <SelectItem key={s || "all"} value={s || "all"}>{s === "admis" ? "ناجح" : s === "non_admis" ? "راسب" : s === "mustarrak" ? "مسترك" : "الكل"}</SelectItem>)}</SelectContent></Select>
              <Input placeholder="بحث بالاسم" value={filters.q} onChange={e => setFilters(f => ({ ...f, q: e.target.value }))} className="bg-slate-900" />
            </div>
            <div className="max-h-[55vh] overflow-auto"><table className="w-full text-xs"><thead className="sticky top-0 bg-slate-900"><tr>{["رقم القيد", "اللقب والاسم", "المستوى", "القسم", "الشعبة", "الجنس", "الوضعية", "النتيجة"].map(h => <th key={h} className="border-b border-slate-800 px-3 py-2 text-right">{h}</th>)}</tr></thead><tbody>{loadingStudents ? <tr><td colSpan={8} className="p-6 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></td></tr> : students?.items.map(s => <tr key={s.id} className="border-b border-slate-900"><td className="px-3 py-2">{s.raqm ?? ""}</td><td className="px-3 py-2 font-semibold">{s.nomPrenom}</td><td className="px-3 py-2">{s.niveau}</td><td className="px-3 py-2">{s.classe}</td><td className="px-3 py-2">{s.filiere ?? ""}</td><td className="px-3 py-2">{s.sexe === "M" ? "ذكر" : "أنثى"}</td><td className="px-3 py-2">{s.statut === "nouveau" ? "جديد" : "معيد"}</td><td className="px-3 py-2">{s.resultat ?? ""}</td></tr>)}</tbody></table></div>
            <div className="flex items-center justify-between border-t border-slate-800 p-3 text-sm"><span>صفحة {students?.page ?? page} / {Math.max(1, Math.ceil((students?.total ?? 0) / pageSize))}</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronRight className="h-4 w-4" /></Button><Button size="sm" variant="outline" disabled={!students || page * pageSize >= students.total} onClick={() => setPage(p => p + 1)}><ChevronLeft className="h-4 w-4" /></Button></div></div>
          </div>
        </div>
      )}
    </div>
  );
}
