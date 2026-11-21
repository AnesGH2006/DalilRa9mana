import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import {
  Upload, FileSpreadsheet, Printer, Loader2, AlertTriangle, CheckCircle2,
  FileUp, CalendarDays, Users, BookOpenCheck, ShieldCheck, FileText,
} from "lucide-react";

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

const SHEET_ICONS: Record<string, typeof Users> = {
  "التلاميذ": Users,
  "النتائج": BookOpenCheck,
};

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
    <div className="min-h-full bg-dot-grid p-4 md:p-6" dir="rtl">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header */}
        <motion.header
          initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
          className="relative overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-l from-violet-600/10 via-indigo-600/5 to-transparent p-6 shadow-sm"
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/30 shrink-0">
                <CalendarDays className="w-6 h-6 text-white" />
              </div>
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30">Timetable</Badge>
                  <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30">Reports</Badge>
                </div>
                <h1 className="text-2xl sm:text-3xl font-black tracking-tight">FET &amp; RGF Studio</h1>
                <p className="max-w-2xl text-sm text-muted-foreground">استيراد جداول التوقيت من FET، ثم توليد التقرير العام لسير المؤسسة بصيغة Excel وHTML رسمي.</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card/80 px-4 py-3 shadow-sm">
              <CalendarDays className="h-5 w-5 text-violet-500" />
              <div>
                <Label htmlFor="annee" className="text-xs text-muted-foreground">السنة الدراسية</Label>
                <Input id="annee" value={annee} onChange={e => setAnnee(e.target.value)} className="mt-1 w-36" />
              </div>
            </div>
          </div>
        </motion.header>

        <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          {/* FET Import */}
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08, duration: 0.4 }}>
            <Card className="overflow-hidden shadow-md h-full">
              <CardHeader className="border-b border-border/60 bg-gradient-to-l from-cyan-500/10 to-transparent">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-xl">
                      <span className="inline-flex w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 items-center justify-center shadow">
                        <FileUp className="h-4.5 w-4.5 text-white" />
                      </span>
                      استيراد جدول FET
                    </CardTitle>
                    <CardDescription className="mt-1">ارفع ملف FET/XML لمعاينة الأساتذة والأقسام والحصص قبل الاستيراد.</CardDescription>
                  </div>
                  {fetPreview?.stats && <Badge variant="secondary">{fetPreview.stats.slots} حصة</Badge>}
                </div>
              </CardHeader>
              <CardContent className="space-y-5 p-5">
                <label className="group flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border/70 bg-muted/30 px-6 py-8 text-center transition hover:border-cyan-400/70 hover:bg-cyan-50/50 dark:hover:bg-cyan-950/20">
                  <Upload className="mb-3 h-8 w-8 text-cyan-500 transition group-hover:scale-110" />
                  <div className="font-semibold">{fetFile ? fetFile.name : "اسحب ملف FET هنا أو اضغط للاختيار"}</div>
                  <div className="mt-1 text-xs text-muted-foreground">XML / .fet / .txt — حتى 5MB</div>
                  <Input type="file" accept=".xml,.fet,.txt" className="hidden" onChange={e => setFetFile(e.target.files?.[0] ?? null)} />
                </label>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>ترقيم أيام FET</Label>
                    <Select value={dayOffset} onValueChange={setDayOffset}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">FET 1-5 → يوم 0-4</SelectItem>
                        <SelectItem value="1">إزاحة +1</SelectItem>
                        <SelectItem value="-1">إزاحة -1</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-3 rounded-2xl border border-border/60 bg-muted/30 p-3 text-sm">
                    <label className="flex items-center justify-between gap-3">
                      <span>استبدال حصص FET القديمة</span>
                      <input type="checkbox" checked={replaceFet} onChange={e => setReplaceFet(e.target.checked)} className="h-4 w-4 accent-cyan-500" />
                    </label>
                    <label className="flex items-center justify-between gap-3">
                      <span>استيراد الحصص الزمنية</span>
                      <input type="checkbox" checked={includeSlots} onChange={e => setIncludeSlots(e.target.checked)} className="h-4 w-4 accent-cyan-500" />
                    </label>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button onClick={parseFet} disabled={loading !== null} variant="outline">
                    {loading === "parse" ? <Loader2 className="h-4 w-4 animate-spin" /> : "معاينة التحليل"}
                  </Button>
                  <Button onClick={importFet} disabled={loading !== null || !fetPreview} className="bg-gradient-to-r from-cyan-500 to-blue-600 text-white border-0 shadow-sm">
                    {loading === "import" ? <Loader2 className="h-4 w-4 animate-spin" /> : "تأكيد الاستيراد"}
                  </Button>
                </div>

                {fetPreview?.stats && (
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                    {Object.entries(fetPreview.stats).map(([key, value]) => (
                      <div key={key} className="rounded-2xl border border-border/60 bg-muted/30 p-3 text-center">
                        <div className="text-xs text-muted-foreground">{STAT_LABELS[key] ?? key}</div>
                        <div className="mt-1 text-2xl font-black">{value}</div>
                      </div>
                    ))}
                  </div>
                )}

                {fetPreview?.warnings?.length ? (
                  <div className="space-y-2 rounded-2xl border border-amber-300/60 bg-amber-50/70 dark:bg-amber-950/20 p-3 text-sm text-amber-800 dark:text-amber-200">
                    <div className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" /> تحذيرات التحليل</div>
                    {fetPreview.warnings.slice(0, 8).map((warning, index) => <div key={index}>• {warning}</div>)}
                  </div>
                ) : null}

                {fetResult && (
                  <div className="rounded-2xl border border-emerald-300/60 bg-emerald-50/70 dark:bg-emerald-950/20 p-4 text-sm text-emerald-900 dark:text-emerald-100">
                    <div className="mb-2 flex items-center gap-2 font-bold"><CheckCircle2 className="h-4 w-4" /> تم الاستيراد بنجاح</div>
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
          </motion.div>

          {/* RGF Report */}
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14, duration: 0.4 }}>
            <Card className="overflow-hidden shadow-md h-full">
              <CardHeader className="border-b border-border/60 bg-gradient-to-l from-emerald-500/10 to-transparent">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-xl">
                      <span className="inline-flex w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 items-center justify-center shadow">
                        <FileSpreadsheet className="h-4.5 w-4.5 text-white" />
                      </span>
                      التقرير العام RGF
                    </CardTitle>
                    <CardDescription className="mt-1">تجميع التلاميذ، النتائج، الغيابات، الأساتذة، المحلات، والاختبارات.</CardDescription>
                  </div>
                  {rgfReport && <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30">{rgfSheets.length} sheets</Badge>}
                </div>
              </CardHeader>
              <CardContent className="space-y-5 p-5">
                <div className="grid gap-3 md:grid-cols-3">
                  <Button onClick={loadRgf} disabled={loading !== null} className="bg-gradient-to-r from-emerald-500 to-green-600 text-white border-0 shadow-sm">
                    {loading === "rgf" ? <Loader2 className="h-4 w-4 animate-spin" /> : "توليد التقرير"}
                  </Button>
                  <Button variant="outline" onClick={() => downloadRgf("xlsx")}><FileSpreadsheet className="h-4 w-4" /> Excel</Button>
                  <Button variant="outline" onClick={() => downloadRgf("html")}><Printer className="h-4 w-4" /> HTML للطباعة</Button>
                </div>

                {rgfReport ? (
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-border/60 bg-muted/30 p-4">
                      <div className="font-bold">{rgfReport.title}</div>
                      <div className="mt-1 text-xs text-muted-foreground">تاريخ الإصدار: {rgfReport.generatedAt?.slice(0, 10)}</div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {rgfSheets.map((sheet, index) => (
                        <button key={sheet.name} onClick={() => setSheetIndex(index)} className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${index === sheetIndex ? "border-emerald-400 bg-emerald-500/15 text-emerald-700 dark:text-emerald-200" : "border-border/60 bg-muted/30 text-muted-foreground hover:text-foreground"}`}>
                          {sheet.name}
                        </button>
                      ))}
                    </div>

                    {selectedSheet && (
                      <div className="overflow-hidden rounded-2xl border border-border/60">
                        <div className="flex items-center gap-2 border-b border-border/60 bg-muted/40 px-4 py-3 font-semibold">
                          {(() => { const Icon = SHEET_ICONS[selectedSheet.name] ?? ShieldCheck; return <Icon className="h-4 w-4 text-violet-500" />; })()}
                          {selectedSheet.name}
                        </div>
                        <div className="max-h-[520px] overflow-auto">
                          <table className="w-full text-xs">
                            <thead className="sticky top-0 bg-muted/50">
                              <tr>{selectedSheet.headers.map(header => <th key={header} className="border-b border-border/60 px-3 py-2 text-right font-bold text-foreground">{header}</th>)}</tr>
                            </thead>
                            <tbody>
                              {selectedSheet.rows.map((row, rowIndex) => (
                                <tr key={rowIndex} className="odd:bg-muted/20">
                                  {row.map((cell, cellIndex) => <td key={cellIndex} className="border-b border-border/40 px-3 py-2 text-foreground/90">{cell ?? ""}</td>)}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex min-h-[280px] flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 bg-muted/20 p-8 text-center">
                    <FileText className="mb-3 h-10 w-10 text-muted-foreground/30" />
                    <div className="font-semibold text-foreground/80">لا يوجد تقرير بعد</div>
                    <div className="mt-1 text-sm text-muted-foreground">اضغط “توليد التقرير” لعرض RGF داخل الصفحة.</div>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
