import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  Bot, Send, X, Sparkles, AlertCircle, Loader2,
  ChevronDown, ChevronRight, Database, FileText,
  Mail, Calendar, Zap, Cpu, CheckCircle2, XCircle,
  Download, Minimize2, MessageSquare,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL;

// ── Types ──────────────────────────────────────────────────────────────────────
interface ReActStep {
  type: "thinking" | "tool_call" | "tool_result" | "final";
  tool?: string;
  tool_label?: string;
  input?: unknown;
  output?: unknown;
  success?: boolean;
  content?: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  steps?: ReActStep[];
  isStreaming?: boolean;
}

type ToolCfg = { icon: React.ElementType; color: string; bg: string; label: string };
const TOOL_CONFIG: Record<string, ToolCfg> = {
  database_query_tool:        { icon: Database,  color: "text-blue-400",    bg: "bg-blue-500/15 border-blue-500/25",       label: "البحث في البيانات" },
  document_drafting_tool:     { icon: FileText,  color: "text-violet-400",  bg: "bg-violet-500/15 border-violet-500/25",   label: "إنشاء وثيقة"       },
  messaging_dispatcher_tool:  { icon: Mail,      color: "text-emerald-400", bg: "bg-emerald-500/15 border-emerald-500/25", label: "إرسال رسالة"       },
  calendar_task_tool:         { icon: Calendar,  color: "text-amber-400",   bg: "bg-amber-500/15 border-amber-500/25",     label: "إدارة المواعيد"    },
  browser_automation_webhook: { icon: Zap,       color: "text-fuchsia-400", bg: "bg-fuchsia-500/15 border-fuchsia-500/25", label: "أتمتة خارجية"      },
};

// Role-specific quick suggestions
const ROLE_SUGGESTIONS: Record<string, string[]> = {
  admin: [
    "من هم أكثر 5 تلاميذ غياباً؟",
    "ما نسبة النجاح هذا العام؟",
    "أبرز التلاميذ الراسبين القريبين من النجاح",
    "أنشئ تقريراً إحصائياً شاملاً",
  ],
  teacher: [
    "اقترح ملاحظات تربوية للتلاميذ الضعاف",
    "أنشئ أفكاراً لفرض مراقبة في مادتي",
    "من أضعف التلاميذ في القسم؟",
  ],
  parent: [
    "كيف أداء ابني هذا الفصل؟",
    "ما مواد الضعف عند طفلي؟",
    "قدّم توصيات لتحسين نتائج طفلي",
  ],
  default: [
    "من هم أكثر التلاميذ غياباً؟",
    "ما نسبة النجاح هذا العام؟",
    "قدّم توصيات تربوية للمؤسسة",
  ],
};

