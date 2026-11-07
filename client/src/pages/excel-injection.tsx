import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Download, FileSpreadsheet, Loader2, Plus, ShieldCheck, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL;
const YEARS = ["2026-2027", "2025-2026", "2024-2025"];
type SourceRow = { student_id: string | number; name?: string; value: string | number | boolean | null; values?: Record<string, string | number | boolean | null> };
type Mapping = { source: string; target: string };
type Inspection = { worksheetNames: string[]; worksheetName: string; headers: string[]; rows: Array<{ rowNumber: number; studentId: string; name: string }> };

function parsePastedTable(text: string): { rows: SourceRow[]; fields: Array<{ key: string; label: string }> } {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (!lines.length) return { rows: [], fields: [] };
  const delimiter = lines[0]!.includes("\t") ? "\t" : ",";
  const headers = lines[0]!.split(delimiter).map(value => value.trim().toLowerCase());
  const idIndex = headers.findIndex(value => /student[_ ]?id|matricule|رقم/.test(value));
  const nameIndex = headers.findIndex(value => /name|nom|اسم/.test(value));
  const valueIndexes = headers.map((_, index) => index).filter(index => index !== idIndex && index !== nameIndex);
  const fields = valueIndexes.map(index => ({ key: `paste_${index}`, label: headers[index] || `عمود ${index + 1}` }));
  const rows = lines.slice(1).map(line => {
    const cells = line.split(delimiter).map(value => value.trim());
    const values = Object.fromEntries(valueIndexes.map(index => {
      const raw = cells[index] ?? "";
      const numeric = raw === "" ? null : Number(raw.replace(",", "."));
      return [`paste_${index}`, Number.isFinite(numeric) ? numeric : raw];
    }));
    return { student_id: cells[idIndex >= 0 ? idIndex : 0] ?? "", name: cells[nameIndex >= 0 ? nameIndex : 1] ?? "", value: Object.values(values)[0] ?? null, values };
  }).filter(row => String(row.student_id).trim());
  return { rows, fields };
}

