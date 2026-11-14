import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  MessageSquare, Send, Loader2, Save, Search, CheckCircle2, AlertCircle, RefreshCw,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL;
const YEARS = ["2026-2027", "2025-2026", "2024-2025", "2023-2024"];
const PHONE_RE = /^[+0-9()\-\s]{7,20}$/;
const MAX_BATCH = 100;

type Reason = "avg_below_10" | "high_absence" | "mustarrak" | "passed";

interface AlertRow {
  id: string;
  nomPrenom: string;
  niveau: string;
  classe: string;
  annee: string;
  parentPhone: string | null;
  annualAvg: number | null;
  unjustifiedHours: number;
  justifiedHours: number;
  reasons: Reason[];
}

type Filter = "all" | "no_phone" | Reason;

const REASON_LABEL: Record<Reason, string> = {
  avg_below_10: "معدل دون 10",
  high_absence: "غياب مرتفع",
  mustarrak: "مستدرك",
  passed: "ناجح",
};

const REASON_CLASS: Record<Reason, string> = {
  avg_below_10: "bg-rose-500/15 text-rose-400 border-rose-500/30",
  high_absence: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  mustarrak: "bg-sky-500/15 text-sky-400 border-sky-500/30",
  passed: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
};

const REASON_PRIORITY: Reason[] = ["high_absence", "avg_below_10", "mustarrak", "passed"];

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "الكل" },
  { id: "no_phone", label: "بدون هاتف" },
  { id: "high_absence", label: "غياب مرتفع" },
  { id: "avg_below_10", label: "معدل دون 10" },
  { id: "mustarrak", label: "مستدرك" },
  { id: "passed", label: "ناجحون" },
];

function buildMessage(row: AlertRow): string {
  const reason = REASON_PRIORITY.find(r => row.reasons.includes(r)) ?? "avg_below_10";
  const avg = row.annualAvg !== null ? row.annualAvg.toFixed(2) : "";
  const head = `السيد ولي أمر التلميذ(ة) ${row.nomPrenom}: `;
  switch (reason) {
    case "high_absence":
      return `${head}بلغ مجموع غياباته غير المبررة ${row.unjustifiedHours} ساعة. نرجو التواصل مع إدارة المؤسسة وتبرير الغياب.`;
    case "mustarrak":
      return `${head}معدله ${avg}/20 وهو قريب من المتوسط. نرجو متابعته للتحسن.`;
    case "passed":
      return `نهنئكم بنجاح ابنكم/ابنتكم ${row.nomPrenom} بمعدل ${avg}/20. مبارك عليكم.`;
    default:
      return `${head}معدله ${avg}/20 وهو دون المتوسط. نرجو التواصل مع إدارة المؤسسة.`;
  }
}

/** Arabic SMS: 70 chars for one message, 67 per part when it needs several. */
function countSegments(text: string): number {
  return text.length <= 70 ? 1 : Math.ceil(text.length / 67);
}

type SendResult = { ok: boolean; text: string };

async function sendSms(row: AlertRow, message: string, phone: string): Promise<SendResult> {
  try {
    const res = await fetch(`${BASE}api/sms/send`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentId: row.id, message, phone }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, text: data.error ?? data.message ?? `خطأ ${res.status}` };
    if (data.success === false) return { ok: false, text: data.message ?? "فشل الإرسال" };
    return { ok: true, text: "تم الإرسال" };
  } catch (error: any) {
    return { ok: false, text: error?.message ?? "خطأ في الاتصال" };
  }
}

