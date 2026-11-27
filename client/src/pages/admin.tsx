import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Shield, CheckCircle2, XCircle, Clock, RefreshCw, Search, FileSpreadsheet, Upload, Users, UserCheck, AlertCircle, Loader2, CreditCard } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

const BASE = import.meta.env.BASE_URL;

interface AdminUser {
  id: string;
  memberId?: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  memberName?: string;
  memberRole?: "teacher" | "supervisor" | "counselor";
  schoolName?: string | null;
  role: string;
  subscriptionStatus: string;
  subscriptionPlan?: string | null;
  subscriptionExpiresAt: string | null;
  createdAt: string;
}

type SubscriptionTab = "managers" | "staff" | "parents";

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  active:    { label: "نشط",    color: "text-emerald-500", icon: CheckCircle2 },
  pending:   { label: "معلّق",  color: "text-amber-500",   icon: Clock },
  suspended: { label: "موقوف", color: "text-red-500",     icon: XCircle },
};

// ── CCP Payment Requests Review ───────────────────────────────────────────────
interface CcpRequest {
  id: string; userId: string; plan: string; amountDzd: number;
  contactEmail: string | null; contactFacebook: string | null;
  status: string; reviewNote: string | null; createdAt: string;
  userFirstName: string | null; userLastName: string | null; userEmail: string | null;
}

