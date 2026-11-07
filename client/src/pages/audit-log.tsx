/**
 * Audit Log Page — Head-Admin only
 * Shows successful API changes and explicitly audited actions for this school account.
 */
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Shield, AlertCircle, Search, RefreshCw, Clock,
  FileSpreadsheet, BookOpen, Users, CalendarOff, Trash2,
  UserPlus, UserMinus, Edit3, Upload, Download, Settings, CreditCard,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const BASE = import.meta.env.BASE_URL;

interface AuditEntry {
  id: string;
  userId: string;
  actorId: string | null;
  actorName: string | null;
  action: string;
  description: string | null;
  entity: string | null;
  entityId: string | null;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
}

// Map action key → icon + colour
const ACTION_META: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
  grade_edit:        { icon: Edit3,          color: "text-violet-600 dark:text-violet-400", bg: "bg-violet-100 dark:bg-violet-900/30" },
  grade_bulk_import: { icon: Upload,          color: "text-indigo-600 dark:text-indigo-400", bg: "bg-indigo-100 dark:bg-indigo-900/30" },
  student_import:    { icon: FileSpreadsheet, color: "text-blue-600 dark:text-blue-400",     bg: "bg-blue-100 dark:bg-blue-900/30"     },
  student_add:       { icon: UserPlus,        color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-100 dark:bg-emerald-900/30" },
  student_delete:    { icon: Trash2,          color: "text-red-600 dark:text-red-400",       bg: "bg-red-100 dark:bg-red-900/30"       },
  absence_log:       { icon: CalendarOff,     color: "text-amber-600 dark:text-amber-400",   bg: "bg-amber-100 dark:bg-amber-900/30"   },
  member_add:        { icon: Users,           color: "text-sky-600 dark:text-sky-400",       bg: "bg-sky-100 dark:bg-sky-900/30"       },
  member_remove:     { icon: UserMinus,       color: "text-rose-600 dark:text-rose-400",     bg: "bg-rose-100 dark:bg-rose-900/30"     },
  settings_update:   { icon: Settings,        color: "text-slate-600 dark:text-slate-400",   bg: "bg-slate-100 dark:bg-slate-900/30"   },
  payment_operation: { icon: CreditCard,      color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-100 dark:bg-emerald-900/30" },
};

const DEFAULT_META = { icon: Shield, color: "text-slate-600 dark:text-slate-400", bg: "bg-slate-100 dark:bg-slate-900/30" };

function getMeta(action: string) {
  // Exact match first, then prefix match
  if (ACTION_META[action]) return ACTION_META[action]!;
  const prefix = Object.keys(ACTION_META).find(k => action.startsWith(k.split("_")[0]!));
  return prefix ? ACTION_META[prefix]! : DEFAULT_META;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("ar-DZ", {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

const FILTERS = [
  { key: "",                label: "الكل"        },
  { key: "grade",           label: "الدرجات"      },
  { key: "student",         label: "التلاميذ"     },
  { key: "absence",         label: "الغيابات"     },
  { key: "member",          label: "الأعضاء"      },
  { key: "payment",         label: "المدفوعات"    },
  { key: "settings",        label: "المؤسسة"      },
];

const PAGE_SIZE = 50;
const AUDIT_BATCH_SIZE = 500;

export default function AuditLogPage() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(1);

  const fetchLogs = async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await fetch(`${BASE}api/audit-logs?limit=${AUDIT_BATCH_SIZE}&offset=0`, { credentials: "include" });
      if (!res.ok) throw new Error("تعذر تحميل سجل العمليات");
      const rows = await res.json() as AuditEntry[];
      setEntries(rows);
      setHasMore(rows.length === AUDIT_BATCH_SIZE);
      setPage(1);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "تعذر تحميل سجل العمليات");
    } finally {
      setLoading(false);
    }
  };

  const loadMore = async () => {
    setLoadingMore(true);
    setLoadError("");
    try {
      const res = await fetch(
        `${BASE}api/audit-logs?limit=${AUDIT_BATCH_SIZE}&offset=${entries.length}`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error("تعذر تحميل بقية العمليات");
      const rows = await res.json() as AuditEntry[];
      setEntries(current => [...current, ...rows]);
      setHasMore(rows.length === AUDIT_BATCH_SIZE);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "تعذر تحميل بقية العمليات");
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => { fetchLogs(); }, []);

  // Head-admin guard (no memberContext)
  if (user?.memberContext) {
    return (
      <div className="flex items-center justify-center h-full min-h-[50vh] text-center p-8">
        <div>
          <Shield className="w-12 h-12 text-red-400 mx-auto mb-4 opacity-50" />
          <p className="text-muted-foreground">هذه الصفحة للمسؤول الرئيسي فقط</p>
        </div>
      </div>
    );
  }

  const filtered = entries.filter(e => {
    const matchesFilter = !filter || e.action.startsWith(filter);
    const q = search.toLowerCase();
    const matchesSearch = !q ||
      (e.description ?? "").toLowerCase().includes(q) ||
      (e.actorName ?? "").toLowerCase().includes(q) ||
      (e.action ?? "").toLowerCase().includes(q);
    return matchesFilter && matchesSearch;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <motion.div
      className="p-4 md:p-6 space-y-5 max-w-5xl mx-auto"
      initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-rose-500 to-red-700 flex items-center justify-center shadow-lg shadow-rose-500/30">
              <Shield className="w-5 h-5 text-white" />
            </span>
            سجل العمليات
          </h1>
          <p className="text-xs text-muted-foreground mt-1 ms-11">تتبع عمليات الإضافة والتعديل والحذف في النظام</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchLogs} className="gap-2">
          <RefreshCw className="w-3.5 h-3.5" /> تحديث
        </Button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "العمليات المحمّلة", value: entries.length, color: "from-slate-500 to-slate-700" },
          { label: "تعديلات الدرجات", value: entries.filter(e => e.action.startsWith("grade")).length, color: "from-violet-500 to-purple-700" },
          { label: "إجراءات التلاميذ", value: entries.filter(e => e.action.startsWith("student")).length, color: "from-blue-500 to-indigo-700" },
          { label: "اليوم", value: entries.filter(e => new Date(e.createdAt).toDateString() === new Date().toDateString()).length, color: "from-emerald-500 to-green-700" },
        ].map((s, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <Card className="border-0 shadow-sm overflow-hidden">
              <div className={`bg-gradient-to-br ${s.color} px-4 py-3`}>
                <p className="text-white/70 text-[10px] uppercase tracking-wide">{s.label}</p>
                <p className="text-2xl font-extrabold text-white">{s.value}</p>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Filters + search */}
      {loadError && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
          {loadError}
        </div>
      )}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="ابحث في السجل..."
            className="w-full ps-9 pe-4 py-2 rounded-xl border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/20"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => { setFilter(f.key); setPage(1); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border
                ${filter === f.key
                  ? "bg-rose-600 text-white border-rose-600"
                  : "bg-background border-border text-muted-foreground hover:border-rose-400 hover:text-rose-500"
                }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Log table */}
      <Card className="border-0 shadow-md overflow-hidden">
        <CardHeader className="pb-2 border-b">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <Clock className="w-4 h-4 text-rose-500" />
            العمليات ({filtered.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-10 text-center text-muted-foreground text-sm">
              <RefreshCw className="w-6 h-6 mx-auto mb-2 animate-spin opacity-40" />
              جارٍ التحميل…
            </div>
          ) : paginated.length === 0 ? (
            <div className="p-10 text-center text-muted-foreground text-sm">
              <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-30" />
              لا توجد عمليات مسجّلة
            </div>
          ) : (
            <div className="divide-y">
              {paginated.map((entry, i) => {
                const meta = getMeta(entry.action);
                const Icon = meta.icon;
                return (
                  <motion.div
                    key={entry.id}
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.01 }}
                    className="flex items-start gap-3 px-4 py-3 hover:bg-muted/30 transition-colors"
                  >
                    {/* Icon */}
                    <div className={`mt-0.5 w-8 h-8 rounded-lg ${meta.bg} flex items-center justify-center shrink-0`}>
                      <Icon className={`w-4 h-4 ${meta.color}`} />
                    </div>

                    {/* Main content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold leading-snug">
                          {entry.description || entry.action}
                        </p>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">
                          {entry.action}
                        </Badge>
                      </div>
                      {entry.actorName && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          بواسطة: <span className="font-medium text-foreground">{entry.actorName}</span>
                        </p>
                      )}
                      {entry.details && Object.keys(entry.details).length > 0 && (
                        <p className="text-xs text-muted-foreground mt-0.5 font-mono truncate">
                          {Object.entries(entry.details).slice(0, 3).map(([k, v]) => `${k}: ${v}`).join(" · ")}
                        </p>
                      )}
                    </div>

                    {/* Time + IP */}
                    <div className="text-end shrink-0">
                      <p className="text-xs text-muted-foreground whitespace-nowrap">{formatDate(entry.createdAt)}</p>
                      {entry.ipAddress && (
                        <p className="text-[10px] text-muted-foreground/60 font-mono mt-0.5">{entry.ipAddress}</p>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>السابق</Button>
          <span className="text-sm text-muted-foreground">{page} / {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>التالي</Button>
        </div>
      )}
      {!loading && hasMore && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={() => void loadMore()} disabled={loadingMore} className="gap-2">
            <RefreshCw className={`w-3.5 h-3.5 ${loadingMore ? "animate-spin" : ""}`} />
            {loadingMore ? "جارٍ تحميل بقية العمليات…" : "تحميل العمليات الأقدم"}
          </Button>
        </div>
      )}
    </motion.div>
  );
}
