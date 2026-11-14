/**
 * StudentQrDialog
 * ---------------
 * Opens a modal showing the student's signed QR code fetched from
 * GET /api/qr/student/:id?raw=1 (PNG buffer from the server).
 *
 * Features:
 *  • Download PNG
 *  • Print (opens a dedicated print-only frame)
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { Download, Printer, QrCode, Loader2, RefreshCw } from "lucide-react";

const BASE = import.meta.env.BASE_URL;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  student: {
    id: string;
    nomPrenom: string;
    niveau: string;
    classe: string;
    annee?: string;
  } | null;
}

export function StudentQrDialog({ open, onOpenChange, student }: Props) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const printFrameRef = useRef<HTMLIFrameElement | null>(null);

  const fetchQr = useCallback(async () => {
    if (!student) return;
    setLoading(true);
    setError(null);
    setDataUrl(null);
    try {
      const res = await fetch(`${BASE}api/qr/student/${encodeURIComponent(student.id)}?size=300`, {
        credentials: "include",
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "فشل تحميل رمز QR");
      }
      const { dataUrl: url } = await res.json();
      setDataUrl(url);
    } catch (e: any) {
      setError(e.message ?? "خطأ غير متوقع");
    } finally {
      setLoading(false);
    }
  }, [student]);

  useEffect(() => {
    if (open && student) fetchQr();
    if (!open) { setDataUrl(null); setError(null); }
  }, [open, student, fetchQr]);

  const handleDownload = () => {
    if (!dataUrl || !student) return;
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `qr-${student.nomPrenom.replace(/\s+/g, "-")}.png`;
    a.click();
  };

  const handlePrint = () => {
    if (!dataUrl || !student) return;

    // Build a minimal print document
    const html = `<!DOCTYPE html>
<html dir="rtl">
<head>
<meta charset="utf-8" />
<title>QR — ${student.nomPrenom}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; font-family: Arial, sans-serif; padding: 20px; }
  .card { border: 2px solid #1e293b; border-radius: 12px; padding: 20px 24px; max-width: 260px; text-align: center; }
  img { width: 200px; height: 200px; }
  h2 { margin-top: 12px; font-size: 14px; font-weight: 700; color: #0f172a; }
  p  { margin-top: 4px; font-size: 11px; color: #475569; }
  @media print { body { -webkit-print-color-adjust: exact; } }
</style>
</head>
<body>
  <div class="card">
    <img src="${dataUrl}" alt="QR Code" />
    <h2>${student.nomPrenom}</h2>
    <p>${student.niveau} — الفوج ${student.classe}</p>
    ${student.annee ? `<p>${student.annee}</p>` : ""}
  </div>
  <script>window.onload = function() { window.print(); window.close(); }</script>
</body>
</html>`;

    const win = window.open("", "_blank", "width=400,height=500");
    if (win) { win.document.write(html); win.document.close(); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <QrCode className="w-5 h-5 text-blue-500" />
            رمز QR للتلميذ
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-2">
          {/* QR display */}
          <div className="relative w-52 h-52 rounded-2xl border-2 border-dashed border-muted-foreground/25 bg-muted/20 flex items-center justify-center overflow-hidden">
            <AnimatePresence mode="wait">
              {loading && (
                <motion.div key="load" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="flex flex-col items-center gap-2 text-muted-foreground">
                  <Loader2 className="w-8 h-8 animate-spin" />
                  <span className="text-xs">جاري الإنشاء…</span>
                </motion.div>
              )}
              {error && !loading && (
                <motion.div key="err" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="flex flex-col items-center gap-2 text-red-500 text-center px-3">
                  <p className="text-xs">{error}</p>
                  <Button size="sm" variant="outline" onClick={fetchQr} className="gap-1.5 text-xs h-7">
                    <RefreshCw className="w-3 h-3" /> إعادة المحاولة
                  </Button>
                </motion.div>
              )}
              {dataUrl && !loading && (
                <motion.img
                  key="qr"
                  src={dataUrl}
                  alt={`QR — ${student?.nomPrenom}`}
                  className="w-full h-full object-contain p-2 rounded-2xl"
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ type: "spring", stiffness: 300, damping: 24 }}
                />
              )}
            </AnimatePresence>
          </div>

          {/* Student info */}
          {student && (
            <div className="text-center">
              <p className="font-bold text-sm">{student.nomPrenom}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {student.niveau} — الفوج {student.classe}
              </p>
              {student.annee && (
                <p className="text-xs text-muted-foreground">{student.annee}</p>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 w-full">
            <Button
              className="flex-1 gap-1.5 text-xs h-9 bg-gradient-to-r from-blue-500 to-indigo-600 text-white border-0 shadow-sm"
              onClick={handleDownload}
              disabled={!dataUrl}
            >
              <Download className="w-3.5 h-3.5" />
              تحميل PNG
            </Button>
            <Button
              className="flex-1 gap-1.5 text-xs h-9"
              variant="outline"
              onClick={handlePrint}
              disabled={!dataUrl}
            >
              <Printer className="w-3.5 h-3.5" />
              طباعة
            </Button>
          </div>

          <p className="text-[10px] text-muted-foreground text-center">
            يحتوي رمز QR على هوية التلميذ وتوقيع مشفر آمن
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
