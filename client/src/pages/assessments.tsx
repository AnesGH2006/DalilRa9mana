import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { CalendarDays, FlaskConical, Loader2, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { MOYEN_SUBJECTS, LYCEE_SUBJECTS } from "@shared/timetable-curriculum";

const BASE = import.meta.env.BASE_URL;
const YEARS = ["2023-2024", "2024-2025", "2025-2026", "2026-2027"];
const DEFAULT_SUBJECTS = [...MOYEN_SUBJECTS, ...LYCEE_SUBJECTS];

interface AssessmentEvent {
  id: string;
  annee: string;
  trimestre: number | null;
  classe: string | null;
  subject: string;
  kind: "test" | "exam" | string;
  title: string;
  eventDate: string;
  startTime: string | null;
  endTime: string | null;
  room: string | null;
  notes: string | null;
}

interface Teacher { id: string; name: string; subjects: string[] }

function emptyForm() {
  return {
    classe: "",
    subject: "",
    kind: "test" as "test" | "exam",
    title: "",
    eventDate: "",
    startTime: "",
    endTime: "",
    room: "",
    notes: "",
    trimestre: "",
  };
}

export default function AssessmentsPage() {
  const { toast } = useToast();
  const [annee, setAnnee] = useState("2026-2027");
  const [events, setEvents] = useState<AssessmentEvent[]>([]);
  const [classes, setClasses] = useState<string[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filterClasse, setFilterClasse] = useState("");
  const [filterKind, setFilterKind] = useState("");
  const [form, setForm] = useState(emptyForm());

  const subjects = useMemo(() => [...new Set([
    ...DEFAULT_SUBJECTS,
    ...teachers.flatMap(teacher => teacher.subjects ?? []),
    ...events.map(event => event.subject).filter(Boolean),
  ])], [teachers, events]);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${BASE}api/assessments?annee=${encodeURIComponent(annee)}`, { credentials: "include" });
      if (res.ok) setEvents(await res.json());
      else toast({ title: "تعذر تحميل المواعيد", variant: "destructive" });
    } finally { setLoading(false); }
  }, [annee, toast]);

  const fetchClasses = useCallback(async () => {
    const res = await fetch(`${BASE}api/timetable/classes?annee=${encodeURIComponent(annee)}`, { credentials: "include" });
    if (res.ok) setClasses(await res.json());
  }, [annee]);

  const fetchTeachers = useCallback(async () => {
    const res = await fetch(`${BASE}api/timetable/teachers`, { credentials: "include" });
    if (res.ok) setTeachers(await res.json());
  }, []);

  useEffect(() => { fetchEvents(); fetchClasses(); fetchTeachers(); }, [fetchEvents, fetchClasses, fetchTeachers]);

  const updateForm = (patch: Partial<ReturnType<typeof emptyForm>>) =>
    setForm(current => ({ ...current, ...patch }));

  const submit = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!form.subject.trim() || !form.title.trim() || !form.eventDate) {
      toast({ title: "أكمل الحقول المطلوبة", description: "المادة والعنوان والتاريخ مطلوبة", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${BASE}api/assessments`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          annee,
          classe: form.classe || null,
          subject: form.subject.trim(),
          kind: form.kind,
          title: form.title.trim(),
          eventDate: form.eventDate,
          startTime: form.startTime || null,
          endTime: form.endTime || null,
          room: form.room || null,
          notes: form.notes || null,
          trimestre: form.trimestre ? Number(form.trimestre) : null,
        }),
      });
      const data = await res.json().catch(() => ({})) as AssessmentEvent & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "تعذر حفظ الموعد");
      setEvents(current => [...current, data].sort((a, b) => `${a.eventDate}${a.startTime ?? "99:99"}`.localeCompare(`${b.eventDate}${b.startTime ?? "99:99"}`)));
      setForm(emptyForm());
      toast({ title: "تمت إضافة الموعد", description: `${data.title} — ${data.eventDate}` });
    } catch (error) {
      toast({ title: "فشل الحفظ", description: error instanceof Error ? error.message : "تعذر الاتصال بالخادم", variant: "destructive" });
    } finally { setSaving(false); }
  };

  const remove = async (id: string) => {
    if (!window.confirm("هل تريد حذف هذا الموعد؟")) return;
    const res = await fetch(`${BASE}api/assessments/${encodeURIComponent(id)}`, { method: "DELETE", credentials: "include" });
    if (res.ok) {
      setEvents(current => current.filter(event => event.id !== id));
      toast({ title: "تم الحذف" });
    } else toast({ title: "فشل الحذف", variant: "destructive" });
  };

  const visibleEvents = events.filter(event =>
    (!filterClasse || event.classe === filterClasse) &&
    (!filterKind || event.kind === filterKind),
  );
  const today = new Date().toISOString().slice(0, 10);
  const kindLabel = (kind: string) => kind === "exam" ? "اختبار" : "فرض";
  const trimestreLabel = (value: number | null) => value === 1 ? "الفصل الأول" : value === 2 ? "الفصل الثاني" : value === 3 ? "الفصل الثالث" : "";

  return (
    <div className="min-h-full bg-dot-grid p-4 md:p-8" dir="rtl">
      <div className="mx-auto max-w-7xl space-y-6">
        <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black text-foreground">الفروض والاختبارات</h1>
            <p className="text-muted-foreground">رزنامة الفروض والاختبارات تظهر للوالدين في صفحة متابعة الأبناء</p>
          </div>
          <Select value={annee} onValueChange={setAnnee}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>{YEARS.map(year => <SelectItem key={year} value={year}>{year}</SelectItem>)}</SelectContent>
          </Select>
        </motion.div>

        <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
          <Card><CardContent className="space-y-4 p-5">
            <div className="flex items-center gap-2">
              <div className="rounded-xl bg-amber-400/10 p-2.5 text-amber-500"><CalendarDays className="h-5 w-5" /></div>
              <div>
                <h2 className="text-base font-bold">إضافة موعد فرض أو اختبار</h2>
                <p className="text-xs text-muted-foreground">يظهر للوالدين في صفحة متابعة الأبناء</p>
              </div>
            </div>
            <form onSubmit={submit} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-xs font-semibold text-muted-foreground">
                  النوع
                  <select value={form.kind} onChange={e => updateForm({ kind: e.target.value as "test" | "exam" })} className="w-full rounded-lg border bg-background px-3 py-2 text-sm">
                    <option value="test">فرض</option>
                    <option value="exam">اختبار</option>
                  </select>
                </label>
                <label className="space-y-1 text-xs font-semibold text-muted-foreground">
                  الفصل الدراسي
                  <select value={form.trimestre} onChange={e => updateForm({ trimestre: e.target.value })} className="w-full rounded-lg border bg-background px-3 py-2 text-sm">
                    <option value="">بدون</option>
                    <option value="1">الفصل الأول</option>
                    <option value="2">الفصل الثاني</option>
                    <option value="3">الفصل الثالث</option>
                  </select>
                </label>
                <label className="space-y-1 text-xs font-semibold text-muted-foreground">
                  المادة
                  <input list="assessment-subjects" value={form.subject} onChange={e => updateForm({ subject: e.target.value })} className="w-full rounded-lg border bg-background px-3 py-2 text-sm" placeholder="مثال: الرياضيات" required />
                  <datalist id="assessment-subjects">{subjects.map(subject => <option key={subject} value={subject} />)}</datalist>
                </label>
                <label className="space-y-1 text-xs font-semibold text-muted-foreground">
                  القسم
                  <select value={form.classe} onChange={e => updateForm({ classe: e.target.value })} className="w-full rounded-lg border bg-background px-3 py-2 text-sm">
                    <option value="">كل الأقسام</option>
                    {classes.map(classe => <option key={classe} value={classe}>{classe}</option>)}
                  </select>
                </label>
                <label className="space-y-1 text-xs font-semibold text-muted-foreground sm:col-span-2">
                  العنوان
                  <input value={form.title} onChange={e => updateForm({ title: e.target.value })} className="w-full rounded-lg border bg-background px-3 py-2 text-sm" placeholder="مثال: فرض الشهر الثاني" required />
                </label>
                <label className="space-y-1 text-xs font-semibold text-muted-foreground">
                  التاريخ
                  <input type="date" value={form.eventDate} onChange={e => updateForm({ eventDate: e.target.value })} className="w-full rounded-lg border bg-background px-3 py-2 text-sm" required />
                </label>
                <label className="space-y-1 text-xs font-semibold text-muted-foreground">
                  القاعة
                  <input value={form.room} onChange={e => updateForm({ room: e.target.value })} className="w-full rounded-lg border bg-background px-3 py-2 text-sm" placeholder="اختياري" />
                </label>
                <label className="space-y-1 text-xs font-semibold text-muted-foreground">
                  من
                  <input type="time" value={form.startTime} onChange={e => updateForm({ startTime: e.target.value })} className="w-full rounded-lg border bg-background px-3 py-2 text-sm" />
                </label>
                <label className="space-y-1 text-xs font-semibold text-muted-foreground">
                  إلى
                  <input type="time" value={form.endTime} onChange={e => updateForm({ endTime: e.target.value })} className="w-full rounded-lg border bg-background px-3 py-2 text-sm" />
                </label>
                <label className="space-y-1 text-xs font-semibold text-muted-foreground sm:col-span-2">
                  ملاحظات
                  <textarea value={form.notes} onChange={e => updateForm({ notes: e.target.value })} className="min-h-20 w-full rounded-lg border bg-background px-3 py-2 text-sm" placeholder="اختياري" />
                </label>
              </div>
              <Button type="submit" disabled={saving} className="w-full gap-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white border-0">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                حفظ الموعد
              </Button>
            </form>
          </CardContent></Card>

          <Card><CardContent className="space-y-4 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold">رزنامة {annee}</h2>
                <p className="text-xs text-muted-foreground">{visibleEvents.length} موعد مسجل</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <select value={filterClasse} onChange={e => setFilterClasse(e.target.value)} className="rounded-lg border bg-background px-2.5 py-1.5 text-xs">
                  <option value="">كل الأقسام</option>
                  {classes.map(classe => <option key={classe} value={classe}>{classe}</option>)}
                </select>
                <select value={filterKind} onChange={e => setFilterKind(e.target.value)} className="rounded-lg border bg-background px-2.5 py-1.5 text-xs">
                  <option value="">الكل</option>
                  <option value="test">فروض</option>
                  <option value="exam">اختبارات</option>
                </select>
              </div>
            </div>
            {loading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
            ) : visibleEvents.length === 0 ? (
              <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                <FlaskConical className="mx-auto mb-3 h-8 w-8 opacity-30" />
                لا توجد مواعيد مسجلة بعد
              </div>
            ) : (
              <div className="space-y-2">
                {visibleEvents.map(event => (
                  <div key={event.id} className={`flex items-start gap-3 rounded-xl border p-3 ${event.eventDate === today ? "border-amber-300 bg-amber-50/70 dark:bg-amber-950/20" : "border-border/60 bg-muted/20"}`}>
                    <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl bg-amber-400/10 text-amber-600 dark:text-amber-300">
                      <span className="text-[10px] font-bold">{event.eventDate.slice(8, 10)}</span>
                      <span className="text-[9px]">{event.eventDate.slice(5, 7)}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold">{event.title}</span>
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-900/40 dark:text-amber-200">{kindLabel(event.kind)}</span>
                        {event.classe && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{event.classe}</span>}
                        {trimestreLabel(event.trimestre) && <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700 dark:bg-blue-900/40 dark:text-blue-200">{trimestreLabel(event.trimestre)}</span>}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {event.subject}{event.startTime ? ` • ${event.startTime}${event.endTime ? ` - ${event.endTime}` : ""}` : ""}{event.room ? ` • ${event.room}` : ""}
                      </div>
                      {event.notes && <div className="mt-1 text-xs text-muted-foreground">{event.notes}</div>}
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => remove(event.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent></Card>
        </div>
      </div>
    </div>
  );
}
