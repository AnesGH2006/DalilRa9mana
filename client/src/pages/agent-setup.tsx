import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "@/contexts/language-provider";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Bot, Download, Key, Trash2, Copy, Check, Monitor, Wifi,
  FolderSync, Shield, RefreshCw, Plus, CheckCircle2, Circle,
  Terminal, ExternalLink, AlertTriangle,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL;

const pageVariants = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};

const cardVariants = {
  initial: { opacity: 0, y: 20, scale: 0.98 },
  animate: (i: number) => ({
    opacity: 1, y: 0, scale: 1,
    transition: { delay: i * 0.08, duration: 0.4 },
  }),
};

interface AgentToken {
  id: string;
  deviceName: string;
  createdAt: string;
  expiresAt: string;
  lastSeenAt?: string;
}

const STEPS = [
  {
    icon: Download,
    color: "bg-blue-500",
    titleAr: "حمّل وثبّت الوكيل",
    descAr: "قم بتنزيل مثبّت وكيل دليل الرقمنة لنظام Windows وشغّله على حاسوب الإدارة.",
  },
  {
    icon: Terminal,
    color: "bg-violet-500",
    titleAr: "اضبط عنوان الخادم",
    descAr: 'افتح الوكيل ← الإعدادات، وأدخل عنوان هذه المنصة (URL) ليتمكن الوكيل من الاتصال بها.',
  },
  {
    icon: Key,
    color: "bg-emerald-500",
    titleAr: "أنشئ رمز وكيل",
    descAr: "في القسم أدناه، أنشئ رمزاً خاصاً بالجهاز ثم انسخه.",
  },
  {
    icon: Wifi,
    color: "bg-amber-500",
    titleAr: "الصق الرمز في الوكيل",
    descAr: "في شاشة تسجيل الدخول بالوكيل، الصق الرمز وانقر «اتصال» — سيتصل الوكيل فوراً.",
  },
  {
    icon: FolderSync,
    color: "bg-cyan-500",
    titleAr: "حدّد المجلدات المسموح بها",
    descAr: "في تبويب «الصلاحيات» داخل الوكيل، أضف المجلدات التي يُسمح له بالوصول إليها.",
  },
];

const FEATURES = [
  { icon: FolderSync, color: "text-cyan-400",   label: "مزامنة ملفات Excel تلقائياً عند اكتشافها" },
  { icon: Shield,     color: "text-emerald-400", label: "وصول مقيّد بمجلدات محددة فقط" },
  { icon: Wifi,       color: "text-blue-400",    label: "اتصال دائم عبر WebSocket مع إعادة اتصال تلقائية" },
  { icon: Monitor,    color: "text-violet-400",  label: "يعمل في الخلفية من علبة النظام (System Tray)" },
  { icon: Shield,     color: "text-amber-400",   label: "الرمز مشفّر بـ Electron safeStorage" },
  { icon: RefreshCw,  color: "text-fuchsia-400", label: "تشغيل تلقائي عند بدء تشغيل Windows" },
];

