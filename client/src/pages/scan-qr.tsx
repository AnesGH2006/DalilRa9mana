/**
 * /scan-qr — QR Scanner Page  (v2)
 *
 * Two entry modes:
 *
 * A) DIRECT URL — phone camera scans the QR and opens:
 *      https://yourapp/scan-qr?sid=<studentId>&sig=<hmac>
 *    The page reads the query params on mount, verifies via the API,
 *    and shows the student card — no in-browser camera needed.
 *
 * B) IN-APP SCANNER — teacher opens the page manually, grants camera,
 *    and scans the QR with html5-qrcode. The decoded text is a URL
 *    (mode A) or legacy JSON — both are handled.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { useLocation, useSearch } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  QrCode, CheckCircle2, ScanLine, AlertCircle,
  RotateCcw, Users, Camera, Link2,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL;

interface ScannedStudent {
  id: string;
  nomPrenom: string;
  niveau: string;
  classe: string;
  annee: string;
  parentPhone?: string | null;
  dateNaissance?: string | null;
}

const SCANNER_ID = "cem-qr-reader";

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Extract { sid, sig } from a URL string or null if it's not a QR URL. */
function extractUrlParams(text: string): { sid: string; sig: string } | null {
  try {
    // Allow both absolute URLs and relative "/scan-qr?…" strings
    const url = text.startsWith("http") ? new URL(text) : new URL(text, window.location.origin);
    const sid = url.searchParams.get("sid");
    const sig = url.searchParams.get("sig");
    if (sid && sig) return { sid, sig };
  } catch { /* not a URL */ }
  return null;
}

