import { useState } from "react";
import { AlertTriangle, Calculator, CheckCircle2, ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { assessOrientationCase, parseOrientationCase, type OrientationAssessment, type OrientationCaseInput } from "@/lib/4am-orientation";

const SAMPLE_JSON = JSON.stringify({
  student_info: { student_id: "STU-001", name: "اسم التلميذ", desired_stream: "SCIENCE_TECH" },
  annual_subject_averages: {
    math: 12.5,
    physics: 11,
    natural_science: 13.5,
    arabic: 14,
    french: 10.5,
    english: 11,
    history_geo: 12,
  },
  annual_general_average: 12.21,
  bem_exam_average: 11.8,
  remedial_scores: { math: null, physics: null },
}, null, 2);

function Score({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="border-s-2 border-muted px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-bold tabular-nums">{value === null ? "—" : value.toFixed(2)} {value !== null && <span className="text-xs font-normal text-muted-foreground">/ 20</span>}</p>
    </div>
  );
}

export default function OrientationCaseCalculator() {
  const [json, setJson] = useState("");
  const [caseData, setCaseData] = useState<OrientationCaseInput | null>(null);
  const [assessment, setAssessment] = useState<OrientationAssessment | null>(null);
  const [error, setError] = useState("");
  const [appealWindow, setAppealWindow] = useState(0.5);
  const [seatCutoffInput, setSeatCutoffInput] = useState("");

  const calculate = () => {
    try {
      const parsed = parseOrientationCase(JSON.parse(json));
      setCaseData(parsed);
      const cutoff = seatCutoffInput.trim() === "" ? null : Number(seatCutoffInput);
      if (cutoff !== null && (!Number.isFinite(cutoff) || cutoff < 0 || cutoff > 20)) {
        throw new Error("عتبة آخر مقعد يجب أن تكون بين 0 و20.");
      }
      setAssessment(assessOrientationCase(parsed, cutoff));
      setError("");
    } catch (cause) {
      setCaseData(null);
      setAssessment(null);
      setError(cause instanceof SyntaxError ? "تعذر قراءة JSON. تحقق من الأقواس والفواصل." : cause instanceof Error ? cause.message : "تعذر تحليل البيانات.");
    }
  };

  const appealRecommended = assessment?.desiredStreamEligible === false && assessment.appealDistance !== null && assessment.appealDistance <= appealWindow;
  const remedialMarks = caseData?.remedial_scores;

  return (
    <Card className="border-amber-200/80 dark:border-amber-900/70">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Calculator className="h-4 w-4 text-amber-600" />
          حاسبة التوجيه الفردي — 4AM
        </CardTitle>
        <p className="text-xs text-muted-foreground">التقديرات أدناه إرشادية وليست قرار قبول أو توجيه رسميًا.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <label className="block space-y-2">
          <span className="text-sm font-medium">بيانات الطالب بصيغة JSON</span>
          <textarea
            dir="ltr"
            value={json}
            onChange={event => setJson(event.target.value)}
            placeholder={SAMPLE_JSON}
            spellCheck={false}
            className="min-h-56 w-full resize-y rounded-md border bg-background p-3 font-mono text-xs leading-5 outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="بيانات التلميذ JSON"
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" onClick={calculate} disabled={!json.trim()} className="gap-2">
            <Calculator className="h-4 w-4" /> احسب التقدير
          </Button>
          <Button type="button" variant="outline" onClick={() => setJson(SAMPLE_JSON)}>تحميل مثال</Button>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            عتبة آخر مقعد للشعبة المطلوبة
            <input
              type="number"
              min="0"
              max="20"
              step="0.01"
              value={seatCutoffInput}
              onChange={event => setSeatCutoffInput(event.target.value)}
              className="h-9 w-28 rounded-md border bg-background px-2 text-foreground"
              aria-label="عتبة آخر مقعد للشعبة المطلوبة"
            />
          </label>
        </div>

        {error && (
          <div role="alert" className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
            {error.split("\n").map((message, index) => <p key={index}>{message}</p>)}
          </div>
        )}

        {assessment && caseData && (
          <section aria-live="polite" className="space-y-4 border-t pt-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-bold">{caseData.student_info.name}</p>
                <p className="text-xs text-muted-foreground">رقم التلميذ: {caseData.student_info.student_id}</p>
              </div>
              <span className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold ${assessment.passedToSecondary ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" : "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"}`}>
                {assessment.passedToSecondary ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                {assessment.passedToSecondary ? "معدل النجاح التقديري: 10 أو أكثر" : "معدل النجاح التقديري: أقل من 10"}
              </span>
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              <Score label="المعدل السنوي" value={caseData.annual_general_average} />
              <Score label="معدل BEM" value={caseData.bem_exam_average} />
              <Score label="المعدل النهائي وفق قاعدة التطبيق" value={assessment.finalAverage ?? 0} />
            </div>
            {caseData.bem_exam_average === null && <p className="text-xs text-amber-700 dark:text-amber-400">نتيجة BEM غير متوفرة؛ استُخدم المعدل السنوي مؤقتًا، والنتيجة ليست نهائية.</p>}

            <div className="rounded-md border p-3">
              <div className="flex items-center gap-2">
                <ClipboardCheck className="h-4 w-4 text-amber-600" />
                <h3 className="text-sm font-semibold">تقدير الشعبة المطلوبة: {assessment.desiredStreamLabel}</h3>
              </div>
              <p className={`mt-2 text-sm font-semibold ${assessment.desiredStreamEligible === true ? "text-emerald-700 dark:text-emerald-400" : assessment.desiredStreamEligible === false ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"}`}>
                {assessment.desiredStreamEligible === null
                  ? "أدخل معدل آخر مقعد من ترتيب الدفعـة لتقدير فرصة القبول."
                  : assessment.desiredStreamEligible ? "العلامة تساوي أو تتجاوز عتبة آخر مقعد المُدخلة." : "العلامة دون عتبة آخر مقعد المُدخلة."}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">المعدل العلمي الموزون: {assessment.weightedScienceScore.toFixed(2)} = (رياضيات×4 + فيزياء×3 + علوم طبيعية×3 + المعدل السنوي×2) ÷ 12 · معدل مواد الآداب: {assessment.artsAverage.toFixed(2)}.</p>
              <p className="mt-1 text-xs text-muted-foreground">لا يمكن تحديد مقعد الطالب من علاماته وحدها؛ يعتمد ذلك على ترتيب دفعته والسعة الفعلية. أدخل عتبة آخر مقعد من صفحة النتائج للمقارنة.</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <div className="rounded-md border p-3">
                <h3 className="text-sm font-semibold">علامات الاستدراك</h3>
                {remedialMarks === null ? (
                  <p className="mt-1 text-xs text-muted-foreground">لم يجتز التلميذ الاستدراك.</p>
                ) : (
                  <p className="mt-1 text-sm">الرياضيات: {remedialMarks?.math ?? "—"} · الفيزياء: {remedialMarks?.physics ?? "—"}</p>
                )}
                <p className="mt-1 text-xs text-muted-foreground">تُعرض العلامات كما أُدخلت ولا تغيّر المعدلات المحسوبة؛ قاعدة احتسابها غير محددة في بيانات النظام الحالية.</p>
              </div>
              <label className="space-y-1 text-xs text-muted-foreground">
                <span>نافذة مراجعة الطعن (نقاط)</span>
                <input
                  type="number"
                  min="0"
                  max="5"
                  step="0.1"
                  value={appealWindow}
                  onChange={event => setAppealWindow(Math.max(0, Math.min(5, Number(event.target.value) || 0)))}
                  className="h-9 w-full rounded-md border bg-background px-2 text-foreground sm:w-32"
                  aria-label="نافذة مراجعة الطعن بالنقاط"
                />
              </label>
            </div>

            <div className={`rounded-md border px-3 py-2 text-sm ${appealRecommended ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300" : "bg-muted/40 text-muted-foreground"}`}>
              <p className="font-semibold">مراجعة مجلس الطعن</p>
              <p className="mt-1 text-xs">
                {assessment.desiredStreamEligible === null
                  ? "لا يمكن تقييم الطعن دون عتبة آخر مقعد وترتيب التلميذ في دفعته."
                  : assessment.desiredStreamEligible
                    ? "العلامة تساوي أو تتجاوز العتبة المُدخلة؛ لا يظهر فارق سلبي عنها."
                    : appealRecommended
                      ? `النتيجة قريبة من عتبة آخر مقعد (فارق ${assessment.appealDistance?.toFixed(2)} نقطة). يُنصح بمراجعة الملف والرغبات والنتائج مع المجلس؛ هذا ليس ضمانًا للقبول.`
                      : `الفارق عن عتبة آخر مقعد المُدخلة ${assessment.appealDistance?.toFixed(2)} نقطة، خارج نافذة المراجعة المحددة. يمكن للمجلس مراجعة الملف وفق الإجراءات المحلية.`}
              </p>
              <p className="mt-1 text-[11px]">نافذة المراجعة قيمة إرشادية قابلة للتعديل وليست مهلة أو عتبة رسمية للطعن.</p>
            </div>
          </section>
        )}
      </CardContent>
    </Card>
  );
}
