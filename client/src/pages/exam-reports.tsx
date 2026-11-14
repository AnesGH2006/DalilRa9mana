import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { FileText, Download, Eye, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL;
const YEARS = ["2023-2024", "2024-2025", "2025-2026", "2026-2027"];

const REPORT_TYPES = [
  { value: "student_roster", label: "القائمة الأولية للتلاميذ" },
  { value: "census", label: "إحصائيات تعداد التلاميذ" },
  { value: "monthly", label: "التقرير الشهري" },
  { value: "invigilation_plan", label: "جدول الحراسة" },
  { value: "seating_plan", label: "قوائم التفويج" },
] as const;

type ReportType = typeof REPORT_TYPES[number]["value"];
type ExamSession = { id: string; title: string; examDate: string; classe: string | null; subject: string | null };
type ReportSheet = { name: string; headers: string[]; rows: Array<Array<string | number | null>> };
type OfficialReport = { type: string; title: string; generatedAt: string; params: Record<string, any>; sheets: ReportSheet[] };

async function api<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}api${path}`, { credentials: "include" });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as any)?.error || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

function query(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) search.set(key, value);
  return search.toString();
}

export default function ExamReportsPage() {
  const { toast } = useToast();
  const [annee, setAnnee] = useState("2026-2027");
  const [type, setType] = useState<ReportType>("student_roster");
  const [month, setMonth] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [classe, setClasse] = useState("");
  const [niveau, setNiveau] = useState("");
  const [sessions, setSessions] = useState<ExamSession[]>([]);
  const [report, setReport] = useState<OfficialReport | null>(null);
  const [loading, setLoading] = useState(false);

  const loadSessions = useCallback(async () => {
    try { setSessions(await api<ExamSession[]>(`/exams/sessions?annee=${encodeURIComponent(annee)}`)); }
    catch { /* seating_plan will show a clear error if sessions cannot load */ }
  }, [annee]);

  useEffect(() => { loadSessions(); }, [loadSessions]);
  useEffect(() => { setReport(null); }, [type, annee, month, sessionId, classe, niveau]);

  const params = () => {
    const base: Record<string, string | undefined> = { annee };
    if (type === "monthly") base.month = month;
    if (type === "seating_plan") base.sessionId = sessionId;
    if ((type === "student_roster" || type === "census") && classe) base.classe = classe;
    if ((type === "student_roster" || type === "census") && niveau) base.niveau = niveau;
    return base;
  };

  const canPreview = () => {
    if (type === "monthly" && !/^\d{4}-\d{2}$/.test(month)) return false;
    if (type === "seating_plan" && !sessionId) return false;
    return true;
  };

  const preview = async () => {
    if (!canPreview()) { toast({ title: "حقول ناقصة", description: "أكمل الحقول المطلوبة", variant: "destructive" }); return; }
    setLoading(true);
    try { setReport(await api<OfficialReport>(`/exam-reports/${type}?${query({ ...params(), format: "json" })}`)); }
    catch (e: any) { toast({ title: "خطأ", description: e.message, variant: "destructive" }); }
    finally { setLoading(false); }
  };

  const downloadXlsx = async () => {
    if (!canPreview()) { toast({ title: "حقول ناقصة", description: "أكمل الحقول المطلوبة", variant: "destructive" }); return; }
    setLoading(true);
    try {
      const res = await fetch(`${BASE}api/exam-reports/${type}?${query({ ...params(), format: "xlsx" })}`, { credentials: "include" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as any)?.error || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="?([^";]+)"?/);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = match?.[1] ?? `${type}-${annee}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
      toast({ title: "تم التنزيل", description: link.download });
    } catch (e: any) { toast({ title: "خطأ", description: e.message, variant: "destructive" }); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-full bg-dot-grid p-4 md:p-8" dir="rtl">
      <div className="mx-auto max-w-7xl space-y-6">
        <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black text-foreground">التقارير الرسمية للاختبارات</h1>
            <p className="text-muted-foreground">قوائم أولية، تعداد، كشوف شهرية، حراسة وتفويج — Excel/طباعة</p>
          </div>
          <Select value={annee} onValueChange={setAnnee}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>{YEARS.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
          </Select>
        </motion.div>

        <Card><CardHeader><CardTitle>إعداد التقرير</CardTitle></CardHeader><CardContent className="grid gap-3 md:grid-cols-3">
          <Select value={type} onValueChange={v => setType(v as ReportType)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{REPORT_TYPES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
          </Select>
          {type === "monthly" && <Input type="month" value={month} onChange={e => setMonth(e.target.value)} />}
          {type === "seating_plan" && (
            <Select value={sessionId} onValueChange={setSessionId}>
              <SelectTrigger><SelectValue placeholder="اختر جلسة التفويج" /></SelectTrigger>
              <SelectContent>{sessions.map(s => <SelectItem key={s.id} value={s.id}>{s.title} — {s.examDate}</SelectItem>)}</SelectContent>
            </Select>
          )}
          {(type === "student_roster" || type === "census") && (
            <>
              <Input placeholder="القسم (اختياري)" value={classe} onChange={e => setClasse(e.target.value)} />
              <Input placeholder="المستوى (اختياري)" value={niveau} onChange={e => setNiveau(e.target.value)} />
            </>
          )}
          <div className="flex gap-2 md:col-span-3">
            <Button variant="outline" onClick={preview} disabled={loading || !canPreview()}><Eye className="h-4 w-4" /> معاينة</Button>
            <Button onClick={downloadXlsx} disabled={loading || !canPreview()}><Download className="h-4 w-4" /> تنزيل Excel</Button>
            <Button variant="ghost" onClick={loadSessions}><RefreshCw className="h-4 w-4" /></Button>
          </div>
        </CardContent></Card>

        {loading && <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> جاري التحميل…</div>}

        {report && (
          <div className="space-y-4">
            <Card><CardHeader><CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" /> {report.title}</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">
              تم إنشاء {report.sheets.length} ورقة/أوراق • {new Date(report.generatedAt).toLocaleString("ar-DZ")}
            </CardContent></Card>
            {report.sheets.map((sheet, index) => (
              <Card key={`${sheet.name}-${index}`}><CardHeader><CardTitle className="text-base">{sheet.name}</CardTitle></CardHeader><CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b text-muted-foreground">{sheet.headers.map((h, i) => <th key={i} className="p-2 text-right">{h}</th>)}</tr></thead>
                    <tbody>{sheet.rows.slice(0, 200).map((row, ri) => <tr key={ri} className="border-b last:border-0">{row.map((cell, ci) => <td key={ci} className="p-2">{cell ?? ""}</td>)}</tr>)}</tbody>
                  </table>
                  {sheet.rows.length > 200 && <p className="mt-2 text-xs text-muted-foreground">عرض أول 200 صف من {sheet.rows.length}</p>}
                </div>
              </CardContent></Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