export default function SmsPage() {
  const { toast } = useToast();

  const [annee, setAnnee] = useState("2026-2027");
  const [absThreshold, setAbsThreshold] = useState("10");
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const [rows, setRows] = useState<AlertRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [phones, setPhones] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<Record<string, SendResult>>({});
  const [bulkBusy, setBulkBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ annee, absThreshold: String(parseInt(absThreshold) || 10) });
      const res = await fetch(`${BASE}api/sms/alerts?${params}`, { credentials: "include" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setRows([]);
        setError((data as { error?: string } | null)?.error ?? `تعذر تحميل القائمة (${res.status})`);
        return;
      }
      setRows(Array.isArray(data) ? (data as AlertRow[]) : []);
      setSelected(new Set());
    } catch (e: any) {
      setError(e?.message ?? "تعذر تحميل القائمة");
    } finally {
      setLoading(false);
    }
  }, [annee, absThreshold]);

  useEffect(() => {
    void load();
  }, [load]);

  const phoneOf = (row: AlertRow) => (phones[row.id] ?? row.parentPhone ?? "").trim();
  const messageOf = (row: AlertRow) => drafts[row.id] ?? buildMessage(row);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(row => {
      if (q && !row.nomPrenom.toLowerCase().includes(q)) return false;
      if (filter === "all") return true;
      if (filter === "no_phone") return !(phones[row.id] ?? row.parentPhone);
      return row.reasons.includes(filter);
    });
  }, [rows, filter, query, phones]);

  const setBusy = (id: string, on: boolean) =>
    setBusyIds(prev => {
      const next = new Set(prev);
      if (on) next.add(id); else next.delete(id);
      return next;
    });

  async function savePhone(row: AlertRow) {
    const phone = (phones[row.id] ?? "").replace(/\s+/g, "");
    if (phone && !PHONE_RE.test(phone)) {
      toast({ variant: "destructive", title: "رقم غير صالح", description: "أدخل رقم هاتف صحيحاً" });
      return;
    }
    setBusy(row.id, true);
    try {
      const res = await fetch(`${BASE}api/students/${encodeURIComponent(row.id)}/phone`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "تعذر حفظ الرقم");
      setRows(prev => prev.map(r => (r.id === row.id ? { ...r, parentPhone: data.parentPhone ?? null } : r)));
      setPhones(prev => {
        const next = { ...prev };
        delete next[row.id];
        return next;
      });
      toast({ title: "تم حفظ رقم الولي" });
    } catch (e: any) {
      toast({ variant: "destructive", title: "تعذر حفظ الرقم", description: e?.message });
    } finally {
      setBusy(row.id, false);
    }
  }

  async function sendOne(row: AlertRow) {
    const phone = phoneOf(row);
    if (!PHONE_RE.test(phone)) {
      setResults(prev => ({ ...prev, [row.id]: { ok: false, text: "أدخل رقم هاتف صالحاً" } }));
      return;
    }
    const message = messageOf(row).trim();
    if (!message) {
      setResults(prev => ({ ...prev, [row.id]: { ok: false, text: "الرسالة فارغة" } }));
      return;
    }
    setBusy(row.id, true);
    const result = await sendSms(row, message, phone);
    setResults(prev => ({ ...prev, [row.id]: result }));
    setBusy(row.id, false);
    if (result.ok) setOpenId(null);
  }

  async function sendSelected() {
    const targets = filtered.filter(row => selected.has(row.id) && PHONE_RE.test(phoneOf(row))).slice(0, MAX_BATCH);
    if (targets.length === 0) {
      toast({ variant: "destructive", title: "لا يوجد مستلمون", description: "حدد تلاميذ لديهم أرقام هاتف صالحة" });
      return;
    }
    const parts = targets.reduce((sum, row) => sum + countSegments(messageOf(row)), 0);
    if (!window.confirm(`سيتم إرسال ${targets.length} رسالة (${parts} وحدة SMS). هل تريد المتابعة؟`)) return;

    setBulkBusy(true);
    let ok = 0;
    for (const row of targets) {
      const result = await sendSms(row, messageOf(row).trim(), phoneOf(row));
      setResults(prev => ({ ...prev, [row.id]: result }));
      if (result.ok) ok += 1;
      await new Promise(resolve => window.setTimeout(resolve, 300));
    }
    setBulkBusy(false);
    setSelected(new Set());
    toast({
      variant: ok === targets.length ? "default" : "destructive",
      title: `أُرسلت ${ok} من ${targets.length} رسالة`,
      description: ok < targets.length ? "راجع الصفوف الحمراء لمعرفة السبب" : undefined,
    });
  }

  const toggle = (id: string) =>
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const allVisibleSelected = filtered.length > 0 && filtered.every(row => selected.has(row.id));

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-6 max-w-5xl mx-auto space-y-5"
      dir="rtl"
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <span className="inline-flex w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500 to-blue-700 items-center justify-center shadow-lg shadow-sky-500/30">
            <MessageSquare className="w-5 h-5 text-white" />
          </span>
          <div>
            <h1 className="text-xl font-bold">الرسائل القصيرة (SMS)</h1>
            <p className="text-xs text-muted-foreground">أرسل تنبيهات أو تهاني لأولياء التلاميذ</p>
          </div>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          تحديث
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Select value={annee} onValueChange={setAnnee}>
          <SelectTrigger><SelectValue placeholder="السنة" /></SelectTrigger>
          <SelectContent>{YEARS.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground whitespace-nowrap">حد الغياب غير المبرر (ساعة)</span>
          <Input
            type="number" min={1} value={absThreshold}
            onChange={e => setAbsThreshold(e.target.value)}
            className="w-20" dir="ltr"
          />
        </div>
        <div className="relative">
          <Search className="w-4 h-4 absolute top-1/2 -translate-y-1/2 start-3 text-muted-foreground" />
          <Input
            placeholder="ابحث باسم التلميذ…" value={query}
            onChange={e => setQuery(e.target.value)} className="ps-9"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map(item => (
          <button
            key={item.id}
            type="button"
            onClick={() => setFilter(item.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
              filter === item.id
                ? "bg-sky-500/15 border-sky-500/50 text-sky-300"
                : "border-border text-muted-foreground hover:border-sky-500/30"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="flex items-start gap-2 text-sm rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2" role="alert">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {filtered.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/30 px-3 py-2">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={allVisibleSelected}
              onChange={() =>
                setSelected(allVisibleSelected ? new Set() : new Set(filtered.filter(r => phoneOf(r)).map(r => r.id)))
              }
            />
            تحديد الكل (الذين لديهم هاتف)
          </label>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">{selected.size} محدد · {filtered.length} ظاهر</span>
            <Button
              size="sm" className="gap-1.5"
              disabled={bulkBusy || selected.size === 0}
              onClick={() => void sendSelected()}
            >
              {bulkBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              إرسال للمحدد
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
          <Loader2 className="w-5 h-5 animate-spin" /> جارٍ التحميل…
        </div>
      ) : filtered.length === 0 && !error ? (
        <p className="text-center text-sm text-muted-foreground py-16">
          لا توجد حالات تحتاج إلى رسائل في هذا الاختيار.
        </p>
      ) : (
        <div className="space-y-2">
          {filtered.map(row => {
            const phone = phoneOf(row);
            const phoneDirty = (phones[row.id] ?? row.parentPhone ?? "") !== (row.parentPhone ?? "");
            const busy = busyIds.has(row.id);
            const result = results[row.id];
            const isOpen = openId === row.id;
            const message = messageOf(row);
            return (
              <div key={row.id} className="rounded-xl border p-3 space-y-2">
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    type="checkbox"
                    checked={selected.has(row.id)}
                    onChange={() => toggle(row.id)}
                    aria-label={`تحديد ${row.nomPrenom}`}
                  />
                  <div className="min-w-[180px] flex-1">
                    <p className="font-semibold text-sm">{row.nomPrenom}</p>
                    <p className="text-xs text-muted-foreground">
                      {row.niveau} · {row.classe}
                      {row.annualAvg !== null && ` · المعدل ${row.annualAvg.toFixed(2)}`}
                      {row.unjustifiedHours > 0 && ` · غياب غير مبرر ${row.unjustifiedHours}س`}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {row.reasons.map(reason => (
                      <Badge key={reason} variant="outline" className={`text-[10px] ${REASON_CLASS[reason]}`}>
                        {REASON_LABEL[reason]}
                      </Badge>
                    ))}
                  </div>
                  <div className="flex items-center gap-1">
                    <Input
                      value={phones[row.id] ?? row.parentPhone ?? ""}
                      onChange={e => setPhones(prev => ({ ...prev, [row.id]: e.target.value }))}
                      placeholder="هاتف الولي"
                      className="h-8 w-36 text-xs" dir="ltr"
                      aria-label={`هاتف ولي ${row.nomPrenom}`}
                    />
                    {phoneDirty && (
                      <Button size="icon" variant="outline" className="h-8 w-8" disabled={busy} onClick={() => void savePhone(row)} title="حفظ الرقم">
                        <Save className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                  <Button
                    size="sm" variant={isOpen ? "default" : "outline"} className="gap-1.5 h-8"
                    onClick={() => setOpenId(isOpen ? null : row.id)}
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    رسالة
                  </Button>
                </div>

                {result && (
                  <p className={`flex items-center gap-1.5 text-xs ${result.ok ? "text-emerald-500" : "text-red-500"}`}>
                    {result.ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                    {result.text}
                  </p>
                )}

                {isOpen && (
                  <div className="space-y-2">
                    <textarea
                      value={message}
                      onChange={e => setDrafts(prev => ({ ...prev, [row.id]: e.target.value }))}
                      rows={3}
                      className="w-full rounded-md border bg-transparent p-2 text-sm"
                      dir="rtl"
                      aria-label="نص الرسالة"
                    />
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs text-muted-foreground">
                        {message.length} حرف · {countSegments(message)} {countSegments(message) === 1 ? "رسالة" : "رسائل"}
                      </span>
                      <Button
                        size="sm" className="gap-1.5"
                        disabled={busy || !phone}
                        onClick={() => void sendOne(row)}
                      >
                        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                        إرسال
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}