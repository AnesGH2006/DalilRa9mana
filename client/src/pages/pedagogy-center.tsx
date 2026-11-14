import { useEffect, useState } from "react";
import {
  Activity, AlertTriangle, BookOpenCheck, Check, ClipboardCopy, FileQuestion,
  LoaderCircle, MessageSquareText, Printer, RefreshCw, Send, ShieldAlert,
  Sparkles, Star, UsersRound, Plus, Trash2, ArrowRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL;

type View = "remarks" | "quiz" | "risks";
type Language = "ar" | "fr" | "both";
interface SubjectAverage { id: number; subject: string; trimester: string; average: string; }
interface RemarkResult { subject: string; trimester: number; average: number; remark: string | { ar: string; fr: string }; }
interface Warning {
  studentId: string;
  studentName: string;
  niveau: string;
  classe: string;
  risk: "CRITICAL_DROP" | "ATTENDANCE_WARNING" | "ACADEMIC_RISK";
  trimester1Average: number | null;
  trimester2Average: number | null;
  averageDrop: number;
  consecutiveUnexcusedDays: number;
  intervention: string;
}

const LEVELS = ["1AM", "2AM", "3AM", "4AM", "1AS", "2AS", "3AS"];
const SUBJECTS = ["الرياضيات", "الفيزياء", "علوم الطبيعة والحياة", "اللغة العربية", "اللغة الفرنسية", "اللغة الإنجليزية", "التاريخ والجغرافيا"];
const labels: Record<string, string> = {
  exercise1: "التمرين الأول · استرجاع المعارف",
  exercise2: "التمرين الثاني · التطبيق والاستدلال",
  integrationSituation: "الوضعية الإدماجية وشبكة التقييم",
  answerKey: "التصحيح النموذجي وسلم التنقيط",
  question: "السؤال", prompt: "التعليمة", answer: "الإجابة", solution: "الحل",
  points: "النقاط", score: "التنقيط", criteria: "المعيار", evaluationGrid: "شبكة التقييم",
  grid: "شبكة التقييم", expectedAnswer: "الإجابة المنتظرة", title: "العنوان", instructions: "التعليمات",
};

async function readJson(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? "تعذر تنفيذ الطلب");
  return data;
}

function OutputValue({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span className="text-muted-foreground">—</span>;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return <span className="whitespace-pre-wrap leading-7 font-medium">{String(value)}</span>;
  }
  if (Array.isArray(value)) {
    return <ol className="list-decimal space-y-2 ps-5 text-sm">{value.map((entry, index) => <li key={index}><OutputValue value={entry} /></li>)}</ol>;
  }
  if (typeof value === "object") {
    return <div className="space-y-3">{Object.entries(value as Record<string, unknown>).map(([key, entry]) => (
      <div key={key} className="min-w-0 bg-muted/30 p-3 rounded-lg border border-border/50">
        <p className="mb-1 text-xs font-bold text-emerald-700 dark:text-emerald-400">{labels[key] ?? key}</p>
        <div className="text-sm"><OutputValue value={entry} /></div>
      </div>
    ))}</div>;
  }
  return null;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="grid gap-2 text-sm font-semibold">{label}{children}</label>;
}

function currentAcademicYear() {
  const now = new Date();
  const firstYear = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  return `${firstYear}-${firstYear + 1}`;
}