function CcpRequestsCard() {
  const [requests, setRequests] = useState<CcpRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    try {
      const res = await fetch(`${BASE}api/payments/ccp/admin/requests?status=pending`, { credentials: "include" });
      if (res.ok) {
        const data = (await res.json()) as { requests?: CcpRequest[] };
        setRequests(data.requests ?? []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);

  const review = async (id: string, action: "approve" | "reject") => {
    setBusy(id);
    try {
      const res = await fetch(`${BASE}api/payments/ccp/admin/review`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      if (res.ok) await load();
    } finally { setBusy(null); }
  };

  return (
    <Card className="border-0 shadow-md overflow-hidden md:col-span-2">
      <div className="bg-gradient-to-br from-emerald-500 to-teal-700 p-4">
        <h2 className="text-white font-bold text-sm">طلبات الدفع عبر CCP</h2>
        <p className="text-white/65 text-xs">تحقق من صورة الوصل وفعّل الباقة المختارة (Basic 2000 / Pro 3000)</p>
      </div>
      <CardContent className="pt-4 pb-4 space-y-3">
        {loading ? (
          <p className="text-xs text-muted-foreground text-center py-3">جارٍ التحميل…</p>
        ) : requests.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-3">لا توجد طلبات معلّقة</p>
        ) : (
          requests.map(r => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3">
              <div className="space-y-1">
                <p className="text-sm font-bold">
                  {[r.userFirstName, r.userLastName].filter(Boolean).join(" ") || r.userEmail || r.userId} — {r.plan === "pro" ? "Pro" : r.plan === "basic" ? "Basic" : r.plan} ({r.amountDzd.toLocaleString("en-US")} دج)
                </p>
                <p className="text-xs text-muted-foreground">
                  {r.contactEmail ?? r.contactFacebook ?? "—"} · {new Date(r.createdAt).toLocaleString("ar-DZ")}
                </p>
                <a className="text-xs text-blue-600 hover:underline" href={`${BASE}api/payments/ccp/receipt/${r.id}`} target="_blank" rel="noreferrer">عرض الوصل</a>
              </div>
              <div className="flex gap-2">
                <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" disabled={busy === r.id} onClick={() => void review(r.id, "approve")}>موافقة وتفعيل</Button>
                <Button size="sm" variant="outline" className="text-red-600 border-red-200" disabled={busy === r.id} onClick={() => void review(r.id, "reject")}>رفض</Button>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

// ── Platform Reviews Moderation ───────────────────────────────────────────────
interface AdminReview {
  id: string; rating: number; comment: string; audience: string; audienceLabel: string;
  status: string; createdAt: string; name: string; email: string | null; wilaya: string | null;
}

function ReviewsCard() {
  const [reviews, setReviews] = useState<AdminReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    try {
      const res = await fetch(`${BASE}api/reviews/admin`, { credentials: "include" });
      if (res.ok) {
        const data = (await res.json()) as { reviews?: AdminReview[] };
        setReviews(data.reviews ?? []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);

  const setStatus = async (id: string, status: "approved" | "rejected" | "pending") => {
    setBusy(id);
    try {
      const res = await fetch(`${BASE}api/reviews/admin/${id}/status`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) await load();
    } finally { setBusy(null); }
  };

  const remove = async (id: string) => {
    if (!window.confirm("حذف هذا التقييم نهائياً؟")) return;
    setBusy(id);
    try {
      const res = await fetch(`${BASE}api/reviews/admin/${id}`, { method: "DELETE", credentials: "include" });
      if (res.ok) await load();
    } finally { setBusy(null); }
  };

  const pendingCount = reviews.filter(r => r.status === "pending").length;

  return (
    <Card className="border-0 shadow-md overflow-hidden md:col-span-2">
      <div className="bg-gradient-to-br from-amber-500 to-orange-600 p-4">
        <h2 className="text-white font-bold text-sm">آراء المستخدمين على المنصة</h2>
        <p className="text-white/65 text-xs">{pendingCount > 0 ? `${pendingCount} تقييم بانتظار المراجعة — ` : ""}الموافق عليها تظهر في صفحة تسجيل الدخول</p>
      </div>
      <CardContent className="pt-4 pb-4 space-y-3">
        {loading ? (
          <p className="text-xs text-muted-foreground text-center py-3">جارٍ التحميل…</p>
        ) : reviews.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-3">لا توجد تقييمات بعد — يمكن للمستخدمين التقييم بعد شهر من إنشاء حسابهم</p>
        ) : (
          reviews.map(r => (
            <div key={r.id} className="rounded-xl border p-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-0.5" dir="ltr">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <span key={i} className={`text-sm ${i < r.rating ? "text-amber-500" : "text-muted-foreground/30"}`}>★</span>
                    ))}
                  </div>
                  <span className="text-xs font-bold">{r.name}</span>
                  <span className="text-[10px] text-muted-foreground">{r.audienceLabel}{r.wilaya ? ` · ${r.wilaya}` : ""}</span>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${r.status === "approved" ? "bg-emerald-100 text-emerald-700" : r.status === "rejected" ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-700"}`}>
                  {r.status === "approved" ? "منشور" : r.status === "rejected" ? "مرفوض" : "معلّق"}
                </span>
              </div>
              <p className="text-sm text-foreground/85">"{r.comment}"</p>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[10px] text-muted-foreground">{new Date(r.createdAt).toLocaleString("ar-DZ")}</p>
                <div className="flex gap-2">
                  {r.status !== "approved" && (
                    <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" disabled={busy === r.id} onClick={() => void setStatus(r.id, "approved")}>نشر</Button>
                  )}
                  {r.status !== "rejected" && (
                    <Button size="sm" variant="outline" className="text-red-600 border-red-200" disabled={busy === r.id} onClick={() => void setStatus(r.id, "rejected")}>رفض</Button>
                  )}
                  <Button size="sm" variant="ghost" className="text-muted-foreground" disabled={busy === r.id} onClick={() => void remove(r.id)}>حذف</Button>
                </div>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

// ── Free Trial Toggle ─────────────────────────────────────────────────────────
function TrialToggleCard({ onGrantBulk, granting, onRevoke, revoking }: { onGrantBulk: () => void; granting: boolean; onRevoke: () => void; revoking: boolean }) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(`${BASE}api/payments/admin/trial-setting`, { credentials: "include" });
        if (res.ok) {
          const data = (await res.json()) as { trialEnabled?: boolean };
          setEnabled(data.trialEnabled !== false);
        }
      } catch { /* ignore */ }
    })();
  }, []);

  const toggle = async () => {
    if (enabled === null) return;
    setBusy(true);
    try {
      const res = await fetch(`${BASE}api/payments/admin/trial-setting`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !enabled }),
      });
      if (res.ok) setEnabled(!enabled);
    } finally { setBusy(false); }
  };

  return (
    <Card className="border-0 shadow-md overflow-hidden">
      <div className={`p-4 ${enabled === false ? "bg-gradient-to-br from-slate-500 to-slate-700" : "bg-gradient-to-br from-violet-500 to-purple-700"}`}>
        <div className="flex items-center gap-2 mb-1">
          <Clock className="w-5 h-5 text-white/80" />
          <h2 className="text-white font-bold text-sm">التجربة المجانية</h2>
        </div>
        <p className="text-white/65 text-xs">
          {enabled === null ? "جارٍ التحميل…" : enabled ? "مفعّلة — يمكن للمستخدمين الجدد تجربة الباقات لمدة 15 يوماً" : "موقوفة — لن تظهر التجربة المجانية لأي مستخدم جديد"}
        </p>
      </div>
      <CardContent className="pt-4 pb-4 space-y-3">
        <div className={`flex items-center justify-between rounded-xl border px-3 py-2.5 ${enabled === false ? "border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/30" : "border-emerald-200 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-950/30"}`}>
          <span className={`text-xs font-bold ${enabled === false ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>
            الحالة: {enabled === null ? "…" : enabled ? "مفعّلة" : "موقوفة"}
          </span>
          <span className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${enabled === false ? "bg-slate-300" : "bg-emerald-500"}`}>
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${enabled === false ? "translate-x-1" : "translate-x-6"}`} />
          </span>
        </div>
        <Button
          className={`w-full rounded-xl font-bold ${enabled === false ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700"}`}
          disabled={busy || enabled === null}
          onClick={() => void toggle()}
        >
          {busy ? "جارٍ الحفظ…" : enabled === false ? "تفعيل التجربة المجانية" : "إيقاف التجربة المجانية"}
        </Button>
        <p className="text-[10px] text-muted-foreground text-center leading-relaxed">
          عند الإيقاف تختفي أزرار «تجربة مجانية» من صفحة الباقات والاشتراك، ويُرفض أي طلب تفعيل من الخادم.
        </p>
        <Button
          variant="outline"
          className="w-full rounded-xl font-bold border-violet-200 text-violet-700 hover:bg-violet-50 dark:hover:bg-violet-950/30"
          disabled={granting}
          onClick={onGrantBulk}
        >
          {granting ? "جارٍ المنح…" : "منح شهر مجاني لكل الحسابات غير المشتركة"}
        </Button>
        <p className="text-[10px] text-muted-foreground text-center leading-relaxed">
          يمنح 15 يوماً مجاناً لكل حساب ليس لديه اشتراك مدفوع فعّال — مفيد للحسابات القديمة.
        </p>
        <Button
          variant="outline"
          className="w-full rounded-xl font-bold border-red-200 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
          disabled={revoking}
          onClick={onRevoke}
        >
          {revoking ? "جارٍ الإنهاء…" : "إنهاء كل التجارب الجارية فوراً"}
        </Button>
        <p className="text-[10px] text-muted-foreground text-center leading-relaxed">
          يُنهي تجارب الحسابات القديمة فوراً ويرجعها للباقة المجانية — لا يمس المشتركين المدفوعين.
        </p>
      </CardContent>
    </Card>
  );
}

// ── Chargily Payments Toggle ──────────────────────────────────────────────────
function ChargilyToggleCard() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(`${BASE}api/payments/admin/chargily-setting`, { credentials: "include" });
        if (res.ok) {
          const data = (await res.json()) as { chargilyEnabled?: boolean };
          setEnabled(data.chargilyEnabled === true);
        }
      } catch { /* ignore */ }
    })();
  }, []);

  const toggle = async () => {
    if (enabled === null) return;
    setBusy(true);
    try {
      const res = await fetch(`${BASE}api/payments/admin/chargily-setting`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !enabled }),
      });
      if (res.ok) setEnabled(!enabled);
    } finally { setBusy(false); }
  };

  return (
    <Card className="border-0 shadow-md overflow-hidden">
      <div className={`p-4 ${enabled === true ? "bg-gradient-to-br from-sky-500 to-blue-700" : "bg-gradient-to-br from-slate-500 to-slate-700"}`}>
        <div className="flex items-center gap-2 mb-1">
          <CreditCard className="w-5 h-5 text-white/80" />
          <h2 className="text-white font-bold text-sm">الدفع عبر Chargily</h2>
        </div>
        <p className="text-white/65 text-xs">
          {enabled === null ? "جارٍ التحميل…" : enabled ? "مفعّل — الدفع بالبطاقة عبر Chargily متاح" : "موقوف — الدفع متاح عبر CCP فقط"}
        </p>
      </div>
      <CardContent className="pt-4 pb-4 space-y-3">
        <div className={`flex items-center justify-between rounded-xl border px-3 py-2.5 ${enabled === true ? "border-sky-200 bg-sky-50 dark:border-sky-900/50 dark:bg-sky-950/30" : "border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/30"}`}>
          <span className={`text-xs font-bold ${enabled === true ? "text-sky-600 dark:text-sky-400" : "text-red-600 dark:text-red-400"}`}>
            الحالة: {enabled === null ? "…" : enabled ? "مفعّل" : "موقوف"}
          </span>
          <span className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${enabled === true ? "bg-sky-500" : "bg-slate-300"}`}>
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${enabled === true ? "translate-x-6" : "translate-x-1"}`} />
          </span>
        </div>
        <Button
          className={`w-full rounded-xl font-bold ${enabled === true ? "bg-red-600 hover:bg-red-700" : "bg-emerald-600 hover:bg-emerald-700"}`}
          disabled={busy || enabled === null}
          onClick={() => void toggle()}
        >
          {busy ? "جارٍ الحفظ…" : enabled === true ? "إيقاف Chargily" : "تفعيل Chargily"}
        </Button>
        <p className="text-[10px] text-muted-foreground text-center leading-relaxed">
          عند الإيقاف تختفي أزرار «الدفع عبر Chargily» ويبقى الدفع اليدوي عبر CCP فقط. الويبهوك يبقى فعّالاً للمدفوعات الجارية.
        </p>
      </CardContent>
    </Card>
  );
}

