import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Upload, FileSpreadsheet, Printer, Loader2, AlertTriangle, CheckCircle2, FileUp, CalendarDays, Users, BookOpenCheck, ShieldCheck } from "lucide-react";

const CURRENT_YEAR = "2026-2027";

const STAT_LABELS: Record<string, string> = {
  teachers: "أساتذة",
  classes: "أقسام",
  activities: "أنشطة",
  timeslots: "فترات",
  slots: "حصص موزعة",
};

type FetPreview = {
  teachers?: Array<{ name: string }>;
  classes?: Array<{ name: string }>;
  rooms?: Array<{ name: string }>;
  timeslots?: Array<{ day: number; startTime: string; endTime: string; period: number }>;
  activities?: Array<{ index: number; teacher: string; subject: string; classes: string[] }>;
  slots?: Array<{ activityIndex: number; day: number; period: number }>;
  warnings?: string[];
  stats?: { teachers: number; classes: number; activities: number; timeslots: number; slots: number };
};

type RgfReport = {
  title?: string;
  generatedAt?: string;
  sheets?: Array<{ name: string; headers: string[]; rows: Array<Array<string | number | null>> }>;
};

async function readJson<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((data as any)?.error ?? "Request failed");
  return data as T;
}

export default function FetRgfPage() {
  const [annee, setAnnee] = useState(CURRENT_YEAR);
  const [fetFile, setFetFile] = useState<File | null>(null);
  const [dayOffset, setDayOffset] = useState("0");
  const [replaceFet, setReplaceFet] = useState(true);
  const [includeSlots, setIncludeSlots] = useState(true);
  const [fetPreview, setFetPreview] = useState<FetPreview | null>(null);
  const [fetResult, setFetResult] = useState<any>(null);
  const [rgfReport, setRgfReport] = useState<RgfReport | null>(null);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [loading, setLoading] = useState<"parse" | "import" | "rgf" | null>(null);

  const rgfSheets = useMemo(() => rgfReport?.sheets ?? [], [rgfReport]);
  const selectedSheet = rgfSheets.length ? rgfSheets[Math.min(sheetIndex, rgfSheets.length - 1)] : null;

  async function parseFet() {
    if (!fetFile) { toast({ title: "اختر ملف FET أولاً", variant: "destructive" }); return; }
    setLoading("parse");
    try {
      const form = new FormData();
      form.append("file", fetFile);
      form.append("dayOffset", dayOffset);
      const response = await fetch("/api/timetable/fet/parse", { method: "POST", body: form, credentials: "same-origin" });
      setFetPreview(await readJson<FetPreview>(response));
      setFetResult(null);
      toast({ title: "تم تحليل ملف FET" });
    } catch (error: any) {
      toast({ title: "فشل تحليل FET", description: error?.message, variant: "destructive" });
    } finally { setLoading(null); }
  }

  async function importFet() {
    if (!fetFile) { toast({ title: "اختر ملف FET أولاً", variant: "destructive" }); return; }
    setLoading("import");
    try {
      const form = new FormData();
      form.append("file", fetFile);
      form.append("annee", annee);
      form.append("dayOffset", dayOffset);
      form.append("replaceFet", String(replaceFet));
      form.append("includeSlots", String(includeSlots));
      const response = await fetch("/api/timetable/fet/import", { method: "POST", body: form, credentials: "same-origin" });
      const result = await readJson<any>(response);
      setFetResult(result);
      toast({ title: "تم استيراد FET", description: `${result.slotsCreated ?? 0} حصة تم إدخالها` });
    } catch (error: any) {
      toast({ title: "فشل استيراد FET", description: error?.message, variant: "destructive" });
    } finally { setLoading(null); }
  }

  async function loadRgf() {
    setLoading("rgf");
    try {
      const response = await fetch(`/api/reports/rgf?annee=${encodeURIComponent(annee)}&format=json`, { credentials: "same-origin" });
      const report = await readJson<RgfReport>(response);
      setRgfReport(report);
      setSheetIndex(0);
      toast({ title: "تم توليد التقرير العام" });
    } catch (error: any) {
      toast({ title: "فشل توليد RGF", description: error?.message, variant: "destructive" });
    } finally { setLoading(null); }
  }

  function downloadRgf(format: "xlsx" | "html") {
    window.open(`/api/reports/rgf?annee=${encodeURIComponent(annee)}&format=${format}`, "_blank");
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-6" dir="rtl">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-3xl border border-slate-800 bg-gradient-to-l from-slate-900 via-slate-900 to-indigo-950 p-6 shadow-2xl">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="bg-indigo-500/20 text-indigo-200 border-indigo-500/30">Timetable</Badge>
                <Badge className="bg-emerald-500/20 text-emerald-200 border-emerald-500/30">Reports</Badge>
              </div>
              <h1 className="text-3xl font-black tracking-tight">FET &amp; RGF Studio</h1>
              <p className="max-w-2xl text-sm text-slate-400">استيراد جداول التوقيت من FET، ثم توليد التقرير العام لسير المؤسسة بصيغة Excel وHTML رسمي.</p>
            </div>
            <div className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-950/70 p-3">
              <CalendarDays className="h-5 w-5 text-cyan-300" />
              <div>
                <Label htmlFor="annee" className="text-xs text-slate-400">السنة الدراسية</Label>
                <Input id="annee" value={annee} onChange={e => setAnnee(e.target.value)} className="mt-1 w-36 border-slate-800 bg-slate-900" />
              </div>
            </div>
          </div>
        </header>

        <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <Card className="overflow-hidden border-slate-800 bg-slate-900/80 shadow-xl">
            <CardHeader className="border-b border-slate-800 bg-slate-950/50">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2 text-xl"><FileUp className="h-5 w-5 text-cyan-300" /> استيراد جدول FET</CardTitle>
                  <CardDescription className="mt-1">ارفع ملف FET/XML لمعاينة الأساتذة والأقسام والحصص قبل الاستيراد.</CardDescription>
                </div>
                {fetPreview?.stats && <Badge variant="secondary">{fetPreview.stats.slots} حصة</Badge>}
              </div>
            </CardHeader>
            <CardContent className="space-y-5 p-5">
              <label className="group flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-700 bg-slate-950/60 px-6 py-8 text-center transition hover:border-cyan-500/60 hover:bg-slate-900">
                <Upload className="mb-3 h-8 w-8 text-cyan-300 transition group-hover:scale-110" />
                <div className="font-semibold">{fetFile ? fetFile.name : "اسحب ملف FET هنا أو اضغط للاختيار"}</div>
                <div className="mt-1 text-xs text-slate-500">XML / .fet / .txt — حتى 5MB</div>
                <Input type="file" accept=".xml,.fet,.txt" className="hidden" onChange={e => setFetFile(e.target.files?.[0] ?? null)} />
              </label>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>ترقيم أيام FET</Label>
                  <Select value={dayOffset} onValueChange={setDayOffset}>
                    <SelectTrigger className="border-slate-800 bg-slate-950"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">FET 1-5 → يوم 0-4</SelectItem>
                      <SelectItem value="1">إزاحة +1</SelectItem>
                      <SelectItem value="-1">إزاحة -1</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-950/60 p-3 text-sm">
                  <label className="flex items-center justify-between gap-3">
                    <span>استبدال حصص FET القديمة</span>
                    <input type="checkbox" checked={replaceFet} onChange={e => setReplaceFet(e.target.checked)} className="h-4 w-4 accent-cyan-400" />
                  </label>
                  <label className="flex items-center justify-between gap-3">
                    <span>استيراد الحصص الزمنية</span>
                    <input type="checkbox" checked={includeSlots} onChange={e => setIncludeSlots(e.target.checked)} className="h-4 w-4 accent-cyan-400" />
                  </label>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button onClick={parseFet} disabled={loading !== null} variant="outline" className="border-slate-700 bg-slate-950">
                  {loading === "parse" ? <Loader2 className="h-4 w-4 animate-spin" /> : "معاينة التحليل"}
                </Button>
                <Button onClick={importFet} disabled={loading !== null || !fetPreview} className="bg-cyan-500 text-slate-950 hover:bg-cyan-400">
                  {loading === "import" ? <Loader2 className="h-4 w-4 animate-spin" /> : "تأكيد الاستيراد"}
                </Button>
              </div>

              {fetPreview?.stats && (
                <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                  {Object.entries(fetPreview.stats).map(([key, value]) => (
                    <div key={key} className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3">
                      <div className="text-xs text-slate-500">{STAT_LABELS[key] ?? key}</div>
                      <div className="mt-1 text-2xl font-black">{value}</div>
                    </div>
                  ))}
                </div>
              )}

              {fetPreview?.warnings?.length ? (
                <div className="space-y-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
                  <div className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" /> تحذيرات التحليل</div>
                  {fetPreview.warnings.slice(0, 8).map((warning, index) => <div key={index}>• {warning}</div>)}
                </div>
              ) : null}

              {fetResult && (
                <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm">
                  <div className="mb-2 flex items-center gap-2 font-bold text-emerald-200"><CheckCircle2 className="h-4 w-4" /> تم الاستيراد بنجاح</div>
                  <div className="grid gap-2 md:grid-cols-3">
                    <div>أساتذة جدد: <b>{fetResult.teachersCreated ?? 0}</b></div>
                    <div>أساتذة محدثون: <b>{fetResult.teachersUpdated ?? 0}</b></div>
                    <div>قاعات: <b>{fetResult.roomsCreated ?? 0}</b></div>
                    <div>حصص مدخلة: <b>{fetResult.slotsCreated ?? 0}</b></div>
                    <div>تحذيرات: <b>{fetResult.warnings?.length ?? 0}</b></div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="overflow-hidden border-slate-800 bg-slate-900/80 shadow-xl">
            <CardHeader className="border-b border-slate-800 bg-slate-950/50">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2 text-xl"><FileSpreadsheet className="h-5 w-5 text-emerald-300" /> التقرير العام RGF</CardTitle>
                  <CardDescription className="mt-1">تجميع التلاميذ، النتائج، الغيابات، الأساتذة، المحلات، والاختبارات.</CardDescription>
                </div>
                {rgfReport && <Badge className="bg-emerald-500/20 text-emerald-200 border-emerald-500/30">{rgfSheets.length} sheets</Badge>}
              </div>
            </CardHeader>
            <CardContent className="space-y-5 p-5">
              <div className="grid gap-3 md:grid-cols-3">
                <Button onClick={loadRgf} disabled={loading !== null} className="bg-emerald-500 text-slate-950 hover:bg-emerald-400">
                  {loading === "rgf" ? <Loader2 className="h-4 w-4 animate-spin" /> : "توليد التقرير"}
                </Button>
                <Button variant="outline" onClick={() => downloadRgf("xlsx")} className="border-slate-700 bg-slate-950"><FileSpreadsheet className="h-4 w-4" /> Excel</Button>
                <Button variant="outline" onClick={() => downloadRgf("html")} className="border-slate-700 bg-slate-950"><Printer className="h-4 w-4" /> HTML للطباعة</Button>
              </div>

              {rgfReport ? (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                    <div className="font-bold">{rgfReport.title}</div>
                    <div className="mt-1 text-xs text-slate-500">تاريخ الإصدار: {rgfReport.generatedAt?.slice(0, 10)}</div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {rgfSheets.map((sheet, index) => (
                      <button key={sheet.name} onClick={() => setSheetIndex(index)} className={`rounded-full border px-3 py-1 text-xs transition ${index === sheetIndex ? "border-cyan-400 bg-cyan-500/20 text-cyan-100" : "border-slate-800 bg-slate-950 text-slate-400 hover:text-slate-200"}`}>
                        {sheet.name}
                      </button>
                    ))}
                  </div>

                  {selectedSheet && (
                    <div className="overflow-hidden rounded-2xl border border-slate-800">
                      <div className="flex items-center gap-2 border-b border-slate-800 bg-slate-950 px-4 py-3 font-semibold">
                        {selectedSheet.name === "التلاميذ" ? <Users className="h-4 w-4 text-cyan-300" /> : selectedSheet.name === "النتائج" ? <BookOpenCheck className="h-4 w-4 text-emerald-300" /> : <ShieldCheck className="h-4 w-4 text-violet-300" />}
                        {selectedSheet.name}
                      </div>
                      <div className="max-h-[520px] overflow-auto">
                        <table className="w-full text-xs">
                          <thead className="sticky top-0 bg-slate-900">
                            <tr>{selectedSheet.headers.map(header => <th key={header} className="border-b border-slate-800 px-3 py-2 text-right font-bold text-slate-300">{header}</th>)}</tr>
                          </thead>
                          <tbody>
                            {selectedSheet.rows.map((row, rowIndex) => (
                              <tr key={rowIndex} className="odd:bg-slate-950/40">
                                {row.map((cell, cellIndex) => <td key={cellIndex} className="border-b border-slate-900 px-3 py-2 text-slate-200">{cell ?? ""}</td>)}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex min-h-[280px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-800 bg-slate-950/50 p-8 text-center text-slate-500">
                  <FileSpreadsheet className="mb-3 h-10 w-10 text-slate-700" />
                  <div className="font-semibold text-slate-300">لا يوجد تقرير بعد</div>
                  <div className="mt-1 text-sm">اضغط “توليد التقرير” لعرض RGF داخل الصفحة.</div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
