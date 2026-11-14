import { useState, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle } from "lucide-react";
import { CountUp } from "@/components/count-up";

const BASE = import.meta.env.BASE_URL;

interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

interface QuickImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (result: ImportResult) => void;
}

export function QuickImportDialog({ open, onOpenChange, onSuccess }: QuickImportDialogProps) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const reset = () => {
    setResult(null);
    setDragOver(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleOpenChange = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const doImport = async (file: File) => {
    setImporting(true);
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch(`${BASE}api/students/import`, { method: "POST", body: form, credentials: "include" });
      const data = await res.json();
      if (res.ok) {
        setResult(data);
        onSuccess?.(data);
      } else {
        toast({ variant: "destructive", title: "خطأ في الاستيراد", description: data.error });
      }
    } catch {
      toast({ variant: "destructive", title: "خطأ في الاتصال" });
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && /\.(xlsx|xls)$/i.test(file.name)) doImport(file);
    else toast({ variant: "destructive", title: "يجب أن يكون الملف بصيغة .xlsx أو .xls" });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center">
              <Upload className="w-4 h-4 text-white" />
            </div>
            استيراد التلاميذ
          </DialogTitle>
        </DialogHeader>

        <AnimatePresence mode="wait">
          {!result ? (
            <motion.div key="upload" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {/* Drop zone */}
              <div
                className={`relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200
                  ${dragOver ? "border-blue-500 bg-blue-50 dark:bg-blue-950/20" : "border-muted-foreground/25 hover:border-blue-400 hover:bg-muted/30"}`}
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                onClick={() => !importing && fileRef.current?.click()}
              >
                <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) doImport(f); }} />

                <motion.div animate={dragOver ? { scale: 1.12 } : { scale: 1 }} transition={{ type: "spring", stiffness: 300 }}>
                  {importing ? (
                    <motion.div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-3"
                      animate={{ rotate: 360 }} transition={{ duration: 0.9, repeat: Infinity, ease: "linear" }} />
                  ) : (
                    <motion.div className={`w-12 h-12 rounded-xl ${dragOver ? "bg-blue-500" : "bg-blue-500/10"} flex items-center justify-center mx-auto mb-3`}
                      animate={dragOver ? {} : { y: [0, -4, 0] }} transition={{ duration: 2, repeat: Infinity }}>
                      <FileSpreadsheet className={`w-6 h-6 ${dragOver ? "text-white" : "text-blue-500"}`} />
                    </motion.div>
                  )}
                </motion.div>

                <p className="font-semibold text-foreground mb-1">
                  {importing ? "جارٍ الاستيراد..." : "أسقط ملف Excel هنا"}
                </p>
                <p className="text-xs text-muted-foreground">أو انقر للاختيار — يقبل .xlsx و .xls</p>
              </div>

              {/* Hints */}
              <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                <p>⚡ يدعم ملفات منظومة <strong>أمتي</strong> والملفات العادية (.xlsx)</p>
                <p>🔍 يتعرف تلقائياً على الأعمدة والمستوى وجنس التلميذ</p>
              </div>
            </motion.div>
          ) : (
            <motion.div key="result" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              <div className="flex items-center gap-2">
                {result.imported > 0
                  ? <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                  : <AlertCircle className="w-5 h-5 text-amber-500" />}
                <span className="font-semibold">{result.imported > 0 ? "تم الاستيراد بنجاح" : "نتيجة الاستيراد"}</span>
              </div>

              <div className="flex gap-3">
                <div className="flex-1 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 p-4 text-center">
                  <p className="text-3xl font-extrabold text-emerald-600"><CountUp to={result.imported} duration={0.8} /></p>
                  <p className="text-xs text-muted-foreground mt-1">تم الاستيراد</p>
                </div>
                <div className="flex-1 rounded-xl bg-amber-50 dark:bg-amber-950/30 p-4 text-center">
                  <p className="text-3xl font-extrabold text-amber-600"><CountUp to={result.skipped} duration={0.8} /></p>
                  <p className="text-xs text-muted-foreground mt-1">تم التخطي</p>
                </div>
              </div>

              {result.imported > 0 && (
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <motion.div className="h-full bg-emerald-500 rounded-full" initial={{ width: 0 }}
                    animate={{ width: `${(result.imported / (result.imported + result.skipped)) * 100}%` }}
                    transition={{ duration: 1, delay: 0.2 }} />
                </div>
              )}

              {result.errors.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">ملاحظات</p>
                  <div className="rounded-lg border bg-muted/40 p-3 max-h-36 overflow-y-auto space-y-1">
                    {result.errors.map((e, i) => (
                      <p key={i} className="text-xs text-amber-700 dark:text-amber-400 font-mono">{e}</p>
                    ))}
                  </div>
                </div>
              )}

              <Button variant="outline" size="sm" className="w-full" onClick={reset}>
                استيراد ملف آخر
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        <DialogFooter>
          <Button variant="ghost" onClick={() => handleOpenChange(false)}>إغلاق</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface QuickImportButtonProps {
  onSuccess?: (result: ImportResult) => void;
  variant?: "default" | "outline" | "ghost";
  size?: "sm" | "default" | "lg" | "icon";
  className?: string;
  label?: string;
}

export function QuickImportButton({ onSuccess, variant = "outline", size = "sm", className, label }: QuickImportButtonProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} size={size} className={className} onClick={() => setOpen(true)} data-testid="button-quick-import">
        <Upload className="w-3.5 h-3.5" />
        {label ?? "استيراد"}
      </Button>
      <QuickImportDialog open={open} onOpenChange={setOpen} onSuccess={onSuccess} />
    </>
  );
}