// ── Bulk Import Card ──────────────────────────────────────────────────────────
const YEARS = ["2023-2024", "2024-2025", "2025-2026", "2026-2027"];

function BulkImportCard() {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [year, setYear] = useState("2026-2027");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null);

  const handleFile = async (file: File) => {
    setBusy(true);
    setResult(null);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch(`${BASE}api/students/import?annee=${encodeURIComponent(year)}`, {
        method: "POST", credentials: "include", body: fd,
      });
      const data = await res.json();
      if (res.ok) {
        setResult({ imported: data.imported, skipped: data.skipped });
        toast({ title: "تم الاستيراد", description: `${data.imported} تلميذ تم إضافتهم` });
      } else {
        toast({ title: "خطأ", description: data.error ?? "فشل الاستيراد", variant: "destructive" });
      }
    } catch {
      toast({ title: "خطأ", description: "تعذّر الاتصال بالخادم", variant: "destructive" });
    } finally { setBusy(false); }
  };

  return (
    <Card className="border-0 shadow-md overflow-hidden">
      <div className="bg-gradient-to-br from-sky-500 to-blue-700 p-4">
        <div className="flex items-center gap-2 mb-1">
          <FileSpreadsheet className="w-5 h-5 text-white/80" />
          <h2 className="text-white font-bold text-sm">استيراد التلاميذ من Excel</h2>
        </div>
        <p className="text-white/65 text-xs">ملفات المنظومة .xlsx / .xls / HTML — يُنشئ الأقسام والملفات تلقائياً</p>
      </div>
      <CardContent className="pt-4 pb-4 space-y-3">
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground whitespace-nowrap">السنة الدراسية:</label>
          <select
            value={year} onChange={e => setYear(e.target.value)}
            className="flex-1 text-xs px-2 py-1.5 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-sky-500/20"
          >
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.html,.htm" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
        />

        <motion.button
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          whileHover={{ scale: busy ? 1 : 1.02 }} whileTap={{ scale: busy ? 1 : 0.97 }}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 text-white text-sm font-semibold disabled:opacity-60 transition-all shadow-sm shadow-sky-500/20"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          {busy ? "جارٍ الاستيراد…" : "اختر ملف Excel"}
        </motion.button>

        {result && (
          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3 p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            <div className="text-xs">
              <span className="font-bold text-emerald-700 dark:text-emerald-400">{result.imported} تلميذ</span>
              <span className="text-muted-foreground"> تم إضافتهم</span>
              {result.skipped > 0 && <span className="text-muted-foreground"> · {result.skipped} تم تخطيه</span>}
            </div>
          </motion.div>
        )}

        <p className="text-[10px] text-muted-foreground text-center">
          للاستيراد الشامل متعدد الملفات:{" "}
          <a href="/import" className="text-sky-500 hover:underline">صفحة الاستيراد الكاملة</a>
        </p>
      </CardContent>
    </Card>
  );
}

