import { useState, useRef, useCallback, useId } from "react";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Upload, FileSpreadsheet, CheckCircle2, AlertCircle, X,
  Loader2, ChevronDown, ChevronUp, Trash2, Play, RotateCcw,
  Users, FolderOpen, Clock,
} from "lucide-react";
import { CountUp } from "@/components/count-up";

const BASE = import.meta.env.BASE_URL;

// ── Types ─────────────────────────────────────────────────────────────────────
type FileStatus = "pending" | "uploading" | "success" | "error";

interface FileItem {
  id: string;
  file: File;
  status: FileStatus;
  detectedLevel: string | null;
  detectedGroup: string | null;
  estimatedCount: number | null;
  imported: number | null;
  skipped: number | null;
  errors: string[];
  errorMsg: string | null;
}

interface BatchSummary {
  totalFiles: number;
  successFiles: number;
  errorFiles: number;
  totalImported: number;
  totalSkipped: number;
  byLevel: Record<string, number>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const YEARS = ["2023-2024", "2024-2025", "2025-2026", "2026-2027"];

function parseFilename(name: string): { level: string | null; group: string | null } {
  const n = name.toLowerCase().replace(/[_\-\s]+/g, " ");
  let level: string | null = null;
  let group: string | null = null;

  // Level detection
  if (/4\s*am|quatri|رابع/.test(n)) level = "4AM";
  else if (/3\s*am|troisi|ثالث/.test(n)) level = "3AM";
  else if (/2\s*am|deuxi|ثاني/.test(n)) level = "2AM";
  else if (/1\s*am|premi|اول/.test(n)) level = "1AM";

  // Group detection
  const gMatch = n.match(/(?:foj|فوج|grp|group|classe|قسم|g)\s*(\d+)/i)
    ?? n.match(/(\d+)\s*(?:foj|فوج)/i)
    ?? n.match(/__(\d+)_/)
    ?? n.match(/_(\d+)\./);
  if (gMatch) group = gMatch[1]!;

  return { level, group };
}

function estimateStudentCount(file: File): number {
  // rough: 1KB ~ 5-8 students for typical ministry files
  return Math.round(file.size / 200);
}

function levelColor(level: string | null) {
  if (level === "1AM") return "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300";
  if (level === "2AM") return "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300";
  if (level === "3AM") return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300";
  if (level === "4AM") return "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300";
  return "bg-muted text-muted-foreground";
}

// ── Animations ────────────────────────────────────────────────────────────────
const pageVariants = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.4 } },
  exit:    { opacity: 0, y: -8, transition: { duration: 0.2 } },
};

const itemVariants = {
  initial: { opacity: 0, x: -16, scale: 0.97 },
  animate: { opacity: 1, x: 0, scale: 1, transition: { type: "spring" as const, stiffness: 280, damping: 24 } },
  exit:    { opacity: 0, x: 16, scale: 0.95, transition: { duration: 0.18 } },
};

