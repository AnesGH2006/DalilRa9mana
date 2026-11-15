import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Upload, FileSpreadsheet, Printer, Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";

const CURRENT_YEAR = "2026-2027";

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
  const [loading, setLoading] = useState<"parse" | "import" | "rgf" | null>(null);

  const rgfSheets = useMemo(() => rgfReport?.sheets ?? [], [rgfReport]);

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
      setRgfReport(await readJson<RgfReport>(response));
      toast({ title: "تم توليد التقرير العام" });
    } catch (error: any) {
      toast({ title: "فشل توليد RGF", description: error?.message, variant: "destructive" });
    } finally { setLoading(null); }
  }

  function downloadRgf(format: "xlsx" | "html") {
    window.open(`/api/reports/rgf?annee=${encodeURIComponent(annee)}&format=${format}`, "_blank");
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 space-y-6" dir="rtl">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold">FET &amp; RGF</h1>
          <p className="text-slate-400">استيراد جداول FET وتوليد التقرير العام لسير المؤسسة</p>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="annee">السنة الدراسية</Label>
          <Input id="annee" value={annee} onChange={e => setAnnee(e.target.value)} className="w-36 bg-slate-900 border-slate-800" />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Upload className="w-5 h-5" /> استيراد FET</CardTitle>
            <CardDescription>ارفع ملف FET/XML لاستخراج الأساتذة والأقسام والحصص والفترات الفارغة.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label>ملف FET / XML</Label>
                <Input type="file" accept=".xml,.fet,.txt" onChange={e => setFetFile(e.target.files?.[0] ?? null)} className="bg-slate-950 border-slate-800" />
              </div>
              <div className="space-y-2">
                <Label>إزاحة الأيام (dayOffset)</Label>
                <Select value={dayOffset} onValueChange={setDayOffset}>
                  <SelectTrigger className="bg-slate-950 border-slate-800"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">FET 1-5 → يوم 0-4</SelectItem>
                    <SelectItem value="1">إزاحة +1</SelectItem>
                    <SelectItem value="-1">إزاحة -1</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end gap-4 pb-2 text-sm">
                <label className="flex items-center gap-2"><input type="checkbox" checked={replaceFet} onChange={e => setReplaceFet(e.target.checked)} /> استبدال حصص FET</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={includeSlots} onChange={e => setIncludeSlots(e.target.checked)} /> استيراد الحصص</label>
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={parseFet} disabled={loading !== null} variant="outline">
                {loading === "parse" ? <Loader2 className="w-4 h-4 animate-spin" /> : "معاينة"}
              </Button>
              <Button onClick={importFet} disabled={loading !== null || !fetPreview}>
                {loading === "import" ? <Loader2 className="w-4 h-4 animate-spin" /> : "استيراد"}
              </Button>
            </div>

            {fetPreview?.stats && (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-sm">
                {Object.entries(fetPreview.stats).map(([key, value]) => (
                  <div key={key} className="rounded-lg bg-slate-950 border border-slate-800 p-3">
                    <div className="text-slate-400">{key}</div>
                    <div className="text-lg font-semibold">{value}</div>
                  </div>
                ))}
              </div>
            )}
            {fetPreview?.warnings?.length ? (
              <div className="space-y-1 text-sm text-amber-300">
                {fetPreview.warnings.slice(0, 8).map((warning, index) => <div key={index} className="flex gap-2"><AlertTriangle className="w-4 h-4" /> {warning}</div>)}
              </div>
            ) : null}
            {fetResult && (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm space-y-1">
                <div className="flex items-center gap-2 font-semibold"><CheckCircle2 className="w-4 h-4" /> تم الاستيراد</div>
                <div>أساتذة: {fetResult.teachersCreated ?? 0} جديد / {fetResult.teachersUpdated ?? 0} محدث — قاعات: {fetResult.roomsCreated ?? 0} — حصص: {fetResult.slotsCreated ?? 0}</div>
                {fetResult.warnings?.length ? <div className="text-amber-300">تحذيرات: {fetResult.warnings.slice(0, 5).join(" | ")}</div> : null}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><FileSpreadsheet className="w-5 h-5" /> التقرير العام RGF</CardTitle>
            <CardDescription>تجميع شامل: التلاميذ، النتائج، الغيابات، الأساتذة، المحلات، والاختبارات.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button onClick={loadRgf} disabled={loading !== null}>
                {loading === "rgf" ? <Loader2 className="w-4 h-4 animate-spin" /> : "توليد ومعاينة"}
              </Button>
              <Button variant="outline" onClick={() => downloadRgf("xlsx")}><FileSpreadsheet className="w-4 h-4" /> Excel</Button>
              <Button variant="outline" onClick={() => downloadRgf("html")}><Printer className="w-4 h-4" /> HTML للطباعة</Button>
            </div>
            {rgfReport && (
              <div className="space-y-3">
                <div className="text-sm text-slate-300">{rgfReport.title}</div>
                <div className="flex flex-wrap gap-2">
                  {rgfSheets.map(sheet => <Badge key={sheet.name} variant="secondary">{sheet.name}</Badge>)}
                </div>
                <div className="max-h-[520px] overflow-auto rounded-lg border border-slate-800">
                  {rgfSheets.slice(0, 4).map(sheet => (
                    <div key={sheet.name} className="border-b border-slate-800 last:border-0">
                      <div className="bg-slate-950 px-3 py-2 font-semibold">{sheet.name}</div>
                      <table className="w-full text-xs">
                        <thead><tr className="bg-slate-900">{sheet.headers.map(header => <th key={header} className="px-2 py-1 text-right border-b border-slate-800">{header}</th>)}</tr></thead>
                        <tbody>{sheet.rows.slice(0, 20).map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex} className="px-2 py-1 border-b border-slate-900">{cell ?? ""}</td>)}</tr>)}</tbody>
                      </table>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
