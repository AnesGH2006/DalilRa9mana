import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, X, Smartphone, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePwaInstall } from "@/hooks/use-pwa-install";
import { SCHOOL_STAGE } from "@/lib/deployment";

export function PwaInstallPrompt() {
  const { canInstall, install, justInstalled } = usePwaInstall();
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const raw = localStorage.getItem("pwa-prompt-dismissed");
    if (raw && Date.now() - Number(raw) < 7 * 24 * 60 * 60 * 1000) {
      setDismissed(true);
    }
  }, []);

  useEffect(() => {
    if (canInstall && !dismissed) {
      const t = setTimeout(() => setShow(true), 3000);
      return () => clearTimeout(t);
    } else {
      setShow(false);
    }
  }, [canInstall, dismissed]);

  const handleInstall = async () => {
    setShow(false);
    await install();
  };

  const handleDismiss = () => {
    setShow(false);
    setDismissed(true);
    localStorage.setItem("pwa-prompt-dismissed", String(Date.now()));
  };

  return (
    <>
      {/* Floating install prompt */}
      <AnimatePresence>
        {show && (
          <motion.div
            initial={{ y: 120, opacity: 0, scale: 0.95 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 120, opacity: 0, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 280, damping: 28 }}
            className="fixed bottom-4 start-4 end-4 sm:start-auto sm:end-4 sm:w-[340px] z-50 no-print"
          >
            <div className="bg-slate-900 text-white rounded-2xl shadow-2xl shadow-black/50 border border-white/10 overflow-hidden">
              {/* Header */}
              <div className="relative px-4 pt-4 pb-3 bg-gradient-to-br from-blue-600/20 via-indigo-600/15 to-violet-600/10">
                <div className="absolute top-0 end-0 w-32 h-32 rounded-full bg-indigo-500/10 blur-2xl pointer-events-none" />
                <div className="flex items-start gap-3 relative">
                  <motion.div
                    className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0 shadow-lg shadow-blue-500/30"
                    animate={{ rotate: [0, -8, 8, 0] }}
                    transition={{ duration: 2.5, repeat: Infinity, repeatDelay: 3 }}
                  >
                    <Smartphone className="w-5 h-5 text-white" />
                  </motion.div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm leading-tight">تثبيت التطبيق</p>
                    <p className="text-white/65 text-xs mt-1 leading-relaxed">
                      أضف مدير {SCHOOL_STAGE === "lycee" ? "الثانوية" : "المتوسطة"} إلى الشاشة الرئيسية للوصول السريع
                    </p>
                  </div>
                  <button
                    onClick={handleDismiss}
                    className="text-white/35 hover:text-white/70 transition-colors shrink-0 -mt-0.5 p-0.5 rounded"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Benefits */}
              <div className="px-4 py-2 flex gap-4 text-[10px] text-white/50">
                {["يعمل بدون إنترنت", "أسرع وأخف", "على شاشتك مباشرة"].map((b, i) => (
                  <span key={i} className="flex items-center gap-1">
                    <span className="w-1 h-1 rounded-full bg-indigo-400" />
                    {b}
                  </span>
                ))}
              </div>

              {/* Actions */}
              <div className="px-4 pb-4 flex items-center gap-2 border-t border-white/8 pt-3">
                <Button
                  size="sm"
                  onClick={handleInstall}
                  className="flex-1 gap-1.5 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white border-0 shadow-md shadow-blue-500/25 font-semibold text-xs h-8"
                >
                  <Download className="w-3.5 h-3.5" />
                  تثبيت الآن
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleDismiss}
                  className="text-white/50 hover:text-white hover:bg-white/10 text-xs h-8 px-3"
                >
                  لاحقاً
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Success toast */}
      <AnimatePresence>
        {justInstalled && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 26 }}
            className="fixed bottom-4 end-4 z-50 no-print"
          >
            <div className="flex items-center gap-3 bg-emerald-600 text-white px-4 py-3 rounded-xl shadow-xl shadow-emerald-900/30">
              <CheckCircle2 className="w-5 h-5 shrink-0" />
              <p className="text-sm font-semibold">تم تثبيت التطبيق بنجاح 🎉</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
