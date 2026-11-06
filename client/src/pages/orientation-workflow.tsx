import { useCallback, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { AlertCircle, CheckCircle2, Download, LockKeyhole, Plus, RefreshCw, Save, Send, Shuffle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useOrientationWishes } from "@/hooks/use-orientation-wishes";
import {
  rankFourAMArtsApplicants,
  rankFourAMScienceApplicants,
} from "@/lib/4am-stream-allocation";
import type { StudentResult } from "@shared/types";

const BASE = import.meta.env.BASE_URL;
const YEARS = ["2026-2027", "2025-2026", "2024-2025", "2023-2024"];
const STREAMS = {
  science: "جذع مشترك علوم وتكنولوجيا",
  arts: "جذع مشترك آداب",
} as const;

interface Destination {
  name: string;
  schoolUserId: string;
  scienceSeats: number;
  artsSeats: number;
}

interface SecondarySchool {
  userId: string;
  name: string;
  wilaya: string;
  commune: string;
}

interface OrientationAssignment {
  studentId: string;
  studentName: string;
  classe: string;
  annualAvg: number | null;
  stream: "science" | "arts";
  destinationName: string;
  destinationUserId: string;
}

interface OrientationPlan {
  annee: string;
  destinations: Destination[];
  status: "draft" | "published";
  assignments: OrientationAssignment[];
  publishedAt: string | null;
}

const emptyPlan = (annee: string): OrientationPlan => ({
  annee,
  destinations: [],
  status: "draft",
  assignments: [],
  publishedAt: null,
});

function MiddleOrientationWorkflowPage() {
  const [year, setYear] = useState(() => localStorage.getItem("cem-selected-year") || "2025-2026");
  const [results, setResults] = useState<StudentResult[]>([]);
  const [secondarySchools, setSecondarySchools] = useState<SecondarySchool[]>([]);
  const [plan, setPlan] = useState<OrientationPlan>(() => emptyPlan(year));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const wishes = useOrientationWishes(year);

  const loadData = useCallback(async (selectedYear: string) => {
    setLoading(true);
    try {
      const [resultsResponse, planResponse, schoolsResponse] = await Promise.all([
        fetch(`${BASE}api/results?annee=${encodeURIComponent(selectedYear)}&niveau=4AM`, { credentials: "include" }),
        fetch(`${BASE}api/orientation/plans/${encodeURIComponent(selectedYear)}`, { credentials: "include" }),
        fetch(`${BASE}api/orientation/secondary-schools`, { credentials: "include" }),
      ]);
      if (!resultsResponse.ok || !planResponse.ok || !schoolsResponse.ok) throw new Error("تعذر تحميل بيانات التوجيه والثانويات المستقبلة");
      const [resultsData, planData, schoolsData] = await Promise.all([
        resultsResponse.json() as Promise<StudentResult[]>,
        planResponse.json() as Promise<OrientationPlan>,
        schoolsResponse.json() as Promise<SecondarySchool[]>,
      ]);
      setResults(resultsData);
      setPlan(planData);
      setSecondarySchools(schoolsData);
    } catch (error) {
      toast({
        title: "تعذر تحميل دورة التوجيه",
        description: error instanceof Error ? error.message : "حدث خطأ أثناء تحميل البيانات",
        variant: "destructive",
      });
      setResults([]);
      setPlan(emptyPlan(selectedYear));
      setSecondarySchools([]);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    localStorage.setItem("cem-selected-year", year);
    void loadData(year);
  }, [year, loadData]);

  const proposedAssignments = useMemo(() => {
    const eligible = results.filter(result => result.passed && result.annualAvg !== null);
    const scienceSeats = plan.destinations.reduce((sum, destination) => sum + destination.scienceSeats, 0);
    const artsSeats = plan.destinations.reduce((sum, destination) => sum + destination.artsSeats, 0);
    const scienceRanking = rankFourAMScienceApplicants(eligible, wishes);
    const scienceSelected = scienceRanking.slice(0, scienceSeats);
    const scienceIds = new Set(scienceSelected.map(result => result.student.id));
    const artsSelected = rankFourAMArtsApplicants(eligible, scienceIds, wishes).slice(0, artsSeats);

    const allocateToDestinations = (
      selected: StudentResult[],
      stream: "science" | "arts",
      seatCount: (destination: Destination) => number,
    ): OrientationAssignment[] => {
      let cursor = 0;
      return plan.destinations.flatMap(destination => {
        const students = selected.slice(cursor, cursor + seatCount(destination));
        cursor += seatCount(destination);
        return students.map(result => ({
          studentId: result.student.id,
          studentName: result.student.nomPrenom,
          classe: result.student.classe,
          annualAvg: result.annualAvg,
          stream,
          destinationName: destination.name,
          destinationUserId: destination.schoolUserId,
        }));
      });
    };

    return [
      ...allocateToDestinations(scienceSelected, "science", destination => destination.scienceSeats),
      ...allocateToDestinations(artsSelected, "arts", destination => destination.artsSeats),
    ];
  }, [results, plan.destinations, wishes]);

  const updateDestination = (index: number, patch: Partial<Destination>) => {
    setPlan(current => ({
      ...current,
      destinations: current.destinations.map((destination, i) => i === index ? { ...destination, ...patch } : destination),
    }));
  };

  const saveMap = async () => {
    setSaving(true);
    try {
      const response = await fetch(`${BASE}api/orientation/plans`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ annee: year, destinations: plan.destinations }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "تعذر حفظ الخريطة");
      setPlan(data as OrientationPlan);
      toast({ title: "تم حفظ الخريطة التربوية" });
    } catch (error) {
      toast({
        title: "فشل حفظ الخريطة",
        description: error instanceof Error ? error.message : "حدث خطأ غير متوقع",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const publishPlan = async () => {
    if (!plan.destinations.length || plan.destinations.some(destination => !destination.schoolUserId)) {
      toast({ title: "اختر الثانوية المستقبلة لكل سعة قبل الاعتماد", variant: "destructive" });
      return;
    }
    if (!window.confirm(`سيتم اعتماد القرار النهائي ونقل بيانات ${proposedAssignments.length} تلميذاً تلقائياً إلى حسابات الثانويات المحددة للسنة ${year}. هل تريد المتابعة؟`)) return;

    setSaving(true);
    try {
      const response = await fetch(`${BASE}api/orientation/plans/${encodeURIComponent(year)}/publish`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignments: proposedAssignments }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "تعذر اعتماد التوجيه");
      setPlan(data as OrientationPlan);
      toast({ title: "تم اعتماد التوجيه", description: "أصبحت القائمة نهائية ومحفوظة لهذه السنة." });
    } catch (error) {
      toast({
        title: "فشل اعتماد التوجيه",
        description: error instanceof Error ? error.message : "حدث خطأ غير متوقع",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const downloadRoster = () => {
    const rows = plan.assignments.map((assignment, index) => ({
      "الرقم": index + 1,
      "اسم ولقب التلميذ": assignment.studentName,
      "القسم الأصلي": assignment.classe,
      "المعدل السنوي": assignment.annualAvg ?? "",
      "الجذع المشترك": STREAMS[assignment.stream],
      "الثانوية المستقبلة": assignment.destinationName,
    }));
    const worksheet = XLSX.utils.json_to_sheet(rows);
    worksheet["!cols"] = [{ wch: 8 }, { wch: 30 }, { wch: 16 }, { wch: 14 }, { wch: 32 }, { wch: 28 }];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "قوائم التوجيه");
    XLSX.writeFile(workbook, `قوائم-التوجيه-${year}.xlsx`);
  };

  const assignedScience = plan.status === "published"
    ? plan.assignments.filter(assignment => assignment.stream === "science").length
    : proposedAssignments.filter(assignment => assignment.stream === "science").length;
  const assignedArts = plan.status === "published"
    ? plan.assignments.filter(assignment => assignment.stream === "arts").length
    : proposedAssignments.filter(assignment => assignment.stream === "arts").length;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6" dir="rtl">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-black">دورة التوجيه إلى الثانويات</h1>
          <p className="mt-1 text-sm text-muted-foreground">إعداد الخريطة التربوية، معاينة التوزيع، ثم اعتماد القوائم النهائية.</p>
        </div>
        <Select value={year} onValueChange={setYear}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>{YEARS.map(item => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
        </Select>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">الثانويات بالخريطة</p><p className="mt-1 text-2xl font-black">{plan.destinations.length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">مقاعد العلوم المحجوزة</p><p className="mt-1 text-2xl font-black">{plan.destinations.reduce((sum, item) => sum + item.scienceSeats, 0)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">التلاميذ الموزعون</p><p className="mt-1 text-2xl font-black">{plan.status === "published" ? plan.assignments.length : proposedAssignments.length}</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>الخريطة التربوية — {year}</CardTitle>
            <p className="mt-2 text-xs text-muted-foreground">اختر الحساب المسجل للثانوية وحدد مقاعد كل جذع. عند اعتماد القرار النهائي تُنشأ ملفات التلاميذ في حساب الثانوية تلقائياً كـ1AS غير موزعين.</p>
          </div>
          {plan.status === "published" && <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700"><LockKeyhole className="h-3.5 w-3.5" /> معتمد ونهائي</span>}
        </CardHeader>
        <CardContent className="space-y-3">
          {plan.destinations.map((destination, index) => (
            <div key={`${index}-${destination.name}`} className="grid gap-3 rounded-xl border p-3 md:grid-cols-[minmax(180px,1fr)_140px_140px_auto] md:items-end">
              <label className="space-y-1 text-xs font-semibold">
                الثانوية المستقبلة
                <Select disabled={plan.status === "published"} value={destination.schoolUserId || "__unselected__"} onValueChange={value => {
                  const school = secondarySchools.find(item => item.userId === value);
                  updateDestination(index, { schoolUserId: value === "__unselected__" ? "" : value, name: school?.name ?? "" });
                }}>
                  <SelectTrigger><SelectValue placeholder="اختر الثانوية" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__unselected__">اختر الثانوية</SelectItem>
                    {secondarySchools.map(school => <SelectItem key={school.userId} value={school.userId}>{school.name} — {school.wilaya} / {school.commune}</SelectItem>)}
                  </SelectContent>
                </Select>
              </label>
              <label className="space-y-1 text-xs font-semibold">
                مقاعد العلوم
                <Input disabled={plan.status === "published"} type="number" min={0} max={500} value={destination.scienceSeats} onChange={event => updateDestination(index, { scienceSeats: Math.max(0, Math.min(500, Number(event.target.value) || 0)) })} />
              </label>
              <label className="space-y-1 text-xs font-semibold">
                مقاعد الآداب
                <Input disabled={plan.status === "published"} type="number" min={0} max={500} value={destination.artsSeats} onChange={event => updateDestination(index, { artsSeats: Math.max(0, Math.min(500, Number(event.target.value) || 0)) })} />
              </label>
              {plan.status === "draft" && (
                <Button variant="ghost" size="icon" aria-label="حذف الثانوية" onClick={() => setPlan(current => ({ ...current, destinations: current.destinations.filter((_, i) => i !== index) }))}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              )}
            </div>
          ))}
          {plan.status === "draft" && secondarySchools.length === 0 && (
            <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
              لا توجد ثانويات مسجلة كجهة استقبال. على مدير الثانوية اختيار مرحلة «الثانوي» وحفظ بيانات المؤسسة من صفحة الإعدادات أولاً.
            </p>
          )}
          {plan.status === "draft" && (
            <div className="flex flex-wrap gap-2 pt-2">
              <Button variant="outline" onClick={() => setPlan(current => ({ ...current, destinations: [...current.destinations, { name: "", schoolUserId: "", scienceSeats: 0, artsSeats: 0 }] }))}>
                <Plus /> إضافة ثانوية
              </Button>
              <Button variant="secondary" disabled={saving || loading} onClick={() => void saveMap()}>
                <Save /> {saving ? "جارٍ الحفظ..." : "حفظ الخريطة"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>معاينة التوزيع والتسليم</CardTitle>
          <p className="text-xs text-muted-foreground">ترتيب المقترحين يعتمد على الرغبات والمعدلات والسعة، ويظل اعتماد التوجيه قراراً إدارياً.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? <p className="py-8 text-center text-sm text-muted-foreground">جارٍ تحميل النتائج...</p> : (
            <>
              <div className="flex flex-wrap gap-4 text-sm">
                <span>{STREAMS.science}: <strong>{assignedScience}</strong></span>
                <span>{STREAMS.arts}: <strong>{assignedArts}</strong></span>
                <span>غير موزعين بسبب السعة/الشروط: <strong>{Math.max(0, results.filter(result => result.passed && result.annualAvg !== null).length - assignedScience - assignedArts)}</strong></span>
              </div>
              {plan.status === "draft" ? (
                <Button disabled={saving || loading || plan.destinations.length === 0 || plan.destinations.some(destination => !destination.schoolUserId)} onClick={() => void publishPlan()}>
                  <Send /> اعتماد النتائج النهائية
                </Button>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <p className="flex items-center gap-2 text-sm font-semibold text-emerald-700"><CheckCircle2 className="h-4 w-4" /> تم الاعتماد {plan.publishedAt ? `في ${new Date(plan.publishedAt).toLocaleDateString("ar-DZ")}` : ""}</p>
                  <Button onClick={downloadRoster}><Download /> تنزيل قوائم Excel</Button>
                </div>
              )}
              <p className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
                تنتقل الملفات عند الاعتماد إلى حساب الثانوية كمسجلين في 1AS ضمن فوج «غير موزع». يحدد مدير الثانوية الأفواج بعد الاستقبال وفق تنظيم الوزارة.
              </p>
              {plan.status === "published" && plan.assignments.length > 0 && (
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead className="bg-muted/50 text-right text-xs text-muted-foreground">
                      <tr><th className="p-3">التلميذ</th><th className="p-3">القسم</th><th className="p-3">المعدل</th><th className="p-3">الجذع</th><th className="p-3">الثانوية</th></tr>
                    </thead>
                    <tbody>{plan.assignments.map(assignment => (
                      <tr key={assignment.studentId} className="border-t">
                        <td className="p-3 font-semibold">{assignment.studentName}</td>
                        <td className="p-3">{assignment.classe}</td>
                        <td className="p-3">{assignment.annualAvg?.toFixed(2) ?? "—"}</td>
                        <td className="p-3">{STREAMS[assignment.stream]}</td>
                        <td className="p-3">{assignment.destinationName}</td>
                      </tr>
                    ))}</tbody>
                            </table>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {plan.status === "published" && <p className="flex items-center gap-2 text-xs text-muted-foreground"><LockKeyhole className="h-3.5 w-3.5" /> تم قفل الخريطة وقائمة التلاميذ بعد الاعتماد.</p>}
    </div>
  );
}

interface IncomingStudent {
  id: string;
  studentId: string;
  studentName: string;
  dateNaissance: string | null;
  sexe: "M" | "F";
  parentPhone: string | null;
  annualAvg: number | null;
  stream: string;
  destinationName: string;
  sourceUserId: string;
  sourceSchoolName: string | null;
  classe: string;
}

interface LinkedMiddleSchool {
  userId: string;
  name: string;
  wilaya: string;
  commune: string;
  expectedIncomingStudents: number;
  dataStatus: "sent" | "pending" | "not_sent";
}

function IncomingOrientationPage() {
  const [year, setYear] = useState(() => localStorage.getItem("cem-selected-year") || "2025-2026");
  const [students, setStudents] = useState<IncomingStudent[]>([]);
  const [linkedSchools, setLinkedSchools] = useState<LinkedMiddleSchool[]>([]);
  const [loading, setLoading] = useState(true);
  const [organizing, setOrganizing] = useState(false);
  const [scienceGroups, setScienceGroups] = useState(1);
  const [artsGroups, setArtsGroups] = useState(1);
  const { toast } = useToast();

  const loadIncoming = useCallback(async (selectedYear: string) => {
    setLoading(true);
    try {
      const [incomingResponse, schoolsResponse] = await Promise.all([
        fetch(`${BASE}api/orientation/incoming?annee=${encodeURIComponent(selectedYear)}`, { credentials: "include" }),
        fetch(`${BASE}api/orientation/incoming/linked-schools?annee=${encodeURIComponent(selectedYear)}`, { credentials: "include" }),
      ]);
      const [incomingData, schoolsData] = await Promise.all([incomingResponse.json(), schoolsResponse.json()]);
      if (!incomingResponse.ok) throw new Error(incomingData.error ?? "تعذر تحميل قائمة التلاميذ الوافدين");
      if (!schoolsResponse.ok) throw new Error(schoolsData.error ?? "تعذر تحميل المتوسطات الملحقة");
      setStudents(incomingData as IncomingStudent[]);
      setLinkedSchools(schoolsData as LinkedMiddleSchool[]);
    } catch (error) {
      toast({
        title: "تعذر تحميل قوائم الاستقبال",
        description: error instanceof Error ? error.message : "حدث خطأ أثناء تحميل البيانات",
        variant: "destructive",
      });
      setStudents([]);
      setLinkedSchools([]);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    localStorage.setItem("cem-selected-year", year);
    void loadIncoming(year);
  }, [year, loadIncoming]);

  const organizeGroups = async () => {
    setOrganizing(true);
    try {
      const response = await fetch(`${BASE}api/orientation/incoming/organize`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ annee: year, scienceGroups, artsGroups }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "تعذر تشكيل الأفواج");
      await loadIncoming(year);
      toast({ title: "تم تشكيل الأفواج", description: `تم توزيع ${data.assigned} تلميذاً بالتوازن داخل جذعهم المقرر.` });
    } catch (error) {
      toast({
        title: "تعذر تشكيل الأفواج",
        description: error instanceof Error ? error.message : "حدث خطأ غير متوقع",
        variant: "destructive",
      });
    } finally {
      setOrganizing(false);
    }
  };

  const downloadRoster = () => {
    const rows = students.map((student, index) => ({
      "الرقم": index + 1,
      "اسم ولقب التلميذ": student.studentName,
      "تاريخ الميلاد": student.dateNaissance ?? "",
      "الجنس": student.sexe === "M" ? "ذكر" : "أنثى",
      "رقم هاتف الولي": student.parentPhone ?? "",
      "المعدل السنوي": student.annualAvg ?? "",
      "الجذع المشترك": student.stream === "science" ? STREAMS.science : STREAMS.arts,
      "الفوج": student.classe,
    }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), "التلاميذ الوافدون");
    XLSX.writeFile(workbook, `التلاميذ-الوافدون-${year}.xlsx`);
  };
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6" dir="rtl">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-black">استقبال تلاميذ التوجيه</h1>
          <p className="mt-1 text-sm text-muted-foreground">تصل الملفات تلقائياً بعد اعتماد قرار المتوسطة، ثم وزّع التلاميذ على الأفواج.</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>{YEARS.map(item => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
          </Select>
          <Button variant="outline" disabled={loading} onClick={() => void loadIncoming(year)}><RefreshCw /> تحديث</Button>
          <Button variant="outline" disabled={!students.length} onClick={downloadRoster}><Download /> تنزيل القائمة</Button>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">التلاميذ المستقبَلون</p><p className="mt-1 text-2xl font-black">{students.length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">موزعون على أفواج</p><p className="mt-1 text-2xl font-black">{students.filter(student => student.classe !== "غير موزع").length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">بانتظار توزيع الفوج</p><p className="mt-1 text-2xl font-black">{students.filter(student => student.classe === "غير موزع").length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">المتوسطات الملحقة</p><p className="mt-1 text-2xl font-black">{linkedSchools.length}</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>المتوسطات الملحقة بالخريطة التربوية</CardTitle>
          <p className="text-xs text-muted-foreground">عدد التلاميذ المتوقع هو عدد تلاميذ 4AM قبل الاعتماد، ويصبح العدد الفعلي بعد إرسال قرار التوجيه.</p>
        </CardHeader>
        <CardContent>
          {linkedSchools.length === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              لا توجد متوسطات ملحقة مسجلة لهذه السنة الدراسية.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-right text-xs text-muted-foreground">
                  <tr>
                    <th className="p-3">المتوسطة</th>
                    <th className="p-3">البلدية / الولاية</th>
                    <th className="p-3">التلاميذ المتوقعون</th>
                    <th className="p-3">حالة البيانات</th>
                  </tr>
                </thead>
                <tbody>{linkedSchools.map(school => (
                  <tr key={school.userId} className="border-t">
                    <td className="p-3 font-semibold">{school.name}</td>
                    <td className="p-3">{[school.commune, school.wilaya].filter(Boolean).join("، ") || "—"}</td>
                    <td className="p-3 font-bold">{school.expectedIncomingStudents}</td>
                    <td className="p-3">
                      <Badge variant={school.dataStatus === "sent" ? "default" : school.dataStatus === "pending" ? "secondary" : "outline"}>
                        {school.dataStatus === "sent" ? "تم الإرسال" : school.dataStatus === "pending" ? "قيد الإعداد" : "لم ترسل"}
                      </Badge>
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>تشكيل الأفواج حسب قرار التوجيه</CardTitle>
          <p className="text-xs text-muted-foreground">الجذع الذي حددته المتوسطة نهائياً يبقى كما هو. أدخل عدد الأفواج لكل جذع ليُوزع التلاميذ بالتوازن بحسب المعدلات.</p>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <label className="space-y-1 text-xs font-semibold">
            أفواج العلوم ({students.filter(student => student.stream === "science").length} تلميذاً)
            <Input type="number" min={0} max={30} value={scienceGroups} onChange={event => setScienceGroups(Math.max(0, Math.min(30, Number(event.target.value) || 0)))} />
          </label>
          <label className="space-y-1 text-xs font-semibold">
            أفواج الآداب ({students.filter(student => student.stream === "arts").length} تلميذاً)
            <Input type="number" min={0} max={30} value={artsGroups} onChange={event => setArtsGroups(Math.max(0, Math.min(30, Number(event.target.value) || 0)))} />
          </label>
          <Button disabled={loading || organizing || students.length === 0} onClick={() => void organizeGroups()}>
            <Shuffle /> {organizing ? "جارٍ تشكيل الأفواج..." : "تشكيل الأفواج بالتوازن"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>ملفات التلاميذ الوافدين — {year}</CardTitle></CardHeader>
        <CardContent>
          {loading ? <p className="py-8 text-center text-sm text-muted-foreground">جارٍ تحميل القائمة...</p> : students.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">لا توجد قوائم توجيه واردة لهذه السنة حتى الآن.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[820px] text-sm">
                <thead className="bg-muted/50 text-right text-xs text-muted-foreground">
                  <tr><th className="p-3">التلميذ</th><th className="p-3">المتوسطة</th><th className="p-3">تاريخ الميلاد</th><th className="p-3">الجنس</th><th className="p-3">الجذع النهائي</th><th className="p-3">المعدل</th><th className="p-3">الفوج</th></tr>
                </thead>
                <tbody>{students.map(student => (
                  <tr key={student.id} className="border-t">
                    <td className="p-3 font-semibold">{student.studentName}</td>
                    <td className="p-3">{student.sourceSchoolName ?? "—"}</td>
                    <td className="p-3">{student.dateNaissance ?? "—"}</td>
                    <td className="p-3">{student.sexe === "M" ? "ذكر" : "أنثى"}</td>
                    <td className="p-3">{student.stream === "science" ? STREAMS.science : STREAMS.arts}</td>
                    <td className="p-3">{student.annualAvg?.toFixed(2) ?? "—"}</td>
                    <td className="p-3">{student.classe}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function OrientationWorkflowPage() {
  return (
    <div className="mx-auto max-w-3xl p-6" dir="rtl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-amber-500" />
            النقل الآلي إلى الثانوية غير مفعّل
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm leading-7 text-muted-foreground">
          لأن لكل مرحلة قاعدة بيانات ونشراً مستقلاً، لا يمكن نقل قوائم التلاميذ بين المتوسطة والثانوية تلقائياً حالياً.
          أضف المقبولين في 1AS من حساب الثانوية عبر صفحة التلاميذ أو الاستيراد إلى حين إعداد الربط الآمن بين النسختين.
        </CardContent>
      </Card>
    </div>
  );
}