// ── Tool step card (compact) ───────────────────────────────────────────────────
function ToolStepCard({ step }: { step: ReActStep }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = TOOL_CONFIG[step.tool ?? ""] ?? { icon: Cpu, color: "text-slate-400", bg: "bg-slate-500/15 border-slate-500/25", label: step.tool ?? "" };
  const Icon = cfg.icon;
  const label = step.tool_label ?? cfg.label;

  if (step.type === "tool_call") {
    return (
      <motion.div initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }}
        className={`rounded-lg border px-2.5 py-1.5 text-[11px] ${cfg.bg} cursor-pointer`}
        onClick={() => setExpanded(e => !e)}>
        <div className="flex items-center gap-1.5">
          <span className={`inline-flex w-4 h-4 rounded items-center justify-center shrink-0 ${cfg.color}`}>
            <Icon className="w-2.5 h-2.5" />
          </span>
          <span className={`font-semibold ${cfg.color} truncate flex-1`}>{label}</span>
          <Loader2 className="w-2.5 h-2.5 animate-spin text-muted-foreground shrink-0" />
          {expanded ? <ChevronDown className="w-2.5 h-2.5 text-muted-foreground shrink-0" />
                    : <ChevronRight className="w-2.5 h-2.5 text-muted-foreground shrink-0" />}
        </div>
      </motion.div>
    );
  }

  if (step.type === "tool_result") {
    const out = step.output as Record<string, unknown> | undefined;
    const downloadUrl = out?.download_url as string | undefined;
    const message     = out?.message as string | undefined;

    return (
      <motion.div initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }}
        className={`rounded-lg border px-2.5 py-1.5 text-[11px] ${cfg.bg} cursor-pointer`}
        onClick={() => !downloadUrl && setExpanded(e => !e)}>
        <div className="flex items-center gap-1.5">
          {step.success
            ? <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
            : <XCircle      className="w-3 h-3 text-red-400 shrink-0" />}
          <span className={`font-semibold truncate flex-1 ${step.success ? cfg.color : "text-red-400"}`}>{label}</span>
          {downloadUrl && (
            <a href={`${BASE}${downloadUrl.replace(/^\//, "")}`} target="_blank" rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-violet-500/25 text-violet-300 hover:bg-violet-500/40">
              <Download className="w-2.5 h-2.5" /><span>تحميل</span>
            </a>
          )}
          {!downloadUrl && (expanded
            ? <ChevronDown className="w-2.5 h-2.5 text-muted-foreground ms-auto shrink-0" />
            : <ChevronRight className="w-2.5 h-2.5 text-muted-foreground ms-auto shrink-0" />)}
        </div>
        {message && <p className="mt-1 text-[10px] text-muted-foreground line-clamp-2">{message}</p>}
        <AnimatePresence>
          {expanded && (
            <motion.pre initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
              className="mt-1.5 text-[9px] bg-black/20 rounded p-1.5 overflow-x-auto text-muted-foreground max-h-28">
              {JSON.stringify(step.output, null, 2)}
            </motion.pre>
          )}
        </AnimatePresence>
      </motion.div>
    );
  }

  return null;
}