/** Try to parse legacy JSON payload `{ sid, … }`. */
function extractJsonSid(text: string): string | null {
  try {
    const obj = JSON.parse(text);
    if (typeof obj?.sid === "string") return obj.sid;
  } catch { /* not JSON */ }
  return null;
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function ScanQrPage() {
  const [, navigate]  = useLocation();
  const searchString  = useSearch();                    // wouter gives us the raw ?… string
  const urlParams     = new URLSearchParams(searchString);
  const sidFromUrl    = urlParams.get("sid");
  const sigFromUrl    = urlParams.get("sig");

  // Direct-URL mode when query params are present
  const isDirectMode  = Boolean(sidFromUrl && sigFromUrl);

  const [phase,   setPhase]   = useState<"scanning" | "loading" | "found" | "error">(
    isDirectMode ? "loading" : "scanning",
  );
  const [student, setStudent] = useState<ScannedStudent | null>(null);
  const [errMsg,  setErrMsg]  = useState("");
  const scannerRef  = useRef<any>(null);
  const mountedRef  = useRef(true);

  // ── Fetch student by ID ──────────────────────────────────────────────────────
  const fetchStudent = useCallback(async (studentId: string): Promise<void> => {
    setPhase("loading");
    try {
      const res = await fetch(
        `${BASE}api/students/${encodeURIComponent(studentId)}`,
        { credentials: "include" },
      );
      if (res.ok) {
        const data = await res.json();
        setStudent(data);
        setPhase("found");
      } else if (res.status === 401) {
        // Not logged in — redirect to home (login page)
        window.location.href = `/`;
      } else {
        setErrMsg("التلميذ غير موجود أو انتهت صلاحية الرمز");
        setPhase("error");
      }
    } catch {
      setErrMsg("تعذّر الاتصال بالخادم");
      setPhase("error");
    }
  }, []);

  // ── Mode A: direct URL — run once on mount ───────────────────────────────────
  useEffect(() => {
    if (isDirectMode && sidFromUrl) {
      fetchStudent(sidFromUrl);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Mode B: in-app camera scanner ────────────────────────────────────────────
  const startScanner = useCallback(async () => {
    if (isDirectMode) return; // no camera in direct mode

    const { Html5QrcodeScanner } = await import("html5-qrcode");

    const scanner = new Html5QrcodeScanner(
      SCANNER_ID,
      {
        fps: 10,
        qrbox: { width: 260, height: 260 },
        rememberLastUsedCamera: true,
        showTorchButtonIfSupported: true,
      },
      false,
    );
    scannerRef.current = scanner;

    scanner.render(
      async (text: string) => {
        if (!mountedRef.current) return;
        try { await scanner.clear(); } catch { /* ignore */ }

        // Determine student ID from decoded text
        let studentId: string | null = null;

        // 1. URL format (new)
        const fromUrl = extractUrlParams(text);
        if (fromUrl) {
          studentId = fromUrl.sid;
        } else {
          // 2. Legacy JSON format
          studentId = extractJsonSid(text);
        }

        if (!studentId) {
          setErrMsg("رمز QR غير صالح — لا يحتوي على معرّف تلميذ");
          setPhase("error");
          return;
        }

        await fetchStudent(studentId);
      },
      () => { /* scanning frame errors are normal — ignore */ },
    );
  }, [isDirectMode, fetchStudent]);

  useEffect(() => {
    mountedRef.current = true;
    if (!isDirectMode) startScanner();

    return () => {
      mountedRef.current = false;
      scannerRef.current?.clear().catch(() => {});
      scannerRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Reset ────────────────────────────────────────────────────────────────────
  const handleReset = useCallback(async () => {
    setStudent(null);
    setErrMsg("");
    setPhase("scanning");
    await startScanner();
  }, [startScanner]);

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.4 }}
      className="min-h-screen bg-background flex flex-col items-center p-6 gap-6"
      dir="rtl"
    >
      {/* Header */}
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-1">
          <span className="inline-flex w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 items-center justify-center shadow-lg shadow-blue-500/30">
            <QrCode className="w-5 h-5 text-white" />
          </span>
          <div>
            <h1 className="text-xl font-bold">
              {isDirectMode ? "معلومات التلميذ" : "مسح رمز QR"}
            </h1>
            <p className="text-xs text-muted-foreground">
              {isDirectMode
                ? "تم التعرف على التلميذ عبر رمز QR"
                : "وجّه الكاميرا نحو رمز QR الخاص بالتلميذ"}
            </p>
          </div>
          {/* Mode badge */}
          <span className={`ms-auto flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
            isDirectMode
              ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
              : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
          }`}>
            {isDirectMode ? <><Link2 className="w-2.5 h-2.5" />رابط مباشر</> : <><Camera className="w-2.5 h-2.5" />كاميرا</>}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="w-full max-w-md">
        <AnimatePresence mode="wait">

          {/* ── Camera scanner (mode B, scanning state) ── */}
          {phase === "scanning" && !isDirectMode && (
            <motion.div
              key="scanner"
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="rounded-2xl overflow-hidden border border-border shadow-lg bg-card"
            >
              <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/30 border-b border-border">
                <motion.div
                  className="w-2 h-2 rounded-full bg-emerald-500"
                  animate={{ opacity: [1, 0.3, 1] }}
                  transition={{ duration: 1.4, repeat: Infinity }}
                />
                <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">جاري المسح…</span>
                <ScanLine className="w-3.5 h-3.5 text-muted-foreground ms-auto" />
              </div>
              <div id={SCANNER_ID} className="w-full" />
              <p className="text-center text-xs text-muted-foreground px-4 py-3">
                قد يطلب المتصفح الإذن باستخدام الكاميرا — اقبل الطلب لبدء المسح
              </p>
            </motion.div>
          )}

          {/* ── Loading ── */}
          {phase === "loading" && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center gap-4 py-24 rounded-2xl border border-border bg-card"
            >
              <motion.div
                className="w-14 h-14 border-4 border-blue-500 border-t-transparent rounded-full"
                animate={{ rotate: 360 }}
                transition={{ duration: 0.9, repeat: Infinity, ease: "linear" }}
              />
              <p className="text-sm text-muted-foreground">جاري جلب بيانات التلميذ…</p>
            </motion.div>
          )}

          {/* ── Student card ── */}
          {phase === "found" && student && (
            <motion.div
              key="found"
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="rounded-2xl border border-emerald-500/30 bg-emerald-50/30 dark:bg-emerald-950/20 overflow-hidden shadow-md"
            >
              <div className="flex items-center gap-3 px-5 py-4 bg-emerald-500/10 border-b border-emerald-500/20">
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 400, damping: 20 }}>
                  <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                </motion.div>
                <div>
                  <p className="font-bold text-emerald-700 dark:text-emerald-400">تم التعرف على التلميذ</p>
                  <p className="text-xs text-emerald-600/70">رمز QR صالح</p>
                </div>
              </div>

              <div className="px-5 py-5 space-y-3">
                <div>
                  <p className="text-lg font-bold">{student.nomPrenom}</p>
                  {student.dateNaissance && (
                    <p className="text-xs text-muted-foreground">تاريخ الميلاد: {student.dateNaissance}</p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: "المستوى",    value: student.niveau },
                    { label: "الفوج",      value: student.classe },
                    { label: "السنة",      value: student.annee  },
                    ...(student.parentPhone
                      ? [{ label: "هاتف الولي", value: student.parentPhone }]
                      : []),
                  ].map(({ label, value }) => (
                    <div key={label} className="rounded-xl bg-background border border-border px-3 py-2">
                      <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
                      <p className="font-semibold text-sm mt-0.5">{value}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="px-5 pb-5 flex gap-2">
                <Button
                  className="flex-1 gap-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white border-0 shadow-sm"
                  onClick={() => navigate(`/students?highlight=${encodeURIComponent(student.id)}`)}
                >
                  <Users className="w-4 h-4" />
                  عرض في قائمة التلاميذ
                </Button>
                {!isDirectMode && (
                  <Button variant="outline" className="gap-1.5" onClick={handleReset}>
                    <RotateCcw className="w-4 h-4" />
                    مسح آخر
                  </Button>
                )}
              </div>
            </motion.div>
          )}

          {/* ── Error ── */}
          {phase === "error" && (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="rounded-2xl border border-red-500/30 bg-red-50/30 dark:bg-red-950/20 p-6 flex flex-col items-center gap-4 shadow-md"
            >
              <AlertCircle className="w-12 h-12 text-red-500" />
              <p className="text-sm text-red-700 dark:text-red-400 text-center">{errMsg}</p>
              {!isDirectMode && (
                <Button variant="outline" className="gap-2" onClick={handleReset}>
                  <RotateCcw className="w-4 h-4" />
                  حاول مرة أخرى
                </Button>
              )}
            </motion.div>
          )}

        </AnimatePresence>
      </div>

      {/* Tips for camera mode */}
      {phase === "scanning" && !isDirectMode && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
          className="w-full max-w-md rounded-xl border border-border bg-muted/30 p-4 text-xs text-muted-foreground space-y-1"
        >
          <p className="font-semibold text-foreground mb-2">نصائح للمسح الجيد</p>
          <p>• ضع رمز QR في منتصف الإطار مع إضاءة كافية</p>
          <p>• اقترب أو ابتعد تدريجيًا حتى يُقرأ الرمز</p>
          <p>• يمكن للكاميرا الخارجية (هاتف) مسح الرمز مباشرة</p>
        </motion.div>
      )}
    </motion.div>
  );
}
