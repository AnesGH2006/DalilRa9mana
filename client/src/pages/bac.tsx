import { useRef, useState } from "react";
import {
  AlertCircle, BarChart3, CheckCircle2, Download, FileSpreadsheet, Loader2,
  Printer, Trophy, Upload, Users, XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LYCEE_BAC_FILIERES, LYCEE_BAC_FILIERE_LABELS, type LyceeBacFiliere } from "@shared/subjects";
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

const BASE = import.meta.env.BASE_URL;

interface BacStudent {
  name: string;
  filiere: LyceeBacFiliere;
  scores: Partial<Record<string, number>>;
  average: number;
  averageSource: "file" | "computed";
  passed: boolean;
  rank: number;
}

interface BacAnalysis {
  fileName: string;
  summary: { total: number; passCount: number; failCount: number; passRate: number; average: number };
  trackStats: Array<{
    filiere: LyceeBacFiliere;
    label: string;
    total: number;
    passCount: number;
    failCount: number;
    passRate: number;
    average: number;
    topStudent: BacStudent;
  }>;
  subjectStats: Array<{
    filiere: LyceeBacFiliere;
    filiereLabel: string;
    key: string;
    label: string;
    coefficient: number;
    average: number | null;
    passCount: number;
    total: number;
  }>;
  scoreDistribution: Array<{ range: string; count: number }>;
  warnings: string[];
  students: BacStudent[];
}

function Metric({ label, value, icon: Icon, tone }: {
  label: string;
  value: string;
  icon: React.ElementType;
  tone: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-3 p-4">
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className={`mt-1 text-2xl font-bold ${tone}`}>{value}</p>
        </div>
        <Icon className={`h-5 w-5 ${tone}`} />
      </CardContent>
    </Card>
  );
}

