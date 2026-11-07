/**
 * My Child Page — Parent role only
 * Shows the linked student's full academic profile including grades, averages, and absences.
 */
import { useMemo, useState, useEffect } from "react";
import { useLanguage } from "@/contexts/language-provider";
import { useAuth } from "@/hooks/use-auth";
import {
  Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  GraduationCap, BookOpen, Calendar, TrendingUp,
  User, Award, AlertCircle, LogOut, Bell, BellOff, Loader2,
  LayoutDashboard, ClipboardCheck, BarChart3, ChevronLeft, CircleAlert,
  CheckCircle2, Clock3, MoreHorizontal, ArrowUpLeft, Settings2, FileText,
} from "lucide-react";
import { getSubjectsForLevel, calcWeightedAvg } from "@shared/subjects";
import type { Niveau } from "@shared/types";

const BASE = import.meta.env.BASE_URL;

interface StudentData {
  school?: { nom: string; wilaya?: string | null; commune?: string | null };
  student: {
    id: string;
    nomPrenom: string;
    niveau: string;
    classe: string;
    filiere?: import("@shared/subjects").LyceeFiliere | null;
    annee: string;
    sexe: string;
  };
  grades: { id: string; studentId: string; annee: string; trimestre: number; subject: string; score: number; gradeType?: "general" | "continuous" | "test" | "exam" }[];
  absences: { id: string; studentId: string; annee: string; trimestre: number; justifiedHours: number; unjustifiedHours: number }[];
  dailyAbsences?: { id: string; attendanceDate: string; status: string; parentAbsenceReason?: string | null; parentAbsenceReasonAt?: string | null }[];
  dailyAttendanceCount?: number;
  /** Pre-computed by the server using the same logic as /api/results (Ministry averages take precedence). */
  t1Avg: number | null;
  t2Avg: number | null;
  t3Avg: number | null;
  annualAvg: number | null;
}

interface ParentNotification {
  id: string;
  title: string;
  body: string | null;
  type: string;
  read: boolean;
  createdAt: string;
}

const TRIMESTRE_LABELS: Record<number, string> = {
  1: "الفصل الأول",
  2: "الفصل الثاني",
  3: "الفصل الثالث",
};

function calcTrimAvg(grades: StudentData["grades"], trimestre: number, niveau: string, filiere?: StudentData["student"]["filiere"]) {
  const subs = getSubjectsForLevel(niveau as Niveau, filiere ?? undefined);
  const scores: Record<string, number> = {};
  for (const g of grades) {
    if (g.trimestre === trimestre) scores[g.subject] = g.score;
  }
  return calcWeightedAvg(scores, subs);
}

function getGradeColor(score: number): string {
  if (score >= 16) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 10) return "text-blue-600 dark:text-blue-400";
  if (score >= 7)  return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

