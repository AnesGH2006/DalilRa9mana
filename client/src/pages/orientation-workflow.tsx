import { useCallback, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { CheckCircle2, Download, LockKeyhole, Plus, Save, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  scienceSeats: number;
  artsSeats: number;
}

interface OrientationAssignment {
  studentId: string;
  studentName: string;
  classe: string;
  annualAvg: number | null;
  stream: "science" | "arts";
  destinationName: string;
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

export default function OrientationWorkflowPage() {
  const [year, setYear] = useState(() => localStorage.getItem("cem-selected-year") || "2025-2026");
  const [results, setResults] = useState<StudentResult[]>([]);
  const [plan, setPlan] = useState<OrientationPlan>(() => emptyPlan(year));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const wishes = useOrientationWishes(year);

  const loadData = useCallback(async (selectedYear: string) => {
    setLoading(true);
    try {
      const [resultsResponse, planResponse] = await Promise.all([
        fetch(`${BASE}api/results?annee=${encodeURIComponent(selectedYear)}&niveau=4AM`, { credentials: "include" }),
        fetch(`${BASE}api/orientation/plans/${encodeURIComponent(selectedYear)}`, { credentials: "include" }),
      ]);
      if (!resultsResponse.ok || !planResponse.ok) throw new Error("تعذر تحميل بيانات التوجيه");
      const [resultsData, planData] = await Promise.all([
        resultsResponse.json() as Promise<StudentResult[]>,
        planResponse.json() as Promise<OrientationPlan>,
      ]);
      setResults(resultsData);
      setPlan(planData);
    } catch (error) {
      toast({
        title: "تعذر تحميل دورة التوجيه",
        description: error instanceof Error ? error.message : "حدث خطأ أثناء تحميل البيانات",
        variant: "destructive",
      });
      setResults([]);
      setPlan(emptyPlan(selectedYear));
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
    if (!plan.destinations.length) {
      toast({ title: "أضف ثانوية واحدة على الأقل قبل الاعتماد", variant: "destructive" });
      return;
    }
    if (!window.confirm(`سيتم تثبيت توجيه ${proposedAssignments.length} تلميذاً للسنة ${year} ومنع تعديل الخريطة. هل تريد المتابعة؟`)) return;

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
            <p className="mt-2 text-xs text-muted-foreground">حدد المقاعد المتاحة لكل جذع في الثانويات المستقبلة.</p>
          </div>
          {plan.status === "published" && <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700"><LockKeyhole className="h-3.5 w-3.5" /> معتمد ونهائي</span>}
        </CardHeader>
        <CardContent className="space-y-3">
          {plan.destinations.map((destination, index) => (
            <div key={`${index}-${destination.name}`} className="grid gap-3 rounded-xl border p-3 md:grid-cols-[minmax(180px,1fr)_140px_140px_auto] md:items-end">
              <label className="space-y-1 text-xs font-semibold">
                اسم الثانوية
                <Input disabled={plan.status === "published"} value={destination.name} maxLength={160} onChange={event => updateDestination(index, { name: event.target.value })} placeholder="مثال: ثانوية الشهيد..." />
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
          {plan.status === "draft" && (
            <div className="flex flex-wrap gap-2 pt-2">
              <Button variant="outline" onClick={() => setPlan(current => ({ ...current, destinations: [...current.destinations, { name: "", scienceSeats: 0, artsSeats: 0 }] }))}>
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
                <Button disabled={saving || loading || plan.destinations.length === 0} onClick={() => void publishPlan()}>
                  <Send /> اعتماد النتائج النهائية
                </Button>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <p className="flex items-center gap-2 text-sm font-semibold text-emerald-700"><CheckCircle2 className="h-4 w-4" /> تم الاعتماد {plan.publishedAt ? `في ${new Date(plan.publishedAt).toLocaleDateString("ar-DZ")}` : ""}</p>
                  <Button onClick={downloadRoster}><Download /> تنزيل قوائم Excel</Button>
                </div>
              )}
              <p className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
                بعد الاعتماد، نزّل ملف Excel وأرسله للثانويات المستقبلة أو استورده في حساباتها. النقل الآلي بين حسابات المؤسسات غير مفعّل في النظام حالياً.
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