export default function BacPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [defaultFiliere, setDefaultFiliere] = useState("__auto__");
  const [analysis, setAnalysis] = useState<BacAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function analyze() {
    if (!file) {
      setError("اختر ملف النتائج أولاً");
      return;
    }
    setLoading(true);
    setError("");
    setAnalysis(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      if (defaultFiliere !== "__auto__") formData.append("filiere", defaultFiliere);
      const response = await fetch(`${BASE}api/bac/analyze`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      const payload = await response.json() as BacAnalysis & { error?: string };
      if (!response.ok) throw new Error(payload.error || "تعذر تحليل الملف");
      setAnalysis(payload);
    } catch (analysisError) {
      setError(analysisError instanceof Error ? analysisError.message : "حدث خطأ أثناء تحليل الملف");
    } finally {
      setLoading(false);
    }
  }

  function exportResults() {
    if (!analysis) return;
    const header = ["الترتيب", "الاسم", "الشعبة", "المعدل", "مصدر المعدل", "النتيجة"];
    const rows = analysis.students.map(student => [
      student.rank,
      student.name,
      LYCEE_BAC_FILIERE_LABELS[student.filiere],
      student.average.toFixed(2),
      student.averageSource === "file" ? "من ملف Excel" : "محسوب بالمعاملات",
      student.passed ? "ناجح" : "غير ناجح",
    ]);
    const csv = [header, ...rows]
      .map(row => row.map(value => {
        const text = String(value).replace(/"/g, '""');
        return `"${/^[=+\-@]/.test(text) ? `'${text}` : text}"`;
      }).join(","))
      .join("\r\n");
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "bac-results-analysis.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 md:p-6" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">تحليل نتائج البكالوريا</h1>
          <p className="mt-1 text-sm text-muted-foreground">تحليل نتائج Excel حسب الشعبة والمواد والمعدل والنجاح.</p>
        </div>
        {analysis && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={exportResults}><Download className="ms-2 h-4 w-4" />تصدير CSV</Button>
            <Button variant="outline" onClick={() => window.print()}><Printer className="ms-2 h-4 w-4" />طباعة</Button>
          </div>
        )}
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><FileSpreadsheet className="h-5 w-5" />استيراد نتائج المترشحين</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[1fr_260px_auto]">
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={event => {
                setFile(event.target.files?.[0] ?? null);
                setAnalysis(null);
                setError("");
              }}
            />
            <Button variant="outline" className="justify-start gap-2" onClick={() => fileRef.current?.click()}>
              <Upload className="h-4 w-4" />
              <span className="truncate">{file?.name ?? "اختر ملف Excel"}</span>
            </Button>
            <Select value={defaultFiliere} onValueChange={setDefaultFiliere}>
              <SelectTrigger><SelectValue placeholder="الشعبة الافتراضية (اختياري)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__auto__">اكتشاف الشعبة من الملف</SelectItem>
                {LYCEE_BAC_FILIERES.map(filiere => (
                  <SelectItem key={filiere} value={filiere}>{LYCEE_BAC_FILIERE_LABELS[filiere]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={() => void analyze()} disabled={loading || !file} className="gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <BarChart3 className="h-4 w-4" />}
              {loading ? "جارٍ التحليل..." : "تحليل النتائج"}
            </Button>
          </div>
          <p className="text-xs leading-5 text-muted-foreground">
            يلزم وجود عمود للاسم وأعمدة علامات المواد. إذا لم يتضمن الملف عمود الشعبة، اختر الشعبة الافتراضية.
            يُستخدم المعدل الموجود في الملف إن توفر، وإلا يُحتسب من العلامات والمعاملات المعرفة هنا. المعاملات تقديرية وتُراجع مع المرجع الرسمي للسنة.
          </p>
          {error && <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
        </CardContent>
      </Card>

      {analysis && (
        <>
          {analysis.warnings.length > 0 && (
            <div role="status" className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <ul>{analysis.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="عدد المترشحين" value={String(analysis.summary.total)} icon={Users} tone="text-blue-600" />
            <Metric label="الناجحون" value={String(analysis.summary.passCount)} icon={CheckCircle2} tone="text-emerald-600" />
            <Metric label="غير الناجحين" value={String(analysis.summary.failCount)} icon={XCircle} tone="text-red-500" />
            <Metric label="نسبة النجاح / المعدل العام" value={`${analysis.summary.passRate.toFixed(1)}% · ${analysis.summary.average.toFixed(2)}`} icon={Trophy} tone="text-violet-600" />
          </div>

          <Card>
            <CardHeader><CardTitle>ملخص الشعب</CardTitle></CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {analysis.trackStats.map(track => (
                <div key={track.filiere} className="rounded-xl border p-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-bold">{track.label}</h3>
                    <span className="text-xs text-muted-foreground">{track.total} مترشح</span>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                    <div><p className="text-muted-foreground">النجاح</p><p className="mt-1 font-bold text-emerald-600">{track.passRate.toFixed(1)}%</p></div>
                    <div><p className="text-muted-foreground">المعدل</p><p className="mt-1 font-bold">{track.average.toFixed(2)}</p></div>
                    <div><p className="text-muted-foreground">الأول</p><p className="mt-1 truncate font-bold">{track.topStudent.name}</p></div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>توزيع المعدلات</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={analysis.scoreDistribution} margin={{ left: -20, right: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="range" interval={1} tick={{ fontSize: 9 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Bar dataKey="count" name="عدد المترشحين" fill="#6366f1" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>تحليل المواد حسب الشعبة</CardTitle></CardHeader>
              <CardContent className="max-h-[300px] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-background text-start text-xs text-muted-foreground">
                    <tr><th className="p-2 text-start">الشعبة</th><th className="p-2 text-start">المادة</th><th className="p-2 text-center">المعامل</th><th className="p-2 text-center">المعدل</th><th className="p-2 text-center">الناجحون</th></tr>
                  </thead>
                  <tbody>
                    {analysis.subjectStats.map((subject, index) => (
                      <tr key={`${subject.filiere}-${subject.key}`} className={index % 2 ? "bg-muted/30" : ""}>
                        <td className="p-2 text-xs">{subject.filiereLabel}</td>
                        <td className="p-2">{subject.label}</td>
                        <td className="p-2 text-center">{subject.coefficient}</td>
                        <td className="p-2 text-center font-semibold">{subject.average?.toFixed(2) ?? "—"}</td>
                        <td className="p-2 text-center">{subject.passCount}/{subject.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle>ترتيب المترشحين</CardTitle></CardHeader>
            <CardContent className="max-h-[520px] overflow-auto p-0">
              <table className="w-full min-w-[700px] text-sm">
                <thead className="sticky top-0 bg-muted/80 text-xs">
                  <tr><th className="p-3 text-center">الترتيب</th><th className="p-3 text-start">الاسم</th><th className="p-3 text-start">الشعبة</th><th className="p-3 text-center">المعدل</th><th className="p-3 text-center">المصدر</th><th className="p-3 text-center">النتيجة</th></tr>
                </thead>
                <tbody>
                  {analysis.students.map(student => (
                    <tr key={`${student.filiere}-${student.rank}-${student.name}`} className="border-t">
                      <td className="p-3 text-center font-mono">{student.rank}</td>
                      <td className="p-3 font-medium">{student.name}</td>
                      <td className="p-3">{LYCEE_BAC_FILIERE_LABELS[student.filiere]}</td>
                      <td className={`p-3 text-center font-bold ${student.passed ? "text-emerald-600" : "text-red-500"}`}>{student.average.toFixed(2)}</td>
                      <td className="p-3 text-center text-xs text-muted-foreground">{student.averageSource === "file" ? "ملف Excel" : "حساب المعاملات"}</td>
                      <td className="p-3 text-center">{student.passed ? "ناجح" : "غير ناجح"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
          <p className="text-center text-xs text-muted-foreground">الملف والنتيجة لا يُحفظان في قاعدة البيانات؛ أعد رفع الملف لعرض التحليل لاحقاً.</p>
        </>
      )}
    </div>
  );
}