export default function MyChildPage() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [data, setData] = useState<StudentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [annee, setAnnee] = useState("2026-2027");
  const [leaving, setLeaving] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState("");
  const [activeTab, setActiveTab] = useState("overview");
  const [termFilter, setTermFilter] = useState("all");
  const [absenceReasonDrafts, setAbsenceReasonDrafts] = useState<Record<string, string>>({});
  const [reasonSavingId, setReasonSavingId] = useState<string | null>(null);
  const [reasonError, setReasonError] = useState("");
  const [parentNotifications, setParentNotifications] = useState<ParentNotification[]>([]);
  const [notificationsBusy, setNotificationsBusy] = useState(false);
  const [notificationsError, setNotificationsError] = useState("");

  async function loadParentNotifications() {
    setNotificationsBusy(true);
    setNotificationsError("");
    try {
      const response = await fetch(`${BASE}api/notifications/inbox`, { credentials: "include" });
      const payload = await response.json().catch(() => ({})) as { notifications?: ParentNotification[]; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "تعذر تحميل الإشعارات");
      setParentNotifications(payload.notifications ?? []);
    } catch (loadError) {
      setNotificationsError(loadError instanceof Error ? loadError.message : "تعذر تحميل الإشعارات");
    } finally {
      setNotificationsBusy(false);
    }
  }

  async function markParentNotificationRead(notificationId: string) {
    setNotificationsError("");
    try {
      const response = await fetch(`${BASE}api/notifications/inbox/${encodeURIComponent(notificationId)}/read`, {
        method: "POST",
        credentials: "include",
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "تعذر تحديث الإشعار");
      setParentNotifications(current => current.map(notification =>
        notification.id === notificationId ? { ...notification, read: true } : notification,
      ));
    } catch (readError) {
      setNotificationsError(readError instanceof Error ? readError.message : "تعذر تحديث الإشعار");
    }
  }

  useEffect(() => {
    if (activeTab === "notifications") void loadParentNotifications();
  }, [activeTab]);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    navigator.serviceWorker.ready.then(reg => reg.pushManager.getSubscription())
      .then(subscription => setPushEnabled(!!subscription))
      .catch(() => setPushEnabled(false));
  }, []);

  async function togglePush() {
    setPushBusy(true);
    setPushError("");
    try {
      if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
        throw new Error("هذا المتصفح لا يدعم الإشعارات الفورية");
      }
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      if (existing) {
        await fetch(`${BASE}api/notifications/push-subscription`, {
          method: "DELETE", credentials: "include", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: existing.endpoint }),
        });
        await existing.unsubscribe();
        setPushEnabled(false);
        return;
      }
      const keyResponse = await fetch(`${BASE}api/notifications/vapid-public-key`, { credentials: "include" });
      const keyPayload = keyResponse.headers.get("content-type")?.includes("application/json")
        ? await keyResponse.json().catch(() => null) as { publicKey?: string; error?: string } | null
        : null;
      if (!keyPayload) {
        throw new Error("خادم الإشعارات غير محدّث. أعد تشغيل الخادم أو أعد نشره.");
      }
      if (!keyResponse.ok || !keyPayload.publicKey) {
        throw new Error(keyResponse.status === 503
          ? "الإشعارات غير مهيأة على الخادم. يرجى التواصل مع المسؤول."
          : keyPayload.error ?? "تعذر تحميل مفتاح الإشعارات");
      }
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("يرجى السماح بالإشعارات من إعدادات المتصفح");
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(keyPayload.publicKey) as unknown as BufferSource,
      });
      const response = await fetch(`${BASE}api/notifications/push-subscription`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription }),
      });
      if (!response.ok) throw new Error("تعذر تفعيل الإشعارات");
      setPushEnabled(true);
    } catch (error: any) {
      setPushError(error?.message ?? "تعذر تغيير إعداد الإشعارات");
    } finally {
      setPushBusy(false);
    }
  }

  useEffect(() => {
    setLoading(true);
    fetch(`${BASE}api/my-child?annee=${encodeURIComponent(annee)}`, { credentials: "include" })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(String(e)); setLoading(false); });
  }, [annee]);

  const student = data?.student;
  const grades = data?.grades ?? [];
  const absences = data?.absences ?? [];
  const { subs, trimesterGrades, t1Avg, t2Avg, t3Avg, annualAvg, totalJustified, totalUnjustified } = useMemo(() => {
    const subjects = student ? getSubjectsForLevel(student.niveau as Niveau, student.filiere ?? undefined) : [];
    const averages = student ? [
      data?.t1Avg ?? calcTrimAvg(grades, 1, student.niveau, student.filiere),
      data?.t2Avg ?? calcTrimAvg(grades, 2, student.niveau, student.filiere),
      data?.t3Avg ?? calcTrimAvg(grades, 3, student.niveau, student.filiere),
    ] : [null, null, null];
    const availableAverages = averages.filter((value): value is number => value !== null);
    const groupedGrades = new Map<number, Map<string, number>>();
    for (const grade of grades) {
      if (!groupedGrades.has(grade.trimestre)) groupedGrades.set(grade.trimestre, new Map());
      groupedGrades.get(grade.trimestre)!.set(grade.subject, grade.score);
    }

    return {
      subs: subjects,
      trimesterGrades: groupedGrades,
      t1Avg: averages[0],
      t2Avg: averages[1],
      t3Avg: averages[2],
      annualAvg: data?.annualAvg ?? (availableAverages.length > 0
        ? availableAverages.reduce((sum, value) => sum + value, 0) / availableAverages.length
        : null),
      totalJustified: absences.reduce((sum, absence) => sum + (absence.justifiedHours ?? 0), 0),
      totalUnjustified: absences.reduce((sum, absence) => sum + (absence.unjustifiedHours ?? 0), 0),
    };
  }, [absences, data?.annualAvg, data?.t1Avg, data?.t2Avg, data?.t3Avg, grades, student?.niveau, student?.filiere]);

  const memberCtx = user?.memberContext;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-64 text-muted-foreground gap-3">
        <GraduationCap className="w-10 h-10 animate-pulse opacity-40" />
        <span className="text-sm">جارٍ تحميل البيانات…</span>
      </div>
    );
  }

  if (error || !student) {
    return (
      <div
        className="flex flex-col items-center justify-center min-h-64 gap-4 text-muted-foreground"
      >
        <AlertCircle className="w-12 h-12 text-amber-500 opacity-70" />
        <p className="text-sm text-center">
          {memberCtx?.linkedStudentId ? "حدث خطأ أثناء تحميل البيانات" : "لا يوجد تلميذ مرتبط بحسابك. تواصل مع مدير المدرسة."}
        </p>
      </div>
    );
  }

  const loadedStudent = student;
  const isPassed = annualAvg !== null ? annualAvg >= 10 : null;

  async function leaveParentMode() {
    setLeaving(true);
    try {
      await fetch(`${BASE}api/members/self`, { method: "DELETE", credentials: "include" });
    } finally {
      window.location.href = "/";
    }
  }

  function urlBase64ToUint8Array(value: string): Uint8Array {
    const padding = "=".repeat((4 - value.length % 4) % 4);
    const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
    return Uint8Array.from(atob(base64), char => char.charCodeAt(0));
  }

  function selectTab(tabId: string) {
    setActiveTab(tabId);
    requestAnimationFrame(() => document.getElementById(`parent-${tabId}`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  async function submitAbsenceReason(absenceId: string, savedReason?: string | null) {
    const reason = (absenceReasonDrafts[absenceId] ?? savedReason ?? "").trim();
    if (reason.length < 3) {
      setReasonError("يرجى كتابة سبب الغياب (3 أحرف على الأقل).");
      return;
    }
    setReasonSavingId(absenceId);
    setReasonError("");
    try {
      const response = await fetch(`${BASE}api/my-child/absences/${encodeURIComponent(absenceId)}/reason`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, annee }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "تعذر إرسال سبب الغياب");
      setData(current => current ? {
        ...current,
        dailyAbsences: current.dailyAbsences?.map(absence => absence.id === absenceId
          ? { ...absence, parentAbsenceReason: reason, parentAbsenceReasonAt: new Date().toISOString() }
          : absence),
      } : current);
      setAbsenceReasonDrafts(current => ({ ...current, [absenceId]: reason }));
    } catch (error) {
      setReasonError(error instanceof Error ? error.message : "تعذر إرسال سبب الغياب");
    } finally {
      setReasonSavingId(null);
    }
  }

  function getAbsenceTerm(date: string): number {
    const month = new Date(`${date}T00:00:00`).getMonth() + 1;
    return month >= 9 ? 1 : month <= 3 ? 2 : 3;
  }

  const tabItems = [
    { id: "overview", label: "نظرة عامة", icon: LayoutDashboard },
    { id: "attendance", label: "الغيابات", icon: ClipboardCheck },
    { id: "grades", label: "الدرجات", icon: GraduationCap },
    { id: "notifications", label: "الإشعارات", icon: Bell },
  ];
  const displayName = loadedStudent.nomPrenom || "أحمد بن علي";
  const initials = displayName.split(" ").map(part => part[0]).slice(0, 2).join("");
  const schoolName = data.school?.nom || "المؤسسة التعليمية";
  const absenceRecords = absences.filter(absence => absence.justifiedHours > 0 || absence.unjustifiedHours > 0);
  const dailyAbsences = data.dailyAbsences ?? [];
  const visibleDailyAbsences = termFilter === "all"
    ? dailyAbsences
    : dailyAbsences.filter(absence => getAbsenceTerm(absence.attendanceDate) === Number(termFilter));
  const visibleAbsenceRecords = termFilter === "all"
    ? absenceRecords
    : absenceRecords.filter(absence => String(absence.trimestre) === termFilter);
  const latestDailyAbsence = dailyAbsences[0];
  const latestAbsence = absenceRecords[absenceRecords.length - 1];
  const totalAbsenceHours = totalJustified + totalUnjustified;
  const dailyAbsenceDays = new Set(dailyAbsences.map(absence => absence.attendanceDate)).size;
  const attendanceRate = (data.dailyAttendanceCount ?? 0) > 0
    ? ((data.dailyAttendanceCount! - dailyAbsenceDays) / data.dailyAttendanceCount!) * 100
    : totalAbsenceHours > 0 ? Math.max(0, 100 - (totalAbsenceHours * 2)) : 100;
  const absenceByTrimester = [1, 2, 3].map(trimestre => {
    const record = absences.find(absence => absence.trimestre === trimestre);
    return (record?.justifiedHours ?? 0) + (record?.unjustifiedHours ?? 0);
  });
  const gradeTypeLabels: Record<string, string> = { general: "درجة", continuous: "تقويم مستمر", test: "فرض", exam: "اختبار" };

  return (
    <div dir="rtl" className="min-h-screen bg-[#0a1020] text-slate-100 font-[Tajawal]">
      <div className="pointer-events-none fixed inset-0 overflow-hidden opacity-60">
        <div className="absolute -top-44 right-1/3 h-[34rem] w-[34rem] rounded-full bg-blue-600/10 blur-3xl" />
        <div className="absolute top-1/2 -left-56 h-[28rem] w-[28rem] rounded-full bg-cyan-500/5 blur-3xl" />
      </div>

      <div className="relative mx-auto flex w-full max-w-[1440px] gap-6 px-4 py-4 sm:px-6 lg:px-8">
        <aside className="hidden w-64 shrink-0 flex-col rounded-[26px] border border-white/10 bg-[#111a2c]/80 p-4 shadow-2xl backdrop-blur-xl lg:flex">
          <div className="flex items-center gap-3 border-b border-white/10 px-3 pb-6">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-400 to-cyan-500 text-lg font-bold text-slate-950 shadow-lg shadow-cyan-500/20">د</div>
            <div>
              <p className="text-sm font-bold tracking-wide">دليل الرقمنة</p>
              <p className="text-[11px] text-slate-400">بوابة الأولياء</p>
            </div>
          </div>
          <nav className="mt-8 space-y-2">
            {tabItems.map(tab => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button key={tab.id} onClick={() => selectTab(tab.id)} className={`group flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-right text-sm transition ${active ? "bg-blue-500/15 text-blue-300 shadow-inner shadow-blue-500/10" : "text-slate-400 hover:bg-white/5 hover:text-slate-100"}`}>
                  <Icon className={`h-[18px] w-[18px] ${active ? "text-cyan-300" : "text-slate-500 group-hover:text-slate-300"}`} />
                  {tab.label}
                  {tab.id === "attendance" && (dailyAbsences.length > 0 || absenceRecords.length > 0) && <span className="mr-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500/15 px-1.5 text-[10px] font-bold text-red-300">{dailyAbsences.length + absenceRecords.length}</span>}
                </button>
              );
            })}
          </nav>
          <div className="mt-auto rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="mb-3 flex items-center justify-between text-xs text-slate-400"><span>السنة الدراسية</span><Settings2 className="h-4 w-4" /></div>
            <p className="text-sm font-bold">{annee}</p>
            <button onClick={leaveParentMode} disabled={leaving} className="mt-4 flex items-center gap-2 text-xs text-slate-500 transition hover:text-amber-300 disabled:opacity-50"><LogOut className="h-3.5 w-3.5" />{leaving ? "جارٍ الخروج…" : "الخروج من وضع الوالدين"}</button>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <header className="mb-7 flex items-center justify-between gap-4 border-b border-white/10 pb-5">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-300/30 bg-gradient-to-br from-blue-400 to-cyan-500 text-sm font-bold text-slate-950 shadow-lg shadow-cyan-500/20">{initials || "أح"}</div>
              <div>
                <p className="text-[11px] font-medium text-slate-500">صباح الخير، ولي أمر</p>
                <h1 className="text-lg font-bold tracking-tight text-white">{displayName}</h1>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={togglePush} disabled={pushBusy} className={`relative flex h-10 w-10 items-center justify-center rounded-xl border transition ${pushEnabled ? "border-cyan-400/30 bg-cyan-400/10 text-cyan-300" : "border-white/10 bg-white/5 text-slate-400 hover:text-white"}`} title="الإشعارات الفورية">
                {pushBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : pushEnabled ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
                <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-emerald-400 ring-2 ring-[#0a1020]" />
              </button>
              <button className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-400 hover:text-white"><MoreHorizontal className="h-5 w-5" /></button>
            </div>
          </header>

          <div className="mb-6 flex gap-2 overflow-x-auto rounded-2xl border border-white/10 bg-[#111a2c]/70 p-1.5 lg:hidden">
            {tabItems.map(tab => <button key={tab.id} onClick={() => selectTab(tab.id)} className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium ${activeTab === tab.id ? "bg-blue-500 text-white" : "text-slate-400"}`}><tab.icon className="h-3.5 w-3.5" />{tab.label}</button>)}
          </div>

          <section id="parent-overview" className="mb-7 scroll-mt-6 grid gap-5 xl:grid-cols-[1.4fr_0.6fr]">
            <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-gradient-to-br from-[#152743] via-[#102039] to-[#10192b] p-6 shadow-2xl shadow-black/20 sm:p-8">
              <div className="absolute -left-12 -top-24 h-64 w-64 rounded-full bg-cyan-400/10 blur-3xl" />
              <div className="relative flex flex-col justify-between gap-8 sm:flex-row sm:items-center">
                <div>
                  <div className="mb-4 flex items-center gap-2 text-xs text-cyan-300"><span className="h-1.5 w-1.5 rounded-full bg-cyan-300" /> الملف الدراسي النشط</div>
                  <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">{displayName}</h2>
                  <p className="mt-2 text-sm text-slate-400">{loadedStudent.niveau} <span className="mx-2 text-slate-600">•</span> {schoolName}</p>
                  <div className="mt-6 flex flex-wrap items-center gap-2 text-xs text-slate-400"><span className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5">القسم {loadedStudent.classe}</span><span className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5">السنة {annee}</span></div>
                </div>
                <div className="flex h-28 w-28 shrink-0 items-center justify-center rounded-[30px] border border-cyan-300/20 bg-gradient-to-br from-cyan-400/20 to-blue-500/20 text-4xl font-bold text-cyan-200 shadow-2xl shadow-cyan-500/10">{initials || "أح"}</div>
              </div>
              <div className="relative mt-8 grid grid-cols-2 gap-3 border-t border-white/10 pt-5 sm:grid-cols-4">
                <div><p className="text-[11px] text-slate-500">نسبة الحضور التقديرية</p><p className="mt-1 text-xl font-bold text-white">{attendanceRate.toFixed(1)}% <span className="text-xs font-medium text-slate-500">حسب الساعات</span></p></div>
                <div><p className="text-[11px] text-slate-500">معدل السنة</p><p className="mt-1 text-xl font-bold text-white">{annualAvg !== null ? annualAvg.toFixed(2) : "—"}<span className="text-xs font-normal text-slate-500"> / 20</span></p></div>
                <div><p className="text-[11px] text-slate-500">غيابات مبررة</p><p className="mt-1 text-xl font-bold text-emerald-300">{totalJustified}<span className="text-xs font-normal text-slate-500"> ساعة</span></p></div>
                <div><p className="text-[11px] text-slate-500">تحتاج انتباهك</p><p className="mt-1 text-xl font-bold text-red-300">{totalUnjustified}<span className="text-xs font-normal text-slate-500"> ساعة</span></p></div>
              </div>
            </div>
            <div className="rounded-[28px] border border-red-400/20 bg-gradient-to-br from-[#2a1828] to-[#161b2b] p-6 shadow-xl shadow-red-950/10">
              <div className="flex items-start justify-between"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-red-500/15 text-red-300"><CircleAlert className="h-5 w-5" /></div><span className="rounded-full bg-red-400/10 px-2.5 py-1 text-[10px] font-bold text-red-300">جديد</span></div>
              <p className="mt-7 text-xs text-red-300/80">{latestDailyAbsence ? "تنبيه غياب يومي" : latestAbsence?.unjustifiedHours ? "تنبيه غياب غير مبرر" : "ملخص الغياب"}</p><h3 className="mt-1 text-lg font-bold text-white">{latestDailyAbsence ? "غياب مسجل" : latestAbsence ? TRIMESTRE_LABELS[latestAbsence.trimestre] : "لا توجد غيابات مسجلة"}</h3><p className="mt-2 text-xs leading-5 text-slate-400">{latestDailyAbsence ? `${new Date(`${latestDailyAbsence.attendanceDate}T00:00:00`).toLocaleDateString("ar-DZ")} · ${latestDailyAbsence.status}` : latestAbsence ? `${latestAbsence.unjustifiedHours} ساعة غير مبررة و${latestAbsence.justifiedHours} ساعة مبررة في هذا الفصل.` : "لم يتم تسجيل غيابات لهذا العام الدراسي."}</p>
              <button onClick={() => selectTab("attendance")} className="mt-5 flex items-center gap-2 text-xs font-bold text-red-200 transition hover:text-white">عرض سجل الغياب <ChevronLeft className="h-4 w-4" /></button>
            </div>
          </section>

          {pushError && <p className="mb-5 rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-xs text-red-200">{pushError}</p>}

          <section id="parent-attendance" className="scroll-mt-6 grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
            <div className="rounded-[26px] border border-white/10 bg-[#111a2c]/85 p-5 shadow-xl shadow-black/10 sm:p-6">
              <div className="mb-6 flex items-center justify-between"><div><p className="text-xs text-slate-500">تحديثات اليوم</p><h2 className="mt-1 text-xl font-bold text-white">سجل الحضور والغياب</h2></div><button onClick={() => selectTab("attendance")} className="flex items-center gap-1 text-xs text-cyan-300 hover:text-cyan-200">كل السجلات <ChevronLeft className="h-4 w-4" /></button></div>
              <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="تصفية الغيابات حسب الفصل">
                {[{ value: "all", label: "كل الفصول" }, { value: "1", label: "الفصل الأول" }, { value: "2", label: "الفصل الثاني" }, { value: "3", label: "الفصل الثالث" }].map(term => <button key={term.value} type="button" aria-pressed={termFilter === term.value} onClick={() => setTermFilter(term.value)} className={`rounded-lg border px-3 py-2 text-xs transition ${termFilter === term.value ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-200" : "border-white/10 text-slate-400 hover:bg-white/5 hover:text-white"}`}>{term.label}</button>)}
              </div>
              {reasonError && <p role="alert" className="mb-4 rounded-lg border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs text-red-200">{reasonError}</p>}
              <div className="relative space-y-1 before:absolute before:right-[18px] before:top-5 before:h-[calc(100%-40px)] before:w-px before:bg-white/10">
                  {visibleAbsenceRecords.length === 0 && visibleDailyAbsences.length === 0 ? <div className="relative flex gap-4 p-4"><div className="z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-4 border-[#111a2c] bg-emerald-500/20 text-emerald-300"><CheckCircle2 className="h-4 w-4" /></div><div className="flex-1"><p className="text-sm font-bold text-white">لا توجد غيابات</p><p className="mt-1 text-xs text-slate-500">لا توجد غيابات مسجلة في الفصل المحدد</p></div></div> : <>
                    {visibleDailyAbsences.map(absence => <div key={`daily-${absence.id}`} className="relative flex gap-4 rounded-2xl border border-red-400/20 bg-red-500/[0.07] p-4"><div className="z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-4 border-[#111a2c] bg-red-500 text-white"><CircleAlert className="h-4 w-4" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><span className="rounded-md bg-red-400/15 px-2 py-1 text-[11px] font-bold text-red-300">غياب يومي</span><span className="text-[11px] text-slate-500">{new Date(`${absence.attendanceDate}T00:00:00`).toLocaleDateString("ar-DZ")}</span></div><p className="mt-3 text-sm font-bold text-white">{absence.status}</p>{absence.parentAbsenceReason && <p className="mt-3 rounded-lg border border-cyan-400/15 bg-cyan-400/[0.05] px-3 py-2 text-xs text-cyan-100">رد ولي الأمر: {absence.parentAbsenceReason}</p>}<label className="mt-3 block text-xs text-slate-400" htmlFor={`absence-reason-${absence.id}`}>أرسل سبب الغياب للمدرسة</label><textarea id={`absence-reason-${absence.id}`} maxLength={500} value={absenceReasonDrafts[absence.id] ?? absence.parentAbsenceReason ?? ""} onChange={event => setAbsenceReasonDrafts(current => ({ ...current, [absence.id]: event.target.value }))} placeholder="مثال: كان مريضاً" className="mt-1 min-h-20 w-full resize-y rounded-lg border border-white/10 bg-black/10 p-3 text-sm text-white placeholder:text-slate-500 focus:border-cyan-400/50 focus:outline-none" /><button type="button" disabled={reasonSavingId === absence.id} onClick={() => submitAbsenceReason(absence.id, absence.parentAbsenceReason)} className="mt-2 rounded-lg bg-cyan-500/15 px-3 py-2 text-xs font-bold text-cyan-200 transition hover:bg-cyan-500/25 disabled:opacity-50">{reasonSavingId === absence.id ? "جارٍ الإرسال…" : absence.parentAbsenceReason ? "تحديث الرد" : "إرسال سبب الغياب"}</button></div></div>)}
                    {visibleAbsenceRecords.map(absence => <div key={absence.id} className={`relative flex gap-4 rounded-2xl p-4 ${absence.unjustifiedHours > 0 ? "border border-red-400/20 bg-red-500/[0.07]" : "border border-emerald-400/10 bg-emerald-500/[0.04]"}`}><div className={`z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-4 border-[#111a2c] ${absence.unjustifiedHours > 0 ? "bg-red-500 text-white" : "bg-emerald-500/20 text-emerald-300"}`}>{absence.unjustifiedHours > 0 ? <CircleAlert className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><div><span className={`rounded-md px-2 py-1 text-[11px] font-bold ${absence.unjustifiedHours > 0 ? "bg-red-400/15 text-red-300" : "bg-emerald-400/15 text-emerald-300"}`}>{absence.unjustifiedHours > 0 ? "غياب غير مبرر" : "غياب مبرر"}</span><span className="mr-2 text-xs text-slate-500">{TRIMESTRE_LABELS[absence.trimestre]}</span></div><span className="text-[11px] text-slate-500">{absence.justifiedHours + absence.unjustifiedHours} ساعة</span></div><p className="mt-3 text-sm font-bold text-white">ملخص الغياب الفصلي</p><p className="mt-1 text-xs text-slate-400">{absence.justifiedHours} ساعة مبررة <span className="mx-1 text-slate-600">•</span> {absence.unjustifiedHours} ساعة غير مبررة</p></div></div>)}
                  </>}
              </div>
            </div>

            <div className="rounded-[26px] border border-white/10 bg-[#111a2c]/85 p-5 shadow-xl shadow-black/10 sm:p-6"><div className="flex items-start justify-between"><div><p className="text-xs text-slate-500">حسب الفصول الدراسية</p><h2 className="mt-1 text-xl font-bold text-white">ساعات الغياب</h2></div><div className="rounded-xl bg-emerald-400/10 p-2 text-emerald-300"><TrendingUp className="h-4 w-4" /></div></div><div className="mt-8 flex h-36 items-end gap-4 border-b border-white/10 px-3">{absenceByTrimester.map((hours, index) => <div key={index} className="group flex flex-1 flex-col items-center gap-2"><span className="text-[10px] text-slate-500 opacity-0 transition group-hover:opacity-100">{hours} س</span><div className="w-full max-w-10 rounded-t-md bg-gradient-to-t from-blue-500 to-cyan-300 opacity-80 transition group-hover:opacity-100" style={{ height: `${Math.max(hours * 8, 8)}%` }} /></div>)}</div><div className="mt-3 flex justify-between px-2 text-[10px] text-slate-600"><span>الفصل الأول</span><span>الفصل الثاني</span><span>الفصل الثالث</span></div><div className="mt-7 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-300"><Calendar className="h-4 w-4" /></div><div className="grid grid-cols-2 gap-5"><div><p className="text-xs text-slate-500">أيام الغياب اليومي</p><p className="text-sm font-bold text-white">{dailyAbsenceDays} يوم</p></div><div><p className="text-xs text-slate-500">الساعات المسجلة</p><p className="text-sm font-bold text-white">{totalAbsenceHours} ساعة</p></div></div></div></div>
          </section>

          <section id="parent-grades" className="mt-5 scroll-mt-6 rounded-[26px] border border-white/10 bg-[#111a2c]/85 p-5 shadow-xl shadow-black/10 sm:p-6">
            <div className="mb-6 flex items-center justify-between"><div><p className="text-xs text-slate-500">النتائج المسجلة</p><h2 className="mt-1 text-xl font-bold text-white">الدرجات حسب الفصل</h2></div><BookOpen className="h-5 w-5 text-blue-300" /></div>
            {grades.length === 0 ? <p className="rounded-2xl border border-dashed border-white/10 p-6 text-center text-sm text-slate-500">لا توجد درجات مسجلة لهذا العام الدراسي.</p> : <div className="grid gap-4 md:grid-cols-3">{[1, 2, 3].map(trimestre => { const trimesterRows = grades.filter(grade => grade.trimestre === trimestre); return <div key={trimestre} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><div className="mb-4 flex items-center justify-between"><p className="text-sm font-bold text-white">{TRIMESTRE_LABELS[trimestre]}</p><span className="text-xs text-slate-500">{trimesterRows.length} درجات</span></div><div className="space-y-2">{trimesterRows.length === 0 ? <p className="text-xs text-slate-600">لا توجد درجات</p> : trimesterRows.map(grade => <div key={grade.id} className="flex items-center justify-between gap-3 text-xs"><div className="min-w-0"><p className="truncate text-slate-300">{grade.subject}</p><p className="text-[10px] text-slate-500">{gradeTypeLabels[grade.gradeType ?? "general"] ?? "درجة"}</p></div><span className={`font-bold ${getGradeColor(grade.score)}`}>{grade.score.toFixed(2)}</span></div>)}</div></div>; })}</div>}
          </section>

          <section className="mt-5 grid gap-5 md:grid-cols-3">
            {[
              { label: "المعدل الفصلي", value: t1Avg !== null ? t1Avg.toFixed(2) : "—", note: "الفصل الأول", icon: Award, color: "text-blue-300" },
              { label: "أيام الغياب المسجلة", value: `${dailyAbsenceDays} يوم`, note: `${totalAbsenceHours} ساعة مسجلة`, icon: Calendar, color: "text-cyan-300" },
              { label: "درجات مسجلة", value: String(grades.length), note: "من السجلات المتاحة", icon: BarChart3, color: "text-violet-300" },
            ].map(metric => <div key={metric.label} className="flex items-center gap-4 rounded-2xl border border-white/10 bg-[#111a2c]/70 p-4"><div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 ${metric.color}`}><metric.icon className="h-5 w-5" /></div><div><p className="text-[11px] text-slate-500">{metric.label}</p><p className="text-lg font-bold text-white">{metric.value}</p><p className="text-[10px] text-slate-500">{metric.note}</p></div></div>)}
          </section>

          <section id="parent-notifications" className="mt-6 scroll-mt-6 rounded-2xl border border-white/10 bg-[#111a2c]/80 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 text-base font-bold text-white">
                  <Bell className="h-4 w-4 text-cyan-300" /> إشعارات المؤسسة
                  {parentNotifications.some(notification => !notification.read) && <span className="rounded-full bg-cyan-400/15 px-2 py-0.5 text-[10px] text-cyan-200">جديد</span>}
                </h2>
                <p className="mt-1 text-xs text-slate-500">تنبيهات الغياب والمتابعة التربوية المرسلة من المؤسسة</p>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => void loadParentNotifications()} disabled={notificationsBusy} className="text-xs font-bold text-cyan-300 hover:text-white disabled:opacity-50">
                  {notificationsBusy ? "جارٍ التحديث…" : "تحديث"}
                </button>
                <button onClick={togglePush} disabled={pushBusy} className="text-xs font-bold text-cyan-300 hover:text-white disabled:opacity-50">
                  {pushBusy ? "جارٍ التحديث…" : pushEnabled ? "إيقاف التنبيهات الفورية" : "تفعيل التنبيهات الفورية"}
                </button>
              </div>
            </div>
            {pushError && <p role="alert" className="mt-3 text-xs text-red-300">{pushError}</p>}
            {notificationsError && <p role="alert" className="mt-3 text-xs text-red-300">{notificationsError}</p>}
            <div className="mt-4 space-y-3">
              {notificationsBusy && parentNotifications.length === 0
                ? <p className="rounded-xl border border-white/10 p-4 text-center text-sm text-slate-400">جارٍ تحميل الإشعارات…</p>
                : parentNotifications.length === 0
                  ? <p className="rounded-xl border border-dashed border-white/10 p-4 text-center text-sm text-slate-500">لا توجد إشعارات من المؤسسة حالياً.</p>
                  : parentNotifications.map(notification => (
                    <article key={notification.id} className={`rounded-xl border p-4 ${notification.read ? "border-white/10 bg-white/[0.02]" : "border-cyan-300/20 bg-cyan-400/[0.06]"}`}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="text-sm font-bold text-white">{notification.title}</h3>
                          {notification.body && <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-300">{notification.body}</p>}
                          <time className="mt-2 block text-[11px] text-slate-500" dateTime={notification.createdAt}>
                            {new Date(notification.createdAt).toLocaleString("ar-DZ")}
                          </time>
                        </div>
                        {!notification.read && <button onClick={() => void markParentNotificationRead(notification.id)} className="shrink-0 text-xs font-bold text-cyan-300 hover:text-white">تمت القراءة</button>}
                      </div>
                    </article>
                  ))}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
