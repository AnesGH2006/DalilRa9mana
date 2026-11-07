/**
 * AgentInstallPrompt
 * ──────────────────
 * Floating bottom-left card that appears when the user is authenticated but
 * has no Desktop Agent token / no recent connection. Dismissible via
 * localStorage (won't re-appear for 7 days after dismiss).
 *
 * Mirrors the same lazy-mount pattern as PwaInstallPrompt.
 */

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, Copy, Check, Zap, Shield, Wifi, FolderSync, Monitor, ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";

const DISMISS_KEY = "agent_prompt_dismissed_until";
const DISMISS_DAYS = 7;

export function AgentInstallPrompt() {
  const [show, setShow] = useState(false);
  const [checked, setChecked] = useState(false);
  const [copied, setCopied] = useState(false);
  const [, navigate] = useLocation();

  const serverUrl = typeof window !== "undefined" ? window.location.origin : "https://dalilra9mana.onrender.com";

  useEffect(() => {
    const until = localStorage.getItem(DISMISS_KEY);
    if (until && Date.now() < Number(until)) {
      setChecked(true);
      return;
    }

    const id = setTimeout(() => {
      setShow(true);
      setChecked(true);
    }, 1500);

    return () => clearTimeout(id);
  }, []);

  const dismiss = () => {
    const until = Date.now() + DISMISS_DAYS * 24 * 60 * 60 * 1000;
    localStorage.setItem(DISMISS_KEY, String(until));
    setShow(false);
  };

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(serverUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore copy failures
    }
  };

  const goSetup = () => {
    dismiss();
    navigate("/agent");
  };

  if (!checked) return null;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="agent-install-prompt"
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.97 }}
          transition={{ type: "spring", stiffness: 260, damping: 24 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#020b18]/50 backdrop-blur-[2px]"
          dir="rtl"
        >
          <div className="pointer-events-auto w-[520px] max-w-[90vw] rounded-2xl border border-cyan-500/20 bg-[#081d33]/95 p-4 shadow-[0_20px_60px_rgba(0,0,0,0.45)]">
            <div className="mb-4 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={dismiss}
                className="rounded-full bg-white/5 px-2 py-1 text-[10px] font-medium text-slate-200/90 hover:bg-white/10"
              >
                إغلاق
              </button>
              <div className="inline-flex items-center gap-2 rounded-full bg-cyan-500/10 px-3 py-1 text-[11px] font-semibold text-cyan-300 ring-1 ring-cyan-500/20">
                <Monitor className="h-3.5 w-3.5" />
                تثبيت الوكيل
              </div>
            </div>

            <div className="rounded-2xl border border-blue-500/20 bg-[#0a1b2e] p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500/15 text-blue-300">
                    <Monitor className="h-6 w-6" />
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] text-slate-300">برنامج الوكيل</div>
                    <div className="text-2xl font-bold text-white">Windows</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={goSetup}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-blue-600/25 hover:bg-blue-400"
                >
                  <Download className="h-4 w-4" />
                  تثبيت الآن
                </button>
              </div>

              <div className="rounded-xl border border-amber-400/30 bg-[#101f33] p-4 text-center">
                <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-xl border border-amber-300/25 bg-amber-500/10 text-amber-200">
                  <Monitor className="h-8 w-8" />
                </div>
                <div className="text-xl font-bold text-white">برنامج الوكيل</div>
                <div className="mt-2 text-sm leading-7 text-slate-300">
                  يُثبت على جهازك المحلي ليتولى المزامنة، التشغيل الآلي، وإدارة الملفات من الحاسوب.
                </div>
                <button
                  type="button"
                  onClick={goSetup}
                  className="mt-4 inline-flex items-center gap-2 rounded-lg bg-amber-400 px-5 py-2.5 text-sm font-bold text-slate-900 shadow-lg shadow-amber-500/20 hover:bg-amber-300"
                >
                  <ArrowLeft className="h-4 w-4" />
                  تثبيت الوكيل
                </button>
              </div>

              <div className="mt-4 rounded-xl border border-cyan-500/20 bg-[#0c1e31] p-3">
                <div className="mb-2 text-right text-[11px] font-semibold text-slate-200">عنوان الخادم</div>
                <div className="flex items-center gap-2 rounded-lg border border-slate-700 bg-[#091a2d] px-2 py-2">
                  <button
                    type="button"
                    onClick={copyUrl}
                    className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-700/80 text-slate-100 hover:bg-slate-600"
                    aria-label="Copy server URL"
                  >
                    {copied ? <Check className="h-4 w-4 text-emerald-300" /> : <Copy className="h-4 w-4" />}
                  </button>
                  <span className="flex-1 overflow-hidden text-ellipsis text-right text-sm text-slate-100">{serverUrl}</span>
                </div>
              </div>

              <div className="mt-4 space-y-2 text-sm text-slate-200">
                {[
                  "يُنشئ اتصالاً آمنًا مع المنصة",
                  "يتابع الملفات والمجلدات المسموح بها فقط",
                  "يعمل في الخلفية دون تدخل يدوي"
                ].map((item) => (
                  <div key={item} className="flex items-center gap-2 text-right text-slate-200/90">
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-cyan-500/15 text-[10px] text-cyan-300">
                      ✓
                    </span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
