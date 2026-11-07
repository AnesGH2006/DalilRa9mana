import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Shield, CheckCircle2, XCircle, Clock, RefreshCw, Search, FileSpreadsheet, Upload, Users, UserCheck, AlertCircle, Loader2 } from "lucide-react";
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
