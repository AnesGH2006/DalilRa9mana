import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HeartPulse, LoaderCircle, ScanLine, Save } from "lucide-react";

const BASE = import.meta.env.BASE_URL;

const MEDICAL_FIELDS = [
  { key: "studentName", label: "اسم التلميذ" },
  { key: "reportDate", label: "تاريخ الشهادة" },
  { key: "doctorName", label: "اسم الطبيب" },
  { key: "facility", label: "المؤسسة الصحية أو العيادة" },
  { key: "diagnosis", label: "التشخيص" },
  { key: "restDays", label: "أيام الراحة" },
  { key: "restFrom", label: "بداية الراحة" },
  { key: "restTo", label: "نهاية الراحة" },
  { key: "sportExemption", label: "الإعفاء من الرياضة" },
  { key: "notes", label: "ملاحظات" },
] as const;

interface MedicalDocument {
  id: string;
  docType: string;
  fields: Record<string, string>;
  createdAt: string;
  createdByName: string | null;
}

export function StudentHealthDialog({ studentId, studentName }: { studentId: string; studentName: string }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [documents, setDocuments] = useState<MedicalDocument[]>([]);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadDocuments = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${BASE}api/documents/by-student/${encodeURIComponent(studentId)}?type=medical_report`, { credentials: "include" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "تعذر تحميل الملف الصحي");
      setDocuments(data.documents ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تحميل الملف الصحي");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) void loadDocuments();
  }, [open, studentId]);

  const scanCertificate = async (file: File) => {
    setScanning(true);
    setError("");
    const form = new FormData();
    form.append("image", file);
    try {
      const response = await fetch(`${BASE}api/documents/ocr?type=medical_report&engine=auto`, {
        method: "POST",
        body: form,
        credentials: "include",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "تعذرت قراءة الشهادة الطبية");
      setFields(data.fields ?? {});
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذرت قراءة الشهادة الطبية");
    } finally {
      setScanning(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const saveDocument = async () => {
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`${BASE}api/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ studentId, docType: "medical_report", fields }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "تعذر حفظ الشهادة الطبية");
      setFields({});
      await loadDocuments();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر حفظ الشهادة الطبية");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5 whitespace-nowrap">
          <HeartPulse className="h-3.5 w-3.5" />
          الملف الصحي
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HeartPulse className="h-5 w-5 text-rose-600" />
            الملف الصحي للتلميذ
          </DialogTitle>
          <DialogDescription>{studentName}</DialogDescription>
        </DialogHeader>

        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">الشهادات الطبية</h3>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={event => {
                const file = event.currentTarget.files?.[0];
                if (file) void scanCertificate(file);
              }}
            />
            <Button type="button" size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={scanning}>
              {scanning ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4" />}
              تصوير شهادة واستخراجها
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            راجع المعلومات المستخرجة قبل الحفظ. لا تُحفظ صورة الشهادة؛ تُحفظ الحقول التي تؤكدها فقط.
          </p>

          {error && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
          {loading ? (
            <p className="py-4 text-center text-sm text-muted-foreground">جارٍ تحميل الملف الصحي...</p>
          ) : documents.length === 0 ? (
            <p className="py-3 text-sm text-muted-foreground">لا توجد شهادات طبية مسجلة.</p>
          ) : (
            <div className="space-y-2">
              {documents.map(document => (
                <details key={document.id} className="rounded-md border px-3 py-2">
                  <summary className="cursor-pointer text-sm font-medium">
                    شهادة طبية · {document.fields.reportDate || new Date(document.createdAt).toLocaleDateString("ar-DZ")}
                  </summary>
                  <dl className="mt-3 grid gap-2 sm:grid-cols-2">
                    {MEDICAL_FIELDS.map(field => document.fields[field.key] ? (
                      <div key={field.key} className="min-w-0">
                        <dt className="text-xs text-muted-foreground">{field.label}</dt>
                        <dd className="break-words text-sm">{document.fields[field.key]}</dd>
                      </div>
                    ) : null)}
                  </dl>
                </details>
              ))}
            </div>
          )}
        </section>

        {Object.keys(fields).length > 0 && (
          <section className="space-y-3 border-t pt-4">
            <div>
              <h3 className="text-sm font-semibold">مراجعة بيانات الشهادة</h3>
              <p className="text-xs text-muted-foreground">يمكنك تعديل أي حقل قبل الحفظ.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {MEDICAL_FIELDS.map(field => (
                <div key={field.key} className="space-y-1.5">
                  <Label htmlFor={`${studentId}-${field.key}`}>{field.label}</Label>
                  <Input
                    id={`${studentId}-${field.key}`}
                    value={fields[field.key] ?? ""}
                    onChange={event => setFields(current => ({ ...current, [field.key]: event.target.value }))}
                  />
                </div>
              ))}
            </div>
            <DialogFooter>
              <Button type="button" onClick={saveDocument} disabled={saving || scanning}>
                {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                حفظ بيانات الشهادة
              </Button>
            </DialogFooter>
          </section>
        )}
      </DialogContent>
    </Dialog>
  );
}