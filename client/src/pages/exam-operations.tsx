import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  CalendarDays, DoorOpen, ShieldCheck, Armchair, Plus, Trash2, Loader2,
  AlertTriangle, RefreshCw, Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL;
const YEARS = ["2023-2024", "2024-2025", "2025-2026", "2026-2027"];
const SESSION_KINDS = [
  { value: "exam", label: "اختبار" },
  { value: "devoir", label: "فرض" },
  { value: "remedial", label: "استدراك" },
  { value: "bemo", label: "شهادة" },
];
const ROOM_TYPES = [
  { value: "classroom", label: "قاعة دراسية" },
  { value: "lab", label: "مخبر" },
  { value: "other", label: "أخرى" },
];

type ExamSession = {
  id: string; annee: string; title: string; kind: string; classe: string | null;
  subject: string | null; examDate: string; startTime: string | null; endTime: string | null;
  durationMinutes: number | null; status: string; notes: string | null;
};
type ExamHall = {
  id: string; annee: string; name: string; capacity: number; building: string | null;
  floor: string | null; roomType: string; isActive: boolean;
};
type Invigilator = {
  id: string; annee: string; sessionId: string; teacherId: string | null; memberId: string | null;
  name: string; subject: string | null; role: string; session?: ExamSession | null;
};
type SeatingAssignment = {
  id: string; sessionId: string; studentId: string; hallId: string; seatNumber: number;
  organizationNumber: string; rowNumber: number | null; columnNumber: number | null;
  student?: { id: string; nomPrenom: string | null; classe: string | null; niveau: string | null } | null;
  hall?: ExamHall | null;
};
type Tab = "sessions" | "halls" | "invigilation" | "seating";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}api${path}`, {
    credentials: "include",
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as any)?.error || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

const emptySession = {
  title: "", kind: "exam", classe: "", subject: "", examDate: "", startTime: "", endTime: "", durationMinutes: "120", status: "draft",
};
const emptyHall = { name: "", capacity: "30", building: "", floor: "", roomType: "classroom", isActive: true };

export default function ExamOperationsPage() {
  const { toast } = useToast();
  const [annee, setAnnee] = useState("2026-2027");
  const [tab, setTab] = useState<Tab>("sessions");
  const [loading, setLoading] = useState(false);

  const [sessions, setSessions] = useState<ExamSession[]>([]);
  const [halls, setHalls] = useState<ExamHall[]>([]);
  const [invigilators, setInvigilators] = useState<Invigilator[]>([]);
  const [sessionForm, setSessionForm] = useState(emptySession);
  const [hallForm, setHallForm] = useState(emptyHall);

  const [invigilationOptions, setInvigilationOptions] = useState({ studentsPerInvigilator: "25", minInvigilators: "2", maxInvigilators: "6", includeChief: true });
  const [invigilationResult, setInvigilationResult] = useState<{ generated: number; unassigned: any[] } | null>(null);

  const [seatingSessionId, setSeatingSessionId] = useState("");
  const [seatingOptions, setSeatingOptions] = useState({ columnsPerRow: "8", keepClassesTogether: true });
  const [seatingResult, setSeatingResult] = useState<{ generated: number; unassigned: any[]; halls: any[]; assignments: SeatingAssignment[] } | null>(null);
  const [seatingAssignments, setSeatingAssignments] = useState<SeatingAssignment[]>([]);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    try { setSessions(await api<ExamSession[]>(`/exams/sessions?annee=${encodeURIComponent(annee)}`)); }
    catch (e: any) { toast({ title: "خطأ", description: e.message, variant: "destructive" }); }
    finally { setLoading(false); }
  }, [annee, toast]);

  const loadHalls = useCallback(async () => {
    setLoading(true);
    try { setHalls(await api<ExamHall[]>(`/exams/halls?annee=${encodeURIComponent(annee)}`)); }
    catch (e: any) { toast({ title: "خطأ", description: e.message, variant: "destructive" }); }
    finally { setLoading(false); }
  }, [annee, toast]);

  const loadInvigilators = useCallback(async () => {
    setLoading(true);
    try { setInvigilators(await api<Invigilator[]>(`/exams/invigilation?annee=${encodeURIComponent(annee)}`)); }
    catch (e: any) { toast({ title: "خطأ", description: e.message, variant: "destructive" }); }
    finally { setLoading(false); }
  }, [annee, toast]);

  const loadSeating = useCallback(async (sessionId: string) => {
    if (!sessionId) { setSeatingAssignments([]); return; }
    setLoading(true);
    try {
      const data = await api<{ assignments: SeatingAssignment[] }>(`/exams/seating?sessionId=${encodeURIComponent(sessionId)}`);
      setSeatingAssignments(data.assignments ?? []);
    } catch (e: any) { toast({ title: "خطأ", description: e.message, variant: "destructive" }); }
    finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { loadSessions(); loadHalls(); }, [loadSessions, loadHalls]);
  useEffect(() => { if (tab === "invigilation") loadInvigilators(); }, [tab, loadInvigilators]);
  useEffect(() => { if (tab === "seating" && seatingSessionId) loadSeating(seatingSessionId); }, [tab, seatingSessionId, loadSeating]);

  const createSession = async () => {
    if (!sessionForm.title.trim() || !sessionForm.examDate) {
      toast({ title: "حقول ناقصة", description: "العنوان والتاريخ مطلوبان", variant: "destructive" });
      return;
    }
    try {
      await api("/exams/sessions", { method: "POST", body: JSON.stringify({ ...sessionForm, annee, durationMinutes: Number(sessionForm.durationMinutes) || null }) });
      setSessionForm(emptySession); toast({ title: "تم", description: "تم إنشاء جلسة الاختبار" }); loadSessions();
    } catch (e: any) { toast({ title: "خطأ", description: e.message, variant: "destructive" }); }
  };
  const deleteSession = async (id: string) => {
    if (!window.confirm("حذف هذه الجلسة؟")) return;
    try { await api(`/exams/sessions/${id}`, { method: "DELETE" }); loadSessions(); }
    catch (e: any) { toast({ title: "خطأ", description: e.message, variant: "destructive" }); }
  };

  const createHall = async () => {
    const capacity = Number(hallForm.capacity);
    if (!hallForm.name.trim() || !Number.isInteger(capacity) || capacity <= 0) {
      toast({ title: "حقول ناقصة", description: "الاسم والطاقة مطلوبان", variant: "destructive" });
      return;
    }
    try {
      await api("/exams/halls", { method: "POST", body: JSON.stringify({ ...hallForm, annee, capacity }) });
      setHallForm(emptyHall); toast({ title: "تم", description: "تم إنشاء القاعة" }); loadHalls();
    } catch (e: any) { toast({ title: "خطأ", description: e.message, variant: "destructive" }); }
  };
  const deleteHall = async (id: string) => {
    if (!window.confirm("حذف هذه القاعة؟")) return;
    try { await api(`/exams/halls/${id}`, { method: "DELETE" }); loadHalls(); }
    catch (e: any) { toast({ title: "خطأ", description: e.message, variant: "destructive" }); }
  };

  const generateInvigilation = async () => {
    setLoading(true);
    try {
      const result = await api<{ generated: number; unassigned: any[] }>("/exams/invigilation/generate", {
        method: "POST",
        body: JSON.stringify({
          annee,
          studentsPerInvigilator: Number(invigilationOptions.studentsPerInvigilator) || 25,
          minInvigilators: Number(invigilationOptions.minInvigilators) || 2,
          maxInvigilators: Number(invigilationOptions.maxInvigilators) || 6,
          includeChief: invigilationOptions.includeChief,
        }),
      });
      setInvigilationResult(result); toast({ title: "تم التوزيع", description: `تم إنشاء ${result.generated} مهمة حراسة` }); loadInvigilators();
    } catch (e: any) { toast({ title: "خطأ", description: e.message, variant: "destructive" }); }
    finally { setLoading(false); }
  };

  const generateSeating = async () => {
    if (!seatingSessionId) { toast({ title: "اختر الجلسة", variant: "destructive" }); return; }
    setLoading(true);
    try {
      const result = await api<any>("/exams/seating/generate", {
        method: "POST",
        body: JSON.stringify({
          sessionId: seatingSessionId,
          columnsPerRow: Number(seatingOptions.columnsPerRow) || 8,
          keepClassesTogether: seatingOptions.keepClassesTogether,
        }),
      });
      setSeatingResult(result); toast({ title: "تم التفويج", description: `تم تفويج ${result.generated} تلميذاً` }); loadSeating(seatingSessionId);
    } catch (e: any) { toast({ title: "خطأ", description: e.message, variant: "destructive" }); }
    finally { setLoading(false); }
  };

  const invigilatorsBySession = useMemo(() => {
    const map = new Map<string, Invigilator[]>();
    for (const item of invigilators) {
      const list = map.get(item.sessionId) ?? [];
      list.push(item); map.set(item.sessionId, list);
    }
    return map;
  }, [invigilators]);

  const tabs = [
    { id: "sessions", label: "جلسات الاختبارات", icon: CalendarDays },
    { id: "halls", label: "قاعات الامتحانات", icon: DoorOpen },
    { id: "invigilation", label: "جدول الحراسة", icon: ShieldCheck },
    { id: "seating", label: "تفويج التلاميذ", icon: Armchair },
  ] as const;

  return (
    <div className="min-h-full bg-dot-grid p-4 md:p-8" dir="rtl">
      <div className="mx-auto max-w-7xl space-y-6">
        <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black text-foreground">تنظيم الاختبارات</h1>
            <p className="text-muted-foreground">الحراسة، القاعات، التفويج، والأرقام التنظيمية</p>
          </div>
          <Select value={annee} onValueChange={setAnnee}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>{YEARS.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
          </Select>
        </motion.div>

        <div className="flex flex-wrap gap-2">
          {tabs.map(item => (
            <button key={item.id} onClick={() => setTab(item.id as Tab)}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition ${tab === item.id ? "bg-primary text-primary-foreground shadow" : "bg-card text-muted-foreground hover:text-foreground"}`}>
              <item.icon className="h-4 w-4" /> {item.label}
            </button>
          ))}
        </div>

        {loading && <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> جاري التحميل…</div>}

        {tab === "sessions" && (
          <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
            <Card><CardHeader><CardTitle>إضافة جلسة</CardTitle></CardHeader><CardContent className="space-y-3">
              <Input placeholder="عنوان الاختبار" value={sessionForm.title} onChange={e => setSessionForm(f => ({ ...f, title: e.target.value }))} />
              <Select value={sessionForm.kind} onValueChange={v => setSessionForm(f => ({ ...f, kind: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{SESSION_KINDS.map(k => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}</SelectContent>
              </Select>
              <div className="grid grid-cols-2 gap-2">
                <Input placeholder="القسم (اختياري)" value={sessionForm.classe} onChange={e => setSessionForm(f => ({ ...f, classe: e.target.value }))} />
                <Input placeholder="المادة (اختياري)" value={sessionForm.subject} onChange={e => setSessionForm(f => ({ ...f, subject: e.target.value }))} />
              </div>
              <Input type="date" value={sessionForm.examDate} onChange={e => setSessionForm(f => ({ ...f, examDate: e.target.value }))} />
              <div className="grid grid-cols-3 gap-2">
                <Input type="time" value={sessionForm.startTime} onChange={e => setSessionForm(f => ({ ...f, startTime: e.target.value }))} />
                <Input type="time" value={sessionForm.endTime} onChange={e => setSessionForm(f => ({ ...f, endTime: e.target.value }))} />
                <Input type="number" placeholder="الدقائق" value={sessionForm.durationMinutes} onChange={e => setSessionForm(f => ({ ...f, durationMinutes: e.target.value }))} />
              </div>
              <Select value={sessionForm.status} onValueChange={v => setSessionForm(f => ({ ...f, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="draft">مسودة</SelectItem><SelectItem value="published">منشور</SelectItem><SelectItem value="closed">مغلق</SelectItem></SelectContent>
              </Select>
              <Button className="w-full" onClick={createSession}><Plus className="h-4 w-4" /> إضافة الجلسة</Button>
            </CardContent></Card>

            <Card><CardHeader className="flex-row items-center justify-between"><CardTitle>الجلسات ({sessions.length})</CardTitle><Button variant="outline" size="sm" onClick={loadSessions}><RefreshCw className="h-4 w-4" /></Button></CardHeader><CardContent>
              <div className="space-y-2">
                {sessions.map(session => (
                  <div key={session.id} className="flex items-center justify-between rounded-xl border p-3">
                    <div>
                      <div className="font-bold">{session.title}</div>
                      <div className="text-xs text-muted-foreground">{session.examDate} {session.startTime ?? ""} {session.classe ? `• ${session.classe}` : ""} {session.subject ? `• ${session.subject}` : ""}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{SESSION_KINDS.find(k => k.value === session.kind)?.label ?? session.kind}</Badge>
                      <Button variant="ghost" size="icon" onClick={() => deleteSession(session.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  </div>
                ))}
                {!sessions.length && <p className="text-sm text-muted-foreground">لا توجد جلسات بعد.</p>}
              </div>
            </CardContent></Card>
          </div>
        )}

        {tab === "halls" && (
          <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
            <Card><CardHeader><CardTitle>إضافة قاعة</CardTitle></CardHeader><CardContent className="space-y-3">
              <Input placeholder="اسم القاعة" value={hallForm.name} onChange={e => setHallForm(f => ({ ...f, name: e.target.value }))} />
              <Input type="number" placeholder="الطاقة" value={hallForm.capacity} onChange={e => setHallForm(f => ({ ...f, capacity: e.target.value }))} />
              <div className="grid grid-cols-2 gap-2">
                <Input placeholder="العمارة" value={hallForm.building} onChange={e => setHallForm(f => ({ ...f, building: e.target.value }))} />
                <Input placeholder="الطابق" value={hallForm.floor} onChange={e => setHallForm(f => ({ ...f, floor: e.target.value }))} />
              </div>
              <Select value={hallForm.roomType} onValueChange={v => setHallForm(f => ({ ...f, roomType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{ROOM_TYPES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
              </Select>
              <Button className="w-full" onClick={createHall}><Plus className="h-4 w-4" /> إضافة القاعة</Button>
            </CardContent></Card>

            <Card><CardHeader className="flex-row items-center justify-between"><CardTitle>القاعات ({halls.length})</CardTitle><Button variant="outline" size="sm" onClick={loadHalls}><RefreshCw className="h-4 w-4" /></Button></CardHeader><CardContent>
              <div className="grid gap-2 sm:grid-cols-2">
                {halls.map(hall => (
                  <div key={hall.id} className="rounded-xl border p-3">
                    <div className="flex items-center justify-between">
                      <div className="font-bold">{hall.name}</div>
                      <Button variant="ghost" size="icon" onClick={() => deleteHall(hall.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                    <div className="text-xs text-muted-foreground">الطاقة: {hall.capacity} • {hall.building ?? ""} {hall.floor ? `• طابق ${hall.floor}` : ""}</div>
                  </div>
                ))}
              </div>
              {!halls.length && <p className="text-sm text-muted-foreground">لا توجد قاعات بعد.</p>}
            </CardContent></Card>
          </div>
        )}

        {tab === "invigilation" && (
          <div className="space-y-4">
            <Card><CardHeader><CardTitle>توليد جدول الحراسة</CardTitle></CardHeader><CardContent className="grid gap-3 md:grid-cols-5">
              <Input type="number" placeholder="تلميذ/مراقب" value={invigilationOptions.studentsPerInvigilator} onChange={e => setInvigilationOptions(o => ({ ...o, studentsPerInvigilator: e.target.value }))} />
              <Input type="number" placeholder="أدنى مراقبين" value={invigilationOptions.minInvigilators} onChange={e => setInvigilationOptions(o => ({ ...o, minInvigilators: e.target.value }))} />
              <Input type="number" placeholder="أقصى مراقبين" value={invigilationOptions.maxInvigilators} onChange={e => setInvigilationOptions(o => ({ ...o, maxInvigilators: e.target.value }))} />
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={invigilationOptions.includeChief} onChange={e => setInvigilationOptions(o => ({ ...o, includeChief: e.target.checked }))} /> رئيس لجنة</label>
              <Button onClick={generateInvigilation}><Wand2 className="h-4 w-4" /> توليد</Button>
            </CardContent></Card>

            {invigilationResult?.unassigned?.length ? (
              <Card className="border-amber-500/40"><CardContent className="flex items-center gap-2 p-4 text-amber-600"><AlertTriangle className="h-5 w-5" /> جلسات غير مكتملة: {invigilationResult.unassigned.length}</CardContent></Card>
            ) : null}

            <div className="space-y-3">
              {sessions.map(session => {
                const list = invigilatorsBySession.get(session.id) ?? [];
                if (!list.length) return null;
                return (
                  <Card key={session.id}><CardHeader><CardTitle className="text-base">{session.title} — {session.examDate}</CardTitle></CardHeader><CardContent>
                    <div className="grid gap-2 md:grid-cols-2">
                      {list.map(item => (
                        <div key={item.id} className="flex items-center justify-between rounded-xl border p-3">
                          <div>
                            <div className="font-bold">{item.name}</div>
                            <div className="text-xs text-muted-foreground">{item.subject ?? session.subject ?? ""}</div>
                          </div>
                          <Badge variant={item.role === "chief" ? "default" : "secondary"}>{item.role === "chief" ? "رئيس لجنة" : "مراقب"}</Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent></Card>
                );
              })}
              {!invigilators.length && <Card><CardContent className="p-6 text-center text-muted-foreground"><ShieldCheck className="mx-auto mb-2 h-8 w-8" /> لا توجد مهام حراسة بعد.</CardContent></Card>}
            </div>
          </div>
        )}

        {tab === "seating" && (
          <div className="space-y-4">
            <Card><CardHeader><CardTitle>تفويج التلاميذ</CardTitle></CardHeader><CardContent className="grid gap-3 md:grid-cols-4">
              <Select value={seatingSessionId} onValueChange={setSeatingSessionId}>
                <SelectTrigger><SelectValue placeholder="اختر الجلسة" /></SelectTrigger>
                <SelectContent>{sessions.map(s => <SelectItem key={s.id} value={s.id}>{s.title} — {s.examDate}</SelectItem>)}</SelectContent>
              </Select>
              <Input type="number" placeholder="أعمدة لكل سطر" value={seatingOptions.columnsPerRow} onChange={e => setSeatingOptions(o => ({ ...o, columnsPerRow: e.target.value }))} />
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={seatingOptions.keepClassesTogether} onChange={e => setSeatingOptions(o => ({ ...o, keepClassesTogether: e.target.checked }))} /> تجميع الأقسام</label>
              <Button onClick={generateSeating}><Wand2 className="h-4 w-4" /> توليد التفويج</Button>
            </CardContent></Card>

            {seatingResult?.unassigned?.length ? (
              <Card className="border-amber-500/40"><CardContent className="flex items-center gap-2 p-4 text-amber-600"><AlertTriangle className="h-5 w-5" /> تلاميذ غير مفوّجين: {seatingResult.unassigned.length}</CardContent></Card>
            ) : null}

            {seatingAssignments.length > 0 && (
              <Card><CardHeader><CardTitle>قوائم التفويج ({seatingAssignments.length})</CardTitle></CardHeader><CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b text-muted-foreground"><th className="p-2 text-right">الرقم التنظيمي</th><th className="p-2 text-right">الاسم</th><th className="p-2 text-right">القسم</th><th className="p-2 text-right">القاعة</th><th className="p-2 text-right">المقعد</th><th className="p-2 text-right">السطر</th><th className="p-2 text-right">العمود</th></tr></thead>
                    <tbody>
                      {seatingAssignments.map(item => (
                        <tr key={item.id} className="border-b last:border-0">
                          <td className="p-2 font-mono">{item.organizationNumber}</td>
                          <td className="p-2">{item.student?.nomPrenom ?? item.studentId}</td>
                          <td className="p-2">{item.student?.classe ?? ""}</td>
                          <td className="p-2">{item.hall?.name ?? item.hallId}</td>
                          <td className="p-2">{item.seatNumber}</td>
                          <td className="p-2">{item.rowNumber ?? ""}</td>
                          <td className="p-2">{item.columnNumber ?? ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent></Card>
            )}
            {!seatingAssignments.length && <Card><CardContent className="p-6 text-center text-muted-foreground"><Armchair className="mx-auto mb-2 h-8 w-8" /> اختر جلسة وقم بتوليد التفويج.</CardContent></Card>}
          </div>
        )}
      </div>
    </div>
  );
}