// ── Message bubble ─────────────────────────────────────────────────────────────
function MessageBubble({ msg }: { msg: ChatMessage }) {
  const toolSteps = (msg.steps ?? []).filter(s => s.type === "tool_call" || s.type === "tool_result");

  if (msg.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-se-sm bg-gradient-to-br from-blue-500 to-indigo-600 text-white px-3.5 py-2 text-[13px] whitespace-pre-wrap leading-relaxed shadow-sm">
          {msg.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2 justify-start">
      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-fuchsia-500 to-indigo-600 flex items-center justify-center shrink-0 shadow-sm mt-0.5">
        {msg.isStreaming && !msg.content
          ? <Loader2 className="w-3 h-3 text-white animate-spin" />
          : <Bot className="w-3 h-3 text-white" />}
      </div>
      <div className="max-w-[84%] flex flex-col gap-1.5">
        {toolSteps.length > 0 && (
          <div className="space-y-1.5">
            {toolSteps.map((step, i) => <ToolStepCard key={i} step={step} />)}
          </div>
        )}
        {(msg.content || msg.isStreaming) && (
          <div className="rounded-2xl rounded-ss-sm bg-card border shadow-sm px-3.5 py-2.5 text-[13px] whitespace-pre-wrap leading-relaxed text-foreground">
            {msg.content || (
              <span className="flex items-center gap-1.5 text-muted-foreground text-xs">
                {toolSteps.length > 0
                  ? <><Loader2 className="w-3 h-3 animate-spin" /> جارٍ صياغة الرد...</>
                  : <>{[0, 1, 2].map(j => (
                      <motion.span key={j} className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50"
                        animate={{ opacity: [0.3, 1, 0.3] }}
                        transition={{ duration: 1.2, repeat: Infinity, delay: j * 0.2 }} />
                    ))}</>}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main floating widget ───────────────────────────────────────────────────────
interface AiChatWidgetProps {
  open: boolean;
  onClose: () => void;
  role?: string; // "admin" | "teacher" | "parent" | undefined
}

export default function AiChatWidget({ open, onClose, role }: AiChatWidgetProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const scrollRef   = useRef<HTMLDivElement>(null);
  const abortRef    = useRef<AbortController | null>(null);
  const inputRef    = useRef<HTMLTextAreaElement>(null);

  const suggestions = ROLE_SUGGESTIONS[role ?? "default"] ?? ROLE_SUGGESTIONS.default;

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  // Focus input when opened
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 150);
  }, [open]);

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 96) + "px";
  };

  const sendMessage = useCallback(async (text: string) => {
    const content = text.trim();
    if (!content || loading) return;
    setError(null);

    const userMsg: ChatMessage = { role: "user", content };
    const nextMessages = [...messages, userMsg];
    const assistantIdx = nextMessages.length;

    setMessages([...nextMessages, { role: "assistant", content: "", steps: [], isStreaming: true }]);
    setInput("");
    if (inputRef.current) { inputRef.current.style.height = "auto"; }
    setLoading(true);

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const patchAssistant = (fn: (m: ChatMessage) => ChatMessage) => {
      setMessages(prev => {
        const next = [...prev];
        if (next[assistantIdx]) next[assistantIdx] = fn(next[assistantIdx]);
        return next;
      });
    };

    try {
      const res = await fetch(`${BASE}api/assistant/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        signal: ctrl.signal,
        body: JSON.stringify({
          messages: nextMessages.slice(-12).map(m => ({ role: m.role, content: m.content })),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || `HTTP ${res.status}`);
      }

      const reader  = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const chunks = buf.split("\n\n");
        buf = chunks.pop() ?? "";

        for (const chunk of chunks) {
          let evtName = "", dataStr = "";
          for (const line of chunk.split("\n")) {
            if (line.startsWith("event: ")) evtName = line.slice(7).trim();
            if (line.startsWith("data: "))  dataStr = line.slice(6).trim();
          }
          if (!dataStr) continue;
          let data: unknown;
          try { data = JSON.parse(dataStr); } catch { continue; }

          if (evtName === "step") {
            const step = data as ReActStep;
            if (step.type === "final") {
              patchAssistant(m => ({ ...m, content: step.content ?? "", isStreaming: false }));
            } else {
              patchAssistant(m => ({ ...m, steps: [...(m.steps ?? []), step] }));
            }
          } else if (evtName === "error") {
            const errData = data as { message?: string };
            setError(errData.message ?? "حدث خطأ غير متوقع");
            patchAssistant(m => ({ ...m, isStreaming: false }));
          } else if (evtName === "done") {
            patchAssistant(m => ({ ...m, isStreaming: false }));
          }
        }
      }
      patchAssistant(m => ({ ...m, isStreaming: false }));
    } catch (err: any) {
      if (err.name === "AbortError") return;
      setError(err.message || "تعذّر الاتصال بالخادم");
      patchAssistant(m => ({ ...m, isStreaming: false }));
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }, [messages, loading]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const stopGeneration = () => {
    abortRef.current?.abort();
    setLoading(false);
    setMessages(prev => {
      const next = [...prev];
      const last = next.at(-1);
      if (last?.isStreaming) next[next.length - 1] = { ...last, isStreaming: false };
      return next;
    });
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop (mobile) */}
          <motion.div
            className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px] lg:hidden"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            className="fixed bottom-0 end-0 z-50 flex flex-col w-full sm:w-[400px] lg:w-[420px] sm:bottom-4 sm:end-4 sm:rounded-2xl overflow-hidden shadow-2xl border bg-background"
            style={{ height: "min(640px, calc(100dvh - 56px))" }}
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 340, damping: 30 }}
          >
            {/* Header */}
            <div className="flex items-center gap-2.5 px-4 py-3 border-b bg-gradient-to-r from-fuchsia-600/10 to-indigo-600/10 shrink-0">
              <div className="relative shrink-0">
                <span className="inline-flex w-8 h-8 rounded-xl bg-gradient-to-br from-fuchsia-500 to-indigo-600 items-center justify-center shadow-md shadow-fuchsia-500/25">
                  <Bot className="w-4 h-4 text-white" />
                </span>
                <span className="absolute -bottom-0.5 -end-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-background" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-foreground leading-tight">دليل — المساعد الذكي</p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {role === "parent" ? "مساعدك لمتابعة أداء طفلك"
                   : role === "teacher" ? "مساعد التدريس والملاحظات التربوية"
                   : "تحليل النتائج وإدارة المؤسسة"}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <motion.button whileTap={{ scale: 0.92 }} onClick={onClose}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors">
                  <X className="w-4 h-4" />
                </motion.button>
              </div>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center gap-4 text-center px-2">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-fuchsia-500/20 to-indigo-600/20 flex items-center justify-center">
                    <Sparkles className="w-7 h-7 text-fuchsia-400" />
                  </div>
                  <div>
                    <p className="font-bold text-foreground">أهلاً! أنا دليل</p>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      {role === "parent"
                        ? "اسألني عن أداء طفلك، درجاته، وحضوره"
                        : role === "teacher"
                        ? "ساعدني في الملاحظات التربوية وأفكار الفروض"
                        : "اسألني عن إحصاءات المؤسسة، النتائج، أو اطلب مني إنشاء وثيقة"}
                    </p>
                  </div>
                  <div className="w-full space-y-2">
                    {suggestions.map((s, i) => (
                      <motion.button
                        key={i}
                        initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.07 }}
                        onClick={() => sendMessage(s)}
                        className="w-full text-start text-[12px] px-3 py-2 rounded-xl border bg-muted/40 hover:bg-muted/70 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {s}
                      </motion.button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((msg, i) => <MessageBubble key={i} msg={msg} />)
              )}
            </div>

            {/* Error */}
            <AnimatePresence>
              {error && (
                <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="mx-4 mb-2 flex items-center gap-2 px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{error}</span>
                  <button onClick={() => setError(null)} className="ms-auto"><X className="w-3 h-3" /></button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Input */}
            <div className="px-3 pb-3 pt-2 border-t shrink-0 bg-background">
              <div className="flex items-end gap-2 bg-muted/40 rounded-2xl border px-3 py-2 focus-within:border-blue-500/40 transition-colors">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={handleInput}
                  onKeyDown={handleKeyDown}
                  placeholder="اكتب سؤالك…"
                  rows={1}
                  dir="auto"
                  disabled={loading}
                  className="flex-1 resize-none bg-transparent text-[13px] outline-none placeholder:text-muted-foreground/60 max-h-24 leading-relaxed disabled:opacity-60"
                />
                {loading ? (
                  <motion.button whileTap={{ scale: 0.92 }} onClick={stopGeneration}
                    className="shrink-0 w-7 h-7 rounded-lg bg-red-500/15 text-red-400 hover:bg-red-500/25 flex items-center justify-center transition-colors">
                    <X className="w-3.5 h-3.5" />
                  </motion.button>
                ) : (
                  <motion.button whileTap={{ scale: 0.92 }}
                    onClick={() => sendMessage(input)}
                    disabled={!input.trim()}
                    className="shrink-0 w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center shadow-sm shadow-blue-500/30 disabled:opacity-40 transition-opacity">
                    <Send className="w-3.5 h-3.5" />
                  </motion.button>
                )}
              </div>
              <p className="text-center text-[10px] text-muted-foreground/50 mt-1.5">Enter للإرسال · Shift+Enter لسطر جديد</p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ── Floating trigger button (for use anywhere outside the header) ──────────────
export function AiChatFab({ role }: { role?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <motion.button
        whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.94 }}
        onClick={() => setOpen(o => !o)}
        className="fixed bottom-6 end-6 z-40 w-13 h-13 rounded-2xl bg-gradient-to-br from-fuchsia-500 to-indigo-600 text-white shadow-lg shadow-fuchsia-500/30 flex items-center justify-center"
        style={{ width: 52, height: 52 }}
        aria-label="فتح المساعد الذكي"
      >
        <AnimatePresence mode="wait">
          {open
            ? <motion.div key="x" initial={{ scale: 0.5, rotate: -90 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0.5 }}>
                <X className="w-5 h-5" />
              </motion.div>
            : <motion.div key="b" initial={{ scale: 0.5, rotate: 90 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0.5 }}>
                <MessageSquare className="w-5 h-5" />
              </motion.div>}
        </AnimatePresence>
      </motion.button>
      <AiChatWidget open={open} onClose={() => setOpen(false)} role={role} />
    </>
  );
}