export default function ExcelInjectionPage() {
  const { toast } = useToast();
  const [template, setTemplate] = useState<File | null>(null);
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [sourceMode, setSourceMode] = useState<"system" | "source-excel" | "paste">("system");
  const [sourceKind, setSourceKind] = useState<"grades" | "absences">("grades");
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [systemFields, setSystemFields] = useState<Array<{ key: string; label: string }>>([]);
  const [excelRows, setExcelRows] = useState<SourceRow[]>([]);
  const [excelFields, setExcelFields] = useState<Array<{ key: string; label: string }>>([]);
  const [term, setTerm] = useState("");
  const [year, setYear] = useState("2026-2027");
  const [level, setLevel] = useState("");
  const [className, setClassName] = useState("");
  const [systemClasses, setSystemClasses] = useState<string[]>([]);
  const [systemRows, setSystemRows] = useState<SourceRow[]>([]);
  const [pasteText, setPasteText] = useState("");
  const [worksheetName, setWorksheetName] = useState("");
  const [studentIdHeader, setStudentIdHeader] = useState("Matricule");
  const [headerRow, setHeaderRow] = useState("1");
  const [dataStartRow, setDataStartRow] = useState("2");
  const [mappings, setMappings] = useState<Mapping[]>([{ source: "value", target: "" }]);
  const [overwriteExisting, setOverwriteExisting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lastReport, setLastReport] = useState<{ updated: number; skipped: number; total: number; matched: number } | null>(null);
  const [auditDetails, setAuditDetails] = useState<Array<{ student_id: string | number; reason: string; detail: string }>>([]);

  const pastedData = useMemo(() => parsePastedTable(pasteText), [pasteText]);
  const rows = sourceMode === "system" ? systemRows : sourceMode === "source-excel" ? excelRows : pastedData.rows;
  const availableSourceFields = sourceMode === "system" ? systemFields : sourceMode === "source-excel" ? excelFields : pastedData.fields;

  async function extractSource(file: File, kind = sourceKind) {
    const form = new FormData();
    form.append("source", file);
    form.append("mode", kind);
    const response = await fetch(`${BASE}api/excel-injection/extract`, { method: "POST", credentials: "include", body: form });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error ?? "تعذر استخراج البيانات من الملف");
    setExcelRows(payload.rows ?? []);
    setExcelFields(payload.fields ?? []);
  }

  useEffect(() => {
    if (sourceMode !== "system") return;
    fetch(`${BASE}api/excel-injection/school-data?annee=${encodeURIComponent(year)}&kind=${sourceKind}${level ? `&niveau=${encodeURIComponent(level)}` : ""}${className ? `&classe=${encodeURIComponent(className)}` : ""}${term ? `&trimestre=${term}` : ""}`, { credentials: "include" })
      .then(response => response.ok ? response.json() : Promise.reject())
      .then(payload => { setSystemRows(payload.rows ?? []); setSystemFields(payload.fields ?? []); setSystemClasses(payload.classes ?? []); })
      .catch(() => { setSystemRows([]); setSystemFields([]); setSystemClasses([]); });
  }, [sourceMode, sourceKind, year, level, className, term]);

  useEffect(() => {
    if (sourceMode === "source-excel" && sourceFile) extractSource(sourceFile).catch(error => toast({ title: "تعذر قراءة كشف المصدر", description: error.message, variant: "destructive" }));
  }, [sourceMode, sourceFile, sourceKind]);

  useEffect(() => {
    if (!availableSourceFields.length) return;
    setMappings(current => current.map(mapping => availableSourceFields.some(field => field.label === mapping.source)
      ? mapping
      : { ...mapping, source: availableSourceFields[0]!.label }));
  }, [availableSourceFields]);

  async function inspect(file: File, selectedWorksheet = worksheetName, selectedIdHeader = studentIdHeader, selectedHeaderRow = headerRow, selectedDataStartRow = dataStartRow) {
    setTemplate(file);
    const form = new FormData();
    form.append("template", file);
    form.append("worksheetName", selectedWorksheet);
    form.append("headerRow", selectedHeaderRow);
    form.append("dataStartRow", selectedDataStartRow);
    form.append("studentIdHeader", selectedIdHeader);
    const response = await fetch(`${BASE}api/excel-injection/inspect`, { method: "POST", credentials: "include", body: form });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error ?? "تعذر قراءة القالب");
    setInspection(payload);
    setWorksheetName(payload.worksheetName ?? "");
    if (payload.studentIdHeader) setStudentIdHeader(payload.studentIdHeader);
    setStudentIdHeader(payload.studentIdHeader ?? payload.headers?.find((header: string) => /matricule|رقم/.test(header.toLowerCase())) ?? "");
    setMappings(current => current.map((mapping, index) => index === 0 ? { ...mapping, target: payload.headers?.find((header: string) => header !== studentIdHeader) ?? "" } : mapping));
  }

  function updateMapping(index: number, key: keyof Mapping, value: string) {
    setMappings(current => current.map((mapping, itemIndex) => itemIndex === index ? { ...mapping, [key]: value } : mapping));
  }

  const normalizedIds = new Set(rows.map(row => String(row.student_id).trim().toUpperCase()));
  const templateIds = inspection?.rows ?? [];
  const missingTemplateIds = templateIds.filter(row => !normalizedIds.has(row.studentId.trim().toUpperCase()));
  const matchedSourceCount = rows.filter(row => templateIds.some(templateRow => templateRow.studentId.trim().toUpperCase() === String(row.student_id).trim().toUpperCase())).length;
  const valueForMapping = (row: SourceRow, label: string) => {
    const field = availableSourceFields.find(item => item.label === label);
    if (!field) return null;
    return field.key === "value" ? row.value : row.values?.[field.key] ?? null;
  };

  async function inject() {
    if (!template || !inspection) { toast({ title: "ارفع قالب Excel أولاً", variant: "destructive" }); return; }
    if (mappings.some(mapping => !mapping.source || !mapping.target)) { toast({ title: "أكمل ربط الأعمدة", variant: "destructive" }); return; }
    if (new Set(mappings.map(mapping => mapping.target)).size !== mappings.length) { toast({ title: "اختر عمودًا مختلفًا لكل حقل", variant: "destructive" }); return; }
    const targetColumns = Object.fromEntries(mappings.map(mapping => [mapping.source, mapping.target]));
    const normalizedRows = rows.map(row => {
      const values = Object.fromEntries(availableSourceFields.map(field => [field.label, field.key === "value" ? row.value : row.values?.[field.key] ?? null]).filter(([, value]) => value !== null && value !== undefined));
      return { ...row, value: values[mappings[0]!.source] ?? row.value, values };
    });
    setBusy(true);
    try {
      const form = new FormData();
      form.append("template", template);
      form.append("studentsJson", JSON.stringify(normalizedRows));
      form.append("optionsJson", JSON.stringify({ worksheetName: inspection.worksheetName, studentIdHeader, targetColumns, headerRow: Number(headerRow) || 1, dataStartRow: Number(dataStartRow) || 2, overwriteExisting }));
      const response = await fetch(`${BASE}api/excel-injection`, { method: "POST", credentials: "include", body: form });
      if (!response.ok) { const payload = await response.json().catch(() => ({})); throw new Error(payload.error ?? `HTTP ${response.status}`); }
      const blob = await response.blob();
      const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `injected-${Date.now()}.xlsx`; link.click(); URL.revokeObjectURL(link.href);
      const report = { updated: Number(response.headers.get("x-excel-updated-students") ?? 0), skipped: Number(response.headers.get("x-excel-skipped") ?? 0), total: templateIds.length, matched: matchedSourceCount };
      setLastReport(report);
      const encodedAudit = response.headers.get("x-excel-skip-report");
      setAuditDetails(encodedAudit ? JSON.parse(decodeURIComponent(encodedAudit)) : []);
      toast({ title: "تم تنزيل الملف", description: `تم حقن بيانات ${report.updated} من أصل ${report.total} تلميذ. مطابقة المصدر مع القالب: ${matchedSourceCount}.` });
    } catch (error) { toast({ title: "فشل الحقن", description: error instanceof Error ? error.message : "تعذر معالجة الملف", variant: "destructive" }); }
    finally { setBusy(false); }
  }

  return (
    <main dir="rtl" className="mx-auto max-w-6xl space-y-6 p-6">
      <header className="flex items-start gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg"><FileSpreadsheet className="h-5 w-5" /></div><div><h1 className="text-2xl font-extrabold">حقن البيانات في Excel</h1><p className="mt-1 text-sm text-muted-foreground">ارفع القالب، اختر مصدر البيانات، راجع المطابقة، ثم نزّل نسخة جديدة دون تغيير تصميم القالب.</p></div></header>

      <Card><CardHeader><CardTitle className="text-base">1. قالب Excel والكشف التلقائي</CardTitle></CardHeader><CardContent className="grid gap-4 md:grid-cols-4"><label className="space-y-2 text-sm font-semibold md:col-span-2">القالب (.xlsx)<Input type="file" accept=".xlsx" onChange={event => { const file = event.target.files?.[0]; if (file) inspect(file).catch(error => toast({ title: "فشل قراءة القالب", description: error.message, variant: "destructive" })); }} /></label><label className="space-y-2 text-sm">صف العناوين<Input type="number" min="1" value={headerRow} onChange={event => setHeaderRow(event.target.value)} /></label><label className="space-y-2 text-sm">أول صف بيانات<Input type="number" min="2" value={dataStartRow} onChange={event => setDataStartRow(event.target.value)} /></label>{template && <p className="text-xs text-muted-foreground md:col-span-4">{template.name} · {inspection ? `${inspection.headers.length} أعمدة، ${inspection.rows.length} صفوف مقروءة` : "جارٍ الكشف…"}</p>}</CardContent></Card>
      {inspection && <Card><CardContent className="grid gap-3 p-4 md:grid-cols-[1fr_1fr_auto]"><label className="text-sm">ورقة القالب<select value={worksheetName} onChange={event => { if (template) inspect(template, event.target.value).catch(error => toast({ title: "فشل قراءة الورقة", description: error.message, variant: "destructive" })); }} className="mt-1 h-9 w-full rounded-md border bg-background px-2">{inspection.worksheetNames.map(name => <option key={name}>{name}</option>)}</select></label><label className="text-sm">عمود Matricule المكتشف<select value={studentIdHeader} onChange={event => { const value = event.target.value; setStudentIdHeader(value); if (template) inspect(template, worksheetName, value).catch(error => toast({ title: "فشل قراءة عمود التسجيل", description: error.message, variant: "destructive" })); }} className="mt-1 h-9 w-full rounded-md border bg-background px-2">{inspection.headers.map(header => <option key={header}>{header}</option>)}</select></label><Button variant="outline" className="self-end" onClick={() => template && inspect(template, worksheetName, studentIdHeader, headerRow, dataStartRow).catch(error => toast({ title: "فشل إعادة الكشف", description: error.message, variant: "destructive" }))}>إعادة كشف العناوين</Button></CardContent></Card>}

      <div className="flex flex-wrap gap-2" role="group" aria-label="مصدر بيانات الحقن">
        <Button variant={sourceMode === "system" ? "default" : "outline"} onClick={() => setSourceMode("system")}>بيانات النظام</Button>
        <Button variant={sourceMode === "source-excel" ? "default" : "outline"} onClick={() => setSourceMode("source-excel")}>رفع كشف Excel</Button>
        <Button variant={sourceMode === "paste" ? "default" : "outline"} onClick={() => setSourceMode("paste")}>لصق جدول</Button>
      </div>

      {sourceMode === "source-excel" && <Card>
        <CardHeader><CardTitle className="text-base">2. كشف الدرجات أو الغيابات</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <label className="text-sm">نوع الكشف<select value={sourceKind} onChange={event => setSourceKind(event.target.value as "grades" | "absences")} className="mt-1 h-9 w-full rounded-md border bg-background px-2"><option value="grades">درجات</option><option value="absences">غيابات</option></select></label>
          <label className="text-sm md:col-span-2">ملف المصدر (.xlsx)<Input type="file" accept=".xlsx" onChange={event => setSourceFile(event.target.files?.[0] ?? null)} /></label>
          {sourceFile && <p className="text-xs text-muted-foreground md:col-span-3">{sourceFile.name} · {excelRows.length} تلميذ · {excelFields.length} حقول مكتشفة</p>}
        </CardContent>
      </Card>}

      {sourceMode !== "source-excel" && <Card>
        <CardHeader><CardTitle className="text-base">2. مصدر البيانات</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button variant={sourceMode === "system" ? "default" : "outline"} onClick={() => setSourceMode("system")}>بيانات النظام</Button>
            <Button variant={sourceMode === "paste" ? "default" : "outline"} onClick={() => setSourceMode("paste")}>لصق جدول</Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant={sourceKind === "grades" ? "secondary" : "ghost"} onClick={() => setSourceKind("grades")}>درجات</Button>
            <Button size="sm" variant={sourceKind === "absences" ? "secondary" : "ghost"} onClick={() => setSourceKind("absences")}>غيابات</Button>
          </div>
          {sourceMode === "system" && <div className="grid gap-3 md:grid-cols-4">
            <label className="text-sm">السنة<select value={year} onChange={event => setYear(event.target.value)} className="mt-1 h-9 w-full rounded-md border bg-background px-2">{YEARS.map(value => <option key={value}>{value}</option>)}</select></label>
            <label className="text-sm">المستوى<select value={level} onChange={event => { setLevel(event.target.value); setClassName(""); }} className="mt-1 h-9 w-full rounded-md border bg-background px-2"><option value="">كل المستويات</option>{["1AM", "2AM", "3AM", "4AM", "1AS", "2AS", "3AS"].map(value => <option key={value}>{value}</option>)}</select></label>
            <label className="text-sm">القسم<select value={className} onChange={event => setClassName(event.target.value)} className="mt-1 h-9 w-full rounded-md border bg-background px-2"><option value="">كل الأقسام</option>{systemClasses.map(value => <option key={value}>{value}</option>)}</select></label>
            {sourceKind === "grades" && <label className="text-sm">الفصل<select value={term} onChange={event => setTerm(event.target.value)} className="mt-1 h-9 w-full rounded-md border bg-background px-2"><option value="">كل الفصول</option><option value="1">الفصل الأول</option><option value="2">الفصل الثاني</option><option value="3">الفصل الثالث</option></select></label>}
          </div>}
          {sourceMode === "paste" && <label className="block text-sm">الصق جدولًا من Excel أو CSV<textarea value={pasteText} onChange={event => setPasteText(event.target.value)} placeholder="Matricule\tالاسم\tالعلامة\n2023001\tأحمد\t15" className="mt-1 min-h-32 w-full rounded-xl border bg-muted/20 p-3 font-mono text-xs" dir="ltr" /></label>}
          <p className="text-xs text-muted-foreground">عدد السجلات الجاهزة: {rows.length}</p>
        </CardContent>
      </Card>}

      <Card><CardHeader><CardTitle className="text-base">3. ربط الحقول بالأعمدة</CardTitle></CardHeader><CardContent className="space-y-3"><div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]"><label className="text-sm">عمود Matricule<select value={studentIdHeader} onChange={event => { const value = event.target.value; setStudentIdHeader(value); if (template) inspect(template, worksheetName, value).catch(error => toast({ title: "فشل قراءة عمود التسجيل", description: error.message, variant: "destructive" })); }} className="mt-1 h-9 w-full rounded-md border bg-background px-2">{(inspection?.headers ?? []).map(header => <option key={header}>{header}</option>)}</select></label><span className="text-sm text-muted-foreground md:col-span-2 md:self-end">تم الكشف تلقائيًا عن {inspection?.headers.length ?? 0} عمود</span></div>{mappings.map((mapping, index) => <div key={index} className="grid gap-3 rounded-xl border bg-muted/20 p-3 md:grid-cols-[1fr_1fr_auto]"><label className="text-sm">حقل المصدر<select value={mapping.source} onChange={event => updateMapping(index, "source", event.target.value)} className="mt-1 h-9 w-full rounded-md border bg-background px-2">{availableSourceFields.map(field => <option key={field.key} value={field.label}>{field.label}</option>)}</select></label><label className="text-sm">عمود Excel<select value={mapping.target} onChange={event => updateMapping(index, "target", event.target.value)} className="mt-1 h-9 w-full rounded-md border bg-background px-2"><option value="">اختر العمود</option>{(inspection?.headers ?? []).filter(header => header !== studentIdHeader).map(header => <option key={header}>{header}</option>)}</select></label><Button variant="ghost" size="icon" className="self-end" disabled={mappings.length === 1} onClick={() => setMappings(current => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 className="h-4 w-4" /></Button></div>)}<Button variant="outline" size="sm" onClick={() => { const nextField = availableSourceFields.find(field => !mappings.some(mapping => mapping.source === field.label)); if (nextField) setMappings(current => [...current, { source: nextField.label, target: "" }]); else toast({ title: "كل الحقول مضافة", description: "اختر مصدرًا آخر لإضافة حقول جديدة" }); }}><Plus className="ml-1 h-4 w-4" /> إضافة عمود آخر</Button><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={overwriteExisting} onChange={event => setOverwriteExisting(event.target.checked)} /> استبدال القيم الموجودة</label></CardContent></Card>

      {inspection && <div className={`rounded-xl border p-3 text-sm ${rows.length - matchedSourceCount || missingTemplateIds.length ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-100" : "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-100"}`}>
        تمت مطابقة {matchedSourceCount} من {templateIds.length} تلميذ في القالب. {rows.length - matchedSourceCount > 0 && `من المصدر غير موجودين في القالب: ${rows.filter(row => !templateIds.some(item => item.studentId.trim().toUpperCase() === String(row.student_id).trim().toUpperCase())).map(row => row.student_id).join("، ")}.`} {missingTemplateIds.length > 0 && `لا توجد بيانات مصدر للأرقام: ${missingTemplateIds.slice(0, 30).map(row => row.studentId).join("، ")}${missingTemplateIds.length > 30 ? "، …" : ""}.`}
      </div>}

      <Card><CardHeader><CardTitle className="text-base">4. المعاينة والتدقيق</CardTitle></CardHeader><CardContent className="space-y-3"><div className="overflow-x-auto rounded-lg border"><table className="w-full text-sm"><thead className="bg-muted/50"><tr><th className="p-2 text-right">Matricule</th><th className="p-2 text-right">الاسم</th>{mappings.map(mapping => <th key={mapping.source} className="p-2 text-right">{mapping.source}</th>)}<th className="p-2 text-right">الحالة</th></tr></thead><tbody>{rows.slice(0, 4).map(row => { const matched = templateIds.some(item => item.studentId.trim().toUpperCase() === String(row.student_id).trim().toUpperCase()); return <tr key={String(row.student_id)} className="border-t"><td className="p-2 font-mono">{row.student_id}</td><td className="p-2">{row.name ?? "—"}</td>{mappings.map(mapping => <td key={mapping.source} className="p-2">{valueForMapping(row, mapping.source) ?? "—"}</td>)}<td className={`p-2 ${matched ? "text-emerald-600" : "text-red-600"}`}>{matched ? "مطابق" : "غير موجود في القالب"}</td></tr>; })}</tbody></table></div><div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200"><ShieldCheck className="h-4 w-4 shrink-0" />الصيغ والخلايا المدمجة محمية ولن تُستبدل.</div><Button onClick={inject} disabled={busy || !inspection || !rows.length} className="w-full bg-emerald-600 text-white hover:bg-emerald-700">{busy ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Download className="ml-2 h-4 w-4" />}{busy ? "جارٍ تجهيز الملف…" : "حقن البيانات وتنزيل Excel"}</Button>{lastReport && <><p className="text-center text-sm">تم حقن بيانات {lastReport.updated} من أصل {lastReport.total} تلميذ. المصدر طابق {lastReport.matched} تلميذًا، وتخطي {lastReport.skipped} خلية.</p>{auditDetails.length > 0 && <div className="max-h-40 overflow-y-auto rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-200"><p className="mb-2 font-bold">تفاصيل المطابقة والتخطي:</p>{auditDetails.map((item, index) => <p key={index} className="border-b border-red-200/50 py-1 last:border-0">{item.student_id || "بدون رقم"}: {item.detail} ({item.reason})</p>)}</div>}</>}</CardContent></Card><div className="flex gap-2 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800 dark:border-blue-900/50 dark:bg-blue-950/20 dark:text-blue-200"><AlertTriangle className="h-5 w-5 shrink-0" />يتم إنشاء نسخة جديدة؛ الملف الأصلي لا يتغير.</div>
    </main>
  );
}