function AgentDownloadBlock({ base }: { base: string }) {
  const { toast } = useToast();
  const [checking, setChecking] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);

  // Check installer availability once on mount
  useEffect(() => {
    fetch(`${base}api/agent/download`, { method: "HEAD", credentials: "include" })
      .then(r => setAvailable(r.ok))
      .catch(() => setAvailable(false));
  }, [base]);

  const handleDownload = async () => {
    setChecking(true);
    try {
      const res = await fetch(`${base}api/agent/download`, { credentials: "include" });
      if (res.ok) {
        // Trigger real file download
        const blob = await res.blob();
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement("a");
        a.href     = url;
        a.download = "DalilRa9manaAgent-Setup.exe";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      } else {
        const data = await res.json().catch(() => ({}));
        toast({
          title: "المثبّت غير متوفر",
          description: data?.message || "لم يتم بناء المثبّت بعد. يجب بناؤه من جهاز Windows.",
          variant: "destructive",
        });
      }
    } catch {
      toast({ title: "خطأ في الاتصال", description: "تعذّر الوصول إلى الخادم.", variant: "destructive" });
    } finally {
      setChecking(false);
    }
  };

  const isReady = available === true;

  return (
    <div className={`rounded-xl border p-5 text-center space-y-3 ${
      isReady
        ? "border-blue-500/30 bg-blue-500/5"
        : "border-amber-500/30 bg-amber-500/5"
    }`}>
      {isReady ? (
        <>
          <p className="text-sm font-bold">المثبّت جاهز للتنزيل</p>
          <p className="text-xs text-muted-foreground">
            ملف تثبيت Windows جاهز — لا يحتاج Node.js أو أي أدوات مطوّر.
          </p>
          <button
            onClick={handleDownload}
            disabled={checking}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-95 disabled:opacity-60 text-white text-sm font-semibold transition-all shadow-lg shadow-blue-600/30"
          >
            <Download className="w-4 h-4" />
            {checking ? "جارٍ التنزيل…" : "تنزيل الوكيل (Windows 64-bit)"}
          </button>
          <p className="text-[11px] text-muted-foreground">Electron · نظام 64-بت · حجم الملف ≈ 80 MB</p>
        </>
      ) : (
        <div className="space-y-4">
          {/* Icon + heading */}
          <div className="flex flex-col items-center gap-2 pt-1">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
              <Monitor className="w-6 h-6 text-amber-400" />
            </div>
            <p className="text-sm font-bold">برنامج الوكيل المكتبي</p>
            <p className="text-xs text-muted-foreground text-center leading-relaxed max-w-xs">
              يُتيح مزامنة ملفات Excel من حاسوب الإدارة تلقائياً دون رفع يدوي.
            </p>
          </div>

          {/* Coming soon pill */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/25 text-amber-400 text-xs font-semibold mx-auto">
            <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            قريباً — سيتوفر التنزيل المباشر
          </div>

          {/* What the user should do */}
          <div className="rounded-lg border border-slate-700/60 bg-slate-900/40 p-3 text-right space-y-2">
            <p className="text-xs font-semibold text-slate-300">في الوقت الحالي:</p>
            <ul className="text-xs text-muted-foreground space-y-1.5">
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-0.5 shrink-0">①</span>
                أنشئ رمز وكيل من القسم أدناه.
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-0.5 shrink-0">②</span>
                تواصل مع مشرف النظام للحصول على البرنامج وتثبيته.
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-0.5 shrink-0">③</span>
                أدخل الرمز وعنوان الخادم عند تشغيل البرنامج لأول مرة.
              </li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <Button size="sm" variant="ghost" onClick={copy} className="h-7 px-2 gap-1 text-xs shrink-0">
      {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
      {copied ? "تم" : "نسخ"}
    </Button>
  );
}

export default function AgentSetupPage() {
  const { toast } = useToast();
  const [tokens, setTokens] = useState<AgentToken[]>([]);
  const [deviceName, setDeviceName] = useState("");
  const [creating, setCreating] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [loadingTokens, setLoadingTokens] = useState(true);

  const serverUrl =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://dalilra9mana.onrender.com";

  const fetchTokens = useCallback(async () => {
    setLoadingTokens(true);
    try {
      const res = await fetch(`${BASE}api/agent/tokens`, { credentials: "include" });
      if (res.ok) setTokens(await res.json());
    } finally {
      setLoadingTokens(false);
    }
  }, []);

  useEffect(() => { fetchTokens(); }, [fetchTokens]);

  const createToken = async () => {
    const name = deviceName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const res = await fetch(`${BASE}api/agent/token`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceName: name }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setNewToken(data.token);
      setDeviceName("");
      fetchTokens();
      toast({ title: "تم إنشاء الرمز بنجاح", description: "انسخه الآن — لن يُعرض مرة أخرى." });
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const revokeToken = async (id: string) => {
    setRevoking(id);
    try {
      const res = await fetch(`${BASE}api/agent/tokens/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      setTokens(t => t.filter(x => x.id !== id));
      toast({ title: "تم إلغاء الرمز" });
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    } finally {
      setRevoking(null);
    }
  };

  const fmtDate = (iso: string) => {
    try { return new Date(iso).toLocaleDateString("ar-DZ"); }
    catch { return iso; }
  };

  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      className="min-h-screen bg-[#020d1d] text-slate-100"
      dir="rtl"
    >
      <div className="h-11 border-b border-slate-700/80 bg-[#111d2d] px-3">
        <div className="mx-auto flex h-full max-w-[1600px] items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-slate-300">
            <div className="flex items-center gap-1.5">
              <div className="h-3 w-3 rounded-sm bg-red-500/90" />
              <div className="h-3 w-3 rounded-sm bg-yellow-400/90" />
              <div className="h-3 w-3 rounded-sm bg-green-500/90" />
            </div>
            <div className="ml-2 flex items-center gap-2 text-xs">
              <span className="text-slate-300">Gmail</span>
              <span className="text-slate-500">YouTube</span>
              <span className="text-slate-500">Maps</span>
            </div>
          </div>

          <div className="flex flex-1 items-center justify-center px-4">
            <div className="flex w-full max-w-[760px] items-center gap-2 rounded-md border border-slate-700/70 bg-[#1b2d43] px-2 py-1.5 text-xs text-slate-300">
              <span className="text-sky-300">🔒</span>
              <span className="truncate">{serverUrl}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-slate-300">
            <div className="h-8 w-8 rounded-full bg-slate-700/80" />
            <div className="h-8 w-8 rounded-full bg-slate-700/80" />
            <div className="h-8 w-8 rounded-full bg-slate-700/80" />
          </div>
        </div>
      </div>

      <div className="relative min-h-[calc(100vh-44px)] bg-[#020d1d] px-4 pb-10 pt-6">
        <div className="absolute inset-0 opacity-25" style={{
          backgroundImage: "radial-gradient(circle at 1px 1px, rgba(96,165,250,0.12) 1px, transparent 0)",
          backgroundSize: "22px 22px",
        }} />

        <div className="relative mx-auto max-w-[1100px]">
          <div className="rounded-2xl border border-blue-500/20 bg-[#081b30]/95 p-5 shadow-[0_20px_60px_rgba(1,8,20,0.5)]">
            <div className="mb-4 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(serverUrl).catch(() => undefined)}
                className="inline-flex items-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-sm font-bold text-cyan-200 hover:bg-cyan-500/15"
              >
                <Copy className="h-4 w-4" />
                نسخ الرابط
              </button>

              <div className="flex items-center gap-3">
                <div className="text-xl font-bold text-white">Windows</div>
                <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-600 bg-slate-700/60 text-slate-200">
                  <Monitor className="h-6 w-6" />
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-700/70 bg-[#0b1f33] p-5 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-xl border border-amber-400/30 bg-amber-500/10 text-amber-300">
                <Monitor className="h-8 w-8" />
              </div>
              <h2 className="text-3xl font-bold text-white">برنامج الوكيل</h2>
              <p className="mx-auto mt-3 max-w-xl text-base leading-8 text-slate-300">
                يُثبت على جهازك المحلي ليتولى المزامنة، التشغيل الآلي، وإدارة الملفات من الحاسوب.
              </p>

              <div className="mt-5 flex justify-center">
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const res = await fetch(`${BASE}api/agent/download`, { method: "HEAD", credentials: "include" });
                      if (!res.ok) {
                        const data = await fetch(`${BASE}api/agent/download`, { credentials: "include" }).then(r => r.json().catch(() => ({}))).catch(() => ({}));
                        toast({
                          title: "المثبّت غير متوفر",
                          description: data?.message || "يجب بناء المثبّت أولاً على جهاز Windows ثم إعداده للتنزيل.",
                          variant: "destructive",
                        });
                        return;
                      }

                      const link = document.createElement("a");
                      link.href = `${BASE}api/agent/download?download=1`;
                      link.download = "DalilRa9manaAgent-Setup.exe";
                      link.rel = "noopener noreferrer";
                      document.body.appendChild(link);
                      link.click();
                      link.remove();
                    } catch {
                      toast({
                        title: "تعذّر بدء التنزيل",
                        description: "لم يتمكن التطبيق من الوصول إلى ملف المثبّت. حاول مرة أخرى لاحقاً.",
                        variant: "destructive",
                      });
                    }
                  }}
                  className="inline-flex items-center gap-2 rounded-xl bg-amber-400 px-5 py-3 text-base font-bold text-slate-900 shadow-lg shadow-amber-500/25 transition hover:bg-amber-300 active:scale-[0.99]"
                >
                  <Download className="h-5 w-5" />
                  تثبيت الوكيل
                </button>
              </div>
            </div>

            <div className="mt-5 rounded-xl border border-slate-700/70 bg-[#0d1d2d] p-4">
              <div className="mb-2 text-right text-sm font-bold text-slate-200">عنوان الخادم</div>
              <div className="flex items-center gap-2 rounded-lg border border-slate-700 bg-[#091a2d] px-2 py-2">
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(serverUrl).catch(() => undefined)}
                  className="flex h-9 w-9 items-center justify-center rounded-md bg-slate-700/80 text-slate-100 hover:bg-slate-600"
                  aria-label="Copy server URL"
                >
                  <Copy className="h-4 w-4" />
                </button>
                <span className="flex-1 overflow-hidden text-ellipsis text-right text-sm text-slate-100">{serverUrl}</span>
              </div>
            </div>

            <div className="mt-5 grid gap-2 text-right text-sm text-slate-200/90">
              {[
                "يُنشئ اتصالاً آمنًا مع المنصة",
                "يتابع الملفات والمجلدات المسموح بها فقط",
                "يعمل في الخلفية دون تدخل يدوي",
              ].map((item) => (
                <div key={item} className="flex items-center justify-end gap-2">
                  <span>{item}</span>
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-cyan-500/20 text-[10px] text-cyan-300">✓</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="absolute bottom-4 right-4 text-right text-[11px] leading-4 text-slate-400">
          <div className="text-slate-200">Activate Windows</div>
          <div>Go to Settings to activate Windows.</div>
        </div>
      </div>
    </motion.div>
  );
}