// ── File card ─────────────────────────────────────────────────────────────────
function FileCard({
  item, onRemove, showErrors,
}: {
  item: FileItem;
  onRemove: (id: string) => void;
  showErrors: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  const statusIcon = () => {
    if (item.status === "uploading") return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
    if (item.status === "success")   return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
    if (item.status === "error")     return <AlertCircle className="w-4 h-4 text-red-500" />;
    return <FileSpreadsheet className="w-4 h-4 text-muted-foreground" />;
  };

  const statusText = () => {
    if (item.status === "uploading") return <span className="text-blue-500 font-medium">جارٍ الرفع...</span>;
    if (item.status === "success")   return <span className="text-emerald-600 font-medium">تم — {item.imported} تلميذ</span>;
    if (item.status === "error")     return <span className="text-red-500 font-medium">{item.errorMsg ?? "خطأ"}</span>;
    return <span className="text-muted-foreground">في الانتظار</span>;
  };

  const bgClass = item.status === "success" ? "border-emerald-200 dark:border-emerald-800 bg-emerald-50/40 dark:bg-emerald-950/10"
    : item.status === "error" ? "border-red-200 dark:border-red-800 bg-red-50/40 dark:bg-red-950/10"
    : item.status === "uploading" ? "border-blue-200 dark:border-blue-800 bg-blue-50/40 dark:bg-blue-950/10"
    : "border-border bg-card";

  return (
    <motion.div variants={itemVariants} layout
      className={`rounded-xl border p-3 transition-colors duration-200 ${bgClass}`}>
      <div className="flex items-center gap-3">
        {/* Status icon */}
        <div className="shrink-0">{statusIcon()}</div>

        {/* File info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium truncate max-w-[200px]">{item.file.name}</span>
            {item.detectedLevel && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${levelColor(item.detectedLevel)}`}>
                {item.detectedLevel}
              </span>
            )}
            {item.detectedGroup && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                فوج {item.detectedGroup}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-xs">{statusText()}</span>
            {item.status === "pending" && item.estimatedCount && (
              <span className="text-xs text-muted-foreground">~{item.estimatedCount} تلميذ</span>
            )}
            {item.status === "success" && item.skipped != null && item.skipped > 0 && (
              <span className="text-xs text-amber-500">{item.skipped} متخطي</span>
            )}
            {item.status === "success" && item.errors.length > 0 && (
              <button onClick={() => setExpanded(v => !v)}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5">
                {item.errors.length} تحذير
                {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
            )}
          </div>
        </div>

        {/* Upload animation bar */}
        {item.status === "uploading" && (
          <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden shrink-0">
            <motion.div className="h-full bg-blue-500 rounded-full"
              animate={{ x: ["-100%", "100%"] }}
              transition={{ duration: 1, repeat: Infinity, ease: "easeInOut" }}
              style={{ width: "60%" }} />
          </div>
        )}

        {/* Remove button */}
        {item.status === "pending" && (
          <motion.button whileTap={{ scale: 0.85 }} onClick={() => onRemove(item.id)}
            className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors">
            <X className="w-3.5 h-3.5" />
          </motion.button>
        )}
      </div>

      {/* Errors */}
      <AnimatePresence>
        {expanded && item.errors.length > 0 && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="mt-2 pt-2 border-t border-border space-y-0.5 max-h-24 overflow-y-auto">
              {item.errors.slice(0, 10).map((e, i) => (
                <p key={i} className="text-[10px] text-amber-600 dark:text-amber-400 font-mono">{e}</p>
              ))}
              {item.errors.length > 10 && (
                <p className="text-[10px] text-muted-foreground">...و {item.errors.length - 10} أخرى</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Summary modal ─────────────────────────────────────────────────────────────
function SummaryModal({ summary, open, onClose }: {
  summary: BatchSummary | null; open: boolean; onClose: () => void;
}) {
  if (!summary) return null;
  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
            ملخص الاستيراد
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* KPIs */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "ملفات ناجحة", value: summary.successFiles, color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/30" },
              { label: "تلاميذ مستوردون", value: summary.totalImported, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-950/30" },
              { label: "فشل", value: summary.errorFiles, color: summary.errorFiles > 0 ? "text-red-600" : "text-muted-foreground", bg: "bg-muted/40" },
            ].map((k, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08 }}
                className={`rounded-xl ${k.bg} p-3 text-center`}>
                <p className={`text-2xl font-extrabold ${k.color}`}><CountUp to={k.value} duration={0.8} /></p>
                <p className="text-xs text-muted-foreground mt-0.5">{k.label}</p>
              </motion.div>
            ))}
          </div>

          {/* By level */}
          {Object.keys(summary.byLevel).length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">حسب المستوى</p>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(summary.byLevel).sort().map(([level, count]) => (
                  <div key={level} className={`flex items-center justify-between rounded-lg px-3 py-1.5 ${levelColor(level)}`}>
                    <span className="text-xs font-bold">{level}</span>
                    <span className="text-xs font-bold">{count} تلميذ</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Skipped */}
          {summary.totalSkipped > 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              ⚠️ تم تخطي {summary.totalSkipped} صف (بيانات ناقصة أو مكررة)
            </p>
          )}
        </div>
        <DialogFooter>
          <Button onClick={onClose}>حسناً</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function ImportPage() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [annee, setAnnee] = useState("");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [summary, setSummary] = useState<BatchSummary | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  // ── Add files ───────────────────────────────────────────────────────────────
  const addFiles = useCallback((incoming: File[]) => {
    const valid = incoming.filter(f => /\.(xlsx|xls)$/i.test(f.name));
    if (valid.length < incoming.length) {
      toast({ variant: "destructive", title: `${incoming.length - valid.length} ملف مرفوض`, description: "يجب أن تكون الملفات بصيغة .xlsx أو .xls" });
    }
    if (!valid.length) return;

    const newItems: FileItem[] = valid.map(f => {
      const { level, group } = parseFilename(f.name);
      return {
        id: `${f.name}-${f.size}-${Date.now()}-${Math.random()}`,
        file: f,
        status: "pending",
        detectedLevel: level,
        detectedGroup: group,
        estimatedCount: estimateStudentCount(f),
        imported: null, skipped: null,
        errors: [], errorMsg: null,
      };
    });
    setFiles(prev => [...prev, ...newItems]);
  }, [toast]);

  // ── Drop zone ───────────────────────────────────────────────────────────────
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    addFiles(Array.from(e.dataTransfer.files));
  };

  const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) { addFiles(Array.from(e.target.files)); }
    e.target.value = "";
  };

  // ── Remove file ─────────────────────────────────────────────────────────────
  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  };

  const clearAll = () => setFiles([]);
  const clearDone = () => setFiles(prev => prev.filter(f => f.status === "pending"));

  // ── Upload all ──────────────────────────────────────────────────────────────
  const uploadAll = async () => {
    const pending = files.filter(f => f.status === "pending");
    if (!pending.length) return;
    if (!annee) {
      toast({ variant: "destructive", title: "يجب اختيار السنة الدراسية", description: "اختر السنة الدراسية قبل رفع الملفات." });
      return;
    }
    setUploading(true);
    setProgress({ done: 0, total: pending.length });

    const batchSummary: BatchSummary = {
      totalFiles: pending.length, successFiles: 0, errorFiles: 0,
      totalImported: 0, totalSkipped: 0, byLevel: {},
    };

    for (let i = 0; i < pending.length; i++) {
      const item = pending[i]!;

      // Mark as uploading
      setFiles(prev => prev.map(f =>
        f.id === item.id ? { ...f, status: "uploading" } : f
      ));

      try {
        const form = new FormData();
        form.append("file", item.file);
        const res = await fetch(`${BASE}api/students/import?annee=${encodeURIComponent(annee)}`, {
          method: "POST", body: form, credentials: "include",
        });
        const data = await res.json();

        if (res.ok) {
          setFiles(prev => prev.map(f =>
            f.id === item.id ? {
              ...f, status: "success",
              imported: data.imported, skipped: data.skipped, errors: data.errors ?? [],
            } : f
          ));
          batchSummary.successFiles++;
          batchSummary.totalImported += data.imported ?? 0;
          batchSummary.totalSkipped  += data.skipped  ?? 0;
          if (item.detectedLevel) {
            batchSummary.byLevel[item.detectedLevel] =
              (batchSummary.byLevel[item.detectedLevel] ?? 0) + (data.imported ?? 0);
          }
        } else {
          setFiles(prev => prev.map(f =>
            f.id === item.id ? { ...f, status: "error", errorMsg: data.error ?? "خطأ غير معروف" } : f
          ));
          batchSummary.errorFiles++;
        }
      } catch {
        setFiles(prev => prev.map(f =>
          f.id === item.id ? { ...f, status: "error", errorMsg: "خطأ في الاتصال" } : f
        ));
        batchSummary.errorFiles++;
      }

      setProgress({ done: i + 1, total: pending.length });
    }

    setUploading(false);
    setProgress(null);
    setSummary(batchSummary);
    setSummaryOpen(true);
  };

  // ── Computed ─────────────────────────────────────────────────────────────────
  const pendingCount  = files.filter(f => f.status === "pending").length;
  const successCount  = files.filter(f => f.status === "success").length;
  const errorCount    = files.filter(f => f.status === "error").length;
  const totalImported = files.reduce((s, f) => s + (f.imported ?? 0), 0);
  const hasFiles      = files.length > 0;
  const hasPending    = pendingCount > 0;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit"
      className="p-6 space-y-6 max-w-3xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
          <h1 className="text-2xl font-bold">استيراد البيانات</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            ارفع ملفات Excel لجميع الأفواج دفعة واحدة
          </p>
        </motion.div>

        {/* Year selector */}
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
          className={`flex items-center gap-2 px-3 py-2 rounded-xl border-2 transition-colors ${
            annee
              ? "border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/20"
              : "border-amber-400 bg-amber-50 dark:border-amber-600 dark:bg-amber-950/30 animate-pulse"
          }`}>
          <Clock className={`w-4 h-4 shrink-0 ${annee ? "text-blue-500" : "text-amber-500"}`} />
          <span className={`text-sm font-semibold ${annee ? "text-blue-700 dark:text-blue-300" : "text-amber-700 dark:text-amber-300"}`}>
            السنة الدراسية:
          </span>
          <select value={annee} onChange={e => setAnnee(e.target.value)} disabled={uploading}
            className={`text-sm font-bold border-0 rounded-lg px-2 py-0.5 bg-transparent cursor-pointer focus:outline-none ${
              annee ? "text-blue-700 dark:text-blue-300" : "text-amber-600 dark:text-amber-400"
            }`}>
            <option value="">— اختر السنة —</option>
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </motion.div>
      </div>

      {/* Drop zone */}
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.08, type: "spring", stiffness: 240, damping: 22 }}
        className={`relative border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all duration-200
          ${dragOver
            ? "border-blue-500 bg-blue-50/80 dark:bg-blue-950/20 scale-[1.01]"
            : "border-muted-foreground/25 hover:border-blue-400 hover:bg-muted/20"}`}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input ref={fileInputRef} type="file" accept=".xlsx,.xls"
          multiple className="hidden" onChange={onFileInput}
          onClick={e => e.stopPropagation()} />

        <motion.div animate={dragOver ? { scale: 1.15, rotate: -5 } : { y: [0, -6, 0] }}
          transition={dragOver ? { type: "spring", stiffness: 300 } : { duration: 2.5, repeat: Infinity, ease: "easeInOut" }}>
          <div className={`w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center transition-colors
            ${dragOver ? "bg-blue-500" : "bg-blue-500/10"}`}>
            <FolderOpen className={`w-8 h-8 ${dragOver ? "text-white" : "text-blue-500"}`} />
          </div>
        </motion.div>

        <p className="text-lg font-semibold mb-1">
          {dragOver ? "أفلت الملفات هنا" : "اسحب وأفلت ملفات Excel هنا"}
        </p>
        <p className="text-sm text-muted-foreground mb-2">أو انقر لاختيار ملفات متعددة</p>
        <div className="flex items-center justify-center gap-3 text-xs text-muted-foreground">
          <span>يقبل .xlsx و .xls</span>
          <span>·</span>
          <span>حجم أقصى 20MB لكل ملف</span>
          <span>·</span>
          <span className="text-blue-500 font-medium">عدة ملفات دفعة واحدة</span>
        </div>
      </motion.div>

      {/* File queue */}
      <AnimatePresence>
        {hasFiles && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="space-y-3">

            {/* Queue header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold">{files.length} ملف</span>
                <div className="flex gap-1.5">
                  {pendingCount > 0 && (
                    <Badge variant="secondary" className="text-xs px-2 py-0.5">
                      ⏳ {pendingCount} في الانتظار
                    </Badge>
                  )}
                  {successCount > 0 && (
                    <Badge className="text-xs px-2 py-0.5 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                      ✅ {successCount} ناجح
                    </Badge>
                  )}
                  {errorCount > 0 && (
                    <Badge className="text-xs px-2 py-0.5 bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
                      ❌ {errorCount} فشل
                    </Badge>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                {successCount > 0 && (
                  <Button variant="ghost" size="sm" onClick={clearDone} className="text-xs gap-1">
                    <RotateCcw className="w-3 h-3" /> حذف الناجحة
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={clearAll} disabled={uploading}
                  className="text-xs gap-1 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20">
                  <Trash2 className="w-3 h-3" /> مسح الكل
                </Button>
              </div>
            </div>

            {/* Global progress bar */}
            <AnimatePresence>
              {progress && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                    <span className="font-medium text-blue-600">
                      جارٍ الاستيراد... {progress.done} من {progress.total}
                    </span>
                    <span>{Math.round((progress.done / progress.total) * 100)}%</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <motion.div className="h-full bg-blue-500 rounded-full"
                      animate={{ width: `${(progress.done / progress.total) * 100}%` }}
                      transition={{ duration: 0.4, ease: "easeOut" }} />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* File list */}
            <div className="space-y-2">
              <AnimatePresence mode="popLayout">
                {files.map(item => (
                  <FileCard key={item.id} item={item} onRemove={removeFile} showErrors={showErrors} />
                ))}
              </AnimatePresence>
            </div>

            {/* Total imported stat */}
            <AnimatePresence>
              {totalImported > 0 && (
                <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="flex items-center gap-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 px-4 py-3">
                  <Users className="w-5 h-5 text-emerald-600 shrink-0" />
                  <div>
                    <span className="text-sm font-bold text-emerald-700 dark:text-emerald-300">
                      <CountUp to={totalImported} duration={0.6} /> تلميذ مستورد
                    </span>
                    <span className="text-xs text-emerald-600 dark:text-emerald-400 ms-2">
                      من {successCount} ملف
                    </span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Action buttons */}
            <div className="flex gap-3 pt-1">
              <motion.div className="flex-1" whileHover={{ scale: hasPending && !uploading ? 1.01 : 1 }}
                whileTap={{ scale: 0.98 }}>
                <Button className="w-full gap-2 bg-blue-600 hover:bg-blue-700 text-white py-5 text-base rounded-xl"
                  onClick={uploadAll} disabled={!hasPending || uploading}>
                  {uploading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      جارٍ الاستيراد ({progress?.done}/{progress?.total})...
                    </>
                  ) : (
                    <>
                      <Play className="w-5 h-5" />
                      استيراد {pendingCount > 0 ? `${pendingCount} ملف` : "الكل"}
                    </>
                  )}
                </Button>
              </motion.div>
              <Button variant="outline" className="gap-2 py-5 rounded-xl"
                onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                <Upload className="w-4 h-4" /> إضافة
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Info box — shown when no files */}
      <AnimatePresence>
        {!hasFiles && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="rounded-xl bg-muted/50 border p-5 space-y-3">
            <p className="font-semibold text-sm">الأعمدة المدعومة في الملف:</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { col: "الاسم واللقب", note: "أو «اللقب» و«الاسم» كعمودين منفصلين", required: true },
                { col: "المستوى / السنة", note: "أولى/ثانية/ثالثة/رابعة أو 1AM…4AM", required: true },
                { col: "القسم / الفوج", note: "A, B, C أو أ، ب، ج — اختياري", required: false },
                { col: "الجنس", note: "يُستنتج تلقائياً من الاسم إذا غاب", required: false },
                { col: "تاريخ الميلاد", note: "اختياري", required: false },
                { col: "الوضعية / الإعادة", note: "جديد/معيد — اختياري", required: false },
              ].map((item, i) => (
                <motion.div key={i} className="flex items-start gap-2"
                  initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 + 0.15 }}>
                  <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${item.required ? "bg-blue-500" : "bg-muted-foreground/40"}`} />
                  <div>
                    <span className="text-sm font-semibold">{item.col}</span>
                    <span className="text-xs text-muted-foreground block">{item.note}</span>
                  </div>
                </motion.div>
              ))}
            </div>
            <div className="pt-1 space-y-1">
              <p className="text-xs text-muted-foreground">⚡ يدعم ملفات .xlsx الحقيقية وملفات .xls من منظومة أمتي</p>
              <p className="text-xs text-muted-foreground">🔍 يكشف المستوى والفوج تلقائياً من اسم الملف</p>
              <p className="text-xs text-muted-foreground">📦 يمكنك رفع كل ملفات الأفواج دفعة واحدة</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Summary modal */}
      <SummaryModal summary={summary} open={summaryOpen} onClose={() => setSummaryOpen(false)} />
    </motion.div>
  );
}