export default function PedagogyCenterPage() {
  const [view, setView] = useState<View>("remarks");
  const { toast } = useToast();
  const [subjects, setSubjects] = useState<SubjectAverage[]>([{ id: 1, subject: SUBJECTS[0]!, trimester: "1", average: "" }]);
  const [attendanceRate, setAttendanceRate] = useState("95");
  const [behavior, setBehavior] = useState("4");
  const [language, setLanguage] = useState<Language>("both");
  const [remarks, setRemarks] = useState<RemarkResult[]>([]);
  const [remarksBusy, setRemarksBusy] = useState(false);
  const [gradeLevel, setGradeLevel] = useState("4AM");
  const [quizSubject, setQuizSubject] = useState("الرياضيات");
  const [topic, setTopic] = useState("");
  const [difficulty, setDifficulty] = useState("Medium");
  const [questionCount, setQuestionCount] = useState("8");
  const [quiz, setQuiz] = useState<Record<string, unknown> | null>(null);
  const [quizBusy, setQuizBusy] = useState(false);
  const [academicYear, setAcademicYear] = useState(currentAcademicYear);
  const [warnings, setWarnings] = useState<Warning[]>([]);
  const [warningsBusy, setWarningsBusy] = useState(false);
  const [selectedWarning, setSelectedWarning] = useState<Warning | null>(null);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  async function generateRemarks(event: React.FormEvent) {
    event.preventDefault();
    if (subjects.some(item => !item.subject.trim() || item.average === "" || !Number.isFinite(Number(item.average)) || Number(item.average) < 0 || Number(item.average) > 20)) {
      toast({ variant: "destructive", title: "تحقق من المعدلات", description: "أدخل معدلاً صحيحاً بين 0 و20 لكل مادة." });
      return;
    }
    setRemarksBusy(true);
    try {
      const response = await fetch(`${BASE}api/v1/pedagogy/generate-remarks`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subjectAverages: subjects.map(item => ({ subject: item.subject, trimester: Number(item.trimester), average: Number(item.average) })),
          attendanceRate: Number(attendanceRate), behavioralScore: Number(behavior), language,
        }),
      });
      const data = await readJson(response);
      setRemarks(data.remarks ?? []);
      toast({ title: "تم إنشاء الملاحظات بنجاح" });
    } catch (error) {
      toast({ variant: "destructive", title: "تعذر إنشاء الملاحظات", description: error instanceof Error ? error.message : "حاول مجدداً" });
    } finally { setRemarksBusy(false); }
  }

  async function generateQuiz(event: React.FormEvent) {
    event.preventDefault();
    if (!topic.trim()) {
      toast({ variant: "destructive", title: "أدخل موضوع الدرس" });
      return;
    }
    setQuizBusy(true);
    setQuiz(null);
    try {
      const response = await fetch(`${BASE}api/v1/ai/generate-quiz`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gradeLevel, subject: quizSubject, lessonTopic: topic.trim(), difficulty, questionCount: Number(questionCount) }),
      });
      const data = await readJson(response);
      setQuiz(data.quiz);
      toast({ title: "تم إعداد ورقة الاختبار بنجاح" });
    } catch (error) {
      toast({ variant: "destructive", title: "تعذر إنشاء الاختبار", description: error instanceof Error ? error.message : "تحقق من إعدادات الذكاء الاصطناعي" });
    } finally { setQuizBusy(false); }
  }

  async function loadWarnings() {
    setWarningsBusy(true);
    try {
      const response = await fetch(`${BASE}api/v1/pedagogy/early-warnings?annee=${encodeURIComponent(academicYear)}`, { credentials: "include" });
      const data = await readJson(response);
      setWarnings(data.warnings ?? []);
    } catch (error) {
      toast({ variant: "destructive", title: "تعذر تحميل قائمة التعثر", description: error instanceof Error ? error.message : "حاول مجدداً" });
    } finally { setWarningsBusy(false); }
  }

  useEffect(() => { if (view === "risks") void loadWarnings(); }, [view]);

  async function sendDisciplineAlert(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedWarning || !message.trim()) return;
    setSending(true);
    try {
      const delivery = await readJson(await fetch(`${BASE}api/v1/notifications/disciplinary`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ student_id: selectedWarning.studentId, template_ar: message.trim() }),
      })) as { portalRecipients?: number };
      
      if (delivery.portalRecipients) {
        toast({ title: "تم إرسال التنبيه إلى تطبيق ولي الأمر بنجاح" });
      } else {
        toast({ variant: "destructive", title: "لم يصل التنبيه", description: "لا يوجد حساب وليّ مربوط بهذا التلميذ." });
      }
      setSelectedWarning(null);
      setMessage("");
    } catch (error) {
      toast({ variant: "destructive", title: "تعذر إرسال الإشعار", description: error instanceof Error ? error.message : "تحقق من إعدادات الرسائل" });
    } finally { setSending(false); }
  }

  async function copyText(text: string) {
    try { await navigator.clipboard.writeText(text); toast({ title: "تم النسخ للحافظة" }); }
    catch { toast({ variant: "destructive", title: "تعذر النسخ" }); }
  }

  const tabs: Array<{ id: View; label: string; icon: typeof Star }> = [
    { id: "remarks", label: "ملاحظات التلاميذ", icon: MessageSquareText },
    { id: "quiz", label: "صانع الاختبارات", icon: FileQuestion },
    { id: "risks", label: "متابعة التعثر", icon: Activity },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6 font-sans" dir="rtl">
      {/* Page Header */}
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-gradient-to-r from-emerald-600/10 via-teal-600/5 to-transparent p-6 border border-emerald-500/10">
        <div>
          <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase text-emerald-700 dark:text-emerald-400">
            <BookOpenCheck className="h-4 w-4" /> المركز البيداغوجي المساعد
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">فضاء المتابعة والتقويم الذكي</h1>
          <p className="mt-1 text-sm text-muted-foreground">صياغة الملاحظات البيداغوجية، إنشاء الامتحانات بالـ AI، والتنبيه الآلي للتعثر الدراسي</p>
        </div>
        <Badge variant="outline" className="bg-background px-3 py-1.5 text-xs font-semibold shadow-sm">
          <Sparkles className="w-3.5 h-3.5 text-emerald-600 ml-1.5" /> باقة Pro الاحترافية
        </Badge>
      </header>

      {/* Tabs Navigation */}
      <nav aria-label="أدوات المتابعة" className="flex gap-2 border-b pb-2">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setView(id)}
            aria-current={view === id ? "page" : undefined}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
              view === id
                ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/20"
                : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </nav>

      {/* VIEW 1: REMARKS GENERATOR */}
      {view === "remarks" && (
        <div className="grid items-start gap-6 lg:grid-cols-[1fr_1.1fr]">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-emerald-600" /> مدخلات التلميذ والمعدلات
              </CardTitle>
              <CardDescription>أدخل المعدلات لتوليد الملاحظات التربوية المخصصة لكشف النقاط.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={generateRemarks} className="space-y-5">
                <div className="space-y-3">
                  {subjects.map((item) => (
                    <div key={item.id} className="grid gap-3 p-3 rounded-xl bg-muted/40 border border-border/50 sm:grid-cols-[1fr_100px_100px]">
                      <Field label="المادة">
                        <Select value={item.subject} onValueChange={value => setSubjects(rows => rows.map(row => row.id === item.id ? { ...row, subject: value } : row))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>{SUBJECTS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                        </Select>
                      </Field>
                      <Field label="الفصل">
                        <Select value={item.trimester} onValueChange={value => setSubjects(rows => rows.map(row => row.id === item.id ? { ...row, trimester: value } : row))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>{[1, 2, 3].map(t => <SelectItem key={t} value={String(t)}>الفصل {t}</SelectItem>)}</SelectContent>
                        </Select>
                      </Field>
                      <Field label="المعدل / 20">
                        <Input type="number" min="0" max="20" step="0.01" required value={item.average} onChange={e => setSubjects(rows => rows.map(row => row.id === item.id ? { ...row, average: e.target.value } : row))} placeholder="15.5" />
                      </Field>
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => setSubjects(rows => [...rows, { id: Date.now(), subject: SUBJECTS[0]!, trimester: "1", average: "" }])}>
                      <Plus className="w-4 h-4 ml-1" /> إضافة مادة
                    </Button>
                    {subjects.length > 1 && (
                      <Button type="button" size="sm" variant="ghost" className="text-destructive" onClick={() => setSubjects(rows => rows.slice(0, -1))}>
                        <Trash2 className="w-4 h-4 ml-1" /> حذف المادة
                      </Button>
                    )}
                  </div>
                </div>

                <div className="grid gap-4 border-t pt-4 sm:grid-cols-3">
                  <Field label="نسبة الحضور %"><Input type="number" min="0" max="100" value={attendanceRate} onChange={e => setAttendanceRate(e.target.value)} /></Field>
                  <Field label="السلوك (1 إلى 5)">
                    <Select value={behavior} onValueChange={setBehavior}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{[1, 2, 3, 4, 5].map(s => <SelectItem key={s} value={String(s)}>{s} / 5</SelectItem>)}</SelectContent>
                    </Select>
                  </Field>
                  <Field label="لغة الملاحظة">
                    <Select value={language} onValueChange={v => setLanguage(v as Language)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="both">العربية والفرنسية</SelectItem>
                        <SelectItem value="ar">العربية فقط</SelectItem>
                        <SelectItem value="fr">الفرنسية فقط</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>

                <Button type="submit" disabled={remarksBusy} className="w-full bg-emerald-600 hover:bg-emerald-700 font-bold">
                  {remarksBusy ? <LoaderCircle className="animate-spin ml-2" /> : <Sparkles className="ml-2" />} صياغة الملاحظات الذكية
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className="shadow-sm min-h-[400px] flex flex-col justify-between">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <CardTitle className="text-lg">الملاحظات المقترحة لكشف النقاط</CardTitle>
                <CardDescription>صياغة بيداغوجية دقيقة ودافعة للتحسين.</CardDescription>
              </div>
              {remarks.length > 0 && (
                <Button variant="outline" size="sm" onClick={() => void copyText(remarks.map(item => `${item.subject} (ف${item.trimester}): ${typeof item.remark === "string" ? item.remark : `${item.remark.ar}\n${item.remark.fr}`}`).join("\n\n"))}>
                  <ClipboardCopy className="w-4 h-4 ml-1" /> نسخ الكل
                </Button>
              )}
            </CardHeader>
            <CardContent className="flex-1 space-y-4">
              {remarks.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground border-2 border-dashed rounded-xl">
                  <MessageSquareText className="h-10 w-10 opacity-30 mb-2" />
                  <p className="text-sm font-semibold">أدخل البيانات واضغط على "صياغة الملاحظات" لعرض النتيجة.</p>
                </div>
              ) : (
                remarks.map((item, index) => (
                  <div key={index} className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-border/80 space-y-2">
                    <div className="flex items-center justify-between text-xs font-bold text-emerald-700 dark:text-emerald-400">
                      <span>{item.subject} — الفصل {item.trimester}</span>
                      <Badge variant="secondary">{item.average.toFixed(2)} / 20</Badge>
                    </div>
                    {typeof item.remark === "string" ? (
                      <p className="text-sm leading-relaxed">{item.remark}</p>
                    ) : (
                      <>
                        <p className="text-sm leading-relaxed">{item.remark.ar}</p>
                        <p dir="ltr" className="text-xs text-muted-foreground font-sans mt-1 leading-relaxed border-t pt-1">{item.remark.fr}</p>
                      </>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* VIEW 2: QUIZ GENERATOR */}
      {view === "quiz" && (
        <div className="grid items-start gap-6 lg:grid-cols-[320px_1fr]">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">إعداد موضوع الاختبار</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={generateQuiz} className="space-y-4">
                <Field label="المستوى الدراسي">
                  <Select value={gradeLevel} onValueChange={setGradeLevel}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{LEVELS.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <Field label="المادة">
                  <Select value={quizSubject} onValueChange={setQuizSubject}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{SUBJECTS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <Field label="عنوان الدرس / الموضوع">
                  <Input required maxLength={300} value={topic} onChange={e => setTopic(e.target.value)} placeholder="مثال: التوازن الميكانيكي" />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="مستوى الصعوبة">
                    <Select value={difficulty} onValueChange={setDifficulty}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Easy">سهل</SelectItem>
                        <SelectItem value="Medium">متوسط</SelectItem>
                        <SelectItem value="Hard">صعب</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="عدد الأسئلة">
                    <Input type="number" min="3" max="30" value={questionCount} onChange={e => setQuestionCount(e.target.value)} />
                  </Field>
                </div>
                <Button type="submit" disabled={quizBusy} className="w-full bg-emerald-600 hover:bg-emerald-700 font-bold">
                  {quizBusy ? <LoaderCircle className="animate-spin ml-2" /> : <Sparkles className="ml-2" />} توليد موضوع الامتحان
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between border-b pb-4">
              <div>
                <CardTitle className="text-lg">ورقة الاختبار والتصحيح النموذجية</CardTitle>
                <CardDescription>مطابقة لمعايير المنهاج الوزاري الجزائري.</CardDescription>
              </div>
              {quiz && (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => void copyText(JSON.stringify(quiz, null, 2))}>
                    <ClipboardCopy className="w-4 h-4 ml-1" /> نسخ
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => window.print()}>
                    <Printer className="w-4 h-4 ml-1" /> طباعة
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent className="pt-6">
              {quizBusy ? (
                <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                  <LoaderCircle className="h-8 w-8 animate-spin text-emerald-600 mb-3" />
                  <p className="text-sm font-semibold">جارٍ صياغة التمارين والوضعية الإدماجية وشبكة التقييم...</p>
                </div>
              ) : !quiz ? (
                <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground border-2 border-dashed rounded-xl">
                  <FileQuestion className="h-10 w-10 opacity-30 mb-2" />
                  <p className="text-sm font-semibold">حدد الدرس واضغط على توليد الامتحان لعرض الورقة جاهزة للطباعة.</p>
                </div>
              ) : (
                <div className="space-y-6 print:p-0">
                  <div className="flex justify-between items-center bg-muted/40 p-3 rounded-lg text-sm font-bold border">
                    <span>المستوى: {gradeLevel}</span>
                    <span>المادة: {quizSubject}</span>
                    <span>الموضوع: {topic}</span>
                  </div>
                  {["exercise1", "exercise2", "integrationSituation", "answerKey"].map((key) => quiz[key] !== undefined && (
                    <section key={key} className="p-4 rounded-xl border space-y-2">
                      <h3 className="font-extrabold text-base text-emerald-700 dark:text-emerald-400 border-b pb-2">
                        {labels[key]}
                      </h3>
                      <OutputValue value={quiz[key]} />
                    </section>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* VIEW 3: EARLY WARNING RISKS */}
      {view === "risks" && (
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between border-b pb-4">
            <div>
              <CardTitle className="text-lg">مؤشرات التعثر والتدخل المبكر</CardTitle>
              <CardDescription>كشف أوتوماتيكي للتلاميذ المعرضين للرسوب أو الانقطاع.</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Input className="w-32 h-9 text-xs" value={academicYear} onChange={e => setAcademicYear(e.target.value)} />
              <Button variant="outline" size="sm" disabled={warningsBusy} onClick={() => void loadWarnings()}>
                {warningsBusy ? <LoaderCircle className="animate-spin w-4 h-4" /> : <RefreshCw className="w-4 h-4 ml-1" />} تحديث
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-6 space-y-6">
            {/* Risk Category Cards */}
            <div className="grid gap-4 sm:grid-cols-3">
              {[
                ["CRITICAL_DROP", "انخفاض حاد في النتائج", "border-rose-200 bg-rose-50/50 text-rose-800 dark:bg-rose-950/20 dark:text-rose-300", AlertTriangle],
                ["ATTENDANCE_WARNING", "تنبيه غياب متكرر", "border-amber-200 bg-amber-50/50 text-amber-800 dark:bg-amber-950/20 dark:text-amber-300", ShieldAlert],
                ["ACADEMIC_RISK", "معدل تحت العتبة (دون 10)", "border-blue-200 bg-blue-50/50 text-blue-800 dark:bg-blue-950/20 dark:text-blue-300", Activity],
              ].map(([riskKey, title, styleClass, IconComponent]: any) => (
                <div key={riskKey} className={`p-4 rounded-xl border flex items-center justify-between ${styleClass}`}>
                  <div className="flex items-center gap-2 font-bold text-sm">
                    <IconComponent className="w-5 h-5" />
                    <span>{title}</span>
                  </div>
                  <span className="text-2xl font-black">{warnings.filter(w => w.risk === riskKey).length}</span>
                </div>
              ))}
            </div>

            {/* Notification Modal / Form */}
            {selectedWarning && (
              <form onSubmit={sendDisciplineAlert} className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-emerald-500/30 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-sm">إرسال إشعار ولي أمر التلميذ: <span className="text-emerald-600">{selectedWarning.studentName}</span></span>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedWarning(null)}>إلغاء</Button>
                </div>
                <Textarea required maxLength={1200} rows={3} value={message} onChange={e => setMessage(e.target.value)} />
                <Button type="submit" disabled={sending || !message.trim()} className="bg-emerald-600 hover:bg-emerald-700 font-bold text-sm">
                  {sending ? <LoaderCircle className="animate-spin ml-2" /> : <Send className="w-4 h-4 ml-2" />} إرسال إلى تطبيق ولي الأمر
                </Button>
              </form>
            )}

            {/* Warnings Table / List */}
            {warningsBusy ? (
              <div className="flex justify-center py-16 text-muted-foreground">
                <LoaderCircle className="h-6 w-6 animate-spin text-emerald-600 ml-2" /> تحليل سجلات النقاط والغياب...
              </div>
            ) : warnings.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground border-2 border-dashed rounded-xl">
                <Check className="h-10 w-10 text-emerald-600 mx-auto mb-2" />
                <p className="text-sm font-semibold">ممتاز! لا توجد حالياً أي حالات تعثر حرجة في هذه السنة.</p>
              </div>
            ) : (
              <div className="divide-y border rounded-xl overflow-hidden">
                {warnings.map((item) => (
                  <div key={`${item.studentId}-${item.risk}`} className="p-4 flex flex-col md:flex-row justify-between gap-4 items-start md:items-center hover:bg-muted/30">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-bold text-base">{item.studentName}</span>
                        <Badge variant="outline">{item.niveau} · {item.classe}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{item.intervention}</p>
                      <div className="flex gap-4 text-xs font-semibold mt-2 text-slate-600 dark:text-slate-400">
                        <span>ف1: {item.trimester1Average ?? "—"}</span>
                        <span>ف2: {item.trimester2Average ?? "—"}</span>
                        <span className="text-rose-600">انخفاض: {item.averageDrop.toFixed(2)}</span>
                        <span className="text-amber-600">غياب متصل: {item.consecutiveUnexcusedDays} أيام</span>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setSelectedWarning(item);
                        setMessage(`عزيزي الولي، نسترعي انتباهكم إلى ضرورة التواصل مع مستشار التربية لمتابعة وضعية ابنكم/ابنتكم (${item.studentName}) المدرسية.`);
                      }}
                    >
                      <MessageSquareText className="w-4 h-4 ml-1" /> إشعار الولي
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}