export default function AdminPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [staff, setStaff] = useState<AdminUser[]>([]);
  const [parents, setParents] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<SubscriptionTab>("managers");
  const [search, setSearch] = useState("");
  const [updating, setUpdating] = useState<string | null>(null);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${BASE}api/admin/users`, { credentials: "include" });
      if (res.ok) setUsers(await res.json());
      const staffRes = await fetch(`${BASE}api/admin/staff`, { credentials: "include" });
      if (staffRes.ok) setStaff(await staffRes.json());
      const parentsRes = await fetch(`${BASE}api/admin/parents`, { credentials: "include" });
      if (parentsRes.ok) setParents(await parentsRes.json());
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchUsers(); }, []);

  const updateStatus = async (id: string, subscriptionStatus: string) => {
    setUpdating(id);
    try {
      const res = await fetch(`${BASE}api/admin/users/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscriptionStatus }),
      });
      if (res.ok) {
        const updateStatusInList = (prev: AdminUser[]) =>
          prev.map(u => u.id === id ? { ...u, subscriptionStatus } : u);
        setUsers(updateStatusInList);
        setStaff(updateStatusInList);
        setParents(updateStatusInList);
      }
    } finally { setUpdating(null); }
  };

  const grantTrial = async (id: string) => {
    if (!window.confirm("منح هذا الحساب تجربة مجانية لمدة 15 يوماً؟")) return;
    setUpdating(id);
    try {
      const res = await fetch(`${BASE}api/admin/users/${id}/grant-trial`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast({ title: "تم منح التجربة", description: `باقة ${data.plan ?? ""} لمدة ${data.trialDays ?? 15} يوماً` });
        await fetchUsers();
      } else {
        toast({ title: "تعذر منح التجربة", description: data.error ?? "", variant: "destructive" });
      }
    } finally { setUpdating(null); }
  };

  const grantTrialBulk = async () => {
    if (!window.confirm("منح تجربة مجانية لمدة 15 يوماً لكل الحسابات التي ليس لديها اشتراك مدفوع فعّال؟")) return;
    setUpdating("__bulk__");
    try {
      const res = await fetch(`${BASE}api/admin/grant-trial-bulk`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast({ title: "تم منح التجارب", description: `${data.granted ?? 0} حساب حصل على شهر مجاني` });
        await fetchUsers();
      } else {
        toast({ title: "تعذر منح التجارب", description: data.error ?? "", variant: "destructive" });
      }
    } finally { setUpdating(null); }
  };

  const revokeTrials = async () => {
    if (!window.confirm("إنهاء كل التجارب المجانية الجارية فوراً وإرجاع أصحابها للباقة المجانية؟ لن يتأثر المشتركون المدفوعون.")) return;
    setUpdating("__revoke__");
    try {
      const res = await fetch(`${BASE}api/admin/revoke-trials`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast({ title: "تم إنهاء التجارب", description: `${data.revoked ?? 0} حساب رجع للباقة المجانية` });
        await fetchUsers();
      } else {
        toast({ title: "تعذر إنهاء التجارب", description: data.error ?? "", variant: "destructive" });
      }
    } finally { setUpdating(null); }
  };

  if (user?.role !== "admin") {
    return (
      <div className="flex items-center justify-center h-full min-h-[50vh] text-center p-8">
        <div>
          <Shield className="w-12 h-12 text-red-400 mx-auto mb-4 opacity-50" />
          <p className="text-muted-foreground">هذه الصفحة للمسؤولين فقط</p>
        </div>
      </div>
    );
  }

  const visibleUsers = activeTab === "managers" ? users : activeTab === "staff" ? staff : parents;
  const filtered = visibleUsers.filter(u =>
    !search || (u.email || "").toLowerCase().includes(search.toLowerCase()) ||
    (u.firstName || "").toLowerCase().includes(search.toLowerCase()) ||
    (u.memberName || "").toLowerCase().includes(search.toLowerCase()) ||
    (u.schoolName || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <motion.div className="p-6 max-w-5xl mx-auto space-y-6"
      initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center shadow-lg shadow-violet-500/30">
              <Shield className="w-5 h-5 text-white" />
            </span>
            لوحة الإدارة
          </h1>
          <p className="text-xs text-muted-foreground mt-1 ms-11">حسابات المديرين والطاقم التربوي والأولياء</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchUsers} className="gap-2">
          <RefreshCw className="w-3.5 h-3.5" /> تحديث
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-2 rounded-xl bg-muted/50 p-1">
        <button
          type="button"
          onClick={() => setActiveTab("managers")}
          className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-bold transition-colors ${activeTab === "managers" ? "bg-background text-violet-700 shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
        >
          <Shield className="w-4 h-4" /> اشتراكات المدراء ({users.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("staff")}
          className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-bold transition-colors ${activeTab === "staff" ? "bg-background text-sky-700 shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
        >
          <Users className="w-4 h-4" /> الطاقم التربوي ({staff.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("parents")}
          className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-bold transition-colors ${activeTab === "parents" ? "bg-background text-emerald-700 shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
        >
          <UserCheck className="w-4 h-4" /> اشتراكات الأولياء ({parents.length})
        </button>
      </div>

      {/* Bulk Import + Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <BulkImportCard />
        <CcpRequestsCard />
        <ReviewsCard />
        <TrialToggleCard onGrantBulk={() => void grantTrialBulk()} granting={updating === "__bulk__"} onRevoke={() => void revokeTrials()} revoking={updating === "__revoke__"} />
        <ChargilyToggleCard />
        <Card className="border-0 shadow-md overflow-hidden">
          <div className="bg-gradient-to-br from-rose-500 to-red-700 p-4">
            <div className="flex items-center gap-2 mb-1">
              <Shield className="w-5 h-5 text-white/80" />
              <h2 className="text-white font-bold text-sm">سجل العمليات</h2>
            </div>
            <p className="text-white/65 text-xs">تتبع كل تعديل أُجري على البيانات مع التوقيت والجهة</p>
          </div>
          <CardContent className="pt-4 pb-4 space-y-3">
            <p className="text-xs text-muted-foreground">يشمل: تعديل الدرجات، استيراد التلاميذ، سجل الغيابات، إضافة/حذف الأعضاء.</p>
            <a href="/audit-log">
              <motion.div
                whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-rose-500 to-red-600 text-white text-sm font-semibold cursor-pointer shadow-sm shadow-rose-500/20"
              >
                <Shield className="w-4 h-4" />
                فتح سجل العمليات
              </motion.div>
            </a>
          </CardContent>
        </Card>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "إجمالي", value: visibleUsers.length, color: "from-blue-500 to-indigo-600" },
          { label: "نشط",    value: visibleUsers.filter(u => u.subscriptionStatus === "active").length, color: "from-emerald-500 to-green-600" },
          { label: "معلّق",  value: visibleUsers.filter(u => u.subscriptionStatus === "pending").length, color: "from-amber-500 to-orange-600" },
        ].map((s, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}>
            <Card className="border-0 shadow-md overflow-hidden">
              <div className={`bg-gradient-to-br ${s.color} p-4`}>
                <p className="text-white/70 text-xs">{s.label}</p>
                <p className="text-3xl font-extrabold text-white">{s.value}</p>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="ابحث بالإيميل أو الاسم..."
          className="w-full ps-9 pe-4 py-2.5 rounded-xl border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30"
        />
      </div>

      {/* Users table */}
      <Card className="border-0 shadow-md">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-bold">{activeTab === "managers" ? "اشتراكات المديرين" : activeTab === "staff" ? "الطاقم التربوي المسجل" : "اشتراكات الأولياء"} ({filtered.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground text-sm">جارٍ التحميل...</div>
          ) : (
            <div className="divide-y">
              {filtered.map(u => {
                const cfg = STATUS_CONFIG[u.subscriptionStatus] || STATUS_CONFIG.pending;
                const StatusIcon = cfg.icon;
                return (
                  <motion.div key={u.memberId ?? u.id}
                    className="flex items-center gap-4 px-5 py-3 hover:bg-muted/30 transition-colors"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                      {(u.firstName?.[0] || u.email?.[0] || "?").toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">
                        {u.memberName || (u.firstName ? `${u.firstName} ${u.lastName ?? ""}`.trim() : "—")}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                      {u.memberRole && (
                        <p className="text-[10px] text-sky-700 dark:text-sky-400 truncate">
                          {{ teacher: "أستاذ", supervisor: "مشرف", counselor: "مستشار" }[u.memberRole]}
                          {u.schoolName ? ` · ${u.schoolName}` : ""}
                        </p>
                      )}
                      {!u.memberRole && u.subscriptionPlan === "staff" && (
                        <p className="text-[10px] text-sky-700 dark:text-sky-400 truncate">اشتراك طاقم تربوي مستقل</p>
                      )}
                      {!u.memberRole && u.subscriptionPlan === "parent" && (
                        <p className="text-[10px] text-emerald-700 dark:text-emerald-400 truncate">اشتراك ولي أمر مستقل</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <StatusIcon className={`w-3.5 h-3.5 ${cfg.color}`} />
                      <span className={`text-xs font-semibold ${cfg.color}`}>{cfg.label}</span>
                    </div>
                    <div className="flex gap-1.5">
                      <Button size="sm" variant="outline"
                        className="h-7 text-xs text-violet-600 border-violet-200 hover:bg-violet-50 dark:hover:bg-violet-950/30"
                        disabled={updating === u.id}
                        onClick={() => grantTrial(u.id)}
                        title="منح تجربة مجانية 15 يوماً">
                        تجربة
                      </Button>
                      {u.subscriptionStatus !== "active" && (
                        <Button size="sm" variant="outline"
                          className="h-7 text-xs text-emerald-600 border-emerald-200 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                          disabled={updating === u.id}
                          onClick={() => updateStatus(u.id, "active")}>
                          تفعيل
                        </Button>
                      )}
                      {u.subscriptionStatus !== "pending" && (
                        <Button size="sm" variant="outline"
                          className="h-7 text-xs text-amber-600 border-amber-200 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                          disabled={updating === u.id}
                          onClick={() => updateStatus(u.id, "pending")}>
                          تعليق
                        </Button>
                      )}
                      {u.subscriptionStatus !== "suspended" && (
                        <Button size="sm" variant="outline"
                          className="h-7 text-xs text-red-600 border-red-200 hover:bg-red-50 dark:hover:bg-red-950/30"
                          disabled={updating === u.id}
                          onClick={() => updateStatus(u.id, "suspended")}>
                          إيقاف
                        </Button>
                      )}
                    </div>
                  </motion.div>
                );
              })}
              {!filtered.length && (
                <div className="p-8 text-center text-muted-foreground text-sm">لا توجد نتائج</div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
